/**
 * Faits bruts d'Hermès, tels que les adaptateurs les lisent dans le kanban (horodatages en secondes
 * epoch, comme dans `kanban.db`). Le domaine n'en connaît pas la source.
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

export interface Board {
  tasks: readonly Task[];
  runs: readonly Run[];
  events: readonly TaskEvent[];
  links: readonly Link[];
}
