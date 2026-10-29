import type { HistoryStats, ProfileView } from '@factory-live/contracts';
import { CircleSlashIcon, GitMergeIcon, SkipIcon } from '@primer/octicons-react';
import { Heading } from '@primer/react';
import { Table } from '@primer/react/experimental';
import { useFactorySource, useHistory, useProfiles } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { IssueBadge } from '../../ui/badge/IssueBadge.tsx';
import { modelEditor } from '../../ui/badge/marks.ts';
import { VersionBadge } from '../../ui/badge/VersionBadge.tsx';
import { BarList } from '../../ui/charts/BarList.tsx';
import { ModelBadge } from '../../ui/ModelBadge.tsx';
import type { ModelName } from '../../ui/ModelBadge.tsx';
import page from '../../ui/page.module.css';
import { WorkStateLabel } from '../../ui/work/workState.tsx';

type Recent = HistoryStats['recent'][number];
type GateRow = HistoryStats['gatePassRate'][number];

/** L'issue terminée, comme sur GitHub : fusionnée (violet), arrêtée ou fermée sans merge (gris). */
const OUTCOME = {
  merged: { tone: 'done', icon: GitMergeIcon, state: 'closed' },
  stopped: { tone: 'secondary', icon: SkipIcon, state: 'stopped' },
  closed: { tone: 'secondary', icon: CircleSlashIcon, state: 'closed' },
} as const satisfies Record<Recent['outcome'], unknown>;

/**
 * Le modèle d'une ligne de passage en gate : celui de la lane Claude quand le serveur le connaît, sinon
 * celui de l'agent, le premier de sa chaîne en service (« modèle de l'agent », `null` côté serveur).
 */
function gateModel(
  row: GateRow,
  profiles: readonly ProfileView[],
): { model: ModelName; lane: boolean } | null {
  if (row.model)
    return modelEditor(row.model)?.title === 'Claude'
      ? { model: { model: row.model, provider: 'anthropic' }, lane: true }
      : { model: { model: row.model }, lane: false };
  const own = profiles.find((profile) => profile.name === row.harness)?.modelChain[0];
  return own ? { model: own, lane: false } : null;
}

export function HistoryPage() {
  const { t, fmt } = useI18n();
  const source = useFactorySource();
  const history = useHistory();
  const profiles = useProfiles();
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
      </div>

      {/* Toute la largeur : un badge de modèle a besoin de place pour son fournisseur et son nom. */}
      <section className={page.section} aria-labelledby="gate-title">
        <h2 id="gate-title" className={page.sectionTitle}>
          {t.history.gateTitle}
        </h2>
        <div className={page.tableBox}>
          <Table
            gridTemplateColumns="auto minmax(12rem, 1fr) auto auto"
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
              {history.gatePassRate.map((row) => {
                const used = gateModel(row, profiles);
                return (
                  <Table.Row key={`${row.harness}-${row.model ?? ''}`}>
                    <Table.Cell>{row.harness}</Table.Cell>
                    <Table.Cell>
                      {used ? (
                        <ModelBadge model={used.model} lane={used.lane} overflow="clamp" />
                      ) : (
                        t.history.agentModel
                      )}
                    </Table.Cell>
                    <Table.Cell align="end">{row.runs}</Table.Cell>
                    <Table.Cell align="end">
                      {row.runs >= 3 ? fmt.percent(row.rate) : t.history.tooFew}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        </div>
      </section>

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
                  <Table.Cell className={page.badgeCell}>
                    <IssueBadge issueKey={row.key} state={OUTCOME[row.outcome].state} link />
                    <span className={page.cellText}>{row.title}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <WorkStateLabel
                      state={{
                        label: t.history.outcome[row.outcome],
                        tone: OUTCOME[row.outcome].tone,
                        icon: OUTCOME[row.outcome].icon,
                        working: false,
                      }}
                    />
                  </Table.Cell>
                  <Table.Cell align="end">{fmt.minutes(row.leadTimeMinutes)}</Table.Cell>
                  <Table.Cell>
                    {row.version ? <VersionBadge version={row.version} /> : t.history.noTag}
                  </Table.Cell>
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
