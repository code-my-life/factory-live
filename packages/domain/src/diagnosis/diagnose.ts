import { message } from '../messages.ts';
import { DiagnosisContext, unique } from './context.ts';
import type { Observation } from './context.ts';
import {
  BLOCK_RECURRENCE_LIMIT,
  HOOK_TIMEOUT_MAX,
  classifyToolResult,
  isRefusal,
  quote,
} from './hermesText.ts';
import { RULES, endedOnRefusals } from './rules.ts';
import type {
  Diagnosis,
  DiagnosisInput,
  DiagnosisMessage,
  Finding,
  FindingCode,
  RunVerdict,
  UnblockAdvice,
  WorkState,
} from './types.ts';

/*
 * Le choix, déterministe, de ce qu'on montre : une cause principale, les autres constats, le
 * verdict de chaque run, quand débloquer et avec quelle réponse. Même entrée, même diagnostic, quel
 * que soit l'ordre des faits.
 */

/** Ce qu'une cause explique : ses conséquences ne sont pas des causes à part entière. */
const EXPLAINS: Partial<Record<FindingCode, readonly FindingCode[]>> = {
  guard_hook_timeout: ['stopped_after_refusals', 'protocol_breaker', 'question', 'guard_refusal'],
  guard_hook_hung: ['stopped_after_refusals', 'protocol_breaker', 'question'],
  guard_hook_raised: ['stopped_after_refusals', 'protocol_breaker', 'question'],
  plugin_load_failed: ['question'],
  triage_loop: ['question'],
  refusal_loop: ['stopped_after_refusals', 'protocol_breaker', 'iteration_budget', 'question'],
  guard_refusal: ['stopped_after_refusals', 'protocol_breaker'],
  stopped_after_refusals: ['protocol_breaker'],
  stopped_without_kanban_call: ['protocol_breaker'],
  pr_acceptance_infra: ['stopped_after_refusals', 'protocol_breaker', 'question'],
  pr_acceptance_missing: ['stopped_after_refusals', 'protocol_breaker', 'question'],
  provider_unavailable: ['protocol_breaker'],
  spawn_failed: ['protocol_breaker'],
  tool_deadline: ['command_timeout'],
};

/** Plus le niveau est bas, plus la cause passe devant : infrastructure, passager, agent, question. */
const TIER: Record<FindingCode, number> = {
  guard_hook_timeout: 1,
  guard_hook_hung: 1,
  guard_hook_raised: 1,
  plugin_load_failed: 1,
  spawn_failed: 1,
  provider_terminal: 1,
  pr_acceptance_infra: 1,
  tool_deadline: 1,
  iteration_budget: 1,
  runtime_limit: 1,
  held_active_pr: 1,
  triage_loop: 1,
  provider_unavailable: 2,
  provider_quota: 2,
  refusal_loop: 3,
  pr_acceptance_missing: 3,
  stopped_without_kanban_call: 3,
  stopped_after_refusals: 3,
  protocol_breaker: 3,
  guard_refusal: 3,
  command_timeout: 3,
  question: 4,
  unexplained: 5,
};
const ORDER = Object.keys(TIER) as FindingCode[];

function lastEvidenceAt(finding: Finding): number {
  return Math.max(0, ...finding.evidence.map((item) => item.until ?? item.at ?? 0));
}

function explainedBy(finding: Finding, all: readonly Finding[]): boolean {
  return all.some(
    (other) =>
      other !== finding &&
      (EXPLAINS[other.code] ?? []).includes(finding.code) &&
      (finding.runIds.length === 0 || finding.runIds.some((id) => other.runIds.includes(id))),
  );
}

/** Ce que la carte vit maintenant (retenue, en triage) passe avant ce qui s'est passé dans ses runs. */
const CURRENT_STATE = new Set<FindingCode>(['held_active_pr', 'triage_loop']);

function rank(ctx: DiagnosisContext, all: readonly Finding[]) {
  return (finding: Finding): readonly number[] => [
    CURRENT_STATE.has(finding.code) ? 0 : 1,
    ctx.blockingRunId !== null && finding.runIds.includes(ctx.blockingRunId) ? 0 : 1,
    explainedBy(finding, all) ? 1 : 0,
    TIER[finding.code],
    finding.confidence === 'certain' ? 0 : 1,
    -lastEvidenceAt(finding),
    ORDER.indexOf(finding.code),
  ];
}

function compare(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Une vraie question de l'agent : bloqué en `needs_input`, sans cause technique trouvée. */
function question(ctx: DiagnosisContext): Finding | null {
  const task = ctx.input.task;
  if (task.blockKind !== 'needs_input') return null;
  const blocking = ctx.blockingRunId;
  return {
    code: 'question',
    confidence: 'certain',
    actor: 'you_answer',
    cause: { state: 'none' },
    summary: message('diagnosis.summary.question'),
    why: message('diagnosis.why.question'),
    subject: { profile: task.assignee, plugin: null, tool: null },
    setting: null,
    evidence: [],
    steps: [{ text: message('diagnosis.step.answer'), command: null, done: false }],
    runIds: blocking !== null ? [blocking] : [],
  };
}

/** Rien de reconnu : les derniers refus et erreurs de l'épisode, tels quels, pour lire soi-même. */
function unexplained(ctx: DiagnosisContext): Finding {
  const signals = ctx.observations
    .filter((item) => isRefusal(item.outcome) || item.outcome.kind === 'error')
    .slice(-3);
  const last = signals.at(-1);
  return {
    code: 'unexplained',
    confidence: 'likely',
    actor: 'you_answer',
    cause: { state: 'unknown' },
    summary: message('diagnosis.summary.unexplained'),
    why: message('diagnosis.why.unexplained'),
    subject: { profile: ctx.input.task.assignee, plugin: null, tool: null },
    setting: null,
    evidence: last
      ? [
          {
            source: 'transcript',
            at: signals[0]?.result.at ?? null,
            until: last.result.at,
            runId: last.runId,
            fact: message('diagnosis.evidence.lastSignals', { count: signals.length }),
            quote: quote(signals.map((item) => item.result.content).join('\n')),
            count: signals.length,
          },
        ]
      : [],
    steps: [],
    runIds: ctx.blockingRunId !== null ? [ctx.blockingRunId] : [],
  };
}

/** Les refus d'un run que la cause explique : ceux d'Hermès pour un hook, ceux des gardes sinon. */
function refusedBy(ctx: DiagnosisContext, code: FindingCode, runId: number): number {
  return ctx
    .observationsOfRun(runId)
    .filter((item) =>
      code === 'guard_hook_timeout' || code === 'guard_hook_hung'
        ? item.outcome.kind === 'hook_timeout'
        : code === 'guard_hook_raised'
          ? item.outcome.kind === 'hook_raised'
          : code === 'guard_refusal'
            ? item.outcome.kind === 'guard'
            : isRefusal(item.outcome),
    ).length;
}

/** Le compte d'un verdict : ce que la règle a retenu (une sortie après des appels kanban en erreur compte ceux-là). */
function refusalsOfVerdict(ctx: DiagnosisContext, code: FindingCode, runId: number): number {
  return code === 'stopped_after_refusals'
    ? endedOnRefusals(ctx, runId).length
    : refusedBy(ctx, code, runId);
}

function verdictText(
  ctx: DiagnosisContext,
  finding: Finding | undefined,
  runId: number,
  outcome: string,
): DiagnosisMessage {
  switch (finding?.code) {
    case 'guard_hook_timeout':
    case 'guard_hook_hung':
    case 'guard_hook_raised':
    case 'stopped_after_refusals':
    case 'guard_refusal': {
      const count = refusalsOfVerdict(ctx, finding.code, runId);
      return outcome === 'blocked'
        ? message('diagnosis.run.blockedAfterRefusals', { count })
        : message('diagnosis.run.refusedThenStopped', { count });
    }
    case 'stopped_without_kanban_call':
      return message('diagnosis.run.modelStopped');
    case 'protocol_breaker':
      return message('diagnosis.run.breaker');
    case 'iteration_budget':
    case 'runtime_limit':
    case 'tool_deadline':
      return message('diagnosis.run.timedOut');
    case 'provider_quota':
      return message('diagnosis.run.quota');
    case 'provider_unavailable':
    case 'provider_terminal':
      return message('diagnosis.run.providerUnavailable');
    case 'question':
    case 'triage_loop':
      return message('diagnosis.run.question');
    case 'refusal_loop':
      return message('diagnosis.run.refusalLoop', {
        count: ctx.observationsOfRun(runId).filter((item) => item.outcome.kind === 'guard').length,
      });
    case 'spawn_failed':
      return message('diagnosis.run.spawnFailed');
    case 'pr_acceptance_infra':
    case 'pr_acceptance_missing':
      return message('diagnosis.run.prAcceptance');
    default:
      return message('diagnosis.run.unexplained', { outcome });
  }
}

function sessionOfRun(input: DiagnosisInput, runId: number): string | null {
  return input.sessions?.find((session) => session.runId === runId)?.id ?? null;
}

/** Où en est le travail, d'après les appels de l'agent (commit, push, fichiers édités) et le worktree. */
export function workStateOf(input: DiagnosisInput): WorkState | null {
  const sessions = input.sessions;
  const evidence = input.evidence ?? [];
  if (!sessions && evidence.length === 0 && !input.branch && !input.prUrl) return null;
  const items: Observation[] = [];
  for (const session of sessions ?? []) {
    const calls = new Map(
      session.calls.filter((call) => call.callId).map((call) => [call.callId as string, call]),
    );
    for (const result of session.results) {
      const call = result.callId ? calls.get(result.callId) : undefined;
      if (call)
        items.push({
          runId: session.runId,
          sessionId: session.id,
          result,
          call,
          outcome: classifyToolResult(result.content),
        });
    }
  }
  const commits = items.filter((item) => /\bgit\s+commit\b/.test(item.call?.input ?? ''));
  const made = commits.filter(
    (item) => item.outcome.kind === 'ok' && /\[[^\]\s]+ [0-9a-f]{7,}\]/.test(item.result.content),
  );
  const refused = commits.filter((item) => isRefusal(item.outcome));
  const pushes = items.filter(
    (item) =>
      /\bgit\s+push\b/.test(item.call?.input ?? '') &&
      item.outcome.kind === 'ok' &&
      !/"exit_code":\s*[1-9]/.test(item.result.content),
  );
  const edited = unique(
    (sessions ?? [])
      .flatMap((session) => session.calls)
      .filter((call) => (call.tool === 'write_file' || call.tool === 'patch') && call.input)
      .map((call) => call.input as string),
  );
  return {
    branch: input.branch,
    commits: sessions ? (made.length > 0 ? 'some' : 'none') : 'unknown',
    commitsRefused: refused.length,
    pushed: sessions ? (pushes.length > 0 ? 'yes' : 'no') : 'unknown',
    prUrl: input.prUrl,
    editedFiles: edited.length,
    evidence: [...evidence].sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function advice(
  ctx: DiagnosisContext,
  primary: Finding,
  all: readonly Finding[],
  work: WorkState | null,
): UnblockAdvice {
  const task = ctx.input.task;
  const nextBlock =
    task.status === 'blocked'
      ? task.blockRecurrences + 1 >= BLOCK_RECURRENCE_LIMIT
        ? 'triage'
        : 'blocked'
      : null;
  if (
    primary.code === 'held_active_pr' ||
    primary.code === 'triage_loop' ||
    task.status === 'triage'
  )
    return { when: 'not_unblockable', template: null, nextBlock: null };
  const factoryPresent = all.some(
    (finding) => finding.actor === 'you_factory' && finding.cause.state === 'present',
  );
  const when: UnblockAdvice['when'] = factoryPresent
    ? 'after_fix'
    : primary.actor === 'wait'
      ? 'wait'
      : primary.code === 'question' || primary.code === 'unexplained'
        ? 'answer'
        : 'now';
  return { when, template: templateOf(primary, work), nextBlock };
}

function templateOf(primary: Finding, work: WorkState | null): DiagnosisMessage | null {
  const branch = work?.branch ?? null;
  switch (primary.code) {
    case 'guard_hook_timeout': {
      const setting = primary.setting;
      const observed = setting?.observed ?? 30;
      const value =
        setting?.current !== null && setting?.current !== undefined && setting.current > observed
          ? setting.current
          : HOOK_TIMEOUT_MAX;
      return message('diagnosis.unblock.hookTimeoutFixed', {
        plugin: primary.subject.plugin,
        seconds: observed,
        value,
        branch,
        committed: work?.commits === 'some',
        evidence: work && work.evidence.length > 0 ? work.evidence.length : null,
      });
    }
    case 'refusal_loop': {
      const quoted = primary.evidence[0]?.quote ?? '';
      const refusal = (
        /"error":\s*"(?:[a-z][a-z0-9-]*-(?:guard|readonly)) : ([^"\\]*)/.exec(quoted)?.[1] ?? quoted
      ).trim();
      return message('diagnosis.unblock.refusalLoop', {
        plugin: primary.subject.plugin ?? '?',
        refusal,
      });
    }
    case 'stopped_without_kanban_call':
    case 'stopped_after_refusals':
    case 'protocol_breaker':
      return message('diagnosis.unblock.finishWithKanbanCall');
    case 'question':
    case 'unexplained':
    case 'provider_quota':
      return null;
    default:
      return message('diagnosis.unblock.causeFixed', { branch });
  }
}

/**
 * Pourquoi la carte bloque, d'après ses faits. Le serveur ne le demande que pour une carte arrêtée :
 * une PR prête à approuver ou main rouge n'ont rien à expliquer.
 */
export function diagnose(input: DiagnosisInput): Diagnosis {
  const ctx = new DiagnosisContext(input);
  const found = RULES.flatMap((rule) => rule(ctx));
  const asked = question(ctx);
  const candidates = asked ? [...found, asked] : found;
  const all = candidates.length > 0 ? candidates : [unexplained(ctx)];
  const key = rank(ctx, all);
  const sorted = [...all].sort((left, right) => compare(key(left), key(right)));
  const primary = sorted[0] as Finding;
  const roots = sorted.filter((finding) => finding !== primary && !explainedBy(finding, all));
  const work = workStateOf(input);
  const runs: RunVerdict[] = ctx.failedRuns().map((run) => {
    // La cause propre au run : le disjoncteur et les conséquences ne passent qu'à défaut d'autre chose.
    const finding = sorted
      .filter((candidate) => candidate.runIds.includes(run.id))
      .sort(
        (left, right) =>
          Number(left.code === 'protocol_breaker') - Number(right.code === 'protocol_breaker') ||
          Number(explainedBy(left, all)) - Number(explainedBy(right, all)),
      )[0];
    return {
      runId: run.id,
      finding: finding?.code ?? null,
      role: finding ? (explainedBy(finding, all) ? 'consequence' : 'cause') : null,
      text: verdictText(ctx, finding, run.id, run.outcome ?? '?'),
      sessionId: sessionOfRun(input, run.id),
    };
  });
  return {
    computedAt: input.now,
    episode: { from: ctx.from, runIds: ctx.runs.map((run) => run.id) },
    primary,
    others: roots.slice(0, 4),
    unblock: advice(ctx, primary, [primary, ...roots], work),
    runs,
    work,
    sources: {
      transcript: input.sessions !== null,
      agentLog: input.logs !== null,
      config: input.profile !== null,
      workspace: input.evidence !== null,
    },
  };
}
