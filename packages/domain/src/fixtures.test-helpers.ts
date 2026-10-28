import type { Link, Run, Task, TaskEvent } from './hermes.ts';

/** Fabriques de données de test : des valeurs neutres, chaque test précise ce qui compte pour lui. */
export function aTask(patch: Partial<Task> = {}): Task {
  return {
    id: 't_00000000',
    title: 'Carte',
    body: '',
    assignee: 'coordinator',
    status: 'todo',
    createdAt: 1_000,
    startedAt: null,
    completedAt: null,
    idempotencyKey: null,
    blockKind: null,
    currentRunId: null,
    workspacePath: null,
    skills: [],
    modelOverride: null,
    providerOverride: null,
    lastHeartbeatAt: null,
    ...patch,
  };
}

export function aRun(patch: Partial<Run> = {}): Run {
  return {
    id: 1,
    taskId: 't_00000000',
    profile: 'coder',
    status: 'running',
    outcome: null,
    startedAt: 1_000,
    endedAt: null,
    summary: null,
    metadata: {},
    ...patch,
  };
}

export function anEvent(patch: Partial<TaskEvent> = {}): TaskEvent {
  return {
    id: 1,
    taskId: 't_00000000',
    runId: null,
    kind: 'created',
    payload: {},
    createdAt: 1_000,
    ...patch,
  };
}

export function aLink(parentId: string, childId: string): Link {
  return { parentId, childId };
}
