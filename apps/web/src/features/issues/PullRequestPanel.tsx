import type { IssueSummary } from '@factory-live/contracts';
import {
  CheckCircleFillIcon,
  ClockIcon,
  LinkExternalIcon,
  XCircleFillIcon,
} from '@primer/octicons-react';
import { Button, Link as PrimerLink, StateLabel } from '@primer/react';
import styles from './issues.module.css';

const CHECKS = [
  { name: 'Tests', detail: 'Windows, macOS, Ubuntu × Node 22 et 24' },
  { name: 'E2E', detail: 'Electron, scénarios des cartes' },
  { name: 'GitHub Pages', detail: 'Site de présentation' },
];

/** État de la PR de l'issue, tel que GitHub le donne (API Actions pour la CI). */
export function PullRequestPanel({ issue }: { issue: IssueSummary }) {
  const pr = issue.pr;
  if (!pr && issue.prUrl) {
    return (
      <p className={styles.muted}>
        PR{' '}
        <PrimerLink href={issue.prUrl} target="_blank" rel="noreferrer">
          #{issue.prUrl.split('/').at(-1)}
        </PrimerLink>{' '}
        relevée par la factory ; son état, ses revues et sa CI s’afficheront une fois GitHub relié
        (Réglages, GitHub).
      </p>
    );
  }
  if (!pr) {
    return (
      <p className={styles.muted}>
        Pas encore de PR : elle s’ouvre en brouillon à la fin de l’implémentation.
      </p>
    );
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
        <StateLabel status={status}>
          {pr.state === 'draft'
            ? 'Brouillon'
            : pr.state === 'merged'
              ? 'Fusionnée'
              : pr.state === 'closed'
                ? 'Fermée'
                : 'Ouverte'}
        </StateLabel>
        <h3 className={styles.prTitle}>
          {pr.title} <span className={styles.muted}>#{pr.number}</span>
        </h3>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt className={styles.factTerm}>Changements</dt>
          <dd className={`${styles.factValue} fl-tabular`}>
            +{pr.additions} −{pr.deletions} · {pr.changedFiles} fichiers
          </dd>
        </div>
        <div>
          <dt className={styles.factTerm}>Revue</dt>
          <dd className={styles.factValue}>
            {pr.reviewDecision === 'approved'
              ? 'Approuvée'
              : pr.reviewDecision === 'changes_requested'
                ? 'Changements demandés'
                : pr.reviewDecision === 'review_required'
                  ? 'Ton approbation est attendue'
                  : 'Pas encore demandée'}
          </dd>
        </div>
        <div>
          <dt className={styles.factTerm}>Auto-merge</dt>
          <dd className={styles.factValue}>
            {pr.autoMerge
              ? 'Armé : le merge part dès ton approbation'
              : 'Non (dépôt privé ou PR en brouillon)'}
          </dd>
        </div>
      </dl>
      <ul className={styles.checks} aria-label="Workflows de la PR">
        {CHECKS.map((check) => (
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
        {pr.reviewDecision === 'review_required'
          ? 'Approuver sur GitHub'
          : 'Ouvrir la PR sur GitHub'}
      </Button>
    </div>
  );
}
