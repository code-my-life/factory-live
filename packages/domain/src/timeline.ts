import type { BlockKind, Run, TaskEvent } from './hermes.ts';
import { wasNudged } from './diagnosis/hermesText.ts';
import { message } from './messages.ts';
import type { Message, Text } from './messages.ts';
import { redactSecrets } from './redact.ts';

/** Commentaire d'une carte (`task_comments`). */
export interface Comment {
  id: number;
  taskId: string;
  author: string;
  body: string;
  /** Secondes epoch. */
  createdAt: number;
}

export type Tone = 'neutral' | 'success' | 'attention' | 'danger' | 'done';

/** Ce que la timeline écrit elle-même ; les raisons, résumés et commentaires restent tels quels. */
export type TimelineMessage =
  | Message<'timeline.created'>
  | Message<'timeline.created.for', { assignee: string }>
  | Message<'timeline.claimed'>
  | Message<'timeline.promoted'>
  | Message<'timeline.promoted.detail'>
  | Message<'timeline.status', { status: string }>
  | Message<'timeline.assigned', { assignee: string | null }>
  | Message<'timeline.assigned.from', { from: string }>
  | Message<'timeline.edited'>
  | Message<'timeline.attached'>
  | Message<'timeline.scheduled'>
  | Message<'timeline.reviewRequested', { reviewer: string | null }>
  | Message<'timeline.reviewReopened'>
  | Message<'timeline.changesRequested', { reviewer: string | null }>
  | Message<'timeline.prChecks.passed'>
  | Message<'timeline.prChecks.failed'>
  | Message<'timeline.completed'>
  | Message<'timeline.archived'>
  | Message<'timeline.blocked', { kind: BlockKind | null }>
  | Message<'timeline.unblocked'>
  | Message<'timeline.blockLoop'>
  | Message<'timeline.respawnGuarded'>
  | Message<'timeline.respawnGuarded.activePr'>
  | Message<'timeline.dependencyWait'>
  | Message<'timeline.reclaimed'>
  | Message<'timeline.reclaimed.manual'>
  | Message<'timeline.crashed'>
  | Message<'timeline.timedOut'>
  | Message<'timeline.rateLimited'>
  | Message<'timeline.protocolViolation'>
  | Message<'timeline.protocolViolation.nudged'>
  | Message<'timeline.spawnFailed'>
  | Message<'timeline.gaveUp', { failures: number | null }>
  | Message<'timeline.workerReaped'>
  | Message<'timeline.modelOverride', { model: string | null }>
  | Message<'timeline.reasoningEffort', { effort: string | null }>
  | Message<'timeline.comment', { author: string }>;

export type TimelineText = Text<TimelineMessage>;

export interface TimelineItem {
  id: string;
  /** Secondes epoch. */
  at: number;
  source: 'kanban' | 'comment';
  profile: string | null;
  cardId: string;
  label: TimelineText;
  detail: TimelineText | null;
  tone: Tone;
  /** Événement répété à chaque tick, fusionné : combien de fois (absent pour une seule). */
  repeats?: number;
}

type Payload = Readonly<Record<string, unknown>>;
type Describe = (
  payload: Payload,
) => { label: TimelineText; detail?: TimelineText | null; tone?: Tone } | null;

const DETAIL_MAX = 280;
/** Événements répétés à chaque tick tant que la situation dure : une seule ligne, avec le nombre. */
const REPEATING = new Set(['respawn_guarded', 'dependency_wait']);

const BLOCK_KINDS: ReadonlySet<string> = new Set<BlockKind>([
  'needs_input',
  'capability',
  'transient',
  'dependency',
]);

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function clip(value: TimelineText | null): TimelineText | null {
  if (!value || typeof value !== 'string') return value;
  const clean = redactSecrets(value).trim();
  return clean.length > DETAIL_MAX ? `${clean.slice(0, DETAIL_MAX - 1)}…` : clean;
}

function blockKind(value: unknown): BlockKind | null {
  const kind = text(value);
  return kind && BLOCK_KINDS.has(kind) ? (kind as BlockKind) : null;
}

/** Libellés des événements de `task_events` (types relevés sur le board réel le 2026-10-28). */
const DESCRIBE: Readonly<Record<string, Describe>> = {
  heartbeat: () => null,
  commented: () => null,
  spawned: () => null,
  linked: () => null,
  unlinked: () => null,
  created: (p) => {
    const assignee = text(p['assignee']);
    return {
      label: message('timeline.created'),
      detail: assignee ? message('timeline.created.for', { assignee }) : null,
    };
  },
  claimed: () => ({ label: message('timeline.claimed') }),
  promoted: () => ({
    label: message('timeline.promoted'),
    detail: message('timeline.promoted.detail'),
  }),
  status: (p) => ({ label: message('timeline.status', { status: text(p['status']) ?? '?' }) }),
  assigned: (p) => {
    const from = text(p['from']);
    return {
      label: message('timeline.assigned', { assignee: text(p['assignee']) }),
      detail: from ? message('timeline.assigned.from', { from }) : null,
    };
  },
  edited: (p) => ({
    label: message('timeline.edited'),
    detail: Array.isArray(p['fields']) ? p['fields'].join(', ') : null,
  }),
  attached: (p) => ({ label: message('timeline.attached'), detail: text(p['filename']) }),
  scheduled: (p) => ({ label: message('timeline.scheduled'), detail: text(p['reason']) }),
  review_requested: (p) => ({
    label: message('timeline.reviewRequested', { reviewer: text(p['reviewer']) }),
    detail: text(p['summary']),
    tone: 'attention',
  }),
  review_reopened: () => ({ label: message('timeline.reviewReopened'), tone: 'attention' }),
  changes_requested: (p) => ({
    label: message('timeline.changesRequested', { reviewer: text(p['reviewer']) }),
    detail: text(p['reason']),
    tone: 'danger',
  }),
  pr_acceptance: (p) =>
    p['ok'] === true
      ? {
          label: message('timeline.prChecks.passed'),
          detail: text(p['pr_url']),
          tone: 'success',
        }
      : {
          label: message('timeline.prChecks.failed'),
          detail: text(p['classification']) ?? text(p['pr_url']),
          tone: 'danger',
        },
  completed: (p) => ({
    label: message('timeline.completed'),
    detail: text(p['summary']),
    tone: 'done',
  }),
  archived: () => ({ label: message('timeline.archived') }),
  blocked: (p) => ({
    label: message('timeline.blocked', { kind: blockKind(p['kind']) }),
    detail: text(p['reason']),
    tone: 'danger',
  }),
  unblocked: () => ({ label: message('timeline.unblocked'), tone: 'success' }),
  block_loop_detected: () => ({ label: message('timeline.blockLoop'), tone: 'danger' }),
  respawn_guarded: (p) => ({
    label: message('timeline.respawnGuarded'),
    detail:
      p['reason'] === 'active_pr' ? message('timeline.respawnGuarded.activePr') : text(p['reason']),
    tone: 'attention',
  }),
  dependency_wait: (p) => ({
    label: message('timeline.dependencyWait'),
    detail: text(p['parent']),
  }),
  reclaimed: (p) => ({
    label: message('timeline.reclaimed'),
    detail: p['manual'] === true ? message('timeline.reclaimed.manual') : text(p['reason']),
    tone: 'attention',
  }),
  crashed: (p) => ({
    label: message('timeline.crashed'),
    detail:
      [text(p['exit_kind']), typeof p['exit_code'] === 'number' ? `code ${p['exit_code']}` : null]
        .filter(Boolean)
        .join(', ') || null,
    tone: 'danger',
  }),
  timed_out: (p) => ({
    label: message('timeline.timedOut'),
    detail: text(p['error']),
    tone: 'danger',
  }),
  rate_limited: () => ({ label: message('timeline.rateLimited'), tone: 'attention' }),
  // Hermès a relancé l'agent pour qu'il rende la carte (texte exact de sa sortie), sans succès.
  protocol_violation: (p) => ({
    label: message('timeline.protocolViolation'),
    detail: wasNudged(text(p['worker_output']))
      ? message('timeline.protocolViolation.nudged')
      : null,
    tone: 'danger',
  }),
  spawn_failed: (p) => ({
    label: message('timeline.spawnFailed'),
    detail: text(p['error']),
    tone: 'danger',
  }),
  gave_up: (p) => ({
    label: message('timeline.gaveUp', { failures: Number(p['failures'] ?? 0) || null }),
    detail: text(p['error']),
    tone: 'danger',
  }),
  terminal_worker_reaped: () => ({ label: message('timeline.workerReaped') }),
  model_override_set: (p) => ({
    label: message('timeline.modelOverride', { model: text(p['model']) }),
    detail: text(p['provider']),
  }),
  reasoning_effort_set: (p) => ({
    label: message('timeline.reasoningEffort', { effort: text(p['reasoning_effort']) }),
  }),
};

/**
 * Timeline des cartes d'une issue, dans l'ordre : événements du kanban et commentaires, textes masqués,
 * répétitions de tick fusionnées. Le profil d'un événement est celui de son run, sinon l'assigné de la carte.
 */
export function timelineOf(
  cardIds: readonly string[],
  events: readonly TaskEvent[],
  comments: readonly Comment[],
  runs: readonly Run[],
  assignees: ReadonlyMap<string, string | null>,
): TimelineItem[] {
  const cards = new Set(cardIds);
  const profileOfRun = new Map(runs.map((run) => [run.id, run.profile]));
  const items: TimelineItem[] = [];
  const counts = new Map<TimelineItem, number>();
  const lastRepeat = new Map<string, TimelineItem>();

  const ordered = events
    .filter((event) => cards.has(event.taskId))
    .sort((left, right) => left.createdAt - right.createdAt || left.id - right.id);
  for (const event of ordered) {
    const describe: Describe = DESCRIBE[event.kind] ?? (() => ({ label: event.kind }));
    const described = describe(event.payload);
    if (!described) continue;
    const repeatKey = `${event.taskId}:${event.kind}:${JSON.stringify(event.payload)}`;
    const previous = REPEATING.has(event.kind) ? lastRepeat.get(repeatKey) : undefined;
    if (previous) {
      counts.set(previous, (counts.get(previous) ?? 1) + 1);
      continue;
    }
    const item: TimelineItem = {
      id: `event:${event.id}`,
      at: event.createdAt,
      source: 'kanban',
      profile:
        (event.runId !== null ? profileOfRun.get(event.runId) : undefined) ??
        assignees.get(event.taskId) ??
        null,
      cardId: event.taskId,
      label: described.label,
      detail: clip(described.detail ?? null),
      tone: described.tone ?? 'neutral',
    };
    items.push(item);
    for (const key of lastRepeat.keys())
      if (key.startsWith(`${event.taskId}:`)) lastRepeat.delete(key);
    if (REPEATING.has(event.kind)) lastRepeat.set(repeatKey, item);
  }
  for (const [item, count] of counts) item.repeats = count;

  for (const comment of comments) {
    if (!cards.has(comment.taskId)) continue;
    items.push({
      id: `comment:${comment.id}`,
      at: comment.createdAt,
      source: 'comment',
      profile: comment.author,
      cardId: comment.taskId,
      label: message('timeline.comment', { author: comment.author }),
      detail: clip(comment.body),
      tone: 'neutral',
    });
  }
  return items.sort((left, right) => left.at - right.at);
}
