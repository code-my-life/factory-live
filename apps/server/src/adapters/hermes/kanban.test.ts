import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  insertEvent,
  insertRun,
  insertTask,
  kanbanDb,
  tempDir,
} from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';
import { KanbanReader } from './kanban.ts';
import { SchemaError, openReadOnly } from './sqlite.ts';

let dir: TempDir;
let writer: DatabaseSync;
let path: string;

beforeEach(() => {
  dir = tempDir();
  path = join(dir.path, 'kanban.db');
  writer = kanbanDb(path);
});

afterEach(() => {
  writer.close();
  dir.remove();
});

describe('KanbanReader', () => {
  it('lit cartes, runs, liens, événements et commentaires au schéma réel d’Hermès', () => {
    insertTask(writer, {
      id: 't_brief001',
      title: 'brief claude-cockpit#52 : bouton',
      status: 'done',
      assignee: 'coordinator',
      skills: '["factory-brief"]',
    });
    insertTask(writer, {
      id: 't_impl0001',
      title: 'impl claude-cockpit#52',
      status: 'blocked',
      blockKind: 'needs_input',
    });
    writer
      .prepare("INSERT INTO task_links (parent_id, child_id) VALUES ('t_brief001', 't_impl0001')")
      .run();
    insertRun(writer, {
      taskId: 't_impl0001',
      profile: 'coder',
      status: 'done',
      outcome: 'review_requested',
      metadata: {
        harness: 'coder',
        pr_url: 'https://github.com/code-my-life/claude-cockpit/pull/63',
      },
    });
    insertEvent(writer, {
      taskId: 't_impl0001',
      kind: 'blocked',
      payload: { kind: 'needs_input', reason: 'Quelle base ?' },
      runId: 1,
    });
    writer
      .prepare(
        "INSERT INTO task_comments (task_id, author, body, created_at) VALUES ('t_impl0001', 'coder', 'PR ouverte', 1200)",
      )
      .run();

    const reader = new KanbanReader(path);
    const delta = reader.read();
    reader.close();

    expect(delta.tasks.find((task) => task.id === 't_brief001')).toMatchObject({
      assignee: 'coordinator',
      skills: ['factory-brief'],
      status: 'done',
    });
    expect(delta.tasks.find((task) => task.id === 't_impl0001')).toMatchObject({
      blockKind: 'needs_input',
      assignee: null,
    });
    expect(delta.links).toEqual([{ parentId: 't_brief001', childId: 't_impl0001' }]);
    expect(delta.runs[0]).toMatchObject({
      profile: 'coder',
      outcome: 'review_requested',
      metadata: { harness: 'coder' },
    });
    expect(delta.events[0]).toMatchObject({
      kind: 'blocked',
      runId: 1,
      payload: { reason: 'Quelle base ?' },
    });
    expect(delta.comments[0]).toMatchObject({
      author: 'coder',
      body: 'PR ouverte',
      createdAt: 1200,
    });
  });

  it('ne rend que les nouveaux événements, sans les battements de cœur', () => {
    insertTask(writer, { id: 't_a0000001', title: 'impl cv-site#1', status: 'running' });
    insertEvent(writer, { taskId: 't_a0000001', kind: 'claimed' });
    const reader = new KanbanReader(path);
    expect(reader.read().events.map((event) => event.kind)).toEqual(['claimed']);

    insertEvent(writer, { taskId: 't_a0000001', kind: 'heartbeat' });
    insertEvent(writer, { taskId: 't_a0000001', kind: 'completed', payload: { summary: 'ok' } });
    expect(reader.read().events.map((event) => event.kind)).toEqual(['completed']);
    expect(reader.read().events).toEqual([]);
    reader.close();
  });

  it('détecte les écritures d’Hermès par data_version, sans relire pour rien', () => {
    const reader = new KanbanReader(path);
    expect(reader.changed()).toBe(true);
    expect(reader.changed()).toBe(false);
    insertTask(writer, { id: 't_b0000001', title: 'x', status: 'ready' });
    expect(reader.changed()).toBe(true);
    expect(reader.changed()).toBe(false);
    reader.close();
  });

  it('n’écrit jamais : la base est ouverte en lecture seule', () => {
    const db = openReadOnly(path, {});
    expect(() =>
      db.exec("INSERT INTO tasks (id, title, status, created_at) VALUES ('t_x', 'x', 'todo', 1)"),
    ).toThrow(/readonly/);
    db.close();
  });

  it('signale une colonne disparue après une mise à jour d’Hermès au lieu de planter plus loin', () => {
    writer.exec('DROP INDEX idx_events_run; ALTER TABLE task_events DROP COLUMN run_id');
    expect(() => new KanbanReader(path)).toThrow(SchemaError);
    expect(() => new KanbanReader(path)).toThrow(/task_events\.run_id/);
  });
});
