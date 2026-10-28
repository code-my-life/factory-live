import { Heading, Label } from '@primer/react';
import { Link } from 'react-router';
import { useFactorySource, useHistory } from '../../data/FactoryProvider.tsx';
import { BarList } from '../../ui/charts/BarList.tsx';
import { formatDayMonth, formatMinutes, formatPercent } from '../../ui/format.ts';
import { issuePath } from '../issues/paths.ts';
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
          <dt>Issues terminées</dt>
          <dd>{history.issuesDone}</dd>
        </div>
        <div className={page.figure}>
          <dt>Délai médian, label → merge</dt>
          <dd>
            {history.medianLeadTimeMinutes !== null
              ? formatMinutes(history.medianLeadTimeMinutes)
              : '?'}
          </dd>
        </div>
        <div className={page.figure}>
          <dt>Blocages</dt>
          <dd>{history.blocks}</dd>
        </div>
        <div className={page.figure}>
          <dt>Ton temps de réponse médian</dt>
          <dd>
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
            <table className={page.table} style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th scope="col">Harnais</th>
                  <th scope="col">Modèle</th>
                  <th scope="col" className={page.num}>
                    Runs
                  </th>
                  <th scope="col" className={page.num}>
                    Taux
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.gatePassRate.map((row) => (
                  <tr key={`${row.harness}-${row.model}`}>
                    <td>{row.harness}</td>
                    <td className="fl-mono">{row.model}</td>
                    <td className={page.num}>{row.runs}</td>
                    <td className={page.num}>
                      {row.runs >= 3 ? formatPercent(row.rate) : 'trop peu'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className={page.section} aria-labelledby="recent-title">
        <h2 id="recent-title" className={page.sectionTitle}>
          Dernières issues terminées
        </h2>
        <div className={page.tableBox}>
          <table className={page.table}>
            <thead>
              <tr>
                <th scope="col">Issue</th>
                <th scope="col">Résultat</th>
                <th scope="col" className={page.num}>
                  Délai
                </th>
                <th scope="col">Version</th>
                <th scope="col">Terminée le</th>
              </tr>
            </thead>
            <tbody>
              {history.recent.map((row) => (
                <tr key={row.key}>
                  <td>
                    <Link to={issuePath(row.key)} className="fl-mono">
                      {row.key}
                    </Link>{' '}
                    {row.title}
                  </td>
                  <td>
                    <Label variant={OUTCOME[row.outcome].variant}>
                      {OUTCOME[row.outcome].label}
                    </Label>
                  </td>
                  <td className={page.num}>{formatMinutes(row.leadTimeMinutes)}</td>
                  <td className="fl-mono">{row.version ?? 'sans tag'}</td>
                  <td>{formatDayMonth(row.finishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
