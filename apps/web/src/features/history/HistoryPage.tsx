import { Heading, Label } from '@primer/react';
import { Table } from '@primer/react/experimental';
import { Link } from 'react-router';
import { useFactorySource, useHistory } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { BarList } from '../../ui/charts/BarList.tsx';
import { issuePath } from '../../ui/paths.ts';
import page from '../../ui/page.module.css';

const OUTCOME_VARIANT = { merged: 'done', stopped: 'secondary', closed: 'secondary' } as const;

export function HistoryPage() {
  const { t, fmt } = useI18n();
  const source = useFactorySource();
  const history = useHistory();
  return (
    <section className={page.page} aria-labelledby="history-title">
      <header className={page.head}>
        <div>
          <Heading as="h1" variant="medium" id="history-title">
            {t.history.title}
          </Heading>
          <p className={page.intro}>{t.history.intro(history.periodDays)}</p>
          {source.kind === 'demo' ? <p className={page.demoNote}>{t.costs.demoNote}</p> : null}
        </div>
      </header>

      <dl className={page.figures}>
        <div className={page.figure}>
          <dt className={page.figureTerm}>{t.history.issuesDone}</dt>
          <dd className={page.figureValue}>{history.issuesDone}</dd>
        </div>
        <div className={page.figure}>
          <dt className={page.figureTerm}>{t.history.leadTime}</dt>
          <dd className={page.figureValue}>
            {history.medianLeadTimeMinutes !== null
              ? fmt.minutes(history.medianLeadTimeMinutes)
              : t.common.unknown}
          </dd>
        </div>
        <div className={page.figure}>
          <dt className={page.figureTerm}>{t.history.blocks}</dt>
          <dd className={page.figureValue}>{history.blocks}</dd>
        </div>
        <div className={page.figure}>
          <dt className={page.figureTerm}>{t.history.responseTime}</dt>
          <dd className={page.figureValue}>
            {history.medianHumanResponseMinutes !== null
              ? fmt.minutes(history.medianHumanResponseMinutes)
              : t.common.unknown}
          </dd>
        </div>
      </dl>

      <div className={page.grid}>
        <div className={page.panel}>
          <BarList
            title={t.history.stationTime}
            data={history.stationMinutes.map((row) => ({
              key: row.station,
              label: t.station[row.station],
              value: row.medianMinutes,
            }))}
            formatValue={fmt.minutes}
          />
        </div>
        <section className={page.section} aria-labelledby="gate-title">
          <h2 id="gate-title" className={page.sectionTitle}>
            {t.history.gateTitle}
          </h2>
          <div className={page.tableBox}>
            <Table
              gridTemplateColumns="auto minmax(0, 1fr) auto auto"
              cellPadding="condensed"
              aria-labelledby="gate-title"
            >
              <Table.Head>
                <Table.Row>
                  <Table.Header>{t.history.gate.harness}</Table.Header>
                  <Table.Header>{t.history.gate.model}</Table.Header>
                  <Table.Header align="end">{t.history.gate.runs}</Table.Header>
                  <Table.Header align="end">{t.history.gate.rate}</Table.Header>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {history.gatePassRate.map((row) => (
                  <Table.Row key={`${row.harness}-${row.model ?? ''}`}>
                    <Table.Cell>{row.harness}</Table.Cell>
                    <Table.Cell className={row.model ? 'fl-mono' : undefined}>
                      {row.model ?? t.history.agentModel}
                    </Table.Cell>
                    <Table.Cell align="end">{row.runs}</Table.Cell>
                    <Table.Cell align="end">
                      {row.runs >= 3 ? fmt.percent(row.rate) : t.history.tooFew}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </section>
      </div>

      <section className={page.section} aria-labelledby="recent-title">
        <h2 id="recent-title" className={page.sectionTitle}>
          {t.history.recentTitle}
        </h2>
        <div className={page.tableBox}>
          <Table
            gridTemplateColumns="minmax(16rem, 2fr) repeat(4, auto)"
            cellPadding="condensed"
            aria-labelledby="recent-title"
          >
            <Table.Head>
              <Table.Row>
                <Table.Header>{t.history.recent.issue}</Table.Header>
                <Table.Header>{t.history.recent.outcome}</Table.Header>
                <Table.Header align="end">{t.history.recent.leadTime}</Table.Header>
                <Table.Header>{t.history.recent.version}</Table.Header>
                <Table.Header>{t.history.recent.finishedAt}</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {history.recent.map((row) => (
                <Table.Row key={row.key}>
                  <Table.Cell>
                    <Link to={issuePath(row.key)} className="fl-mono">
                      {row.key}
                    </Link>{' '}
                    {row.title}
                  </Table.Cell>
                  <Table.Cell>
                    <Label variant={OUTCOME_VARIANT[row.outcome]}>
                      {t.history.outcome[row.outcome]}
                    </Label>
                  </Table.Cell>
                  <Table.Cell align="end">{fmt.minutes(row.leadTimeMinutes)}</Table.Cell>
                  <Table.Cell className="fl-mono">{row.version ?? t.history.noTag}</Table.Cell>
                  <Table.Cell>{fmt.dayMonth(row.finishedAt)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </section>
    </section>
  );
}
