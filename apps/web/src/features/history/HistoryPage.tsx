import { Heading, Label } from '@primer/react';
import { Table } from '@primer/react/experimental';
import { useFactorySource, useHistory } from '../../data/FactoryProvider.tsx';
import { IssueBadge } from '../../ui/badge/IssueBadge.tsx';
import { VersionBadge } from '../../ui/badge/VersionBadge.tsx';
import { BarList } from '../../ui/charts/BarList.tsx';
import { formatDayMonth, formatMinutes, formatPercent } from '../../ui/format.ts';
import { ModelBadge } from '../../ui/ModelBadge.tsx';
import page from '../../ui/page.module.css';

const OUTCOME = {
  merged: { label: 'Fusionnée', variant: 'done' },
  stopped: { label: 'Arrêtée', variant: 'secondary' },
  closed: { label: 'Fermée', variant: 'secondary' },
} as const;

export function HistoryPage() {
  const source = useFactorySource();
  const history = useHistory();
  return (
    <section className={page.page} aria-labelledby="history-title">
      <header className={page.head}>
        <div>
          <Heading as="h1" variant="medium" id="history-title">
            Historique et stats
          </Heading>
          <p className={page.intro}>
            Les {history.periodDays} derniers jours. factory-live garde ce qu’Hermès purge après 30
            jours.
          </p>
          {source.kind === 'demo' ? (
            <p className={page.demoNote}>Chiffres d’exemple de la démo.</p>
          ) : null}
        </div>
      </header>

      <dl className={page.figures}>
        <div className={page.figure}>
          <dt className={page.figureTerm}>Issues terminées</dt>
          <dd className={page.figureValue}>{history.issuesDone}</dd>
        </div>
        <div className={page.figure}>
          <dt className={page.figureTerm}>Délai médian, label → merge</dt>
          <dd className={page.figureValue}>
            {history.medianLeadTimeMinutes !== null
              ? formatMinutes(history.medianLeadTimeMinutes)
              : '?'}
          </dd>
        </div>
        <div className={page.figure}>
          <dt className={page.figureTerm}>Blocages</dt>
          <dd className={page.figureValue}>{history.blocks}</dd>
        </div>
        <div className={page.figure}>
          <dt className={page.figureTerm}>Ton temps de réponse médian</dt>
          <dd className={page.figureValue}>
            {history.medianHumanResponseMinutes !== null
              ? formatMinutes(history.medianHumanResponseMinutes)
              : '?'}
          </dd>
        </div>
      </dl>

      <div className={page.grid}>
        <div className={page.panel}>
          <BarList
            title="Temps médian par station"
            data={history.stationMinutes.map((row) => ({
              key: row.station,
              label: row.station,
              value: row.medianMinutes,
            }))}
            formatValue={formatMinutes}
          />
        </div>
        <section className={page.section} aria-labelledby="gate-title">
          <h2 id="gate-title" className={page.sectionTitle}>
            Passage en gate du premier coup
          </h2>
          <div className={page.tableBox}>
            <Table
              gridTemplateColumns="auto minmax(0, 1fr) auto auto"
              cellPadding="condensed"
              aria-labelledby="gate-title"
            >
              <Table.Head>
                <Table.Row>
                  <Table.Header>Harnais</Table.Header>
                  <Table.Header>Modèle</Table.Header>
                  <Table.Header align="end">Runs</Table.Header>
                  <Table.Header align="end">Taux</Table.Header>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                {history.gatePassRate.map((row) => (
                  <Table.Row key={`${row.harness}-${row.model}`}>
                    <Table.Cell>{row.harness}</Table.Cell>
                    <Table.Cell>
                      <ModelBadge model={row} overflow="clamp" />
                    </Table.Cell>
                    <Table.Cell align="end">{row.runs}</Table.Cell>
                    <Table.Cell align="end">
                      {row.runs >= 3 ? formatPercent(row.rate) : 'trop peu'}
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
          Dernières issues terminées
        </h2>
        <div className={page.tableBox}>
          <Table
            gridTemplateColumns="minmax(16rem, 2fr) repeat(4, auto)"
            cellPadding="condensed"
            aria-labelledby="recent-title"
          >
            <Table.Head>
              <Table.Row>
                <Table.Header>Issue</Table.Header>
                <Table.Header>Résultat</Table.Header>
                <Table.Header align="end">Délai</Table.Header>
                <Table.Header>Version</Table.Header>
                <Table.Header>Terminée le</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {history.recent.map((row) => (
                <Table.Row key={row.key}>
                  <Table.Cell className={page.badgeCell}>
                    <IssueBadge issueKey={row.key} link />
                    <span className={page.cellText}>{row.title}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <Label variant={OUTCOME[row.outcome].variant}>
                      {OUTCOME[row.outcome].label}
                    </Label>
                  </Table.Cell>
                  <Table.Cell align="end">{formatMinutes(row.leadTimeMinutes)}</Table.Cell>
                  <Table.Cell>
                    {row.version ? <VersionBadge version={row.version} /> : 'sans tag'}
                  </Table.Cell>
                  <Table.Cell>{formatDayMonth(row.finishedAt)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </section>
    </section>
  );
}
