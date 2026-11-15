import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { tempDir } from './test/board-fixtures.ts';
import type { TempDir } from './test/board-fixtures.ts';

type Fetch = (request: Request) => Response | Promise<Response>;

// The HTTP server is replaced at the network boundary: the app's fetch handler is captured, no port opens.
const served = vi.hoisted(() => ({ fetch: null as Fetch | null, closed: 0 }));
vi.mock('@hono/node-server', () => ({
  serve: (
    options: { fetch: Fetch; port: number },
    onListen?: (info: { port: number; address: string; family: string }) => void,
  ) => {
    served.fetch = options.fetch;
    onListen?.({ port: options.port, address: '127.0.0.1', family: 'IPv4' });
    return {
      close: (callback?: () => void) => {
        served.closed += 1;
        callback?.();
      },
    };
  },
}));

const START = new Date('2026-11-10T08:00:00.000Z');
const ENV_KEYS = ['DATA_DIR', 'SECRETS_DIR', 'WEB_DIST', 'LOG_LEVEL', 'WORKFLOW_CORE_URL'] as const;

let root: TempDir;
let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;
let exit: MockInstance<typeof process.exit>;
/** Exit codes the process really exited with: a real exit never returns, so later calls never happen. */
const exits: number[] = [];
let sigterm: (() => void) | null = null;
let added: { signal: 'SIGTERM' | 'SIGINT'; listener: (...args: unknown[]) => void }[] = [];

const healthz = async () => {
  if (!served.fetch) throw new Error('main.ts did not start the HTTP server');
  const response = await served.fetch(
    new Request('http://127.0.0.1:8446/healthz', { headers: { Host: '127.0.0.1:8446' } }),
  );
  return response.status;
};

beforeAll(async () => {
  root = tempDir('factory-live-main-');
  const dir = (name: string) => {
    const path = join(root.path, name);
    mkdirSync(path, { recursive: true });
    return path;
  };
  const secrets = dir('secrets');
  writeFileSync(join(secrets, 'workflow-core-secret'), 'secret-du-socle-de-test');

  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    DATA_DIR: dir('data'),
    SECRETS_DIR: secrets,
    WEB_DIST: dir('web-dist'),
    LOG_LEVEL: 'fatal',
    // Nothing answers there: the network is disabled below, the core stays unreachable.
    WORKFLOW_CORE_URL: 'http://127.0.0.1:9',
  });

  // No real network call: the core, GitHub, workflows and push all go through the global fetch.
  vi.stubGlobal('fetch', () => Promise.reject(new Error('network disabled in this test')));
  vi.useFakeTimers({ now: START });
  // The mocked exit returns, so main.ts's 5 s fallback timer still calls it once the process "ended".
  exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => {
    if (exits.length === 0) exits.push(Number(code ?? 0));
  }) as typeof process.exit);

  const before = {
    SIGTERM: process.listeners('SIGTERM'),
    SIGINT: process.listeners('SIGINT'),
  };
  await import('./main.ts');
  added = (['SIGTERM', 'SIGINT'] as const).flatMap((signal) =>
    process
      .listeners(signal)
      .filter((listener) => !before[signal].includes(listener))
      .map((listener) => ({ signal, listener: listener as (...args: unknown[]) => void })),
  );
  const term = added.find((entry) => entry.signal === 'SIGTERM');
  sigterm = term ? () => term.listener('SIGTERM') : null;
});

afterAll(() => {
  for (const { signal, listener } of added) process.removeListener(signal, listener);
  exit.mockRestore();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  root.remove();
});

describe('racine de composition (main.ts)', () => {
  it('main : /healthz passe à 503 après 60 s sans réponse du socle, sans arrêter l’app', async () => {
    expect(await healthz()).toBe(200);

    vi.advanceTimersByTime(59_000);
    expect(await healthz()).toBe(200);
    vi.advanceTimersByTime(2_000);
    expect(await healthz()).toBe(503);

    // A core that does not answer never stops factory-live: the last state stays (#62).
    vi.advanceTimersByTime(10 * 60_000);
    expect(exit).not.toHaveBeenCalled();
    expect(served.closed).toBe(0);
  });

  it('main : SIGTERM arrête une seule fois, un second ne relance pas le nettoyage', () => {
    expect(sigterm).not.toBeNull();
    sigterm?.();
    expect(served.closed).toBe(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    sigterm?.();
    vi.advanceTimersByTime(10_000);
    expect(served.closed).toBe(1);
    expect(exits).toEqual([0]);
  });
});
