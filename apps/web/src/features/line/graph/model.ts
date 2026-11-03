import type {
  AgentActivity,
  Intervention,
  IssueSummary,
  ModelRef,
  Snapshot,
} from '@factory-live/contracts';
import type { BoxId, StationBox } from './layout.ts';

/**
 * The model an agent calls right now: its own while it thinks, its lane's while it drives a CLI lane
 * (Claude Code, OpenCode); none while a tool runs.
 */
export function calledModel(agent: AgentActivity | null): ModelRef | null {
  if (agent?.state === 'thinking') return agent.model;
  if (agent?.state === 'cli') return agent.laneModel ?? agent.model;
  return null;
}

/** An issue as the graph shows it: the box it stands in, the agent on it, what waits for the owner. */
export interface LineIssue {
  issue: IssueSummary;
  box: BoxId;
  /** The agent at work on the issue, if one is. */
  agent: AgentActivity | null;
  /** The open intervention that holds it, if one does. */
  intervention: Intervention | null;
}

/** When an issue reached Terminé: its last change of station, else its last update. */
export const finishedAt = (issue: Pick<IssueSummary, 'stationChangedAt' | 'updatedAt'>): string =>
  issue.stationChangedAt ?? issue.updatedAt;

/** The box of an issue: its station; the gate's proof of its type; Terminé for a stopped issue. */
export function boxOf(issue: Pick<IssueSummary, 'station' | 'lane'>): BoxId {
  switch (issue.station) {
    case 'gate':
      return `gate:${issue.lane ?? 'failfirst'}`;
    case 'stopped':
      return 'done';
    case 'release':
      // A summary from before the delivery stations: the gate's green awaits the owner.
      return 'review';
    case 'side':
      return 'implementation';
    default:
      return issue.station satisfies StationBox;
  }
}

export function lineIssues(
  snapshot: Pick<Snapshot, 'issues' | 'agents' | 'interventions'>,
): LineIssue[] {
  return snapshot.issues.map((issue) => ({
    issue,
    box: boxOf(issue),
    agent:
      snapshot.agents.find((agent) => agent.issueKey === issue.key && agent.state !== 'idle') ??
      null,
    intervention:
      snapshot.interventions.find(
        (intervention) =>
          !intervention.resolvedAt && issue.interventionIds.includes(intervention.id),
      ) ?? null,
  }));
}

/** The stations whose agents call a model: Brief for the coordinators, Implémentation and Diagnostic for the coders. */
export function servedStations(profile: string): StationBox[] {
  if (profile.startsWith('coordinator')) return ['brief'];
  if (profile.startsWith('coder') || profile === 'scribe') return ['implementation', 'diagnostic'];
  return [];
}

/** A provider's model as the agents of the line use it, with who uses it and whether it answers now. */
export interface ProviderRow {
  model: ModelRef;
  /** The model of a CLI lane an agent drives (Claude Code, OpenCode), not the agent's own. */
  lane: boolean;
  agents: string[];
  stations: StationBox[];
  busy: boolean;
}

/** The models behind the agents of the line, one row per provider and model, in the order of the agents. */
export function providerRows(agents: readonly AgentActivity[]): ProviderRow[] {
  const rows = new Map<string, ProviderRow>();
  const add = (agent: AgentActivity, model: ModelRef, lane: boolean, busy: boolean) => {
    const key = `${lane ? 'lane' : 'agent'}|${model.provider ?? ''}|${model.model}`;
    const row = rows.get(key) ?? { model, lane, agents: [], stations: [], busy: false };
    if (!row.agents.includes(agent.profile)) row.agents.push(agent.profile);
    for (const station of servedStations(agent.profile))
      if (!row.stations.includes(station)) row.stations.push(station);
    row.busy ||= busy;
    rows.set(key, row);
  };
  for (const agent of agents) {
    if (servedStations(agent.profile).length === 0) continue;
    // The agent's own model, and the model of the CLI lane it drives (Claude Code, OpenCode).
    if (agent.model) add(agent, agent.model, false, agent.state === 'thinking');
    if (agent.laneModel) add(agent, agent.laneModel, true, agent.state === 'cli');
  }
  return [...rows.values()];
}

/** The stations whose feed from the providers flows: an agent there calls its model right now. */
export function callingStations(
  items: readonly LineIssue[],
): Set<'brief' | 'implementation' | 'diagnostic'> {
  const calling = new Set<'brief' | 'implementation' | 'diagnostic'>();
  for (const item of items) {
    if (!calledModel(item.agent)) continue;
    if (item.box === 'brief' || item.box === 'implementation' || item.box === 'diagnostic')
      calling.add(item.box);
  }
  return calling;
}
