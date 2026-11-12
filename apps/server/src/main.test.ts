import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { insertTask, kanbanDb, tempDir } from './test/hermes-fixtures.ts';
import type { TempDir } from './test/hermes-fixtures.ts';

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
const ENV_KEYS = [
  'HERMES_HOME',
  'HERMES_BOARD',
  'DATA_DIR',
  'SECRETS_DIR',
  'FACTORY_REPO',
  'CLAUDE_PROJECTS',
  'OPENCODE_DB',
  'WEB_DIST',
  'LOG_LEVEL',
  'LIVE_SOURCE',
] as const;

let root: TempDir;
let kanbanPath: string;
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
  const hermesHome = dir('hermes');
  const boardDir = join(hermesHome, 'kanban', 'boards', 'factory');
  mkdirSync(boardDir, { recursive: true });
  kanbanPath = join(boardDir, 'kanban.db');
  const db = kanbanDb(kanbanPath);
  insertTask(db, { id: 't_main', title: 'Carte lue au démarrage', status: 'todo' });
  db.close();

  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    HERMES_HOME: hermesHome,
    HERMES_BOARD: 'factory',
    DATA_DIR: dir('data'),
    SECRETS_DIR: dir('secrets'),
    FACTORY_REPO: dir('factory-repo'),
    CLAUDE_PROJECTS: dir('claude-projects'),
    OPENCODE_DB: join(root.path, 'opencode.db'),
    WEB_DIST: dir('web-dist'),
    // These tests follow the kanban read on Hermes' side: since #68, the default is workflow-core.
    LIVE_SOURCE: 'hermes',
    LOG_LEVEL: 'fatal',
  });

  // No real network call: GitHub, workflows and push all go through the global fetch.
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
  it("main : /healthz passe à 503 après 60 s de kanban illisible, puis l'app s'arrête avec le code 1 après 3 min", async () => {
    expect(await healthz()).toBe(200);

    // The kanban file is overwritten in place (same inode, so the open handle sees it) and its WAL removed.
    writeFileSync(kanbanPath, 'not a database');
    rmSync(`${kanbanPath}-wal`, { force: true });
    rmSync(`${kanbanPath}-shm`, { force: true });
    vi.advanceTimersByTime(300);

    vi.advanceTimersByTime(59_000 - 300);
    expect(await healthz()).toBe(200);
    vi.advanceTimersByTime(2_000);
    expect(await healthz()).toBe(503);

    vi.advanceTimersByTime(178_000 - 61_000);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3_000);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(served.closed).toBe(1);

    vi.advanceTimersByTime(10_000);
    expect(exits).toEqual([1]);
    expect(served.closed).toBe(1);
  });

  it("main : SIGTERM après l'arrêt demandé ne relance pas le nettoyage", () => {
    expect(sigterm).not.toBeNull();
    exit.mockClear();
    sigterm?.();
    expect(served.closed).toBe(1);
    expect(exit).not.toHaveBeenCalled();
    expect(exits).toEqual([1]);
  });
});
