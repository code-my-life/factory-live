import { LinkExternalIcon } from '@primer/octicons-react';
import { Heading, Link } from '@primer/react';
import { Table } from '@primer/react/experimental';
import { StatusIcon } from '../acceptance/StatusMark.tsx';
import type { WidgetStatus } from '../acceptance/status.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { DeclaredData as Data, DeclaredValue } from './model.ts';
import styles from './workflows.module.css';

/** A declared status, by the recette's picto: one shape per meaning, never colour alone. */
const STATUS: Record<Extract<DeclaredValue, { type: 'status' }>['status'], WidgetStatus> = {
  ok: 'ok',
  running: 'pending',
  warning: 'info',
  error: 'nok',
  unknown: 'none',
};

/** One value of a declared data, by its generic type: nothing here knows the workflow. */
function Value({ value }: { value: DeclaredValue }) {
  const { t } = useI18n();
  switch (value.type) {
    case 'text':
      return (
        <div className={styles.value}>
          <p className={styles.valueLabel}>{value.label}</p>
          <pre className={styles.text}>{value.text}</pre>
        </div>
      );
    case 'link':
      return (
        <p className={styles.value}>
          <Link href={value.url} target="_blank" rel="noreferrer" inline className={styles.link}>
            {value.label}
            <LinkExternalIcon size={12} aria-hidden="true" />
          </Link>
        </p>
      );
    case 'status':
      return (
        <p className={`${styles.value} ${styles.status}`}>
          <StatusIcon status={STATUS[value.status]} label={null} />
          <span className={styles.valueLabel}>{value.label}</span>
          <span className={styles.statusText}>{value.text}</span>
          <span className="fl-visually-hidden">{t.workflows.status[value.status]}</span>
        </p>
      );
    case 'table':
      return (
        <div className={styles.value}>
          <div className={styles.tableBox}>
            <Table
              gridTemplateColumns={`repeat(${value.columns.length}, minmax(max-content, 1fr))`}
              cellPadding="condensed"
              aria-label={value.label}
            >
              <Table.Head>
                <Table.Row>
                  {value.columns.map((column) => (
                    <Table.Header key={column}>{column}</Table.Header>
                  ))}
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {value.rows.map((row, index) => (
                  <Table.Row key={index}>
                    {row.map((cell, column) => (
                      <Table.Cell
                        key={column}
                        align={typeof cell === 'number' ? 'end' : 'start'}
                        className={typeof cell === 'number' ? 'fl-tabular' : undefined}
                      >
                        {cell === null
                          ? ''
                          : typeof cell === 'boolean'
                            ? cell
                              ? t.workflows.yes
                              : t.workflows.no
                            : String(cell)}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </div>
      );
  }
}

/** The data a workflow declares for an item, each under its label, in the order the core gives. */
export function DeclaredDataList({
  data,
  idPrefix = 'data',
}: {
  data: readonly Data[];
  /** Keeps the headings' ids apart when two lists share a page. */
  idPrefix?: string;
}) {
  const { t } = useI18n();
  if (data.length === 0) return <p className={styles.quiet}>{t.workflows.noData}</p>;
  return (
    <div className={styles.dataList}>
      {data.map((each) => (
        <section
          key={each.name}
          className={styles.data}
          aria-labelledby={`${idPrefix}-${each.name}`}
        >
          <Heading
            as="h4"
            variant="small"
            id={`${idPrefix}-${each.name}`}
            className={styles.dataTitle}
          >
            {each.label}
          </Heading>
          {each.values.length === 0 ? (
            <p className={styles.quiet}>{t.workflows.noValue}</p>
          ) : (
            each.values.map((value, index) => <Value key={index} value={value} />)
          )}
        </section>
      ))}
    </div>
  );
}
