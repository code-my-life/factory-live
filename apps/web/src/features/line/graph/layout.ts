import type { GateLane, JourneyStep, StationId } from '@factory-live/contracts';

/**
 * The factory line drawn as a run graph: one box per station holding its issues as rows, joined by
 * curved arrows, never a right angle. The line enters at Intake, above Brief, runs right along the
 * main row to Ta revue, then down the last column to Terminé. The gate opens and closes as a fan of
 * curves over its four proof boxes. The returns arch over the line. The models node is the base
 * under the stations whose agents call a model, and feeds each of them from below. Values in px.
 */
export const CANVAS_W = 1174;
/** A station box's head: its icon, name, and the kind of work done there. */
export const HEAD_H = 36;
/** A proof box's head has a second line: the issue types it judges. */
export const PROOF_HEAD_H = 52;
/**
 * How an issue shows in its box: whole at a station; without the note in Terminé, where nothing holds
 * it any more; on two lines in Intake, where one issue shows at most.
 */
export type RowKind = 'full' | 'finished' | 'compact';
/**
 * The height of a row of each kind. Two rows that follow one another stay 24 px apart at the smallest
 * zoom (`MIN_SCALE`), the touch target WCAG 2.5.8 asks for: that is why a finished row is not compact.
 */
export const ROW_H: Record<RowKind, number> = { full: 100, finished: 84, compact: 56 };
/** The graph's zoom bounds: a phone opens on the whole factory, never smaller than this. */
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 1.6;
export const EMPTY_H = 34;
/** The row that counts the issues not shown. */
export const MORE_H = 30;
export const DONE_SHOWN = 2;
export const INTAKE_SHOWN = 1;
/** The main row, under Intake and the arches of the returns. */
export const TOP = 176;
const COLUMN_W = 220;
const X = { first: 40, impl: 336, gate: 632, last: 928 } as const;
const V_GAP = 44;
const PROOF_GAP = 18;
const INTAKE_Y = 24;
/** The ports of a fan, down the side of a box: the first one, then the step between them. */
const FAN_FIRST = 10;
const FAN_STEP = 15;
/** Where the arches of the returns peak. */
const ARCH_REVIEW = 40;
const ARCH_GATE = 92;
/** Radius of the turns of the long routes (Diagnostic, the feed to Brief). */
const TURN = 40;

/** The stations drawn as a box of their own: the line, the Diagnostic branch, and Terminé. */
export type StationBox =
  | 'intake'
  | 'brief'
  | 'implementation'
  | 'review'
  | 'merge'
  | 'ci'
  | 'deploy'
  | 'done'
  | 'diagnostic';

export type BoxId = StationBox | `gate:${GateLane}` | 'models';

export type Branch = 'line' | GateLane | 'diagnostic' | 'back' | 'models';

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

export interface Layout {
  width: number;
  height: number;
  boxes: Record<BoxId, Box>;
  edges: Edge[];
  /** The frame grouping the gate's proofs, its title above the first proof. */
  gate: { x: number; y: number; w: number; h: number };
}

export const LANES: readonly GateLane[] = ['failfirst', 'sabotage', 'invariance', 'documents'];

/** How many rows a box shows, and how tall they are. */
export interface Fill {
  rows: number;
  row: RowKind;
  /** Issues beyond those shown, counted on one more row. */
  more: number;
  /** A list's own row height (the models node's providers). */
  rowH?: number;
}

export function bodyHeight(fill: Fill): number {
  if (fill.rows === 0) return EMPTY_H;
  return fill.rows * (fill.rowH ?? ROW_H[fill.row]) + (fill.more > 0 ? MORE_H : 0);
}

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
function arch([x1, y1]: Point, [x2, y2]: Point, peak: number): { d: string } {
  // A cubic whose two control points share a height reaches 3/4 of the way to it at its middle.
  const control = (peak - (y1 + y2) / 8) / 0.75;
  return { d: `M ${x1} ${y1} C ${x1} ${control} ${x2} ${control} ${x2} ${y2}` };
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

export function layout(fills: Record<BoxId, Fill>): Layout {
  const box = (id: BoxId, x: number, y: number, w = COLUMN_W, head = HEAD_H): Box => ({
    id,
    x,
    y,
    w,
    h: head + bodyHeight(fills[id]) + 2,
    head,
    portY: y + HEAD_H / 2,
  });
  const boxes = {} as Record<BoxId, Box>;
  const put = (value: Box) => {
    boxes[value.id] = value;
    return value;
  };

  const intake = put(box('intake', X.first, INTAKE_Y));
  const brief = put(box('brief', X.first, TOP));
  const impl = put(box('implementation', X.impl, TOP));

  let proofY = TOP;
  const proofs = LANES.map((lane) => {
    const proof = put(box(`gate:${lane}`, X.gate, proofY, COLUMN_W, PROOF_HEAD_H));
    proofY += proof.h + PROOF_GAP;
    return proof;
  });
  const lastProof = proofs[proofs.length - 1] as Box;
  const gate = {
    x: X.gate - 10,
    y: TOP - 40,
    w: COLUMN_W + 20,
    h: lastProof.y + lastProof.h + 10 - (TOP - 40),
  };

  // The delivery column: the line turns down after Ta revue.
  const delivery: Box[] = [];
  let deliveryY = TOP;
  for (const id of ['review', 'merge', 'ci', 'deploy', 'done'] as const) {
    const station = put(box(id, X.last, deliveryY));
    delivery.push(station);
    deliveryY += station.h + V_GAP;
  }
  const [review, , ci] = delivery as [Box, Box, Box];
  const done = delivery[delivery.length - 1] as Box;

  // Under Brief, the Diagnostic branch; under both first columns, the models node as their base.
  const diagnostic = put(
    box('diagnostic', X.first, Math.max(brief.y + brief.h, impl.y + impl.h) + 64),
  );
  const modelsX = X.first + 56;
  const models = put(
    box(
      'models',
      modelsX,
      Math.max(diagnostic.y + diagnostic.h, impl.y + impl.h) + 56,
      X.impl + COLUMN_W - modelsX,
      PROOF_HEAD_H,
    ),
  );

  const bottom = Math.max(models.y + models.h, gate.y + gate.h, done.y + done.h) + 40;

  const edges: Edge[] = [];
  const edge = (id: string, branch: Branch, d: string, from: Point, to: Point) =>
    edges.push({ id, branch, d, from: { x: from[0], y: from[1] }, to: { x: to[0], y: to[1] } });
  const right = (value: Box): Point => [value.x + value.w, value.portY];
  const left = (value: Box): Point => [value.x, value.portY];
  const topAt = (value: Box, x: number): Point => [x, value.y];
  const bottomAt = (value: Box, x: number): Point => [x, value.y + value.h];

  // Intake, above Brief, drops into it.
  const entry = X.first + COLUMN_W / 2;
  edge(
    'line:intake',
    'line',
    down(bottomAt(intake, entry), topAt(brief, entry)),
    bottomAt(intake, entry),
    topAt(brief, entry),
  );
  edge('line:brief', 'line', across(right(brief), left(impl)), right(brief), left(impl));

  // The gate opens on a fan of curves, one colour per proof, and closes on another into Ta revue.
  // Each curve has its own port on Implémentation and on Ta revue, in the order of the proofs, so
  // that no two curves ever touch: the fans never cross nor overlap.
  proofs.forEach((proof, index) => {
    const lane = proof.id.slice('gate:'.length) as GateLane;
    const out: Point = [impl.x + impl.w, impl.y + FAN_FIRST + index * FAN_STEP];
    const into: Point = [review.x, review.y + FAN_FIRST + index * FAN_STEP];
    edge(`in:${lane}`, lane, across(out, left(proof)), out, left(proof));
    edge(`out:${lane}`, lane, across(right(proof), into), right(proof), into);
  });

  // Down the delivery column, from the bottom of a box to the top of the next.
  const middle = X.last + COLUMN_W / 2;
  for (let index = 0; index < delivery.length - 1; index += 1) {
    const upper = delivery[index] as Box;
    const lower = delivery[index + 1] as Box;
    edge(
      `line:${upper.id}`,
      'line',
      down(bottomAt(upper, middle), topAt(lower, middle)),
      bottomAt(upper, middle),
      topAt(lower, middle),
    );
  }

  // The Diagnostic branch drops from Brief, then runs left of the models node and under the whole
  // graph to Terminé, which it reaches from below: no PR, no gate, no review.
  edge(
    'diag:in',
    'diagnostic',
    down(bottomAt(brief, entry), topAt(diagnostic, entry)),
    bottomAt(brief, entry),
    topAt(diagnostic, entry),
  );
  const exitX = X.first + 22;
  const diagOut: Point[] = [
    bottomAt(diagnostic, exitX),
    [exitX, bottom],
    [middle, bottom],
    bottomAt(done, middle),
  ];
  edge('diag:out', 'diagnostic', route(diagOut), diagOut[0] as Point, diagOut[3] as Point);

  // The returns arch over the line and land on Implémentation; the revert bends back to Ta revue.
  // The red return leaves the gate's card from its top, clear of its title.
  const gateFrom: Point = [gate.x + gate.w - 40, gate.y];
  // Both returns land over Implémentation's name, clear of its label on the right.
  const gateTo: Point = [impl.x + 112, impl.y];
  edge('loop:gate', 'back', arch(gateFrom, gateTo, ARCH_GATE).d, gateFrom, gateTo);
  const reviewFrom: Point = [review.x + 56, review.y];
  const reviewTo: Point = [impl.x + 72, impl.y];
  edge('loop:review', 'back', arch(reviewFrom, reviewTo, ARCH_REVIEW).d, reviewFrom, reviewTo);
  edge('loop:revert', 'back', bulge(right(ci), right(review), 30), right(ci), right(review));

  // The models node feeds, from below, the stations where an agent calls a model.
  const implFeed = impl.x + impl.w / 2;
  edge(
    'models:impl',
    'models',
    up([implFeed, models.y], bottomAt(impl, implFeed)),
    [implFeed, models.y],
    bottomAt(impl, implFeed),
  );
  const diagFeed = X.first + COLUMN_W / 2 + 40;
  edge(
    'models:diagnostic',
    'models',
    up([diagFeed, models.y], bottomAt(diagnostic, diagFeed)),
    [diagFeed, models.y],
    bottomAt(diagnostic, diagFeed),
  );
  // To Brief: up between Diagnostic and Implémentation, then under Brief.
  const between = (X.first + COLUMN_W + X.impl) / 2;
  const briefFeed = X.first + COLUMN_W - 30;
  const toBrief: Point[] = [
    [between, models.y],
    [between, brief.y + brief.h + 30],
    [briefFeed, brief.y + brief.h + 30],
    bottomAt(brief, briefFeed),
  ];
  edge('models:brief', 'models', route(toBrief), toBrief[0] as Point, toBrief[3] as Point);

  return { width: CANVAS_W, height: bottom + 36, boxes, edges, gate };
}

/** The order of the line, to find the connectors between two of its stations. */
const LINE: readonly StationId[] = [
  'intake',
  'brief',
  'implementation',
  'gate',
  'review',
  'merge',
  'ci',
  'deploy',
  'done',
];

/** The connectors a journey ran on, in order; a loop taken twice appears twice. */
export function journeyEdges(journey: readonly Pick<JourneyStep, 'station' | 'lane'>[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < journey.length - 1; index += 1) {
    const from = journey[index] as Pick<JourneyStep, 'station' | 'lane'>;
    const to = journey[index + 1] as Pick<JourneyStep, 'station' | 'lane'>;
    if (from.station === 'gate' && to.station === 'implementation') out.push('loop:gate');
    else if (from.station === 'review' && to.station === 'implementation') out.push('loop:review');
    else if (from.station === 'ci' && to.station === 'review') out.push('loop:revert');
    else if (to.station === 'gate') out.push(`in:${to.lane ?? 'failfirst'}`);
    else if (from.station === 'gate') out.push(`out:${from.lane ?? 'failfirst'}`);
    else if (to.station === 'diagnostic') out.push('diag:in');
    else if (from.station === 'diagnostic') out.push('diag:out');
    else {
      const start = LINE.indexOf(from.station);
      const end = LINE.indexOf(to.station === 'stopped' ? 'done' : to.station);
      for (let step = start; step >= 0 && step < end; step += 1) out.push(`line:${LINE[step]}`);
    }
  }
  return out;
}
