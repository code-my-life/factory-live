import { z } from 'zod';

/**
 * The sheet of a workflow: what flows through it, its stations laid on a grid, the links between them
 * and the stations the model providers feed. The workflows' graph is drawn from it alone
 * (`apps/web/src/features/line/graph`): a workflow that changes changes its sheet, not the web app.
 * workflow-core judges a sheet before it serves it (ADR 0006): these types describe its form only, as the
 * core's JSON Schema does (`workflow-core/schema/sheet-response.schema.json`); no rule of a sheet lives here.
 */

/** The reserved key of the model providers' box. */
export const MODELS_KEY = 'models';

/** Who works at a station: an agent calling a model, a script, GitHub, the owner, or the end. */
export const StationKind = z.enum(['ai', 'script', 'github', 'owner', 'end']);
export type StationKind = z.infer<typeof StationKind>;

/** The kind of a link: the line, a return, a branch aside, the fan of a group. */
export const EdgeKind = z.enum(['line', 'return', 'branch', 'fan']);
export type EdgeKind = z.infer<typeof EdgeKind>;

const Key = z.string().min(1);
const Cell = z.number().int().min(0);

export const WorkflowGroup = z.object({ key: Key, label: z.string(), icon: z.string() });
export type WorkflowGroup = z.infer<typeof WorkflowGroup>;

export const WorkflowStation = z.object({
  key: Key,
  label: z.string(),
  /** The name of an Octicon (`issue-opened`, `code`...). */
  icon: z.string(),
  kind: StationKind,
  col: Cell,
  row: Cell,
  group: Key.optional(),
  /** The item types the station handles, written under its name. */
  types: z.array(z.string()).optional(),
});
export type WorkflowStation = z.infer<typeof WorkflowStation>;

export const WorkflowEdge = z.object({
  from: Key,
  to: Key,
  kind: EdgeKind,
  /** The stable id of the link; without it, it follows from `from`, `to` and `kind`. */
  id: Key.optional(),
  /** The fallback label of the link's legend entry. */
  label: z.string().optional(),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdge>;

export const WorkflowSheet = z.object({
  item: z.object({ type: Key, label: z.string() }),
  groups: z.array(WorkflowGroup).optional(),
  stations: z.array(WorkflowStation),
  edges: z.array(WorkflowEdge),
  models: z.array(Key),
});
export type WorkflowSheet = z.infer<typeof WorkflowSheet>;
