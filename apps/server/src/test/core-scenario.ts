import { join } from 'node:path';
import type { Snapshot } from '@factory-live/contracts';
import { Hub } from '../application/hub.ts';
import type { KanbanDelta, PublishedSheet, WorkflowView } from '../application/ports.ts';
import { KEEP_FINISHED_MS } from '../application/projection.ts';
import { createLogger } from '../logger.ts';
import { HistoryStore } from '../adapters/store/history.ts';
import { noProfiles } from '../adapters/workflow-core/absent.ts';
import { WorkflowCoreReader } from '../adapters/workflow-core/reader.ts';
import type { FakeCore, FakeCoreState } from './fake-core.ts';
import { insertEvent, insertRun, insertTask, kanbanDb } from './hermes-fixtures.ts';
import type { TempDir } from './hermes-fixtures.ts';

/**
 * The miniature factory of the workflow-core tests (#57, #66): the same cards written in a Hermes base and
 * served by a fake core, and the core's side of the switch wired as main.ts wires it.
 */

export const SECRET = 'secret-du-socle-de-test';
export const NOW = Date.parse('2026-11-12T10:00:00Z');
export const NOW_S = Math.floor(NOW / 1000);
const log = createLogger('silent');

/** The code line's sheet as the core serves it, judged: two stations, one edge. */
export const SHEET = {
  item: { type: 'issue', label: 'Issue' },
  stations: [
    { key: 'brief', label: 'Brief', icon: 'note', kind: 'ai', col: 0, row: 0 },
    { key: 'impl', label: 'Implémentation', icon: 'code', kind: 'ai', col: 1, row: 0 },
  ],
  edges: [{ from: 'brief', to: 'impl', kind: 'line' }],
  models: ['impl'],
};

export const until = async (condition: () => boolean, timeoutMs = 3_000) => {
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
export function writeHermesBoard(path: string): void {
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

export const card = (fields: Record<string, unknown>): Record<string, unknown> => ({
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
export const CORE_ITEMS = [
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

export const coreState = (): FakeCoreState => ({
  workflows: [
    { key: 'factory', board: 'factory', sheet_valid: true },
    { key: 'studio', board: 'studio', sheet_valid: true },
  ],
  sheets: { factory: structuredClone(SHEET), studio: structuredClone(SHEET) },
  items: { factory: structuredClone(CORE_ITEMS), studio: [] },
  cursor: '1762900000:5',
});

export function newHub(
  dir: TempDir,
  name: string,
  source: 'hermes' | 'workflow-core' = 'hermes',
): Hub {
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
      source,
    },
  );
}

export interface Side {
  hub: Hub;
  reader: WorkflowCoreReader;
  sheet: () => PublishedSheet | null;
  generic: () => readonly WorkflowView[];
  boards: KanbanDelta[];
  failures: string[];
}

/** The core's side of the switch, as main.ts wires it: the reader feeds the hub, the sheet and the list. */
export function coreSide(dir: TempDir, core: FakeCore): Side {
  const hub = newHub(dir, 'core-data', 'workflow-core');
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
      failed: (error, at) => {
        failures.push(error);
        hub.coreFailed(error, at);
      },
      answered: () => hub.coreAnswered(),
      machine: (machine) => hub.applyCoreMachine(machine),
      checks: (checks) => hub.applyCoreChecks(checks),
      live: (agents) => hub.replaceCoreAgents(agents),
      activity: (facts) => hub.addCoreActivity(facts),
      usage: () => undefined,
    },
  });
  return { hub, reader, sheet: () => sheet, generic: () => generic, boards, failures };
}

/** What the PWA is sent of the line, without the times of computation. */
export const line = (snapshot: Snapshot) => ({
  stations: snapshot.stations,
  issues: snapshot.issues,
  sideCards: snapshot.sideCards,
  interventions: snapshot.interventions,
  agents: snapshot.agents,
});
