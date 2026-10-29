import type { DatabaseSync } from 'node:sqlite';
import type { BlockKind, KanbanStatus, Run, Task } from '@factory-live/domain';
import type { KanbanDelta } from '../../application/ports.ts';
import {
  dataVersion,
  int,
  json,
  openReadOnly,
  readTransaction,
  stringList,
  text,
} from './sqlite.ts';
import type { RequiredSchema } from './sqlite.ts';

const REQUIRED: RequiredSchema = {
  tasks: [
    'id',
    'title',
    'body',
    'assignee',
    'status',
    'created_at',
    'started_at',
    'completed_at',
    'idempotency_key',
    'block_kind',
    'current_run_id',
    'workspace_path',
    'skills',
    'model_override',
    'provider_override',
    'last_heartbeat_at',
  ],
  task_runs: [
    'id',
    'task_id',
    'profile',
    'status',
    'outcome',
    'started_at',
    'ended_at',
    'summary',
    'metadata',
  ],
  task_events: ['id', 'task_id', 'run_id', 'kind', 'payload', 'created_at'],
  task_links: ['parent_id', 'child_id'],
  task_comments: ['id', 'task_id', 'author', 'body', 'created_at'],
};

const STATUSES = new Set<KanbanStatus>([
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
const BLOCK_KINDS = new Set<BlockKind>(['dependency', 'needs_input', 'capability', 'transient']);

function toTask(row: Record<string, unknown>): Task {
  const status = String(row['status']) as KanbanStatus;
  const blockKind = text(row['block_kind']) as BlockKind | null;
  return {
    id: String(row['id']),
    title: text(row['title']) ?? '',
    body: text(row['body']) ?? '',
    assignee: text(row['assignee']),
    status: STATUSES.has(status) ? status : 'todo',
    createdAt: int(row['created_at']) ?? 0,
    startedAt: int(row['started_at']),
    completedAt: int(row['completed_at']),
    idempotencyKey: text(row['idempotency_key']),
    blockKind: blockKind && BLOCK_KINDS.has(blockKind) ? blockKind : null,
    currentRunId: int(row['current_run_id']),
    workspacePath: text(row['workspace_path']),
    skills: stringList(row['skills']),
    modelOverride: text(row['model_override']),
    providerOverride: text(row['provider_override']),
    lastHeartbeatAt: int(row['last_heartbeat_at']),
    // Colonnes lues sans les exiger : un Hermès qui ne les a pas laisse le diagnostic sans elles.
    branchName: text(row['branch_name']),
    consecutiveFailures: int(row['consecutive_failures']) ?? 0,
    blockRecurrences: int(row['block_recurrences']) ?? 0,
    lastFailureError: text(row['last_failure_error']),
    maxRuntimeSeconds: int(row['max_runtime_seconds']),
  };
}

function toRun(row: Record<string, unknown>): Run {
  return {
    id: int(row['id']) ?? 0,
    taskId: String(row['task_id']),
    profile: text(row['profile']) ?? '?',
    status: String(row['status']),
    outcome: text(row['outcome']),
    startedAt: int(row['started_at']) ?? 0,
    endedAt: int(row['ended_at']),
    summary: text(row['summary']),
    metadata: json(row['metadata']),
    error: text(row['error']),
  };
}

/**
 * Lecteur du `kanban.db` d'Hermès, en lecture seule. `changed()` est assez léger pour être appelé
 * toutes les 300 ms (comme le dashboard d'Hermès) ; `read()` rend les tables courtes en entier et les
 * événements et commentaires au-delà des curseurs.
 */
export class KanbanReader {
  private readonly db: DatabaseSync;
  private version = -1;
  private eventCursor = 0;
  private commentCursor = 0;

  constructor(path: string) {
    this.db = openReadOnly(path, REQUIRED);
  }

  changed(): boolean {
    const current = dataVersion(this.db);
    if (current === this.version) return false;
    this.version = current;
    return true;
  }

  read(): KanbanDelta {
    return readTransaction(this.db, () => {
      const tasks = this.db.prepare('SELECT * FROM tasks').all().map(toTask);
      const runs = this.db.prepare('SELECT * FROM task_runs ORDER BY id').all().map(toRun);
      const links = this.db
        .prepare('SELECT parent_id, child_id FROM task_links')
        .all()
        .map((row) => ({ parentId: String(row['parent_id']), childId: String(row['child_id']) }));
      const eventRows = this.db
        .prepare('SELECT * FROM task_events WHERE id > ? ORDER BY id')
        .all(this.eventCursor);
      const events: KanbanDelta['events'] = [];
      for (const row of eventRows) {
        const id = int(row['id']) ?? 0;
        this.eventCursor = Math.max(this.eventCursor, id);
        if (row['kind'] === 'heartbeat') continue;
        events.push({
          id,
          taskId: String(row['task_id']),
          runId: int(row['run_id']),
          kind: String(row['kind']),
          payload: json(row['payload']),
          createdAt: int(row['created_at']) ?? 0,
        });
      }
      const comments = this.db
        .prepare('SELECT * FROM task_comments WHERE id > ? ORDER BY id')
        .all(this.commentCursor)
        .map((row) => {
          const id = int(row['id']) ?? 0;
          this.commentCursor = Math.max(this.commentCursor, id);
          return {
            id,
            taskId: String(row['task_id']),
            author: String(row['author']),
            body: String(row['body']),
            createdAt: int(row['created_at']) ?? 0,
          };
        });
      return { tasks, runs, links, events, comments };
    });
  }

  close(): void {
    this.db.close();
  }
}
