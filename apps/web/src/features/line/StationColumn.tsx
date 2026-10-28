import type { AgentActivity, IssueSummary, StationView } from '@factory-live/contracts';
import { CounterLabel } from '@primer/react';
import { Link } from 'react-router';
import { STATION_HINT, STATION_LABEL } from '../../ui/vocabulary.ts';
import { AgentCard } from './AgentCard.tsx';
import { IssueToken } from './IssueToken.tsx';
import styles from './line.module.css';

const STATUS_ORDER: Record<IssueSummary['status'], number> = {
  waiting_human: 0,
  blocked: 1,
  active: 2,
  queued: 3,
  done: 4,
  stopped: 5,
};

const DONE_VISIBLE = 3;

export function StationColumn({
  station,
  agents,
  issues,
  maxInProgress,
}: {
  station: StationView;
  agents: readonly AgentActivity[];
  issues: readonly IssueSummary[];
  maxInProgress: number;
}) {
  const busy = agents.filter((agent) => agent.state !== 'idle');
  const idle = station.profiles.filter(
    (profile) => !busy.some((agent) => agent.profile === profile),
  );
  const sorted = [...issues].sort(
    (left, right) =>
      STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
      right.updatedAt.localeCompare(left.updatedAt),
  );
  const isDone = station.id === 'done';
  const visible = isDone ? sorted.slice(0, DONE_VISIBLE) : sorted;
  const headingId = `station-${station.id}`;
  const needsHuman = issues.some(
    (issue) => issue.status === 'waiting_human' || issue.status === 'blocked',
  );

  return (
    <section
      className={styles.station}
      data-station={station.id}
      data-attention={needsHuman ? 'true' : undefined}
      aria-labelledby={headingId}
    >
      <header className={styles.stationHead}>
        <h2 id={headingId} className={styles.stationTitle}>
          {STATION_LABEL[station.id]}
        </h2>
        <CounterLabel aria-label={`${issues.length} issue${issues.length > 1 ? 's' : ''}`}>
          {issues.length}
        </CounterLabel>
      </header>
      <p className={styles.stationHint}>{STATION_HINT[station.id]}</p>

      {busy.length > 0 ? (
        <div className={styles.agents}>
          {busy.map((agent) => (
            <AgentCard key={agent.profile} agent={agent} maxInProgress={maxInProgress} />
          ))}
        </div>
      ) : null}

      {visible.length > 0 ? (
        <ul className={styles.tokens} aria-label={`Issues à l’étape ${STATION_LABEL[station.id]}`}>
          {visible.map((issue) => (
            <IssueToken key={issue.key} issue={issue} />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>Aucune issue</p>
      )}

      {isDone && sorted.length > DONE_VISIBLE ? (
        <Link to="/history" className={styles.more}>
          {sorted.length - DONE_VISIBLE} de plus dans l’historique
        </Link>
      ) : null}

      {idle.length > 0 ? (
        <p className={styles.idle}>
          <span className={styles.idleLabel}>Au repos</span> {idle.join(', ')}
        </p>
      ) : null}
    </section>
  );
}
