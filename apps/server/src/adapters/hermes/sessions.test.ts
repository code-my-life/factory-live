import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schemaFor, tempDir } from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';
import { SessionReader } from './sessions.ts';

let dir: TempDir;
let db: DatabaseSync;
let reader: SessionReader;

function session(id: string, startedAt: number, patch: Record<string, unknown> = {}) {
  const row = {
    id,
    source: 'kanban',
    profile_name: 'coder',
    model: 'auto',
    started_at: startedAt,
    ended_at: startedAt + 600,
    input_tokens: 1200,
    output_tokens: 80,
    estimated_cost_usd: 0.01,
    title: 'impl cv-site#49',
    ...patch,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO sessions (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
  ).run(...Object.values(row));
}

function message(sessionId: string, role: string, patch: Record<string, unknown> = {}) {
  const row = { session_id: sessionId, role, timestamp: 1_000, ...patch };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO messages (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
  ).run(...Object.values(row));
}

beforeEach(() => {
  dir = tempDir();
  mkdirSync(join(dir.path, 'coder'));
  db = new DatabaseSync(join(dir.path, 'coder', 'state.db'));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(schemaFor('state', ['system_prompts', 'sessions', 'messages', 'session_model_usage']));
  reader = new SessionReader(dir.path);
});

afterEach(() => {
  reader.close();
  db.close();
  dir.remove();
});

describe('SessionReader', () => {
  it('retrouve la session d’un run par l’id noté par Hermès, sinon par sa date de lancement', () => {
    session('20261020_060316_537087', 1_000);
    session('20261020_090000_aaaaaa', 5_000);
    expect(
      reader.sessionOfRun('coder', {
        startedAt: 0,
        endedAt: null,
        workerSessionId: '20261020_090000_aaaaaa',
      })?.id,
    ).toBe('20261020_090000_aaaaaa');
    expect(
      reader.sessionOfRun('coder', { startedAt: 990, endedAt: 1_600, workerSessionId: null }),
    ).toMatchObject({
      id: '20261020_060316_537087',
      model: 'auto',
      inputTokens: 1200,
      costUsd: 0.01,
    });
    expect(
      reader.sessionOfRun('coder', { startedAt: 20_000, endedAt: null, workerSessionId: null }),
    ).toBeNull();
  });

  it('ignore un profil inconnu ou un nom de profil dangereux', () => {
    expect(
      reader.sessionOfRun('../coder', { startedAt: 0, endedAt: null, workerSessionId: null }),
    ).toBeNull();
    expect(reader.modelUsage('inconnu', 's')).toEqual([]);
  });

  it('rend une ligne d’usage par modèle (fallbacks compris)', () => {
    session('s1', 1_000);
    const insert = db.prepare(
      'INSERT INTO session_model_usage (session_id, model, billing_provider, api_call_count, input_tokens, output_tokens, estimated_cost_usd, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    insert.run('s1', 'agnes-2.5-flash', 'freellmapi', 3, 100, 10, 0, 1_100);
    insert.run('s1', 'nemotron-3-ultra', 'nvidia', 1, 50, 5, 0, 1_200);
    expect(
      reader.modelUsage('coder', 's1').map((row) => [row.model, row.provider, row.calls]),
    ).toEqual([
      ['agnes-2.5-flash', 'freellmapi', 3],
      ['nemotron-3-ultra', 'nvidia', 1],
    ]);
  });

  it('transcrit messages, raisonnement, appels d’outils et résultats, secrets masqués', () => {
    session('s1', 1_000);
    message('s1', 'user', { content: 'Implémente la carte' });
    message('s1', 'assistant', {
      content: 'Je lance les tests',
      reasoning: 'Il faut vérifier',
      tool_calls: JSON.stringify([
        {
          id: 'c1',
          type: 'function',
          function: { name: 'terminal', arguments: '{"command":"npm test"}' },
        },
      ]),
    });
    message('s1', 'tool', {
      tool_name: 'terminal',
      content: `{"output": "GITHUB_TOKEN=ghp_${'a'.repeat(36)}"}`,
    });
    message('s1', 'tool', { tool_name: 'read_file', content: '{"error": "File not found"}' });

    const entries = reader.transcript('coder', 's1');
    expect(entries.map((entry) => [entry.role, entry.toolName, entry.status])).toEqual([
      ['user', null, null],
      ['reasoning', null, null],
      ['assistant', null, null],
      ['tool_call', 'terminal', null],
      ['tool_result', 'terminal', 'ok'],
      ['tool_result', 'read_file', 'error'],
    ]);
    expect(entries[3]?.text).toBe('{"command":"npm test"}');
    expect(entries[4]?.text).not.toContain('ghp_');
  });

  it('coupe un résultat d’outil démesuré', () => {
    session('s1', 1_000);
    message('s1', 'tool', { tool_name: 'read_file', content: 'x'.repeat(30_000) });
    const [entry] = reader.transcript('coder', 's1');
    expect(entry?.text?.length).toBeLessThan(20_100);
    expect(entry?.text).toContain('caractères de plus');
  });
});
