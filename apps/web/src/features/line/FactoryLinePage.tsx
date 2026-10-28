import type { IssueSummary } from '@factory-live/contracts';
import { ArrowDownIcon, ArrowRightIcon, BellIcon, EyeIcon } from '@primer/octicons-react';
import { Banner, Button, Heading } from '@primer/react';
import { LayoutGroup } from 'motion/react';
import { Link, useNavigate } from 'react-router';
import { useSnapshot } from '../../data/FactoryProvider.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { useNow } from '../../ui/useNow.ts';
import { LINE_STATIONS, STATION_LABEL } from '../../ui/vocabulary.ts';
import { ActivityFeed } from './ActivityFeed.tsx';
import { StationColumn } from './StationColumn.tsx';
import styles from './line.module.css';

interface Move {
  from: number;
  to: number;
}

const TRANSIT_MS = 2600;

/** Liaisons franchies il y a moins de TRANSIT_MS : la source dit quand chaque issue a changé de station. */
function transits(issues: readonly IssueSummary[], now: number): Move[] {
  const moves: Move[] = [];
  for (const issue of issues) {
    if (!issue.previousStation || !issue.stationChangedAt) continue;
    if (now - Date.parse(issue.stationChangedAt) > TRANSIT_MS) continue;
    const from = LINE_STATIONS.indexOf(issue.previousStation);
    const to = LINE_STATIONS.indexOf(issue.station);
    if (from < 0 || to < 0) continue;
    moves.push({ from: Math.min(from, to), to: Math.max(from, to) });
  }
  return moves;
}

export function FactoryLinePage() {
  const snapshot = useSnapshot();
  const navigate = useNavigate();
  const now = useNow();
  const moves = transits(snapshot.issues, now);
  const pushable = snapshot.interventions.filter((intervention) => intervention.push);
  const lastEvent = snapshot.activity[0];
  const stations = snapshot.stations.filter((station) => LINE_STATIONS.includes(station.id));

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div className={styles.pageTitleBlock}>
          <Heading as="h1" variant="medium" className={styles.pageTitle}>
            Ligne d’usine
          </Heading>
          <p className={styles.pageSubtitle}>
            Board factory · {snapshot.issues.filter((issue) => issue.status !== 'done').length}{' '}
            issues ouvertes
            {lastEvent ? (
              <>
                {' '}
                · dernier événement <Elapsed since={lastEvent.at} mode="age" />
              </>
            ) : null}
          </p>
        </div>
      </header>

      {pushable.length > 0 ? (
        <Banner
          variant="critical"
          title={`${pushable.length} blocage${pushable.length > 1 ? 's' : ''} t’attend${pushable.length > 1 ? 'ent' : ''}`}
          description={pushable
            .map((intervention) => `${intervention.issueKey ?? 'carte'} : ${intervention.title}`)
            .join(' · ')}
          primaryAction={
            <Banner.PrimaryAction
              leadingVisual={BellIcon}
              onClick={() => void navigate('/interventions')}
            >
              Voir les interventions
            </Banner.PrimaryAction>
          }
        />
      ) : null}

      <div className={styles.lineContainer}>
        <LayoutGroup>
          <ol
            className={styles.line}
            aria-label="Stations de la ligne d’usine, de l’intake au merge"
          >
            {stations.map((station, index) => {
              const active = moves.some((move) => move.from <= index && move.to > index);
              return (
                <li key={station.id} className={styles.lineItem}>
                  <StationColumn
                    station={station}
                    agents={snapshot.agents.filter((agent) => agent.station === station.id)}
                    issues={snapshot.issues.filter((issue) => issue.station === station.id)}
                    maxInProgress={snapshot.factory.maxInProgress}
                  />
                  {index < stations.length - 1 ? (
                    <span
                      className={styles.connector}
                      data-active={active ? 'true' : undefined}
                      aria-hidden="true"
                      title={`Vers ${STATION_LABEL[stations[index + 1]?.id ?? 'done']}`}
                    >
                      <ArrowRightIcon className={styles.connectorRight} />
                      <ArrowDownIcon className={styles.connectorDown} />
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </LayoutGroup>
      </div>

      {snapshot.sideCards.length > 0 ? (
        <section className={styles.side} aria-labelledby="side-title">
          <h2 id="side-title" className={styles.sideTitle}>
            Hors ligne
          </h2>
          <ul className={styles.sideList}>
            {snapshot.sideCards.map((card) => (
              <li key={card.id} className={styles.sideItem}>
                <span className={styles.sideKind}>{card.kind}</span>
                <span className={styles.sideText}>{card.title}</span>
                <span className={styles.sideMeta}>
                  {card.status} · {card.assignee} · <Elapsed since={card.openedAt} mode="age" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className={styles.feedRow}>
        <ActivityFeed events={snapshot.activity} />
        <aside className={styles.legend} aria-label="Lire la ligne">
          <h2 className={styles.legendTitle}>Lire la ligne</h2>
          <ul className={styles.legendList}>
            <li>
              Chaque station montre qui travaille, avec le modèle réellement appelé au dernier
              appel.
            </li>
            <li>
              Une pastille qui pulse signale un travail en cours ; « lane » désigne le CLI délégué
              (Claude Code, OpenCode).
            </li>
            <li>
              Les issues avancent de gauche à droite ; la liaison franchie s’anime au passage.
            </li>
          </ul>
          <Button as={Link} to="/agents" leadingVisual={EyeIcon} size="small">
            Voir tous les profils
          </Button>
        </aside>
      </div>
    </div>
  );
}
