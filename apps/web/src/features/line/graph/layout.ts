import { GateLane, MODELS_KEY, parseWorkflowSheet } from '@factory-live/contracts';
import type {
  EdgeKind,
  JourneyStep,
  StationKind,
  WorkflowEdge,
  WorkflowSheet,
  WorkflowStation,
} from '@factory-live/contracts';
import codeLine from './workflows/code-line.json';

/**
 * A workflow drawn as a run graph, from its sheet alone: one box per station holding its items as
 * rows, joined by curved arrows, never a right angle. The stations sit on the sheet's grid: a column
 * per `col`, row 0 above the main row, the next rows stacked down their column. A group's members
 * share a frame and open and close as a fan of curves. The returns arch over the line. The models
 * node is the base under the stations whose agents call a model, and feeds each of them from below.
 * Values in px.
 */

/** The sheet of the code line, read and checked once; its error, if any, shows instead of the graph. */
export const CODE_LINE_SHEET = parseWorkflowSheet(codeLine);
export const CODE_LINE: WorkflowSheet = CODE_LINE_SHEET.ok
  ? CODE_LINE_SHEET.sheet
  : { item: { type: '', label: '' }, stations: [], edges: [], models: [] };

/** A station box's head: its icon, name, and the kind of work done there. */
export const HEAD_H = 36;
/** A head with a second line: the item types a station judges, or the providers' hint. */
export const PROOF_HEAD_H = 52;
/**
 * How an item shows in its box: whole at a station; without the note at the end, where nothing holds
 * it any more; on two lines at the entry, where one item shows at most.
 */
export type RowKind = 'full' | 'finished' | 'compact';
/**
 * The height of a row of each kind. Two rows that follow one another stay 24 px apart at the smallest
 * zoom (`MIN_SCALE`), the touch target WCAG 2.5.8 asks for: that is why a finished row is not compact.
 */
export const ROW_H: Record<RowKind, number> = { full: 100, finished: 84, compact: 56 };
/** The graph's zoom bounds: a phone opens on the whole workflow, never smaller than this. */
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 1.6;
export const EMPTY_H = 34;
/** The row that counts the items not shown. */
export const MORE_H = 30;
/** How many items the end station lists, the last to finish first. */
export const DONE_SHOWN = 2;
/** How many items a station above the main row (the entry) lists. */
export const INTAKE_SHOWN = 1;
/** The main row (row 1), under the entry and the arches of the returns. */
export const TOP = 176;
export const COLUMN_W = 220;
/** The left margin, then the step from one column to the next. */
const MARGIN = 40;
const COLUMN_STEP = 296;
/** Room right of the last column, for the returns that bulge out of it. */
const RIGHT_ROOM = 26;
/** Row 0, above the main row. */
const ABOVE_Y = 24;
const V_GAP = 44;
/** Between two members of a group. */
const PROOF_GAP = 18;
/** A group's frame: its padding, and the room of its title above its first member. */
const FRAME_PAD = 10;
const FRAME_TITLE = 40;
/** The ports of a fan, down the side of a box: the first one, then the step between them. */
const FAN_FIRST = 10;
const FAN_STEP = 15;
/** Where the arches of the returns peak: the shortest one first, nearest the line, then outwards. */
const ARCH_PEAK = 92;
const ARCH_STEP = 52;
/** Where an arch leaves a station, from its left side, or a group's frame, from its right side. */
const ARCH_FROM = 56;
const ARCH_FROM_FRAME = 40;
/** Where the arches land on a station, from its left side: the shortest one rightmost. */
const ARCH_LAND = 112;
const ARCH_LAND_STEP = 40;
/** How far a return within one column bulges out to the right. */
const BULGE = 30;
/** A branch drops below the lowest box of the columns its source touches. */
const BRANCH_GAP = 64;
/** Where a branch that rejoins another column leaves its station, from its left side. */
const BRANCH_EXIT = 22;
/** The models node: under the stations it feeds, inset from their left. */
const FEED_GAP = 56;
const FEED_INSET = 56;
/** A feed moves off the axis of a link entering the same box from above. */
const FEED_SHIFT = 40;
/** A blocked feed turns this far under its station, and enters it this far from its right side. */
const FEED_UNDER = 30;
/** The room under the lowest box, where the long routes run, then the foot of the canvas. */
const UNDER = 40;
const FOOT = 36;
/** Radius of the turns of the long routes (a branch rejoining, a blocked feed). */
const TURN = 40;
/** The dashes of the returns, in the order of the sheet, then of the feeds. */
const RETURN_DASHES = ['7 5', '1 5', '12 4 2 4'] as const;
const FEED_DASH = '2 4';

/** A box of the graph: a station's key, or `models` for the providers. */
export type BoxId = string;

/** The series an edge belongs to: `line`, a group member or a branch, `back` (returns), `models`. */
export type Branch = string;

/** Why an item takes a return: a failure, in red (kept for problems), or a request, in yellow. */
export type FlowEvent = 'problem' | 'request';

export interface Box {
  id: BoxId;
  x: number;
  y: number;
  w: number;
  h: number;
  head: number;
  /** Vertical centre of the head: where the side ports sit. */
  portY: number;
}

export interface Edge {
  id: string;
  branch: Branch;
  d: string;
  /** Where the edge leaves (a port) and where its arrow points. */
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  width: number;
  height: number;
  boxes: Record<BoxId, Box>;
  edges: Edge[];
  /** The frame of the first group, its title above its first member. */
  gate: Frame;
  /** The frame of every group, by its key. */
  groups: Record<string, Frame>;
}

/** How many rows a box shows, and how tall they are. */
export interface Fill {
  rows: number;
  row: RowKind;
  /** Items beyond those shown, counted on one more row. */
  more: number;
  /** A list's own row height (the models node's providers). */
  rowH?: number;
}

const EMPTY_FILL: Fill = { rows: 0, row: 'full', more: 0 };

export function bodyHeight(fill: Fill): number {
  if (fill.rows === 0) return EMPTY_H;
  return fill.rows * (fill.rowH ?? ROW_H[fill.row]) + (fill.more > 0 ? MORE_H : 0);
}

/* ------------------------------------------------------------------------------------------------
 * What a sheet says, read once: the members of its groups, its links with their id, series, dash
 * and cause, the stations its providers feed, its legend.
 * ---------------------------------------------------------------------------------------------- */

/** A link of the sheet, or a feed from the providers, as the graph draws it. */
export interface Link {
  id: string;
  kind: EdgeKind | 'feed';
  from: string;
  to: string;
  branch: Branch;
  dash?: string;
  /** Why an item takes this return. */
  cause?: FlowEvent;
  /** The legend entry it belongs to. */
  legend: string;
  label?: string;
}

/** One entry of the legend per kind of link of the sheet. */
export interface LegendEntry {
  key: string;
  branch: Branch;
  dash?: string;
  label?: string;
}

export interface SheetPlan {
  sheet: WorkflowSheet;
  station: ReadonlyMap<string, WorkflowStation>;
  /** The members of each group, in the order of the sheet. */
  members: ReadonlyMap<string, readonly WorkflowStation[]>;
  /** Stations reached only by a branch: they hang under the line. */
  branchStations: ReadonlySet<string>;
  /** The stations the providers feed. */
  fed: readonly string[];
  links: readonly Link[];
  legend: readonly LegendEntry[];
  /** The series coloured from the display palette, in order: group members, then branches. */
  series: readonly Branch[];
  /** The line, from its entry to its end, a group standing for its members. */
  chain: readonly string[];
}

/** A group member's key without its group: `<group>:<name>` gives `<name>`. */
export function suffixOf(station: Pick<WorkflowStation, 'key' | 'group'>): string {
  const prefix = `${station.group ?? ''}:`;
  return station.group && station.key.startsWith(prefix)
    ? station.key.slice(prefix.length)
    : station.key;
}

/** The kind of the work done at a station, or at a group (its members share one). */
export function kindOf(plan: SheetPlan, key: string): StationKind | null {
  return plan.station.get(key)?.kind ?? plan.members.get(key)?.[0]?.kind ?? null;
}

/** The connector from the models node up to a station whose agent calls a model. */
export const feedOf = (station: string): string => `${MODELS_KEY}:${station}`;

function linkId(edge: WorkflowEdge, station: ReadonlyMap<string, WorkflowStation>): string {
  if (edge.id) return edge.id;
  if (edge.kind === 'line') return `line:${edge.from}`;
  const to = station.get(edge.to);
  const from = station.get(edge.from);
  if (edge.kind === 'fan' && to?.group) return `in:${suffixOf(to)}`;
  if (edge.kind === 'fan' && from?.group) return `out:${suffixOf(from)}`;
  return `${edge.kind}:${edge.from}:${edge.to}`;
}

/**
 * The edges in the order they are drawn. A fan is drawn member by member, in the order of the
 * group's members, each member's way in then its way out, where the sheet names the group's first
 * fan edge. Every other edge keeps its place in the sheet.
 */
function drawOrder(
  edges: readonly WorkflowEdge[],
  station: ReadonlyMap<string, WorkflowStation>,
  members: ReadonlyMap<string, WorkflowStation[]>,
): WorkflowEdge[] {
  const memberOf = (edge: WorkflowEdge) =>
    edge.kind !== 'fan'
      ? undefined
      : station.get(edge.to)?.group
        ? station.get(edge.to)
        : station.get(edge.from)?.group
          ? station.get(edge.from)
          : undefined;
  const drawn = new Set<string>();
  const out: WorkflowEdge[] = [];
  for (const edge of edges) {
    const member = memberOf(edge);
    if (!member?.group) {
      out.push(edge);
      continue;
    }
    if (drawn.has(member.group)) continue;
    drawn.add(member.group);
    const list = members.get(member.group) ?? [];
    const rank = (other: WorkflowEdge) => {
      const at = list.findIndex(({ key }) => key === (memberOf(other) as WorkflowStation).key);
      return 2 * at + (memberOf(other)?.key === other.to ? 0 : 1);
    };
    out.push(
      ...edges
        .filter((other) => memberOf(other)?.group === member.group)
        .sort((a, b) => rank(a) - rank(b)),
    );
  }
  return out;
}

const plans = new WeakMap<WorkflowSheet, SheetPlan>();

/** What the sheet says, worked out once per sheet. */
export function planOf(sheet: WorkflowSheet): SheetPlan {
  const known = plans.get(sheet);
  if (known) return known;
  const station = new Map(sheet.stations.map((value) => [value.key, value]));
  const members = new Map<string, WorkflowStation[]>();
  for (const group of sheet.groups ?? []) members.set(group.key, []);
  for (const value of sheet.stations) if (value.group) members.get(value.group)?.push(value);

  const reached = new Set(
    sheet.edges.filter((edge) => edge.kind === 'line' || edge.kind === 'fan').map(({ to }) => to),
  );
  const branchStations = new Set(
    sheet.edges
      .filter((edge) => edge.kind === 'branch' && station.has(edge.to) && !reached.has(edge.to))
      .map(({ to }) => to),
  );
  // Fed: the stations the sheet names, else every station where an agent calls a model.
  const fed =
    sheet.models.length > 0
      ? sheet.models
      : sheet.stations.filter((value) => value.kind === 'ai').map(({ key }) => key);

  const kind = (key: string) => station.get(key)?.kind ?? members.get(key)?.[0]?.kind;
  let returns = 0;
  const links: Link[] = drawOrder(sheet.edges, station, members).map((edge) => {
    const id = linkId(edge, station);
    const label = edge.label === undefined ? {} : { label: edge.label };
    switch (edge.kind) {
      case 'line':
        return {
          id,
          kind: edge.kind,
          from: edge.from,
          to: edge.to,
          branch: 'line',
          legend: 'line',
          ...label,
        };
      case 'fan': {
        const member = station.get(edge.to)?.group ? station.get(edge.to) : station.get(edge.from);
        const branch = member ? suffixOf(member) : edge.to;
        return {
          id,
          kind: edge.kind,
          from: edge.from,
          to: edge.to,
          branch,
          legend: branch,
          ...label,
        };
      }
      case 'branch': {
        const branch = branchStations.has(edge.from) ? edge.from : edge.to;
        return {
          id,
          kind: edge.kind,
          from: edge.from,
          to: edge.to,
          branch,
          legend: branch,
          ...label,
        };
      }
      case 'return': {
        const dash = RETURN_DASHES[returns % RETURN_DASHES.length] as string;
        returns += 1;
        // The owner asks for changes; anything else sends an item back after a failure.
        const cause: FlowEvent = kind(edge.from) === 'owner' ? 'request' : 'problem';
        return {
          id,
          kind: edge.kind,
          from: edge.from,
          to: edge.to,
          branch: 'back',
          dash,
          cause,
          legend: id,
          ...label,
        };
      }
    }
  });
  for (const key of fed)
    links.push({
      id: feedOf(key),
      kind: 'feed',
      from: MODELS_KEY,
      to: key,
      branch: MODELS_KEY,
      dash: FEED_DASH,
      legend: MODELS_KEY,
    });

  const legend: LegendEntry[] = [];
  for (const link of links)
    if (!legend.some((entry) => entry.key === link.legend))
      legend.push({
        key: link.legend,
        branch: link.branch,
        ...(link.dash === undefined ? {} : { dash: link.dash }),
        ...(link.label === undefined ? {} : { label: link.label }),
      });

  const series = [
    ...sheet.stations.filter((value) => value.group).map(suffixOf),
    ...links.filter((link) => link.kind === 'branch').map(({ branch }) => branch),
  ].filter((branch, index, all) => all.indexOf(branch) === index);

  const plan: SheetPlan = {
    sheet,
    station,
    members,
    branchStations,
    fed,
    links,
    legend,
    series,
    chain: chainOf(sheet, station),
  };
  plans.set(sheet, plan);
  return plan;
}

/** The line from its entry: each station's line link, a group standing for the members of its fan. */
function chainOf(sheet: WorkflowSheet, station: ReadonlyMap<string, WorkflowStation>): string[] {
  const along = sheet.edges.filter((edge) => edge.kind === 'line' || edge.kind === 'fan');
  const node = (key: string) => station.get(key)?.group ?? key;
  const next = (key: string): string | undefined => {
    const out = along.find((edge) => node(edge.from) === key && node(edge.to) !== key);
    return out ? node(out.to) : undefined;
  };
  const entry = along.find((edge) => !along.some((other) => node(other.to) === node(edge.from)));
  const chain: string[] = [];
  for (let key = entry ? node(entry.from) : undefined; key !== undefined; key = next(key)) {
    if (chain.includes(key)) break;
    chain.push(key);
  }
  return chain;
}

/** The members of the code line's group, the gate's proofs: `failfirst`, `sabotage`... */
export const LANES: readonly GateLane[] = (planOf(CODE_LINE).members.values().next().value ?? [])
  .map(suffixOf)
  .filter((lane): lane is GateLane => GateLane.safeParse(lane).success);

/* ------------------------------------------------------------------------------------------------
 * The curves.
 * ---------------------------------------------------------------------------------------------- */

type Point = readonly [number, number];

/** A curve from a right port to a left port: leaves and arrives level, bends in between. */
function across([x1, y1]: Point, [x2, y2]: Point): string {
  const dx = Math.max(32, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
}

/** A curve from a bottom port down to a top port. */
function down([x1, y1]: Point, [x2, y2]: Point): string {
  const dy = Math.max(16, (y2 - y1) / 2);
  return `M ${x1} ${y1} C ${x1} ${y1 + dy} ${x2} ${y2 - dy} ${x2} ${y2}`;
}

/** A curve from a top port up to a bottom port: the models node feeding a station above it. */
function up([x1, y1]: Point, [x2, y2]: Point): string {
  const dy = Math.max(16, (y1 - y2) / 2);
  return `M ${x1} ${y1} C ${x1} ${y1 - dy} ${x2} ${y2 + dy} ${x2} ${y2}`;
}

/** An arch from the top of a box back to the top of an earlier one, peaking at `peak`. */
function arch([x1, y1]: Point, [x2, y2]: Point, peak: number): string {
  // A cubic whose two control points share a height reaches 3/4 of the way to it at its middle.
  const control = (peak - (y1 + y2) / 8) / 0.75;
  return `M ${x1} ${y1} C ${x1} ${control} ${x2} ${control} ${x2} ${y2}`;
}

/** A curve leaving a right port and coming back to the right port of a box above it. */
function bulge([x1, y1]: Point, [x2, y2]: Point, reach: number): string {
  return `M ${x1} ${y1} C ${x1 + reach} ${y1} ${x2 + reach} ${y2} ${x2} ${y2}`;
}

/** A long route: straight runs joined by wide quarter turns, so that it never shows a corner. */
function route(points: readonly Point[]): string {
  const [first] = points;
  let d = `M ${first?.[0]} ${first?.[1]}`;
  for (let index = 1; index < points.length; index += 1) {
    const [x, y] = points[index] as Point;
    const next = points[index + 1];
    if (!next) {
      d += ` L ${x} ${y}`;
      break;
    }
    const [px, py] = points[index - 1] as Point;
    const [nx, ny] = next;
    const radius = Math.min(TURN, Math.abs(x - px + (y - py)) / 2, Math.abs(nx - x + (ny - y)) / 2);
    const inX = Math.sign(x - px);
    const inY = Math.sign(y - py);
    const outX = Math.sign(nx - x);
    const outY = Math.sign(ny - y);
    // A cubic quarter turn (handles at 0.55 of the radius) reads as a circle, not a corner.
    const handle = radius * 0.55;
    const sx = x - inX * radius;
    const sy = y - inY * radius;
    const ex = x + outX * radius;
    const ey = y + outY * radius;
    d += ` L ${sx} ${sy} C ${sx + inX * handle} ${sy + inY * handle} ${ex - outX * handle} ${ey - outY * handle} ${ex} ${ey}`;
  }
  return d;
}

const columnX = (col: number) => MARGIN + col * COLUMN_STEP;

/* ------------------------------------------------------------------------------------------------
 * The layout.
 * ---------------------------------------------------------------------------------------------- */

export function layout(fills: Record<BoxId, Fill>, sheet: WorkflowSheet = CODE_LINE): Layout {
  const plan = planOf(sheet);
  const box = (id: BoxId, x: number, y: number, w = COLUMN_W, head = HEAD_H): Box => ({
    id,
    x,
    y,
    w,
    h: head + bodyHeight(fills[id] ?? EMPTY_FILL) + 2,
    head,
    portY: y + HEAD_H / 2,
  });
  const headOf = (station: WorkflowStation) => (station.types?.length ? PROOF_HEAD_H : HEAD_H);
  const placed = new Map<string, Box>();
  const bottomOf = (value: Box) => value.y + value.h;

  // Down each column, the stations of the line by row: row 0 above the main row, row 1 on it, the
  // next ones stacked under the one above (closer between two members of a group).
  const columns = [...new Set(sheet.stations.map(({ col }) => col))].sort((a, b) => a - b);
  for (const col of columns) {
    let previous: { station: WorkflowStation; box: Box } | null = null;
    const column = sheet.stations
      .filter((station) => station.col === col && !plan.branchStations.has(station.key))
      .sort((a, b) => a.row - b.row);
    for (const station of column) {
      const gap =
        previous && station.group && station.group === previous.station.group ? PROOF_GAP : V_GAP;
      const y =
        station.row === 0
          ? ABOVE_Y
          : previous && previous.station.row >= 1
            ? bottomOf(previous.box) + gap
            : TOP;
      const value = box(station.key, columnX(col), y, COLUMN_W, headOf(station));
      placed.set(station.key, value);
      previous = { station, box: value };
    }
  }

  // A branch station hangs under the lowest box of the columns its source touches: the source's own
  // and those its line runs to.
  for (const station of sheet.stations) {
    if (!plan.branchStations.has(station.key)) continue;
    const sources = sheet.edges
      .filter((edge) => edge.kind === 'branch' && edge.to === station.key)
      .map(({ from }) => from);
    const cols = new Set<number>();
    for (const source of sources) {
      const at = plan.station.get(source);
      if (at) cols.add(at.col);
      for (const edge of sheet.edges)
        if (edge.kind === 'line' && edge.from === source) {
          const reached = plan.station.get(edge.to);
          if (reached) cols.add(reached.col);
        }
    }
    const lowest = Math.max(
      TOP,
      ...sheet.stations
        .filter((other) => cols.has(other.col) && placed.has(other.key))
        .map((other) => bottomOf(placed.get(other.key) as Box)),
    );
    placed.set(
      station.key,
      box(station.key, columnX(station.col), lowest + BRANCH_GAP, COLUMN_W, headOf(station)),
    );
  }

  const boxes: Record<BoxId, Box> = {};
  for (const station of sheet.stations) boxes[station.key] = placed.get(station.key) as Box;

  // The frame of each group, its title above its first member.
  const groups: Record<string, Frame> = {};
  for (const [key, list] of plan.members) {
    const inside = list.map((member) => boxes[member.key] as Box);
    if (inside.length === 0) continue;
    const left = Math.min(...inside.map((value) => value.x));
    const right = Math.max(...inside.map((value) => value.x + value.w));
    const top = Math.min(...inside.map((value) => value.y)) - FRAME_TITLE;
    groups[key] = {
      x: left - FRAME_PAD,
      y: top,
      w: right - left + 2 * FRAME_PAD,
      h: Math.max(...inside.map(bottomOf)) + FRAME_PAD - top,
    };
  }

  // Under the stations it feeds, the models node is their base.
  const fedBoxes = plan.fed.map((key) => boxes[key]).filter((value): value is Box => !!value);
  let models: Box | null = null;
  if (fedBoxes.length > 0) {
    const left = Math.min(...fedBoxes.map((value) => value.x)) + FEED_INSET;
    const right = Math.max(...fedBoxes.map((value) => value.x + value.w));
    models = box(
      MODELS_KEY,
      left,
      Math.max(...fedBoxes.map(bottomOf)) + FEED_GAP,
      right - left,
      PROOF_HEAD_H,
    );
    boxes[MODELS_KEY] = models;
  }

  const all = Object.values(boxes);
  const frames = Object.values(groups);
  const bottom =
    Math.max(...all.map(bottomOf), ...frames.map((frame) => frame.y + frame.h)) + UNDER;
  const width = Math.max(...all.map((value) => value.x + value.w)) + RIGHT_ROOM;

  const edges: Edge[] = [];
  const edge = (id: string, branch: Branch, d: string, from: Point, to: Point) =>
    edges.push({ id, branch, d, from: { x: from[0], y: from[1] }, to: { x: to[0], y: to[1] } });
  const right = (value: Box): Point => [value.x + value.w, value.portY];
  const left = (value: Box): Point => [value.x, value.portY];
  const topAt = (value: Box, x: number): Point => [x, value.y];
  const bottomAt = (value: Box, x: number): Point => [x, value.y + value.h];
  const middle = (value: Box) => value.x + COLUMN_W / 2;
  const colOf = (key: string) => plan.station.get(key)?.col ?? plan.members.get(key)?.[0]?.col ?? 0;

  // The arches nest: the shortest span nearest the line, the longer ones over it.
  const arches = plan.links
    .filter((link) => link.kind === 'return' && colOf(link.from) !== colOf(link.to))
    .map((link, order) => ({ link, order, span: Math.abs(colOf(link.from) - colOf(link.to)) }))
    .sort((a, b) => a.span - b.span || a.order - b.order)
    .map(({ link }) => link.id);

  for (const link of plan.links) {
    if (link.kind === 'feed') continue;
    const to = boxes[link.to];
    const from = boxes[link.from];
    const frame = groups[link.from];
    if (!to || (!from && !frame)) continue;
    if (link.kind === 'return') {
      const rank = arches.indexOf(link.id);
      if (from && rank < 0) {
        // Within one column: out of the right side and back into it, higher up.
        edge(link.id, link.branch, bulge(right(from), right(to), BULGE), right(from), right(to));
        continue;
      }
      // A return from a group leaves the top of its frame, clear of its title.
      const start: Point = frame
        ? [frame.x + frame.w - ARCH_FROM_FRAME, frame.y]
        : [(from as Box).x + ARCH_FROM, (from as Box).y];
      const end: Point = [to.x + ARCH_LAND - rank * ARCH_LAND_STEP, to.y];
      edge(link.id, link.branch, arch(start, end, ARCH_PEAK - rank * ARCH_STEP), start, end);
      continue;
    }
    if (!from) continue;
    if (link.kind === 'fan') {
      // Each curve of a fan has its own port on the shared box, in the order of the members, so
      // that no two curves ever touch: the fans never cross nor overlap.
      const member = plan.station.get(link.to)?.group ? link.to : link.from;
      const group = plan.station.get(member)?.group ?? '';
      const index = (plan.members.get(group) ?? []).findIndex(({ key }) => key === member);
      if (member === link.to) {
        const out: Point = [from.x + from.w, from.y + FAN_FIRST + index * FAN_STEP];
        edge(link.id, link.branch, across(out, left(to)), out, left(to));
      } else {
        const into: Point = [to.x, to.y + FAN_FIRST + index * FAN_STEP];
        edge(link.id, link.branch, across(right(from), into), right(from), into);
      }
      continue;
    }
    if (colOf(link.from) === colOf(link.to)) {
      // Down a column, from the bottom of a box to the top of the next, at the column's middle.
      const x = middle(from);
      edge(
        link.id,
        link.branch,
        down(bottomAt(from, x), topAt(to, x)),
        bottomAt(from, x),
        topAt(to, x),
      );
    } else if (link.kind === 'branch') {
      // A branch rejoining another column runs under the whole graph and reaches its box from below.
      const exitX = from.x + BRANCH_EXIT;
      const points: Point[] = [
        bottomAt(from, exitX),
        [exitX, bottom],
        [middle(to), bottom],
        bottomAt(to, middle(to)),
      ];
      edge(link.id, link.branch, route(points), points[0] as Point, points[3] as Point);
    } else {
      edge(link.id, link.branch, across(right(from), left(to)), right(from), left(to));
    }
  }

  // The models node feeds, from below, the stations where an agent calls a model: `feedOf(station)`.
  // The straight feeds first, then those another box stands in the way of.
  if (models) {
    const top = models.y;
    const routed: Link[] = [];
    for (const link of plan.links) {
      if (link.kind !== 'feed') continue;
      const station = boxes[link.to] as Box;
      // Off the axis of a link dropping into the same box from above: the two never read as one.
      const fromAbove = plan.links.some(
        (other) =>
          other.to === link.to &&
          (other.kind === 'line' || other.kind === 'branch') &&
          colOf(other.from) === colOf(other.to),
      );
      const x = middle(station) + (fromAbove ? FEED_SHIFT : 0);
      const blocked = all.some(
        (other) =>
          other !== station &&
          other !== models &&
          other.x <= x &&
          x <= other.x + other.w &&
          other.y >= bottomOf(station) &&
          other.y < top,
      );
      if (blocked) routed.push(link);
      else
        edge(
          link.id,
          link.branch,
          up([x, top], bottomAt(station, x)),
          [x, top],
          bottomAt(station, x),
        );
    }
    for (const link of routed) {
      // Up the gap right of its column, then under the station, into it near its right side.
      const station = boxes[link.to] as Box;
      const gapX = station.x + COLUMN_W + (COLUMN_STEP - COLUMN_W) / 2;
      const entryX = station.x + station.w - FEED_UNDER;
      const turnY = bottomOf(station) + FEED_UNDER;
      const points: Point[] = [
        [gapX, top],
        [gapX, turnY],
        [entryX, turnY],
        bottomAt(station, entryX),
      ];
      edge(link.id, link.branch, route(points), points[0] as Point, points[3] as Point);
    }
  }

  const first = Object.values(groups)[0] ?? { x: 0, y: 0, w: 0, h: 0 };
  return { width, height: bottom + FOOT, boxes, edges, gate: first, groups };
}

/* ------------------------------------------------------------------------------------------------
 * The journeys.
 * ---------------------------------------------------------------------------------------------- */

type Step = Pick<JourneyStep, 'station' | 'lane'>;

/** The connectors a journey ran on, in order; a loop taken twice appears twice. */
export function journeyEdges(journey: readonly Step[], sheet: WorkflowSheet = CODE_LINE): string[] {
  const plan = planOf(sheet);
  const end = sheet.stations.find((station) => station.kind === 'end')?.key;
  const fanId = (key: string, side: 'in' | 'out', lane: string | null) => {
    const list = plan.members.get(key) ?? [];
    const member = list.find((value) => suffixOf(value) === lane) ?? list[0];
    const suffix = lane ?? (member ? suffixOf(member) : '');
    const link = plan.links.find(
      (value) =>
        value.kind === 'fan' && member && (side === 'in' ? value.to : value.from) === member.key,
    );
    return link?.id ?? `${side}:${suffix}`;
  };
  const out: string[] = [];
  for (let index = 0; index < journey.length - 1; index += 1) {
    const from = (journey[index] as Step).station as string;
    const to = (journey[index + 1] as Step).station as string;
    const back = plan.links.find(
      (link) => link.kind === 'return' && link.from === from && link.to === to,
    );
    const branch = plan.links.find(
      (link) =>
        link.kind === 'branch' &&
        ((plan.branchStations.has(to) && link.to === to) ||
          (plan.branchStations.has(from) && link.from === from)),
    );
    if (back) out.push(back.id);
    else if (plan.members.has(to)) out.push(fanId(to, 'in', (journey[index + 1] as Step).lane));
    else if (plan.members.has(from)) out.push(fanId(from, 'out', (journey[index] as Step).lane));
    else if (branch) out.push(branch.id);
    else {
      // Along the line, every connector between the two; a stopped item ends at the end station.
      const start = plan.chain.indexOf(from);
      const stop = plan.chain.indexOf(to === 'stopped' && end ? end : to);
      for (let step = start; step >= 0 && step < stop; step += 1) {
        const key = plan.chain[step] as string;
        const line = plan.links.find((link) => link.kind === 'line' && link.from === key);
        out.push(line?.id ?? `line:${key}`);
      }
    }
  }
  return out;
}
