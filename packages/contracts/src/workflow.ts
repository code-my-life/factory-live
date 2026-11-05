import { z } from 'zod';

/**
 * The sheet of a workflow: what flows through it, its stations laid on a grid, the links between them
 * and the stations the model providers feed. The workflows' graph is drawn from it alone
 * (`apps/web/src/features/line/graph`): a workflow that changes changes its sheet, not the web app.
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

export type WorkflowSheetResult = { ok: true; sheet: WorkflowSheet } | { ok: false; error: string };

/** What is wrong with a well-formed sheet, or `null`: the first broken rule, named. */
function sheetError(sheet: WorkflowSheet): string | null {
  const groups = new Map<string, WorkflowGroup>();
  for (const group of sheet.groups ?? []) {
    if (group.key === MODELS_KEY)
      return `group key "${MODELS_KEY}" is reserved for the model providers`;
    if (groups.has(group.key)) return `duplicate group "${group.key}"`;
    groups.set(group.key, group);
  }
  const stations = new Map<string, WorkflowStation>();
  const cells = new Map<string, string>();
  for (const station of sheet.stations) {
    if (station.key === MODELS_KEY)
      return `station key "${MODELS_KEY}" is reserved for the model providers`;
    if (stations.has(station.key)) return `duplicate station "${station.key}"`;
    if (groups.has(station.key)) return `station "${station.key}" has the key of a group`;
    stations.set(station.key, station);
    const cell = `${station.col},${station.row}`;
    const taken = cells.get(cell);
    if (taken !== undefined)
      return `stations "${taken}" and "${station.key}" share the cell col ${station.col}, row ${station.row}`;
    cells.set(cell, station.key);
    if (station.group !== undefined && !groups.has(station.group))
      return `station "${station.key}" names an unknown group "${station.group}"`;
  }
  for (const group of groups.values()) {
    const kinds = new Set(
      sheet.stations.filter((station) => station.group === group.key).map(({ kind }) => kind),
    );
    if (kinds.size === 0) return `group "${group.key}" has no station`;
    if (kinds.size > 1) return `the stations of group "${group.key}" are not of one kind`;
  }
  const known = (key: string) => stations.has(key) || groups.has(key);
  for (const edge of sheet.edges) {
    const name = edge.id ?? `${edge.kind} ${edge.from} -> ${edge.to}`;
    if (!known(edge.from)) return `edge "${name}" leaves an unknown station "${edge.from}"`;
    if (!known(edge.to)) return `edge "${name}" reaches an unknown station "${edge.to}"`;
  }
  for (const key of sheet.models)
    if (!stations.has(key)) return `models names an unknown station "${key}"`;
  return null;
}

/**
 * Reads a workflow sheet without ever throwing: the valid sheet, or why it is refused (the station,
 * link or cell at fault). The screen that shows the message wraps it in a translated text.
 */
export function parseWorkflowSheet(input: unknown): WorkflowSheetResult {
  try {
    const parsed = WorkflowSheet.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.join('.') ?? '';
      return {
        ok: false,
        error: `${path === '' ? 'sheet' : path}: ${issue?.message ?? 'invalid'}`,
      };
    }
    const error = sheetError(parsed.data);
    return error === null ? { ok: true, sheet: parsed.data } : { ok: false, error };
  } catch (cause) {
    // A getter that throws on a hostile input: still an answer, never an exception.
    return { ok: false, error: cause instanceof Error ? cause.message : 'invalid sheet' };
  }
}
