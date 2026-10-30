import type {
  ActivityEvent,
  AgentActivity,
  AgentState,
  Diagnosis,
  Intervention,
  IssueLabel,
  IssueSummary,
  ModelRef,
  PullRequestView,
  SideCard,
  StationId,
  StationView,
} from '@factory-live/contracts';
import {
  cardKindOf,
  groupByIssue,
  interventionsOf,
  issueStationOf,
  issueStatusOf,
  profileStation,
  pullRequestUrl,
  runRoleOf,
} from '@factory-live/domain';
import type {
  ActivityLine,
  Board,
  Comment,
  Intervention as FoundIntervention,
  LiveAgent,
  Run,
  Task,
} from '@factory-live/domain';
import type { UnblockRecord } from './ports.ts';

export interface IssueInfoView {
  title: string;
  url: string;
  labels: IssueLabel[];
}

export interface StationMemory {
  station: string;
  previous: string | null;
  /** Millisecondes epoch. */
  changedAt: number;
}

/** Une intervention fermée depuis peu parce que sa carte est repartie : gardée pour suivre la reprise. */
export interface ResolvedIntervention {
  intervention: FoundIntervention;
  /** Millisecondes epoch. */
  resolvedAt: number;
  followUp: Intervention['followUp'];
}

export interface ProjectionInput {
  /** Millisecondes epoch. */
  now: number;
  board: Board & { comments: readonly Comment[] };
  owner: string;
  boardName: string;
  dashboardUrl: string | null;
  heldAfterSeconds: number;
  /** Profils de la factory (factory.yaml), dans l'ordre d'affichage. */
  profiles: readonly string[];
  live: ReadonlyMap<string, LiveAgent>;
  issueInfo: (key: string) => IssueInfoView | null;
  pullRequest: (key: string) => PullRequestView | null;
  unblock: (interventionId: string) => UnblockRecord | null;
  stations: ReadonlyMap<string, StationMemory>;
  configModel: (profile: string) => { model: string; provider: string } | null;
  /** Issues finies depuis moins longtemps restent sur la ligne (station Terminé). */
  keepFinishedMs: number;
  /** Le diagnostic en cache d'une intervention (jamais calculé pendant la projection). */
  diagnosis: (interventionId: string) => Diagnosis | null;
  resolved: readonly ResolvedIntervention[];
}

/** Les stations de la ligne, dans l'ordre ; le client les nomme dans sa langue. */
const LINE_STATIONS: readonly StationId[] = [
  'intake',
  'brief',
  'implementation',
  'gate',
  'release',
  'done',
];

export const iso = (ms: number): string => new Date(ms).toISOString();
const isoSeconds = (seconds: number): string => iso(seconds * 1000);

function splitKey(key: string): { repo: string; number: number } {
  const [repo = '', number = '0'] = key.split('#');
  return { repo, number: Number(number) };
}

/** Titre de secours sans GitHub : celui de la carte brief, sans son préfixe `brief <clé> :`. */
function fallbackTitle(key: string, tasks: readonly Task[]): string {
  const brief = tasks.find((task) => cardKindOf(task) === 'brief') ?? tasks[0];
  if (!brief) return key;
  const [, rest] = brief.title.split(/\s:\s/, 2);
  return rest?.trim() || brief.title;
}

function latestImplementerRun(tasks: readonly Task[], board: Board): Run | null {
  const ids = new Set(tasks.filter((task) => cardKindOf(task) === 'impl').map((task) => task.id));
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const runs = board.runs
    .filter((run) => ids.has(run.taskId))
    .sort((left, right) => right.id - left.id);
  return (
    runs.find((run) => {
      const task = byId.get(run.taskId);
      return task ? runRoleOf(run, task, board.events) === 'implementer' : false;
    }) ?? null
  );
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function stationViews(profiles: readonly string[]): StationView[] {
  return LINE_STATIONS.map((id) => ({
    id,
    profiles: profiles.filter((profile) => profileStation(profile) === id),
  }));
}

/** Ce qui attend Clément d'après le kanban, tel que le domaine le trouve (secondes epoch). */
export function foundInterventions(input: ProjectionInput): FoundIntervention[] {
  return interventionsOf(input.board, {
    now: Math.floor(input.now / 1000),
    board: input.boardName,
    owner: input.owner,
    dashboardUrl: input.dashboardUrl,
    heldAfterSeconds: input.heldAfterSeconds,
  });
}

function interventionView(
  input: ProjectionInput,
  found: FoundIntervention,
  resolved: ResolvedIntervention | null,
): Intervention {
  const { eventId, ...rest } = found;
  const unblock = input.unblock(found.id);
  return {
    ...rest,
    openedAt: isoSeconds(found.openedAt),
    unblock:
      unblock && unblock.state !== 'failed'
        ? {
            state: unblock.state,
            text: unblock.text,
            commentUrl: unblock.commentUrl,
            at: iso(unblock.updatedAt),
          }
        : null,
    diagnosis: input.diagnosis(found.id),
    resolvedAt: resolved ? iso(resolved.resolvedAt) : null,
    followUp: resolved?.followUp ?? null,
  };
}

/** Les interventions ouvertes, puis celles qui viennent de se fermer (`resolvedAt`). */
export function projectInterventions(
  input: ProjectionInput,
  found: readonly FoundIntervention[] = foundInterventions(input),
): Intervention[] {
  return [
    ...found.map((item) => interventionView(input, item, null)),
    ...input.resolved.map((entry) => interventionView(input, entry.intervention, entry)),
  ];
}

export function projectIssues(
  input: ProjectionInput,
  interventions: readonly Intervention[],
): IssueSummary[] {
  const summaries: IssueSummary[] = [];
  for (const [key, tasks] of groupByIssue(input.board)) {
    const station = issueStationOf(tasks, input.board);
    const ids = new Set(tasks.map((task) => task.id));
    const updated = Math.max(
      ...tasks.map((task) =>
        Math.max(
          task.createdAt,
          task.startedAt ?? 0,
          task.completedAt ?? 0,
          task.lastHeartbeatAt ?? 0,
        ),
      ),
      ...input.board.events
        .filter((event) => ids.has(event.taskId))
        .map((event) => event.createdAt),
    );
    if (
      (station === 'done' || station === 'stopped') &&
      input.now - updated * 1000 > input.keepFinishedMs
    )
      continue;
    const { repo, number } = splitKey(key);
    const info = input.issueInfo(key);
    const open = interventions.filter((item) => item.issueKey === key && !item.resolvedAt);
    const implementer = latestImplementerRun(tasks, input.board);
    const labels = info?.labels ?? [];
    const memory = input.stations.get(key);
    summaries.push({
      key,
      repo,
      number,
      title: info?.title ?? fallbackTitle(key, tasks),
      url: info?.url ?? `https://github.com/${input.owner}/${repo}/issues/${number}`,
      labels,
      station,
      previousStation:
        (memory?.station === station ? (memory.previous as StationId | null) : null) ?? null,
      stationChangedAt: memory?.station === station ? iso(memory.changedAt) : null,
      status: issueStatusOf(tasks, station, open.length),
      claudeModel:
        text(implementer?.metadata['claude_model']) ??
        labels.find((label) => label.name.startsWith('claude:'))?.name.slice('claude:'.length) ??
        null,
      harness:
        text(implementer?.metadata['harness'])?.split(' (')[0] ?? implementer?.profile ?? null,
      pr: input.pullRequest(key),
      prUrl: pullRequestUrl(tasks, input.board),
      activeProfiles: [
        ...new Set(
          tasks
            .filter((task) => task.status === 'running' && task.assignee)
            .map((task) => task.assignee as string),
        ),
      ],
      interventionIds: open.map((item) => item.id),
      startedAt: isoSeconds(Math.min(...tasks.map((task) => task.createdAt))),
      updatedAt: isoSeconds(updated),
    });
  }
  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function projectSideCards(input: ProjectionInput): SideCard[] {
  const inIssue = new Set([...groupByIssue(input.board).values()].flat().map((task) => task.id));
  const lastBlock = new Map<string, string>();
  for (const event of input.board.events) {
    if (event.kind === 'blocked') lastBlock.set(event.taskId, text(event.payload['reason']) ?? '');
  }
  return input.board.tasks
    .filter((task) => !inIssue.has(task.id) && task.status !== 'done' && task.status !== 'archived')
    .map((task) => ({
      id: task.id,
      title: task.title,
      kind: cardKindOf(task),
      status: task.status,
      assignee: task.assignee,
      openedAt: isoSeconds(task.createdAt),
      note: task.status === 'blocked' ? lastBlock.get(task.id) || null : null,
    }))
    .sort((left, right) => right.openedAt.localeCompare(left.openedAt));
}

function liveModel(
  model: { model: string; provider: string } | null,
  source: ModelRef['source'],
): ModelRef | null {
  return model ? { model: model.model, provider: model.provider, source } : null;
}

/** Un profil par ligne : son worker en direct, sinon sa carte en cours d'après le kanban, sinon sa file, sinon le repos. */
export function projectAgents(
  input: ProjectionInput,
  issueOfCard: ReadonlyMap<string, string>,
): AgentActivity[] {
  const liveByProfile = new Map<string, LiveAgent>();
  for (const agent of input.live.values()) {
    const known = liveByProfile.get(agent.profile);
    if (!known || agent.lastHeartbeatAt > known.lastHeartbeatAt)
      liveByProfile.set(agent.profile, agent);
  }
  const runs = new Map(input.board.runs.map((run) => [run.id, run]));
  return input.profiles.map((profile) => {
    const station: StationId = profileStation(profile);
    const live = liveByProfile.get(profile);
    const base = { profile, station, laneModel: null, action: null };
    if (live) {
      return {
        ...base,
        state: live.state as AgentState,
        cardId: live.cardId,
        issueKey: live.cardId ? (issueOfCard.get(live.cardId) ?? null) : null,
        model: liveModel(live.model, 'live') ?? liveModel(input.configModel(profile), 'config'),
        laneModel: liveModel(live.laneModel, 'live'),
        action: live.action ? { ...live.action, startedAt: iso(live.action.startedAt) } : null,
        runStartedAt: live.runStartedAt === null ? null : iso(live.runStartedAt),
        lastHeartbeatAt: iso(live.lastHeartbeatAt),
      };
    }
    const running = input.board.tasks.find(
      (task) => task.status === 'running' && task.assignee === profile,
    );
    const queued = input.board.tasks.find(
      (task) => task.status === 'ready' && task.assignee === profile,
    );
    const task = running ?? queued;
    const run = running?.currentRunId ? runs.get(running.currentRunId) : undefined;
    const override = task?.modelOverride
      ? {
          model: task.modelOverride,
          provider: task.providerOverride ?? input.configModel(profile)?.provider ?? '?',
        }
      : null;
    return {
      ...base,
      state: running ? 'thinking' : queued ? 'queued' : 'idle',
      cardId: task?.id ?? null,
      issueKey: task ? (issueOfCard.get(task.id) ?? null) : null,
      model: liveModel(override, 'override') ?? liveModel(input.configModel(profile), 'config'),
      runStartedAt: run ? isoSeconds(run.startedAt) : null,
      lastHeartbeatAt: running?.lastHeartbeatAt ? isoSeconds(running.lastHeartbeatAt) : null,
    };
  });
}

/** Ligne du domaine vers l'événement du fil : identifiant de séquence, issue retrouvée par la carte. */
export function toActivityEvent(
  line: ActivityLine,
  seq: number,
  issueOfCard: ReadonlyMap<string, string>,
): ActivityEvent {
  return {
    id: `a${seq}`,
    at: iso(line.at),
    kind: line.kind,
    profile: line.profile,
    issueKey: line.cardId ? (issueOfCard.get(line.cardId) ?? null) : null,
    cardId: line.cardId,
    label: line.label,
    detail: line.detail,
    status: line.status,
    durationMs: line.durationMs === null ? null : Math.max(0, Math.round(line.durationMs)),
    model: line.model,
  };
}

export function issueOfCards(board: Board): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, tasks] of groupByIssue(board)) for (const task of tasks) map.set(task.id, key);
  return map;
}
