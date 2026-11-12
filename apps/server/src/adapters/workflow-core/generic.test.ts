import { DeclaredDataList, GenericWorkflows } from '@factory-live/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeCore } from '../../test/fake-core.ts';
import type { FakeCore, FakeCoreState } from '../../test/fake-core.ts';
import { NOW_S, SECRET, card, coreSide, coreState, until } from '../../test/core-scenario.ts';
import type { Side } from '../../test/core-scenario.ts';
import { harness } from '../../test/harness.ts';
import type { Harness } from '../../test/harness.ts';
import { tempDir } from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';

/** A generic workflow of three stations, as the core serves it, judged. */
const TRIAL_SHEET = {
  item: { type: 'trial', label: 'Trial' },
  stations: [
    { key: 'prep', label: 'Prep', icon: 'package', kind: 'script', col: 0, row: 1 },
    { key: 'write', label: 'Write', icon: 'pencil', kind: 'ai', col: 1, row: 1 },
    { key: 'check', label: 'Check', icon: 'eye', kind: 'owner', col: 2, row: 1 },
  ],
  edges: [
    { from: 'prep', to: 'write', kind: 'line' },
    { from: 'write', to: 'check', kind: 'line' },
  ],
  models: [],
};

/** A blocked card of the trial workflow, with a run, its events and a comment. */
const BLOCKED = card({
  id: 't_trial1',
  title: 'Write the note',
  status: 'blocked',
  assignee: 'writer',
  created_at: NOW_S - 3_600,
  started_at: NOW_S - 3_000,
  block_kind: 'needs_input',
  current_run_id: 7,
  runs: [
    {
      id: 7,
      profile: 'writer',
      status: 'done',
      outcome: 'blocked',
      started_at: NOW_S - 3_000,
      ended_at: NOW_S - 600,
      summary: 'Threshold missing.',
      metadata: {},
    },
  ],
  events: [
    { id: 1, run_id: null, kind: 'created', payload: {}, created_at: NOW_S - 3_600 },
    { id: 2, run_id: 7, kind: 'claimed', payload: {}, created_at: NOW_S - 3_000 },
    {
      id: 3,
      run_id: 7,
      kind: 'blocked',
      payload: { reason: 'Which threshold: 2 % or 5 %?' },
      created_at: NOW_S - 600,
    },
  ],
  comments: [{ id: 1, author: 'writer', body: 'See the table.', created_at: NOW_S - 500 }],
});

const trialState = (): FakeCoreState => {
  const state = coreState();
  state.workflows.push({ key: 'trial', board: 'trial', sheet_valid: true });
  state.sheets['trial'] = TRIAL_SHEET;
  state.items['trial'] = [BLOCKED];
  state.data = {
    trial: {
      'card:t_trial1': [
        {
          name: 'check',
          label: 'Check',
          values: [{ type: 'status', label: 'State', status: 'warning', text: 'Two gaps' }],
        },
      ],
      'run:7': [
        { name: 'log', label: 'Log', values: [{ type: 'text', label: 'Log', text: 'ok' }] },
      ],
    },
  };
  return state;
};

let dir: TempDir;
let core: FakeCore | null = null;
let side: Side | null = null;
let h: Harness | null = null;

afterEach(async () => {
  h?.close();
  await side?.reader.stop();
  await core?.close();
  h = null;
  side = null;
  core = null;
  dir?.remove();
});

async function start(state: FakeCoreState): Promise<Side> {
  dir = tempDir();
  core = await fakeCore(SECRET, state);
  side = coreSide(dir, core);
  side.reader.start();
  await until(() => side!.reader.genericWorkflows().length > 0);
  return side;
}

describe('workflows génériques du socle (#65)', () => {
  it('un workflow générique du socle sert ses éléments, leurs cartes et leurs runs', async () => {
    const { reader } = await start(trialState());

    const [trial] = reader.genericWorkflows();
    expect(trial).toMatchObject({ name: 'trial', sheet: TRIAL_SHEET, sheetError: null });
    // The code line and the studio are not generic workflows.
    expect(reader.genericWorkflows().map((workflow) => workflow.name)).toEqual(['trial']);

    const [item] = trial?.items ?? [];
    expect(item).toMatchObject({
      id: 't_trial1',
      title: 'Write the note',
      // The core does not say where an item stands yet: no station is guessed.
      station: null,
      status: 'blocked',
      since: new Date((NOW_S - 3_000) * 1000).toISOString(),
    });
    expect(item?.cards).toEqual([
      expect.objectContaining({
        id: 't_trial1',
        status: 'blocked',
        assignee: 'writer',
        blockKind: 'needs_input',
        blockReason: 'Which threshold: 2 % or 5 %?',
        runs: [
          expect.objectContaining({
            id: 7,
            profile: 'writer',
            outcome: 'blocked',
            summary: 'Threshold missing.',
            startedAt: new Date((NOW_S - 3_000) * 1000).toISOString(),
            endedAt: new Date((NOW_S - 600) * 1000).toISOString(),
          }),
        ],
      }),
    ]);
    // Its life, each event named as the core publishes it, its comment as written.
    expect(item?.timeline.map((entry) => [entry.source, entry.label, entry.tone])).toEqual([
      ['kanban', 'created', 'neutral'],
      ['kanban', 'claimed', 'neutral'],
      ['kanban', 'blocked', 'danger'],
      ['comment', 'See the table.', 'neutral'],
    ]);
    // The answer has the form the screen reads.
    expect(GenericWorkflows.safeParse({ workflows: reader.genericWorkflows() }).success).toBe(true);
  });

  it('une fiche refusée par le socle donne sa raison, et les éléments restent', async () => {
    const state = trialState();
    state.sheets['trial'] = { invalid: 'duplicate-station: "write" twice' };
    const { reader } = await start(state);

    const [trial] = reader.genericWorkflows();
    expect(trial?.sheetError).toBe('duplicate-station: "write" twice');
    expect(trial?.items.map((item) => item.id)).toEqual(['t_trial1']);
  });

  it('les données déclarées d’un élément et d’un run passent par le serveur telles que le socle les publie', async () => {
    const { reader } = await start(trialState());
    h = harness({ generic: reader });
    const get = async (path: string) =>
      h!.app.request(path, { headers: { host: 'localhost:8446' } });

    const listed = await get('/api/core-workflows');
    expect(listed.status).toBe(200);
    const workflows = GenericWorkflows.parse(await listed.json()).workflows;
    expect(workflows.map((workflow) => workflow.name)).toEqual(['trial']);

    const item = DeclaredDataList.parse(
      await (await get('/api/core-workflows/trial/data?subject=card&id=t_trial1')).json(),
    );
    expect(item.data).toEqual(trialState().data?.['trial']?.['card:t_trial1']);
    const run = DeclaredDataList.parse(
      await (await get('/api/core-workflows/trial/data?subject=run&id=7')).json(),
    );
    expect(run.data[0]?.values[0]).toEqual({ type: 'text', label: 'Log', text: 'ok' });

    // An unknown workflow, the code line, or a subject the screen does not ask: refused.
    expect((await get('/api/core-workflows/nope/data?subject=card&id=x')).status).toBe(404);
    expect((await get('/api/core-workflows/factory/data?subject=card&id=x')).status).toBe(404);
    expect((await get('/api/core-workflows/trial/data?subject=pr&id=x')).status).toBe(400);
  });
});
