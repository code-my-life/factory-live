import { Heading, SegmentedControl } from '@primer/react';
import { Table } from '@primer/react/experimental';
import { useState } from 'react';
import { useFactorySource, useUsage } from '../../data/FactoryProvider.tsx';
import type { UsagePeriod } from '../../data/source.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { BarList } from '../../ui/charts/BarList.tsx';
import { ColumnChart } from '../../ui/charts/ColumnChart.tsx';
import { providerLabel } from '../../ui/vocabulary.ts';
import page from '../../ui/page.module.css';

const PERIODS: readonly UsagePeriod[] = [1, 7, 30];

export function CostsPage() {
  const { t, fmt, text } = useI18n();
  const source = useFactorySource();
  const [periodIndex, setPeriodIndex] = useState(1);
  const period = PERIODS[periodIndex] ?? 7;
  const usage = useUsage(period);
  const totalTokens = usage.models.reduce(
    (sum, row) => sum + row.inputTokens + row.outputTokens,
    0,
  );
  const totalCalls = usage.models.reduce((sum, row) => sum + row.calls, 0);
  const totalRateLimited = usage.models.reduce((sum, row) => sum + row.rateLimited, 0);
  const totalCost = usage.models.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
  const daily = usage.daily.map((day) => ({
    key: day.day,
    label: fmt.dayMonth(`${day.day}T12:00:00Z`),
    value: day.tokens,
  }));
  const dailyLimited = usage.daily.map((day) => ({
    key: day.day,
    label: fmt.dayMonth(`${day.day}T12:00:00Z`),
    value: day.rateLimited,
  }));

  return (
    <section className={page.page} aria-labelledby="costs-title">
      <header className={page.head}>
        <div>
          <Heading as="h1" variant="medium" id="costs-title">
            {t.costs.title}
          </Heading>
          <p className={page.intro}>{t.costs.intro}</p>
          {source.kind === 'demo' ? <p className={page.demoNote}>{t.costs.demoNote}</p> : null}
        </div>
        <SegmentedControl
          aria-label={t.costs.period}
          size="small"
          onChange={(index) => setPeriodIndex(index ?? 1)}
        >
          {PERIODS.map((entry, index) => (
            <SegmentedControl.Button key={entry} selected={index === periodIndex}>
              {t.costs.periods[entry]}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
      </header>

      <dl className={page.figures}>
        <div className={page.figure}>
          <dt className={page.figureTerm}>{t.costs.tokens}</dt>
          <dd className={page.figureValue}>{fmt.compact(totalTokens)}</dd>
        </div>
        <div className={page.figure}>
          <dt className={page.figureTerm}>{t.costs.calls}</dt>
          <dd className={page.figureValue}>{fmt.integer(totalCalls)}</dd>
        </div>
        <div className={page.figure}>
          <dt className={page.figureTerm}>{t.costs.rateLimited}</dt>
          <dd className={page.figureValue}>{fmt.integer(totalRateLimited)}</dd>
        </div>
        <div className={page.figure}>
          <dt className={page.figureTerm}>{t.costs.cost}</dt>
          <dd className={page.figureValue}>{fmt.usd(totalCost)}</dd>
        </div>
      </dl>

      {daily.length >= 3 ? (
        <div className={page.grid}>
          <div className={page.panel}>
            <ColumnChart
              title={t.costs.tokensPerDay}
              data={daily}
              formatValue={(value) => t.costs.tokensValue(fmt.compact(value))}
              formatTick={fmt.compact}
            />
          </div>
          <div className={page.panel}>
            <ColumnChart
              title={t.costs.rateLimitedPerDay}
              data={dailyLimited}
              formatValue={(value) => t.costs.rateLimitedValue(value, fmt.integer(value))}
              formatTick={(value) => fmt.integer(Math.round(value))}
            />
          </div>
        </div>
      ) : null}

      <section className={page.section} aria-labelledby="models-title">
        <h2 id="models-title" className={page.sectionTitle}>
          {t.costs.byModel}
        </h2>
        <div className={page.tableBox}>
          <Table
            gridTemplateColumns="minmax(0, 2fr) repeat(7, auto)"
            cellPadding="condensed"
            aria-labelledby="models-title"
          >
            <Table.Head>
              <Table.Row>
                <Table.Header>{t.costs.columns.model}</Table.Header>
                <Table.Header>{t.costs.columns.provider}</Table.Header>
                <Table.Header align="end">{t.costs.columns.calls}</Table.Header>
                <Table.Header align="end">{t.costs.columns.input}</Table.Header>
                <Table.Header align="end">{t.costs.columns.output}</Table.Header>
                <Table.Header align="end">{t.costs.columns.rateLimited}</Table.Header>
                <Table.Header align="end">{t.costs.columns.errors}</Table.Header>
                <Table.Header align="end">{t.costs.columns.cost}</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {usage.models.map((row) => (
                <Table.Row key={`${row.provider}-${row.model}`}>
                  <Table.Cell className="fl-mono" style={{ overflowWrap: 'anywhere' }}>
                    {row.model}
                  </Table.Cell>
                  <Table.Cell>{providerLabel(row.provider)}</Table.Cell>
                  <Table.Cell align="end">{fmt.integer(row.calls)}</Table.Cell>
                  <Table.Cell align="end">{fmt.compact(row.inputTokens)}</Table.Cell>
                  <Table.Cell align="end">{fmt.compact(row.outputTokens)}</Table.Cell>
                  <Table.Cell align="end">{fmt.integer(row.rateLimited)}</Table.Cell>
                  <Table.Cell align="end">{fmt.integer(row.errors)}</Table.Cell>
                  <Table.Cell align="end">
                    {row.costUsd !== null ? fmt.usd(row.costUsd) : t.common.free}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
        <p className={page.muted}>{text(usage.claudeSubscriptionNote)}</p>
      </section>

      <section className={page.section}>
        <div className={page.panel}>
          <BarList
            title={t.costs.byAgent}
            data={usage.byProfile.map((row) => ({
              key: row.profile,
              label: row.profile,
              value: row.tokens,
            }))}
            formatValue={fmt.compact}
          />
        </div>
      </section>
    </section>
  );
}
