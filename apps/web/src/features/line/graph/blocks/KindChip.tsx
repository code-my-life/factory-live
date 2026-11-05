import type { StationKind } from '@factory-live/contracts';
import { useI18n } from '../../../../i18n/I18nProvider.tsx';
import { KIND_ICON } from './icons.ts';
import styles from '../graph.module.css';

/**
 * Who does the work at a station: an agent calling a model (it varies from run to run), a script,
 * GitHub, or the owner. The end of a workflow does no work: no chip.
 */
export function KindChip({ kind }: { kind: StationKind }) {
  const { t } = useI18n();
  if (kind === 'end') return null;
  const KindIcon = KIND_ICON[kind];
  return (
    <span className={styles.kind} data-kind={kind} title={t.line.graph.kindHint[kind]}>
      <KindIcon size={12} />
      {t.line.graph.kind[kind]}
    </span>
  );
}
