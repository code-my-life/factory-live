import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { HOOK_TIMEOUT_MESSAGE, classifyToolResult } from '@factory-live/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schemaFor, tempDir } from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';
import type { RunRef } from '../../application/ports.ts';
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

  it('montre un refus de garde ou d’Hermès comme un refus, pas comme une erreur', () => {
    session('s1', 1_000);
    message('s1', 'tool', {
      tool_name: 'terminal',
      content: JSON.stringify({ error: HOOK_TIMEOUT_MESSAGE }),
    });
    message('s1', 'tool', {
      tool_name: 'terminal',
      content: '{"error": "coder-guard : git add . / -A interdit"}',
    });
    expect(reader.transcript('coder', 's1').map((entry) => entry.status)).toEqual([
      'blocked',
      'blocked',
    ]);
  });
});

describe('SessionReader.runFacts', () => {
  const card = 't_665ba7d7';
  const run = (patch: Partial<RunRef> = {}): RunRef => ({
    id: 191,
    taskId: card,
    startedAt: 1_793_263_010,
    endedAt: 1_793_263_637,
    workerSessionId: null,
    resumeSessionId: null,
    ...patch,
  });
  const call = (id: string, name: string, args: Record<string, unknown>) => ({
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  });

  beforeEach(() => {
    session('20261029_093652_fc383d', 1_793_263_013.77, { title: 'impl factory-live#2 #3' });
    message('20261029_093652_fc383d', 'user', {
      content: `work kanban task ${card}`,
      timestamp: 1_793_263_013.5,
    });
  });

  it('rattache un run à sa session par la fenêtre, confirmée par « work kanban task <carte> »', () => {
    // Une autre carte lancée au même moment n'est pas prise.
    session('20261029_093700_aaaaaa', 1_793_263_020);
    message('20261029_093700_aaaaaa', 'user', {
      content: 'work kanban task t_00000000',
      timestamp: 1_793_263_020,
    });
    expect(reader.runFacts('coder', [run()])?.map((facts) => [facts.id, facts.runId])).toEqual([
      ['20261029_093652_fc383d', 191],
    ]);
    // Hors de la fenêtre du run : aucune session, jamais une session voisine.
    expect(reader.runFacts('coder', [run({ startedAt: 1_793_270_000 })])).toEqual([]);
  });

  it('préfère la session notée par Hermès, puis celle de `hermes --resume`', () => {
    session('20261029_101049_0612ab', 1_793_265_050);
    expect(
      reader
        .runFacts('coder', [
          run({ id: 192, workerSessionId: '20261029_101049_0612ab' }),
          run({ id: 193, workerSessionId: 'inconnue', resumeSessionId: '20261029_101049_0612ab' }),
        ])
        ?.map((facts) => [facts.id, facts.runId]),
    ).toEqual([['20261029_101049_0612ab', 192]]);
  });

  it('ne devine pas entre deux sessions qui conviennent toutes les deux', () => {
    session('20261029_093653_bbbbbb', 1_793_263_014);
    message('20261029_093653_bbbbbb', 'user', {
      content: `work kanban task ${card}`,
      timestamp: 1_793_263_014,
    });
    expect(reader.runFacts('coder', [run()])).toEqual([]);
  });

  it('lit appels et résultats : argument parlant, refus exacts, début et fin des longs contenus', () => {
    const sid = '20261029_093652_fc383d';
    message(sid, 'assistant', {
      timestamp: 1_793_263_100,
      tool_calls: JSON.stringify([
        call('call_1', 'terminal', { command: 'git commit -m "feat: version"', timeout: 600 }),
        call('call_2', 'write_file', { path: 'apps/web/src/a.ts', content: 'x'.repeat(5_000) }),
      ]),
    });
    message(sid, 'tool', {
      timestamp: 1_793_263_131,
      tool_call_id: 'call_1',
      tool_name: 'terminal',
      content: JSON.stringify({ error: HOOK_TIMEOUT_MESSAGE }),
    });
    message(sid, 'tool', {
      timestamp: 1_793_263_132,
      tool_call_id: 'call_2',
      tool_name: 'write_file',
      content: `{"output": "${'ligne\\n'.repeat(2_000)}[Command timed out after 900s]", "exit_code": 124, "error": null}`,
    });
    // Des appels illisibles ne cassent pas la lecture.
    message(sid, 'assistant', { timestamp: 1_793_263_140, tool_calls: '[{"id": "call_3"' });
    message(sid, 'assistant', { timestamp: 1_793_263_141, tool_calls: '{"id": "call_4"}' });

    const [facts] = reader.runFacts('coder', [run()]) ?? [];
    expect(facts?.calls).toEqual([
      {
        at: 1_793_263_100,
        tool: 'terminal',
        input: 'git commit -m "feat: version"',
        callId: 'call_1',
      },
      { at: 1_793_263_100, tool: 'write_file', input: 'apps/web/src/a.ts', callId: 'call_2' },
    ]);
    expect(facts?.results.map((result) => classifyToolResult(result.content).kind)).toEqual([
      'hook_timeout',
      'command_timeout',
    ]);
    expect(facts?.results[1]?.content.length).toBeLessThan(2_100);
    expect(facts?.results[1]?.callId).toBe('call_2');
  });

  it('masque les secrets des commandes et des résultats', () => {
    const sid = '20261029_093652_fc383d';
    const token = `ghp_${'a'.repeat(36)}`;
    message(sid, 'assistant', {
      timestamp: 1_793_263_100,
      tool_calls: JSON.stringify([
        call('c1', 'terminal', { command: `GH_TOKEN=${token} gh pr view` }),
      ]),
    });
    message(sid, 'tool', {
      timestamp: 1_793_263_101,
      tool_call_id: 'c1',
      tool_name: 'terminal',
      content: `{"output": "${token}", "exit_code": 0}`,
    });
    const [facts] = reader.runFacts('coder', [run()]) ?? [];
    expect(JSON.stringify(facts)).not.toContain(token);
  });

  it('donne les sessions ouvertes à un instant, une session jamais close comprise', () => {
    session('20261029_101049_0612ab', 1_793_265_050, { ended_at: null });
    expect(reader.sessionsActiveAt('coder', 1_793_263_100)).toEqual(['20261029_093652_fc383d']);
    expect(reader.sessionsActiveAt('coder', 1_793_265_100)).toEqual(['20261029_101049_0612ab']);
    expect(reader.sessionsActiveAt('coder', 1_793_200_000)).toEqual([]);
    expect(reader.sessionsActiveAt('inconnu', 1_793_263_100)).toBeNull();
  });

  it('rend null quand la base de l’agent est absente', () => {
    expect(reader.runFacts('inconnu', [run()])).toBeNull();
    expect(reader.runFacts('../coder', [run()])).toBeNull();
  });
});
