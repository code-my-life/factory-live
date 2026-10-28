import type {
  FactoryState,
  HealthStatus,
  ProbeReport,
  ServiceHealth,
} from '@factory-live/contracts';
import { iso } from './projection.ts';

/** Signaux passifs relevés par le hub, en millisecondes epoch. */
export interface HealthSignals {
  now: number;
  probe: { report: ProbeReport; receivedAt: number } | null;
  lastTickAt: number | null;
  lastHookAt: number | null;
  hooksPerMinute: number;
  kanban: { ok: boolean; detail: string; readAt: number | null };
  sessions: { ok: boolean; detail: string };
  github: {
    configured: boolean;
    ok: boolean;
    detail: string;
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
  running: number;
  maxInProgress: number;
  maxInProgressPerProfile: number;
}

const PROBE_SILENT_MS = 90_000;
const DISPATCHER_SILENT_MS = 3 * 60_000;

function ago(now: number, at: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 90) return `il y a ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `il y a ${minutes} min`;
  return `il y a ${Math.round(minutes / 60)} h`;
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

const LABELS: Readonly<Record<string, string>> = { webhook: 'Écouteur des webhooks GitHub' };

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
    label: 'Gateway Hermès',
    group: 'hermes',
    status: probeFresh ? 'ok' : probe ? 'down' : 'unknown',
    detail: probeFresh
      ? `En marche, sonde reçue ${ago(now, probe.receivedAt)}`
      : probe
        ? `Muet depuis ${ago(now, probe.receivedAt).replace('il y a ', '')}`
        : 'Aucune nouvelle de la sonde depuis le démarrage de factory-live',
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
    label: 'Dispatcher kanban',
    group: 'hermes',
    status: tickStatus,
    detail:
      signals.lastTickAt === null
        ? 'Aucun tick reçu (webhooks du gateway non branchés ?)'
        : paused
          ? `En pause, dernier tick ${ago(now, signals.lastTickAt)}`
          : `Dernier tick ${ago(now, signals.lastTickAt)}`,
    checkedAt: signals.lastTickAt === null ? null : iso(signals.lastTickAt),
    metrics: [
      { label: 'En cours', value: `${signals.running} sur ${signals.maxInProgress}` },
      { label: 'Par agent', value: `${signals.maxInProgressPerProfile} au plus` },
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
        detail: 'Pas encore rapporté par la sonde',
        checkedAt: null,
      });
      continue;
    }
    const metrics = Object.entries(check.metrics).map(([label, value]) => ({ label, value }));
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
      label: provider === 'nvidia' ? 'API NVIDIA' : `Fournisseur ${provider}`,
      group: 'models',
      status: failing ? 'degraded' : stats.lastOkAt !== null ? 'ok' : 'unknown',
      detail:
        stats.lastOkAt !== null
          ? `Dernier appel réussi ${ago(now, stats.lastOkAt)}`
          : 'Aucun appel réussi observé',
      checkedAt: stats.lastOkAt === null ? null : iso(stats.lastOkAt),
      metrics: [{ label: '429 sur 10 min', value: String(stats.rateLimited10m) }],
    });
  }
  const freellmapi = signals.providers.get('freellmapi');
  const freellmapiHealth = health.find((item) => item.id === 'freellmapi');
  if (freellmapi && freellmapiHealth)
    freellmapiHealth.metrics.push({
      label: '429 sur 10 min',
      value: String(freellmapi.rateLimited10m),
    });

  push({
    id: 'claude',
    label: 'Claude Code (abonnement)',
    group: 'models',
    status: signals.claudeLastSessionAt === null ? 'unknown' : 'ok',
    detail:
      signals.claudeLastSessionAt === null
        ? 'Aucune lane Claude observée'
        : `Dernière session ${ago(now, signals.claudeLastSessionAt)}`,
    checkedAt: signals.claudeLastSessionAt === null ? null : iso(signals.claudeLastSessionAt),
  });

  push({
    id: 'github',
    label: 'API GitHub',
    group: 'tools',
    status: !signals.github.configured ? 'unknown' : signals.github.ok ? 'ok' : 'down',
    detail: signals.github.detail,
    checkedAt: signals.github.checkedAt === null ? null : iso(signals.github.checkedAt),
    metrics:
      signals.github.remaining !== null
        ? [
            {
              label: 'Quota restant',
              value: `${signals.github.remaining} sur ${signals.github.limit ?? '?'}`,
            },
          ]
        : [],
  });

  if (signals.webhookDeliveries) {
    const delivery = signals.webhookDeliveries;
    push({
      id: 'github-deliveries',
      label: 'Webhooks GitHub (vus par GitHub)',
      group: 'intake',
      status: delivery.status >= 200 && delivery.status < 300 ? 'ok' : 'degraded',
      detail: `Dernière livraison : HTTP ${delivery.status} ${ago(now, delivery.at)}`,
      checkedAt: iso(delivery.at),
    });
  }

  push({
    id: 'probe',
    label: 'Sonde factory-live-probe',
    group: 'factory-live',
    status: probeFresh ? 'ok' : probe ? 'down' : 'unknown',
    detail: probe
      ? `Dernier rapport ${ago(now, probe.receivedAt)}`
      : 'Aucun rapport reçu (sonde pas encore déployée ?)',
    checkedAt,
  });

  const sourcesOk = signals.kanban.ok && signals.sessions.ok;
  push({
    id: 'sources',
    label: 'Sources de factory-live',
    group: 'factory-live',
    status: sourcesOk ? 'ok' : 'down',
    detail: `${signals.kanban.detail} ; ${signals.sessions.detail}`,
    checkedAt: signals.kanban.readAt === null ? null : iso(signals.kanban.readAt),
    metrics: [
      { label: 'Webhooks par minute', value: String(signals.hooksPerMinute) },
      {
        label: 'Dernier webhook',
        value: signals.lastHookAt === null ? 'aucun' : ago(now, signals.lastHookAt),
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
