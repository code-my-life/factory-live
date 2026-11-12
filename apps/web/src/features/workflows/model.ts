import type {
  CardView,
  IssueStatus,
  IssueSummary,
  TimelineEntry,
  WorkflowSheet,
  WorkflowSheetResult,
} from '@factory-live/contracts';
import type { LineIssue } from '../line/graph/model.ts';
import { pathTo } from '../studio/model.ts';

/**
 * A workflow the core declares besides the code line and the studio (#65), as its generic screen
 * reads it: its sheet, its items with their cards and runs, and the data it declares for each item in
 * generic values (text, link, table, status), the form workflow-core publishes (#36). Nothing here
 * knows one workflow: its sheet draws it.
 */

/** One value of a declared data, as workflow-core publishes it. */
export type DeclaredValue =
  | { type: 'text'; label: string; text: string }
  | { type: 'link'; label: string; url: string }
  | {
      type: 'table';
      label: string;
      columns: string[];
      rows: (string | number | boolean | null)[][];
    }
  | {
      type: 'status';
      label: string;
      status: 'ok' | 'running' | 'warning' | 'error' | 'unknown';
      text: string;
    };

/** A data a workflow declares for an item: its name, its label and its values. */
export interface DeclaredData {
  name: string;
  label: string;
  values: DeclaredValue[];
}

/** An item of a generic workflow: where it stands, its cards and runs, its life and its data. */
export interface GenericItem {
  id: string;
  title: string;
  station: string;
  status: IssueStatus;
  /** When it reached its station (ISO). */
  since: string;
  cards: CardView[];
  timeline: TimelineEntry[];
  data: DeclaredData[];
}

/** A generic workflow, as its screen shows it. */
export interface GenericWorkflow {
  key: string;
  sheet: WorkflowSheetResult;
  items: GenericItem[];
  /** Since when the core does not answer (ms); the last sheet and items stay. */
  unreachableSince: number | null;
}

/** An item as a row of the standard graph: its box is its station, its key its id. */
export function itemIssue(item: GenericItem, sheet: WorkflowSheet, workflow: string): LineIssue {
  const issue: IssueSummary = {
    key: item.id,
    repo: workflow,
    number: 1,
    title: item.title,
    url: '',
    labels: [],
    station: item.station as IssueSummary['station'],
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
    journey: pathTo(sheet, item.station).map((at) => ({
      station: at as IssueSummary['station'],
      lane: null,
      outcome: null,
      at: item.since,
    })),
  };
  return { issue, box: item.station, agent: null, intervention: null };
}
