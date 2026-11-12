import type { CoreItem } from '@factory-live/contracts/workflow-core';
import type { BlockKind, KanbanStatus, Task } from '@factory-live/domain';
import type { KanbanDelta } from '../../application/ports.ts';

/**
 * workflow-core's items, as the code line's projection reads cards (#57): the same `Task`, `Run`, links,
 * events and comments the Hermes reader gave. What the core does not serve (the diagnosis' own fields)
 * stays empty: the diagnosis comes from the core in a later story.
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
