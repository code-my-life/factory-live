import type { HermesHookBody } from '@factory-live/contracts';
import { redactSecrets } from '@factory-live/domain';
import type { HookEvent } from '@factory-live/domain';

/**
 * Champs gardés d'un webhook. Tout le reste est écarté à la réception : résultats d'outils, requêtes et
 * réponses complètes, messages (jusqu'à 50 000 caractères chacun côté Hermès), qui n'ont rien à faire
 * dans le fil et pourraient contenir des secrets.
 */
const EXTRA_KEEP = new Set([
  'status',
  'error_type',
  'error_message',
  'duration_ms',
  'model',
  'response_model',
  'provider',
  'api_duration',
  'usage',
  'finish_reason',
  'status_code',
  'retry_count',
  'max_retries',
  'retryable',
  'error',
  'reason',
  'action',
  'skill_name',
  'task_id',
  'assignee',
  'run_id',
  'worker_pid',
  'exit_kind',
  'exit_code',
  'outcome',
  'retry_status',
  'summary',
  'child_goal',
  'child_role',
  'child_summary',
  'child_status',
  'completed',
  'failed',
  'interrupted',
  'turn_exit_reason',
  'board',
  'profile_name',
  'dry_run',
]);

const TOOL_INPUT_KEEP = new Set([
  'command',
  'path',
  'file_path',
  'name',
  'query',
  'task_id',
  'url',
  'pattern',
  'skill',
  'action',
]);
const STRING_MAX = 2_000;

function bound(value: unknown, depth = 0): unknown {
  if (typeof value === 'string')
    return redactSecrets(value.length > STRING_MAX ? `${value.slice(0, STRING_MAX)}…` : value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (depth >= 2) return null;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => bound(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, item]) => [key, bound(item, depth + 1)]),
    );
  }
  return null;
}

function pick(
  source: Readonly<Record<string, unknown>> | null,
  keep: ReadonlySet<string>,
): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source ?? {}))
    if (keep.has(key)) kept[key] = bound(value);
  return kept;
}

/** Webhook reçu, réduit à ce dont le domaine a besoin. */
export function toHookEvent(body: HermesHookBody): HookEvent {
  return {
    event: body.hook_event_name,
    profile: body.profile,
    sessionId: body.session_id,
    cwd: body.cwd,
    toolName: body.tool_name,
    toolInput: body.tool_input ? pick(body.tool_input, TOOL_INPUT_KEEP) : null,
    extra: pick(body.extra, EXTRA_KEEP),
    at: Date.parse(body.timestamp),
  };
}
