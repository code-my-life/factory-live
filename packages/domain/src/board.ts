/**
 * The raw facts of the factory's board, as the core serves them (times in epoch seconds). The domain does not
 * know their source.
 */
export type KanbanStatus =
  | 'triage'
  | 'todo'
  | 'scheduled'
  | 'ready'
  | 'running'
  | 'blocked'
  | 'review'
  | 'done'
  | 'archived';

export type BlockKind = 'dependency' | 'needs_input' | 'capability' | 'transient';

export interface Task {
  id: string;
  title: string;
  body: string;
  assignee: string | null;
  status: KanbanStatus;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  idempotencyKey: string | null;
  blockKind: BlockKind | null;
  currentRunId: number | null;
  workspacePath: string | null;
  skills: readonly string[];
  modelOverride: string | null;
  providerOverride: string | null;
  lastHeartbeatAt: number | null;
  /** The branch declared on the card; `null` for a scratch workspace (the branch then lives in the brief). */
  branchName: string | null;
  consecutiveFailures: number;
  /** Blocks of the same kind in a row: at the 2nd, the kernel moves the card to triage. */
  blockRecurrences: number;
  lastFailureError: string | null;
  maxRuntimeSeconds: number | null;
}

export interface Run {
  id: number;
  taskId: string;
  profile: string;
  status: string;
  outcome: string | null;
  startedAt: number;
  endedAt: number | null;
  summary: string | null;
  metadata: Readonly<Record<string, unknown>>;
  /** What the factory noted when the run failed (protocol violation, budget, crash), as it is. */
  error: string | null;
}

export interface TaskEvent {
  id: number;
  taskId: string;
  runId: number | null;
  kind: string;
  payload: Readonly<Record<string, unknown>>;
  createdAt: number;
}

export interface Link {
  parentId: string;
  childId: string;
}

/** Commentaire d'une carte (`task_comments`). */
export interface Comment {
  id: number;
  taskId: string;
  author: string;
  body: string;
  /** Secondes epoch. */
  createdAt: number;
}

export interface Board {
  tasks: readonly Task[];
  runs: readonly Run[];
  events: readonly TaskEvent[];
  links: readonly Link[];
  /** The cards' comments: the factory's scripted gate gives its verdicts there (`gate.ts`). */
  comments?: readonly Comment[];
}
