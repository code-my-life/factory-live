import {
  CheckCircleFillIcon,
  ClockFillIcon,
  DashIcon,
  EyeIcon,
  XCircleFillIcon,
} from '@primer/octicons-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import styles from './acceptance.module.css';
import type { Tally, WidgetStatus } from './status.ts';

const ICON = {
  ok: CheckCircleFillIcon,
  nok: XCircleFillIcon,
  pending: ClockFillIcon,
  info: EyeIcon,
  none: DashIcon,
} as const;

/**
 * The verdict as a picto, the only mark of it, one shape per meaning: a filled check, a filled
 * cross, a clock while it runs, an eye for what is to see, a dash for nothing at all. Its color never
 * speaks alone: the picto is named for screen readers.
 */
export function StatusIcon({
  status,
  size = 16,
  label,
}: {
  status: WidgetStatus;
  size?: number;
  /** The words read instead of the status's own; `null` when the text beside it already says it. */
  label?: string | null;
}) {
  const { t } = useI18n();
  const Icon = ICON[status];
  const name = label === undefined ? t.acceptance.status[status] : label;
  return name ? (
    <Icon size={size} aria-label={name} className={styles.statusIcon} data-status={status} />
  ) : (
    <Icon size={size} aria-hidden="true" className={styles.statusIcon} data-status={status} />
  );
}

/**
 * A widget's share of NOK, running, to see and OK, as a thin bar under its title: what « 14 sur 15 »
 * looks like at a glance, folded or not. Nothing to count, no bar.
 */
export function TallyBar({ tally }: { tally: Tally }) {
  const { t } = useI18n();
  const total = tally.ok + tally.nok + tally.pending + tally.info;
  if (total === 0) return null;
  const parts = (['nok', 'pending', 'info', 'ok'] as const).filter((part) => tally[part] > 0);
  return (
    <span
      role="img"
      aria-label={t.acceptance.tallyOf(tally.ok, tally.nok, tally.pending, tally.info, total)}
      className={styles.tallyBar}
    >
      {parts.map((part) => (
        <span
          key={part}
          className={styles.tallyPart}
          data-status={part}
          style={{ flexGrow: tally[part] }}
        />
      ))}
    </span>
  );
}
