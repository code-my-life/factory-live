import type { IssueSummary } from '@factory-live/contracts';
import { BellIcon } from '@primer/octicons-react';
import { Heading, Label, SegmentedControl } from '@primer/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useSnapshot } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { Messages } from '../../i18n/fr.ts';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { issuePath } from '../../ui/paths.ts';
import styles from './issues.module.css';

const FILTERS: {
  label: keyof Messages['issues']['filters'];
  keep: (issue: IssueSummary) => boolean;
}[] = [
  { label: 'open', keep: (issue) => issue.status !== 'done' && issue.status !== 'stopped' },
  { label: 'finished', keep: (issue) => issue.status === 'done' || issue.status === 'stopped' },
  { label: 'all', keep: () => true },
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
                <span className={styles.issueRowKey}>{issue.key}</span>
                <span className={styles.issueRowTitle}>{issue.title}</span>
              </span>
              <span className={styles.issueRowMeta}>
                <Label variant={STATUS_VARIANT[issue.status]}>{t.issueStatus[issue.status]}</Label>
                <span>{t.station[issue.station]}</span>
                {issue.activeProfiles.length > 0 ? (
                  <span className="fl-mono">{issue.activeProfiles.join(', ')}</span>
                ) : null}
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
