import type {
  ActivityEvent,
  AgentActivity,
  CardView,
  HistoryStats,
  Intervention,
  IssueDetail,
  IssueKey,
  IssueSummary,
  ProfileView,
  RunView,
  ServiceHealth,
  Snapshot,
  TimelineEntry,
  TranscriptEntry,
  TranscriptView,
  UsageReport,
} from '@factory-live/contracts';
import type { UsagePeriod } from '../data/source.ts';

/** Tout l'état du scénario de démonstration ; chaque étape en produit une copie modifiée. */
export interface DemoState {
  snapshot: Snapshot;
  details: Record<IssueKey, IssueDetail>;
  transcripts: Record<number, TranscriptView[]>;
  profiles: ProfileView[];
  usage: Record<UsagePeriod, UsageReport>;
  history: HistoryStats;
}

export const iso = (ms: number): string => new Date(ms).toISOString();

let sequence = 0;
export function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence.toString(36)}`;
}

const ACTIVITY_LIMIT = 80;

function requireIssue(state: DemoState, key: IssueKey): IssueDetail {
  const detail = state.details[key];
  if (!detail) throw new Error(`Issue de démo inconnue : ${key}`);
  return detail;
}

export function patchAgent(state: DemoState, profile: string, patch: Partial<AgentActivity>): void {
  const agent = state.snapshot.agents.find((candidate) => candidate.profile === profile);
  if (!agent) throw new Error(`Profil de démo inconnu : ${profile}`);
  Object.assign(agent, patch);
}

export function pushActivity(state: DemoState, event: Omit<ActivityEvent, 'id'>): void {
  state.snapshot.activity.unshift({ id: nextId('ev'), ...event });
  state.snapshot.activity.length = Math.min(state.snapshot.activity.length, ACTIVITY_LIMIT);
}

export function patchIssue(state: DemoState, key: IssueKey, patch: Partial<IssueSummary>): void {
  const summary = state.snapshot.issues.find((issue) => issue.key === key);
  if (!summary) throw new Error(`Issue de démo inconnue : ${key}`);
  if (patch.station && patch.station !== summary.station) {
    // La liaison franchie s'anime côté écran à partir de ces deux champs.
    summary.previousStation = summary.station;
    summary.stationChangedAt = patch.updatedAt ?? new Date().toISOString();
  }
  Object.assign(summary, patch);
  const detail = requireIssue(state, key);
  detail.issue = { ...summary };
}

export function patchCard(
  state: DemoState,
  key: IssueKey,
  cardId: string,
  patch: Partial<CardView>,
): void {
  const card = requireIssue(state, key).cards.find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Carte de démo inconnue : ${cardId}`);
  Object.assign(card, patch);
}

export function addRun(state: DemoState, key: IssueKey, cardId: string, run: RunView): void {
  const card = requireIssue(state, key).cards.find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Carte de démo inconnue : ${cardId}`);
  card.runs.push(run);
}

export function patchRun(
  state: DemoState,
  key: IssueKey,
  cardId: string,
  runId: number,
  patch: Partial<RunView>,
): void {
  const card = requireIssue(state, key).cards.find((candidate) => candidate.id === cardId);
  const run = card?.runs.find((candidate) => candidate.id === runId);
  if (!run) throw new Error(`Run de démo inconnu : ${runId}`);
  Object.assign(run, patch);
}

export function addTimeline(
  state: DemoState,
  key: IssueKey,
  entry: Omit<TimelineEntry, 'id'>,
): void {
  requireIssue(state, key).timeline.push({ id: nextId('tl'), ...entry });
}

export function addCost(state: DemoState, key: IssueKey, tokens: number, costUsd: number): void {
  const detail = requireIssue(state, key);
  detail.tokens += tokens;
  detail.costUsd = Math.round((detail.costUsd + costUsd) * 100) / 100;
}

export function openIntervention(state: DemoState, intervention: Intervention): void {
  state.snapshot.interventions.unshift(intervention);
  if (intervention.issueKey) {
    const summary = state.snapshot.issues.find((issue) => issue.key === intervention.issueKey);
    if (summary) {
      patchIssue(state, summary.key, {
        interventionIds: [...summary.interventionIds, intervention.id],
      });
    }
  }
}

export function patchIntervention(
  state: DemoState,
  id: string,
  patch: Partial<Intervention>,
): void {
  const intervention = state.snapshot.interventions.find((candidate) => candidate.id === id);
  if (!intervention) return;
  Object.assign(intervention, patch);
}

export function closeIntervention(state: DemoState, id: string): void {
  const intervention = state.snapshot.interventions.find((candidate) => candidate.id === id);
  state.snapshot.interventions = state.snapshot.interventions.filter(
    (candidate) => candidate.id !== id,
  );
  if (intervention?.issueKey) {
    const summary = state.snapshot.issues.find((issue) => issue.key === intervention.issueKey);
    if (summary) {
      patchIssue(state, summary.key, {
        interventionIds: summary.interventionIds.filter((candidate) => candidate !== id),
      });
    }
  }
}

export function appendTranscript(
  state: DemoState,
  runId: number,
  source: TranscriptView['source'],
  entry: Omit<TranscriptEntry, 'id'>,
  terminalLine?: string,
): void {
  const views = state.transcripts[runId];
  const view = views?.find((candidate) => candidate.source === source);
  if (!view) return;
  view.entries.push({ id: nextId('tr'), ...entry });
  if (terminalLine !== undefined) {
    const hermes = views?.find((candidate) => candidate.source === 'hermes');
    hermes?.terminal.push(terminalLine);
  }
}

export function patchHealth(state: DemoState, id: string, patch: Partial<ServiceHealth>): void {
  const service = state.snapshot.health.find((candidate) => candidate.id === id);
  if (service) Object.assign(service, patch);
}
