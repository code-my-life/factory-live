import type { IssueSummary } from '@factory-live/contracts';
import { motion, useAnimationFrame, useMotionValue, useTransform } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { useEffect, useRef } from 'react';
import { IssueBadge, issueState } from '../../../ui/badge/IssueBadge.tsx';
import type { Edge } from './layout.ts';
import styles from './graph.module.css';

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

/**
 * One point of data along a connector, fading in as it leaves a card and out as it reaches the next.
 * A comet wears its connector's colour (its cause's on a return taken); a point up a feed, the accent
 * of what is live. Both glow.
 */
export function Particle({
  edge,
  clock,
  period,
  phase,
  kind,
  color,
}: {
  edge: Edge;
  clock: MotionValue<number>;
  period: number;
  phase: number;
  kind: 'journey' | 'model';
  color: string;
}) {
  const progress = useTransform(() => (clock.get() / period + phase) % 1);
  const offsetDistance = useTransform(() => `${progress.get() * 100}%`);
  const opacity = useTransform(() => Math.min(1, progress.get() * 7, (1 - progress.get()) * 7));
  return (
    <motion.span
      className={styles.comet}
      data-kind={kind}
      data-edge={edge.id}
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

/** An item's card travelling along the connectors to its new station. */
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
      data-traveller={issue.key}
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
