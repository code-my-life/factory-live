import type {
  GenericCardView,
  GenericItemView,
  IssueStatus,
  KanbanStatus,
  TimelineEntry,
} from '@factory-live/contracts';
import type { CoreItem } from '@factory-live/contracts/workflow-core';

/**
 * An item of a generic workflow (#65), as workflow-core serves it, for the generic screen: at this
 * stage each card of the core is its own item, so an item has one card, its runs, and its life. The
 * names of its events stay as the core publishes them (`claimed`, `blocked`…): no catalogue.
 */

const STATUSES = new Set<string>([
  'triage',
  'todo',
  'scheduled',
  'ready',
  'running',
  'blocked',
  'review',
  'done',
  'archived',
]);
const BLOCK_KINDS = new Set<string>(['dependency', 'needs_input', 'capability', 'transient']);

/** Where an item stands, from its card's status, in the words of an issue's state. */
const ITEM_STATUS: Record<KanbanStatus, IssueStatus> = {
  triage: 'waiting_human',
  todo: 'queued',
  scheduled: 'queued',
  ready: 'queued',
  running: 'active',
  blocked: 'blocked',
  review: 'active',
  done: 'done',
  archived: 'done',
};

const iso = (seconds: number): string => new Date(seconds * 1000).toISOString();

/** The tone of an event of the core in the timeline: a block in red, a completion in green. */
const TONE: Record<string, TimelineEntry['tone']> = {
  blocked: 'danger',
  completed: 'success',
  done: 'done',
};

/** The station the core names for the item, when it names one (it does not yet: `null`). */
function stationOf(item: CoreItem): string | null {
  const station = (item as { station?: unknown }).station;
  return typeof station === 'string' && station ? station : null;
}

export function genericItem(item: CoreItem): GenericItemView {
  const status: KanbanStatus = STATUSES.has(item.status) ? (item.status as KanbanStatus) : 'todo';
  const lastBlock = [...item.events].reverse().find((event) => event.kind === 'blocked');
  const reason = lastBlock?.payload['reason'];
  const profileOfRun = new Map(item.runs.map((run) => [run.id, run.profile]));
  const card: GenericCardView = {
    id: item.id,
    title: item.title,
    // A generic workflow's card has no kind of its own: the screen shows none (#65).
    kind: null,
    status,
    assignee: item.assignee,
    station: stationOf(item) ?? '',
    blockKind:
      item.block_kind !== null && BLOCK_KINDS.has(item.block_kind)
        ? (item.block_kind as GenericCardView['blockKind'])
        : null,
    blockReason: status === 'blocked' && typeof reason === 'string' ? reason : null,
    parents: item.parents,
    skills: item.skills,
    runs: item.runs.map((run) => ({
      id: run.id,
      profile: run.profile ?? '?',
      role: 'other',
      status: run.status,
      outcome: run.outcome,
      startedAt: iso(run.started_at),
      endedAt: run.ended_at === null ? null : iso(run.ended_at),
      model: null,
      laneModel: null,
      summary: run.summary,
      tokens: null,
      costUsd: null,
      verdict: null,
    })),
    changedFiles: [],
    testsPassed: null,
    testsTotal: null,
    evidence: [],
  };
  const timeline: TimelineEntry[] = [
    // Heartbeats say nothing to read: left out, as on the code line.
    ...item.events
      .filter((event) => event.kind !== 'heartbeat')
      .map((event) => {
        const detail = event.payload['reason'];
        return {
          id: `event-${event.id}`,
          at: iso(event.created_at),
          source: 'kanban' as const,
          profile: event.run_id === null ? null : (profileOfRun.get(event.run_id) ?? null),
          cardId: item.id,
          label: event.kind,
          detail: typeof detail === 'string' ? detail : null,
          tone: TONE[event.kind] ?? 'neutral',
        };
      }),
    ...item.comments.map((comment) => ({
      id: `comment-${comment.id}`,
      at: iso(comment.created_at),
      source: 'comment' as const,
      profile: comment.author,
      cardId: item.id,
      label: comment.body,
      detail: null,
      tone: 'neutral' as const,
    })),
  ].sort((left, right) => left.at.localeCompare(right.at));
  return {
    id: item.id,
    title: item.title,
    station: stationOf(item),
    status: ITEM_STATUS[status],
    since: iso(item.started_at ?? item.created_at),
    cards: [card],
    timeline,
  };
}
