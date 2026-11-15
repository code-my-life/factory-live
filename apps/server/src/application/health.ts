import { FACTORY_RUNTIME, msg } from '@factory-live/contracts';
import type { CoreCheckState, CoreMachineState, PublishedSheet, WorkflowView } from './ports.ts';
import type { FactoryState, ServiceHealth, Text } from '@factory-live/contracts';
import type { GuardRisk } from '@factory-live/domain';
import { iso } from './projection.ts';

/** Signaux passifs relevés par le hub, en millisecondes epoch. */
export interface HealthSignals {
  now: number;
  github: {
    configured: boolean;
    ok: boolean;
    detail: Text;
    remaining: number | null;
    limit: number | null;
    checkedAt: number | null;
  };
  webhookDeliveries: { at: number; status: number } | null;
  /** Les gardes dont le code peut attendre au moins le délai de leur hook ; `null` : pas encore lues. */
  guards: { risks: readonly GuardRisk[]; checkedAt: number } | null;
  running: number;
  maxInProgress: number;
  maxInProgressPerProfile: number;
  /** The workflows followed by their API (#31), as last read. */
  workflows?: readonly WorkflowView[];
  /** The code line's sheet, the last the core served (#31); `null` before the first. */
  codeSheet?: PublishedSheet | null;
  /** Whether the core answers (#62), and the state of the machine and the checks it last published. */
  core: {
    unreachableSince: number | null;
    error: string | null;
    machine: CoreMachineState | null;
    /** The machine's latest checks, from a read or an event, kept apart from the machine's other state. */
    checks?: CoreCheckState[];
  };
}

/** Âge d'un fait en secondes ; le client l'écrit « il y a 9 s », « 9s ago »... */
function age(now: number, at: number): { seconds: number } {
  return { seconds: Math.max(0, Math.round((now - at) / 1000)) };
}

/** The group of the agent runtime's tiles on the Health page, a value factory-live writes itself (`runtime.ts`). */
const FACTORY: ServiceHealth['group'] = FACTORY_RUNTIME;

const GROUPS: Readonly<Record<string, ServiceHealth['group']>> = {
  pause: FACTORY,
  dashboard: FACTORY,
  disk: FACTORY,
  freellmapi: 'models',
  llamacpp: 'models',
  graphify: 'tools',
  webhook: 'intake',
  funnel: 'intake',
  cron: 'intake',
};

/** Labels factory-live gives itself to some of the core's checks. */
const LABELS: Readonly<Record<string, Text>> = { webhook: msg('health.webhook') };

/** The factory's health: the core's checks, completed by what factory-live observes itself. */
export function buildHealth(signals: HealthSignals): {
  factory: FactoryState;
  health: ServiceHealth[];
} {
  const { now, core } = signals;
  // The core's checks, with their own statuses and times.
  const checks = new Map(
    (core.checks ?? core.machine?.checks ?? []).map((check) => [check.id, check]),
  );
  const checkedAtOf = (id: string): string | null => {
    const at = checks.get(id)?.checkedAt;
    return at === null || at === undefined ? null : iso(at);
  };
  const checkedAt = checkedAtOf('gateway');
  const pause = checks.get('pause');
  const paused = pause?.status === 'degraded';
  const pauseReason = paused
    ? pause?.detail.replace(/^Factory en pause\s*:?\s*/, '') || null
    : null;
  const health: ServiceHealth[] = [];
  const push = (item: Omit<ServiceHealth, 'metrics'> & { metrics?: ServiceHealth['metrics'] }) =>
    health.push({ metrics: [], ...item });

  const gateway = checks.get('gateway');
  push({
    id: 'gateway',
    label: msg('health.gateway'),
    group: FACTORY,
    status: gateway?.status ?? 'unknown',
    detail: gateway?.detail ?? msg('health.notReported'),
    checkedAt,
    metrics: gateway?.metrics['pid'] ? [{ label: 'PID', value: gateway.metrics['pid'] }] : [],
  });

  // The dispatcher's tick reached factory-live by the factory's webhooks only: the core does not serve it.
  push({
    id: 'dispatcher',
    label: msg('health.dispatcher'),
    group: FACTORY,
    status: 'unknown',
    detail: msg('health.dispatcher.noTick'),
    checkedAt: null,
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
      status: check.status,
      detail: check.detail,
      checkedAt: checkedAtOf(id),
      metrics,
    });
  }

  // The last Claude Code session reached factory-live by the factory's webhooks only: unknown here.
  push({
    id: 'claude',
    label: msg('health.claude'),
    group: 'models',
    status: 'unknown',
    detail: msg('health.claude.none'),
    checkedAt: null,
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
      group: FACTORY,
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

  pushCore(push, now, core);

  for (const workflow of signals.workflows ?? []) {
    const down = workflow.unreachableSince !== null;
    push({
      id: `workflow:${workflow.name}`,
      label: msg('health.workflow', { name: workflow.name }),
      group: 'factory-live',
      status: down || workflow.readAt === null ? 'down' : workflow.sheetRefusal ? 'degraded' : 'ok',
      detail:
        workflow.readAt === null
          ? msg('health.workflow.never', { error: workflow.error })
          : down
            ? msg('health.workflow.unreachable', {
                ...age(now, workflow.unreachableSince ?? now),
                error: workflow.error,
              })
            : workflow.sheetRefusal
              ? msg('health.workflow.sheetInvalid', { error: workflow.sheetRefusal })
              : msg('health.workflow.ok', { count: workflow.items.length }),
      checkedAt: workflow.readAt === null ? null : iso(workflow.readAt),
    });
  }
  if (signals.codeSheet !== undefined)
    push({
      id: 'code-sheet',
      label: msg('health.codeSheet'),
      group: 'factory-live',
      status: signals.codeSheet && signals.codeSheet.refusal === undefined ? 'ok' : 'degraded',
      detail:
        signals.codeSheet?.refusal !== undefined
          ? msg('health.workflow.sheetInvalid', { error: signals.codeSheet.refusal })
          : signals.codeSheet
            ? msg('health.codeSheet.published')
            : msg('health.codeSheet.pending'),
      checkedAt: null,
    });

  return {
    factory: {
      live: core.unreachableSince === null && gateway?.status === 'ok',
      paused,
      pauseReason,
      maxInProgress: signals.maxInProgress,
      running: signals.running,
    },
    health,
  };
}

/** The core's tile (#62): whether it answers, its mode and contract, the age of each board's last read. */
function pushCore(
  push: (item: Omit<ServiceHealth, 'metrics'> & { metrics?: ServiceHealth['metrics'] }) => void,
  now: number,
  core: NonNullable<HealthSignals['core']>,
): void {
  const machine = core.machine;
  const problem = machine?.contract?.problems[0] ?? null;
  const observer = machine?.mode === 'observer';
  const metrics: ServiceHealth['metrics'] = machine
    ? [
        {
          label: msg('health.metric.coreVersion'),
          value: machine.runtimeVersion ?? msg('health.value.none'),
        },
        {
          label: msg('health.metric.contract'),
          value:
            machine.contract === null
              ? msg('health.value.none')
              : machine.contract.ok
                ? msg('health.core.contract.ok')
                : msg('health.core.contract.broken', { problem }),
        },
        { label: msg('health.metric.mode'), value: machine.mode },
        ...machine.boards.map((board) => ({
          label: msg('health.metric.boardRead', { board: board.board }),
          value:
            board.lastReadAt === null
              ? msg('health.value.none')
              : msg('health.value.ago', age(now, board.lastReadAt)),
        })),
      ]
    : [];
  push({
    id: 'core',
    label: msg('health.core'),
    group: 'factory-live',
    status: core.unreachableSince !== null ? 'down' : observer ? 'degraded' : 'ok',
    detail:
      core.unreachableSince !== null
        ? msg('health.core.unreachable', age(now, core.unreachableSince))
        : observer
          ? msg('health.core.observer', { problem })
          : msg('health.core.ok'),
    checkedAt: null,
    metrics,
  });
}
