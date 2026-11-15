import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CoreItem } from '@factory-live/contracts/workflow-core';
import type { KanbanDelta } from '../application/ports.ts';
import { boardOf } from '../adapters/workflow-core/cards.ts';

export interface TempDir {
  path: string;
  remove(): void;
}

export function tempDir(prefix = 'factory-live-'): TempDir {
  const path = mkdtempSync(join(tmpdir(), prefix));
  return { path, remove: () => rmSync(path, { recursive: true, force: true }) };
}

/**
 * The cards of a test factory as workflow-core serves them (its items, #57): the tests write cards, runs,
 * events, links and comments, then read the board the code line's reader would give the hub.
 */
export interface CoreBoard {
  items: CoreItem[];
  /** The board of these items, as `WorkflowCoreReader` gives it to the hub (`boardOf`). */
  board(): KanbanDelta;
}

export function coreBoard(): CoreBoard {
  const items: CoreItem[] = [];
  return { items, board: () => boardOf(structuredClone(items)) };
}

function itemOf(board: CoreBoard, id: string): CoreItem {
  const item = board.items.find((each) => each.id === id);
  if (!item) throw new Error(`carte inconnue : ${id}`);
  return item;
}

const nextId = (values: readonly number[]) => Math.max(0, ...values) + 1;

export function insertTask(
  board: CoreBoard,
  task: {
    id: string;
    title: string;
    status: string;
    assignee?: string | null;
    createdAt?: number;
    blockKind?: string | null;
    skills?: readonly string[];
    body?: string | null;
    workspacePath?: string | null;
    startedAt?: number | null;
    idempotencyKey?: string | null;
  },
): void {
  board.items.push({
    id: task.id,
    title: task.title,
    body: task.body ?? null,
    status: task.status,
    assignee: task.assignee ?? null,
    created_at: task.createdAt ?? 1_000,
    started_at: task.startedAt ?? null,
    completed_at: null,
    block_kind: task.blockKind ?? null,
    idempotency_key: task.idempotencyKey ?? null,
    workspace_path: task.workspacePath ?? null,
    current_run_id: null,
    last_heartbeat_at: null,
    model_override: null,
    provider_override: null,
    skills: [...(task.skills ?? [])],
    runs: [],
    parents: [],
    children: [],
    comments: [],
    events: [],
  });
}

/** A run of a card; its id follows the board's last one, unless given. Returns the id. */
export function insertRun(
  board: CoreBoard,
  run: {
    taskId: string;
    profile: string;
    status: string;
    id?: number;
    outcome?: string | null;
    startedAt?: number;
    endedAt?: number | null;
    summary?: string | null;
    metadata?: Record<string, unknown>;
  },
): number {
  const id = run.id ?? nextId(board.items.flatMap((item) => item.runs.map((each) => each.id)));
  itemOf(board, run.taskId).runs.push({
    id,
    profile: run.profile,
    status: run.status,
    outcome: run.outcome ?? null,
    started_at: run.startedAt ?? 1_000,
    ended_at: run.endedAt ?? null,
    summary: run.summary ?? null,
    metadata: run.metadata ?? {},
  });
  return id;
}

/** An event of a card; its id follows the board's last one. Returns the id. */
export function insertEvent(
  board: CoreBoard,
  event: {
    taskId: string;
    kind: string;
    payload?: Record<string, unknown>;
    createdAt?: number;
    runId?: number | null;
  },
): number {
  const id = nextId(board.items.flatMap((item) => item.events.map((each) => each.id)));
  itemOf(board, event.taskId).events.push({
    id,
    run_id: event.runId ?? null,
    kind: event.kind,
    payload: event.payload ?? {},
    created_at: event.createdAt ?? 1_000,
  });
  return id;
}

export function insertLink(board: CoreBoard, parentId: string, childId: string): void {
  itemOf(board, parentId).children.push(childId);
  itemOf(board, childId).parents.push(parentId);
}

export function insertComment(
  board: CoreBoard,
  comment: { taskId: string; author: string; body: string; createdAt?: number },
): void {
  const id = nextId(board.items.flatMap((item) => item.comments.map((each) => each.id)));
  itemOf(board, comment.taskId).comments.push({
    id,
    author: comment.author,
    body: comment.body,
    created_at: comment.createdAt ?? 1_000,
  });
}

/** Changes a card as the core would serve it changed (its status, its kind of block...). */
export function updateTask(
  board: CoreBoard,
  id: string,
  patch: Partial<Pick<CoreItem, 'status' | 'block_kind' | 'workspace_path' | 'assignee'>>,
): void {
  Object.assign(itemOf(board, id), patch);
}
