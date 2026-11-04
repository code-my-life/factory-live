import { WIDGETS } from './status.ts';
import type { WidgetId } from './status.ts';

/**
 * The owner's layout of the acceptance board, the same for every PR: the order of the widgets, those
 * pinned first, those folded. The pinned widgets always come first; the order keeps that true.
 */
export interface BoardLayout {
  /** Every widget once, as it shows: the pinned ones first. */
  order: WidgetId[];
  pinned: WidgetId[];
  collapsed: WidgetId[];
  /** On a wide screen, the widgets that take half the width, side by side. */
  half: WidgetId[];
}

/**
 * Everything visible, in the order the owner listed it; the criteria fold, with their verdict, and so
 * do the twins, visual and heavy like the captures.
 * Every widget takes the full width: two widgets side by side rarely end at the same height (twelve
 * checks beside three test suites), so a half width is the owner's choice, from the widget's menu.
 */
export const DEFAULT_LAYOUT: BoardLayout = {
  order: [...WIDGETS],
  pinned: [],
  collapsed: ['criteria', 'twins'],
  half: [],
};

function isWidget(value: unknown): value is WidgetId {
  return typeof value === 'string' && (WIDGETS as readonly string[]).includes(value);
}

function widgetList(value: unknown): WidgetId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isWidget))];
}

/** Pinned widgets first, each group in its own order. */
function partition(order: readonly WidgetId[], pinned: readonly WidgetId[]): WidgetId[] {
  return [
    ...order.filter((id) => pinned.includes(id)),
    ...order.filter((id) => !pinned.includes(id)),
  ];
}

/**
 * A layout read back from storage, whatever it holds: unknown widgets go, a widget added since then
 * takes its place at the end, a broken value gives the default.
 */
export function normalizeLayout(raw: unknown): BoardLayout {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_LAYOUT;
  const record = raw as Record<string, unknown>;
  const known = widgetList(record['order']);
  const order = [...known, ...WIDGETS.filter((id) => !known.includes(id))];
  const pinned = widgetList(record['pinned']);
  return {
    order: partition(order, pinned),
    pinned: order.filter((id) => pinned.includes(id)),
    collapsed: widgetList(record['collapsed']),
    // A layout saved before widths existed takes the default ones.
    half: 'half' in record ? widgetList(record['half']) : DEFAULT_LAYOUT.half,
  };
}

/** A new order from a drag: a widget cannot cross the pinned ones, so the pinned stay first. */
export function reorder(layout: BoardLayout, order: readonly WidgetId[]): BoardLayout {
  const next = partition(order, layout.pinned);
  return { ...layout, order: next, pinned: next.filter((id) => layout.pinned.includes(id)) };
}

/** Where a widget shows, counted from 1, and how far it can move without leaving its group. */
export function placeOf(
  layout: BoardLayout,
  id: WidgetId,
): { position: number; count: number; canUp: boolean; canDown: boolean } {
  const index = layout.order.indexOf(id);
  const pinned = layout.pinned.includes(id);
  const groupStart = pinned ? 0 : layout.pinned.length;
  const groupEnd = pinned ? layout.pinned.length - 1 : layout.order.length - 1;
  return {
    position: index + 1,
    count: layout.order.length,
    canUp: index > groupStart,
    canDown: index < groupEnd,
  };
}

/** One place up (-1) or down (+1), inside the widget's group; at the edge, nothing moves. */
export function move(layout: BoardLayout, id: WidgetId, delta: -1 | 1): BoardLayout {
  const place = placeOf(layout, id);
  if ((delta < 0 && !place.canUp) || (delta > 0 && !place.canDown)) return layout;
  const order = [...layout.order];
  const index = order.indexOf(id);
  const other = order[index + delta];
  if (other === undefined) return layout;
  order[index + delta] = id;
  order[index] = other;
  return reorder(layout, order);
}

/** Pinned, a widget joins the end of the pinned ones; unpinned, it heads the others. */
export function togglePin(layout: BoardLayout, id: WidgetId): BoardLayout {
  const wasPinned = layout.pinned.includes(id);
  const pinned = wasPinned ? layout.pinned.filter((each) => each !== id) : [...layout.pinned, id];
  const rest = layout.order.filter((each) => !pinned.includes(each) && each !== id);
  const order = wasPinned ? [...pinned, id, ...rest] : [...pinned, ...rest];
  return { ...layout, order, pinned };
}

export function toggleHalf(layout: BoardLayout, id: WidgetId): BoardLayout {
  const half = layout.half.includes(id)
    ? layout.half.filter((each) => each !== id)
    : [...layout.half, id];
  return { ...layout, half };
}

export function toggleCollapsed(layout: BoardLayout, id: WidgetId): BoardLayout {
  const collapsed = layout.collapsed.includes(id)
    ? layout.collapsed.filter((each) => each !== id)
    : [...layout.collapsed, id];
  return { ...layout, collapsed };
}

const STORAGE_KEY = 'factory-live:acceptance-layout';

/** The saved layout of this device; the default when nothing is saved or storage is closed. */
export function loadLayout(): BoardLayout {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeLayout(JSON.parse(raw)) : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(layout: BoardLayout): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage closed (private browsing): the layout holds for this visit.
  }
}
