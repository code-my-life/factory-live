import type { CSSProperties } from 'react';
import styles from './charts.module.css';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
}

/** Barres horizontales d'une seule série, valeur à l'extrémité de chaque barre. */
export function BarList({
  title,
  data,
  formatValue,
}: {
  title: string;
  data: readonly BarDatum[];
  formatValue: (value: number) => string;
}) {
  const max = Math.max(1, ...data.map((datum) => datum.value));
  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>{title}</figcaption>
      <ul className={styles.barList}>
        {data.map((datum) => (
          <li
            key={datum.key}
            className={styles.barRow}
            title={`${datum.label} : ${formatValue(datum.value)}`}
            style={{ '--fl-pct': `${(datum.value / max) * 100}%` } as CSSProperties}
          >
            <span className={styles.barLabel}>{datum.label}</span>
            <span className={styles.barScale}>
              <span className={styles.barFill} />
              <span className={styles.barValue}>{formatValue(datum.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
