import { readFileSync } from 'node:fs';
import { HermesHookBody } from '@factory-live/contracts';
import { profileStation } from '@factory-live/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { toHookEvent } from '../../ingest/hermes.ts';
import { fakeCore } from '../../test/fake-core.ts';
import type { FakeCore, FakeCoreState } from '../../test/fake-core.ts';
import { NOW_S, SECRET, coreSide, coreState, newHub, until } from '../../test/core-scenario.ts';
import type { Side } from '../../test/core-scenario.ts';
import { tempDir } from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';
import { coreActivityFact } from './live.ts';

/** The agents of the factory as workflow-core publishes them (#129), captured on the machine. */
const AGENTS = JSON.parse(
  readFileSync(
    new URL('../../../../../fixtures/workflow-core/agents-factory.json', import.meta.url),
    'utf8',
  ),
) as {
  kanban: unknown;
  agents: { name: string; model: { name: string; provider: string } | null }[];
};

/** The coder, on the card of cv-site#50, running `npm test`, as workflow-core announces it (#34). */
const CODER = {
  agent: 'coder',
  item: 't_c0de0050',
  run: 3,
  state: 'tool',
  action: {
    kind: 'tool',
    label: 'terminal',
    detail: 'npm test',
    started_at: '2026-11-12T09:59:50.000Z',
  },
  model: { name: 'agnes-2.5-flash', provider: 'freellmapi', source: 'live' },
  lane_model: null,
  heartbeat_at: '2026-11-12T09:59:30.000Z',
};

const event = (cursor: number, kind: string, state: unknown) => ({
  cursor: `1762900000:${cursor}`,
  workflow: 'factory',
  item: (state as { item?: string } | null)?.item ?? null,
  kind,
  at: '2026-11-12T10:00:00.000Z',
  state,
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

describe('direct de la ligne du code par le socle (workflow-core, #66)', () => {
  it('côté socle, l’état d’un agent annoncé par le socle est son activité à l’écran', async () => {
    const { hub } = await start(coreState());
    expect(hub.snapshot().agents).toEqual([]);

    const sent = performance.now();
    core!.send(event(6, 'live', CODER));
    await until(() => hub.snapshot().agents.length > 0, 2_000);
    const elapsed = performance.now() - sent;

    expect(hub.snapshot().agents).toEqual([
      {
        profile: 'coder',
        station: profileStation('coder'),
        state: 'tool',
        cardId: 't_c0de0050',
        issueKey: hub.issueKeyOfCard('t_c0de0050'),
        model: { model: 'agnes-2.5-flash', provider: 'freellmapi', source: 'live' },
        laneModel: null,
        action: {
          kind: 'tool',
          label: 'terminal',
          detail: 'npm test',
          startedAt: '2026-11-12T09:59:50.000Z',
        },
        runStartedAt: new Date((NOW_S - 2_900) * 1000).toISOString(),
        lastHeartbeatAt: '2026-11-12T09:59:30.000Z',
      },
    ]);
    expect(hub.issueKeyOfCard('t_c0de0050')).not.toBeNull();
    expect(elapsed).toBeLessThan(1_000);
  });

  it('un modèle de source session garde sa source', async () => {
    const state = coreState();
    // Read at the full read: the session notes `auto`, the served model is not on disk.
    state.live = {
      factory: [
        {
          ...CODER,
          state: 'thinking',
          action: null,
          model: { name: 'auto', provider: 'freellmapi', source: 'session' },
        },
      ],
    };
    const { hub } = await start(state);

    const [coder] = hub.snapshot().agents;
    expect(coder?.state).toBe('thinking');
    expect(coder?.model).toEqual({ model: 'auto', provider: 'freellmapi', source: 'session' });
  });

  it('un fait d’activité du socle entre dans le fil', async () => {
    const state = coreState();
    state.activity = {
      factory: [
        {
          id: 'f1',
          at: '2026-11-12T09:59:00.000Z',
          kind: 'tool',
          agent: 'coder',
          item: 't_c0de0050',
          text: 'terminal',
          status: 'ok',
        },
      ],
    };
    const { hub } = await start(state);
    core!.send(
      event(6, 'activity', {
        id: 'f2',
        at: '2026-11-12T09:59:55.000Z',
        kind: 'guard',
        agent: 'coder',
        item: 't_c0de0050',
        text: 'coder-guard : git push refusé',
        status: 'blocked',
      }),
    );
    await until(() => hub.snapshot().activity.length === 2, 2_000);

    const activity = hub.snapshot().activity;
    expect(activity.map((line) => [line.kind, line.label, line.status])).toEqual([
      ['tool', 'terminal', 'ok'],
      ['guard', 'coder-guard : git push refusé', 'blocked'],
    ]);
    expect(activity[1]).toMatchObject({
      profile: 'coder',
      cardId: 't_c0de0050',
      issueKey: hub.issueKeyOfCard('t_c0de0050'),
      at: '2026-11-12T09:59:55.000Z',
    });

    // A full read after a reset sends the same facts again: they do not enter the feed twice.
    core!.send({ ...event(7, 'reset', null), workflow: null, item: null });
    await until(
      () => core!.requests.filter((request) => request.path === '/api/workflows').length > 1,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(hub.snapshot().activity).toHaveLength(2);
  });

  it('un fait d’activité sans carte entre aussi dans le fil', async () => {
    const { hub } = await start(coreState());
    core!.send({
      ...event(6, 'activity', {
        id: 'f9',
        at: '2026-11-12T09:59:58.000Z',
        kind: 'system',
        agent: null,
        item: null,
        text: 'tick du dispatcher',
        status: 'ok',
      }),
      item: null,
    });
    await until(() => hub.snapshot().activity.length === 1, 2_000);
    expect(hub.snapshot().activity[0]).toMatchObject({
      kind: 'system',
      cardId: null,
      issueKey: null,
    });
  });

  it('après un redémarrage, le fil ne reprend pas deux fois les faits gardés', async () => {
    const state = coreState();
    const fact = {
      id: 'f1',
      at: '2026-11-12T09:59:00.000Z',
      kind: 'tool',
      agent: 'coder',
      item: 't_c0de0050',
      text: 'terminal',
      status: 'ok',
    };
    state.activity = { factory: [fact] };
    const first = await start(state);
    expect(first.hub.snapshot().activity).toHaveLength(1);
    await first.reader.stop();

    // A new server on the same base: the feed comes back from it, then the core serves the same fact.
    const again = newHub(dir, 'core-data', 'workflow-core');
    again.addCoreActivity([coreActivityFact(fact as Parameters<typeof coreActivityFact>[0])]);
    expect(again.snapshot().activity.map((line) => line.id)).toEqual(['core-f1']);
  });

  it('côté socle, les agents au repos restent sur la ligne', async () => {
    const state = coreState();
    state.agents = { factory: AGENTS };
    const { hub } = await start(state);
    await until(() => hub.snapshot().agents.length === AGENTS.agents.length, 2_000);

    const agents = hub.snapshot().agents;
    // One line per agent the core publishes, as the Hermes reading gives one per profile.
    expect(agents.map((agent) => agent.profile).sort()).toEqual(
      AGENTS.agents.map((agent) => agent.name).sort(),
    );
    for (const agent of agents) expect(agent.station).toBe(profileStation(agent.profile));
    // At rest, an agent shows its configured model (a card in progress may override it, as on Hermes' side).
    for (const agent of agents.filter((item) => item.cardId === null)) {
      const published = AGENTS.agents.find((item) => item.name === agent.profile)!;
      expect(agent.model).toEqual(
        published.model
          ? { model: published.model.name, provider: published.model.provider, source: 'config' }
          : null,
      );
    }
    // Without the live state, an agent is at rest unless the board gives it a card in progress.
    const resting = agents.filter((agent) => agent.cardId === null);
    expect(resting.length).toBeGreaterThan(0);
    expect(resting.every((agent) => agent.state === 'idle')).toBe(true);
  });

  it('côté socle, un agent au travail remplace sa ligne au repos', async () => {
    const state = coreState();
    state.agents = { factory: AGENTS };
    const { hub } = await start(state);
    await until(() => hub.snapshot().agents.length === AGENTS.agents.length, 2_000);

    core!.send(event(6, 'live', CODER));
    await until(() => hub.snapshot().agents.some((agent) => agent.state === 'tool'), 2_000);

    const agents = hub.snapshot().agents;
    expect(agents).toHaveLength(AGENTS.agents.length);
    const coders = agents.filter((agent) => agent.profile === 'coder');
    expect(coders).toHaveLength(1);
    expect(coders[0]).toMatchObject({
      state: 'tool',
      cardId: 't_c0de0050',
      model: { model: 'agnes-2.5-flash', provider: 'freellmapi', source: 'live' },
      action: { kind: 'tool', label: 'terminal', detail: 'npm test' },
    });
    expect(
      agents.filter((agent) => agent.profile !== 'coder').every((agent) => agent.state !== 'tool'),
    ).toBe(true);
  });

  it('côté socle, un webhook d’Hermès ne change pas l’instantané', async () => {
    const state = coreState();
    state.live = { factory: [CODER] };
    const { hub } = await start(state);
    const before = hub.snapshot();

    const samples = JSON.parse(
      readFileSync(
        new URL('../../../../../fixtures/hermes-webhooks/outbound-sample.json', import.meta.url),
        'utf8',
      ),
    ) as { body: unknown }[];
    for (const sample of samples) hub.applyHook(toHookEvent(HermesHookBody.parse(sample.body)));

    const after = hub.snapshot();
    expect(after.agents).toEqual(before.agents);
    expect(after.activity).toEqual(before.activity);
    expect(after.health).toEqual(before.health);
  });
});
