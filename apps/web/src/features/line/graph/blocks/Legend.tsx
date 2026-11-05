import { useI18n } from '../../../../i18n/I18nProvider.tsx';
import type { LegendEntry } from '../layout.ts';
import { BACK, LIVE_COLOR } from '../palette.ts';
import type { Palette } from '../palette.ts';
import styles from '../graph.module.css';

/**
 * One entry per kind of link of the sheet, with its look, then what each animation means: no text
 * sits on a connector.
 */
export function Legend({
  entries,
  palette,
  label,
}: {
  entries: readonly LegendEntry[];
  palette: Palette;
  /** An entry's name. */
  label: (entry: LegendEntry) => string;
}) {
  const { t } = useI18n();
  const line = palette.color('line');
  return (
    <div className={styles.legendBar}>
      <ul className={styles.legend} aria-label={t.line.graph.legendLinks}>
        {entries.map((entry) => (
          <li key={entry.key} className={styles.legendItem}>
            <svg width="34" height="10" aria-hidden="true">
              <path
                d="M6 5 H28"
                className={styles.legendLine}
                style={{ stroke: palette.color(entry.branch) }}
                strokeDasharray={entry.dash}
              />
              <circle
                cx="5"
                cy="5"
                r="3"
                className={styles.port}
                style={{ stroke: palette.color(entry.branch) }}
                data-active=""
              />
              <circle
                cx="29"
                cy="5"
                r="3"
                className={styles.port}
                style={{ stroke: palette.color(entry.branch) }}
                data-active=""
              />
            </svg>
            {label(entry)}
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
            style={{ backgroundColor: line, boxShadow: `0 0 6px ${line}` }}
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
              style={{ stroke: line }}
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
              style={{ stroke: palette.mark(BACK, 'problem') }}
              strokeDasharray="7 5"
            />
            <path
              d="M16 5 H28"
              className={styles.legendLine}
              style={{ stroke: palette.mark(BACK, 'request') }}
              strokeDasharray="1 5"
            />
          </svg>
          {t.line.graph.motion.taken}
        </li>
      </ul>
    </div>
  );
}
