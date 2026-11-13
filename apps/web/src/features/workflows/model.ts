import type {
  GenericItemView,
  IssueSummary,
  WorkflowSheet,
  WorkflowSheetResult,
} from '@factory-live/contracts';
import type { LineIssue } from '../line/graph/model.ts';
import { pathTo } from '../studio/model.ts';

export type { DeclaredData, DeclaredValue } from '@factory-live/contracts';

/**
 * A workflow the core declares besides the code line and the studio (#65), as its generic screen
 * shows it: its sheet, its items with their cards and runs. The data it declares for an item or a
 * run is read on demand (`WorkflowsSource.data`). Nothing here knows one workflow: its sheet draws it.
 */

export type GenericItem = GenericItemView;

/** A generic workflow, as its screen shows it. */
export interface GenericWorkflow {
  key: string;
  /** The sheet the core judged, or why it refuses it (or why this screen cannot read it). */
  sheet: WorkflowSheetResult;
  items: GenericItem[];
  /** Since when the core does not answer (ms); the last sheet and items stay. */
  unreachableSince: number | null;
}

/** Whether an item stands at a station of the sheet: only those are drawn on the graph. */
export function placed(item: GenericItem, sheet: WorkflowSheet): boolean {
  return item.station !== null && sheet.stations.some((station) => station.key === item.station);
}

/** An item as a row of the standard graph: its box is its station, its key its id. */
export function itemIssue(item: GenericItem, sheet: WorkflowSheet, workflow: string): LineIssue {
  const station = item.station ?? '';
  const issue: IssueSummary = {
    key: item.id,
    repo: workflow,
    number: 1,
    title: item.title,
    url: '',
    labels: [],
    station: station as IssueSummary['station'],
    previousStation: null,
    stationChangedAt: item.since,
    status: item.status,
    claudeModel: null,
    harness: null,
    pr: null,
    prUrl: null,
    activeProfiles: [],
    interventionIds: [],
    startedAt: item.since,
    updatedAt: item.since,
    type: null,
    lane: null,
    journey: pathTo(sheet, station).map((at) => ({
      station: at as IssueSummary['station'],
      lane: null,
      outcome: null,
      at: item.since,
    })),
  };
  return { issue, box: station, agent: null, intervention: null };
}
