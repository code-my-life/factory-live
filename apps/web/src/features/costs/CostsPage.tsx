import { Heading, SegmentedControl } from '@primer/react';
import { useState } from 'react';
import { useFactorySource, useUsage } from '../../data/FactoryProvider.tsx';
import type { UsagePeriod } from '../../data/source.ts';
import { BarList } from '../../ui/charts/BarList.tsx';
import { ColumnChart } from '../../ui/charts/ColumnChart.tsx';
import { formatCompact, formatDayMonth, formatInteger, formatUsd } from '../../ui/format.ts';
import { providerLabel } from '../../ui/vocabulary.ts';
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
          <dt>Jetons</dt>
          <dd>{formatCompact(totalTokens)}</dd>
        </div>
        <div className={page.figure}>
          <dt>Appels aux modèles</dt>
          <dd>{formatInteger(totalCalls)}</dd>
        </div>
        <div className={page.figure}>
          <dt>Réponses 429</dt>
          <dd>{formatInteger(totalRateLimited)}</dd>
        </div>
        <div className={page.figure}>
          <dt>Coût estimé (abonnement Claude)</dt>
          <dd>{formatUsd(totalCost)}</dd>
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
          <table className={page.table}>
            <thead>
              <tr>
                <th scope="col">Modèle</th>
                <th scope="col">Fournisseur</th>
                <th scope="col" className={page.num}>
                  Appels
                </th>
                <th scope="col" className={page.num}>
                  Entrée
                </th>
                <th scope="col" className={page.num}>
                  Sortie
                </th>
                <th scope="col" className={page.num}>
                  429
                </th>
                <th scope="col" className={page.num}>
                  Erreurs
                </th>
                <th scope="col" className={page.num}>
                  Coût
                </th>
              </tr>
            </thead>
            <tbody>
              {usage.models.map((row) => (
                <tr key={`${row.provider}-${row.model}`}>
                  <td className="fl-mono" style={{ overflowWrap: 'anywhere' }}>
                    {row.model}
                  </td>
                  <td>{providerLabel(row.provider)}</td>
                  <td className={page.num}>{formatInteger(row.calls)}</td>
                  <td className={page.num}>{formatCompact(row.inputTokens)}</td>
                  <td className={page.num}>{formatCompact(row.outputTokens)}</td>
                  <td className={page.num}>{formatInteger(row.rateLimited)}</td>
                  <td className={page.num}>{formatInteger(row.errors)}</td>
                  <td className={page.num}>
                    {row.costUsd !== null ? formatUsd(row.costUsd) : 'gratuit'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={page.muted}>{usage.claudeSubscriptionNote}</p>
      </section>

      <section className={page.section}>
        <div className={page.panel}>
          <BarList
            title="Jetons par profil"
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
