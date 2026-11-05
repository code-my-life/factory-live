import { parseWorkflowSheet } from '@factory-live/contracts';
import type {
  IssueStatus,
  IssueSummary,
  ModelRef,
  StudioItem,
  StudioItemState,
  WorkflowSheet,
} from '@factory-live/contracts';
import type { LineIssue, ProviderRow } from '../line/graph/model.ts';
import studio from './workflows/studio.json';

/**
 * The studio as the standard graph draws it: its sheet (a copy of `hermes/workflow.json` of
 * video-factory), a video as an item of the graph, an agent of the studio as a provider's row.
 * Nothing here draws or places a station; the sheet does.
 */

/** The studio's sheet, read and checked once; its error, if any, shows instead of the graph. */
export const STUDIO_SHEET = parseWorkflowSheet(studio);

/** An agent of the studio and the station where it calls its model. */
export interface StudioAgent {
  agent: string;
  station: string;
  model: ModelRef;
}

const STATUS: Record<StudioItemState, IssueStatus> = {
  waiting: 'waiting_human',
  running: 'active',
  failed: 'blocked',
  done: 'done',
};

/** The stations of the sheet's line from its first one to `station`: the way a video came. */
export function pathTo(sheet: WorkflowSheet, station: string): string[] {
  const next = (key: string) =>
    sheet.edges.find((edge) => edge.kind === 'line' && edge.from === key)?.to;
  const first = sheet.stations.find(
    (candidate) => !sheet.edges.some((edge) => edge.kind === 'line' && edge.to === candidate.key),
  )?.key;
  const path: string[] = [];
  for (let at = first; at !== undefined && !path.includes(at); at = next(at)) {
    path.push(at);
    if (at === station) return path;
  }
  return [station];
}

/** The station after `station` on the line, if any. */
export function nextStation(sheet: WorkflowSheet, station: string): string | undefined {
  return sheet.edges.find((edge) => edge.kind === 'line' && edge.from === station)?.to;
}

/** Where a « refaire » at `station` sends the video: the target of its return, if it has one. */
export function returnOf(sheet: WorkflowSheet, station: string): string | undefined {
  return sheet.edges.find((edge) => edge.kind === 'return' && edge.from === station)?.to;
}

/** The kind of work at `station`, from the sheet. */
export function kindAt(sheet: WorkflowSheet, station: string) {
  return sheet.stations.find((candidate) => candidate.key === station)?.kind;
}

/** A video that waits for the owner: waiting, at a station of theirs. */
export function waitsForOwner(sheet: WorkflowSheet, item: StudioItem): boolean {
  return item.state === 'waiting' && kindAt(sheet, item.station) === 'owner';
}

/** A video as an item of the graph: its box is its station, its key its id. */
export function videoIssue(item: StudioItem, sheet: WorkflowSheet): LineIssue {
  const issue: IssueSummary = {
    key: item.id,
    repo: 'video-factory',
    number: 1,
    title: item.title,
    url: '',
    labels: [],
    station: item.station as IssueSummary['station'],
    previousStation: null,
    stationChangedAt: item.since,
    status: STATUS[item.state],
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

/** The studio's agents as the providers' rows: one per model, with the agents and stations it serves. */
export function studioProviders(agents: readonly StudioAgent[]): ProviderRow[] {
  const rows = new Map<string, ProviderRow>();
  for (const { agent, station, model } of agents) {
    const key = `${model.provider}|${model.model}`;
    const row = rows.get(key) ?? { model, lane: false, agents: [], stations: [], busy: false };
    if (!row.agents.includes(agent)) row.agents.push(agent);
    if (!row.stations.includes(station)) row.stations.push(station);
    rows.set(key, row);
  }
  return [...rows.values()];
}
