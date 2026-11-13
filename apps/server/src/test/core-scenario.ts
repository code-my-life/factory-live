import { join } from 'node:path';
import type { Snapshot } from '@factory-live/contracts';
import { Hub } from '../application/hub.ts';
import type {
  KanbanDelta,
  ProfilesPort,
  PublishedSheet,
  WorkflowView,
} from '../application/ports.ts';
import { KEEP_FINISHED_MS } from '../application/projection.ts';
import { createLogger } from '../logger.ts';
import { HistoryStore } from '../adapters/store/history.ts';
import { noProfiles } from '../adapters/workflow-core/absent.ts';
import { CoreProfiles } from '../adapters/workflow-core/agents.ts';
import { CoreHistory } from '../adapters/workflow-core/history.ts';
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

/**
 * The intervention the core publishes for the blocked card of cv-site#49 (workflow-core#37): the agent's
 * question quoted, the gesture `unblock` and, for `needs_input`, the command that shows the card.
 */
export const CORE_INTERVENTION = {
  id: 'needs_input:t_1a9f0049:1',
  kind: 'needs_input',
  item: 't_1a9f0049',
  event: 1,
  opened_at: new Date((NOW_S - 600) * 1000).toISOString(),
  agent: 'coder',
  severity: 'critical',
  push: true,
  title: { quote: 'Quelle base de données ?' },
  question: { quote: 'Quelle base de données ?' },
  actions: [
    { kind: 'gesture', gesture: 'unblock' },
    {
      kind: 'copy',
      label: { code: 'intervention.action.showCard', params: {} },
      command: 'hermes kanban --board factory show t_1a9f0049',
    },
  ],
};

export const coreState = (): FakeCoreState => ({
  workflows: [
    {
      key: 'factory',
      board: 'factory',
      sheet_valid: true,
      gestures: [{ name: 'unblock', kind: 'comment' }],
    },
    { key: 'studio', board: 'studio', sheet_valid: true, gestures: [] },
  ],
  sheets: { factory: structuredClone(SHEET), studio: structuredClone(SHEET) },
  items: { factory: structuredClone(CORE_ITEMS), studio: [] },
  interventions: { factory: [structuredClone(CORE_INTERVENTION)] },
  cursor: '1762900000:5',
});

export function newHub(
  dir: TempDir,
  name: string,
  source: 'hermes' | 'workflow-core' = 'hermes',
  store: HistoryStore = new HistoryStore(join(dir.path, name)),
  profiles: ProfilesPort = noProfiles,
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
      store,
      profiles,
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
  store: HistoryStore;
  reader: WorkflowCoreReader;
  profiles: CoreProfiles;
  sheet: () => PublishedSheet | null;
  generic: () => readonly WorkflowView[];
  boards: KanbanDelta[];
  failures: string[];
}

/** The core's side of the switch, as main.ts wires it: the reader feeds the hub, the sheet and the list. */
export function coreSide(dir: TempDir, core: FakeCore): Side {
  const store = new HistoryStore(join(dir.path, 'core-data'));
  // The agents the core publishes fill the profiles' port on its side (#93).
  const profiles = new CoreProfiles();
  const hub = newHub(dir, 'core-data', 'workflow-core', store, profiles);
  // factory-live's own history, as main.ts wires it (#63): the mirror poured once, then every item read.
  const history = new CoreHistory(store, () => NOW);
  history.seed('factory', store.board());
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
      board: (delta, readAt, declared) => {
        boards.push(delta);
        hub.replaceBoard(declared ? history.withGone('factory', delta) : delta, readAt);
      },
      history: (workflow, items, complete) => history.record(workflow, items, complete),
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
      interventions: (list) => hub.replaceCoreInterventions(list),
      interventionOpened: (item) => hub.openCoreIntervention(item),
      interventionClosed: (id) => hub.closeCoreIntervention(id),
      diagnoses: (entries) => hub.applyCoreDiagnoses(entries),
      verdicts: (cardId, verdicts) => hub.applyCoreVerdicts(cardId, verdicts),
      agents: (answer) => {
        profiles.update(answer, NOW);
        hub.reloadConfig();
      },
      gestures: () => undefined,
    },
  });
  return {
    hub,
    store,
    reader,
    profiles,
    sheet: () => sheet,
    generic: () => generic,
    boards,
    failures,
  };
}

/** What the PWA is sent of the line, without the times of computation. */
export const line = (snapshot: Snapshot) => ({
  stations: snapshot.stations,
  issues: snapshot.issues,
  sideCards: snapshot.sideCards,
  interventions: snapshot.interventions,
  agents: snapshot.agents,
});

/** The Hermes side's readers of the bench and the gate, for the tests of the core's side that compare with it. */
export { CardFiles } from '../adapters/hermes/files.ts';
export { HermesPaths } from '../adapters/hermes/paths.ts';
export { TwinBench } from '../adapters/twins/bench.ts';
