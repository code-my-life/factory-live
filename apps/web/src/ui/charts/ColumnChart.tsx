import { useId, useState } from 'react';
import styles from './charts.module.css';

export interface ColumnDatum {
  key: string;
  label: string;
  value: number;
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

/**
 * Colonnes d'une seule série (pas de légende : le titre la nomme). Chaque colonne est sa propre
 * cible de survol et de focus ; la plus haute porte son étiquette ; le tableau reste à un clic.
 */
export function ColumnChart({
  title,
  data,
  formatValue,
  formatTick,
}: {
  title: string;
  data: readonly ColumnDatum[];
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const max = niceMax(Math.max(...data.map((datum) => datum.value)));
  const peak = data.reduce(
    (best, datum, index) => (datum.value > (data[best]?.value ?? -1) ? index : best),
    0,
  );
  const ticks = [0, max / 2, max];
  const activeDatum = active === null ? null : data[active];

  return (
    <figure className={styles.figure} aria-labelledby={titleId}>
      <figcaption id={titleId} className={styles.caption}>
        {title}
      </figcaption>
      <div className={styles.plotArea}>
        <div className={styles.yAxis} aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className={styles.tick} style={{ bottom: `${(tick / max) * 100}%` }}>
              {formatTick(tick)}
            </span>
          ))}
        </div>
        <div
          className={styles.plot}
          role="group"
          aria-label={title}
          onPointerLeave={() => setActive(null)}
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className={styles.gridline}
              style={{ bottom: `${(tick / max) * 100}%` }}
              aria-hidden="true"
            />
          ))}
          <ol className={styles.columns}>
            {data.map((datum, index) => (
              <li key={datum.key} className={styles.column}>
                <button
                  type="button"
                  className={styles.columnHit}
                  aria-label={`${datum.label} : ${formatValue(datum.value)}`}
                  onPointerEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                >
                  <span
                    className={styles.columnBar}
                    data-active={active === index ? 'true' : undefined}
                    style={{ height: `${(datum.value / max) * 100}%` }}
                  >
                    {index === peak && data.length > 1 ? (
                      <span className={styles.peakLabel}>{formatValue(datum.value)}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {activeDatum && active !== null ? (
            <div
              className={styles.tooltip}
              style={{ left: `${((active + 0.5) / data.length) * 100}%` }}
              role="status"
            >
              <strong>{formatValue(activeDatum.value)}</strong>
              <span>{activeDatum.label}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.xAxis} aria-hidden="true">
        <span>{data[0]?.label}</span>
        {data.length > 2 ? <span>{data[Math.floor(data.length / 2)]?.label}</span> : null}
        <span>{data.at(-1)?.label}</span>
      </div>
      <details className={styles.tableToggle}>
        <summary>Voir le tableau</summary>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Jour</th>
              <th scope="col" className={styles.num}>
                Valeur
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.key}>
                <td>{datum.label}</td>
                <td className={styles.num}>{formatValue(datum.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
