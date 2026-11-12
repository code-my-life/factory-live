import { readFileSync } from 'node:fs';
import type * as NodeFs from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type * as NodeSqlite from 'node:sqlite';
import type { Snapshot } from '@factory-live/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hub } from '../../application/hub.ts';
import type { KanbanDelta, PublishedSheet, WorkflowView } from '../../application/ports.ts';
import { KEEP_FINISHED_MS } from '../../application/projection.ts';
import { createLogger } from '../../logger.ts';
import { HistoryStore } from '../store/history.ts';
import { KanbanReader } from '../hermes/kanban.ts';
import { fakeCore } from '../../test/fake-core.ts';
import type { FakeCore, FakeCoreState } from '../../test/fake-core.ts';
import {
  insertEvent,
  insertRun,
  insertTask,
  kanbanDb,
  tempDir,
} from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';
import { noProfiles } from './absent.ts';
import { WorkflowCoreReader } from './reader.ts';

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

const SECRET = 'secret-du-socle-de-test';
const NOW = Date.parse('2026-11-12T10:00:00Z');
const NOW_S = Math.floor(NOW / 1000);
const log = createLogger('silent');

/** The code line's sheet as the core serves it, judged: two stations, one edge. */
const SHEET = {
  item: { type: 'issue', label: 'Issue' },
  stations: [
    { key: 'brief', label: 'Brief', icon: 'note', kind: 'ai', col: 0, row: 0 },
    { key: 'impl', label: 'Implémentation', icon: 'code', kind: 'ai', col: 1, row: 0 },
  ],
  edges: [{ from: 'brief', to: 'impl', kind: 'line' }],
  models: ['impl'],
};

const until = async (condition: () => boolean, timeoutMs = 3_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

/**
 * The miniature factory, written in a Hermes base: cv-site#49 (brief done, impl blocked on a decision,
 * with a comment) and cv-site#50 (impl running, its run's metadata naming its branch and PR).
 */
function writeHermesBoard(path: string): void {
  const db = kanbanDb(path);
  insertTask(db, {
    id: 't_b1ef0049',
    title: 'brief cv-site#49 : Page Projets',
    status: 'done',
    assignee: 'coordinator',
    createdAt: NOW_S - 7_200,
    skills: '["factory-brief"]',
  });
  insertTask(db, {
    id: 't_1a9f0049',
    title: 'impl cv-site#49 : Page Projets',
    status: 'blocked',
    assignee: 'coder',
    blockKind: 'needs_input',
    createdAt: NOW_S - 6_000,
  });
  insertTask(db, {
    id: 't_c0de0050',
    title: 'impl : Formulaire de contact',
    status: 'running',
    assignee: 'coder',
    createdAt: NOW_S - 3_000,
  });
  db.prepare(
    `UPDATE tasks SET idempotency_key = 'gh-cv-site-50', workspace_path = '/work/cv-site-50', started_at = ?,
       current_run_id = 3, last_heartbeat_at = ?, model_override = 'agnes-2.5-flash' WHERE id = 't_c0de0050'`,
  ).run(NOW_S - 2_900, NOW_S - 30);
  db.prepare(
    "INSERT INTO task_links (parent_id, child_id) VALUES ('t_b1ef0049', 't_1a9f0049')",
  ).run();
  insertRun(db, {
    taskId: 't_b1ef0049',
    profile: 'coordinator',
    status: 'done',
    outcome: 'completed',
    startedAt: NOW_S - 7_100,
    endedAt: NOW_S - 6_100,
  });
  insertRun(db, {
    taskId: 't_1a9f0049',
    profile: 'coder',
    status: 'done',
    outcome: 'blocked',
    startedAt: NOW_S - 5_000,
    endedAt: NOW_S - 600,
  });
  insertRun(db, {
    taskId: 't_c0de0050',
    profile: 'coder',
    status: 'running',
    startedAt: NOW_S - 2_900,
    metadata: {
      branch: 'feat/50-contact',
      pr_url: 'https://github.com/code-my-life/cv-site/pull/51',
    },
  });
  insertEvent(db, {
    taskId: 't_1a9f0049',
    kind: 'blocked',
    runId: 2,
    payload: { kind: 'needs_input', reason: 'Quelle base de données ?' },
    createdAt: NOW_S - 600,
  });
  insertEvent(db, { taskId: 't_c0de0050', kind: 'claimed', runId: 3, createdAt: NOW_S - 2_900 });
  insertEvent(db, { taskId: 't_c0de0050', kind: 'heartbeat', runId: 3, createdAt: NOW_S - 30 });
  db.prepare(
    "INSERT INTO task_comments (task_id, author, body, created_at) VALUES ('t_1a9f0049', 'coder', 'Choix de base à faire', ?)",
  ).run(NOW_S - 590);
  db.close();
}

const card = (fields: Record<string, unknown>): Record<string, unknown> => ({
  body: null,
  assignee: null,
  started_at: null,
  completed_at: null,
  block_kind: null,
  idempotency_key: null,
  workspace_path: null,
  current_run_id: null,
  last_heartbeat_at: null,
  model_override: null,
  provider_override: null,
  skills: [],
  runs: [],
  parents: [],
  children: [],
  comments: [],
  events: [],
  ...fields,
});

/** The same miniature factory, as workflow-core serves it: answers written by hand in the core's format. */
const CORE_ITEMS = [
  card({
    id: 't_b1ef0049',
    title: 'brief cv-site#49 : Page Projets',
    status: 'done',
    assignee: 'coordinator',
    created_at: NOW_S - 7_200,
    skills: ['factory-brief'],
    runs: [
      {
        id: 1,
        profile: 'coordinator',
        status: 'done',
        outcome: 'completed',
        started_at: NOW_S - 7_100,
        ended_at: NOW_S - 6_100,
        summary: null,
        metadata: {},
      },
    ],
    children: ['t_1a9f0049'],
  }),
  card({
    id: 't_1a9f0049',
    title: 'impl cv-site#49 : Page Projets',
    status: 'blocked',
    assignee: 'coder',
    created_at: NOW_S - 6_000,
    block_kind: 'needs_input',
    runs: [
      {
        id: 2,
        profile: 'coder',
        status: 'done',
        outcome: 'blocked',
        started_at: NOW_S - 5_000,
        ended_at: NOW_S - 600,
        summary: null,
        metadata: {},
      },
    ],
    parents: ['t_b1ef0049'],
    comments: [{ id: 1, author: 'coder', body: 'Choix de base à faire', created_at: NOW_S - 590 }],
    events: [
      {
        id: 1,
        run_id: 2,
        kind: 'blocked',
        payload: { kind: 'needs_input', reason: 'Quelle base de données ?' },
        created_at: NOW_S - 600,
      },
    ],
  }),
  card({
    id: 't_c0de0050',
    title: 'impl : Formulaire de contact',
    status: 'running',
    assignee: 'coder',
    created_at: NOW_S - 3_000,
    started_at: NOW_S - 2_900,
    idempotency_key: 'gh-cv-site-50',
    workspace_path: '/work/cv-site-50',
    current_run_id: 3,
    last_heartbeat_at: NOW_S - 30,
    model_override: 'agnes-2.5-flash',
    runs: [
      {
        id: 3,
        profile: 'coder',
        status: 'running',
        outcome: null,
        started_at: NOW_S - 2_900,
        ended_at: null,
        summary: null,
        metadata: {
          branch: 'feat/50-contact',
          pr_url: 'https://github.com/code-my-life/cv-site/pull/51',
        },
      },
    ],
    events: [
      { id: 2, run_id: 3, kind: 'claimed', payload: {}, created_at: NOW_S - 2_900 },
      { id: 3, run_id: 3, kind: 'heartbeat', payload: {}, created_at: NOW_S - 30 },
    ],
  }),
];

const coreState = (): FakeCoreState => ({
  workflows: [
    { key: 'factory', board: 'factory', sheet_valid: true },
    { key: 'studio', board: 'studio', sheet_valid: true },
  ],
  sheets: { factory: structuredClone(SHEET), studio: structuredClone(SHEET) },
  items: { factory: structuredClone(CORE_ITEMS), studio: [] },
  cursor: '1762900000:5',
});

function newHub(dir: TempDir, name: string): Hub {
  return new Hub(
    {
      owner: 'code-my-life',
      boardName: 'factory',
      dashboardUrl: null,
      addresses: { local: 'http://localhost:8446', tailnet: null },
      heldAfterSeconds: 1_800,
      keepFinishedMs: KEEP_FINISHED_MS,
    },
    {
      store: new HistoryStore(join(dir.path, name)),
      profiles: noProfiles,
      github: null,
      diagnoses: null,
      log,
      now: () => NOW,
    },
  );
}

interface Side {
  hub: Hub;
  reader: WorkflowCoreReader;
  sheet: () => PublishedSheet | null;
  generic: () => readonly WorkflowView[];
  boards: KanbanDelta[];
  failures: string[];
}

/** The core's side of the switch, as main.ts wires it: the reader feeds the hub, the sheet and the list. */
function coreSide(dir: TempDir, core: FakeCore): Side {
  const hub = newHub(dir, 'core-data');
  let sheet: PublishedSheet | null = null;
  let generic: readonly WorkflowView[] = [];
  const boards: KanbanDelta[] = [];
  const failures: string[] = [];
  const reader = new WorkflowCoreReader({
    url: core.url,
    secret: SECRET,
    code: 'factory',
    own: ['studio'],
    retryMs: 50,
    now: () => NOW,
    log,
    sink: {
      board: (delta, readAt) => {
        boards.push(delta);
        hub.replaceBoard(delta, readAt);
      },
      sheet: (next) => {
        sheet = next;
      },
      workflows: (views) => {
        generic = views;
      },
      failed: (error) => {
        failures.push(error);
      },
    },
  });
  return { hub, reader, sheet: () => sheet, generic: () => generic, boards, failures };
}

/** What the PWA is sent of the line, without the times of computation. */
const line = (snapshot: Snapshot) => ({
  stations: snapshot.stations,
  issues: snapshot.issues,
  sideCards: snapshot.sideCards,
  interventions: snapshot.interventions,
  agents: snapshot.agents,
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
    expect(line(side.hub.snapshot())).toEqual(fromHermes);
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

      // A kind of event the copy of the schema does not know yet (the core's live, #34) is skipped.
      core.send({
        cursor: '1762900000:6',
        workflow: 'factory',
        item: null,
        kind: 'live',
        at: '2026-11-12T10:00:00.500Z',
        state: { agent: 'coder' },
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
    expect(after).toEqual(before);
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
