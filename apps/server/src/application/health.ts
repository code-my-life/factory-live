import { msg } from '@factory-live/contracts';
import type {
  FactoryState,
  HealthStatus,
  ProbeReport,
  ServiceHealth,
  Text,
} from '@factory-live/contracts';
import type { GuardRisk } from '@factory-live/domain';
import { iso } from './projection.ts';

/** Signaux passifs relevés par le hub, en millisecondes epoch. */
export interface HealthSignals {
  now: number;
  probe: { report: ProbeReport; receivedAt: number } | null;
  lastTickAt: number | null;
  lastHookAt: number | null;
  hooksPerMinute: number;
  /** Lecture de `kanban.db` : pas encore faite, faite (avec le nombre de cartes) ou en échec. */
  kanban: {
    state: 'pending' | 'read' | 'failed';
    cards: number;
    error: string | null;
    readAt: number | null;
  };
  /** Sessions d'Hermès, lues à la demande ; `error` : la dernière lecture a échoué. */
  sessions: { error: string | null };
  github: {
    configured: boolean;
    ok: boolean;
    detail: Text;
    remaining: number | null;
    limit: number | null;
    checkedAt: number | null;
  };
  webhookDeliveries: { at: number; status: number } | null;
  providers: ReadonlyMap<
    string,
    { lastOkAt: number | null; lastErrorAt: number | null; rateLimited10m: number }
  >;
  claudeLastSessionAt: number | null;
  /** Les gardes dont le code peut attendre au moins le délai de leur hook ; `null` : pas encore lues. */
  guards: { risks: readonly GuardRisk[]; checkedAt: number } | null;
  running: number;
  maxInProgress: number;
  maxInProgressPerProfile: number;
}

const PROBE_SILENT_MS = 90_000;
const DISPATCHER_SILENT_MS = 3 * 60_000;

/** Âge d'un fait en secondes ; le client l'écrit « il y a 9 s », « 9s ago »... */
function age(now: number, at: number): { seconds: number } {
  return { seconds: Math.max(0, Math.round((now - at) / 1000)) };
}

const GROUPS: Readonly<Record<string, ServiceHealth['group']>> = {
  pause: 'hermes',
  dashboard: 'hermes',
  disk: 'hermes',
  freellmapi: 'models',
  llamacpp: 'models',
  graphify: 'tools',
  webhook: 'intake',
  funnel: 'intake',
  cron: 'intake',
};

/** Libellés que factory-live donne lui-même à certains contrôles de la sonde. */
const LABELS: Readonly<Record<string, Text>> = { webhook: msg('health.webhook') };

/** Santé de la factory : rapport de la sonde, complété par ce que factory-live observe lui-même. */
export function buildHealth(signals: HealthSignals): {
  factory: FactoryState;
  health: ServiceHealth[];
} {
  const { now, probe } = signals;
  const probeFresh = probe !== null && now - probe.receivedAt < PROBE_SILENT_MS;
  const checks = new Map((probe?.report.checks ?? []).map((check) => [check.id, check]));
  const checkedAt = probe ? iso(probe.receivedAt) : null;
  const pause = checks.get('pause');
  const paused = probeFresh && pause?.status === 'degraded';
  const pauseReason = paused
    ? pause?.detail.replace(/^Factory en pause\s*:?\s*/, '') || null
    : null;
  const health: ServiceHealth[] = [];
  const push = (item: Omit<ServiceHealth, 'metrics'> & { metrics?: ServiceHealth['metrics'] }) =>
    health.push({ metrics: [], ...item });

  push({
    id: 'gateway',
    label: msg('health.gateway'),
    group: 'hermes',
    status: probeFresh ? 'ok' : probe ? 'down' : 'unknown',
    detail: probeFresh
      ? msg('health.gateway.running', age(now, probe.receivedAt))
      : probe
        ? msg('health.gateway.silent', age(now, probe.receivedAt))
        : msg('health.gateway.never'),
    checkedAt,
    metrics: probe ? [{ label: 'PID', value: String(probe.report.gatewayPid) }] : [],
  });

  const tickStatus: HealthStatus =
    signals.lastTickAt === null
      ? 'unknown'
      : paused
        ? 'ok'
        : now - signals.lastTickAt < DISPATCHER_SILENT_MS
          ? 'ok'
          : 'down';
  push({
    id: 'dispatcher',
    label: msg('health.dispatcher'),
    group: 'hermes',
    status: tickStatus,
    detail:
      signals.lastTickAt === null
        ? msg('health.dispatcher.noTick')
        : paused
          ? msg('health.dispatcher.paused', age(now, signals.lastTickAt))
          : msg('health.dispatcher.lastTick', age(now, signals.lastTickAt)),
    checkedAt: signals.lastTickAt === null ? null : iso(signals.lastTickAt),
    metrics: [
      {
        label: msg('health.metric.running'),
        value: msg('health.value.ofTotal', {
          value: signals.running,
          total: signals.maxInProgress,
        }),
      },
      {
        label: msg('health.metric.perAgent'),
        value: msg('health.value.atMost', { max: signals.maxInProgressPerProfile }),
      },
    ],
  });

  for (const [id, group] of Object.entries(GROUPS)) {
    const check = checks.get(id);
    if (!check) {
      push({
        id,
        label: LABELS[id] ?? id,
        group,
        status: 'unknown',
        detail: msg('health.notReported'),
        checkedAt: null,
      });
      continue;
    }
    const metrics: ServiceHealth['metrics'] = Object.entries(check.metrics).map(
      ([label, value]) => ({ label, value }),
    );
    if (id === 'llamacpp') {
      const vram = checks.get('vram');
      if (vram) metrics.push({ label: 'VRAM', value: vram.detail });
    }
    push({
      id,
      label: LABELS[id] ?? check.label,
      group,
      status: probeFresh ? check.status : 'unknown',
      detail: check.detail,
      checkedAt,
      metrics,
    });
  }

  for (const [provider, stats] of signals.providers) {
    if (provider === 'freellmapi' || provider === 'llamacpp') continue;
    const failing =
      stats.lastErrorAt !== null && (stats.lastOkAt === null || stats.lastErrorAt > stats.lastOkAt);
    push({
      id: `provider:${provider}`,
      label: provider === 'nvidia' ? msg('health.nvidia') : msg('health.provider', { provider }),
      group: 'models',
      status: failing ? 'degraded' : stats.lastOkAt !== null ? 'ok' : 'unknown',
      detail:
        stats.lastOkAt !== null
          ? msg('health.provider.lastOk', age(now, stats.lastOkAt))
          : msg('health.provider.none'),
      checkedAt: stats.lastOkAt === null ? null : iso(stats.lastOkAt),
      metrics: [{ label: msg('health.metric.rateLimited'), value: String(stats.rateLimited10m) }],
    });
  }
  const freellmapi = signals.providers.get('freellmapi');
  const freellmapiHealth = health.find((item) => item.id === 'freellmapi');
  if (freellmapi && freellmapiHealth)
    freellmapiHealth.metrics.push({
      label: msg('health.metric.rateLimited'),
      value: String(freellmapi.rateLimited10m),
    });

  push({
    id: 'claude',
    label: msg('health.claude'),
    group: 'models',
    status: signals.claudeLastSessionAt === null ? 'unknown' : 'ok',
    detail:
      signals.claudeLastSessionAt === null
        ? msg('health.claude.none')
        : msg('health.claude.lastSession', age(now, signals.claudeLastSessionAt)),
    checkedAt: signals.claudeLastSessionAt === null ? null : iso(signals.claudeLastSessionAt),
  });

  push({
    id: 'github',
    label: msg('health.github'),
    group: 'tools',
    status: !signals.github.configured ? 'unknown' : signals.github.ok ? 'ok' : 'down',
    detail: signals.github.detail,
    checkedAt: signals.github.checkedAt === null ? null : iso(signals.github.checkedAt),
    metrics:
      signals.github.remaining !== null
        ? [
            {
              label: msg('health.metric.quota'),
              value: msg('health.value.ofTotal', {
                value: signals.github.remaining,
                total: signals.github.limit,
              }),
            },
          ]
        : [],
  });

  if (signals.webhookDeliveries) {
    const delivery = signals.webhookDeliveries;
    push({
      id: 'github-deliveries',
      label: msg('health.githubDeliveries'),
      group: 'intake',
      status: delivery.status >= 200 && delivery.status < 300 ? 'ok' : 'degraded',
      detail: msg('health.githubDeliveries.last', {
        status: delivery.status,
        ...age(now, delivery.at),
      }),
      checkedAt: iso(delivery.at),
    });
  }

  if (signals.guards) {
    const { risks } = signals.guards;
    push({
      id: 'guards',
      label: msg('health.guards'),
      group: 'hermes',
      status: risks.length > 0 ? 'degraded' : 'ok',
      detail:
        risks.length > 0
          ? msg('health.guards.risk', { count: risks.length })
          : msg('health.guards.ok'),
      checkedAt: iso(signals.guards.checkedAt),
      metrics: risks.map((risk) => ({
        label: msg('health.guards.riskItem', {
          profile: risk.profiles.join(', '),
          plugin: risk.plugin,
        }),
        value: msg('health.guards.limits', { longest: risk.longest, limit: risk.limit }),
      })),
    });
  }

  push({
    id: 'probe',
    label: msg('health.probe'),
    group: 'factory-live',
    status: probeFresh ? 'ok' : probe ? 'down' : 'unknown',
    detail: probe ? msg('health.probe.last', age(now, probe.receivedAt)) : msg('health.probe.none'),
    checkedAt,
  });

  const sourcesOk = signals.kanban.state === 'read' && signals.sessions.error === null;
  push({
    id: 'sources',
    label: msg('health.sources'),
    group: 'factory-live',
    status: sourcesOk ? 'ok' : 'down',
    detail: msg('health.sources.detail', {
      kanban: signals.kanban.state,
      cards: signals.kanban.cards,
      kanbanError: signals.kanban.error,
      sessionsError: signals.sessions.error,
    }),
    checkedAt: signals.kanban.readAt === null ? null : iso(signals.kanban.readAt),
    metrics: [
      { label: msg('health.metric.hooksPerMinute'), value: String(signals.hooksPerMinute) },
      {
        label: msg('health.metric.lastHook'),
        value:
          signals.lastHookAt === null
            ? msg('health.value.none')
            : msg('health.value.ago', age(now, signals.lastHookAt)),
      },
    ],
  });

  return {
    factory: {
      live: probeFresh || (signals.lastHookAt !== null && now - signals.lastHookAt < 10 * 60_000),
      paused,
      pauseReason,
      maxInProgress: signals.maxInProgress,
      running: signals.running,
    },
    health,
  };
}
