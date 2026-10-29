import { Heading, SegmentedControl } from '@primer/react';
import { Table } from '@primer/react/experimental';
import { useState } from 'react';
import { useFactorySource, useUsage } from '../../data/FactoryProvider.tsx';
import type { UsagePeriod } from '../../data/source.ts';
import { BarList } from '../../ui/charts/BarList.tsx';
import { ColumnChart } from '../../ui/charts/ColumnChart.tsx';
import { formatCompact, formatDayMonth, formatInteger, formatUsd } from '../../ui/format.ts';
import { ModelBadge } from '../../ui/ModelBadge.tsx';
import page from '../../ui/page.module.css';

const PERIODS: { days: UsagePeriod; label: string }[] = [
  { days: 1, label: '24 h' },
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
];

export function CostsPage() {
  const source = useFactorySource();
  const [periodIndex, setPeriodIndex] = useState(1);
  const period = PERIODS[periodIndex] ?? { days: 7 as UsagePeriod, label: '7 jours' };
  const usage = useUsage(period.days);
  const totalTokens = usage.models.reduce(
    (sum, row) => sum + row.inputTokens + row.outputTokens,
    0,
  );
  const totalCalls = usage.models.reduce((sum, row) => sum + row.calls, 0);
  const totalRateLimited = usage.models.reduce((sum, row) => sum + row.rateLimited, 0);
  const totalCost = usage.models.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
  const daily = usage.daily.map((day) => ({
    key: day.day,
    label: formatDayMonth(`${day.day}T12:00:00Z`),
    value: day.tokens,
  }));
  const dailyLimited = usage.daily.map((day) => ({
    key: day.day,
    label: formatDayMonth(`${day.day}T12:00:00Z`),
    value: day.rateLimited,
  }));

  return (
    <section className={page.page} aria-labelledby="costs-title">
      <header className={page.head}>
        <div>
          <Heading as="h1" variant="medium" id="costs-title">
            Coûts et quotas
          </Heading>
          <p className={page.intro}>
            Jetons, appels et limites par modèle et par fournisseur, mesurés sur chaque appel des
            agents.
          </p>
          {source.kind === 'demo' ? (
            <p className={page.demoNote}>Chiffres d’exemple de la démo.</p>
          ) : null}
        </div>
        <SegmentedControl
          aria-label="Période"
          size="small"
          onChange={(index) => setPeriodIndex(index ?? 1)}
        >
          {PERIODS.map((entry, index) => (
            <SegmentedControl.Button key={entry.days} selected={index === periodIndex}>
              {entry.label}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
      </header>

      <dl className={page.figures}>
        <div className={page.figure}>
          <dt className={page.figureTerm}>Jetons</dt>
          <dd className={page.figureValue}>{formatCompact(totalTokens)}</dd>
        </div>
        <div className={page.figure}>
          <dt className={page.figureTerm}>Appels aux modèles</dt>
          <dd className={page.figureValue}>{formatInteger(totalCalls)}</dd>
        </div>
        <div className={page.figure}>
          <dt className={page.figureTerm}>Réponses 429</dt>
          <dd className={page.figureValue}>{formatInteger(totalRateLimited)}</dd>
        </div>
        <div className={page.figure}>
          <dt className={page.figureTerm}>Coût estimé (abonnement Claude)</dt>
          <dd className={page.figureValue}>{formatUsd(totalCost)}</dd>
        </div>
      </dl>

      {daily.length >= 3 ? (
        <div className={page.grid}>
          <div className={page.panel}>
            <ColumnChart
              title="Jetons par jour"
              data={daily}
              formatValue={(value) => `${formatCompact(value)} jetons`}
              formatTick={formatCompact}
            />
          </div>
          <div className={page.panel}>
            <ColumnChart
              title="Réponses 429 par jour"
              data={dailyLimited}
              formatValue={(value) => `${formatInteger(value)} réponses 429`}
              formatTick={(value) => formatInteger(Math.round(value))}
            />
          </div>
        </div>
      ) : null}

      <section className={page.section} aria-labelledby="models-title">
        <h2 id="models-title" className={page.sectionTitle}>
          Par modèle
        </h2>
        <div className={page.tableBox}>
          <Table
            gridTemplateColumns="minmax(12rem, 2fr) repeat(6, auto)"
            cellPadding="condensed"
            aria-labelledby="models-title"
          >
            <Table.Head>
              <Table.Row>
                <Table.Header>Modèle</Table.Header>
                <Table.Header align="end">Appels</Table.Header>
                <Table.Header align="end">Entrée</Table.Header>
                <Table.Header align="end">Sortie</Table.Header>
                <Table.Header align="end">429</Table.Header>
                <Table.Header align="end">Erreurs</Table.Header>
                <Table.Header align="end">Coût</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {usage.models.map((row) => (
                <Table.Row key={`${row.provider}-${row.model}`}>
                  <Table.Cell>
                    <ModelBadge model={row} overflow="clamp" />
                  </Table.Cell>
                  <Table.Cell align="end">{formatInteger(row.calls)}</Table.Cell>
                  <Table.Cell align="end">{formatCompact(row.inputTokens)}</Table.Cell>
                  <Table.Cell align="end">{formatCompact(row.outputTokens)}</Table.Cell>
                  <Table.Cell align="end">{formatInteger(row.rateLimited)}</Table.Cell>
                  <Table.Cell align="end">{formatInteger(row.errors)}</Table.Cell>
                  <Table.Cell align="end">
                    {row.costUsd !== null ? formatUsd(row.costUsd) : 'gratuit'}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
        <p className={page.muted}>{usage.claudeSubscriptionNote}</p>
      </section>

      <section className={page.section}>
        <div className={page.panel}>
          <BarList
            title="Jetons par agent"
            data={usage.byProfile.map((row) => ({
              key: row.profile,
              label: row.profile,
              value: row.tokens,
            }))}
            formatValue={formatCompact}
          />
        </div>
      </section>
    </section>
  );
}
