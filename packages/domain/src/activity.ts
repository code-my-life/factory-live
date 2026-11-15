/**
 * The agents' live activity, as the projection writes it: the state of an agent at work.
 */
import type { Message, Text } from './messages.ts';

export type LiveState = 'thinking' | 'tool' | 'cli' | 'blocked';

/** Ce que le fil d'activité écrit lui-même ; le reste (outils, modèles, raisons) reste tel quel. */
export type ActivityMessage =
  | Message<'activity.tool.unknown'>
  | Message<'activity.action.llm'>
  | Message<'activity.llm.tokens', { input: number; output: number }>
  | Message<
      'activity.llm.rateLimited',
      { model: string; attempt: number | null; attempts: number | null }
    >
  | Message<
      'activity.llm.error',
      { status: number | null; model: string; attempt: number | null; attempts: number | null }
    >
  | Message<'activity.skill', { action: string }>
  | Message<'activity.session.end', { outcome: 'completed' | 'failed' | 'interrupted' }>
  | Message<'activity.kanban.claimed', { profile: string }>
  | Message<'activity.worker.spawned'>
  | Message<'activity.worker.exited'>
  | Message<'activity.worker.stale'>
  | Message<'activity.subagent.start'>
  | Message<'activity.subagent.stop'>;

export type ActivityText = Text<ActivityMessage>;

export interface LiveModel {
  model: string;
  provider: string;
  at: number;
}

export interface LiveAction {
  kind: 'llm' | 'tool' | 'cli';
  label: ActivityText;
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
