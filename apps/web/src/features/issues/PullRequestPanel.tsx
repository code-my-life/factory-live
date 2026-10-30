import type { IssueSummary, PullRequestView } from '@factory-live/contracts';
import {
  CheckCircleFillIcon,
  ClockIcon,
  LinkExternalIcon,
  XCircleFillIcon,
} from '@primer/octicons-react';
import { Button, StateLabel } from '@primer/react';
import type { ComponentProps } from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { ChecksBadge } from '../../ui/badge/ChecksBadge.tsx';
import { PullRequestBadge } from '../../ui/badge/PullRequestBadge.tsx';
import { prNumberOfUrl, repoOfKey } from '../../ui/paths.ts';
import styles from './issues.module.css';

const PR_STATUS: Record<PullRequestView['state'], ComponentProps<typeof StateLabel>['status']> = {
  draft: 'draft',
  open: 'pullOpened',
  merged: 'pullMerged',
  closed: 'pullClosed',
};

/** L'état d'une PR, comme sur GitHub : le `StateLabel` de Primer, avec son icône. */
export function PullRequestState({
  state,
  size = 'medium',
}: {
  state: PullRequestView['state'];
  size?: 'small' | 'medium';
}) {
  const { t } = useI18n();
  return (
    <StateLabel status={PR_STATUS[state]} size={size}>
      {t.pr.state[state]}
    </StateLabel>
  );
}

/** État de la PR de l'issue, tel que GitHub le donne (API Actions pour la CI). */
export function PullRequestPanel({ issue }: { issue: IssueSummary }) {
  const { t } = useI18n();
  const pr = issue.pr;
  // A URL with no PR number is not a PR we can name: it is treated as no PR.
  const spottedNumber = issue.prUrl ? prNumberOfUrl(issue.prUrl) : null;
  if (!pr && issue.prUrl && spottedNumber !== null) {
    return (
      <p className={styles.muted}>
        {t.pr.spottedBefore}
        <PullRequestBadge repo={repoOfKey(issue.key)} number={spottedNumber} url={issue.prUrl} />
        {t.pr.spottedAfter}
      </p>
    );
  }
  if (!pr) {
    return <p className={styles.muted}>{t.pr.none}</p>;
  }
  const CheckIcon =
    pr.checks === 'success'
      ? CheckCircleFillIcon
      : pr.checks === 'failure'
        ? XCircleFillIcon
        : ClockIcon;
  return (
    <div className={styles.pr}>
      <div className={styles.prHead}>
        <PullRequestState state={pr.state} />
        <PullRequestBadge
          repo={repoOfKey(issue.key)}
          number={pr.number}
          url={pr.url}
          state={pr.state}
        />
        <ChecksBadge checks={pr.checks} />
        <h3 className={styles.prTitle}>{pr.title}</h3>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt className={styles.factTerm}>{t.pr.changes}</dt>
          <dd className={styles.factValue}>
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
