import { MODELS_KEY } from '@factory-live/contracts';
import type { IssueStatus, WorkflowSheet } from '@factory-live/contracts';
import { ChevronDownIcon, ChevronUpIcon } from '@primer/octicons-react';
import { Button } from '@primer/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { MOVE_TRANSITION, useMotion } from '../../../ui/motion.tsx';
import {
  EdgePath,
  GroupFrame,
  Legend,
  Port,
  ProvidersBlock,
  StationBlock,
  ZoomControls,
  octicon,
  useSheetText,
} from './blocks/index.ts';
import type { StationLook } from './blocks/index.ts';
import { GraphFilters, NO_FILTERS, filtering, matches } from './filters.tsx';
import type { Filters } from './filters.tsx';
import { Particle, Traveller, edgeLength, travelDuration, useFlowClock } from './flow.tsx';
import {
  DONE_SHOWN,
  INTAKE_SHOWN,
  feedOf,
  journeyEdges,
  kindOf,
  layout,
  planOf,
  suffixOf,
} from './layout.ts';
import type { BoxId, Fill } from './layout.ts';
import { callingStations, finishedAt } from './model.ts';
import type { LineIssue, ProviderRow } from './model.ts';
import { LIVE_COLOR, paletteOf } from './palette.ts';
import { useZoom } from './zoom.tsx';
import styles from './graph.module.css';

/** What waits for the owner first, then what blocks, then what moves, then what waits its turn. */
const ORDER: Record<IssueStatus, number> = {
  waiting_human: 0,
  blocked: 1,
  active: 2,
  queued: 3,
  done: 4,
  stopped: 5,
};

/** An item changing station: its card travels along the connectors it takes. */
interface Transit {
  key: string;
  edges: string[];
  /** The item and its journey length when it left: identifies the trip. */
  id: string;
}

const LANDING_MS = 500;

export interface WorkflowGraphProps {
  items: readonly LineIssue[];
  providers: readonly ProviderRow[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  now: number;
  maxInProgress: number;
}

/**
 * A workflow as a run graph, drawn from its sheet: one box per station holding its items, joined by
 * curved connectors that plug into the boxes by round ports, one colour per branch. A connector steps
 * back at rest and comes forward when something goes through it: a card travelling to its new
 * station, the open item's journey (comets), a model answering an agent (points up its feed). The
 * sheet is valid: the caller reads it with `parseWorkflowSheet` and shows its error instead.
 */
export function WorkflowGraph({
  sheet,
  items,
  providers,
  selectedKey,
  onSelect,
  now,
  maxInProgress,
}: WorkflowGraphProps & { sheet: WorkflowSheet }) {
  const { t } = useI18n();
  const { enabled } = useMotion();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [legendOpen, setLegendOpen] = useState(false);
  const plan = planOf(sheet);
  const text = useSheetText(plan);
  const palette = useMemo(() => paletteOf(plan.series), [plan]);
  const links = useMemo(() => new Map(plan.links.map((link) => [link.id, link])), [plan]);
  const boxIds = useMemo<readonly BoxId[]>(
    () => [...sheet.stations.map(({ key }) => key), ...(plan.fed.length > 0 ? [MODELS_KEY] : [])],
    [sheet, plan],
  );

  const placed = useMemo(() => {
    const at = new Map<BoxId, LineIssue[]>();
    for (const id of boxIds) at.set(id, []);
    for (const item of items) at.get(item.box)?.push(item);
    for (const [id, list] of at)
      list.sort((left, right) =>
        kindOf(plan, id) === 'end'
          ? finishedAt(right.issue).localeCompare(finishedAt(left.issue))
          : ORDER[left.issue.status] - ORDER[right.issue.status] ||
            left.issue.startedAt.localeCompare(right.issue.startedAt),
      );
    return at;
  }, [items, boxIds, plan]);

  // The end lists its last items; a station above the main row, the entry, its first one; the
  // others list them all.
  const fills = useMemo(() => {
    const result: Record<BoxId, Fill> = {};
    for (const id of boxIds) {
      const count = placed.get(id)?.length ?? 0;
      const end = kindOf(plan, id) === 'end';
      if (id === MODELS_KEY)
        result[id] = { rows: providers.length, row: 'compact', more: 0, rowH: 34 };
      else if (end || plan.station.get(id)?.row === 0) {
        const shown = end ? DONE_SHOWN : INTAKE_SHOWN;
        result[id] = {
          rows: Math.min(count, shown),
          row: end ? 'finished' : 'compact',
          more: Math.max(count - shown, 0),
        };
      } else result[id] = { rows: count, row: 'full', more: 0 };
    }
    return result;
  }, [placed, providers.length, boxIds, plan]);

  const geometry = useMemo(() => layout(fills, sheet), [fills, sheet]);
  const edgesById = useMemo(
    () => new Map(geometry.edges.map((edge) => [edge.id, edge])),
    [geometry],
  );

  // An item that changes station travels, as a card, along the connectors it takes; its row in the
  // new station shows once the card has arrived. The trips are worked out while rendering the new
  // items, against the ones seen before (React's pattern for state that follows a prop).
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
      const edges = journeyEdges(issue.journey.slice(steps - 1), sheet).filter((id) =>
        edgesById.has(id),
      );
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
    () => [...new Set(selected ? journeyEdges(selected.issue.journey, sheet) : [])],
    [selected, sheet],
  );
  const calling = callingStations(items, sheet);

  // A connector is active while something goes through it: a card travelling, the open item's flow,
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

  // What waits for the owner: their review at a station of theirs, a decision anywhere else.
  const owners = (item: LineIssue) => kindOf(plan, item.box) === 'owner';
  const reviews = items.filter(
    (item) => item.issue.status === 'waiting_human' && owners(item),
  ).length;
  const decisions = items.filter(
    (item) => item.issue.status === 'waiting_human' && !owners(item),
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

  // On a narrow screen zoomed in, the graph pans: the open item's station comes into view.
  const target = selected ? geometry.boxes[selected.box] : null;
  const targetX = target?.x ?? null;
  const targetW = target?.w ?? 0;
  useEffect(() => {
    if (targetX !== null) reveal(targetX, targetW);
  }, [targetX, targetW, reveal]);

  // A station's head: a member of a group shows its colour, its frame says the kind of their work.
  const look = (id: BoxId): StationLook => {
    const station = plan.station.get(id);
    const member = station?.group ? suffixOf(station) : null;
    return {
      label: text.label(id),
      hint: text.hint(id),
      icon: station && !member ? octicon(station.icon) : null,
      kind: station && !member ? station.kind : null,
      swatch: member === null ? null : palette.color(member),
      types: station?.types?.length ? station.types.map(text.type).join(' · ') : null,
      member,
    };
  };
  // While an item takes a return, the return says why: a failure in red, a request in yellow.
  const markOf = (id: string, state: unknown) => {
    const link = links.get(id);
    const edge = edgesById.get(id);
    return palette.mark(edge?.branch ?? '', state ? link?.cause : undefined);
  };

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
              {(sheet.groups ?? []).map((group) => {
                const frame = geometry.groups[group.key];
                return frame ? (
                  <GroupFrame
                    key={group.key}
                    frame={frame}
                    label={text.label(group.key)}
                    hint={text.hint(group.key)}
                    icon={octicon(group.icon)}
                    kind={kindOf(plan, group.key)}
                  />
                ) : null;
              })}

              {boxIds.map((id) => {
                const box = geometry.boxes[id];
                if (!box) return null;
                return id === MODELS_KEY ? (
                  <ProvidersBlock key={id} box={box} rows={providers} label={text.label} />
                ) : (
                  <StationBlock
                    key={id}
                    id={id}
                    box={box}
                    look={look(id)}
                    items={placed.get(id) ?? []}
                    row={fills[id]?.row ?? 'full'}
                    limit={
                      fills[id]?.row === 'finished'
                        ? DONE_SHOWN
                        : fills[id]?.row === 'compact'
                          ? INTAKE_SHOWN
                          : (placed.get(id)?.length ?? 0)
                    }
                    ai={kindOf(plan, id) === 'ai'}
                    selectedKey={selectedKey}
                    travelling={travelling}
                    landed={landed}
                    shown={shown}
                    onSelect={onSelect}
                    now={now}
                    maxInProgress={maxInProgress}
                  />
                );
              })}

              {/*
               * The connectors pass over the cards they join, the groups' frames included: each one
               * plugs into the border of its cards, at both ends, by the same round port.
               */}
              <svg
                className={styles.edges}
                width={geometry.width}
                height={geometry.height}
                aria-hidden="true"
              >
                {geometry.edges.map((edge) => (
                  <EdgePath
                    key={edge.id}
                    edge={edge}
                    color={palette.color(edge.branch)}
                    dash={links.get(edge.id)?.dash}
                  />
                ))}
                {/*
                 * A connector in use draws itself over its pale line: in step with a travelling card,
                 * or one after the other along the open item's journey. A dashed return fades in
                 * instead, keeping its dashes.
                 */}
                <AnimatePresence>
                  {[...active].map(([id, kind]) => {
                    const edge = edgesById.get(id);
                    if (!edge) return null;
                    const dash = links.get(id)?.dash;
                    const timing =
                      kind === 'travel'
                        ? (travelTiming.get(id) ?? { delay: 0, duration: 1 })
                        : { delay: Math.max(journey.indexOf(id), 0) * 0.14, duration: 0.7 };
                    return (
                      <motion.path
                        key={`over:${id}`}
                        className={styles.overlay}
                        style={{ stroke: markOf(id, true) }}
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
               * The data running along the connectors in use: comets along the open item's journey,
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
                    color={kind === 'model' ? LIVE_COLOR : markOf(id, true)}
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
                  return [edge.from, edge.to].map((point, end) => (
                    <Port
                      key={`${edge.id}:${end}`}
                      point={point}
                      color={markOf(edge.id, state)}
                      active={Boolean(state)}
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
              <Legend entries={plan.legend} palette={palette} label={text.vector} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </footer>
    </section>
  );
}
