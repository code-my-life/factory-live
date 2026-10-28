import type { IssueSummary } from '@factory-live/contracts';
import {
  BellIcon,
  BlockedIcon,
  CheckCircleIcon,
  ClockIcon,
  DotFillIcon,
} from '@primer/octicons-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { ISSUE_STATUS_LABEL } from '../../ui/vocabulary.ts';
import { issuePath } from '../issues/paths.ts';
import styles from './line.module.css';

const STATUS_ICON = {
  active: DotFillIcon,
  queued: ClockIcon,
  waiting_human: BellIcon,
  blocked: BlockedIcon,
  done: CheckCircleIcon,
  stopped: BlockedIcon,
} as const;

/** Une issue sur la ligne. `layoutId` la fait glisser d'une station à l'autre quand elle avance. */
export function IssueToken({ issue }: { issue: IssueSummary }) {
  const StatusIcon = STATUS_ICON[issue.status];
  return (
    <motion.li
      layout="position"
      layoutId={`issue-${issue.key}`}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className={styles.tokenItem}
    >
      <Link to={issuePath(issue.key)} className={styles.token} data-status={issue.status}>
        <StatusIcon size={14} aria-hidden="true" className={styles.tokenIcon} />
        <span className={styles.tokenText}>
          <span className={styles.tokenKey}>{issue.key}</span>
          <span className={styles.tokenTitle}>{issue.title}</span>
        </span>
        {issue.status !== 'active' ? (
          <span className={styles.tokenStatus}>{ISSUE_STATUS_LABEL[issue.status]}</span>
        ) : null}
      </Link>
    </motion.li>
  );
}
