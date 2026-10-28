import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA_DIR = new URL('../../../../fixtures/hermes-schema/', import.meta.url);

/** Instructions CREATE du schéma réel d'Hermès pour les tables voulues (index compris), sans les tables FTS. */
export function schemaFor(file: 'kanban' | 'state', tables: readonly string[]): string {
  const sql = readFileSync(new URL(`${file}.sql`, SCHEMA_DIR), 'utf8');
  return sql
    .split(/;\s*\n/)
    .map((statement) => statement.replace(/^(\s*--.*\n)+/g, '').trim())
    .filter((statement) => {
      const table = /^CREATE TABLE (\w+)/.exec(statement)?.[1];
      const index = /^CREATE INDEX \w+\s+ON (\w+)/.exec(statement)?.[1];
      return (table && tables.includes(table)) || (index && tables.includes(index));
    })
    .map((statement) => `${statement};`)
    .join('\n');
}

export interface TempDir {
  path: string;
  remove(): void;
}

export function tempDir(prefix = 'factory-live-'): TempDir {
  const path = mkdtempSync(join(tmpdir(), prefix));
  return { path, remove: () => rmSync(path, { recursive: true, force: true }) };
}

/** Base kanban de test au schéma réel, en WAL comme celle d'Hermès. */
export function kanbanDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(
    schemaFor('kanban', ['tasks', 'task_runs', 'task_events', 'task_links', 'task_comments']),
  );
  return db;
}

export function insertTask(
  db: DatabaseSync,
  task: {
    id: string;
    title: string;
    status: string;
    assignee?: string | null;
    createdAt?: number;
    blockKind?: string | null;
    skills?: string | null;
  },
): void {
  db.prepare(
    'INSERT INTO tasks (id, title, status, assignee, created_at, block_kind, skills) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    task.id,
    task.title,
    task.status,
    task.assignee ?? null,
    task.createdAt ?? 1_000,
    task.blockKind ?? null,
    task.skills ?? null,
  );
}

export function insertEvent(
  db: DatabaseSync,
  event: {
    taskId: string;
    kind: string;
    payload?: unknown;
    createdAt?: number;
    runId?: number | null;
  },
): void {
  db.prepare(
    'INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(
    event.taskId,
    event.runId ?? null,
    event.kind,
    event.payload === undefined ? null : JSON.stringify(event.payload),
    event.createdAt ?? 1_000,
  );
}

export function insertRun(
  db: DatabaseSync,
  run: {
    taskId: string;
    profile: string;
    status: string;
    outcome?: string | null;
    startedAt?: number;
    endedAt?: number | null;
    metadata?: unknown;
  },
): void {
  db.prepare(
    'INSERT INTO task_runs (task_id, profile, status, outcome, started_at, ended_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    run.taskId,
    run.profile,
    run.status,
    run.outcome ?? null,
    run.startedAt ?? 1_000,
    run.endedAt ?? null,
    run.metadata === undefined ? null : JSON.stringify(run.metadata),
  );
}
