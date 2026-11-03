import type { Branch } from './layout.ts';

/**
 * The colour of each branch of the graph: a series of a chart, coloured from Primer's display palette
 * (the categorical palette of data visualisation, checked for colour blindness between neighbouring
 * branches). Set in `style`, as the badges' hues are (`ui/badge/hues.ts`): Primer's colour rules for
 * CSS know only the interface's roles. The returns and the feeds stay neutral at rest.
 */
export const BRANCH_COLOR: Readonly<Record<Branch, string>> = {
  line: 'var(--display-blue-borderColor-emphasis)',
  failfirst: 'var(--display-pine-borderColor-emphasis)',
  sabotage: 'var(--display-orange-borderColor-emphasis)',
  invariance: 'var(--display-purple-borderColor-emphasis)',
  documents: 'var(--display-lemon-borderColor-emphasis)',
  diagnostic: 'var(--display-pink-borderColor-emphasis)',
  back: 'var(--fgColor-muted)',
  models: 'var(--fgColor-muted)',
};

/** Why an issue takes a return: a failure, in red (kept for problems), or a request, in yellow. */
export type FlowEvent = 'problem' | 'request';

const EVENT_COLOR: Readonly<Record<FlowEvent, string>> = {
  problem: 'var(--borderColor-danger-emphasis)',
  request: 'var(--borderColor-attention-emphasis)',
};

/** The accent of what is live: the points running up a feed whose model answers. */
export const LIVE_COLOR = 'var(--fgColor-accent)';

/** The colour a mark of a connector wears: its event's while an issue takes it, else its branch's. */
export function markColor(branch: Branch, event?: FlowEvent): string {
  return event ? EVENT_COLOR[event] : BRANCH_COLOR[branch];
}
