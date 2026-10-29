import { redactSecrets } from '../redact.ts';
import type { LogFact, LogFactKind } from './types.ts';

/*
 * Ce qu'Hermès écrit, tel qu'il l'écrit (v0.22.2) : constantes et formats exacts des résultats
 * d'outils, des erreurs de runs et des lignes du journal. Les règles du diagnostic ne lisent que ces
 * formats-là, jamais le texte libre de l'agent. Sources : `hermes_cli/plugins_dispatch.py`,
 * `agent/tool_executor.py`, `hermes_cli/kanban_db_dispatch.py`, `hermes_logging.py`.
 */

/** `plugins.hook_callback_timeout` par défaut, et son maximum. */
export const HOOK_TIMEOUT_DEFAULT = 30;
export const HOOK_TIMEOUT_MAX = 600;
/** `timeouts.tools.sequential_call` par défaut : le plafond d'un appel d'outil, hooks compris. */
export const TOOL_DEADLINE_DEFAULT = 420;
/** Après un dépassement, Hermès refuse les appels suivants pendant 60 s (même callback). */
export const HOOK_SUPPRESSION_SECONDS = 60;
/** Au 2e blocage du même type d'affilée, le noyau passe la carte en triage. */
export const BLOCK_RECURRENCE_LIMIT = 2;
/** Recharge d'un fournisseur en 429 avant que la carte ne reparte. */
export const RATE_LIMIT_COOLDOWN_MINUTES = 5;

/** Le refus d'un outil quand un hook `pre_tool_call` dépasse son délai, ou n'a pas fini. */
export const HOOK_TIMEOUT_MESSAGE = 'pre_tool_call plugin callback timed out or is still running';

const HOOK_RAISED = /^pre_tool_call plugin callback (\S+) raised ([\w.]+): ([\s\S]*)$/;
/** Les gardes de la factory préfixent chaque refus de leur nom : « coder-guard : … ». */
const GUARD = /^([a-z][a-z0-9-]*(?:-guard|-readonly)) : ([\s\S]+)$/;
const TOOL_DEADLINE = /^Error executing tool '([^']+)': timed out after ([\d.]+)s/;
const COMMAND_TIMEOUT = /timed out after (\d+)\s*s/i;
const PR_ACCEPTANCE = /^PR acceptance (infra|missing|pending|failed)\b:?\s*([\s\S]*)$/;

export type ToolOutcome =
  | { readonly kind: 'hook_timeout' }
  | { readonly kind: 'hook_raised'; readonly callback: string; readonly error: string }
  | { readonly kind: 'guard'; readonly plugin: string; readonly message: string }
  | { readonly kind: 'pr_acceptance'; readonly classification: string; readonly detail: string }
  | { readonly kind: 'tool_deadline'; readonly tool: string; readonly seconds: number }
  | { readonly kind: 'command_timeout'; readonly seconds: number | null }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ok' };

const TRUNCATED_ERROR = /^\{\s*"error"\s*:\s*"((?:[^"\\]|\\.)*)/;
const TRUNCATED_EXIT = /"exit_code"\s*:\s*(-?\d+)/;

/**
 * L'objet JSON d'un résultat d'outil. Un contenu coupé par l'adaptateur n'est plus du JSON valide :
 * on en garde alors le début de `error`, ou le code de sortie, assez pour classer le résultat.
 */
function recordOf(trimmed: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const error = TRUNCATED_ERROR.exec(trimmed)?.[1];
    // Coupé avant le moindre mot de l'erreur : rien à classer.
    if (error) {
      try {
        return { error: JSON.parse(`"${error}"`) as string };
      } catch {
        return null;
      }
    }
    const exit = TRUNCATED_EXIT.exec(trimmed)?.[1];
    return exit === undefined ? null : { exit_code: Number(exit), output: trimmed };
  }
}

/** Ce que dit le résultat d'un outil : refus d'une garde ou d'Hermès, délai, erreur, ou rien à signaler. */
export function classifyToolResult(content: string): ToolOutcome {
  const trimmed = content.trim();
  const deadline = TOOL_DEADLINE.exec(trimmed);
  if (deadline)
    return {
      kind: 'tool_deadline',
      tool: deadline[1] ?? '?',
      seconds: Math.round(Number(deadline[2])),
    };
  if (!trimmed.startsWith('{')) return { kind: 'ok' };
  const record = recordOf(trimmed);
  if (!record) return { kind: 'ok' };
  const error = record['error'];
  if (typeof error === 'string') {
    // Égalité exacte : un résultat qui cite ce texte (kanban_show d'une carte bloquée) n'en est pas un.
    if (error === HOOK_TIMEOUT_MESSAGE) return { kind: 'hook_timeout' };
    const raised = HOOK_RAISED.exec(error);
    if (raised)
      return {
        kind: 'hook_raised',
        callback: raised[1] ?? '?',
        error: `${raised[2]}: ${raised[3]}`,
      };
    const guard = GUARD.exec(error);
    if (guard) return { kind: 'guard', plugin: guard[1] ?? '?', message: (guard[2] ?? '').trim() };
    const acceptance = PR_ACCEPTANCE.exec(error);
    if (acceptance)
      return {
        kind: 'pr_acceptance',
        classification: acceptance[1] ?? '?',
        detail: (acceptance[2] ?? '').trim(),
      };
    return { kind: 'error', message: error };
  }
  if (record['exit_code'] === 124) {
    const timedOut = COMMAND_TIMEOUT.exec(str(record['output']));
    return { kind: 'command_timeout', seconds: timedOut ? Number(timedOut[1]) : null };
  }
  return { kind: 'ok' };
}

/** Un champ texte d'une charge d'Hermès ; autre chose qu'un texte compte pour vide. */
export function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Refusé avant d'agir : par une garde, par Hermès (hook en dépassement ou en panne). */
export function isRefusal(outcome: ToolOutcome): boolean {
  return (
    outcome.kind === 'hook_timeout' || outcome.kind === 'hook_raised' || outcome.kind === 'guard'
  );
}

/** Le premier paragraphe d'un refus, sans ce qui varie d'un appel à l'autre (chemins, nombres). */
export function normalizedRefusal(message: string): string {
  return (message.split('\n')[0] ?? '')
    .replace(/\/[^\s'"`]+/g, '<chemin>')
    .replace(/\b\d+\b/g, '<n>')
    .trim();
}

/** Texte cité tel quel : secrets masqués, coupé à 300 caractères. */
export function quote(text: string | null | undefined): string | null {
  if (!text) return null;
  const clean = redactSecrets(text).trim();
  return clean.length > 300 ? `${clean.slice(0, 299)}…` : clean;
}

/* --- Erreurs des runs (`task_runs.error`, charges des événements) ------------------------------ */

// Le tiret long fait partie du texte d'Hermès : écrit par son code, jamais en toutes lettres ici.
const PROTOCOL_VIOLATION =
  /^worker exited cleanly \(rc=0\) without kanban_complete, kanban_block or kanban_request_review \u2014 protocol violation/;
const NUDGE_MARKER = 'Kanban worker tried to exit without a terminal board call';
const BUDGET = /Iteration budget exhausted \((\d+)\/(\d+)\)/;
const RUNTIME = /^elapsed (\d+)s > limit (\d+)s$/;
const RESUME = /hermes --resume (\d{8}_\d{6}_[0-9a-f]{6}) -p (\S+)/;
const STALLED = /Turn made no progress for (\d+)s/;
const FAILING =
  /fallback chain kept failing over|No reply: every provider in the fallback chain kept failing over/;

export function isProtocolViolation(error: string | null | undefined): boolean {
  return !!error && PROTOCOL_VIOLATION.test(error);
}

/** Hermès a relancé l'agent pour qu'il rende la carte avant de le laisser sortir. */
export function wasNudged(workerOutput: string | null | undefined): boolean {
  return !!workerOutput && workerOutput.includes(NUDGE_MARKER);
}

export function budgetOf(text: string | null | undefined): { used: number; max: number } | null {
  const match = text ? BUDGET.exec(text) : null;
  return match ? { used: Number(match[1]), max: Number(match[2]) } : null;
}

export function runtimeOf(
  text: string | null | undefined,
): { elapsed: number; limit: number } | null {
  const match = text ? RUNTIME.exec(text.trim()) : null;
  return match ? { elapsed: Number(match[1]), limit: Number(match[2]) } : null;
}

/** La session d'un run, nommée dans sa sortie (`hermes --resume <session> -p <agent>`). */
export function resumeSessionOf(text: string | null | undefined): string | null {
  return (text && RESUME.exec(text)?.[1]) ?? null;
}

/** Le fournisseur ne répond plus (garde-fou de progression) ou toute la chaîne de repli échoue. */
export function providerFailureOf(
  workerOutput: string | null | undefined,
): { mode: 'stalled' | 'failing'; seconds: number | null } | null {
  if (!workerOutput) return null;
  const stalled = STALLED.exec(workerOutput);
  if (stalled) return { mode: 'stalled', seconds: Number(stalled[1]) };
  return FAILING.test(workerOutput) ? { mode: 'failing', seconds: null } : null;
}

/* --- Journal d'Hermès (`logs/agent.log`) ---------------------------------------------------- */

/** Une ligne du journal : heure locale sans fuseau (l'adaptateur la date), niveau, session, message. */
export interface LogLine {
  readonly wallClock: string;
  readonly millis: number;
  readonly level: string;
  readonly sessionId: string | null;
  readonly logger: string;
  readonly message: string;
}

const LOG_LINE =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),(\d{3}) (DEBUG|INFO|WARNING|ERROR|CRITICAL)(?: \[([^\]]+)\])? (\S+): (.*)$/;

export function parseLogLine(line: string): LogLine | null {
  const match = LOG_LINE.exec(line);
  if (!match) return null;
  return {
    wallClock: match[1] ?? '',
    millis: Number(match[2]),
    level: match[3] ?? '',
    sessionId: match[4] ?? null,
    logger: match[5] ?? '',
    message: match[6] ?? '',
  };
}

/** Les champs qu'une ligne du journal peut donner ; un groupe absent de la regex reste `undefined`. */
interface LogFields {
  readonly hook?: string | undefined;
  readonly callback?: string | undefined;
  readonly module?: string | undefined;
  readonly plugin?: string | undefined;
  readonly detail?: string | undefined;
  readonly seconds?: number | undefined;
  readonly count?: number | undefined;
}

type LogPattern = {
  readonly kind: LogFactKind;
  readonly pattern: RegExp;
  readonly read: (match: RegExpExecArray) => LogFields;
};

const LOG_PATTERNS: readonly LogPattern[] = [
  {
    kind: 'hook_timeout',
    pattern: /^Hook '(\w+)' callback (\S+) timed out after ([\d.]+)s/,
    read: (m) => ({ hook: m[1], callback: m[2], seconds: Math.round(Number(m[3])) }),
  },
  {
    kind: 'hook_abandoned',
    pattern:
      /^Hook '(\w+)' callback (\S+) \(([^)]+)\) skipped: (\d+) abandoned worker\(s\) still running/,
    read: (m) => ({ hook: m[1], callback: m[2], module: m[3], count: Number(m[4]) }),
  },
  {
    kind: 'hook_skipped',
    pattern: /^Hook '(\w+)' callback (\S+) skipped after previous timeout or while still running/,
    read: (m) => ({ hook: m[1], callback: m[2] }),
  },
  {
    kind: 'hook_raised',
    pattern:
      /^(?:Hook|Middleware) '(\w+)' callback (\S+) raised: ([\s\S]*?)(?: \(\w+ provides:[\s\S]*)?$/,
    read: (m) => ({ hook: m[1], callback: m[2], detail: m[3] }),
  },
  {
    kind: 'plugin_load_failed',
    pattern: /^Failed to load plugin '([^']+)': ([\s\S]*)$/,
    read: (m) => ({ plugin: m[1], detail: m[2] }),
  },
  {
    kind: 'stop_nudge',
    pattern: /^kanban stop-loop nudge issued \(attempt (\d+)\) task=(\S*)$/,
    read: (m) => ({ count: Number(m[1]), detail: m[2] }),
  },
  {
    kind: 'turn_ended',
    pattern: /^Turn ended: reason=(\S+)/,
    read: (m) => ({ detail: m[1] }),
  },
  {
    kind: 'tool_deadline',
    pattern: /^sequential tool (\S+) timed out after ([\d.]+)s$/,
    read: (m) => ({ detail: m[1], seconds: Math.round(Number(m[2])) }),
  },
  {
    kind: 'api_failed',
    pattern:
      /^API call failed \(attempt \d+\/\d+(?:, not retryable)?\) error_type=(\w+) .*?provider=(\S+)/,
    read: (m) => ({ detail: m[1], plugin: m[2] }),
  },
];

/** Une ligne du journal que le diagnostic sait lire, sans sa date (l'adaptateur la calcule). */
export function logFactOf(line: LogLine): Omit<LogFact, 'at'> | null {
  for (const { kind, pattern, read } of LOG_PATTERNS) {
    const match = pattern.exec(line.message);
    if (!match) continue;
    const fields = read(match);
    return {
      kind,
      sessionId: line.sessionId,
      hook: fields.hook ?? null,
      callback: fields.callback ?? null,
      module: fields.module ?? null,
      seconds: fields.seconds ?? null,
      plugin: fields.plugin ?? null,
      detail: fields.detail ?? null,
      count: fields.count ?? null,
      line: quote(line.message) ?? '',
    };
  }
  return null;
}

/** Le nom d'un plugin d'après son module Python (`hermes_plugins.coder_guard` → `coder-guard`). */
export function pluginOfModule(module: string | null): string | null {
  if (!module) return null;
  const name = module.split('.').at(-1) ?? '';
  return name ? name.replaceAll('_', '-') : null;
}
