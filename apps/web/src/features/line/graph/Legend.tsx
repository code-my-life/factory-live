import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { VECTORS } from './flow.tsx';
import { BRANCH_COLOR, LIVE_COLOR, markColor } from './palette.ts';
import styles from './graph.module.css';

/** Every kind of connector with its look, then what each animation means: no text sits on a connector. */
export function Legend() {
  const { t } = useI18n();
  return (
    <div className={styles.legendBar}>
      <ul className={styles.legend} aria-label={t.line.graph.legendLinks}>
        {VECTORS.map((vector) => (
          <li key={vector.id} className={styles.legendItem}>
            <svg width="34" height="10" aria-hidden="true">
              <path
                d="M6 5 H28"
                className={styles.legendLine}
                style={{ stroke: BRANCH_COLOR[vector.branch] }}
                strokeDasharray={'dash' in vector ? vector.dash : undefined}
              />
              <circle
                cx="5"
                cy="5"
                r="3"
                className={styles.port}
                style={{ stroke: BRANCH_COLOR[vector.branch] }}
                data-active=""
              />
              <circle
                cx="29"
                cy="5"
                r="3"
                className={styles.port}
                style={{ stroke: BRANCH_COLOR[vector.branch] }}
                data-active=""
              />
            </svg>
            {t.line.graph.vector[vector.id]}
          </li>
        ))}
      </ul>
      <ul className={styles.legend} aria-label={t.line.graph.legendMotion}>
        <li className={styles.legendItem}>
          <span className={styles.legendCard} aria-hidden="true" />
          {t.line.graph.motion.travel}
        </li>
        <li className={styles.legendItem}>
          <span
            className={styles.legendComet}
            style={{
              backgroundColor: BRANCH_COLOR.line,
              boxShadow: `0 0 6px ${BRANCH_COLOR.line}`,
            }}
            aria-hidden="true"
          />
          {t.line.graph.motion.comets}
        </li>
        <li className={styles.legendItem}>
          <span
            className={styles.legendPoint}
            style={{ backgroundColor: LIVE_COLOR, boxShadow: `0 0 6px ${LIVE_COLOR}` }}
            aria-hidden="true"
          />
          {t.line.graph.motion.points}
        </li>
        <li className={styles.legendItem}>
          <svg width="30" height="10" aria-hidden="true">
            <path
              d="M2 5 H28"
              className={styles.legendLine}
              style={{ stroke: BRANCH_COLOR.line }}
              data-idle=""
            />
          </svg>
          {t.line.graph.motion.idle}
        </li>
        <li className={styles.legendItem}>
          <svg width="30" height="10" aria-hidden="true">
            <path
              d="M2 5 H14"
              className={styles.legendLine}
              style={{ stroke: markColor('back', 'problem') }}
              strokeDasharray="7 5"
            />
            <path
              d="M16 5 H28"
              className={styles.legendLine}
              style={{ stroke: markColor('back', 'request') }}
              strokeDasharray="1 5"
            />
          </svg>
          {t.line.graph.motion.taken}
        </li>
      </ul>
    </div>
  );
}
