import { motion } from 'motion/react';
import { MOVE_TRANSITION } from '../../../../ui/motion.tsx';
import type { Edge, FlowEvent } from '../layout.ts';
import styles from '../graph.module.css';

/**
 * The connectors: a curve that steps back at rest and comes forward in use, with its round port at
 * both ends. In the graph, the curves, their overlays and their ports sit in three layers (curves
 * under the comets, ports over them); a link on its own draws the three at once.
 */

/** A connector at rest: pale, never gone; it follows its boxes when they move. */
export function EdgePath({ edge, color, dash }: { edge: Edge; color: string; dash?: string }) {
  return (
    <motion.path
      className={styles.edge}
      style={{ stroke: color }}
      initial={false}
      animate={{ d: edge.d }}
      transition={MOVE_TRANSITION}
      strokeDasharray={dash}
    />
  );
}

/** A port: the round end of a connector, plugging it into the border of its box. */
export function Port({
  point,
  color,
  active,
}: {
  point: { x: number; y: number };
  color: string;
  active: boolean;
}) {
  return (
    <motion.circle
      r={3.5}
      className={styles.port}
      style={{ stroke: color }}
      data-active={active ? '' : undefined}
      initial={false}
      animate={{ cx: point.x, cy: point.y }}
      transition={MOVE_TRANSITION}
    />
  );
}

/** The kinds of link of a sheet. */
export type LinkVariant = 'line' | 'return' | 'branch' | 'fan';

/** A sample of each kind of link, 160 by 64, as it runs in the graph. */
const SAMPLE: Record<LinkVariant, readonly string[]> = {
  line: ['M 8 32 C 80 32 80 32 152 32'],
  // An arch back over the line, from the right to the left.
  return: ['M 140 60 C 140 -2 20 -2 20 60'],
  // Down from a box, then along to another one, never a corner.
  branch: ['M 12 6 L 12 34 C 12 46 18 52 30 52 L 152 52'],
  // A fan: one port each, never crossing.
  fan: ['M 8 12 C 80 12 80 8 152 8', 'M 8 27 C 80 27 80 32 152 32', 'M 8 42 C 80 42 80 56 152 56'],
};

const ENDS = /^M (-?[\d.]+) (-?[\d.]+).* (-?[\d.]+) (-?[\d.]+)$/;

/**
 * A link on its own: a sample of its kind, at rest or in use. In use, a return says why an item
 * takes it: a failure in red, a request in yellow.
 */
export function Link({
  variant,
  color,
  mark,
  dash,
  active = false,
  cause,
  label,
}: {
  variant: LinkVariant;
  /** Its colour at rest, its series'. */
  color: string;
  /** Its colour in use: its series', or its cause's on a return. */
  mark?: string;
  dash?: string;
  active?: boolean;
  cause?: FlowEvent;
  label: string;
}) {
  const paths = SAMPLE[variant];
  return (
    <svg
      className={styles.linkSample}
      viewBox="0 0 160 64"
      width="160"
      height="64"
      role="img"
      aria-label={label}
      data-link={variant}
      data-active={active ? '' : undefined}
      data-cause={cause}
    >
      {paths.map((d) => (
        <path
          key={d}
          className={styles.edge}
          style={{ stroke: color }}
          d={d}
          strokeDasharray={dash}
        />
      ))}
      {active
        ? paths.map((d) => (
            <path
              key={`over:${d}`}
              className={styles.overlay}
              style={{ stroke: mark ?? color }}
              d={d}
              strokeDasharray={dash}
            />
          ))
        : null}
      {paths.flatMap((d) => {
        const [, x1, y1, x2, y2] = ENDS.exec(d) ?? [];
        return [
          [x1, y1],
          [x2, y2],
        ].map(([x, y], end) => (
          <circle
            key={`${d}:${end}`}
            r={3.5}
            cx={Number(x)}
            cy={Number(y)}
            className={styles.port}
            style={{ stroke: active ? (mark ?? color) : color }}
            data-active={active ? '' : undefined}
          />
        ));
      })}
    </svg>
  );
}

type Preset = Omit<Parameters<typeof Link>[0], 'variant'>;

/** The main line, from a station to the next. */
export const LineLink = (props: Preset) => <Link {...props} variant="line" />;
/** A return, arching back over the line. */
export const ReturnArch = (props: Preset) => <Link {...props} variant="return" />;
/** A branch, off the line and back to it from below. */
export const BranchLink = (props: Preset) => <Link {...props} variant="branch" />;
/** The fan of a group, one curve per member. */
export const FanLink = (props: Preset) => <Link {...props} variant="fan" />;
