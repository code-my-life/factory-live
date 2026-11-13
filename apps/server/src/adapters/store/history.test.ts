import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { historyStats, issueDetail } from '../../application/views.ts';
import type { ViewDeps } from '../../application/views.ts';
import type { Hub } from '../../application/hub.ts';
import { fakeCore } from '../../test/fake-core.ts';
import type { FakeCore } from '../../test/fake-core.ts';
import {
  CORE_ITEMS,
  NOW,
  NOW_S,
  SECRET,
  coreSide,
  coreState,
  newHub,
  until,
} from '../../test/core-scenario.ts';
import type { Side } from '../../test/core-scenario.ts';
import { tempDir } from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';
import { noAgentLog, noCardFiles, noProfiles, noSessions } from '../workflow-core/absent.ts';
import { HistoryStore } from './history.ts';

/** The views as the server builds them on the core's side, over this hub and its base. */
const views = (hub: Hub, store: HistoryStore): ViewDeps => ({
  hub,
  store,
  sessions: noSessions,
  profiles: noProfiles,
  github: null,
  files: noCardFiles,
  agentLog: noAgentLog,
  owner: 'code-my-life',
  boardName: 'factory',
  dashboardUrl: null,
  heldAfterSeconds: 1_800,
  now: () => NOW,
});

const reset = (core: FakeCore, n: number) =>
  core.send({
    cursor: `1762999999:${n}`,
    workflow: null,
    item: null,
    kind: 'reset',
    at: '2026-11-12T10:05:00.000Z',
    state: null,
  });

const rows = (dir: TempDir, table: string): number => {
  const db = new DatabaseSync(join(dir.path, 'core-data', 'factory-live.db'), { readOnly: true });
  const { n } = db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number };
  db.close();
  return n;
};

/** cv-site#40, delivered 45 days ago: its brief, its code and its release, all done. */
const DAY = 86_400;
const DELIVERED = NOW_S - 45 * DAY;
const delivered = (id: string, title: string, completedAt: number) => ({
  id,
  title,
  body: '',
  assignee: 'coder',
  status: 'done' as const,
  createdAt: DELIVERED - 3_600,
  startedAt: DELIVERED - 3_500,
  completedAt,
  idempotencyKey: null,
  blockKind: null,
  currentRunId: null,
  workspacePath: null,
  skills: [],
  modelOverride: null,
  providerOverride: null,
  lastHeartbeatAt: null,
  branchName: null,
  consecutiveFailures: 0,
  blockRecurrences: 0,
  lastFailureError: null,
  maxRuntimeSeconds: null,
});
const MIRROR = {
  tasks: [
    delivered('t_b40', 'brief cv-site#40 : Pied de page', DELIVERED - 2_000),
    delivered('t_i40', 'impl cv-site#40 : Pied de page', DELIVERED - 600),
    delivered('t_r40', 'release cv-site#40 : Pied de page', DELIVERED),
  ],
  runs: [
    {
      id: 900,
      taskId: 't_i40',
      profile: 'coder',
      status: 'done',
      outcome: 'completed',
      startedAt: DELIVERED - 1_800,
      endedAt: DELIVERED - 600,
      summary: 'PR ouverte',
      metadata: {},
      error: null,
    },
  ],
  links: [
    { parentId: 't_b40', childId: 't_i40' },
    { parentId: 't_i40', childId: 't_r40' },
  ],
  events: [],
  comments: [],
};

let dir: TempDir;
let core: FakeCore | null = null;
let side: Side | null = null;

afterEach(async () => {
  await side?.reader.stop();
  side?.store.close();
  await core?.close();
  side = null;
  core = null;
  dir?.remove();
});

async function start(state = coreState()): Promise<Side> {
  core = await fakeCore(SECRET, state);
  side = coreSide(dir, core);
  side.reader.start();
  await until(() => side!.boards.length > 0 && core!.openStreams() === 1);
  return side;
}

describe('historique de factory-live par le socle (#63)', () => {
  it('côté socle, un élément purgé reste dans l’historique', async () => {
    dir = tempDir();
    const { hub, store } = await start();
    const before = issueDetail(views(hub, store), 'cv-site#49');
    expect(before?.cards.map((item) => item.id)).toContain('t_b1ef0049');

    // Hermes purged the finished brief: the core no longer serves it.
    core!.state.items['factory'] = structuredClone(CORE_ITEMS).filter(
      (item) => item['id'] !== 't_b1ef0049',
    );
    reset(core!, 1);
    await until(() => store.historyItems('factory').some((row) => row.goneAt !== null), 2_000);

    const gone = store.historyItems('factory').find((row) => row.id === 't_b1ef0049');
    expect(gone?.goneAt).toBe(NOW);
    expect(hub.boardData.tasks.map((task) => task.id)).toContain('t_b1ef0049');
    expect(hub.boardData.runs.filter((run) => run.taskId === 't_b1ef0049')).toHaveLength(1);
    const after = issueDetail(views(hub, store), 'cv-site#49');
    expect(after?.cards.find((item) => item.id === 't_b1ef0049')?.runs).toHaveLength(1);
    expect(after?.cards.map((item) => item.id)).toEqual(before?.cards.map((item) => item.id));
  });

  it('un workflow de la ligne du code retiré du socle ne garde pas ses cartes purgées', async () => {
    dir = tempDir();
    const { hub, store } = await start();
    // A finished card purged first: it stays, from the history.
    core!.state.items['factory'] = structuredClone(CORE_ITEMS).filter(
      (item) => item['id'] !== 't_b1ef0049',
    );
    await until(() => core!.openStreams() === 1);
    reset(core!, 1);
    await until(() => store.historyItems('factory').some((row) => row.goneAt !== null), 2_000);
    expect(hub.boardData.tasks.map((task) => task.id)).toContain('t_b1ef0049');

    // Then the core no longer declares the code line: its board is empty, purged cards included.
    core!.state.workflows = core!.state.workflows.filter((workflow) => workflow.key !== 'factory');
    await until(() => core!.openStreams() === 1);
    reset(core!, 2);
    await until(() => hub.boardData.tasks.length === 0, 2_000);
  });

  it('un reset du socle ne crée aucun doublon', async () => {
    dir = tempDir();
    await start();
    for (const n of [1, 2, 3]) {
      // A reset reaches only an open stream: wait for the reader to have opened it again.
      await until(() => core!.openStreams() === 1, 5_000);
      reset(core!, n);
      await until(
        () => core!.requests.filter((request) => request.path === '/api/workflows').length >= n + 1,
        5_000,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(rows(dir, 'item_history')).toBe(CORE_ITEMS.length);
  });

  it('au premier démarrage côté socle, le miroir est versé une fois dans l’historique', async () => {
    dir = tempDir();
    // A base written on Hermes' side: its mirror holds cv-site#40, delivered 45 days ago and purged since.
    const seeded = new HistoryStore(join(dir.path, 'core-data'));
    seeded.mirror(MIRROR);
    const fromHermes = historyStats(views(newHub(dir, 'core-data', 'hermes', seeded), seeded), 60);
    seeded.close();
    expect(fromHermes.issuesDone).toBe(1);
    const mirrorRows = ['tasks', 'runs', 'links', 'events', 'comments'].map((table) =>
      rows(dir, table),
    );

    const { hub, store } = await start();
    await until(() =>
      store.historyItems('factory').some((row) => row.id === 't_r40' && row.goneAt !== null),
    );
    const fromCore = historyStats(views(hub, store), 60);
    // cv-site#40 counts among the delivered issues, as on Hermes' side; cv-site#49 is not finished.
    expect(fromCore.issuesDone).toBe(1);
    expect(fromCore.recent.map((issue) => issue.key)).toEqual(
      fromHermes.recent.map((issue) => issue.key),
    );
    expect(fromCore.medianLeadTimeMinutes).toBe(fromHermes.medianLeadTimeMinutes);
    expect(hub.boardData.tasks.map((task) => task.id)).toEqual(
      expect.arrayContaining(['t_b40', 't_i40', 't_r40']),
    );
    const historyRows = rows(dir, 'item_history');
    expect(historyRows).toBe(CORE_ITEMS.length + MIRROR.tasks.length);
    // The mirror is read, never written, on the core's side.
    expect(
      ['tasks', 'runs', 'links', 'events', 'comments'].map((table) => rows(dir, table)),
    ).toEqual(mirrorRows);

    // A second start does not pour it again.
    await side!.reader.stop();
    side!.store.close();
    side = null;
    await core!.close();
    core = null;
    await start();
    expect(rows(dir, 'item_history')).toBe(historyRows);
  });
});
