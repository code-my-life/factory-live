import {
  StudioGesture,
  StudioItem,
  StudioWord,
  parseWorkflowSheet,
  type StudioItemDetail,
} from '@factory-live/contracts';
import { z } from 'zod';
import type { WorkflowView } from '../../application/ports.ts';

export type { WorkflowView };

/**
 * A workflow followed by its generic API, version 1 (#31, video-factory's ADR 0006): its sheet and its
 * items read on a schedule, the last state kept when it does not answer; an item's detail, its words
 * and its files read on demand; the owner's gesture relayed. factory-live never reads the workflow's
 * store or files: a workflow that changes its sheet or its storage needs no change here.
 */

type Fetch = typeof fetch;

export const API_VERSION = 1;
/** An id and a file name as the workflow writes them: nothing else reaches its API. */
export const ITEM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILE_NAME = /^[a-z]+$/;

const ApiItem = z.object({
  id: z.string(),
  card: z.string(),
  title: z.string(),
  station: z.string().nullable(),
  state: z.enum(['running', 'waiting', 'failed', 'done']),
  since: z.string().nullable(),
  waits: z.string().nullable(),
  failure: z.string().nullable(),
});
const ApiDetail = ApiItem.extend({
  script: z.string().nullable(),
  steps: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      seconds: z.number().nullable(),
      outputs: z.record(z.string(), z.string().nullable()),
    }),
  ),
  files: z.array(
    z.object({ kind: z.enum(['video', 'words']), name: z.string(), url: z.string() }).loose(),
  ),
});

export type GestureResult = { ok: true } | { ok: false; status: number; error: string };

export interface WorkflowApiOptions {
  name: string;
  /** Where this server reaches the workflow's API (`http://host.docker.internal:8448`). */
  url: string;
  fetchImpl?: Fetch;
  now?: () => number;
  timeoutMs?: number;
}

export class WorkflowApi {
  private readonly options: WorkflowApiOptions;
  private state: WorkflowView;
  /** The first read that saw an item without its own time at a station: `id:station`. */
  private readonly firstSeen = new Map<string, string>();

  constructor(options: WorkflowApiOptions) {
    this.options = options;
    this.state = {
      name: options.name,
      sheet: null,
      sheetError: null,
      items: [],
      readAt: null,
      unreachableSince: null,
      error: null,
    };
  }

  get name(): string {
    return this.options.name;
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    return fetchImpl(`${this.options.url}${path}`, {
      ...init,
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
    });
  }

  /**
   * A file: the deadline holds until its headers only, never while its body streams to the player,
   * which may take minutes for a whole master.
   */
  private async stream(path: string, headers: Record<string, string>): Promise<Response> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 5000);
    try {
      return await fetchImpl(`${this.options.url}${path}`, { headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * When an item got to its station: the workflow's own time, else the first read that saw it there.
   * It stays the same from one read to the next: an arrival is notified once.
   */
  private arrivedAt(item: z.infer<typeof ApiItem>, now: number): string {
    if (item.since) return item.since;
    const key = `${item.id}:${item.station ?? ''}`;
    const seen = this.firstSeen.get(key) ?? new Date(now).toISOString();
    this.firstSeen.set(key, seen);
    return seen;
  }

  private async json(path: string): Promise<Record<string, unknown>> {
    const response = await this.call(path, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`${path} : ${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    if (body.api !== API_VERSION) throw new Error(`${path} : API ${String(body.api)} inconnue`);
    return body;
  }

  view(): WorkflowView {
    return this.state;
  }

  /**
   * Reads the sheet and the items again. The sheet is read each time: a station added to it shows at
   * the next read, without redeploying anything. A workflow that does not answer keeps its last state.
   * Returns whether anything changed.
   */
  async refresh(): Promise<boolean> {
    const before = JSON.stringify([
      this.state.sheet,
      this.state.items,
      this.state.unreachableSince,
    ]);
    try {
      const [sheetBody, itemsBody] = await Promise.all([
        this.json('/api/workflow'),
        this.json('/api/items'),
      ]);
      const parsed = parseWorkflowSheet(sheetBody.sheet);
      const now = this.now();
      const items = z
        .array(ApiItem)
        .parse(itemsBody.items)
        .flatMap((item) => (item.station ? [toItem(item, this.arrivedAt(item, now))] : []));
      // An item that left its station forgets when it came: back there later, it arrives again.
      const here = new Set(items.map((item) => `${item.id}:${item.station}`));
      for (const key of this.firstSeen.keys()) if (!here.has(key)) this.firstSeen.delete(key);
      this.state = {
        ...this.state,
        sheet: parsed.ok ? parsed.sheet : this.state.sheet,
        sheetError: parsed.ok ? null : parsed.error,
        items,
        readAt: now,
        unreachableSince: null,
        error: null,
      };
    } catch (cause) {
      this.state = {
        ...this.state,
        unreachableSince: this.state.unreachableSince ?? this.now(),
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
    return (
      before !== JSON.stringify([this.state.sheet, this.state.items, this.state.unreachableSince])
    );
  }

  /** An item's detail, its files' addresses on this server, its links at the host the viewer came by. */
  async detail(id: string, viewer: string): Promise<StudioItemDetail | null> {
    if (!ITEM_ID.test(id)) return null;
    const response = await this.call(`/api/items/${id}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`détail de ${id} : ${response.status}`);
    const item = ApiDetail.parse(await response.json());
    if (!item.station) return null;
    const base = `/api/workflows/${this.name}`;
    const page = studioPage(this.options.url, viewer, id);
    return {
      ...toItem(item, this.arrivedAt(item, this.now())),
      script: item.script ?? '',
      steps: item.steps.map((step) => ({
        name: step.name,
        result: step.status,
        durationMs: Math.max(0, Math.round((step.seconds ?? 0) * 1000)),
        outputs: Object.entries(step.outputs).flatMap(([name, sha256]) =>
          sha256 ? [{ name, sha256 }] : [],
        ),
      })),
      files: item.files.map((file) => ({
        kind: file.kind,
        name: file.name,
        url:
          file.kind === 'words'
            ? `${base}/items/${id}/words`
            : `${base}/items/${id}/media/${file.name}`,
      })),
      links: { studio: page, ...(item.station === 'tournage' ? { takes: page } : {}) },
    };
  }

  async words(id: string): Promise<StudioWord[] | null> {
    if (!ITEM_ID.test(id)) return null;
    const response = await this.call(`/api/items/${id}/words`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { words?: unknown };
    return z.array(StudioWord).parse(body.words ?? []);
  }

  /** A file of an item, as the workflow serves it: the byte range asked for, passed through. */
  async media(id: string, name: string, range: string | undefined): Promise<Response | null> {
    if (!ITEM_ID.test(id) || !FILE_NAME.test(name)) return null;
    const response = await this.stream(`/v/${id}/media/${name}`, range ? { Range: range } : {});
    return response.status === 404 ? null : response;
  }

  /** The owner's gesture, checked here, then relayed: the workflow's own refusal comes back as is. */
  async gesture(id: string, input: unknown): Promise<GestureResult> {
    if (!ITEM_ID.test(id)) return { ok: false, status: 404, error: `élément inconnu ${id}` };
    const gesture = StudioGesture.safeParse(input);
    if (!gesture.success)
      return {
        ok: false,
        status: 400,
        error: gesture.error.issues[0]?.message ?? 'geste invalide',
      };
    const response = await this.call(`/api/items/${id}/gesture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gesture.data),
    });
    if (response.ok) return { ok: true };
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false,
      status: response.status,
      error: body.message ?? `refus ${response.status}`,
    };
  }
}

function toItem(item: z.infer<typeof ApiItem>, since: string): StudioItem {
  return StudioItem.parse({
    id: item.id,
    card: item.card,
    title: item.title,
    station: item.station,
    state: item.state,
    since,
    waits: item.waits,
    failure: item.failure,
  });
}

/** The item's page on the workflow, at the host the viewer came by and the workflow's own port. */
export function studioPage(api: string, viewer: string, id: string): string {
  const port = new URL(api).port;
  const origin = new URL(viewer);
  return `${origin.protocol}//${origin.hostname}${port ? `:${port}` : ''}/v/${id}`;
}
