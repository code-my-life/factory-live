import { useId, useState } from 'react';
import { Table } from '@primer/react/experimental';
import { useI18n } from '../../i18n/I18nProvider.tsx';
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
  const { t } = useI18n();
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
                  aria-label={t.common.labelValue(datum.label, formatValue(datum.value))}
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
              <strong className={styles.tooltipValue}>{formatValue(activeDatum.value)}</strong>
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
        <summary className={styles.tableSummary}>{t.charts.showTable}</summary>
        <Table
          gridTemplateColumns="auto auto"
          cellPadding="condensed"
          aria-label={t.charts.asTable(title)}
        >
          <Table.Head>
            <Table.Row>
              <Table.Header>{t.charts.day}</Table.Header>
              <Table.Header align="end">{t.charts.value}</Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {data.map((datum) => (
              <Table.Row key={datum.key}>
                <Table.Cell>{datum.label}</Table.Cell>
                <Table.Cell align="end">{formatValue(datum.value)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </details>
    </figure>
  );
}
