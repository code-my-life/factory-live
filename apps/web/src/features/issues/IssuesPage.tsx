import type { IssueSummary } from '@factory-live/contracts';
import { BellIcon } from '@primer/octicons-react';
import { Heading, Label, SegmentedControl } from '@primer/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useSnapshot } from '../../data/FactoryProvider.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { ISSUE_STATUS_LABEL, STATION_LABEL } from '../../ui/vocabulary.ts';
import { issuePath } from './paths.ts';
import styles from './issues.module.css';

const FILTERS: { label: string; keep: (issue: IssueSummary) => boolean }[] = [
  { label: 'Ouvertes', keep: (issue) => issue.status !== 'done' && issue.status !== 'stopped' },
  { label: 'Terminées', keep: (issue) => issue.status === 'done' || issue.status === 'stopped' },
  { label: 'Toutes', keep: () => true },
];

const STATUS_VARIANT = {
  active: 'accent',
  queued: 'secondary',
  waiting_human: 'attention',
  blocked: 'danger',
  done: 'done',
  stopped: 'secondary',
} as const;

export function IssuesPage() {
  const snapshot = useSnapshot();
  const [filterIndex, setFilterIndex] = useState(0);
  const filter = FILTERS[filterIndex] ?? FILTERS[0];
  const issues = snapshot.issues
    .filter((issue) => filter?.keep(issue) ?? true)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return (
    <section className={styles.page} aria-labelledby="issues-title">
      <header className={styles.listHead}>
        <Heading as="h1" variant="medium" id="issues-title">
          Issues
        </Heading>
        <SegmentedControl
          aria-label="Filtrer les issues"
          size="small"
          onChange={(index) => setFilterIndex(index ?? 0)}
        >
          {FILTERS.map((entry, index) => (
            <SegmentedControl.Button key={entry.label} selected={index === filterIndex}>
              {entry.label}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
      </header>
      <ul className={styles.issueList}>
        {issues.map((issue) => (
          <li key={issue.key}>
            <Link to={issuePath(issue.key)} className={styles.issueRow}>
              <span className={styles.issueRowMain}>
                <span className={styles.issueRowKey}>{issue.key}</span>
                <span className={styles.issueRowTitle}>{issue.title}</span>
              </span>
              <span className={styles.issueRowMeta}>
                <Label variant={STATUS_VARIANT[issue.status]}>
                  {ISSUE_STATUS_LABEL[issue.status]}
                </Label>
                <span>{STATION_LABEL[issue.station]}</span>
                {issue.activeProfiles.length > 0 ? (
                  <span className="fl-mono">{issue.activeProfiles.join(', ')}</span>
                ) : null}
                {issue.interventionIds.length > 0 ? (
                  <span className={styles.issueRowBell}>
                    <BellIcon size={14} aria-hidden="true" /> {issue.interventionIds.length}
                    <span className="fl-visually-hidden"> intervention(s)</span>
                  </span>
                ) : null}
                <span className={styles.muted}>
                  mise à jour <Elapsed since={issue.updatedAt} mode="age" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
