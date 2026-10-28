import type { IssueSummary, StationId } from '@factory-live/contracts';
import { BellIcon, PeopleIcon } from '@primer/octicons-react';
import { Banner, Button, Heading } from '@primer/react';
import type { Edge } from '@xyflow/react';
import { Link, useNavigate } from 'react-router';
import { useSnapshot } from '../../data/FactoryProvider.tsx';
import { AgentAvatar } from '../../ui/agents/AgentAvatar.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { FlowCanvas, flowEdge, useFlowFrame } from '../../ui/flow/FlowCanvas.tsx';
import type { FlowEdgeData } from '../../ui/flow/FlowEdge.tsx';
import { MotionToggle } from '../../ui/motion.tsx';
import { useNow } from '../../ui/useNow.ts';
import { CARD_STATUS_LABEL, LINE_STATIONS, STATION_LABEL } from '../../ui/vocabulary.ts';
import { LiveActivity } from './LiveActivity.tsx';
import { LiveAgents } from './LiveAgents.tsx';
import { StationNode } from './StationNode.tsx';
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
  const [containerRef, frame] = useFlowFrame();
  const stations = LINE_STATIONS.flatMap((id) =>
    snapshot.stations.filter((station) => station.id === id),
  );
  const width = frame.vertical ? Math.min(Math.max(frame.width - 8, 240), 480) : NODE_WIDTH;
  const height = frame.vertical
    ? stations.length * (NODE_HEIGHT + GAP) - GAP + 16
    : NODE_HEIGHT + 16;
  const issuesAt = (id: StationId) => snapshot.issues.filter((issue) => issue.station === id);
  const agentsAt = (id: StationId) => snapshot.agents.filter((agent) => agent.station === id);

  const nodes: StationFlowNode[] = stations.map((station, index) => ({
    id: station.id,
    type: 'station',
    position: frame.vertical
      ? { x: 0, y: index * (NODE_HEIGHT + GAP) }
      : { x: index * (NODE_WIDTH + GAP), y: 0 },
    width,
    height: NODE_HEIGHT,
    data: {
      station,
      agents: agentsAt(station.id),
      issues: issuesAt(station.id),
      vertical: frame.vertical,
      arrived: issuesAt(station.id).some((issue) => recentlyMoved(issue, now)),
    },
    draggable: false,
    connectable: false,
    selectable: false,
  }));

  const edges: Edge[] = stations.slice(1).map((target, index) => {
    const from = stations[index]?.id as StationId;
    const data: FlowEdgeData = {
      flowing: agentsAt(target.id).some((agent) => WORKING.has(agent.state)),
      packets: snapshot.issues
        .filter(
          (issue) =>
            issue.station === target.id &&
            issue.previousStation === from &&
            recentlyMoved(issue, now),
        )
        .map((issue) => ({
          id: `${issue.key}-${issue.stationChangedAt}`,
          label: `#${issue.number}`,
        })),
    };
    return flowEdge(`${from}->${target.id}`, from, target.id, data);
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

      <FlowCanvas
        containerRef={containerRef}
        frame={frame}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        height={height}
        label="Ligne d’usine : les étapes d’une issue, de l’intake au merge"
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
