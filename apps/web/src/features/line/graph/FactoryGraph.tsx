import type { IssueStatus } from '@factory-live/contracts';
import { ChevronDownIcon, ChevronUpIcon, ShieldCheckIcon } from '@primer/octicons-react';
import { Button } from '@primer/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { MOVE_TRANSITION, useMotion } from '../../../ui/motion.tsx';
import { KindChip, ModelsBox, StationBox } from './boxes.tsx';
import { GraphFilters, NO_FILTERS, filtering, matches } from './filters.tsx';
import type { Filters } from './filters.tsx';
import {
  EVENT_OF,
  Particle,
  Traveller,
  dashOf,
  edgeLength,
  travelDuration,
  useFlowClock,
} from './flow.tsx';
import { DONE_SHOWN, INTAKE_SHOWN, LANES, feedOf, journeyEdges, layout } from './layout.ts';
import type { BoxId, Fill } from './layout.ts';
import { Legend } from './Legend.tsx';
import { callingStations, finishedAt } from './model.ts';
import { BRANCH_COLOR, markColor } from './palette.ts';
import type { LineIssue, ProviderRow } from './model.ts';
import { ZoomControls, useZoom } from './zoom.tsx';
import styles from './graph.module.css';

const ALL_BOXES: readonly BoxId[] = [
  'intake',
  'brief',
  'implementation',
  ...LANES.map((lane) => `gate:${lane}` as const),
  'review',
  'merge',
  'ci',
  'deploy',
  'done',
  'diagnostic',
  'models',
];

/** What waits for the owner first, then what blocks, then what moves, then what waits its turn. */
const ORDER: Record<IssueStatus, number> = {
  waiting_human: 0,
  blocked: 1,
  active: 2,
  queued: 3,
  done: 4,
  stopped: 5,
};

/** An issue changing station: its card travels along the connectors it takes. */
interface Transit {
  key: string;
  edges: string[];
  /** The issue and its journey length when it left: identifies the trip. */
  id: string;
}

const LANDING_MS = 500;

/**
 * The factory line as a run graph: one box per station holding its issues, joined by curved
 * connectors that plug into the boxes by round ports, one colour per branch. A connector steps back
 * at rest and comes forward when something goes through it: a card travelling to its new station,
 * the open issue's journey (comets), a model answering an agent (points up its feed).
 */
export function FactoryGraph({
  items,
  providers,
  selectedKey,
  onSelect,
  now,
  maxInProgress,
}: {
  items: readonly LineIssue[];
  providers: readonly ProviderRow[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  now: number;
  maxInProgress: number;
}) {
  const { t } = useI18n();
  const { enabled } = useMotion();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [legendOpen, setLegendOpen] = useState(false);

  const placed = useMemo(() => {
    const at = new Map<BoxId, LineIssue[]>();
    for (const id of ALL_BOXES) at.set(id, []);
    for (const item of items) at.get(item.box)?.push(item);
    for (const [id, list] of at)
      list.sort((left, right) =>
        id === 'done'
          ? finishedAt(right.issue).localeCompare(finishedAt(left.issue))
          : ORDER[left.issue.status] - ORDER[right.issue.status] ||
            left.issue.startedAt.localeCompare(right.issue.startedAt),
      );
    return at;
  }, [items]);

  const fills = useMemo(() => {
    const result = {} as Record<BoxId, Fill>;
    for (const id of ALL_BOXES) {
      const count = placed.get(id)?.length ?? 0;
      if (id === 'models')
        result[id] = { rows: providers.length, row: 'compact', more: 0, rowH: 34 };
      else if (id === 'done' || id === 'intake') {
        const shown = id === 'done' ? DONE_SHOWN : INTAKE_SHOWN;
        result[id] = {
          rows: Math.min(count, shown),
          row: id === 'done' ? 'finished' : 'compact',
          more: Math.max(count - shown, 0),
        };
      } else result[id] = { rows: count, row: 'full', more: 0 };
    }
    return result;
  }, [placed, providers.length]);

  const geometry = useMemo(() => layout(fills), [fills]);
  const edgesById = useMemo(
    () => new Map(geometry.edges.map((edge) => [edge.id, edge])),
    [geometry],
  );

  // An issue that changes station travels, as a card, along the connectors it takes; its row in the
  // new station shows once the card has arrived. The trips are worked out while rendering the new
  // issues, against the ones seen before (React's pattern for state that follows a prop).
  const [seen, setSeen] = useState(items);
  const [transits, setTransits] = useState<readonly Transit[]>([]);
  if (seen !== items) {
    setSeen(items);
    const before = new Map(seen.map(({ issue }) => [issue.key, issue.journey.length]));
    const fresh: Transit[] = [];
    for (const { issue } of items) {
      const steps = before.get(issue.key);
      if (steps === undefined || steps === 0 || issue.journey.length <= steps) continue;
      // A step no connector draws (back from Fusion to Ta revue) makes no trip: the row shows at once.
      const edges = journeyEdges(issue.journey.slice(steps - 1)).filter((id) => edgesById.has(id));
      if (edges.length > 0)
        fresh.push({ key: issue.key, id: `${issue.key}:${issue.journey.length}`, edges });
    }
    if (fresh.length > 0 && enabled)
      setTransits((current) => [
        ...current.filter((transit) => !fresh.some((trip) => trip.key === transit.key)),
        ...fresh,
      ]);
  }

  // The card has landed: its row shows, ringed for a moment where the card set down.
  const [landed, setLanded] = useState<ReadonlySet<string>>(new Set());
  const arrive = (transit: Transit) => {
    setTransits((current) => current.filter((candidate) => candidate.id !== transit.id));
    setLanded((current) => new Set(current).add(transit.key));
    window.setTimeout(
      () =>
        setLanded((current) => {
          const next = new Set(current);
          next.delete(transit.key);
          return next;
        }),
      LANDING_MS,
    );
  };
  const travelling = new Set(transits.map((transit) => transit.key));

  // Each connector of a trip draws itself while the card runs along it.
  const travelTiming = new Map<string, { delay: number; duration: number }>();
  for (const transit of transits) {
    const edges = transit.edges.map((id) => edgesById.get(id));
    const total = travelDuration(edges);
    const lengths = edges.map((edge) => (edge ? edgeLength(edge) : 0));
    const sum = lengths.reduce((a, b) => a + b, 0) || 1;
    let start = 0;
    transit.edges.forEach((id, index) => {
      const share = ((lengths[index] ?? 0) / sum) * total;
      travelTiming.set(id, { delay: start, duration: share });
      start += share;
    });
  }
  const clock = useFlowClock(enabled);

  const selected = items.find((item) => item.issue.key === selectedKey) ?? null;
  const journey = useMemo(
    () => [...new Set(selected ? journeyEdges(selected.issue.journey) : [])],
    [selected],
  );
  const calling = callingStations(items);

  // A connector is active while something goes through it: a card travelling, the open issue's flow,
  // a model answering an agent. The others step back.
  const active = new Map<string, 'travel' | 'journey' | 'model'>();
  for (const id of journey) active.set(id, 'journey');
  for (const station of calling) active.set(feedOf(station), 'model');
  for (const transit of transits) for (const id of transit.edges) active.set(id, 'travel');

  const shown = filtering(filters)
    ? new Set(
        items
          .filter((item) => matches(item, filters, (type) => t.issueType[type]))
          .map((item) => item.issue.key),
      )
    : null;

  const reviews = items.filter(
    (item) => item.issue.status === 'waiting_human' && item.box === 'review',
  ).length;
  const decisions = items.filter(
    (item) => item.issue.status === 'waiting_human' && item.box !== 'review',
  ).length;
  const blocked = items.filter((item) => item.issue.status === 'blocked').length;
  const waits = [
    reviews > 0 ? t.line.graph.reviews(reviews) : null,
    decisions > 0 ? t.line.graph.decisions(decisions) : null,
    blocked > 0 ? t.line.graph.blockers(blocked) : null,
  ].filter(Boolean);

  const { scroller, scale, width, height, zoomBy, fit, reveal } = useZoom(
    geometry.width,
    geometry.height,
  );

  // On a narrow screen zoomed in, the graph pans: the open issue's station comes into view.
  const target = selected ? geometry.boxes[selected.box] : null;
  const targetX = target?.x ?? null;
  const targetW = target?.w ?? 0;
  useEffect(() => {
    if (targetX !== null) reveal(targetX, targetW);
  }, [targetX, targetW, reveal]);

  return (
    <section className={styles.panel} aria-label={t.line.graph.label}>
      <header className={styles.panelHead}>
        <p className={styles.panelSummary}>
          <strong>{waits.length === 0 ? t.line.graph.nothingWaits : t.line.graph.waits}</strong>
          {waits.length > 0 ? ` : ${waits.join(', ')}` : ''}
        </p>
        <GraphFilters
          items={items}
          filters={filters}
          onChange={setFilters}
          found={shown?.size ?? null}
        />
      </header>

      <div className={styles.viewport}>
        <div className={styles.scroller} ref={scroller}>
          <motion.div className={styles.sizer} style={{ width, height }}>
            <motion.div
              className={styles.canvas}
              style={{
                width: geometry.width,
                height: geometry.height,
                scale,
                transformOrigin: '0 0',
              }}
            >
              <div
                className={styles.gateFrame}
                style={{
                  left: geometry.gate.x,
                  top: geometry.gate.y,
                  width: geometry.gate.w,
                  height: geometry.gate.h,
                }}
                title={t.line.graph.gateHint}
              >
                <span className={styles.gateTitle}>
                  <ShieldCheckIcon size={16} className={styles.headIcon} aria-hidden="true" />
                  <span className={styles.headName}>{t.station.gate}</span>
                  <KindChip kind="script" />
                </span>
              </div>

              {ALL_BOXES.map((id) =>
                id === 'models' ? (
                  <ModelsBox key={id} box={geometry.boxes[id]} rows={providers} />
                ) : (
                  <StationBox
                    key={id}
                    id={id}
                    box={geometry.boxes[id]}
                    items={placed.get(id) ?? []}
                    row={fills[id].row}
                    selectedKey={selectedKey}
                    travelling={travelling}
                    landed={landed}
                    shown={shown}
                    onSelect={onSelect}
                    now={now}
                    maxInProgress={maxInProgress}
                  />
                ),
              )}

              {/*
               * The connectors pass over the cards they join, the gate's frame included: each one
               * plugs into the border of its cards, at both ends, by the same round port.
               */}
              <svg
                className={styles.edges}
                width={geometry.width}
                height={geometry.height}
                aria-hidden="true"
              >
                {geometry.edges.map((edge) => (
                  <motion.path
                    key={edge.id}
                    className={styles.edge}
                    style={{ stroke: BRANCH_COLOR[edge.branch] }}
                    initial={false}
                    animate={{ d: edge.d }}
                    transition={MOVE_TRANSITION}
                    strokeDasharray={dashOf(edge)}
                  />
                ))}
                {/*
                 * A connector in use draws itself over its pale line: in step with a travelling card,
                 * or one after the other along the open issue's journey. A dashed return fades in
                 * instead, keeping its dashes.
                 */}
                <AnimatePresence>
                  {[...active].map(([id, kind]) => {
                    const edge = edgesById.get(id);
                    if (!edge) return null;
                    const event = edge.branch === 'back' ? EVENT_OF[id] : undefined;
                    const dash = dashOf(edge);
                    const timing =
                      kind === 'travel'
                        ? (travelTiming.get(id) ?? { delay: 0, duration: 1 })
                        : { delay: Math.max(journey.indexOf(id), 0) * 0.14, duration: 0.7 };
                    return (
                      <motion.path
                        key={`over:${id}`}
                        className={styles.overlay}
                        style={{ stroke: markColor(edge.branch, event) }}
                        data-active-edge={id}
                        d={edge.d}
                        strokeDasharray={dash}
                        initial={
                          enabled ? (dash ? { opacity: 0 } : { pathLength: 0, opacity: 0 }) : false
                        }
                        animate={
                          dash
                            ? { opacity: 1, d: edge.d }
                            : { pathLength: 1, opacity: 1, d: edge.d }
                        }
                        exit={{ opacity: 0, transition: { duration: 0.35 } }}
                        transition={{
                          pathLength: { ...timing, ease: [0.65, 0, 0.35, 1] },
                          // The round cap would show as a dot before the line grows: it snaps in.
                          opacity: { duration: dash ? 0.3 : 0.01, delay: timing.delay },
                          d: MOVE_TRANSITION,
                        }}
                      />
                    );
                  })}
                </AnimatePresence>
              </svg>

              {/*
               * The data running along the connectors in use: comets along the open issue's journey,
               * points up a feed whose model answers an agent. They stand still when the animations
               * are paused or reduced.
               */}
              {[...active].flatMap(([id, kind]) => {
                const edge = edgesById.get(id);
                if (!edge || kind === 'travel') return [];
                const count = kind === 'model' ? 2 : 3;
                return Array.from({ length: count }, (_, index) => (
                  <Particle
                    key={`${id}:${index}`}
                    edge={edge}
                    clock={clock}
                    period={kind === 'model' ? 1.4 : 2.6}
                    phase={index / count}
                    kind={kind}
                    event={edge.branch === 'back' ? EVENT_OF[id] : undefined}
                  />
                ));
              })}

              {/* The ports, the same at both ends of every connector, over everything they join. */}
              <svg
                className={styles.ports}
                width={geometry.width}
                height={geometry.height}
                aria-hidden="true"
              >
                {geometry.edges.flatMap((edge) => {
                  const state = active.get(edge.id);
                  const event = state && edge.branch === 'back' ? EVENT_OF[edge.id] : undefined;
                  return [edge.from, edge.to].map((point, end) => (
                    <motion.circle
                      key={`${edge.id}:${end}`}
                      r={3.5}
                      className={styles.port}
                      style={{ stroke: markColor(edge.branch, event) }}
                      data-active={state ? '' : undefined}
                      initial={false}
                      animate={{ cx: point.x, cy: point.y }}
                      transition={MOVE_TRANSITION}
                    />
                  ));
                })}
              </svg>

              {transits.map((transit) => {
                const item = items.find((candidate) => candidate.issue.key === transit.key);
                // One continuous route: each following connector joins the previous one by a line
                // through the station, instead of a jump.
                const path = transit.edges
                  .map((id, index) => {
                    const d = edgesById.get(id)?.d ?? '';
                    return index === 0 ? d : d.replace(/^M/, 'L');
                  })
                  .join(' ');
                return item && path.trim() ? (
                  <Traveller
                    key={transit.id}
                    issue={item.issue}
                    path={path}
                    duration={travelDuration(transit.edges.map((id) => edgesById.get(id)))}
                    onArrive={() => arrive(transit)}
                  />
                ) : null;
              })}
            </motion.div>
          </motion.div>
        </div>
      </div>

      <footer className={styles.panelFoot}>
        <div className={styles.footBar}>
          <Button
            className={styles.control}
            variant="invisible"
            size="small"
            trailingVisual={legendOpen ? ChevronUpIcon : ChevronDownIcon}
            aria-expanded={legendOpen}
            aria-controls="factory-graph-legend"
            onClick={() => setLegendOpen((open) => !open)}
          >
            {t.line.graph.legend}
          </Button>
          <ZoomControls zoomBy={zoomBy} fit={fit} />
        </div>
        {/* The legend opens on request; folded, it leaves the graph the room. */}
        <AnimatePresence initial={false}>
          {legendOpen ? (
            <motion.div
              key="legend"
              id="factory-graph-legend"
              className={styles.legendDrawer}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              <Legend />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </footer>
    </section>
  );
}
