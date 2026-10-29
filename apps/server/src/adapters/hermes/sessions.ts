import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { classifyToolResult, isRefusal, redactSecrets } from '@factory-live/domain';
import type { SessionFacts, ToolCallFact, ToolResultFact } from '@factory-live/domain';
import { int, json, openReadOnly, text } from './sqlite.ts';
import type { RequiredSchema } from './sqlite.ts';
import type {
  ModelUsageRow,
  RunRef,
  SessionInfo,
  SessionsPort,
  TranscriptLine,
} from '../../application/ports.ts';

const REQUIRED: RequiredSchema = {
  sessions: [
    'id',
    'source',
    'model',
    'started_at',
    'ended_at',
    'input_tokens',
    'output_tokens',
    'estimated_cost_usd',
    'actual_cost_usd',
    'profile_name',
    'title',
  ],
  messages: [
    'id',
    'session_id',
    'role',
    'content',
    'tool_call_id',
    'tool_calls',
    'tool_name',
    'timestamp',
    'reasoning',
  ],
  session_model_usage: [
    'session_id',
    'model',
    'billing_provider',
    'api_call_count',
    'input_tokens',
    'output_tokens',
    'estimated_cost_usd',
    'actual_cost_usd',
    'last_seen',
  ],
};

const PROFILE = /^[\w-]+$/;
const CARD = /^t_[0-9a-f]{8}$/;
const TEXT_MAX = 20_000;
/** D'un résultat d'outil, le diagnostic garde le début (le refus) et la fin (le code de sortie). */
const RESULT_HEAD = 1_500;
const RESULT_TAIL = 500;
const INPUT_MAX = 500;
/** Une session de worker démarre quelques secondes après son run. */
const SESSION_START_SLACK = 120;

function clip(value: string | null): string | null {
  if (value === null) return null;
  const clean = redactSecrets(value);
  return clean.length > TEXT_MAX
    ? `${clean.slice(0, TEXT_MAX)}\n… (${clean.length - TEXT_MAX} caractères de plus)`
    : clean;
}

function cost(row: Record<string, unknown>): number | null {
  const actual = typeof row['actual_cost_usd'] === 'number' ? row['actual_cost_usd'] : null;
  const estimated =
    typeof row['estimated_cost_usd'] === 'number' ? row['estimated_cost_usd'] : null;
  return actual ?? estimated;
}

function toolStatus(content: string | null): TranscriptLine['status'] {
  if (!content) return 'ok';
  // Un refus d'une garde ou d'Hermès est un refus, pas une erreur de l'outil.
  if (isRefusal(classifyToolResult(content))) return 'blocked';
  const parsed = json(content);
  if (parsed['blocked'] === true || parsed['status'] === 'blocked') return 'blocked';
  return parsed['error'] ? 'error' : 'ok';
}

const VALID_ARRAY = (column: string) =>
  `CASE WHEN json_valid(${column}) AND json_type(${column}) = 'array' THEN ${column} ELSE '[]' END`;

/** Les appels d'outils d'une session : nom, identifiant, et l'argument parlant (commande, chemin, nom). */
const CALLS_SQL = `
  SELECT m.timestamp AS at, json_extract(c.value, '$.id') AS id,
         json_extract(c.value, '$.call_id') AS call_id,
         json_extract(c.value, '$.function.name') AS tool,
         CASE WHEN json_valid(json_extract(c.value, '$.function.arguments')) THEN coalesce(
           json_extract(json_extract(c.value, '$.function.arguments'), '$.command'),
           json_extract(json_extract(c.value, '$.function.arguments'), '$.path'),
           json_extract(json_extract(c.value, '$.function.arguments'), '$.name')) END AS input
  FROM messages m, json_each(${VALID_ARRAY('m.tool_calls')}) c
  WHERE m.session_id = ? AND m.role = 'assistant' AND m.tool_calls IS NOT NULL
  ORDER BY m.id, c.key`;

/** Les résultats d'outils d'une session, début et fin seulement : un contenu peut peser des centaines de Ko. */
const RESULTS_SQL = `
  SELECT timestamp AS at, tool_call_id, tool_name, length(content) AS size,
         substr(content, 1, ${RESULT_HEAD}) AS head, substr(content, -${RESULT_TAIL}) AS tail
  FROM messages WHERE session_id = ? AND role = 'tool' ORDER BY id`;

function callFact(row: Record<string, unknown>): ToolCallFact {
  const input = text(row['input']);
  return {
    at: Number(row['at'] ?? 0),
    tool: text(row['tool']) ?? '?',
    input: input?.trim() ? redactSecrets(input.trim()).slice(0, INPUT_MAX) : null,
    callId: text(row['id']) ?? text(row['call_id']),
  };
}

function resultFact(row: Record<string, unknown>): ToolResultFact {
  const head = text(row['head']) ?? '';
  const size = int(row['size']) ?? head.length;
  const content =
    size > RESULT_HEAD + RESULT_TAIL ? `${head}\n…\n${text(row['tail']) ?? ''}` : head;
  return {
    at: Number(row['at'] ?? 0),
    tool: text(row['tool_name']) ?? '?',
    callId: text(row['tool_call_id']),
    content: redactSecrets(content),
  };
}

/** Sessions des workers (`profiles/<p>/state.db`), en lecture seule, une connexion par profil. */
export class SessionReader implements SessionsPort {
  private readonly open = new Map<string, DatabaseSync>();

  private readonly profilesDir: string;

  constructor(profilesDir: string) {
    this.profilesDir = profilesDir;
  }

  private db(profile: string): DatabaseSync | null {
    if (!PROFILE.test(profile)) return null;
    const cached = this.open.get(profile);
    if (cached) return cached;
    const path = join(this.profilesDir, profile, 'state.db');
    if (!existsSync(path)) return null;
    const db = openReadOnly(path, REQUIRED);
    this.open.set(profile, db);
    return db;
  }

  /** Session d'un run : celle notée par Hermès, sinon la session kanban du profil lancée avec le run. */
  sessionOfRun(
    profile: string,
    run: { startedAt: number; endedAt: number | null; workerSessionId: string | null },
  ): SessionInfo | null {
    const db = this.db(profile);
    if (!db) return null;
    const row = run.workerSessionId
      ? db.prepare('SELECT * FROM sessions WHERE id = ?').get(run.workerSessionId)
      : db
          .prepare(
            `SELECT * FROM sessions WHERE source = 'kanban' AND profile_name = ? AND started_at BETWEEN ? AND ?
             ORDER BY ABS(started_at - ?) LIMIT 1`,
          )
          .get(profile, run.startedAt - 30, (run.endedAt ?? run.startedAt) + 120, run.startedAt);
    if (!row) return null;
    return {
      id: String(row['id']),
      profile,
      model: text(row['model']),
      title: text(row['title']),
      startedAt: int(row['started_at']) ?? 0,
      endedAt: int(row['ended_at']),
      inputTokens: int(row['input_tokens']) ?? 0,
      outputTokens: int(row['output_tokens']) ?? 0,
      costUsd: cost(row),
    };
  }

  /** Une ligne par modèle et fournisseur : un fallback en ajoute une. */
  modelUsage(profile: string, sessionId: string): ModelUsageRow[] {
    const db = this.db(profile);
    if (!db) return [];
    return db
      .prepare('SELECT * FROM session_model_usage WHERE session_id = ? ORDER BY last_seen')
      .all(sessionId)
      .map((row) => ({
        model: String(row['model']),
        provider: text(row['billing_provider']) || '?',
        calls: int(row['api_call_count']) ?? 0,
        inputTokens: int(row['input_tokens']) ?? 0,
        outputTokens: int(row['output_tokens']) ?? 0,
        costUsd: cost(row),
        lastSeen: int(row['last_seen']) ?? 0,
      }));
  }

  /** Consommation agrégée par modèle depuis une date (secondes epoch), toutes sessions du profil. */
  usageSince(profile: string, since: number): (ModelUsageRow & { day: string })[] {
    const db = this.db(profile);
    if (!db) return [];
    return db
      .prepare(
        `SELECT model, billing_provider, date(last_seen, 'unixepoch') AS day, SUM(api_call_count) AS calls,
                SUM(input_tokens) AS input, SUM(output_tokens) AS output,
                SUM(COALESCE(actual_cost_usd, estimated_cost_usd)) AS cost, MAX(last_seen) AS last_seen
         FROM session_model_usage WHERE last_seen >= ? GROUP BY model, billing_provider, day`,
      )
      .all(since)
      .map((row) => ({
        model: String(row['model']),
        provider: text(row['billing_provider']) || '?',
        day: String(row['day']),
        calls: int(row['calls']) ?? 0,
        inputTokens: int(row['input']) ?? 0,
        outputTokens: int(row['output']) ?? 0,
        costUsd: typeof row['cost'] === 'number' ? row['cost'] : null,
        lastSeen: int(row['last_seen']) ?? 0,
      }));
  }

  /** Transcription structurée d'une session, textes masqués et bornés. */
  transcript(profile: string, sessionId: string, limit = 2_000): TranscriptLine[] {
    const db = this.db(profile);
    if (!db) return [];
    const entries: Omit<TranscriptLine, 'model'>[] = [];
    const rows = db
      .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id LIMIT ?')
      .all(sessionId, limit);
    for (const row of rows) {
      const id = String(row['id']);
      const at = Math.round(Number(row['timestamp'] ?? 0) * 1000);
      const role = String(row['role']);
      const content = text(row['content']);
      if (role === 'assistant') {
        const reasoning = text(row['reasoning']);
        if (reasoning)
          entries.push({
            id: `${id}:r`,
            at,
            role: 'reasoning',
            text: clip(reasoning),
            toolName: null,
            status: null,
          });
        if (content)
          entries.push({
            id,
            at,
            role: 'assistant',
            text: clip(content),
            toolName: null,
            status: null,
          });
        const calls: unknown = (() => {
          try {
            return JSON.parse(text(row['tool_calls']) ?? '[]') as unknown;
          } catch {
            return [];
          }
        })();
        if (Array.isArray(calls)) {
          calls.forEach((call: unknown, index) => {
            const fn =
              typeof call === 'object' && call !== null
                ? ((call as Record<string, unknown>)['function'] as
                    Record<string, unknown> | undefined)
                : undefined;
            entries.push({
              id: `${id}:c${index}`,
              at,
              role: 'tool_call',
              text: clip(text(fn?.['arguments']) ?? null),
              toolName: text(fn?.['name']),
              status: null,
            });
          });
        }
      } else if (role === 'tool') {
        entries.push({
          id,
          at,
          role: 'tool_result',
          text: clip(content),
          toolName: text(row['tool_name']),
          status: toolStatus(content),
        });
      } else {
        entries.push({
          id,
          at,
          role: role === 'user' ? 'user' : 'system',
          text: clip(content),
          toolName: null,
          status: null,
        });
      }
    }
    return entries.map((entry) => ({ ...entry, model: null }));
  }

  /**
   * La session d'un run, jamais devinée : celle notée par Hermès, sinon celle de `hermes --resume`,
   * sinon la seule session lancée avec le run dont le premier message est « work kanban task <carte> ».
   */
  private sessionIdOf(db: DatabaseSync, run: RunRef): string | null {
    for (const id of [run.workerSessionId, run.resumeSessionId]) {
      if (id && db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(id)) return id;
    }
    if (!CARD.test(run.taskId)) return null;
    const prompt = `work kanban task ${run.taskId}`;
    const rows = db
      .prepare(
        `SELECT s.id FROM sessions s WHERE s.started_at BETWEEN ? AND ? AND substr((
           SELECT m.content FROM messages m WHERE m.session_id = s.id AND m.role = 'user'
           ORDER BY m.id LIMIT 1), 1, ?) = ?`,
      )
      .all(run.startedAt - 5, run.startedAt + SESSION_START_SLACK, prompt.length, prompt);
    return rows.length === 1 ? String(rows[0]?.['id']) : null;
  }

  runFacts(profile: string, runs: readonly RunRef[]): SessionFacts[] | null {
    const db = this.db(profile);
    if (!db) return null;
    const facts: SessionFacts[] = [];
    const seen = new Set<string>();
    for (const run of runs) {
      const id = this.sessionIdOf(db, run);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      facts.push({
        id,
        runId: run.id,
        calls: db.prepare(CALLS_SQL).all(id).map(callFact),
        results: db.prepare(RESULTS_SQL).all(id).map(resultFact),
      });
    }
    return facts;
  }

  close(): void {
    for (const db of this.open.values()) db.close();
    this.open.clear();
  }
}
