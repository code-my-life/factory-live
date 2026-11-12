import { readFileSync } from 'node:fs';
import { msg } from '@factory-live/contracts';
import type { Diagnosis, Intervention } from '@factory-live/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeCore } from '../../test/fake-core.ts';
import type { FakeCore, FakeCoreState } from '../../test/fake-core.ts';
import {
  CORE_ITEMS,
  NOW_S,
  SECRET,
  card,
  coreSide,
  coreState,
  until,
} from '../../test/core-scenario.ts';
import type { Side } from '../../test/core-scenario.ts';
import { tempDir } from '../../test/hermes-fixtures.ts';
import type { CoreIntervention } from '@factory-live/contracts/workflow-core';
import { coreInterventionState } from './interventions.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';

/** A real diagnosis, as factory-live computed it on an incident (a question of the agent). */
const DIAGNOSIS = (
  JSON.parse(
    readFileSync(
      new URL('../../../../../fixtures/diagnosis-references/question.json', import.meta.url),
      'utf8',
    ),
  ) as { output: Diagnosis }
).output;

const ID = 'needs_input:t_1a9f0049:1';
const QUESTION = 'Quelle base de données ?\nPostgreSQL ou SQLite ?';

/** The core's intervention for the blocked card of cv-site#49, as workflow-core#37 publishes it. */
const NEEDS_INPUT = {
  id: ID,
  kind: 'needs_input',
  item: 't_1a9f0049',
  event: 1,
  opened_at: new Date((NOW_S - 600) * 1000).toISOString(),
  agent: 'coder',
  severity: 'critical',
  push: true,
  title: { code: 'intervention.title.needsInput', params: {} },
  question: { quote: QUESTION },
  actions: [
    { kind: 'gesture', gesture: 'unblock' },
    {
      kind: 'copy',
      label: { code: 'intervention.action.showCard', params: {} },
      command: 'hermes kanban --board factory show t_1a9f0049',
    },
  ],
};

const diagnosisOf = (diagnosis: unknown) => ({
  item: 't_1a9f0049',
  trigger: {
    id: ID,
    kind: 'needs_input',
    event: 1,
    opened_at: NEEDS_INPUT.opened_at,
    agent: 'coder',
  },
  diagnosis,
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

async function start(state: FakeCoreState): Promise<Side> {
  dir = tempDir();
  core = await fakeCore(SECRET, state);
  side = coreSide(dir, core);
  side.reader.start();
  await until(() => side!.boards.length > 0 && core!.openStreams() === 1);
  return side;
}

const interventionOf = (side: Side, id: string): Intervention | undefined =>
  side.hub.snapshot().interventions.find((item) => item.id === id);

describe('interventions lues par le socle (workflow-core, #59)', () => {
  it('côté socle, une intervention annoncée s’affiche avec ses textes, ses actions et son diagnostic', async () => {
    const state = coreState();
    state.interventions = {};
    state.diagnoses = { factory: [diagnosisOf(DIAGNOSIS)] };
    const side = await start(state);
    expect(side.hub.snapshot().interventions).toEqual([]);

    core!.send({
      cursor: '1762900000:6',
      workflow: 'factory',
      item: 't_1a9f0049',
      kind: 'intervention_opened',
      at: '2026-11-12T10:00:00.000Z',
      state: NEEDS_INPUT,
    });
    await until(() => interventionOf(side, ID)?.diagnosis !== null && !!interventionOf(side, ID));

    expect(interventionOf(side, ID)).toEqual({
      id: ID,
      kind: 'needs_input',
      severity: 'critical',
      // The screen writes a code as its sentence of the catalogue (« Une décision est attendue »), a quote as is.
      title: msg('intervention.title.needsInput'),
      issueKey: 'cv-site#49',
      cardId: 't_1a9f0049',
      profile: 'coder',
      question: QUESTION,
      openedAt: NEEDS_INPUT.opened_at,
      push: true,
      actions: [
        { kind: 'unblock' },
        {
          kind: 'copy',
          label: msg('intervention.action.showCard'),
          command: 'hermes kanban --board factory show t_1a9f0049',
        },
        // factory-live adds the link of the card's issue, as today.
        {
          kind: 'link',
          label: msg('intervention.action.openIssue', { issueKey: 'cv-site#49' }),
          url: 'https://github.com/code-my-life/cv-site/issues/49',
        },
      ],
      unblock: null,
      diagnosis: DIAGNOSIS,
      resolvedAt: null,
      followUp: null,
    });
  });

  it('une fermeture annoncée retire l’intervention, sauf un déblocage récent', async () => {
    const state = coreState();
    // An intervention on a card that has not started again (here, gone from the board): closed, it goes.
    const other = {
      ...NEEDS_INPUT,
      id: 'capability:t_0ld00001:9',
      kind: 'capability',
      item: 't_0ld00001',
    };
    state.interventions = { factory: [NEEDS_INPUT, other] };
    const side = await start(state);
    expect(
      side.hub
        .snapshot()
        .interventions.map((item) => item.id)
        .sort(),
    ).toEqual([ID, other.id].sort());

    // The card of cv-site#49 is unblocked and runs again: its intervention stays visible, resolved.
    const restarted = {
      ...structuredClone(CORE_ITEMS[1]!),
      status: 'running',
      block_kind: null,
      runs: [
        ...(CORE_ITEMS[1]!['runs'] as unknown[]),
        {
          id: 9,
          profile: 'coder',
          status: 'running',
          outcome: null,
          started_at: NOW_S - 10,
          ended_at: null,
          summary: null,
          metadata: {},
        },
      ],
    };
    core!.send({
      cursor: '1762900000:6',
      workflow: 'factory',
      item: 't_1a9f0049',
      kind: 'changed',
      at: '2026-11-12T10:00:00.000Z',
      state: restarted,
    });
    await until(
      () => side.hub.boardData.tasks.find((task) => task.id === 't_1a9f0049')?.status === 'running',
    );
    for (const [n, id] of [
      [7, ID],
      [8, other.id],
    ] as const)
      core!.send({
        cursor: `1762900000:${n}`,
        workflow: 'factory',
        item: null,
        kind: 'intervention_closed',
        at: '2026-11-12T10:00:01.000Z',
        state: { id },
      });
    await until(() => !interventionOf(side, other.id));

    expect(interventionOf(side, ID)?.resolvedAt).not.toBeNull();
    expect(interventionOf(side, other.id)).toBeUndefined();
  });

  it('côté socle, le diagnostic n’est pas calculé et un diagnostic invalide est écarté', async () => {
    const state = coreState();
    state.interventions = { factory: [NEEDS_INPUT] };
    // A diagnosis without its primary finding: refused by the schema drawn from the core's JSON Schema.
    const { primary: _primary, ...broken } = DIAGNOSIS;
    state.diagnoses = { factory: [diagnosisOf(broken)] };
    const side = await start(state);
    await until(() => core!.requests.some((request) => request.path.endsWith('/diagnoses')));
    await new Promise((resolve) => setTimeout(resolve, 100));

    const shown = interventionOf(side, ID);
    expect(shown?.kind).toBe('needs_input');
    expect(shown?.diagnosis).toBeNull();
    expect(side.failures).toEqual([]);
    // The core's side has no diagnosis service of its own (main.ts passes none): nothing to compute here.
    expect(side.hub.diagnosisOf(ID)).toBeNull();
  });

  it('côté socle, la PR à approuver et la CI de main rouge sont calculées depuis les événements servis par le socle', async () => {
    const state = coreState();
    const release = (id: string, reason: string, blockKind: string, pr: string) =>
      card({
        id,
        title: `release cv-site#${id === 't_re1e0060' ? 60 : 61} : Livraison`,
        status: 'blocked',
        assignee: 'release',
        created_at: NOW_S - 900,
        block_kind: blockKind,
        runs: [
          {
            id: id === 't_re1e0060' ? 60 : 61,
            profile: 'release',
            status: 'done',
            outcome: 'blocked',
            started_at: NOW_S - 800,
            ended_at: NOW_S - 700,
            summary: null,
            metadata: { pr_url: pr },
          },
        ],
        events: [
          {
            id: id === 't_re1e0060' ? 60 : 61,
            run_id: null,
            kind: 'blocked',
            payload: { reason },
            created_at: NOW_S - 700,
          },
        ],
      });
    state.interventions = {};
    state.items['factory'] = [
      ...structuredClone(CORE_ITEMS),
      release(
        't_re1e0060',
        'PR prête : approuve-la',
        'needs_input',
        'https://github.com/code-my-life/cv-site/pull/62',
      ),
      release(
        't_re1e0061',
        'CI de main rouge sur cv-site',
        'transient',
        'https://github.com/code-my-life/cv-site/pull/63',
      ),
    ];
    const side = await start(state);
    await until(() => side.hub.snapshot().interventions.length === 2);

    const approval = interventionOf(side, 'pr_approval:t_re1e0060:60');
    expect(approval).toMatchObject({
      kind: 'pr_approval',
      push: false,
      actions: [
        {
          kind: 'link',
          label: msg('intervention.action.approvePr'),
          url: 'https://github.com/code-my-life/cv-site/pull/62',
        },
      ],
    });
    expect(interventionOf(side, 'main_red:t_re1e0061:61')).toMatchObject({
      kind: 'main_red',
      push: false,
    });
  });

  it('un workflow de la ligne du code retiré du socle retire ses interventions', async () => {
    const side = await start(coreState());
    await until(() => !!interventionOf(side, 'needs_input:t_1a9f0049:1'));

    core!.state.workflows = core!.state.workflows.filter((workflow) => workflow.key !== 'factory');
    core!.send({
      cursor: '1762999999:1',
      workflow: null,
      item: null,
      kind: 'reset',
      at: '2026-11-12T10:05:00.000Z',
      state: null,
    });
    await until(() => side.hub.boardData.tasks.length === 0);
    expect(side.hub.snapshot().interventions).toEqual([]);
  });

  it('un texte en code sans paramètres reste une phrase du catalogue', () => {
    const { params: _params, ...bare } = NEEDS_INPUT.title;
    const state = coreInterventionState({ ...NEEDS_INPUT, title: bare } as CoreIntervention);
    expect(state.title).toEqual(msg('intervention.title.needsInput'));
  });

  it('une lecture lente des verdicts ne retarde pas le flux', async () => {
    const state = coreState();
    const side = await start(state);
    // The run-verdicts route answers after 2 s, as a core busy computing them would.
    core!.delay = (path) => (path.endsWith('/run-verdicts') ? 2_000 : 0);
    const failed: Record<string, unknown> = { ...structuredClone(CORE_ITEMS[0]!), status: 'done' };
    (failed['runs'] as { outcome: string }[])[0]!.outcome = 'crashed';
    core!.send({
      cursor: '1762900000:6',
      workflow: 'factory',
      item: 't_b1ef0049',
      kind: 'changed',
      at: '2026-11-12T10:00:00.000Z',
      state: failed,
    });
    const sent = performance.now();
    core!.send({
      cursor: '1762900000:7',
      workflow: 'factory',
      item: null,
      kind: 'intervention_closed',
      at: '2026-11-12T10:00:01.000Z',
      state: { id: 'needs_input:t_1a9f0049:1' },
    });
    await until(() => !interventionOf(side, 'needs_input:t_1a9f0049:1'), 2_000);
    expect(performance.now() - sent).toBeLessThan(1_000);
  });

  it('deux lectures des verdicts d’une même carte ne se croisent pas', async () => {
    const side = await start(coreState());
    // Each read of the card's verdicts takes 300 ms; when they arrive is noted.
    const arrivals: number[] = [];
    core!.delay = (path) => {
      if (!path.endsWith('/t_b1ef0049/run-verdicts')) return 0;
      arrivals.push(performance.now());
      return 300;
    };
    core!.state.verdicts = { t_b1ef0049: [] };
    const failed: Record<string, unknown> = { ...structuredClone(CORE_ITEMS[0]!), status: 'done' };
    (failed['runs'] as { outcome: string }[])[0]!.outcome = 'crashed';
    for (const n of [6, 7, 8])
      core!.send({
        cursor: `1762900000:${n}`,
        workflow: 'factory',
        item: 't_b1ef0049',
        kind: 'changed',
        at: '2026-11-12T10:00:00.000Z',
        state: failed,
      });
    await until(() => arrivals.length >= 2, 2_000);
    await new Promise((resolve) => setTimeout(resolve, 400));

    // The changes asked while a read ran give one more read, after it: never two at once.
    expect(arrivals).toHaveLength(2);
    expect(arrivals[1]! - arrivals[0]!).toBeGreaterThanOrEqual(290);
    expect(side.failures).toEqual([]);
  });
});
