import { MODELS_KEY } from '@factory-live/contracts';
import type { Branch, FlowEvent } from './layout.ts';

export type { FlowEvent } from './layout.ts';

/**
 * The colour of each branch of the graph: a series of a chart, coloured from Primer's display palette
 * (the categorical palette of data visualisation, checked for colour blindness between neighbouring
 * branches). Set in `style`, as the badges' hues are (`ui/badge/hues.ts`): Primer's colour rules for
 * CSS know only the interface's roles. The line is blue; the members of the groups, then the
 * branches, take the series in order; the returns and the feeds stay neutral at rest.
 */
export const LINE_COLOR = 'var(--display-blue-borderColor-emphasis)';
const SERIES = [
  'var(--display-pine-borderColor-emphasis)',
  'var(--display-orange-borderColor-emphasis)',
  'var(--display-purple-borderColor-emphasis)',
  'var(--display-lemon-borderColor-emphasis)',
  'var(--display-pink-borderColor-emphasis)',
] as const;
export const NEUTRAL_COLOR = 'var(--fgColor-muted)';

/** The series kept neutral: the returns and the feeds from the providers. */
export const BACK: Branch = 'back';

const EVENT_COLOR: Readonly<Record<FlowEvent, string>> = {
  problem: 'var(--borderColor-danger-emphasis)',
  request: 'var(--borderColor-attention-emphasis)',
};

/** The accent of what is live: the points running up a feed whose model answers. */
export const LIVE_COLOR = 'var(--fgColor-accent)';

/** The colours of a graph: each branch's, and the one a mark wears while an item takes it. */
export interface Palette {
  color: (branch: Branch) => string;
  mark: (branch: Branch, event?: FlowEvent) => string;
}

/** The palette of a sheet, from its coloured series (`planOf(sheet).series`). */
export function paletteOf(series: readonly Branch[]): Palette {
  const color = (branch: Branch): string => {
    if (branch === 'line') return LINE_COLOR;
    if (branch === BACK || branch === MODELS_KEY) return NEUTRAL_COLOR;
    const index = series.indexOf(branch);
    return index < 0 ? NEUTRAL_COLOR : (SERIES[index % SERIES.length] as string);
  };
  return { color, mark: (branch, event) => (event ? EVENT_COLOR[event] : color(branch)) };
}
