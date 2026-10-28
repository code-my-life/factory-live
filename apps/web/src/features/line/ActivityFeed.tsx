import type { ActivityEvent } from '@factory-live/contracts';
import {
  BlockedIcon,
  CommentDiscussionIcon,
  GitPullRequestIcon,
  InfoIcon,
  PackageIcon,
  ShieldCheckIcon,
  ToolsIcon,
  WorkflowIcon,
} from '@primer/octicons-react';
import { SegmentedControl } from '@primer/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatClock, formatDuration } from '../../ui/format.ts';
import { issuePath } from '../issues/paths.ts';
import styles from './ActivityFeed.module.css';

const FILTERS: { label: string; kinds: readonly ActivityEvent['kind'][] | null }[] = [
  { label: 'Tout', kinds: null },
  { label: 'Outils', kinds: ['tool', 'skill', 'guard'] },
  { label: 'Modèles', kinds: ['llm'] },
  { label: 'Kanban', kinds: ['kanban'] },
  { label: 'GitHub', kinds: ['github'] },
];

const KIND_ICON = {
  tool: ToolsIcon,
  llm: CommentDiscussionIcon,
  kanban: WorkflowIcon,
  github: GitPullRequestIcon,
  skill: PackageIcon,
  guard: ShieldCheckIcon,
  system: InfoIcon,
} as const;

const KIND_LABEL: Record<ActivityEvent['kind'], string> = {
  tool: 'Outil',
  llm: 'Modèle',
  kanban: 'Kanban',
  github: 'GitHub',
  skill: 'Skill',
  guard: 'Garde',
  system: 'Système',
};

/** Le fil de tout ce qui se passe : un appel d'outil, un appel au modèle, une transition, un événement GitHub. */
export function ActivityFeed({
  events,
  title = 'Fil d’activité',
  limit = 40,
}: {
  events: readonly ActivityEvent[];
  title?: string;
  limit?: number;
}) {
  const [filterIndex, setFilterIndex] = useState(0);
  const kinds = FILTERS[filterIndex]?.kinds ?? null;
  const visible = events
    .filter((event) => kinds === null || kinds.includes(event.kind))
    .slice(0, limit);

  return (
    <section className={styles.feed} aria-labelledby="activity-title">
      <header className={styles.head}>
        <h2 id="activity-title" className={styles.title}>
          {title}
        </h2>
        <SegmentedControl
          aria-label="Filtrer le fil d’activité"
          size="small"
          onChange={(index) => setFilterIndex(index ?? 0)}
        >
          {FILTERS.map((filter, index) => (
            <SegmentedControl.Button key={filter.label} selected={index === filterIndex}>
              {filter.label}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
      </header>
      {visible.length === 0 ? (
        <p className={styles.empty}>Rien pour ce filtre pour l’instant.</p>
      ) : (
        <ol className={styles.list}>
          {visible.map((event) => {
            const KindIcon = event.status === 'blocked' ? BlockedIcon : KIND_ICON[event.kind];
            return (
              <li key={event.id} className={styles.item} data-status={event.status ?? undefined}>
                <time className={styles.time} dateTime={event.at}>
                  {formatClock(event.at)}
                </time>
                <span className={styles.kind} title={KIND_LABEL[event.kind]}>
                  <KindIcon size={14} aria-label={KIND_LABEL[event.kind]} />
                </span>
                <span className={styles.body}>
                  <span className={styles.line}>
                    {event.profile ? <span className={styles.profile}>{event.profile}</span> : null}
                    <span className={styles.label}>{event.label}</span>
                    {event.durationMs !== null ? (
                      <span className={styles.duration}>{formatDuration(event.durationMs)}</span>
                    ) : null}
                    {event.status === 'running' ? (
                      <span className={styles.running}>en cours</span>
                    ) : null}
                  </span>
                  {event.detail ? <span className={styles.detail}>{event.detail}</span> : null}
                  <span className={styles.meta}>
                    {event.issueKey ? (
                      <Link to={issuePath(event.issueKey)} className={styles.issue}>
                        {event.issueKey}
                      </Link>
                    ) : null}
                    {event.model ? <span className={styles.model}>{event.model}</span> : null}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
