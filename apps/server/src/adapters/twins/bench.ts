import { readFileSync, statSync } from 'node:fs';
import {
  AcceptanceTwins,
  type TwinGesture,
  type TwinSession,
  type TwinSide,
  type TwinsBenchState,
} from '@factory-live/contracts';
import { z } from 'zod';
import type { DeclaredPair } from '../../application/ports.ts';

/**
 * The factory's twin bench (hermes-software-factory#26), as factory-live sees it (#23, ADR 0013): the
 * pair's state written by the factory on the board, Neko's sessions joined for the PWA (Neko refuses
 * CORS, and the session's password stays here), and the mirror's API relayed. factory-live never
 * starts nor stops a twin.
 */

type Fetch = typeof fetch;

/** The state file: the pair as `AcceptanceTwins`, the twins' Neko addresses in it, and the mirror's port. */
const BenchFile = AcceptanceTwins.extend({ mirror: z.number().int().min(1).max(65_535) });
const MAX_FILE_BYTES = 64 * 1024;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
/** The name the bench knows the owner's viewers by, in Neko's list of members. */
const VIEWER = 'recette';

const MirrorState = z.object({
  mirror: z.boolean(),
  divergence: z.string().nullable().optional(),
  lag_ms: z.object({ median: z.number().nullable().optional() }).nullable().optional(),
});

/** A twin's Neko session: where this server reaches it, and the password of its viewers. */
interface Session {
  port: number;
  user: string;
  password: string;
}

export interface TwinPair {
  twins: AcceptanceTwins;
  mirror: number;
  /**
   * How to open each twin's session: with its password read in the bench's file, or, on workflow-core's
   * side (#60), through the mirror (`POST /viewer/<twin>`), the password never leaving the bench.
   */
  sessions: Record<TwinSide, Session | 'mirror' | undefined>;
}

export type { DeclaredPair };

const ViewerSession = z.object({
  port: z.number().int().min(1).max(65_535),
  token: z.string().min(1),
});

function sessionOf(stream: string | null): Session | undefined {
  if (!stream) return undefined;
  try {
    const url = new URL(stream);
    const port = Number(url.port);
    const password = url.searchParams.get('pwd');
    return port > 0 && password
      ? { port, user: url.searchParams.get('usr') ?? VIEWER, password }
      : undefined;
  } catch {
    return undefined;
  }
}

export interface TwinBenchOptions {
  /** The state file of a PR's pair (`HermesPaths.twins`), on Hermes' side. */
  file?: (repo: string, pr: number) => string | null;
  /** The pair as workflow-core last published it, on the core's side (#60): no file is read. */
  declared?: (repo: string, pr: number) => DeclaredPair | null;
  /** Where the bench's ports answer this server: this PC, or `host.docker.internal`. */
  host: string;
  fetchImpl?: Fetch;
  timeoutMs?: number;
}

export class TwinBench {
  private readonly options: TwinBenchOptions;

  constructor(options: TwinBenchOptions) {
    this.options = options;
  }

  private get fetch(): Fetch {
    return this.options.fetchImpl ?? fetch;
  }

  /** The pair of a PR, as the factory last wrote it; `null` without a pair or with an unreadable file. */
  pair(repo: string, pr: number): TwinPair | null {
    if (this.options.declared) {
      const declared = this.options.declared(repo, pr);
      if (!declared) return null;
      const ready = declared.twins.state === 'ready' ? 'mirror' : undefined;
      return { ...declared, sessions: { base: ready, head: ready } };
    }
    const path = this.options.file?.(repo, pr) ?? null;
    if (!path) return null;
    try {
      if (statSync(path).size > MAX_FILE_BYTES) return null;
      const read = BenchFile.safeParse(JSON.parse(readFileSync(path, 'utf8')));
      if (!read.success) return null;
      const { mirror, ...twins } = read.data;
      const surface = twins.surfaces.find((each) => each.id === 'app') ?? twins.surfaces[0];
      return {
        twins,
        mirror,
        sessions: { base: sessionOf(surface!.base.stream), head: sessionOf(surface!.head.stream) },
      };
    } catch {
      return null;
    }
  }

  /**
   * The pair for the recette: each stream is this server's address of its session, so that no
   * password reaches the PWA.
   */
  view(repo: string, pr: number): AcceptanceTwins | null {
    const pair = this.pair(repo, pr);
    if (!pair) return null;
    // The sessions are those of one surface (the app): no other surface may show or drive them.
    const served = (pair.twins.surfaces.find((each) => each.id === 'app') ??
      pair.twins.surfaces[0])!.id;
    // A session exists only for a twin whose stream the bench announced (a password, or the mirror).
    const stream = (id: string, side: TwinSide) =>
      id === served && pair.sessions[side] ? `/api/twins/${repo}/${pr}/session/${side}` : null;
    return {
      ...pair.twins,
      surfaces: pair.twins.surfaces.map((surface) => ({
        ...surface,
        base: {
          ...surface.base,
          stream: stream(surface.id, 'base'),
          poster: null,
        },
        head: {
          ...surface.head,
          stream: stream(surface.id, 'head'),
          poster: null,
        },
      })),
    };
  }

  private async call(port: number, path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetch(`http://${this.options.host}:${port}${path}`, {
      ...init,
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
    });
  }

  private async token(session: Session): Promise<string> {
    const response = await this.call(session.port, '/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: VIEWER, password: session.password }),
    });
    if (!response.ok) throw new Error(`Neko a refusé la session (${response.status})`);
    const { token } = z.object({ token: z.string().min(1) }).parse(await response.json());
    return token;
  }

  /**
   * A viewer's session of one twin, for the PWA at `viewer` (the origin it came by): the twin's
   * WebSocket at the same host, and on this PC, the address its ICE candidates must name.
   */
  async session(
    repo: string,
    pr: number,
    side: TwinSide,
    viewer: string,
  ): Promise<TwinSession | null> {
    const pair = this.pair(repo, pr);
    const session = pair?.sessions[side];
    if (!pair || !session) return null;
    const origin = new URL(viewer);
    const scheme = origin.protocol === 'https:' ? 'wss' : 'ws';
    const opened = session === 'mirror' ? await this.viewer(pair.mirror, side) : null;
    return {
      ws: `${scheme}://${origin.hostname}:${opened?.port ?? (session as Session).port}/api/ws`,
      token: opened?.token ?? (await this.token(session as Session)),
      candidateHost: LOOPBACK.has(origin.hostname) ? '127.0.0.1' : null,
    };
  }

  /** A viewer's session opened by the mirror (hermes-software-factory#116): its port and its token. */
  private async viewer(mirror: number, side: TwinSide): Promise<z.infer<typeof ViewerSession>> {
    const response = await this.call(mirror, `/viewer/${side}`, { method: 'POST' });
    if (!response.ok) throw new Error(`le miroir n'a pas ouvert la session (${response.status})`);
    return ViewerSession.parse(await response.json());
  }

  /** The last image of a twin's screen, JPEG: Neko serves it to an admin only, so the mirror asks it. */
  async shot(repo: string, pr: number, side: TwinSide): Promise<Uint8Array | null> {
    const pair = this.pair(repo, pr);
    if (!pair?.sessions[side]) return null;
    const response = await this.call(pair.mirror, `/shot/${side}`);
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  }

  /** The mirror, live. */
  async state(repo: string, pr: number): Promise<TwinsBenchState | null> {
    const pair = this.pair(repo, pr);
    if (!pair) return null;
    const response = await this.call(pair.mirror, '/state');
    if (!response.ok) throw new Error(`le miroir a répondu ${response.status}`);
    const state = MirrorState.parse(await response.json());
    return {
      mirror: state.mirror,
      divergence: state.divergence ?? null,
      lagMs: state.lag_ms?.median ?? null,
    };
  }

  private async post(repo: string, pr: number, path: string, body: unknown): Promise<boolean> {
    const pair = this.pair(repo, pr);
    if (!pair) return false;
    const response = await this.call(pair.mirror, path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`le miroir a répondu ${response.status}`);
    return true;
  }

  /** A gesture of the owner, to the mirror: it plays it on its twin, and on the other while it is on. */
  gesture(repo: string, pr: number, gesture: TwinGesture): Promise<boolean> {
    return this.post(repo, pr, '/gesture', {
      twin: gesture.side,
      event: gesture.event,
      payload: gesture.payload,
    });
  }

  /** The mirror on, or off (« Piloter séparément »). */
  mirror(repo: string, pr: number, on: boolean): Promise<boolean> {
    return this.post(repo, pr, '/mirror', { on });
  }

  /** Both twins back to the app's home, the mirror on again (« Resynchroniser »). */
  resync(repo: string, pr: number): Promise<boolean> {
    return this.post(repo, pr, '/resync', {});
  }
}
