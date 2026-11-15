import { readFileSync } from 'node:fs';
import type * as NodeFs from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type * as NodeSqlite from 'node:sqlite';
import { FACTORY_RUNTIME, msg } from '@factory-live/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublishedSheet } from '../../application/ports.ts';
import { fakeCore } from '../../test/fake-core.ts';
import type { FakeCore } from '../../test/fake-core.ts';
import {
  CORE_INTERVENTION,
  CORE_ITEMS,
  NOW,
  SECRET,
  SHEET,
  card,
  coreSide,
  coreState,
  line,
  until,
} from '../../test/core-scenario.ts';
import type { Side } from '../../test/core-scenario.ts';
import { buildHealth } from '../../application/health.ts';
import { tempDir } from '../../test/board-fixtures.ts';
import type { TempDir } from '../../test/board-fixtures.ts';

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

/** The code line's snapshot the reading of the kanban gave for the miniature factory, before #72 (C1 of #57). */
const LINE_REFERENCE = JSON.parse(
  readFileSync(
    new URL('../../../../../fixtures/workflow-core/references/line.json', import.meta.url),
    'utf8',
  ),
) as ReturnType<typeof line>;

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
  it("l'instantané de la ligne du code lu par le socle", async () => {
    dir = tempDir();
    core = await fakeCore(SECRET, coreState());
    side = coreSide(dir, core);
    side.reader.start();
    await until(() => side!.boards.length > 0);

    // The snapshot the reading of the kanban gave for the same miniature factory, before #72.
    const reference = LINE_REFERENCE;
    expect(reference.issues.length).toBeGreaterThan(0);
    expect(reference.interventions.length).toBeGreaterThan(0);
    // Since workflow-core#37 (its C2, decided by the owner), a `needs_input` of the core also offers the
    // command that shows the card, after Débloquer: the one difference with that reference, written here.
    const showCard = {
      kind: 'copy' as const,
      label: msg('intervention.action.showCard'),
      command: CORE_INTERVENTION.actions[1]!.command,
    };
    const expected = {
      ...reference,
      interventions: reference.interventions.map((item) =>
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

  it('la ligne du code attend sa première fiche du socle puis garde la dernière', async () => {
    dir = tempDir();
    // The core is down when factory-live starts: its port answers nothing.
    const stopped = await fakeCore(SECRET, coreState());
    const port = Number(new URL(stopped.url).port);
    await stopped.close();
    side = coreSide(dir, stopped);
    side.reader.start();
    await until(() => side!.failures.length > 0);
    // No embedded copy stands in for it: the line waits for the core's sheet.
    expect(side.sheet()).toBeNull();

    // The core starts again: the line is drawn from its first sheet.
    core = await fakeCore(SECRET, coreState(), port);
    await until(() => side!.sheet() !== null);
    expect(side.sheet()).toEqual({ source: 'published', sheet: SHEET });

    // The core stops again: the line keeps the last sheet it served.
    const failures = side.failures.length;
    await core.close();
    core = null;
    await until(() => side!.failures.length > failures);
    expect(side.sheet()).toEqual({ source: 'published', sheet: SHEET });
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

  it('un changement dont l’écriture échoue est redemandé à la reprise du flux', async () => {
    dir = tempDir();
    core = await fakeCore(SECRET, coreState());
    side = coreSide(dir, core);
    // The base refuses the first write of a card's change, as SQLite may when it is busy.
    const sink = (
      side.reader as unknown as { options: { sink: { history: (...args: unknown[]) => void } } }
    ).options.sink;
    const write = sink.history.bind(sink);
    let refusals = 0;
    sink.history = (...args: unknown[]) => {
      if (args[2] === false && refusals === 0) {
        refusals += 1;
        throw new Error('database is locked');
      }
      write(...args);
    };
    const change = {
      cursor: '1762900000:6',
      workflow: 'factory',
      item: 't_1a9f0049',
      kind: 'changed',
      at: '2026-11-12T10:00:01.000Z',
      state: { ...structuredClone(CORE_ITEMS[1]!), status: 'review', block_kind: null },
    };
    // The core sends again what follows the cursor a client resumes from.
    core.backlog = (lastEventId) => (lastEventId === '1762900000:5' ? [change] : []);
    side.reader.start();
    await until(() => side!.boards.length > 0 && core!.openStreams() === 1);

    core.send(change);
    await until(
      () => side!.hub.boardData.tasks.find((task) => task.id === 't_1a9f0049')?.status === 'review',
      3_000,
    );
    expect(refusals).toBe(1);
    const resumed = core.requests.filter((request) => request.path === '/api/events');
    expect(resumed.at(-1)?.lastEventId).toBe('1762900000:5');
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

  it('une fiche de la ligne refusée par le socle dit pourquoi, la dernière reçue restant', async () => {
    dir = tempDir();
    const state = coreState();
    // Refused from the start: no sheet to draw, the core's reason to show.
    state.sheets['factory'] = { invalid: 'duplicate station "impl"' };
    core = await fakeCore(SECRET, state);
    side = coreSide(dir, core);
    side.reader.start();
    await until(() => side!.sheet() !== null && core!.openStreams() === 1);
    expect(side.sheet()).toEqual({
      source: 'published',
      sheet: null,
      refusal: 'duplicate station "impl"',
    });
    const tile = (sheet: ReturnType<Side['sheet']>) =>
      buildHealth({
        now: NOW,
        github: {
          configured: false,
          ok: false,
          detail: msg('health.github.noToken'),
          remaining: null,
          limit: null,
          checkedAt: null,
        },
        webhookDeliveries: null,
        guards: null,
        running: 0,
        maxInProgress: 2,
        maxInProgressPerProfile: 1,
        codeSheet: sheet,
        core: { unreachableSince: null, error: null, machine: null },
      }).health.find((item) => item.id === 'code-sheet');
    expect(tile(side.sheet())).toMatchObject({
      status: 'degraded',
      detail: msg('health.workflow.sheetInvalid', { error: 'duplicate station "impl"' }),
    });

    // The core serves a good sheet, then refuses the next one: the good one stays, with the refusal.
    core.state.sheets['factory'] = structuredClone(SHEET);
    const reset = (n: number) =>
      core!.send({
        cursor: `1762999999:${n}`,
        workflow: null,
        item: null,
        kind: 'reset',
        at: '2026-11-12T10:05:00.000Z',
        state: null,
      });
    reset(1);
    await until(() => side!.sheet()?.sheet !== null && side!.sheet()?.refusal === undefined);
    expect(side.sheet()).toEqual({ source: 'published', sheet: SHEET });
    await until(() => core!.openStreams() === 1);
    core.state.sheets['factory'] = { invalid: 'edge "x" leaves an unknown station' };
    reset(2);
    await until(() => side!.sheet()?.refusal !== undefined);
    expect(side.sheet()).toEqual({
      source: 'published',
      sheet: SHEET,
      refusal: 'edge "x" leaves an unknown station',
    });
  });

  it('la fiche du socle est vérifiée par le schéma tiré de son JSON Schema, sans autre règle', async () => {
    dir = tempDir();
    const state = coreState();
    // A sheet whose form is right but which breaks a cross rule of the old judge of factory-live (two
    // stations on one cell): the core judged it, factory-live does not judge it again.
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

    // The adapter never calls a judge of sheets, nor reads an embedded sheet. The names of the old judge
    // and of the old embedded copy are spelled in pieces: no file of the server carries them any more (#72).
    const retired = new RegExp(
      [`sheet${'Error'}\\(`, `parse${'WorkflowSheet'}`, `code-line${'\\.json'}`, 'codeSheet'].join(
        '|',
      ),
    );
    for (const file of ['reader.ts', 'client.ts', 'cards.ts']) {
      const code = readFileSync(join(import.meta.dirname, file), 'utf8');
      expect(code, file).not.toMatch(retired);
    }
  });

  it('rien d’autre que la base de factory-live n’est ouvert, et le miroir n’existe plus', async () => {
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

    // Only factory-live's own folders: its base, its web build, its secrets.
    const own = ['data', 'web-dist', 'secrets'].map((name) => join(dir.path, name));
    expect(
      opened.filter(
        (path) => path.startsWith(dir.path) && !own.some((folder) => path.startsWith(folder)),
      ),
    ).toEqual([]);
    // The record is not empty for lack of watching: it saw factory-live's own base opened.
    expect(opened.some((path) => path.startsWith(join(dir.path, 'data')))).toBe(true);
    const data = new DatabaseSync(join(dir.path, 'data', 'factory-live.db'), { readOnly: true });
    const tables = data
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String(row['name']));
    for (const table of ['tasks', 'runs', 'events', 'comments', 'links'])
      expect(tables, table).not.toContain(table);
    data.close();
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
      group: FACTORY_RUNTIME,
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
      group: FACTORY_RUNTIME,
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
      expect.objectContaining({ name: 'essai', sheet: SHEET, sheetRefusal: null, error: null }),
    ]);
    // The studio keeps its own adapter for its items: only its sheet is read from the core (#72).
    expect(
      core.requests
        .filter((request) => request.path.startsWith('/api/workflows/studio'))
        .every((request) => request.path === '/api/workflows/studio/sheet'),
    ).toBe(true);
    expect(side.ownSheets.get('studio')).toEqual({ sheet: SHEET, refusal: null });
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
  'DATA_DIR',
  'SECRETS_DIR',
  'WEB_DIST',
  'LOG_LEVEL',
  'WORKFLOW_CORE_URL',
  'GITHUB_API',
] as const;

/** Starts main.ts, the HTTP server captured; `stop` sends it SIGTERM and restores. */
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
    DATA_DIR: at('data'),
    SECRETS_DIR: secrets,
    WEB_DIST: at('web-dist'),
    LOG_LEVEL: 'fatal',
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
