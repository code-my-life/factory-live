import type { IssueSummary, StationId } from '@factory-live/contracts';
import { BellIcon, PeopleIcon } from '@primer/octicons-react';
import { Banner, Button, Heading, VisuallyHidden } from '@primer/react';
import { LayoutGroup } from 'motion/react';
import { Link, useNavigate } from 'react-router';
import { useSnapshot } from '../../data/FactoryProvider.tsx';
import { AgentAvatar } from '../../ui/agents/AgentAvatar.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { FlowLine } from '../../ui/flow/FlowLine.tsx';
import type { LineStep } from '../../ui/flow/FlowLine.tsx';
import { MotionToggle } from '../../ui/motion.tsx';
import { useNow } from '../../ui/useNow.ts';
import { LINE_STATIONS, STATION_LABEL } from '../../ui/vocabulary.ts';
import { JobList } from '../../ui/work/JobBox.tsx';
import { WorkStateLabel, cardWorkState } from '../../ui/work/workState.tsx';
import { IssueJob } from './IssueJob.tsx';
import { LiveActivity } from './LiveActivity.tsx';
import { LiveAgents } from './LiveAgents.tsx';
import { STATION_ICON, StationCounter, StationCrew, stationTone } from './stations.tsx';
import styles from './line.module.css';

/** Une issue qui vient de changer de station : le compteur de la station d'arrivée bat une fois. */
const ARRIVAL_WINDOW_MS = 1_500;
const WORKING = new Set(['thinking', 'tool', 'cli']);
/** Stations de bord : leurs issues se résument en tête et titre. */
const COMPACT = new Set<StationId>(['intake', 'done']);
/** Issues les plus urgentes d'abord : ce qui t'attend, ce qui bloque, puis ce qui avance. */
const ISSUE_ORDER: Record<IssueSummary['status'], number> = {
  waiting_human: 0,
  blocked: 1,
  active: 2,
  queued: 3,
  done: 4,
  stopped: 5,
};

function recentlyMoved(issue: IssueSummary, now: number): boolean {
  return Boolean(
    issue.previousStation &&
    issue.stationChangedAt &&
    now - Date.parse(issue.stationChangedAt) < ARRIVAL_WINDOW_MS,
  );
}

export function FactoryLinePage() {
  const snapshot = useSnapshot();
  const navigate = useNavigate();
  const now = useNow();
  const stations = LINE_STATIONS.flatMap((id) =>
    snapshot.stations.filter((station) => station.id === id),
  );
  const issuesAt = (id: StationId) => snapshot.issues.filter((issue) => issue.station === id);
  const agentsAt = (id: StationId) => snapshot.agents.filter((agent) => agent.station === id);
  const arrivedAt = (id: StationId) => issuesAt(id).some((issue) => recentlyMoved(issue, now));

  const steps: LineStep[] = stations.map((station, index) => {
    const agents = agentsAt(station.id);
    const issues = issuesAt(station.id).sort(
      (left, right) =>
        ISSUE_ORDER[left.status] - ISSUE_ORDER[right.status] ||
        right.updatedAt.localeCompare(left.updatedAt),
    );
    const following = stations[index + 1];
    const compact = COMPACT.has(station.id);
    const label = STATION_LABEL[station.id];
    return {
      id: station.id,
      icon: STATION_ICON[station.id],
      tone: stationTone(station.id, agents, issues),
      compact,
      aside: <StationCounter count={issues.length} arrived={arrivedAt(station.id)} />,
      title: (
        <>
          {label}
          <VisuallyHidden>
            {' '}
            : {issues.length} issue{issues.length > 1 ? 's' : ''}
          </VisuallyHidden>
        </>
      ),
      meta: <StationCrew station={station} agents={agents} />,
      flowing: following ? agentsAt(following.id).some((agent) => WORKING.has(agent.state)) : false,
      children:
        issues.length > 0 ? (
          <JobList label={`Issues à l’étape ${label}`}>
            {issues.map((issue) => (
              <IssueJob
                key={issue.key}
                issue={issue}
                agent={
                  snapshot.agents.find(
                    (agent) => agent.issueKey === issue.key && agent.state !== 'idle',
                  ) ?? null
                }
                intervention={
                  snapshot.interventions.find((intervention) =>
                    issue.interventionIds.includes(intervention.id),
                  ) ?? null
                }
                maxInProgress={snapshot.factory.maxInProgress}
                compact={compact}
                now={now}
              />
            ))}
          </JobList>
        ) : null,
    };
  });

  const pushable = snapshot.interventions.filter((intervention) => intervention.push);
  const lastEvent = [...snapshot.activity].sort((left, right) =>
    right.at.localeCompare(left.at),
  )[0];
  const open = snapshot.issues.filter(
    (issue) => issue.status !== 'done' && issue.status !== 'stopped',
  ).length;

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div className={styles.pageTitleBlock}>
          <Heading as="h1" variant="medium">
            Ligne d’usine
          </Heading>
          <p className={styles.pageSubtitle}>
            {open} issue{open > 1 ? 's' : ''} en cours
            {lastEvent ? (
              <>
                {' · '}dernier événement <Elapsed since={lastEvent.at} mode="age" />
              </>
            ) : null}
          </p>
        </div>
        <div className={styles.pageTools}>
          <MotionToggle />
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

      <LayoutGroup>
        <FlowLine
          steps={steps}
          label="Ligne d’usine : les étapes d’une issue, de l’intake au merge"
        />
      </LayoutGroup>

      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="live-title">
          <header className={styles.panelHead}>
            <h2 id="live-title" className={styles.panelTitle}>
              En ce moment
            </h2>
            <Button
              as={Link}
              to="/agents"
              size="small"
              variant="invisible"
              leadingVisual={PeopleIcon}
            >
              Tous les agents
            </Button>
          </header>
          <LiveAgents agents={snapshot.agents} maxInProgress={snapshot.factory.maxInProgress} />
        </section>
        <LiveActivity events={snapshot.activity} />
      </div>

      {snapshot.sideCards.length > 0 ? (
        <section className={styles.panel} aria-labelledby="side-title">
          <header className={styles.panelHead}>
            <h2 id="side-title" className={styles.panelTitle}>
              {STATION_LABEL.side}
            </h2>
          </header>
          <ul className={styles.sideList}>
            {snapshot.sideCards.map((card) => (
              <li key={card.id} className={styles.sideItem}>
                <AgentAvatar profile={card.assignee} size={20} named />
                <span className={styles.sideText}>
                  <span className={styles.sideTitle}>{card.title}</span>
                  <span className={styles.sideMeta}>
                    <WorkStateLabel state={cardWorkState(card, null)} />
                    <span>
                      {card.assignee} · <Elapsed since={card.openedAt} mode="age" />
                    </span>
                  </span>
                  {card.note ? <span className={styles.sideNote}>{card.note}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
