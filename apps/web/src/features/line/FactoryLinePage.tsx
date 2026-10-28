import type { IssueSummary, StationId } from '@factory-live/contracts';
import { BellIcon, PeopleIcon } from '@primer/octicons-react';
import { Banner, Button, Heading, VisuallyHidden } from '@primer/react';
import type { Edge } from '@xyflow/react';
import { Link, useNavigate } from 'react-router';
import { useSnapshot } from '../../data/FactoryProvider.tsx';
import { AgentAvatar } from '../../ui/agents/AgentAvatar.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { FlowView, flowEdge } from '../../ui/flow/FlowCanvas.tsx';
import type { FlowEdgeData } from '../../ui/flow/FlowEdge.tsx';
import type { RailStep } from '../../ui/flow/FlowRail.tsx';
import { MotionToggle } from '../../ui/motion.tsx';
import { useNow } from '../../ui/useNow.ts';
import { CARD_STATUS_LABEL, LINE_STATIONS, STATION_LABEL } from '../../ui/vocabulary.ts';
import { LiveActivity } from './LiveActivity.tsx';
import { LiveAgents } from './LiveAgents.tsx';
import {
  STATION_ICON,
  StationCounter,
  StationCrew,
  StationNode,
  StationRailDetails,
  stationTone,
} from './StationNode.tsx';
import type { StationFlowNode } from './StationNode.tsx';
import styles from './line.module.css';

const NODE_TYPES = { station: StationNode };
const NODE_HEIGHT = 150;
const NODE_WIDTH = 168;
const GAP = 32;
/** Une issue qui vient de changer de station glisse sur la liaison pendant cette fenêtre. */
const TRANSIT_WINDOW_MS = 1_500;
const WORKING = new Set(['thinking', 'tool', 'cli']);

function recentlyMoved(issue: IssueSummary, now: number): boolean {
  return Boolean(
    issue.previousStation &&
    issue.stationChangedAt &&
    now - Date.parse(issue.stationChangedAt) < TRANSIT_WINDOW_MS,
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

  /** La liaison d'une station à la suivante : un flux si la suivante travaille, les issues qui viennent d'y passer. */
  const link = (from: StationId, to: StationId): FlowEdgeData => ({
    flowing: agentsAt(to).some((agent) => WORKING.has(agent.state)),
    packets: snapshot.issues
      .filter(
        (issue) =>
          issue.station === to && issue.previousStation === from && recentlyMoved(issue, now),
      )
      .map((issue) => ({
        id: `${issue.key}-${issue.stationChangedAt}`,
        label: `#${issue.number}`,
      })),
  });

  const nodes: StationFlowNode[] = stations.map((station, index) => ({
    id: station.id,
    type: 'station',
    position: { x: index * (NODE_WIDTH + GAP), y: 0 },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    data: {
      station,
      agents: agentsAt(station.id),
      issues: issuesAt(station.id),
      arrived: arrivedAt(station.id),
    },
    draggable: false,
    connectable: false,
    selectable: false,
  }));

  const edges: Edge[] = stations.slice(1).map((target, index) => {
    const from = stations[index]?.id as StationId;
    return flowEdge(`${from}->${target.id}`, from, target.id, link(from, target.id));
  });

  const steps: RailStep[] = stations.map((station, index) => {
    const agents = agentsAt(station.id);
    const issues = issuesAt(station.id);
    const tone = stationTone(station.id, agents, issues);
    const following = stations[index + 1];
    return {
      id: station.id,
      icon: STATION_ICON[station.id],
      tone,
      active: tone === 'accent',
      aside: <StationCounter count={issues.length} arrived={arrivedAt(station.id)} />,
      title: (
        <>
          {STATION_LABEL[station.id]}
          <VisuallyHidden>
            {' '}
            : {issues.length} issue{issues.length > 1 ? 's' : ''}
          </VisuallyHidden>
        </>
      ),
      meta: <StationCrew station={station} agents={agents} size={20} />,
      children: <StationRailDetails station={station.id} agents={agents} issues={issues} />,
      ...(following ? { next: link(station.id, following.id) } : {}),
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

      <FlowView
        label="Ligne d’usine : les étapes d’une issue, de l’intake au merge"
        naturalWidth={stations.length * (NODE_WIDTH + GAP) - GAP}
        height={NODE_HEIGHT + 16}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        steps={steps}
      />

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
                    {card.assignee} · {CARD_STATUS_LABEL[card.status]} ·{' '}
                    <Elapsed since={card.openedAt} mode="age" />
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
