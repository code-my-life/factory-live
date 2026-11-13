import type { CoreItem } from '@factory-live/contracts/workflow-core';
import type { BlockKind, Board, Comment, KanbanStatus, Task } from '@factory-live/domain';
import type { KanbanDelta } from '../../application/ports.ts';

/**
 * workflow-core's items, as the code line's projection reads cards (#57): the same `Task`, `Run`, links,
 * events and comments the Hermes reader gave. What the core does not serve (the diagnosis' own fields)
 * stays empty: the core computes the diagnoses and serves them apart (#59).
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

function toTask(item: CoreItem): Task {
  return {
    id: item.id,
    title: item.title,
    body: item.body ?? '',
    assignee: item.assignee,
    status: (STATUSES.has(item.status) ? item.status : 'todo') as KanbanStatus,
    createdAt: item.created_at,
    startedAt: item.started_at,
    completedAt: item.completed_at,
    idempotencyKey: item.idempotency_key,
    blockKind:
      item.block_kind !== null && BLOCK_KINDS.has(item.block_kind)
        ? (item.block_kind as BlockKind)
        : null,
    currentRunId: item.current_run_id,
    workspacePath: item.workspace_path,
    skills: item.skills,
    modelOverride: item.model_override,
    providerOverride: item.provider_override,
    lastHeartbeatAt: item.last_heartbeat_at,
    branchName: null,
    consecutiveFailures: 0,
    blockRecurrences: 0,
    lastFailureError: null,
    maxRuntimeSeconds: null,
  };
}

/** The whole board, from every item of the workflow: it replaces what the server held. */
export function boardOf(items: readonly CoreItem[]): KanbanDelta {
  const delta: KanbanDelta = { tasks: [], runs: [], links: [], events: [], comments: [] };
  for (const item of items) {
    delta.tasks.push(toTask(item));
    for (const run of item.runs)
      delta.runs.push({
        id: run.id,
        taskId: item.id,
        profile: run.profile ?? '?',
        status: run.status,
        outcome: run.outcome,
        startedAt: run.started_at,
        endedAt: run.ended_at,
        summary: run.summary,
        metadata: run.metadata,
        error: null,
      });
    for (const child of item.children) delta.links.push({ parentId: item.id, childId: child });
    // Heartbeats are left out, as the Hermes reader does: `last_heartbeat_at` suffices.
    for (const event of item.events)
      if (event.kind !== 'heartbeat')
        delta.events.push({
          id: event.id,
          taskId: item.id,
          runId: event.run_id,
          kind: event.kind,
          payload: event.payload,
          createdAt: event.created_at,
        });
    for (const comment of item.comments)
      delta.comments.push({
        id: comment.id,
        taskId: item.id,
        author: comment.author,
        body: comment.body,
        createdAt: comment.created_at,
      });
  }
  delta.runs.sort((left, right) => left.id - right.id);
  delta.events.sort((left, right) => left.id - right.id);
  delta.comments.sort((left, right) => left.id - right.id);
  return delta;
}

/**
 * The cards of a board as workflow-core's items (#63): the inverse of `boardOf`, for the kanban mirror poured
 * into factory-live's history at the first start on the core's side. Heartbeats were never kept.
 */
export function itemsOfBoard(board: Board & { comments: Comment[] }): CoreItem[] {
  return board.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    body: task.body === '' ? null : task.body,
    status: task.status,
    assignee: task.assignee,
    created_at: task.createdAt,
    started_at: task.startedAt,
    completed_at: task.completedAt,
    block_kind: task.blockKind,
    idempotency_key: task.idempotencyKey,
    workspace_path: task.workspacePath,
    current_run_id: task.currentRunId,
    last_heartbeat_at: task.lastHeartbeatAt,
    model_override: task.modelOverride,
    provider_override: task.providerOverride,
    skills: [...task.skills],
    runs: board.runs
      .filter((run) => run.taskId === task.id)
      .map((run) => ({
        id: run.id,
        profile: run.profile === '?' ? null : run.profile,
        status: run.status,
        outcome: run.outcome,
        started_at: run.startedAt,
        ended_at: run.endedAt,
        summary: run.summary,
        metadata: run.metadata,
      })),
    parents: board.links.filter((link) => link.childId === task.id).map((link) => link.parentId),
    children: board.links.filter((link) => link.parentId === task.id).map((link) => link.childId),
    comments: board.comments
      .filter((comment) => comment.taskId === task.id)
      .map((comment) => ({
        id: comment.id,
        author: comment.author,
        body: comment.body,
        created_at: comment.createdAt,
      })),
    events: board.events
      .filter((event) => event.taskId === task.id)
      .map((event) => ({
        id: event.id,
        run_id: event.runId,
        kind: event.kind,
        payload: event.payload,
        created_at: event.createdAt,
      })),
  }));
}
