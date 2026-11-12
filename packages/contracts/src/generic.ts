import { z } from 'zod';
import { Timestamp } from './common.ts';
import { CardKind, CardView, IssueStatus, TimelineEntry } from './issues.ts';

/**
 * A workflow the core declares besides the code line and the studio, as the server serves it to its
 * generic screen (#65): its sheet as the core judged it, its items with their cards and runs, and the
 * data it declares for an item or a run, in the core's generic values (workflow-core#36).
 */

/** One value of a declared data, by its generic type, as workflow-core publishes it. */
export const DeclaredValue = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), label: z.string(), text: z.string() }),
  z.object({ type: z.literal('link'), label: z.string(), url: z.string() }),
  z.object({
    type: z.literal('table'),
    label: z.string(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  }),
  z.object({
    type: z.literal('status'),
    label: z.string(),
    status: z.enum(['ok', 'running', 'warning', 'error', 'unknown']),
    text: z.string(),
  }),
]);
export type DeclaredValue = z.infer<typeof DeclaredValue>;

/** A data a workflow declares for an item or a run: its name, its label and its values. */
export const DeclaredData = z.object({
  name: z.string(),
  label: z.string(),
  values: z.array(DeclaredValue),
});
export type DeclaredData = z.infer<typeof DeclaredData>;

export const DeclaredDataList = z.object({ data: z.array(DeclaredData) });
export type DeclaredDataList = z.infer<typeof DeclaredDataList>;

/**
 * A card of a generic workflow: an issue's card, without the code line's own words. It has no kind
 * (the code line's kinds, brief or impl, are not its own: the screen shows none), and its station is a
 * key of its workflow's sheet.
 */
export const GenericCardView = CardView.extend({
  kind: CardKind.nullable(),
  station: z.string(),
});
export type GenericCardView = z.infer<typeof GenericCardView>;

/** An item of a generic workflow: where it stands, its cards and their runs, its life. */
export const GenericItemView = z.object({
  id: z.string(),
  title: z.string(),
  /** The sheet's station the item stands at; `null` while the core does not say. */
  station: z.string().nullable(),
  status: IssueStatus,
  /** When it reached where it stands. */
  since: Timestamp,
  cards: z.array(GenericCardView),
  timeline: z.array(TimelineEntry),
});
export type GenericItemView = z.infer<typeof GenericItemView>;

/** A generic workflow, as its screen reads it. */
export const GenericWorkflowView = z.object({
  name: z.string(),
  /** The sheet the core last served, judged by it; `null` before the first. */
  sheet: z.unknown().nullable(),
  /** Why the core refuses the workflow's sheet, as it says it; `null` when it accepts it. */
  sheetError: z.string().nullable(),
  items: z.array(GenericItemView),
  /** Since when the core does not answer; the last sheet and items stay. */
  unreachableSince: Timestamp.nullable(),
});
export type GenericWorkflowView = z.infer<typeof GenericWorkflowView>;

export const GenericWorkflows = z.object({ workflows: z.array(GenericWorkflowView) });
export type GenericWorkflows = z.infer<typeof GenericWorkflows>;
