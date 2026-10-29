import type { IssueSummary } from '@factory-live/contracts';
import {
  CheckCircleFillIcon,
  ClockIcon,
  LinkExternalIcon,
  XCircleFillIcon,
} from '@primer/octicons-react';
import { Button, Link as PrimerLink, StateLabel } from '@primer/react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import styles from './issues.module.css';

/** État de la PR de l'issue, tel que GitHub le donne (API Actions pour la CI). */
export function PullRequestPanel({ issue }: { issue: IssueSummary }) {
  const { t } = useI18n();
  const pr = issue.pr;
  if (!pr && issue.prUrl) {
    return (
      <p className={styles.muted}>
        {t.pr.spottedBefore}
        <PrimerLink href={issue.prUrl} target="_blank" rel="noreferrer">
          #{issue.prUrl.split('/').at(-1)}
        </PrimerLink>
        {t.pr.spottedAfter}
      </p>
    );
  }
  if (!pr) {
    return <p className={styles.muted}>{t.pr.none}</p>;
  }
  const status =
    pr.state === 'merged'
      ? 'pullMerged'
      : pr.state === 'closed'
        ? 'pullClosed'
        : pr.state === 'draft'
          ? 'draft'
          : 'pullOpened';
  const CheckIcon =
    pr.checks === 'success'
      ? CheckCircleFillIcon
      : pr.checks === 'failure'
        ? XCircleFillIcon
        : ClockIcon;
  return (
    <div className={styles.pr}>
      <div className={styles.prHead}>
        <StateLabel status={status}>{t.pr.state[pr.state]}</StateLabel>
        <h3 className={styles.prTitle}>
          {pr.title} <span className={styles.muted}>#{pr.number}</span>
        </h3>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt className={styles.factTerm}>{t.pr.changes}</dt>
          <dd className={`${styles.factValue} fl-tabular`}>
            +{pr.additions} −{pr.deletions} · {t.issue.files(pr.changedFiles)}
          </dd>
        </div>
        <div>
          <dt className={styles.factTerm}>{t.pr.review}</dt>
          <dd className={styles.factValue}>{t.pr.reviewDecision[pr.reviewDecision ?? 'none']}</dd>
        </div>
        <div>
          <dt className={styles.factTerm}>{t.pr.autoMerge}</dt>
          <dd className={styles.factValue}>
            {pr.autoMerge ? t.pr.autoMergeOn : t.pr.autoMergeOff}
          </dd>
        </div>
      </dl>
      <ul className={styles.checks} aria-label={t.pr.workflows}>
        {t.pr.checks.map((check) => (
          <li key={check.name} className={styles.check} data-state={pr.checks}>
            <CheckIcon size={16} aria-hidden="true" className={styles.checkIcon} />
            <span>
              <strong>{check.name}</strong> <span className={styles.muted}>{check.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <Button
        as="a"
        href={pr.url}
        target="_blank"
        rel="noreferrer"
        trailingVisual={LinkExternalIcon}
      >
        {pr.reviewDecision === 'review_required' ? t.pr.approve : t.pr.open}
      </Button>
    </div>
  );
}
