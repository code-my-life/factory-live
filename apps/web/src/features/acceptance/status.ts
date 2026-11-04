import type { AcceptanceCheck, AcceptanceStatus, AcceptanceView } from '@factory-live/contracts';

/** The widgets of the acceptance board, in the order the owner listed them. */
export const WIDGETS = ['criteria', 'checks', 'tests', 'proofs', 'threads', 'twins'] as const;
export type WidgetId = (typeof WIDGETS)[number];

/**
 * A widget's verdict: OK, NOK, still running; « info » when it has something to see and nothing to
 * judge (the twins, what the PR says it does not prove); « none » when it holds nothing at all.
 */
export type WidgetStatus = AcceptanceStatus | 'info' | 'none';

/** One NOK makes the whole NOK; a run still going holds the verdict; nothing to judge stays « none ». */
export function worst(statuses: readonly AcceptanceStatus[]): WidgetStatus {
  if (statuses.length === 0) return 'none';
  if (statuses.includes('nok')) return 'nok';
  if (statuses.includes('pending')) return 'pending';
  return 'ok';
}

/** A skipped job proves nothing wrong: only a failure is NOK. */
export function checkStatus(check: AcceptanceCheck): AcceptanceStatus {
  if (check.status === 'failure') return 'nok';
  if (check.status === 'pending') return 'pending';
  return 'ok';
}

/** How many elements are OK, NOK, running, and to see (for the owner to judge, counted apart). */
export interface Tally {
  ok: number;
  nok: number;
  pending: number;
  info: number;
}

export function tally(statuses: readonly AcceptanceStatus[], info = 0): Tally {
  const counts: Tally = { ok: 0, nok: 0, pending: 0, info };
  for (const status of statuses) counts[status] += 1;
  return counts;
}

/** What each widget judges, element by element. */
export function widgetStatuses(view: AcceptanceView, id: WidgetId): AcceptanceStatus[] {
  switch (id) {
    case 'criteria':
      return view.criteria.map((criterion) => criterion.status);
    case 'checks':
      return [...view.checks.map(checkStatus), ...(view.gate ? [view.gate.status] : [])];
    case 'tests':
      return view.tests.map((suite) => suite.status);
    case 'proofs':
      // What the PR says it does not prove is to see, not a verdict: counted by `toSee`.
      return view.proofs.flatMap((proof) => (proof.status === 'info' ? [] : [proof.status]));
    case 'threads':
      return view.threads.map((thread) => (thread.resolved ? 'ok' : 'nok'));
    case 'twins':
      return [];
  }
}

/** What a widget gives the owner to judge without a verdict: the points the PR says it does not prove. */
export function toSee(view: AcceptanceView, id: WidgetId): number {
  return id === 'proofs' ? view.proofs.filter((proof) => proof.status === 'info').length : 0;
}

export function widgetTally(view: AcceptanceView, id: WidgetId): Tally {
  return tally(widgetStatuses(view, id), toSee(view, id));
}

export function widgetStatus(view: AcceptanceView, id: WidgetId): WidgetStatus {
  const verdict = worst(widgetStatuses(view, id));
  if (verdict !== 'none') return verdict;
  if (id === 'twins') return view.twins ? 'info' : 'none';
  return toSee(view, id) > 0 ? 'info' : 'none';
}

/** The board's verdict: the worst of its elements. */
export function boardStatus(view: AcceptanceView): WidgetStatus {
  return worst(WIDGETS.flatMap((id) => widgetStatuses(view, id)));
}

/** Every element of the board, counted once: what the header says the owner has to decide. */
export function boardTally(view: AcceptanceView): Tally {
  const counts: Tally = { ok: 0, nok: 0, pending: 0, info: 0 };
  for (const id of WIDGETS) {
    const each = widgetTally(view, id);
    counts.ok += each.ok;
    counts.nok += each.nok;
    counts.pending += each.pending;
    counts.info += each.info;
  }
  return counts;
}
