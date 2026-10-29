import { z } from 'zod';
import { BlockKind } from './common.ts';

/*
 * Les textes que factory-live fabrique lui-même (fil d'activité, timeline d'une issue, interventions,
 * santé de ses sources...) ne circulent pas en toutes lettres : un code et ses paramètres, que le
 * client écrit dans la langue choisie. Ce catalogue fait foi : le domaine et le serveur n'émettent
 * que ces codes (vérifié à la compilation), et chaque dictionnaire du client doit les couvrir tous.
 * Ce qui vient d'ailleurs (agents, outils, kanban, sonde, GitHub) reste une chaîne, montrée telle quelle.
 */

function message<const C extends string, S extends z.ZodRawShape>(code: C, params: S) {
  return z.object({ code: z.literal(code), params: z.object(params) });
}

const none = {};
const count = z.number().int().nonnegative();
const seconds = { seconds: z.number().nonnegative() };
const attempt = { attempt: count.nullable(), attempts: count.nullable() };

export const Message = z.discriminatedUnion('code', [
  // Fil d'activité et action en cours (webhooks d'Hermès).
  message('activity.tool.unknown', none),
  message('activity.action.llm', none),
  message('activity.llm.tokens', { input: count, output: count }),
  message('activity.llm.rateLimited', { model: z.string(), ...attempt }),
  message('activity.llm.error', {
    status: z.number().int().nullable(),
    model: z.string(),
    ...attempt,
  }),
  message('activity.skill', { action: z.string() }),
  message('activity.session.end', { outcome: z.enum(['completed', 'failed', 'interrupted']) }),
  message('activity.kanban.claimed', { profile: z.string() }),
  message('activity.worker.spawned', none),
  message('activity.worker.exited', none),
  message('activity.worker.stale', none),
  message('activity.subagent.start', none),
  message('activity.subagent.stop', none),

  // Timeline d'une issue (événements du kanban, commentaires).
  message('timeline.created', none),
  message('timeline.created.for', { assignee: z.string() }),
  message('timeline.claimed', none),
  message('timeline.promoted', none),
  message('timeline.promoted.detail', none),
  message('timeline.status', { status: z.string() }),
  message('timeline.assigned', { assignee: z.string().nullable() }),
  message('timeline.assigned.from', { from: z.string() }),
  message('timeline.edited', none),
  message('timeline.attached', none),
  message('timeline.scheduled', none),
  message('timeline.reviewRequested', { reviewer: z.string().nullable() }),
  message('timeline.reviewReopened', none),
  message('timeline.changesRequested', { reviewer: z.string().nullable() }),
  message('timeline.prChecks.passed', none),
  message('timeline.prChecks.failed', none),
  message('timeline.completed', none),
  message('timeline.archived', none),
  message('timeline.blocked', { kind: BlockKind.nullable() }),
  message('timeline.unblocked', none),
  message('timeline.blockLoop', none),
  message('timeline.respawnGuarded', none),
  message('timeline.respawnGuarded.activePr', none),
  message('timeline.dependencyWait', none),
  message('timeline.reclaimed', none),
  message('timeline.reclaimed.manual', none),
  message('timeline.crashed', none),
  message('timeline.timedOut', none),
  message('timeline.rateLimited', none),
  message('timeline.protocolViolation', none),
  message('timeline.protocolViolation.nudged', none),
  message('timeline.spawnFailed', none),
  message('timeline.gaveUp', { failures: count.nullable() }),
  message('timeline.workerReaped', none),
  message('timeline.modelOverride', { model: z.string().nullable() }),
  message('timeline.reasoningEffort', { effort: z.string().nullable() }),
  message('timeline.comment', { author: z.string() }),

  // Interventions : titres et questions de secours (sans raison de l'agent), actions proposées.
  message('intervention.title.prReady', none),
  message('intervention.title.mainRed', none),
  message('intervention.title.gaveUp', { failures: count.nullable() }),
  message('intervention.title.needsInput', none),
  message('intervention.title.capability', none),
  message('intervention.title.transient', none),
  message('intervention.title.blocked', none),
  message('intervention.title.triageLoop', none),
  message('intervention.title.held', { minutes: count }),
  message('intervention.question.prReady', none),
  message('intervention.question.gaveUp', none),
  message('intervention.question.needsInput', none),
  message('intervention.question.capability', none),
  message('intervention.question.transient', none),
  message('intervention.question.blocked', none),
  message('intervention.question.triageLoop', none),
  message('intervention.question.held', none),
  message('intervention.action.openIssue', { issueKey: z.string() }),
  message('intervention.action.showCard', none),
  message('intervention.action.approvePr', none),
  message('intervention.action.prWorkflows', none),
  message('intervention.action.reassignCoder', none),
  message('intervention.action.dashboard', none),
  message('intervention.action.relay', { owner: z.string() }),

  // Diagnostic d'un blocage (contrat `Diagnosis`) : la cause en une ligne, son mécanisme, les faits
  // qui la fondent, les étapes, le verdict de chaque run et la réponse préremplie.
  message('diagnosis.summary.guardHookTimeout', { plugin: z.string().nullable(), ...seconds }),
  message('diagnosis.summary.guardHookHung', { plugin: z.string().nullable() }),
  message('diagnosis.summary.guardHookRaised', { plugin: z.string().nullable() }),
  message('diagnosis.summary.pluginLoadFailed', { plugin: z.string() }),
  message('diagnosis.summary.stoppedAfterRefusals', none),
  message('diagnosis.summary.stoppedWithoutKanbanCall', { count }),
  message('diagnosis.summary.protocolBreaker', { count }),
  message('diagnosis.summary.iterationBudget', { max: count }),
  message('diagnosis.summary.runtimeLimit', seconds),
  message('diagnosis.summary.toolDeadline', { tool: z.string(), ...seconds }),
  message('diagnosis.summary.commandTimeout', seconds),
  message('diagnosis.summary.guardRefusal', { plugin: z.string() }),
  message('diagnosis.summary.refusalLoop', { plugin: z.string(), count }),
  message('diagnosis.summary.providerQuota', { provider: z.string().nullable() }),
  message('diagnosis.summary.providerTerminal', { provider: z.string().nullable() }),
  message('diagnosis.summary.providerUnavailable', {
    mode: z.enum(['stalled', 'failing']),
    seconds: z.number().nonnegative().nullable(),
  }),
  message('diagnosis.summary.prAcceptanceInfra', none),
  message('diagnosis.summary.prAcceptanceMissing', none),
  message('diagnosis.summary.spawnFailed', none),
  message('diagnosis.summary.heldActivePr', { minutes: count }),
  message('diagnosis.summary.triageLoop', none),
  message('diagnosis.summary.question', none),
  message('diagnosis.summary.unexplained', none),
  message('diagnosis.why.guardHookTimeout', {
    plugin: z.string().nullable(),
    trigger: z.string().nullable(),
    ...seconds,
  }),
  message('diagnosis.why.guardHookHung', {
    plugin: z.string().nullable(),
    workers: count.nullable(),
  }),
  message('diagnosis.why.guardHookRaised', { plugin: z.string().nullable() }),
  message('diagnosis.why.pluginLoadFailed', { plugin: z.string() }),
  message('diagnosis.why.stoppedAfterRefusals', none),
  message('diagnosis.why.stoppedWithoutKanbanCall', { nudges: count.nullable() }),
  message('diagnosis.why.protocolBreaker', { count }),
  message('diagnosis.why.iterationBudget', { used: count, max: count }),
  message('diagnosis.why.runtimeLimit', { ...seconds, limit: z.number().nonnegative() }),
  message('diagnosis.why.toolDeadline', { tool: z.string(), ...seconds }),
  message('diagnosis.why.commandTimeout', seconds),
  message('diagnosis.why.guardRefusal', { plugin: z.string() }),
  message('diagnosis.why.refusalLoop', { plugin: z.string(), count }),
  message('diagnosis.why.providerQuota', { provider: z.string().nullable() }),
  message('diagnosis.why.providerTerminal', { provider: z.string().nullable() }),
  message('diagnosis.why.providerUnavailable', {
    mode: z.enum(['stalled', 'failing']),
    seconds: z.number().nonnegative().nullable(),
  }),
  message('diagnosis.why.prAcceptanceInfra', none),
  message('diagnosis.why.prAcceptanceMissing', { checks: z.boolean() }),
  message('diagnosis.why.spawnFailed', none),
  message('diagnosis.why.heldActivePr', none),
  message('diagnosis.why.triageLoop', none),
  message('diagnosis.why.question', none),
  message('diagnosis.why.unexplained', none),
  message('diagnosis.step.setValue', {
    key: z.string(),
    value: z.number().nonnegative(),
    profile: z.string(),
  }),
  message('diagnosis.step.reportInRepo', { path: z.string() }),
  message('diagnosis.step.verifyValue', { key: z.string() }),
  message('diagnosis.step.unblockWithTemplate', none),
  message('diagnosis.step.answer', none),
  message('diagnosis.step.fixPlugin', { plugin: z.string() }),
  message('diagnosis.step.reinstall', none),
  message('diagnosis.step.chooseModel', none),
  message('diagnosis.step.giveCommand', none),
  message('diagnosis.step.wait', { minutes: count }),
  message('diagnosis.step.checkProvider', { provider: z.string().nullable() }),
  message('diagnosis.step.relay', { owner: z.string() }),
  message('diagnosis.step.leaveTriage', none),
  message('diagnosis.step.raiseLimit', { key: z.string(), profile: z.string() }),
  message('diagnosis.step.updateGh', none),
  message('diagnosis.step.configureChecks', none),
  message('diagnosis.step.fixWorkspace', none),
  message('diagnosis.evidence.toolRefusals', { count, tools: z.string() }),
  message('diagnosis.evidence.hookTimedOut', { callback: z.string(), ...seconds }),
  message('diagnosis.evidence.trigger', { tool: z.string() }),
  message('diagnosis.evidence.settingMissing', { key: z.string(), ...seconds }),
  message('diagnosis.evidence.settingValue', { key: z.string(), value: z.number().nonnegative() }),
  message('diagnosis.evidence.settingChanged', {
    key: z.string(),
    value: z.number().nonnegative(),
  }),
  message('diagnosis.evidence.toolDeadlineCap', seconds),
  message('diagnosis.evidence.pluginHook', {
    plugin: z.string(),
    callback: z.string(),
    hook: z.string(),
  }),
  message('diagnosis.evidence.workerExited', none),
  message('diagnosis.evidence.stopNudges', { count }),
  message('diagnosis.evidence.guardMessage', { plugin: z.string(), count }),
  message('diagnosis.evidence.commitPassed', seconds),
  message('diagnosis.evidence.breaker', { count }),
  message('diagnosis.evidence.apiErrors', { count, provider: z.string().nullable() }),
  message('diagnosis.evidence.lastSignals', { count }),
  message('diagnosis.evidence.kanbanErrors', { count, tool: z.string() }),
  message('diagnosis.evidence.prAcceptance', {
    classification: z.string(),
    count,
  }),
  message('diagnosis.evidence.spawnError', none),
  message('diagnosis.evidence.workerOutput', none),
  message('diagnosis.evidence.budget', { used: count, max: count }),
  message('diagnosis.run.modelStopped', none),
  message('diagnosis.run.refusedThenStopped', { count }),
  message('diagnosis.run.blockedAfterRefusals', { count }),
  message('diagnosis.run.breaker', none),
  message('diagnosis.run.timedOut', none),
  message('diagnosis.run.quota', none),
  message('diagnosis.run.refusalLoop', { count }),
  message('diagnosis.run.providerUnavailable', none),
  message('diagnosis.run.spawnFailed', none),
  message('diagnosis.run.prAcceptance', none),
  message('diagnosis.run.question', none),
  message('diagnosis.run.unexplained', { outcome: z.string() }),
  message('diagnosis.unblock.hookTimeoutFixed', {
    plugin: z.string().nullable(),
    ...seconds,
    value: z.number().nonnegative(),
    branch: z.string().nullable(),
    committed: z.boolean(),
    evidence: count.nullable(),
  }),
  message('diagnosis.unblock.causeFixed', { branch: z.string().nullable() }),
  message('diagnosis.unblock.refusalLoop', { plugin: z.string(), refusal: z.string() }),
  message('diagnosis.unblock.finishWithKanbanCall', none),

  // Santé : les services que factory-live observe lui-même et ses propres sources.
  message('health.gateway', none),
  message('health.gateway.running', seconds),
  message('health.gateway.silent', seconds),
  message('health.gateway.never', none),
  message('health.dispatcher', none),
  message('health.dispatcher.noTick', none),
  message('health.dispatcher.paused', seconds),
  message('health.dispatcher.lastTick', seconds),
  message('health.webhook', none),
  message('health.notReported', none),
  message('health.provider', { provider: z.string() }),
  message('health.nvidia', none),
  message('health.provider.lastOk', seconds),
  message('health.provider.none', none),
  message('health.claude', none),
  message('health.claude.none', none),
  message('health.claude.lastSession', seconds),
  message('health.github', none),
  message('health.github.notYet', none),
  message('health.github.ok', none),
  message('health.github.token', none),
  message('health.github.app.user', { slug: z.string(), login: z.string() }),
  message('health.github.app.fallback', { slug: z.string() }),
  message('health.github.app.loginNeeded', { slug: z.string() }),
  message('health.github.noAccess', none),
  message('health.github.loginToWrite', none),
  message('health.github.unauthorized', none),
  message('health.github.forbidden', none),
  message('health.github.error', { status: z.number().int().nullable(), issue: z.string() }),
  message('health.github.noToken', none),
  message('health.githubDeliveries', none),
  message('health.githubDeliveries.last', { status: z.number().int(), ...seconds }),
  message('health.probe', none),
  message('health.probe.last', seconds),
  message('health.probe.none', none),
  message('health.sources', none),
  message('health.sources.detail', {
    kanban: z.enum(['pending', 'read', 'failed']),
    cards: count,
    kanbanError: z.string().nullable(),
    sessionsError: z.string().nullable(),
  }),
  message('health.metric.running', none),
  message('health.metric.perAgent', none),
  message('health.metric.rateLimited', none),
  message('health.metric.quota', none),
  message('health.metric.hooksPerMinute', none),
  message('health.metric.lastHook', none),
  message('health.value.ofTotal', { value: count, total: count.nullable() }),
  message('health.value.atMost', { max: count }),
  message('health.value.none', none),
  message('health.value.ago', seconds),
  message('health.guards', none),
  message('health.guards.ok', none),
  message('health.guards.risk', { count }),
  message('health.guards.riskItem', { profile: z.string(), plugin: z.string() }),
  message('health.guards.limits', {
    longest: z.number().nonnegative(),
    limit: z.number().nonnegative(),
  }),

  // Événements GitHub et suivi d'un déblocage, racontés par factory-live (sources `github` et
  // `factory-live` de la timeline, type `github` du fil) : la démo les montre, le serveur pas encore.
  message('github.labeled', { label: z.string(), actor: z.string() }),
  message('github.prOpened', { pr: count, draft: z.boolean() }),
  message('github.diffstat', { additions: count, deletions: count, files: count }),
  message('github.reviewRequested', {
    pr: count,
    reviewer: z.string(),
    autoMerge: z.boolean().nullable(),
  }),
  message('github.merged', none),
  message('github.answerPosted', { issueKey: z.string() }),
  message('github.answerAcknowledged', none),
  message('unblock.sent', none),

  // Transcriptions, agents, coûts, notifications.
  message('transcript.hermes', { profile: z.string(), session: z.string().nullable() }),
  message('transcript.claudeCode', { costUsd: z.number().nonnegative().nullable() }),
  message('agent.role.default', none),
  message('usage.claudeNote', none),
  message('push.test.title', none),
  message('push.test.body', none),
]);
export type Message = z.infer<typeof Message>;
export type MessageCode = Message['code'];
export type MessageParams<C extends MessageCode> = Extract<Message, { code: C }>['params'];

/**
 * Un texte affiché : écrit ailleurs (agent, outil, kanban, sonde, GitHub) et montré tel quel, ou
 * fabriqué par factory-live (`Message`) et écrit par le client dans sa langue.
 */
export type Text = string | Message;
// Type nommé : sans lui, chaque champ `Text` recopie tout le catalogue dans les types déclarés, et le
// flux SSE (instantané, interventions, diagnostics) dépasse ce que le compilateur sait écrire.
export const Text: z.ZodType<Text> = z.union([z.string(), Message]);

type Args<C extends MessageCode> =
  Record<string, never> extends MessageParams<C>
    ? [params?: MessageParams<C>]
    : [params: MessageParams<C>];

/** Un texte fabriqué : `msg('health.probe.last', { seconds: 8 })`, `msg('health.probe')`. */
export function msg<C extends MessageCode>(
  code: C,
  ...[params]: Args<C>
): Extract<Message, { code: C }> {
  return { code, params: params ?? {} } as Extract<Message, { code: C }>;
}
