import { Label, Timeline } from '@primer/react';
import { AgentAvatar } from '../agents/AgentAvatar.tsx';
import { IssueBadge } from '../badge/IssueBadge.tsx';
import { formatClock, formatDuration } from '../format.ts';
import { ModelBadge } from '../ModelBadge.tsx';
import type { TimelineRow } from './rows.ts';
import styles from './ActivityTimeline.module.css';

/**
 * La timeline de factory-live, la même sur la ligne d'usine (fil en direct) et sur une issue
 * (historique) : composant `Timeline` de Primer, badge coloré par l'état, avatar de l'agent.
 */
export function ActivityTimeline({ rows, label }: { rows: readonly TimelineRow[]; label: string }) {
  return (
    <Timeline clipSidebar className={styles.timeline} aria-label={label}>
      {rows.map((row) => {
        const RowIcon = row.icon;
        return (
          <Timeline.Item key={row.id} condensed={row.condensed} className={styles.item}>
            <Timeline.Badge {...(row.tone ? { variant: row.tone } : {})}>
              <RowIcon aria-label={row.iconLabel} />
            </Timeline.Badge>
            <Timeline.Body className={styles.body}>
              <div className={styles.head}>
                {row.agent ? (
                  <span className={styles.agent}>
                    <AgentAvatar profile={row.agent} size={16} named />
                    <span className={styles.agentName}>{row.agent}</span>
                  </span>
                ) : null}
                <span className={styles.title}>{row.title}</span>
                {row.running ? (
                  <Label variant="accent" size="small">
                    en cours
                  </Label>
                ) : null}
                <time className={styles.time} dateTime={row.at}>
                  {formatClock(row.at)}
                </time>
              </div>
              {row.detail ? <p className={styles.detail}>{row.detail}</p> : null}
              {row.issueKey || row.model || row.durationMs !== null ? (
                <p className={styles.meta}>
                  {row.issueKey ? <IssueBadge issueKey={row.issueKey} link /> : null}
                  {row.model ? <ModelBadge model={{ model: row.model }} /> : null}
                  {row.durationMs !== null ? (
                    <span className={styles.duration}>{formatDuration(row.durationMs)}</span>
                  ) : null}
                </p>
              ) : null}
            </Timeline.Body>
          </Timeline.Item>
        );
      })}
    </Timeline>
  );
}
