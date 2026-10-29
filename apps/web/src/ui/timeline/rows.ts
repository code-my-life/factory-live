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
import type { I18n } from '../../i18n/i18n.ts';

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

const KIND_ICON: Record<ActivityEvent['kind'], Icon> = {
  tool: ToolsIcon,
  llm: CommentDiscussionIcon,
  kanban: WorkflowIcon,
  github: GitPullRequestIcon,
  skill: PackageIcon,
  guard: ShieldCheckIcon,
  system: InfoIcon,
};

const FREQUENT = new Set<ActivityEvent['kind']>(['tool', 'llm', 'skill']);

export function fromActivity(event: ActivityEvent, { t }: I18n): TimelineRow {
  const kindIcon = KIND_ICON[event.kind];
  const kindLabel = t.activity.kind[event.kind];
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
    iconLabel: blocked ? t.activity.refused : failed ? t.activity.failed(kindLabel) : kindLabel,
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

const SOURCE_ICON: Record<TimelineEntry['source'], Icon> = {
  kanban: WorkflowIcon,
  hermes: PulseIcon,
  github: GitPullRequestIcon,
  comment: CommentIcon,
  'factory-live': InfoIcon,
};

const TONE: Record<TimelineEntry['tone'], RowTone> = {
  neutral: null,
  success: 'success',
  attention: 'attention',
  danger: 'danger',
  done: 'done',
};

export function fromTimelineEntry(entry: TimelineEntry, { t }: I18n): TimelineRow {
  const sourceIcon = SOURCE_ICON[entry.source];
  const sourceLabel = t.activity.source[entry.source];
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
