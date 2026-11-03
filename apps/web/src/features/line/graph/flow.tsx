import type { IssueSummary } from '@factory-live/contracts';
import { motion, useAnimationFrame, useMotionValue, useTransform } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { useEffect, useRef } from 'react';
import { IssueBadge, issueState } from '../../../ui/badge/IssueBadge.tsx';
import type { Branch, Edge } from './layout.ts';
import { LIVE_COLOR, markColor } from './palette.ts';
import type { FlowEvent } from './palette.ts';
import styles from './graph.module.css';

/**
 * Every kind of connector, the way the legend shows it. The returns are neutral at rest: red is kept
 * for problems, so a return turns red only while an issue takes it after a failure.
 */
export const VECTORS = [
  { id: 'line', branch: 'line' },
  { id: 'failfirst', branch: 'failfirst' },
  { id: 'sabotage', branch: 'sabotage' },
  { id: 'invariance', branch: 'invariance' },
  { id: 'documents', branch: 'documents' },
  { id: 'diagnostic', branch: 'diagnostic' },
  { id: 'gateRed', branch: 'back', dash: '7 5' },
  { id: 'changes', branch: 'back', dash: '1 5' },
  { id: 'revert', branch: 'back', dash: '12 4 2 4' },
  { id: 'models', branch: 'models', dash: '2 4' },
] as const satisfies readonly { id: string; branch: Branch; dash?: string }[];

export type VectorId = (typeof VECTORS)[number]['id'];

const DASH_OF_EDGE: Readonly<Record<string, string>> = {
  'loop:gate': '7 5',
  'loop:review': '1 5',
  'loop:revert': '12 4 2 4',
};

export const dashOf = (edge: Edge): string | undefined =>
  DASH_OF_EDGE[edge.id] ?? (edge.branch === 'models' ? '2 4' : undefined);

/** While an issue takes a return, the return says why: a failure in red, a request in yellow. */
export const EVENT_OF: Readonly<Record<string, FlowEvent>> = {
  'loop:gate': 'problem',
  'loop:revert': 'problem',
  'loop:review': 'request',
};

/** The length of a connector, measured on its path when the browser can, else estimated. */
export function edgeLength(edge: Edge): number {
  try {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', edge.d);
    const length = path.getTotalLength();
    if (length > 0) return length;
  } catch {
    // No SVG geometry here (tests): the estimate below does.
  }
  return Math.hypot(edge.to.x - edge.from.x, edge.to.y - edge.from.y) * 1.3;
}

/** A trip lasts with its length, so that every card runs at the same pace (seconds). */
export function travelDuration(edges: readonly (Edge | undefined)[]): number {
  const length = edges.reduce((sum, edge) => sum + (edge ? edgeLength(edge) : 0), 0);
  return Math.min(2.6, Math.max(0.9, 0.5 + length / 520));
}

/**
 * The clock of the flows: seconds that only advance while the animations may play, so that a pause
 * freezes every comet where it is.
 */
export function useFlowClock(live: boolean): MotionValue<number> {
  const clock = useMotionValue(0);
  const running = useRef(live);
  useEffect(() => {
    running.current = live;
  }, [live]);
  useAnimationFrame((_, delta) => {
    if (running.current) clock.set(clock.get() + Math.min(delta, 64) / 1000);
  });
  return clock;
}

/** One point of data along a connector, fading in as it leaves a card and out as it reaches the next. */
export function Particle({
  edge,
  clock,
  period,
  phase,
  kind,
  event,
}: {
  edge: Edge;
  clock: MotionValue<number>;
  period: number;
  phase: number;
  kind: 'journey' | 'model';
  event: FlowEvent | undefined;
}) {
  const progress = useTransform(() => (clock.get() / period + phase) % 1);
  const offsetDistance = useTransform(() => `${progress.get() * 100}%`);
  const opacity = useTransform(() => Math.min(1, progress.get() * 7, (1 - progress.get()) * 7));
  // A comet wears its branch's colour; a point up a feed, the accent of what is live. Both glow.
  const color = kind === 'model' ? LIVE_COLOR : markColor(edge.branch, event);
  return (
    <motion.span
      className={styles.comet}
      data-kind={kind}
      data-loop=""
      style={{
        offsetPath: `path("${edge.d}")`,
        offsetDistance,
        offsetRotate: kind === 'journey' ? 'auto' : '0deg',
        opacity,
        backgroundColor: color,
        boxShadow: `0 0 ${kind === 'model' ? 6 : 8}px ${color}`,
      }}
      aria-hidden="true"
    />
  );
}

/** An issue's card travelling along the connectors to its new station. */
export function Traveller({
  issue,
  path,
  duration,
  onArrive,
}: {
  issue: Pick<IssueSummary, 'key' | 'status'>;
  path: string;
  duration: number;
  onArrive: () => void;
}) {
  return (
    <motion.div
      className={styles.traveller}
      style={{ offsetPath: `path("${path}")`, offsetRotate: '0deg' }}
      initial={{ offsetDistance: '0%', opacity: 0, scale: 0.92 }}
      animate={{ offsetDistance: '100%', opacity: [0, 1, 1, 0], scale: [0.92, 1, 1, 0.96] }}
      transition={{
        offsetDistance: { duration, ease: [0.65, 0, 0.35, 1] },
        opacity: { duration, times: [0, 0.1, 0.92, 1] },
        scale: { duration, times: [0, 0.1, 0.92, 1] },
      }}
      onAnimationComplete={onArrive}
      aria-hidden="true"
    >
      <IssueBadge issueKey={issue.key} state={issueState(issue.status)} />
    </motion.div>
  );
}
