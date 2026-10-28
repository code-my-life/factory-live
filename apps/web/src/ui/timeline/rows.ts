import type { ActivityEvent, TimelineEntry } from '@factory-live/contracts';
import {
  BlockedIcon,
  CheckIcon,
  CommentDiscussionIcon,
  CommentIcon,
  GitPullRequestIcon,
  InfoIcon,
  PackageIcon,
  PulseIcon,
  ShieldCheckIcon,
  ToolsIcon,
  WorkflowIcon,
  XIcon,
} from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';

/** Variantes du badge de `Timeline` (Primer) ; `null` : badge neutre. */
export type RowTone = 'accent' | 'success' | 'attention' | 'severe' | 'danger' | 'done' | null;

/** Une ligne de timeline, d'où qu'elle vienne : fil en direct de la ligne d'usine ou historique d'une issue. */
export interface TimelineRow {
  id: string;
  at: string;
  tone: RowTone;
  icon: Icon;
  iconLabel: string;
  /** Événement fréquent (appel d'outil ou de modèle) : ligne condensée. */
  condensed: boolean;
  agent: string | null;
  title: string;
  detail: string | null;
  issueKey: string | null;
  model: string | null;
  durationMs: number | null;
  running: boolean;
}

const KIND_ICON: Record<ActivityEvent['kind'], [Icon, string]> = {
  tool: [ToolsIcon, 'Outil'],
  llm: [CommentDiscussionIcon, 'Modèle'],
  kanban: [WorkflowIcon, 'Kanban'],
  github: [GitPullRequestIcon, 'GitHub'],
  skill: [PackageIcon, 'Skill'],
  guard: [ShieldCheckIcon, 'Garde'],
  system: [InfoIcon, 'Système'],
};

const FREQUENT = new Set<ActivityEvent['kind']>(['tool', 'llm', 'skill']);

export function fromActivity(event: ActivityEvent): TimelineRow {
  const [kindIcon, kindLabel] = KIND_ICON[event.kind];
  const failed = event.status === 'error';
  const blocked = event.status === 'blocked';
  const tone: RowTone = blocked
    ? 'severe'
    : failed
      ? 'danger'
      : event.status === 'running'
        ? 'accent'
        : event.kind === 'kanban' && event.status === 'ok'
          ? 'success'
          : null;
  return {
    id: event.id,
    at: event.at,
    tone,
    icon: blocked ? BlockedIcon : failed && FREQUENT.has(event.kind) ? XIcon : kindIcon,
    iconLabel: blocked ? 'Refus' : failed ? `${kindLabel} en échec` : kindLabel,
    condensed: FREQUENT.has(event.kind) && !failed && !blocked,
    agent: event.profile,
    title: event.label,
    detail: event.detail,
    issueKey: event.issueKey,
    model: event.model,
    durationMs: event.durationMs,
    running: event.status === 'running',
  };
}

const SOURCE_ICON: Record<TimelineEntry['source'], [Icon, string]> = {
  kanban: [WorkflowIcon, 'Kanban'],
  hermes: [PulseIcon, 'Hermès'],
  github: [GitPullRequestIcon, 'GitHub'],
  comment: [CommentIcon, 'Commentaire'],
  'factory-live': [InfoIcon, 'factory-live'],
};

const TONE: Record<TimelineEntry['tone'], RowTone> = {
  neutral: null,
  success: 'success',
  attention: 'attention',
  danger: 'danger',
  done: 'done',
};

export function fromTimelineEntry(entry: TimelineEntry): TimelineRow {
  const [sourceIcon, sourceLabel] = SOURCE_ICON[entry.source];
  return {
    id: entry.id,
    at: entry.at,
    tone: TONE[entry.tone],
    icon: entry.tone === 'done' ? CheckIcon : entry.tone === 'danger' ? BlockedIcon : sourceIcon,
    iconLabel: sourceLabel,
    condensed:
      entry.source === 'comment' || (entry.source === 'hermes' && entry.tone === 'neutral'),
    agent: entry.profile,
    title: entry.label,
    detail: entry.detail,
    issueKey: null,
    model: null,
    durationMs: null,
    running: false,
  };
}
