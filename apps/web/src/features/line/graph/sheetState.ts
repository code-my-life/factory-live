import { WorkflowSheet } from '@factory-live/contracts';

/**
 * A workflow's sheet as a screen holds it: the sheet workflow-core served, or why the core refuses it
 * (shown in a banner instead of the graph). The core judges a sheet; nothing here judges it again (#72).
 */
export type SheetState = { ok: true; sheet: WorkflowSheet } | { ok: false; error: string };

/**
 * The state of a sheet a server sends: the core's refusal as it says it, else the sheet, its form checked by
 * the contract's schema (a sheet of a wrong form says where, rather than breaking the page).
 */
export function sheetStateOf(sheet: unknown, refusal: string | null): SheetState {
  if (refusal !== null) return { ok: false, error: refusal };
  const parsed = WorkflowSheet.safeParse(sheet);
  if (parsed.success) return { ok: true, sheet: parsed.data };
  const issue = parsed.error.issues[0];
  const path = issue?.path.join('.') ?? '';
  return { ok: false, error: `${path === '' ? 'sheet' : path}: ${issue?.message ?? 'invalid'}` };
}
