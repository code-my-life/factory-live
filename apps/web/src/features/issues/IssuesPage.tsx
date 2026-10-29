import type { IssueSummary } from '@factory-live/contracts';
import { BellIcon } from '@primer/octicons-react';
import { Heading, SegmentedControl } from '@primer/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useSnapshot } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { Messages } from '../../i18n/fr.ts';
import { AgentAvatar } from '../../ui/agents/AgentAvatar.tsx';
import { IssueBadge, issueState } from '../../ui/badge/IssueBadge.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { StationMark } from '../../ui/flow/StationMark.tsx';
import { issuePath } from '../../ui/paths.ts';
import { WorkStateLabel, issueWorkState } from '../../ui/work/workState.tsx';
import styles from './issues.module.css';

const FILTERS: {
  label: keyof Messages['issues']['filters'];
  keep: (issue: IssueSummary) => boolean;
}[] = [
  { label: 'open', keep: (issue) => issue.status !== 'done' && issue.status !== 'stopped' },
  { label: 'finished', keep: (issue) => issue.status === 'done' || issue.status === 'stopped' },
  { label: 'all', keep: () => true },
];

export function IssuesPage() {
  const { t } = useI18n();
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
          {t.issues.title}
        </Heading>
        <SegmentedControl
          aria-label={t.issues.filterLabel}
          size="small"
          onChange={(index) => setFilterIndex(index ?? 0)}
        >
          {FILTERS.map((entry, index) => (
            <SegmentedControl.Button key={entry.label} selected={index === filterIndex}>
              {t.issues.filters[entry.label]}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
      </header>
      <ul className={styles.issueList}>
        {issues.map((issue) => (
          <li key={issue.key} className={styles.issueListItem}>
            <Link to={issuePath(issue.key)} className={styles.issueRow}>
              <span className={styles.issueRowMain}>
                <IssueBadge issueKey={issue.key} state={issueState(issue.status)} />{' '}
                <span className={styles.issueRowTitle}>{issue.title}</span>
              </span>
              <span className={styles.issueRowMeta}>
                <WorkStateLabel state={issueWorkState(issue, null, t)} />
                <StationMark station={issue.station} />
                {issue.activeProfiles.map((profile) => (
                  <span key={profile} className={styles.agentCell}>
                    <AgentAvatar profile={profile} size={16} named />
                    {profile}
                  </span>
                ))}
                {issue.interventionIds.length > 0 ? (
                  <span className={styles.issueRowBell}>
                    <BellIcon size={14} aria-hidden="true" /> {issue.interventionIds.length}
                    <span className="fl-visually-hidden">
                      {t.issues.interventions(issue.interventionIds.length)}
                    </span>
                  </span>
                ) : null}
                <span className={styles.muted}>
                  {t.issues.updated} <Elapsed since={issue.updatedAt} mode="age" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
