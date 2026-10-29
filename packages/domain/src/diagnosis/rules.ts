import { message } from '../messages.ts';
import { toolsSummary, unique } from './context.ts';
import type { DiagnosisContext, Observation } from './context.ts';
import {
  HOOK_TIMEOUT_DEFAULT,
  HOOK_TIMEOUT_MAX,
  RATE_LIMIT_COOLDOWN_MINUTES,
  TOOL_DEADLINE_DEFAULT,
  budgetOf,
  isRefusal,
  normalizedRefusal,
  pluginOfModule,
  providerFailureOf,
  quote,
  runtimeOf,
  str,
  wasNudged,
} from './hermesText.ts';
import type { Cause, Evidence, Finding, PluginHook, Step } from './types.ts';

/*
 * Les règles du diagnostic : chacune lit des faits précis (résultats d'outils classés, lignes du
 * journal, événements du kanban, config) et rend zéro, un ou plusieurs constats. Aucune ne lit le
 * texte libre de l'agent. Le choix de la cause principale se fait ensuite (select.ts).
 */

export type Rule = (ctx: DiagnosisContext) => Finding[];

const HOOK_KEY = 'plugins.hook_callback_timeout';
const DEADLINE_KEY = 'timeouts.tools.sequential_call';
const GIT_COMMIT = /\bgit\s+commit\b/;

function evidence(
  fields: Omit<Evidence, 'until' | 'runId' | 'count' | 'quote'> & Partial<Evidence>,
): Evidence {
  return { until: null, runId: null, count: null, quote: null, ...fields };
}

function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

function workerOutput(ctx: DiagnosisContext, runId: number): string | null {
  const run = ctx.runOf(runId);
  const fromRun = run?.metadata['worker_output'];
  if (typeof fromRun === 'string') return fromRun;
  const event = ctx.events.find(
    (candidate) =>
      candidate.runId === runId &&
      (candidate.kind === 'protocol_violation' || candidate.kind === 'crashed') &&
      typeof candidate.payload['worker_output'] === 'string',
  );
  return (event?.payload['worker_output'] as string | undefined) ?? null;
}

/** Le plugin d'un callback de hook, d'après les sources des plugins actifs de l'agent. */
function hookOf(ctx: DiagnosisContext, hook: string, callback: string | null): PluginHook | null {
  const profile = ctx.input.profile;
  if (!profile) return null;
  const active = profile.hooks.filter(
    (item) => item.hook === hook && profile.plugins.includes(item.plugin),
  );
  if (callback) {
    const named = active.filter((item) => item.callback === callback);
    if (named.length === 1) return named[0] ?? null;
  }
  return active.length === 1 ? (active[0] ?? null) : null;
}

/* --- Gardes et hooks ------------------------------------------------------------------------ */

/**
 * Un hook `pre_tool_call` dépasse son délai : Hermès refuse l'outil, puis tous les outils pendant
 * 60 s. Fait : le résultat d'outil exact d'Hermès ; le journal donne le callback et le délai.
 */
export const guardHookTimeout: Rule = (ctx) => {
  const hits = ctx.observations.filter((item) => item.outcome.kind === 'hook_timeout');
  if (hits.length === 0) return [];
  const logs = ctx.logs.filter(
    (fact) => fact.kind === 'hook_timeout' && (fact.hook ?? 'pre_tool_call') === 'pre_tool_call',
  );
  const callback = first(logs)?.callback ?? null;
  const hook = hookOf(ctx, 'pre_tool_call', callback);
  const plugin = hook?.plugin ?? null;
  const firstHit = hits[0] as Observation;
  const gap = firstHit.call ? firstHit.result.at - firstHit.call.at : null;
  const observed =
    first(logs)?.seconds ??
    (gap !== null && gap >= 5 ? Math.round(gap) : null) ??
    HOOK_TIMEOUT_DEFAULT;
  const trigger =
    firstHit.call?.tool === 'terminal' && GIT_COMMIT.test(firstHit.call.input ?? '')
      ? 'git commit'
      : (firstHit.call?.tool ?? null);
  const profile = ctx.input.profile;
  const name = ctx.profile ?? '?';
  const current = profile?.hookTimeout ?? null;
  const deadline = profile?.toolDeadline ?? TOOL_DEADLINE_DEFAULT;
  const effective = Math.min(current ?? HOOK_TIMEOUT_DEFAULT, deadline);
  const lastAt = Math.max(...hits.map((item) => item.result.at), ...logs.map((fact) => fact.at));
  const repo = profile?.repoHookTimeout;

  // Corrigée quand le délai effectif dépasse celui qui a coupé, et que la config a bougé après.
  let cause: Cause;
  let verifiedIn: number | null = null;
  if (!profile) cause = { state: 'unknown' };
  else if (effective <= observed) cause = { state: 'present' };
  else if (profile.changedAt !== null && profile.changedAt > lastAt) {
    const changedAt = profile.changedAt;
    // Vérifiée par le même appel, repassé après la correction : réussi, ou contrôlé plus longtemps
    // que l'ancien délai sans être coupé. Un refus immédiat, avant le contrôle, ne prouve rien.
    const passed = ctx.laterObservations.find(
      (item) =>
        item.result.at > changedAt &&
        item.call !== null &&
        item.call.tool === firstHit.call?.tool &&
        (trigger !== 'git commit' || GIT_COMMIT.test(item.call.input ?? '')) &&
        item.outcome.kind !== 'hook_timeout' &&
        (item.outcome.kind === 'ok' || item.result.at - item.call.at > observed),
    );
    if (passed?.call) verifiedIn = Math.round(passed.result.at - passed.call.at);
    cause = {
      state: 'fixed',
      at: changedAt,
      verified: passed !== undefined,
      durable: repo === undefined ? null : repo !== null && repo >= (current ?? 0),
    };
  } else cause = { state: 'unknown' };

  const items: Evidence[] = [
    evidence({
      source: 'transcript',
      at: firstHit.result.at,
      until: (hits.at(-1) as Observation).result.at,
      fact: message('diagnosis.evidence.toolRefusals', {
        count: hits.length,
        tools: toolsSummary(hits),
      }),
      quote: quote(firstHit.result.content),
      count: hits.length,
    }),
  ];
  const firstLog = first(logs);
  if (firstLog)
    items.push(
      evidence({
        source: 'agent_log',
        at: firstLog.at,
        until: (logs.at(-1) ?? firstLog).at,
        fact: message('diagnosis.evidence.hookTimedOut', {
          callback: firstLog.callback ?? '?',
          seconds: firstLog.seconds ?? observed,
        }),
        quote: firstLog.line,
        count: logs.length,
      }),
    );
  if (firstHit.call)
    items.push(
      evidence({
        source: 'transcript',
        at: firstHit.call.at,
        runId: firstHit.runId,
        fact: message('diagnosis.evidence.trigger', { tool: firstHit.call.tool }),
        quote: quote(firstHit.call.input),
      }),
    );
  if (hook)
    items.push(
      evidence({
        source: 'plugin',
        at: null,
        fact: message('diagnosis.evidence.pluginHook', {
          plugin: hook.plugin,
          callback: hook.callback,
          hook: hook.hook,
        }),
        quote: quote(hook.source),
      }),
    );
  if (profile) {
    if (cause.state === 'fixed' && current !== null)
      items.push(
        evidence({
          source: 'config',
          at: cause.at,
          fact: message('diagnosis.evidence.settingChanged', { key: HOOK_KEY, value: current }),
          quote: `hook_callback_timeout: ${current}`,
        }),
      );
    else if (current === null)
      items.push(
        evidence({
          source: 'config',
          at: null,
          fact: message('diagnosis.evidence.settingMissing', {
            key: HOOK_KEY,
            seconds: HOOK_TIMEOUT_DEFAULT,
          }),
        }),
      );
    else
      items.push(
        evidence({
          source: 'config',
          at: null,
          fact: message('diagnosis.evidence.settingValue', { key: HOOK_KEY, value: current }),
        }),
      );
    items.push(
      evidence({
        source: 'config',
        at: null,
        fact: message('diagnosis.evidence.toolDeadlineCap', { seconds: deadline }),
      }),
    );
  }
  if (verifiedIn !== null)
    items.push(
      evidence({
        source: 'transcript',
        at: null,
        fact: message('diagnosis.evidence.commitPassed', { seconds: verifiedIn }),
      }),
    );

  const fixed = cause.state === 'fixed';
  const steps: Step[] = [
    {
      text: message('diagnosis.step.setValue', {
        key: HOOK_KEY,
        value: HOOK_TIMEOUT_MAX,
        profile: name,
      }),
      command: `hermes -p ${name} config set ${HOOK_KEY} ${HOOK_TIMEOUT_MAX}`,
      done: fixed,
    },
    {
      text: message('diagnosis.step.reportInRepo', { path: `profiles/${name}/config.yaml` }),
      command: null,
      done: cause.state === 'fixed' && cause.durable === true,
    },
    { text: message('diagnosis.step.unblockWithTemplate'), command: null, done: false },
  ];
  return [
    {
      code: 'guard_hook_timeout',
      confidence: firstLog || hook ? 'certain' : 'likely',
      actor: 'you_factory',
      cause,
      summary: message('diagnosis.summary.guardHookTimeout', { plugin, seconds: observed }),
      why: message('diagnosis.why.guardHookTimeout', { plugin, trigger, seconds: observed }),
      subject: { profile: name, plugin, tool: firstHit.call?.tool ?? firstHit.result.tool },
      setting: {
        profile: name,
        key: HOOK_KEY,
        unit: 'seconds',
        observed,
        current,
        defaultValue: HOOK_TIMEOUT_DEFAULT,
        effective: profile ? effective : null,
        repo: repo ?? null,
      },
      evidence: items.slice(0, 8),
      steps,
      runIds: unique(hits.map((item) => item.runId).filter((id): id is number => id !== null)),
    },
  ];
};

/** Un hook dont les appels abandonnés tournent encore : Hermès le saute, l'outil est refusé. */
export const guardHookHung: Rule = (ctx) => {
  const hung = ctx.logs.filter((fact) => fact.kind === 'hook_abandoned');
  const last = hung.at(-1);
  if (!last) return [];
  const plugin =
    pluginOfModule(last.module) ??
    hookOf(ctx, last.hook ?? 'pre_tool_call', last.callback)?.plugin ??
    null;
  return [
    {
      code: 'guard_hook_hung',
      confidence: 'certain',
      actor: 'you_factory',
      cause: { state: 'unknown' },
      summary: message('diagnosis.summary.guardHookHung', { plugin }),
      why: message('diagnosis.why.guardHookHung', { plugin, workers: last.count }),
      subject: { profile: ctx.profile, plugin, tool: null },
      setting: null,
      evidence: [
        evidence({
          source: 'agent_log',
          at: last.at,
          fact: message('diagnosis.evidence.lastSignals', { count: hung.length }),
          quote: last.line,
          count: hung.length,
        }),
      ],
      steps: [
        ...(plugin
          ? [{ text: message('diagnosis.step.fixPlugin', { plugin }), command: null, done: false }]
          : []),
        { text: message('diagnosis.step.reinstall'), command: null, done: false },
      ],
      runIds: runsAt(
        ctx,
        hung.map((fact) => fact.at),
      ),
    },
  ];
};

/** Une garde qui lève une exception à chaque appel : Hermès refuse l'outil par prudence. */
export const guardHookRaised: Rule = (ctx) => {
  const hits = ctx.observations.filter((item) => item.outcome.kind === 'hook_raised');
  const firstHit = first(hits);
  if (!firstHit || firstHit.outcome.kind !== 'hook_raised') return [];
  const plugin = hookOf(ctx, 'pre_tool_call', firstHit.outcome.callback)?.plugin ?? null;
  return [
    {
      code: 'guard_hook_raised',
      confidence: plugin ? 'certain' : 'likely',
      actor: 'you_factory',
      cause: { state: 'unknown' },
      summary: message('diagnosis.summary.guardHookRaised', { plugin }),
      why: message('diagnosis.why.guardHookRaised', { plugin }),
      subject: { profile: ctx.profile, plugin, tool: firstHit.result.tool },
      setting: null,
      evidence: [
        evidence({
          source: 'transcript',
          at: firstHit.result.at,
          until: (hits.at(-1) as Observation).result.at,
          fact: message('diagnosis.evidence.toolRefusals', {
            count: hits.length,
            tools: toolsSummary(hits),
          }),
          quote: quote(firstHit.result.content),
          count: hits.length,
        }),
      ],
      steps: [
        ...(plugin
          ? [{ text: message('diagnosis.step.fixPlugin', { plugin }), command: null, done: false }]
          : []),
        { text: message('diagnosis.step.reinstall'), command: null, done: false },
      ],
      runIds: unique(hits.map((item) => item.runId).filter((id): id is number => id !== null)),
    },
  ];
};

/** Un plugin qui ne se charge pas au démarrage de l'agent : ses contrôles ne tournent plus. */
export const pluginLoadFailed: Rule = (ctx) => {
  const failures = ctx.logs.filter((fact) => fact.kind === 'plugin_load_failed' && fact.plugin);
  const plugins = unique(failures.map((fact) => fact.plugin as string));
  return plugins.map((plugin) => {
    const facts = failures.filter((fact) => fact.plugin === plugin);
    const last = facts.at(-1) as (typeof facts)[number];
    return {
      code: 'plugin_load_failed',
      confidence: 'certain',
      actor: 'you_factory',
      cause: { state: 'present' },
      summary: message('diagnosis.summary.pluginLoadFailed', { plugin }),
      why: message('diagnosis.why.pluginLoadFailed', { plugin }),
      subject: { profile: ctx.profile, plugin, tool: null },
      setting: null,
      evidence: [
        evidence({
          source: 'agent_log',
          at: last.at,
          fact: message('diagnosis.evidence.lastSignals', { count: facts.length }),
          quote: last.line,
          count: facts.length,
        }),
      ],
      steps: [{ text: message('diagnosis.step.reinstall'), command: null, done: false }],
      runIds: runsAt(
        ctx,
        facts.map((fact) => fact.at),
      ),
    } satisfies Finding;
  });
};

/** Les runs de l'épisode actifs à ces instants (une carte n'a qu'un run à la fois). */
function runsAt(ctx: DiagnosisContext, times: readonly number[]): number[] {
  return unique(
    times
      .map(
        (at) =>
          ctx.runs.find((run) => run.startedAt - 2 <= at && at <= (run.endedAt ?? ctx.until) + 2)
            ?.id,
      )
      .filter((id): id is number => id !== undefined),
  );
}

/* --- Sorties sans appel kanban ----------------------------------------------------------------- */

/** Un run qui finit sur des refus, ou sur des appels kanban en erreur, puis sort sans rendre la carte. */
export function endedOnRefusals(ctx: DiagnosisContext, runId: number): Observation[] {
  const last = ctx.observationsOfRun(runId).slice(-10);
  return last.filter(
    (item) =>
      isRefusal(item.outcome) ||
      (item.result.tool.startsWith('kanban_') &&
        (item.outcome.kind === 'error' || item.outcome.kind === 'pr_acceptance')),
  );
}

export const stoppedAfterRefusals: Rule = (ctx) => {
  const runs = ctx.protocolViolations().filter((run) => endedOnRefusals(ctx, run.id).length > 0);
  if (runs.length === 0) return [];
  const refusals = runs.flatMap((run) => endedOnRefusals(ctx, run.id));
  const last = refusals.at(-1) as Observation;
  return [
    {
      code: 'stopped_after_refusals',
      confidence: 'certain',
      actor: 'agent',
      cause: { state: 'none' },
      summary: message('diagnosis.summary.stoppedAfterRefusals'),
      why: message('diagnosis.why.stoppedAfterRefusals'),
      subject: { profile: ctx.profile, plugin: null, tool: last.result.tool },
      setting: null,
      evidence: [
        evidence({
          source: 'transcript',
          at: refusals[0]?.result.at ?? null,
          until: last.result.at,
          fact: message('diagnosis.evidence.toolRefusals', {
            count: refusals.length,
            tools: toolsSummary(refusals),
          }),
          quote: quote(last.result.content),
          count: refusals.length,
        }),
      ],
      steps: [],
      runIds: runs.map((run) => run.id),
    },
  ];
};

/** Le modèle finit son tour sans appel kanban, sans qu'aucun outil ne lui ait été refusé. */
export const stoppedWithoutKanbanCall: Rule = (ctx) => {
  const runs = ctx.protocolViolations().filter((run) => endedOnRefusals(ctx, run.id).length === 0);
  if (runs.length === 0) return [];
  const nudges = ctx.logs.filter(
    (fact) =>
      fact.kind === 'stop_nudge' &&
      runsAt(ctx, [fact.at]).some((id) => runs.some((run) => run.id === id)),
  );
  const lastRun = runs.at(-1) as (typeof runs)[number];
  const items: Evidence[] = [];
  const output = workerOutput(ctx, lastRun.id);
  items.push(
    evidence({
      source: 'kanban',
      at: lastRun.endedAt,
      runId: lastRun.id,
      fact: message('diagnosis.evidence.workerExited'),
      quote: quote(
        wasNudged(output)
          ? 'Kanban worker tried to exit without a terminal board call'
          : lastRun.error,
      ),
      count: runs.length,
    }),
  );
  const lastNudge = nudges.at(-1);
  if (lastNudge)
    items.push(
      evidence({
        source: 'agent_log',
        at: nudges[0]?.at ?? lastNudge.at,
        until: lastNudge.at,
        fact: message('diagnosis.evidence.stopNudges', { count: nudges.length }),
        quote: lastNudge.line,
        count: nudges.length,
      }),
    );
  // Une fois, c'est un raté ; deux fois ou plus, c'est le modèle qu'il faut changer.
  const repeated = runs.length >= 2;
  return [
    {
      code: 'stopped_without_kanban_call',
      confidence: 'certain',
      actor: repeated ? 'you_factory' : 'wait',
      cause: { state: 'none' },
      summary: message('diagnosis.summary.stoppedWithoutKanbanCall', { count: runs.length }),
      why: message('diagnosis.why.stoppedWithoutKanbanCall', {
        nudges: nudges.length > 0 ? nudges.length : null,
      }),
      subject: { profile: lastRun.profile, plugin: null, tool: null },
      setting: null,
      evidence: items,
      steps: repeated
        ? [{ text: message('diagnosis.step.chooseModel'), command: null, done: false }]
        : [],
      runIds: runs.map((run) => run.id),
    },
  ];
};

/** Le disjoncteur d'Hermès : après trois sorties sans appel kanban, la carte bloque sans type. */
export const protocolBreaker: Rule = (ctx) => {
  const gaveUp = ctx
    .eventsOf('gave_up')
    .filter(
      (event) =>
        Number(event.payload['protocol_violations'] ?? 0) > 0 ||
        str(event.payload['error']).includes('protocol violation'),
    )
    .at(-1);
  if (!gaveUp) return [];
  const count = Math.max(
    Number(gaveUp.payload['protocol_violations'] ?? 0),
    ctx.protocolViolations().length,
  );
  return [
    {
      code: 'protocol_breaker',
      confidence: 'certain',
      actor: 'you_factory',
      cause: { state: 'none' },
      summary: message('diagnosis.summary.protocolBreaker', { count }),
      why: message('diagnosis.why.protocolBreaker', { count }),
      subject: { profile: ctx.profile, plugin: null, tool: null },
      setting: null,
      evidence: [
        evidence({
          source: 'kanban',
          at: gaveUp.createdAt,
          fact: message('diagnosis.evidence.breaker', { count }),
          quote: quote(str(gaveUp.payload['error'])),
        }),
      ],
      steps: [],
      runIds: ctx.protocolViolations().map((run) => run.id),
    },
  ];
};

/* --- Limites d'Hermès --------------------------------------------------------------------------- */

export const iterationBudget: Rule = (ctx) => {
  const sources = [
    ...ctx.runs.map((run) => ({ at: run.endedAt ?? ctx.until, runId: run.id, text: run.error })),
    ...ctx.events
      .filter((event) => event.kind === 'timed_out' || event.kind === 'gave_up')
      .map((event) => ({
        at: event.createdAt,
        runId: event.runId,
        text: str(event.payload['error']),
      })),
  ];
  const hits = sources
    .map((source) => ({ ...source, budget: budgetOf(source.text) }))
    .filter((source) => source.budget !== null);
  const last = hits.at(-1);
  if (!last?.budget) return [];
  const { used, max } = last.budget;
  const profile = ctx.input.profile;
  const name = ctx.runOf(last.runId)?.profile ?? ctx.profile ?? '?';
  const facts = profile?.profile === name ? profile : null;
  const current = facts?.maxTurns ?? null;
  // Corrigée quand le plafond de tours dépasse celui qui a coupé, réglé après l'arrêt.
  const cause: Cause = !facts
    ? { state: 'unknown' }
    : current === null || current <= max
      ? { state: 'present' }
      : facts.changedAt !== null && facts.changedAt > last.at
        ? { state: 'fixed', at: facts.changedAt, verified: false, durable: null }
        : { state: 'unknown' };
  return [
    {
      code: 'iteration_budget',
      confidence: 'certain',
      actor: 'you_factory',
      cause,
      summary: message('diagnosis.summary.iterationBudget', { max }),
      why: message('diagnosis.why.iterationBudget', { used, max }),
      subject: { profile: name, plugin: null, tool: null },
      setting: {
        profile: name,
        key: 'agent.max_turns',
        unit: 'turns',
        observed: max,
        current,
        defaultValue: null,
        effective: current,
        repo: null,
      },
      evidence: [
        evidence({
          source: 'kanban',
          at: last.at,
          runId: last.runId,
          fact: message('diagnosis.evidence.budget', { used, max }),
          quote: quote(last.text),
          count: hits.length,
        }),
      ],
      steps: [
        {
          text: message('diagnosis.step.raiseLimit', { key: 'agent.max_turns', profile: name }),
          command: null,
          done: false,
        },
      ],
      runIds: unique(hits.map((hit) => hit.runId).filter((id): id is number => id !== null)),
    },
  ];
};

export const runtimeLimit: Rule = (ctx) => {
  const hits = [
    ...ctx.runs.map((run) => ({
      at: run.endedAt ?? ctx.until,
      runId: run.id,
      limits: runtimeOf(run.error),
    })),
    ...ctx.eventsOf('timed_out').map((event) => ({
      at: event.createdAt,
      runId: event.runId,
      limits:
        typeof event.payload['limit_seconds'] === 'number'
          ? {
              elapsed: Number(event.payload['elapsed_seconds'] ?? 0),
              limit: Number(event.payload['limit_seconds']),
            }
          : null,
    })),
  ].filter((hit) => hit.limits !== null);
  const last = hits.at(-1);
  if (!last?.limits) return [];
  const name = ctx.runOf(last.runId)?.profile ?? ctx.profile ?? '?';
  const current = ctx.input.task.maxRuntimeSeconds;
  return [
    {
      code: 'runtime_limit',
      confidence: 'certain',
      actor: 'you_factory',
      cause:
        current !== null && current > last.limits.limit
          ? { state: 'unknown' }
          : { state: 'present' },
      summary: message('diagnosis.summary.runtimeLimit', { seconds: last.limits.elapsed }),
      why: message('diagnosis.why.runtimeLimit', {
        seconds: last.limits.elapsed,
        limit: last.limits.limit,
      }),
      subject: { profile: name, plugin: null, tool: null },
      setting: {
        profile: name,
        key: 'max_runtime_seconds',
        unit: 'seconds',
        observed: last.limits.limit,
        current,
        defaultValue: null,
        effective: current,
        repo: null,
      },
      evidence: [
        evidence({
          source: 'kanban',
          at: last.at,
          runId: last.runId,
          fact: message('diagnosis.evidence.lastSignals', { count: hits.length }),
          quote: `elapsed ${last.limits.elapsed}s > limit ${last.limits.limit}s`,
        }),
      ],
      steps: [
        {
          text: message('diagnosis.step.raiseLimit', { key: 'max_runtime_seconds', profile: name }),
          command: null,
          done: false,
        },
      ],
      runIds: unique(hits.map((hit) => hit.runId).filter((id): id is number => id !== null)),
    },
  ];
};

/** Un appel d'outil coupé par le plafond d'Hermès, hooks compris (`timeouts.tools.sequential_call`). */
export const toolDeadline: Rule = (ctx) => {
  const hits = ctx.observations.filter((item) => item.outcome.kind === 'tool_deadline');
  const firstHit = first(hits);
  if (!firstHit || firstHit.outcome.kind !== 'tool_deadline') return [];
  const { tool, seconds } = firstHit.outcome;
  const profile = ctx.input.profile;
  const name = ctx.profile ?? '?';
  const current = profile?.toolDeadline ?? null;
  const lastAt = (hits.at(-1) as Observation).result.at;
  const cause: Cause = !profile
    ? { state: 'unknown' }
    : (current ?? TOOL_DEADLINE_DEFAULT) <= seconds
      ? { state: 'present' }
      : profile.changedAt !== null && profile.changedAt > lastAt
        ? { state: 'fixed', at: profile.changedAt, verified: false, durable: null }
        : { state: 'unknown' };
  return [
    {
      code: 'tool_deadline',
      confidence: 'certain',
      actor: 'you_factory',
      cause,
      summary: message('diagnosis.summary.toolDeadline', { tool, seconds }),
      why: message('diagnosis.why.toolDeadline', { tool, seconds }),
      subject: { profile: name, plugin: null, tool },
      setting: {
        profile: name,
        key: DEADLINE_KEY,
        unit: 'seconds',
        observed: seconds,
        current,
        defaultValue: TOOL_DEADLINE_DEFAULT,
        effective: current ?? TOOL_DEADLINE_DEFAULT,
        repo: null,
      },
      evidence: [
        evidence({
          source: 'transcript',
          at: firstHit.result.at,
          until: lastAt,
          fact: message('diagnosis.evidence.toolRefusals', {
            count: hits.length,
            tools: toolsSummary(hits),
          }),
          quote: quote(firstHit.result.content),
          count: hits.length,
        }),
        ...(firstHit.call
          ? [
              evidence({
                source: 'transcript',
                at: firstHit.call.at,
                runId: firstHit.runId,
                fact: message('diagnosis.evidence.trigger', { tool: firstHit.call.tool }),
                quote: quote(firstHit.call.input),
              }),
            ]
          : []),
      ],
      steps: [
        {
          text: message('diagnosis.step.setValue', {
            key: DEADLINE_KEY,
            value: 900,
            profile: name,
          }),
          command: `hermes -p ${name} config set ${DEADLINE_KEY} 900`,
          done: cause.state === 'fixed',
        },
        {
          text: message('diagnosis.step.reportInRepo', { path: `profiles/${name}/config.yaml` }),
          command: null,
          done: false,
        },
      ],
      runIds: unique(hits.map((item) => item.runId).filter((id): id is number => id !== null)),
    },
  ];
};

/** Une commande du terminal arrêtée par son délai : l'agent doit la découper ou la lancer en fond. */
export const commandTimeout: Rule = (ctx) => {
  const blocking = ctx.blockingRunId;
  const hits = ctx.observations.filter(
    (item) =>
      item.outcome.kind === 'command_timeout' && (blocking === null || item.runId === blocking),
  );
  const last = hits.at(-1);
  if (!last || last.outcome.kind !== 'command_timeout') return [];
  const seconds = last.outcome.seconds ?? ctx.input.profile?.terminalTimeout ?? 0;
  return [
    {
      code: 'command_timeout',
      confidence: 'certain',
      actor: 'agent',
      cause: { state: 'none' },
      summary: message('diagnosis.summary.commandTimeout', { seconds }),
      why: message('diagnosis.why.commandTimeout', { seconds }),
      subject: { profile: ctx.profile, plugin: null, tool: 'terminal' },
      setting: null,
      evidence: [
        evidence({
          source: 'transcript',
          at: last.result.at,
          runId: last.runId,
          fact: message('diagnosis.evidence.trigger', { tool: 'terminal' }),
          quote: quote(last.call?.input ?? last.result.content),
          count: hits.length,
        }),
      ],
      steps: [],
      runIds: unique(hits.map((item) => item.runId).filter((id): id is number => id !== null)),
    },
  ];
};

/* --- Refus des gardes ------------------------------------------------------------------------- */

/**
 * Les refus des gardes de la factory. Le même refus trois fois dans une session : l'agent tourne en
 * rond (boucle) ; sinon, un refus n'est retenu que s'il est le dernier mot du run qui a bloqué.
 */
export const guardRefusals: Rule = (ctx) => {
  const refusals = ctx.observations.filter((item) => item.outcome.kind === 'guard');
  if (refusals.length === 0) return [];
  const key = (item: Observation) =>
    item.outcome.kind === 'guard'
      ? `${item.outcome.plugin}\u0000${normalizedRefusal(item.outcome.message)}`
      : '';
  const perSession = new Map<string, Observation[]>();
  for (const item of refusals) {
    const id = `${item.sessionId}\u0000${key(item)}`;
    perSession.set(id, [...(perSession.get(id) ?? []), item]);
  }
  const loops = [...perSession.values()].filter((items) => items.length >= 3);
  if (loops.length > 0) {
    // La boucle la plus récente ; le compte couvre tout l'épisode, toutes sessions confondues.
    const latest = loops.sort(
      (left, right) =>
        (right.at(-1) as Observation).result.at - (left.at(-1) as Observation).result.at,
    )[0] as Observation[];
    const sample = latest.at(-1) as Observation;
    if (sample.outcome.kind !== 'guard') return [];
    const all = refusals.filter((item) => key(item) === key(sample));
    const plugin = sample.outcome.plugin;
    return [
      {
        code: 'refusal_loop',
        confidence: 'certain',
        actor: 'you_answer',
        cause: { state: 'none' },
        summary: message('diagnosis.summary.refusalLoop', { plugin, count: all.length }),
        why: message('diagnosis.why.refusalLoop', { plugin, count: all.length }),
        subject: { profile: ctx.profile, plugin, tool: sample.result.tool },
        setting: null,
        evidence: [
          evidence({
            source: 'transcript',
            at: all[0]?.result.at ?? null,
            until: sample.result.at,
            fact: message('diagnosis.evidence.guardMessage', { plugin, count: all.length }),
            quote: quote(sample.result.content),
            count: all.length,
          }),
        ],
        steps: [
          { text: message('diagnosis.step.giveCommand'), command: null, done: false },
          { text: message('diagnosis.step.unblockWithTemplate'), command: null, done: false },
        ],
        runIds: unique(all.map((item) => item.runId).filter((id): id is number => id !== null)),
      },
    ];
  }
  const blocking = ctx.blockingRunId;
  if (blocking === null) return [];
  const lastRefusal = ctx
    .observationsOfRun(blocking)
    .filter((item) => isRefusal(item.outcome))
    .at(-1);
  if (!lastRefusal || lastRefusal.outcome.kind !== 'guard') return [];
  const plugin = lastRefusal.outcome.plugin;
  const same = refusals.filter((item) => key(item) === key(lastRefusal));
  return [
    {
      code: 'guard_refusal',
      confidence: 'certain',
      actor: 'agent',
      cause: { state: 'none' },
      summary: message('diagnosis.summary.guardRefusal', { plugin }),
      why: message('diagnosis.why.guardRefusal', { plugin }),
      subject: { profile: ctx.profile, plugin, tool: lastRefusal.result.tool },
      setting: null,
      evidence: [
        evidence({
          source: 'transcript',
          at: lastRefusal.result.at,
          runId: lastRefusal.runId,
          fact: message('diagnosis.evidence.guardMessage', { plugin, count: same.length }),
          quote: quote(lastRefusal.result.content),
          count: same.length,
        }),
      ],
      steps: [],
      runIds: [blocking],
    },
  ];
};

/* --- Fournisseurs et lancement ------------------------------------------------------------------ */

export const providerQuota: Rule = (ctx) => {
  const limited = ctx.runs.filter((run) => run.outcome === 'rate_limited');
  const cooldowns = ctx
    .eventsOf('respawn_guarded')
    .filter((event) => event.payload['reason'] === 'rate_limit_cooldown');
  if (limited.length === 0 && cooldowns.length === 0) return [];
  const provider = ctx.logs.filter((fact) => fact.kind === 'api_failed').at(-1)?.plugin ?? null;
  const last = limited.at(-1);
  return [
    {
      code: 'provider_quota',
      confidence: 'certain',
      actor: 'wait',
      cause: { state: 'none' },
      summary: message('diagnosis.summary.providerQuota', { provider }),
      why: message('diagnosis.why.providerQuota', { provider }),
      subject: { profile: ctx.profile, plugin: null, tool: null },
      setting: null,
      evidence: [
        evidence({
          source: 'kanban',
          at: last?.endedAt ?? cooldowns.at(-1)?.createdAt ?? null,
          runId: last?.id ?? null,
          fact: message('diagnosis.evidence.apiErrors', {
            count: Math.max(limited.length, 1),
            provider,
          }),
          quote: quote(last?.error ?? 'respawn_guarded {"reason": "rate_limit_cooldown"}'),
          count: limited.length + cooldowns.length,
        }),
      ],
      steps: [
        {
          text: message('diagnosis.step.wait', { minutes: RATE_LIMIT_COOLDOWN_MINUTES }),
          command: null,
          done: false,
        },
      ],
      runIds: limited.map((run) => run.id),
    },
  ];
};

export const providerTerminal: Rule = (ctx) => {
  const crashes = ctx.events.filter(
    (event) =>
      (event.kind === 'crashed' || event.kind === 'gave_up') &&
      (event.payload['terminal_provider'] === true ||
        event.payload['exit_kind'] === 'terminal_provider'),
  );
  const last = crashes.at(-1);
  if (!last) return [];
  return [
    {
      code: 'provider_terminal',
      confidence: 'certain',
      actor: 'you_factory',
      cause: { state: 'present' },
      summary: message('diagnosis.summary.providerTerminal', { provider: null }),
      why: message('diagnosis.why.providerTerminal', { provider: null }),
      subject: { profile: ctx.profile, plugin: null, tool: null },
      setting: null,
      evidence: [
        evidence({
          source: 'kanban',
          at: last.createdAt,
          runId: last.runId,
          fact: message('diagnosis.evidence.workerOutput'),
          quote: quote(str(last.payload['worker_output']) || str(last.payload['error'])),
        }),
      ],
      steps: [
        {
          text: message('diagnosis.step.checkProvider', { provider: null }),
          command: null,
          done: false,
        },
      ],
      runIds: unique(crashes.map((event) => event.runId).filter((id): id is number => id !== null)),
    },
  ];
};

/** Le fournisseur ne répond plus (garde-fou de progression), ou toute la chaîne de repli échoue. */
export const providerUnavailable: Rule = (ctx) => {
  const hits = ctx.runs
    .filter((run) => run.outcome === 'crashed')
    .map((run) => ({ run, failure: providerFailureOf(workerOutput(ctx, run.id) ?? run.error) }))
    .filter((hit) => hit.failure !== null);
  const last = hits.at(-1);
  if (!last?.failure) return [];
  const { mode, seconds } = last.failure;
  return [
    {
      code: 'provider_unavailable',
      confidence: 'certain',
      actor: 'you_factory',
      cause: { state: 'unknown' },
      summary: message('diagnosis.summary.providerUnavailable', { mode, seconds }),
      why: message('diagnosis.why.providerUnavailable', { mode, seconds }),
      subject: { profile: last.run.profile, plugin: null, tool: null },
      setting: null,
      evidence: [
        evidence({
          source: 'kanban',
          at: last.run.endedAt,
          runId: last.run.id,
          fact: message('diagnosis.evidence.workerOutput'),
          quote: quote(workerOutput(ctx, last.run.id) ?? last.run.error),
          count: hits.length,
        }),
      ],
      steps: [
        {
          text: message('diagnosis.step.checkProvider', { provider: null }),
          command: null,
          done: false,
        },
        { text: message('diagnosis.step.chooseModel'), command: null, done: false },
      ],
      runIds: hits.map((hit) => hit.run.id),
    },
  ];
};

/** Le lancement du worker échoue (workspace introuvable, board sans dossier par défaut...). */
export const spawnFailed: Rule = (ctx) => {
  const failures = ctx.events.filter(
    (event) =>
      event.kind === 'spawn_failed' ||
      (event.kind === 'gave_up' && event.payload['trigger_outcome'] === 'spawn_failed'),
  );
  const last = failures.at(-1);
  if (!last) return [];
  const error = str(last.payload['error']);
  return [
    {
      code: 'spawn_failed',
      confidence: 'certain',
      actor: 'you_factory',
      cause: { state: 'present' },
      summary: message('diagnosis.summary.spawnFailed'),
      why: message('diagnosis.why.spawnFailed'),
      subject: { profile: ctx.profile, plugin: null, tool: null },
      setting: null,
      evidence: [
        evidence({
          source: 'kanban',
          at: last.createdAt,
          runId: last.runId,
          fact: message('diagnosis.evidence.spawnError'),
          quote: quote(error),
          count: failures.length,
        }),
      ],
      steps: error.startsWith('workspace:')
        ? [{ text: message('diagnosis.step.fixWorkspace'), command: null, done: false }]
        : [],
      runIds: unique(
        failures.map((event) => event.runId).filter((id): id is number => id !== null),
      ),
    },
  ];
};

/** Le contrôle de PR du noyau kanban refuse `kanban_complete` : GitHub injoignable, ou contrat incomplet. */
export const prAcceptance: Rule = (ctx) => {
  const results = ctx.observations.filter((item) => item.outcome.kind === 'pr_acceptance');
  const events = ctx.eventsOf('pr_acceptance');
  const lastOk = events.filter((event) => event.payload['ok'] === true).at(-1);
  const findings: Finding[] = [];
  for (const classification of ['infra', 'missing'] as const) {
    const fromEvents = events.filter(
      (event) =>
        event.payload['classification'] === classification && (!lastOk || event.id > lastOk.id),
    );
    const fromResults = results.filter(
      (item) =>
        item.outcome.kind === 'pr_acceptance' && item.outcome.classification === classification,
    );
    const count = Math.max(fromEvents.length, fromResults.length);
    if (count === 0) continue;
    const sample = fromResults.at(-1);
    const detail =
      sample?.outcome.kind === 'pr_acceptance'
        ? sample.outcome.detail
        : str(fromEvents.at(-1)?.payload['detail']);
    const checks = /No repository-required checks are configured/.test(detail);
    const infra = classification === 'infra';
    findings.push({
      code: infra ? 'pr_acceptance_infra' : 'pr_acceptance_missing',
      confidence: 'certain',
      actor: infra || checks ? 'you_factory' : 'agent',
      cause: infra || checks ? { state: 'present' } : { state: 'none' },
      summary: message(
        infra ? 'diagnosis.summary.prAcceptanceInfra' : 'diagnosis.summary.prAcceptanceMissing',
      ),
      why: infra
        ? message('diagnosis.why.prAcceptanceInfra')
        : message('diagnosis.why.prAcceptanceMissing', { checks }),
      subject: { profile: ctx.profile, plugin: null, tool: 'kanban_complete' },
      setting: null,
      evidence: [
        evidence({
          source: sample ? 'transcript' : 'kanban',
          at: sample?.result.at ?? fromEvents.at(-1)?.createdAt ?? null,
          runId: sample?.runId ?? fromEvents.at(-1)?.runId ?? null,
          fact: message('diagnosis.evidence.prAcceptance', { classification, count }),
          quote: quote(sample ? sample.result.content : detail),
          count,
        }),
      ],
      steps: infra
        ? [{ text: message('diagnosis.step.updateGh'), command: null, done: false }]
        : checks
          ? [{ text: message('diagnosis.step.configureChecks'), command: null, done: false }]
          : [],
      runIds: unique(
        [
          ...fromResults.map((item) => item.runId),
          ...fromEvents.map((event) => event.runId),
        ].filter((id): id is number => id !== null),
      ),
    });
  }
  return findings;
};

/* --- État de la carte ------------------------------------------------------------------------- */

/** Une carte prête que la garde `active_pr` d'Hermès retient : il faut un relais. */
export const heldActivePr: Rule = (ctx) => {
  const task = ctx.input.task;
  if (task.status !== 'ready') return [];
  const held = ctx.input.events.filter(
    (event) => event.kind === 'respawn_guarded' && event.payload['reason'] === 'active_pr',
  );
  const firstHeld = first(held);
  if (!firstHeld) return [];
  const owner = ctx.input.owner ?? task.assignee ?? 'coder';
  const minutes = Math.max(1, Math.round((ctx.input.now - firstHeld.createdAt) / 60));
  return [
    {
      code: 'held_active_pr',
      confidence: 'certain',
      actor: 'you_factory',
      cause: { state: 'present' },
      summary: message('diagnosis.summary.heldActivePr', { minutes }),
      why: message('diagnosis.why.heldActivePr'),
      subject: { profile: task.assignee, plugin: null, tool: null },
      setting: null,
      evidence: [
        evidence({
          source: 'kanban',
          at: firstHeld.createdAt,
          until: (held.at(-1) ?? firstHeld).createdAt,
          fact: message('diagnosis.evidence.lastSignals', { count: held.length }),
          quote: 'respawn_guarded {"reason": "active_pr"}',
          count: held.length,
        }),
      ],
      steps: [
        {
          text: message('diagnosis.step.relay', { owner }),
          command: `hermes kanban --board ${ctx.input.board} reassign ${task.id} scribe --reason "relais active_pr" && hermes kanban --board ${ctx.input.board} reassign ${task.id} ${owner} --reason "reprise sur la PR"`,
          done: false,
        },
      ],
      runIds: [],
    },
  ];
};

/** Deux blocages du même type d'affilée : la carte est en triage, « Débloquer » ne s'applique plus. */
export const triageLoop: Rule = (ctx) => {
  const task = ctx.input.task;
  const loop = ctx.input.events.filter((event) => event.kind === 'block_loop_detected').at(-1);
  if (task.status !== 'triage' || !loop) return [];
  return [
    {
      code: 'triage_loop',
      confidence: 'certain',
      actor: 'you_factory',
      cause: { state: 'present' },
      summary: message('diagnosis.summary.triageLoop'),
      why: message('diagnosis.why.triageLoop'),
      subject: { profile: task.assignee, plugin: null, tool: null },
      setting: null,
      evidence: [
        evidence({
          source: 'kanban',
          at: loop.createdAt,
          runId: loop.runId,
          fact: message('diagnosis.evidence.lastSignals', {
            count: Number(loop.payload['recurrences'] ?? 2),
          }),
          quote: quote(str(loop.payload['reason'])),
        }),
      ],
      steps: [{ text: message('diagnosis.step.leaveTriage'), command: null, done: false }],
      runIds: loop.runId !== null ? [loop.runId] : [],
    },
  ];
};

export const RULES: readonly Rule[] = [
  guardHookTimeout,
  guardHookHung,
  guardHookRaised,
  pluginLoadFailed,
  stoppedAfterRefusals,
  stoppedWithoutKanbanCall,
  protocolBreaker,
  iterationBudget,
  runtimeLimit,
  toolDeadline,
  commandTimeout,
  guardRefusals,
  providerQuota,
  providerTerminal,
  providerUnavailable,
  spawnFailed,
  prAcceptance,
  heldActivePr,
  triageLoop,
];
