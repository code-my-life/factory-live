import { msg } from '@factory-live/contracts';
import type { Snapshot } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { buildHealth } from './health.ts';
import type { HealthSignals } from './health.ts';
import { Hub } from './hub.ts';
import type {
  CoreCheckState,
  CoreMachineState,
  HistoryPort,
  LoggerPort,
  ProfilesPort,
} from './ports.ts';
import { KEEP_FINISHED_MS } from './projection.ts';

const NOW = Date.parse('2026-10-28T18:00:00Z');

function signals(patch: Partial<HealthSignals> = {}): HealthSignals {
  return {
    now: NOW,
    probe: null,
    lastTickAt: null,
    lastHookAt: null,
    hooksPerMinute: 0,
    kanban: { state: 'pending', cards: 0, error: null, readAt: null },
    sessions: { error: null },
    github: {
      configured: false,
      ok: false,
      detail: msg('health.github.noToken'),
      remaining: null,
      limit: null,
      checkedAt: null,
    },
    webhookDeliveries: null,
    providers: new Map(),
    claudeLastSessionAt: null,
    guards: null,
    running: 1,
    maxInProgress: 2,
    maxInProgressPerProfile: 1,
    ...patch,
  };
}

const service = (health: ReturnType<typeof buildHealth> | Snapshot, id: string) =>
  health.health.find((item) => item.id === id);

describe('buildHealth', () => {
  it('écrit ce que factory-live observe lui-même en codes, sans une phrase de français', () => {
    const health = buildHealth(
      signals({
        lastTickAt: NOW - 12_000,
        lastHookAt: NOW - 240_000,
        hooksPerMinute: 46,
        kanban: { state: 'read', cards: 12, error: null, readAt: NOW - 300 },
        providers: new Map([
          ['nvidia', { lastOkAt: NOW - 31_000, lastErrorAt: null, rateLimited10m: 0 }],
          ['mistral', { lastOkAt: null, lastErrorAt: null, rateLimited10m: 2 }],
        ]),
      }),
    );
    expect(service(health, 'gateway')).toMatchObject({
      label: msg('health.gateway'),
      status: 'unknown',
      detail: msg('health.gateway.never'),
    });
    expect(service(health, 'dispatcher')).toMatchObject({
      label: msg('health.dispatcher'),
      detail: msg('health.dispatcher.lastTick', { seconds: 12 }),
      metrics: [
        {
          label: msg('health.metric.running'),
          value: msg('health.value.ofTotal', { value: 1, total: 2 }),
        },
        { label: msg('health.metric.perAgent'), value: msg('health.value.atMost', { max: 1 }) },
      ],
    });
    expect(service(health, 'webhook')).toMatchObject({
      label: msg('health.webhook'),
      detail: msg('health.notReported'),
    });
    expect(service(health, 'provider:nvidia')).toMatchObject({
      label: msg('health.nvidia'),
      detail: msg('health.provider.lastOk', { seconds: 31 }),
      metrics: [{ label: msg('health.metric.rateLimited'), value: '0' }],
    });
    expect(service(health, 'provider:mistral')).toMatchObject({
      label: msg('health.provider', { provider: 'mistral' }),
      detail: msg('health.provider.none'),
    });
    expect(service(health, 'probe')?.detail).toEqual(msg('health.probe.none'));
    expect(service(health, 'sources')).toMatchObject({
      label: msg('health.sources'),
      status: 'ok',
      detail: msg('health.sources.detail', {
        kanban: 'read',
        cards: 12,
        kanbanError: null,
        sessionsError: null,
      }),
      metrics: [
        { label: msg('health.metric.hooksPerMinute'), value: '46' },
        { label: msg('health.metric.lastHook'), value: msg('health.value.ago', { seconds: 240 }) },
      ],
    });
  });

  it('garde tels quels les libellés, détails et mesures envoyés par la sonde', () => {
    const report = {
      v: 1 as const,
      probe: 'factory-live-probe' as const,
      at: new Date(NOW).toISOString(),
      gatewayPid: 4242,
      checks: [
        {
          id: 'freellmapi',
          label: 'freellmapi',
          status: 'ok' as const,
          detail: 'Routeur joignable, 14 modèles',
          metrics: { Modèles: '14' },
        },
      ],
    };
    const health = buildHealth(signals({ probe: { report, receivedAt: NOW - 9_000 } }));
    expect(service(health, 'freellmapi')).toMatchObject({
      label: 'freellmapi',
      detail: 'Routeur joignable, 14 modèles',
      metrics: [{ label: 'Modèles', value: '14' }],
    });
    expect(service(health, 'gateway')).toMatchObject({
      status: 'ok',
      detail: msg('health.gateway.running', { seconds: 9 }),
      metrics: [{ label: 'PID', value: '4242' }],
    });
  });

  it('dit pourquoi les sources de factory-live sont en panne', () => {
    const health = buildHealth(
      signals({
        kanban: { state: 'failed', cards: 0, error: 'database is locked', readAt: null },
        sessions: { error: 'state.db illisible' },
      }),
    );
    expect(service(health, 'sources')).toMatchObject({
      status: 'down',
      detail: msg('health.sources.detail', {
        kanban: 'failed',
        cards: 0,
        kanbanError: 'database is locked',
        sessionsError: 'state.db illisible',
      }),
    });
  });

  it('montre les gardes qui peuvent dépasser le délai de leur hook, ou qu’aucune ne le peut', () => {
    const risky = buildHealth(
      signals({
        guards: {
          checkedAt: NOW - 2_000,
          risks: [
            {
              plugin: 'coder-guard',
              profiles: ['coder', 'coder-claude', 'coder-opencode', 'scribe'],
              longest: 900,
              limit: 420,
            },
            { plugin: 'merge-guard', profiles: ['release'], longest: 30, limit: 30 },
          ],
        },
      }),
    );
    expect(service(risky, 'guards')).toEqual({
      id: 'guards',
      label: msg('health.guards'),
      group: 'hermes',
      status: 'degraded',
      detail: msg('health.guards.risk', { count: 2 }),
      checkedAt: new Date(NOW - 2_000).toISOString(),
      metrics: [
        {
          label: msg('health.guards.riskItem', {
            profile: 'coder, coder-claude, coder-opencode, scribe',
            plugin: 'coder-guard',
          }),
          value: msg('health.guards.limits', { longest: 900, limit: 420 }),
        },
        {
          label: msg('health.guards.riskItem', { profile: 'release', plugin: 'merge-guard' }),
          value: msg('health.guards.limits', { longest: 30, limit: 30 }),
        },
      ],
    });
    const calm = buildHealth(signals({ guards: { checkedAt: NOW, risks: [] } }));
    expect(service(calm, 'guards')).toMatchObject({
      status: 'ok',
      detail: msg('health.guards.ok'),
      metrics: [],
    });
    expect(service(buildHealth(signals()), 'guards')).toBeUndefined();
  });
});

// --- On the core's side (#62): the health follows workflow-core --------------------------------------

const CORE_NOW = Date.parse('2026-11-12T10:00:00Z');
const check = (patch: Partial<CoreCheckState> & { id: string }): CoreCheckState => ({
  label: patch.id,
  group: 'hermes',
  status: 'ok',
  detail: '',
  metrics: {},
  checkedAt: CORE_NOW - 5_000,
  ...patch,
});
/** The machine as the core publishes it, in the units the reader gives the hub. */
const MACHINE: CoreMachineState = {
  runtimeVersion: '0.22.2',
  contract: { ok: true, problems: [] },
  mode: 'normal',
  boards: [{ board: 'factory', lastReadAt: CORE_NOW - 10_000 }],
  checks: [
    check({
      id: 'gateway',
      label: 'Gateway',
      status: 'down',
      detail: 'Dernier battement il y a 240 s',
      metrics: { pid: '4242' },
    }),
    check({
      id: 'pause',
      label: 'Pause',
      status: 'degraded',
      detail: 'Factory en pause : maintenance',
    }),
    check({ id: 'freellmapi', label: 'freellmapi', group: 'models', detail: 'Répond (401)' }),
  ],
};

/** A hub on workflow-core's side, its other ports answering « nothing ». */
function coreHub(): Hub {
  const silent: LoggerPort = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  const profiles: ProfilesPort = {
    profiles: () => [],
    live: () => null,
    repo: () => null,
    manifest: () => ({ owner: null, projects: {}, profiles: {} }),
    root: () => ({ maxInProgress: 0, maxInProgressPerProfile: 0 }),
    facts: () => null,
    factsStamp: () => '',
  };
  const store: Partial<HistoryPort> = {
    board: () => ({ tasks: [], runs: [], links: [], events: [], comments: [] }),
    stations: () => new Map(),
    recentActivity: () => [],
    saveStation: () => {},
    appendActivity: () => {},
    openUnblocks: () => [],
    unblock: () => null,
  };
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
      store: store as HistoryPort,
      profiles,
      github: null,
      diagnoses: null,
      log: silent,
      now: () => CORE_NOW,
      source: 'workflow-core',
    },
  );
}

describe('buildHealth, côté socle', () => {
  it('côté socle, un socle arrêté donne la tuile socle injoignable et une intervention', () => {
    const hub = coreHub();
    hub.applyCoreMachine(MACHINE);
    expect(service(hub.snapshot(), 'core')?.status).toBe('ok');
    expect(hub.snapshot().interventions.some((item) => item.kind === 'service_down')).toBe(false);

    // The first reconnection that fails, as the reader reports it, 20 seconds ago.
    hub.coreFailed('fetch failed: connect ECONNREFUSED', CORE_NOW - 20_000);
    const snapshot = hub.snapshot();
    expect(service(snapshot, 'core')).toMatchObject({
      label: msg('health.core'),
      group: 'factory-live',
      status: 'down',
      detail: msg('health.core.unreachable', { seconds: 20 }),
    });
    const down = snapshot.interventions.filter((item) => item.kind === 'service_down');
    expect(down).toHaveLength(1);
    expect(down[0]).toMatchObject({
      title: msg('health.core.unreachableTitle'),
      question: msg('health.core.unreachable', { seconds: 20 }),
      openedAt: new Date(CORE_NOW - 20_000).toISOString(),
    });
    // Further failures keep the outage's start.
    hub.coreFailed('fetch failed: connect ECONNREFUSED', CORE_NOW - 5_000);
    expect(service(hub.snapshot(), 'core')?.detail).toEqual(
      msg('health.core.unreachable', { seconds: 20 }),
    );

    // The core answers again: the tile is back and the intervention closes, without a restart.
    hub.coreAnswered();
    const back = hub.snapshot();
    expect(service(back, 'core')?.status).toBe('ok');
    expect(back.interventions.some((item) => item.kind === 'service_down')).toBe(false);
  });

  it('côté socle, la tuile montre l’état de la machine publié par le socle', () => {
    const at = Date.parse('2026-11-12T10:00:00Z');
    const core = (patch: Partial<CoreMachineState>): NonNullable<HealthSignals['core']> => ({
      unreachableSince: null,
      error: null,
      machine: {
        runtimeVersion: '0.22.2',
        contract: { ok: true, problems: [] },
        mode: 'normal',
        boards: [{ board: 'factory', lastReadAt: at - 10_000 }],
        checks: [],
        ...patch,
      },
    });

    const normal = buildHealth(signals({ now: at, core: core({}) }));
    expect(service(normal, 'core')).toMatchObject({
      status: 'ok',
      detail: msg('health.core.ok'),
      metrics: [
        { label: msg('health.metric.coreVersion'), value: '0.22.2' },
        { label: msg('health.metric.contract'), value: msg('health.core.contract.ok') },
        { label: msg('health.metric.mode'), value: 'normal' },
        {
          label: msg('health.metric.boardRead', { board: 'factory' }),
          value: msg('health.value.ago', { seconds: 10 }),
        },
      ],
    });
    // On the core's side the core's tile replaces the sources' one, and the probe's tile is not shown.
    expect(service(normal, 'sources')).toBeUndefined();
    expect(service(normal, 'probe')).toBeUndefined();

    const broken = buildHealth(
      signals({
        now: at,
        core: core({
          mode: 'observer',
          contract: { ok: false, problems: ['factory: tasks.idempotency_key absente', 'autre'] },
        }),
      }),
    );
    expect(service(broken, 'core')).toMatchObject({
      status: 'degraded',
      detail: msg('health.core.observer', { problem: 'factory: tasks.idempotency_key absente' }),
    });
    expect(service(broken, 'core')?.metrics).toEqual(
      expect.arrayContaining([
        {
          label: msg('health.metric.contract'),
          value: msg('health.core.contract.broken', {
            problem: 'factory: tasks.idempotency_key absente',
          }),
        },
        { label: msg('health.metric.mode'), value: 'observer' },
      ]),
    );
  });

  it('côté socle, les tuiles de la sonde viennent des contrôles publiés par le socle', () => {
    const hub = coreHub();
    hub.applyCoreMachine(MACHINE);
    const snapshot = hub.snapshot();

    expect(service(snapshot, 'gateway')).toMatchObject({
      label: msg('health.gateway'),
      group: 'hermes',
      status: 'down',
      detail: 'Dernier battement il y a 240 s',
      metrics: [{ label: 'PID', value: '4242' }],
    });
    expect(service(snapshot, 'pause')).toMatchObject({
      group: 'hermes',
      status: 'degraded',
      detail: 'Factory en pause : maintenance',
    });
    expect(service(snapshot, 'freellmapi')).toMatchObject({
      group: 'models',
      status: 'ok',
      detail: 'Répond (401)',
    });
    // The webhook listener keeps the catalogue's label; a check the core does not publish is not reported.
    expect(service(snapshot, 'webhook')).toMatchObject({
      label: msg('health.webhook'),
      status: 'unknown',
    });
    expect(service(snapshot, 'probe')).toBeUndefined();
    expect(snapshot.factory).toMatchObject({ paused: true, pauseReason: 'maintenance' });

    // A machine event updates the tiles without waiting for the next read.
    hub.applyCoreChecks([
      { ...MACHINE.checks[0]!, status: 'ok', detail: 'Battement il y a 4 s' },
      ...MACHINE.checks.slice(1),
    ]);
    expect(service(hub.snapshot(), 'gateway')).toMatchObject({
      status: 'ok',
      detail: 'Battement il y a 4 s',
    });
  });
});
