import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { issueDetail } from '../../application/views.ts';
import type { ViewDeps } from '../../application/views.ts';
import type { Hub } from '../../application/hub.ts';
import { fakeCore } from '../../test/fake-core.ts';
import type { FakeCore } from '../../test/fake-core.ts';
import { CORE_ITEMS, NOW, SECRET, coreSide, coreState, until } from '../../test/core-scenario.ts';
import type { Side } from '../../test/core-scenario.ts';
import { tempDir } from '../../test/board-fixtures.ts';
import type { TempDir } from '../../test/board-fixtures.ts';
import { noProfiles } from '../workflow-core/absent.ts';
import type { HistoryStore } from './history.ts';

/** The views as the server builds them, over this hub and its base. */
const views = (hub: Hub, store: HistoryStore): ViewDeps => ({
  hub,
  store,
  profiles: noProfiles,
  github: null,
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

    // The factory purged the finished brief: the core no longer serves it.
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
});
