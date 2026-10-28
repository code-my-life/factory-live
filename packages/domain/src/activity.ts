/**
 * Activité en direct des agents, reconstruite à partir des webhooks sortants natifs d'Hermès
 * (`hooks.outbound`). Fonction pure : un état et un événement donnent un nouvel état et des lignes de fil.
 * Charges vérifiées dans Hermès v0.22.2 : `agent/shell_hooks.py` (`_payload_fields`), `model_tools.py`
 * (post_tool_call), `agent/turn_response_intake.py` (post_api_request), `agent/api_request_hooks.py`
 * (api_request_error), `hermes_cli/kanban_db.py` et `kanban_db_dispatch.py` (événements kanban).
 */
import type { Task } from './hermes.ts';

export interface HookEvent {
  event: string;
  profile: string;
  sessionId: string;
  /** Dossier courant du process qui émet : un worker kanban est lancé dans le workspace de sa carte. */
  cwd: string;
  toolName: string | null;
  toolInput: Readonly<Record<string, unknown>> | null;
  extra: Readonly<Record<string, unknown>>;
  /** Millisecondes epoch. */
  at: number;
}

export type LiveState = 'thinking' | 'tool' | 'cli' | 'blocked';

export interface LiveModel {
  model: string;
  provider: string;
  at: number;
}

export interface LiveAction {
  kind: 'llm' | 'tool' | 'cli';
  label: string;
  detail: string | null;
  startedAt: number;
}

/** Un worker en cours : un profil sur une carte (un profil peut en tenir plusieurs à la fois). */
export interface LiveAgent {
  key: string;
  profile: string;
  state: LiveState;
  cardId: string | null;
  sessionId: string | null;
  model: LiveModel | null;
  laneModel: LiveModel | null;
  action: LiveAction | null;
  runStartedAt: number | null;
  lastHeartbeatAt: number;
}

export interface ActivityLine {
  at: number;
  kind: 'tool' | 'llm' | 'kanban' | 'skill' | 'guard' | 'system';
  profile: string;
  cardId: string | null;
  label: string;
  detail: string | null;
  status: 'ok' | 'running' | 'error' | 'blocked' | null;
  durationMs: number | null;
  model: string | null;
}

export interface ToolCallSummary {
  label: string;
  detail: string | null;
  lane: 'claude-code' | 'opencode' | null;
  laneModel: string | null;
}

const WORKSPACE = /(?:\.worktrees|workspaces)\/(t_[0-9a-f]{8})(?:\/|$)/;
const DETAIL_MAX = 200;
/** Événements kanban : `task_id` y est l'id de la carte (dans les autres, c'est l'id du tour de l'agent). */
const KANBAN_EVENTS = new Set([
  'kanban_task_claimed',
  'kanban_task_completed',
  'kanban_task_blocked',
  'on_kanban_worker_spawned',
  'on_kanban_worker_exited',
  'on_kanban_worker_stale_claim',
]);
const SKILL_ACTIONS: Readonly<Record<string, string>> = {
  loaded: 'Skill chargée',
  created: 'Skill créée',
  edited: 'Skill modifiée',
  patched: 'Skill modifiée',
  installed: 'Skill installée',
};

export function taskIdFromCwd(cwd: string): string | null {
  return WORKSPACE.exec(cwd)?.[1] ?? null;
}

/** Une carte en cours, telle que le kanban la décrit : de quoi la retrouver par le dossier de son worker. */
export type RunningCard = Pick<Task, 'id' | 'assignee' | 'workspacePath'>;

function rootOf(path: string): string {
  return path.replace(/\/+$/, '');
}

function contains(workspace: string, cwd: string): boolean {
  const root = rootOf(workspace);
  return root !== '' && (cwd === root || cwd.startsWith(`${root}/`));
}

/**
 * La carte d'un worker d'après son dossier courant. D'abord la carte en cours de son profil dont le
 * workspace contient ce dossier, la plus précise l'emportant : c'est la seule voie pour un workspace
 * `dir:`, le clone du dépôt pour un onboarding ou le worktree de la carte impl pour une reprise de la
 * gate. Sinon l'id lu dans le chemin, quand la carte n'est pas encore en cours dans le kanban lu.
 * Deux cartes à égalité : celle que nomme le chemin, sinon aucune plutôt qu'une au hasard.
 */
export function cardOfCwd(
  cwd: string,
  profile: string,
  running: readonly RunningCard[] = [],
): string | null {
  const named = taskIdFromCwd(cwd);
  let best: RunningCard[] = [];
  let depth = -1;
  for (const card of running) {
    if (card.assignee !== profile || !card.workspacePath || !contains(card.workspacePath, cwd))
      continue;
    const length = rootOf(card.workspacePath).length;
    if (length > depth) [best, depth] = [[card], length];
    else if (length === depth) best.push(card);
  }
  if (best.length === 0) return named;
  if (best.length === 1) return best[0]?.id ?? null;
  return best.some((card) => card.id === named) ? named : null;
}

export function agentKey(profile: string, cardId: string | null, sessionId: string | null): string {
  return cardId ? `${profile}@${cardId}` : `${profile}#${sessionId ?? ''}`;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clip(value: string | null): string | null {
  if (!value) return null;
  const line = value.split('\n')[0]?.trim() ?? '';
  if (!line) return null;
  return line.length > DETAIL_MAX ? `${line.slice(0, DETAIL_MAX - 1)}…` : line;
}

/** Résumé lisible d'un appel d'outil ; reconnaît les lanes CLI lancées par le terminal. */
export function describeToolCall(
  toolName: string | null,
  input: Readonly<Record<string, unknown>> | null,
): ToolCallSummary {
  const name = toolName ?? 'outil';
  const args = input ?? {};
  const command = str(args['command']);
  if (name === 'terminal' && command) {
    const claude = /(?:^|[\s;&|(])claude\s+-p\b/.test(command);
    const opencode = /(?:^|[\s;&|(])opencode\s+run\b/.test(command);
    if (claude || opencode) {
      const model = /--model[=\s]+("?)([^\s"]+)\1/.exec(command)?.[2] ?? null;
      return {
        label: claude ? 'claude -p' : 'opencode run',
        detail: clip(command),
        lane: claude ? 'claude-code' : 'opencode',
        laneModel: model,
      };
    }
    return { label: 'terminal', detail: clip(command), lane: null, laneModel: null };
  }
  const detail =
    str(args['path']) ??
    str(args['file_path']) ??
    str(args['name']) ??
    str(args['query']) ??
    str(args['task_id']) ??
    str(args['url']) ??
    null;
  return { label: name, detail: clip(detail), lane: null, laneModel: null };
}

function line(
  event: HookEvent,
  profile: string,
  cardId: string | null,
  patch: Partial<ActivityLine> & Pick<ActivityLine, 'kind' | 'label'>,
): ActivityLine {
  return {
    at: event.at,
    profile,
    cardId,
    detail: null,
    status: null,
    durationMs: null,
    model: null,
    ...patch,
  };
}

/**
 * Applique un webhook : rend un nouvel état (l'ancien n'est jamais modifié) et les lignes du fil à
 * ajouter. `running` (les cartes en cours) relie à sa carte un worker dont le dossier ne la nomme pas.
 */
export function applyHook(
  agents: ReadonlyMap<string, LiveAgent>,
  event: HookEvent,
  running: readonly RunningCard[] = [],
): { agents: Map<string, LiveAgent>; lines: ActivityLine[] } {
  const next = new Map(agents);
  const extra = event.extra;
  const kanban = KANBAN_EVENTS.has(event.event);
  const profile = kanban ? (str(extra['assignee']) ?? event.profile) : event.profile;
  const cardId = kanban ? str(extra['task_id']) : cardOfCwd(event.cwd, profile, running);
  const sessionId = kanban ? null : str(event.sessionId);
  const key = agentKey(profile, cardId, sessionId);
  const current = next.get(key);
  const lines: ActivityLine[] = [];
  const put = (patch: Partial<LiveAgent>) =>
    next.set(key, {
      key,
      profile,
      state: 'thinking',
      cardId,
      sessionId,
      model: null,
      laneModel: null,
      action: null,
      runStartedAt: event.at,
      ...current,
      ...(sessionId && !current?.sessionId ? { sessionId } : {}),
      lastHeartbeatAt: event.at,
      ...patch,
    });
  const push = (patch: Partial<ActivityLine> & Pick<ActivityLine, 'kind' | 'label'>) =>
    lines.push(line(event, profile, cardId, patch));

  switch (event.event) {
    case 'pre_tool_call': {
      const call = describeToolCall(event.toolName, event.toolInput);
      put({
        state: call.lane ? 'cli' : 'tool',
        action: {
          kind: call.lane ? 'cli' : 'tool',
          label: call.label,
          detail: call.detail,
          startedAt: event.at,
        },
        ...(call.laneModel
          ? {
              laneModel: {
                model: call.laneModel,
                provider: call.lane === 'claude-code' ? 'anthropic' : 'opencode',
                at: event.at,
              },
            }
          : {}),
      });
      push({
        kind: 'tool',
        label: call.label,
        detail: call.detail,
        status: 'running',
        model: call.laneModel,
      });
      break;
    }
    case 'post_tool_call': {
      const call = describeToolCall(event.toolName, event.toolInput);
      const status = str(extra['status']) ?? 'ok';
      const message = clip(str(extra['error_message']));
      put({
        state: 'thinking',
        action: {
          kind: 'llm',
          label: 'Appel au modèle',
          detail: current?.model?.model ?? null,
          startedAt: event.at,
        },
        ...(call.lane ? { laneModel: null } : {}),
      });
      push({
        kind: status === 'blocked' ? 'guard' : 'tool',
        label: call.label,
        detail: status === 'ok' ? call.detail : (message ?? call.detail),
        status: status === 'blocked' ? 'blocked' : status === 'ok' ? 'ok' : 'error',
        durationMs: num(extra['duration_ms']),
      });
      break;
    }
    case 'post_api_request': {
      const model =
        str(extra['response_model']) ?? str(extra['model']) ?? current?.model?.model ?? '?';
      const provider = str(extra['provider']) ?? current?.model?.provider ?? '?';
      const seconds = num(extra['api_duration']);
      const usage = record(extra['usage']);
      const input = num(usage['input_tokens']);
      put({ model: { model, provider, at: event.at } });
      push({
        kind: 'llm',
        label: model,
        detail:
          input !== null
            ? `${input} jetons en entrée, ${num(usage['output_tokens']) ?? 0} en sortie`
            : provider,
        status: 'ok',
        durationMs: seconds !== null ? Math.round(seconds * 1000) : null,
        model,
      });
      break;
    }
    case 'api_request_error': {
      const model = str(extra['model']) ?? current?.model?.model ?? '?';
      const code = num(extra['status_code']);
      const retry = num(extra['retry_count']);
      const max = num(extra['max_retries']);
      const message = clip(str(record(extra['error'])['message']) ?? str(extra['reason']));
      const attempt = retry !== null && max !== null ? ` (essai ${retry + 1} sur ${max + 1})` : '';
      if (current) put({});
      push({
        kind: 'llm',
        label:
          code === 429
            ? `429 sur ${model}${attempt}`
            : `Erreur${code ? ` ${code}` : ''} sur ${model}${attempt}`,
        detail: message,
        status: 'error',
        model,
      });
      break;
    }
    case 'on_skill_lifecycle': {
      const action = str(extra['action']) ?? 'loaded';
      push({
        kind: 'skill',
        label: SKILL_ACTIONS[action] ?? `Skill : ${action}`,
        detail: str(extra['skill_name']),
        status: 'ok',
      });
      break;
    }
    case 'on_session_start':
      put({ state: 'thinking', runStartedAt: current?.runStartedAt ?? event.at });
      break;
    case 'on_session_end': {
      next.delete(key);
      const failed = extra['failed'] === true;
      const interrupted = extra['interrupted'] === true;
      push({
        kind: 'system',
        label: failed
          ? 'Session en échec'
          : interrupted
            ? 'Session interrompue'
            : 'Session terminée',
        detail: str(extra['turn_exit_reason']),
        status: failed || interrupted ? 'error' : 'ok',
      });
      break;
    }
    case 'kanban_task_claimed':
      put({ state: 'thinking', runStartedAt: event.at, action: null });
      push({
        kind: 'kanban',
        label: 'claimed',
        detail: `Le dispatcher lance ${profile}`,
        status: 'ok',
      });
      break;
    case 'on_kanban_worker_spawned':
      put({});
      push({
        kind: 'kanban',
        label: 'Worker lancé',
        detail: num(extra['worker_pid']) !== null ? `pid ${num(extra['worker_pid'])}` : null,
        status: 'ok',
      });
      break;
    case 'on_kanban_worker_exited':
      next.delete(key);
      push({
        kind: 'kanban',
        label: 'Worker arrêté',
        detail: [str(extra['exit_kind']), str(extra['outcome'])].filter(Boolean).join(', ') || null,
        status: 'error',
      });
      break;
    case 'on_kanban_worker_stale_claim':
      next.delete(key);
      push({
        kind: 'kanban',
        label: 'Carte reprise au worker muet',
        detail: str(extra['retry_status']),
        status: 'error',
      });
      break;
    case 'kanban_task_blocked':
      put({ state: 'blocked', action: null });
      push({
        kind: 'kanban',
        label: 'blocked',
        detail: clip(str(extra['reason'])),
        status: 'blocked',
      });
      break;
    case 'kanban_task_completed':
      push({
        kind: 'kanban',
        label: 'completed',
        detail: clip(str(extra['summary'])),
        status: 'ok',
      });
      break;
    case 'subagent_start':
      push({
        kind: 'system',
        label: 'Sous-agent lancé',
        detail: clip(str(extra['child_goal'])),
        status: 'running',
      });
      break;
    case 'subagent_stop':
      push({
        kind: 'system',
        label: 'Sous-agent terminé',
        detail: clip(str(extra['child_summary'])),
        status: str(extra['child_status']) === 'error' ? 'error' : 'ok',
        durationMs: num(extra['duration_ms']),
      });
      break;
    default:
      break;
  }
  return { agents: next, lines };
}
