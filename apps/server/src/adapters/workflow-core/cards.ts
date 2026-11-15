import type { CoreItem } from '@factory-live/contracts/workflow-core';
import { BlockKind, KanbanStatus } from '@factory-live/contracts';
import type { Task } from '@factory-live/domain';
import type { KanbanDelta } from '../../application/ports.ts';

/**
 * workflow-core's items, as the code line's projection reads cards (#57): the same `Task`, `Run`, links,
 * events and comments the board reader gave before #72. What the core does not serve (the diagnosis' own fields)
 * stays empty: the core computes the diagnoses and serves them apart (#59).
 */

/** A card's status as the core names it; one the contracts do not know reads as `todo`. */
export function cardStatus(status: string): KanbanStatus {
  const known = KanbanStatus.safeParse(status);
  return known.success ? known.data : 'todo';
}

/** A card's kind of block as the core names it; none, or one the contracts do not know, reads as `null`. */
export function blockKindOf(kind: string | null): BlockKind | null {
  const known = BlockKind.safeParse(kind);
  return known.success ? known.data : null;
}

function toTask(item: CoreItem): Task {
  return {
    id: item.id,
    title: item.title,
    body: item.body ?? '',
    assignee: item.assignee,
    status: cardStatus(item.status),
    createdAt: item.created_at,
    startedAt: item.started_at,
    completedAt: item.completed_at,
    idempotencyKey: item.idempotency_key,
    blockKind: blockKindOf(item.block_kind),
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
    // Heartbeats are left out: `last_heartbeat_at` suffices.
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
