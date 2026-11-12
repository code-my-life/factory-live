import { readFileSync } from 'node:fs';
import type * as NodeFs from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type * as NodeSqlite from 'node:sqlite';
import { msg } from '@factory-live/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublishedSheet } from '../../application/ports.ts';
import { HistoryStore } from '../store/history.ts';
import { KanbanReader } from '../hermes/kanban.ts';
import { fakeCore } from '../../test/fake-core.ts';
import type { FakeCore } from '../../test/fake-core.ts';
import {
  CORE_ITEMS,
  NOW,
  SECRET,
  SHEET,
  card,
  coreSide,
  coreState,
  line,
  newHub,
  until,
  writeHermesBoard,
} from '../../test/core-scenario.ts';
import type { Side } from '../../test/core-scenario.ts';
import { tempDir } from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';

// What the server opens, recorded at the boundary (#57, C7): every path given to node:fs and node:sqlite.
const opened = vi.hoisted(() => [] as string[]);
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof NodeFs>();
  const record =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      if (typeof args[0] === 'string' || args[0] instanceof URL) opened.push(String(args[0]));
      return fn(...args);
    };
  const wrapped = {
    ...real,
    readFileSync: record(real.readFileSync),
    statSync: record(real.statSync),
    lstatSync: record(real.lstatSync),
    existsSync: record(real.existsSync),
    readdirSync: record(real.readdirSync),
    openSync: record(real.openSync),
    realpathSync: record(real.realpathSync),
    createReadStream: record(real.createReadStream),
  };
  return { ...wrapped, default: wrapped };
});
vi.mock('node:sqlite', async (importOriginal) => {
  const real = await importOriginal<typeof NodeSqlite>();
  class RecordedDatabase extends real.DatabaseSync {
    constructor(...args: ConstructorParameters<typeof real.DatabaseSync>) {
      opened.push(String(args[0]));
      super(...args);
    }
  }
  return { ...real, DatabaseSync: RecordedDatabase };
});

let dir: TempDir;
let core: FakeCore | null = null;
let side: Side | null = null;

afterEach(async () => {
  await side?.reader.stop();
  await core?.close();
  side = null;
  core = null;
  dir?.remove();
});

describe('lecture de la ligne du code par le socle (workflow-core, #57)', () => {
  it("côté socle, l'instantané de la ligne du code est celui de la lecture d'Hermès", async () => {
    dir = tempDir();
    const path = join(dir.path, 'kanban.db');
    writeHermesBoard(path);
    const hermes = newHub(dir, 'hermes-data');
    const kanban = new KanbanReader(path);
    hermes.applyKanban(kanban.read(), NOW);
    kanban.close();

    core = await fakeCore(SECRET, coreState());
    side = coreSide(dir, core);
    side.reader.start();
    await until(() => side!.boards.length > 0);

    const fromHermes = line(hermes.snapshot());
    expect(fromHermes.issues.length).toBeGreaterThan(0);
    expect(fromHermes.interventions.length).toBeGreaterThan(0);
    // Since workflow-core#37 (its C2, decided by the owner), a `needs_input` of the core also offers the
    // command that shows the card, after Débloquer: the one difference with Hermes' side, written here.
    const showCard = {
      kind: 'copy' as const,
      label: msg('intervention.action.showCard'),
      command: 'hermes kanban --board factory show t_1a9f0049',
    };
    const expected = {
      ...fromHermes,
      interventions: fromHermes.interventions.map((item) =>
        item.kind === 'needs_input'
          ? { ...item, actions: [item.actions[0]!, showCard, ...item.actions.slice(1)] }
          : item,
      ),
    };
    await until(() => side!.hub.snapshot().interventions.length > 0);
    expect(line(side.hub.snapshot())).toEqual(expected);
    expect(side.sheet()).toEqual({ source: 'published', sheet: SHEET });
    expect(core.requests.every((request) => request.auth === `Bearer ${SECRET}`)).toBe(true);
  });

  it('un changement de carte du socle atteint le flux en moins d’une seconde', async () => {
    dir = tempDir();
    core = await fakeCore(SECRET, coreState());
    side = coreSide(dir, core);
    const received: number[] = [];
    side.hub.subscribe(() => received.push(performance.now()));
    // The hub sends what changed every 250 ms in main.ts.
    const flush = setInterval(() => side?.hub.flush(), 250);
    try {
      side.reader.start();
      await until(() => side!.boards.length > 0 && core!.openStreams() === 1);
      side.hub.flush();
      received.length = 0;

      // A kind of event the copy of the schema does not know yet is skipped.
      core.send({
        cursor: '1762900000:6',
        workflow: null,
        item: null,
        kind: 'future',
        at: '2026-11-12T10:00:00.500Z',
        state: [{ id: 'gateway', status: 'ok' }],
      });
      const state = { ...structuredClone(CORE_ITEMS[1]!), status: 'review', block_kind: null };
      const sent = performance.now();
      core.send({
        cursor: '1762900000:7',
        workflow: 'factory',
        item: 't_1a9f0049',
        kind: 'changed',
        at: '2026-11-12T10:00:01.000Z',
        state,
      });
      await until(() => received.length > 0, 2_000);

      expect(received[0]! - sent).toBeLessThan(1_000);
      expect(side.failures).toEqual([]);
      expect(side.hub.boardData.tasks.find((task) => task.id === 't_1a9f0049')?.status).toBe(
        'review',
      );
    } finally {
      clearInterval(flush);
    }
  });

  it('un reset fait relire l’état complet', async () => {
    dir = tempDir();
    core = await fakeCore(SECRET, coreState());
    side = coreSide(dir, core);
    side.reader.start();
    await until(() => side!.boards.length > 0 && core!.openStreams() === 1);
    const readsBefore = core.requests.filter((request) => request.path === '/api/workflows').length;

    // The core rebuilt its journal: a card has gone, a new epoch begins.
    core.state.items['factory'] = structuredClone(CORE_ITEMS).filter(
      (item) => item['id'] !== 't_c0de0050',
    );
    core.state.cursor = '1762999999:1';
    core.send({
      cursor: '1762999999:1',
      workflow: null,
      item: null,
      kind: 'reset',
      at: '2026-11-12T10:05:00.000Z',
      state: null,
    });
    await until(() => !side!.hub.boardData.tasks.some((task) => task.id === 't_c0de0050'), 2_000);

    const reads = core.requests.filter((request) => request.path === '/api/workflows');
    expect(reads.length).toBe(readsBefore + 1);
    expect(core.requests.some((request) => request.path === '/api/workflows/factory/items')).toBe(
      true,
    );
    const snapshot = side.hub.snapshot();
    expect(JSON.stringify(snapshot.issues)).not.toContain('t_c0de0050');
    expect(side.hub.boardData.tasks.map((task) => task.id).sort()).toEqual([
      't_1a9f0049',
      't_b1ef0049',
    ]);
  });

  it('le flux coupé reprend depuis le dernier curseur', async () => {
    dir = tempDir();
    core = await fakeCore(SECRET, coreState());
    side = coreSide(dir, core);
    side.reader.start();
    await until(() => side!.boards.length > 0 && core!.openStreams() === 1);
    // The first stream opens at the cursor of the full read.
    expect(core.requests.find((request) => request.path === '/api/events')?.lastEventId).toBe(
      '1762900000:5',
    );

    core.send({
      cursor: '1762900000:7',
      workflow: 'factory',
      item: 't_b1ef0049',
      kind: 'changed',
      at: '2026-11-12T10:00:02.000Z',
      state: structuredClone(CORE_ITEMS[0]),
    });
    await until(() => side!.boards.length > 1);
    const readsBefore = core.requests.filter((request) => request.path === '/api/workflows').length;
    core.cut();
    await until(
      () => core!.requests.filter((request) => request.path === '/api/events').length > 1,
    );

    const streams = core.requests.filter((request) => request.path === '/api/events');
    expect(streams.at(-1)?.lastEventId).toBe('1762900000:7');
    // A resumed stream does not read the full state again: nothing was missed.
    expect(core.requests.filter((request) => request.path === '/api/workflows').length).toBe(
      readsBefore,
    );
  });

  it('socle arrêté, la dernière fiche et les derniers éléments restent', async () => {
    dir = tempDir();
    core = await fakeCore(SECRET, coreState());
    side = coreSide(dir, core);
    side.reader.start();
    await until(() => side!.boards.length > 0 && core!.openStreams() === 1);
    const before = line(side.hub.snapshot());

    await core.close();
    core = null;
    await until(() => side!.failures.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(side.sheet()).toEqual({ source: 'published', sheet: SHEET });
    const after = line(side.hub.snapshot());
    expect(after.issues.length).toBeGreaterThan(0);
    // The only change is the intervention that says the core is down (#62).
    expect(after.interventions.filter((item) => item.kind === 'service_down')).toHaveLength(1);
    expect({
      ...after,
      interventions: after.interventions.filter((item) => item.kind !== 'service_down'),
    }).toEqual(before);
    expect(side.hub.boardData.tasks).toHaveLength(3);
  });

  it('la fiche du socle est vérifiée par le schéma tiré de son JSON Schema, sans sheetError', async () => {
    dir = tempDir();
    const state = coreState();
    // A sheet whose form is right but which breaks a cross rule of factory-live's own judge (two stations
    // on one cell): the core judged it, factory-live does not judge it again.
    const twoOnOneCell = structuredClone(SHEET);
    twoOnOneCell.stations[1] = { ...twoOnOneCell.stations[1]!, col: 0 };
    state.sheets['factory'] = twoOnOneCell;
    core = await fakeCore(SECRET, state);
    side = coreSide(dir, core);
    side.reader.start();
    await until(() => side!.sheet() !== null && core!.openStreams() === 1);
    expect(side.sheet()).toEqual({ source: 'published', sheet: twoOnOneCell });

    // A sheet of a wrong form is refused by the schema; the last good sheet stays.
    core.state.sheets['factory'] = { item: { type: 'issue', label: 'Issue' }, stations: 'none' };
    core.send({
      cursor: '1762999999:1',
      workflow: null,
      item: null,
      kind: 'reset',
      at: '2026-11-12T10:05:00.000Z',
      state: null,
    });
    await until(
      () =>
        core!.requests.filter((request) => request.path === '/api/workflows/factory/sheet').length >
        1,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(side.sheet()).toEqual({ source: 'published', sheet: twoOnOneCell });
    expect(side.boards.length).toBeGreaterThan(1);

    // The adapter never calls factory-live's judge, nor reads an embedded sheet.
    for (const file of ['reader.ts', 'client.ts', 'cards.ts']) {
      const code = readFileSync(join(import.meta.dirname, file), 'utf8');
      expect(code, file).not.toMatch(/sheetError\(|parseWorkflowSheet|code-line\.json|codeSheet/);
    }
  });

  it('côté socle, ni Hermès ni le dépôt de la factory ne sont lus, et le miroir n’est pas écrit', async () => {
    dir = tempDir();
    core = await fakeCore(SECRET, coreState());
    const app = await startMain(dir, core);
    try {
      await until(() =>
        core!.requests.some((request) => request.path === '/api/workflows/factory/items'),
      );
      await until(() => core!.openStreams() === 1);
      const workflows = (await (await app.get('/api/workflows')).json()) as {
        code: PublishedSheet | null;
      };
      expect(workflows.code).toEqual({ source: 'published', sheet: SHEET });
    } finally {
      await app.stop();
    }

    const hermes = join(dir.path, 'hermes');
    const factory = join(dir.path, 'factory-repo');
    expect(opened.filter((path) => path.startsWith(hermes) || path.startsWith(factory))).toEqual(
      [],
    );
    // The record is not empty for lack of watching: it saw factory-live's own base opened.
    expect(opened.some((path) => path.startsWith(join(dir.path, 'data')))).toBe(true);
    const data = new DatabaseSync(join(dir.path, 'data', 'factory-live.db'), { readOnly: true });
    for (const table of ['tasks', 'runs', 'events', 'comments', 'links']) {
      const row = data.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number };
      expect(row.n, table).toBe(0);
    }
    data.close();
  });

  it('côté socle, le hub ne reprend pas les cartes du miroir d’Hermès', () => {
    dir = tempDir();
    // A mirror written by an earlier run on Hermes' side.
    const store = new HistoryStore(join(dir.path, 'core-data'));
    const path = join(dir.path, 'kanban.db');
    writeHermesBoard(path);
    const kanban = new KanbanReader(path);
    store.mirror(kanban.read());
    kanban.close();
    store.close();

    expect(newHub(dir, 'core-data').boardData.tasks).toHaveLength(3);
    // On the core's side, nothing is shown before the core answers, even with the core down.
    expect(newHub(dir, 'core-data', 'workflow-core').boardData.tasks).toEqual([]);
  });

  it('un workflow de la ligne du code retiré du socle vide le tableau', async () => {
    dir = tempDir();
    core = await fakeCore(SECRET, coreState());
    side = coreSide(dir, core);
    side.reader.start();
    await until(() => side!.hub.boardData.tasks.length === 3 && core!.openStreams() === 1);

    core.state.workflows = core.state.workflows.filter((workflow) => workflow.key !== 'factory');
    core.send({
      cursor: '1762999999:1',
      workflow: null,
      item: null,
      kind: 'reset',
      at: '2026-11-12T10:05:00.000Z',
      state: null,
    });
    await until(() => side!.hub.boardData.tasks.length === 0, 2_000);
    expect(side.hub.snapshot().issues).toEqual([]);
  });

  it('un flux fermé normalement attend avant de se rouvrir', async () => {
    dir = tempDir();
    core = await fakeCore(SECRET, coreState());
    // A core (or a proxy) that ends every stream at once.
    core.backlog = () => {
      setTimeout(() => core?.finish(), 0);
      return [];
    };
    side = coreSide(dir, core);
    side.reader.start();
    const streams = () => core!.requests.filter((request) => request.path === '/api/events').length;
    // The window starts at the first opening of the stream, after the full read.
    await until(() => streams() > 0);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // retryMs is 50 ms in these tests: about ten reopenings in 500 ms, not hundreds.
    const opened = streams();
    expect(opened).toBeGreaterThan(1);
    expect(opened).toBeLessThanOrEqual(12);
  });

  it('l’état de la machine du socle et ses événements machine arrivent au hub', async () => {
    dir = tempDir();
    const gateway = {
      id: 'gateway',
      label: 'Gateway',
      group: 'hermes',
      status: 'down',
      detail: 'Dernier battement il y a 240 s',
      metrics: { pid: '4242' },
      checked_at: '2026-11-12T09:59:55Z',
    };
    core = await fakeCore(SECRET, {
      ...coreState(),
      machine: {
        runtime_version: '0.22.2',
        contract: { ok: true, checked_at: '2026-11-12T09:59:00Z', problems: [] },
        mode: 'normal',
        boards: { factory: { last_read_at: '2026-11-12T09:59:50Z' } },
        checks: [gateway],
      },
    });
    side = coreSide(dir, core);
    side.reader.start();
    const tile = (id: string) => side!.hub.snapshot().health.find((item) => item.id === id);
    await until(() => tile('gateway')?.status === 'down' && core!.openStreams() === 1);
    expect(tile('core')?.status).toBe('ok');

    core.send({
      cursor: '1762900000:9',
      workflow: null,
      item: null,
      kind: 'machine',
      at: '2026-11-12T10:00:05Z',
      state: [{ ...gateway, status: 'ok', detail: 'Battement il y a 4 s' }],
    });
    await until(() => tile('gateway')?.status === 'ok', 2_000);
    expect(tile('gateway')?.detail).toBe('Battement il y a 4 s');
    expect(side.failures).toEqual([]);
  });

  it('une lecture de la machine plus ancienne qu’un événement machine ne le défait pas', async () => {
    dir = tempDir();
    const gateway = {
      id: 'gateway',
      label: 'Gateway',
      group: 'hermes',
      status: 'down',
      detail: 'Dernier battement il y a 240 s',
      metrics: {},
      checked_at: '2026-11-12T09:59:55Z',
    };
    core = await fakeCore(SECRET, {
      ...coreState(),
      machine: {
        runtime_version: '0.22.2',
        contract: { ok: true, checked_at: '2026-11-12T09:59:00Z', problems: [] },
        mode: 'normal',
        boards: { factory: { last_read_at: '2026-11-12T09:59:50Z' } },
        checks: [gateway],
      },
    });
    side = coreSide(dir, core);
    side.reader.start();
    const tile = (id: string) => side!.hub.snapshot().health.find((item) => item.id === id);
    await until(() => tile('gateway')?.status === 'down' && core!.openStreams() === 1);

    // The event (cursor 9) is newer than what the core answers to /api/machine (its cursor, 5).
    core.send({
      cursor: '1762900000:9',
      workflow: null,
      item: null,
      kind: 'machine',
      at: '2026-11-12T10:00:05Z',
      state: [{ ...gateway, status: 'ok', detail: 'Battement il y a 4 s' }],
    });
    await until(() => tile('gateway')?.status === 'ok', 2_000);
    await side.reader.refreshMachine();
    expect(tile('gateway')?.status).toBe('ok');

    // A read newer than the last event wins.
    core.state.cursor = '1762900000:12';
    await side.reader.refreshMachine();
    expect(tile('gateway')?.status).toBe('down');
  });

  it('un workflow générique du socle est listé avec sa fiche', async () => {
    dir = tempDir();
    const state = coreState();
    state.workflows.push({ key: 'essai', board: 'essai', sheet_valid: true });
    state.sheets['essai'] = structuredClone(SHEET);
    state.items['essai'] = [card({ id: 't_e0001', title: 'Essai', status: 'todo', created_at: 1 })];
    core = await fakeCore(SECRET, state);
    side = coreSide(dir, core);
    side.reader.start();
    await until(() => side!.generic().length > 0 || side!.failures.length > 0);
    expect(side.failures).toEqual([]);

    expect(side.generic()).toEqual([
      expect.objectContaining({ name: 'essai', sheet: SHEET, sheetError: null, error: null }),
    ]);
    // The studio keeps its own adapter: the core's studio is not read here.
    expect(core.requests.some((request) => request.path.startsWith('/api/workflows/studio'))).toBe(
      false,
    );
    expect(core.requests.some((request) => request.path === '/api/workflows/essai/items')).toBe(
      true,
    );
  });
});

// --- main.ts on the core's side, for C7 --------------------------------------------------------------

type Fetch = (request: Request) => Response | Promise<Response>;
const served = vi.hoisted(() => ({ fetch: null as Fetch | null }));
vi.mock('@hono/node-server', () => ({
  serve: (options: { fetch: Fetch }) => {
    served.fetch = options.fetch;
    return { close: (callback?: () => void) => callback?.() };
  },
}));

const MAIN_ENV = [
  'HERMES_HOME',
  'DATA_DIR',
  'SECRETS_DIR',
  'FACTORY_REPO',
  'CLAUDE_PROJECTS',
  'OPENCODE_DB',
  'WEB_DIST',
  'LOG_LEVEL',
  'LIVE_SOURCE',
  'WORKFLOW_CORE_URL',
  'GITHUB_API',
] as const;

/** Starts main.ts on the core's side, the HTTP server captured; `stop` sends it SIGTERM and restores. */
async function startMain(dir: TempDir, core: FakeCore) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const at = (name: string) => {
    const path = join(dir.path, name);
    mkdirSync(path, { recursive: true });
    return path;
  };
  const secrets = at('secrets');
  writeFileSync(join(secrets, 'workflow-core-secret'), SECRET);
  const saved = Object.fromEntries(MAIN_ENV.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    HERMES_HOME: join(dir.path, 'hermes'),
    DATA_DIR: at('data'),
    SECRETS_DIR: secrets,
    FACTORY_REPO: join(dir.path, 'factory-repo'),
    CLAUDE_PROJECTS: join(dir.path, 'hermes', 'claude-projects'),
    OPENCODE_DB: join(dir.path, 'hermes', 'opencode.db'),
    WEB_DIST: at('web-dist'),
    LOG_LEVEL: 'fatal',
    LIVE_SOURCE: 'workflow-core',
    WORKFLOW_CORE_URL: core.url,
    // GitHub is answered by the fake core (401): no request leaves the machine.
    GITHUB_API: core.url,
  });
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  const before = process.listeners('SIGTERM');
  opened.length = 0;
  await import('../../main.ts');
  const sigterm = process.listeners('SIGTERM').find((listener) => !before.includes(listener));
  return {
    get: async (path: string) => {
      if (!served.fetch) throw new Error('main.ts did not start the HTTP server');
      return served.fetch(
        new Request(`http://127.0.0.1:8446${path}`, { headers: { Host: '127.0.0.1:8446' } }),
      );
    },
    stop: async () => {
      if (sigterm) {
        (sigterm as () => void)();
        process.removeListener('SIGTERM', sigterm as () => void);
      }
      for (const listener of process.listeners('SIGINT').slice(-1))
        process.removeListener('SIGINT', listener);
      await new Promise((resolve) => setTimeout(resolve, 100));
      exit.mockRestore();
      for (const key of MAIN_ENV) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    },
  };
}
