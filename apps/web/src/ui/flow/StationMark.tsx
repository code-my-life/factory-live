import type { StationId } from '@factory-live/contracts';
import {
  BlockedIcon,
  CheckCircleIcon,
  CodeIcon,
  IssueOpenedIcon,
  RocketIcon,
  ShieldCheckIcon,
  WorkflowIcon,
} from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import styles from './flow.module.css';

/** L'icône de chaque station : la même sur l'arrêt de la ligne et sur sa marque ailleurs. */
export const STATION_ICON: Record<StationId, Icon> = {
  intake: IssueOpenedIcon,
  brief: WorkflowIcon,
  implementation: CodeIcon,
  gate: ShieldCheckIcon,
  release: RocketIcon,
  done: CheckCircleIcon,
  stopped: BlockedIcon,
  side: WorkflowIcon,
};

/**
 * Une station nommée hors de la ligne (liste d'issues, en-tête d'une issue, carte d'un agent) : son
 * arrêt rond en miniature, puis son nom. Le motif de la ligne, sans couleur : l'état se lit à côté.
 */
export function StationMark({ station, label }: { station: StationId; label?: string }) {
  const { t } = useI18n();
  const StationIcon = STATION_ICON[station];
  return (
    <span className={styles.mark}>
      <span className={styles.markStop} aria-hidden="true">
        <StationIcon size={12} />
      </span>
      {label ?? t.station[station]}
    </span>
  );
}
