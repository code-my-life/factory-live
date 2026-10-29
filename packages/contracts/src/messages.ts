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
export const Text = z.union([z.string(), Message]);
export type Text = z.infer<typeof Text>;

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
