import { MODELS_KEY } from '@factory-live/contracts';
import { motion } from 'motion/react';
import { useI18n } from '../../../../i18n/I18nProvider.tsx';
import { ModelBadge } from '../../../../ui/ModelBadge.tsx';
import { MOVE_TRANSITION } from '../../../../ui/motion.tsx';
import type { Box } from '../layout.ts';
import type { ProviderRow } from '../model.ts';
import { PROVIDERS_ICON } from './icons.ts';
import styles from '../graph.module.css';

/**
 * The providers: the base under the stations where an agent calls a model, one row per model with
 * the stations and agents it serves, lit while it answers.
 */
export function ProvidersBlock({
  box,
  rows,
  label,
}: {
  box: Box;
  rows: readonly ProviderRow[];
  /** A station's name, from its key. */
  label: (key: string) => string;
}) {
  const { t } = useI18n();
  const ProvidersIcon = PROVIDERS_ICON;
  return (
    <motion.div
      className={styles.box}
      data-box={MODELS_KEY}
      initial={false}
      animate={{ top: box.y, height: box.h }}
      transition={MOVE_TRANSITION}
      style={{ left: box.x, width: box.w }}
    >
      <div className={styles.head} style={{ height: box.head }} title={t.line.graph.providersTitle}>
        <span className={styles.headLine}>
          <ProvidersIcon size={16} className={styles.headIcon} aria-hidden="true" />
          <span className={styles.headName}>{t.line.graph.providers}</span>
        </span>
        <span className={styles.headTypes}>{t.line.graph.providersHint}</span>
      </div>
      <ul className={styles.providers}>
        {rows.length === 0 ? (
          <li className={styles.empty}>{t.line.graph.empty}</li>
        ) : (
          rows.map((row) => (
            <li
              key={`${row.lane ? 'lane' : 'agent'}|${row.model.provider ?? ''}|${row.model.model}`}
              className={styles.provider}
              data-busy={row.busy ? '' : undefined}
            >
              <ModelBadge model={row.model} lane={row.lane} />
              <span className={styles.serves}>
                {t.line.graph.serves(row.stations.map(label).join(', '), row.agents.join(', '))}
              </span>
            </li>
          ))
        )}
      </ul>
    </motion.div>
  );
}
