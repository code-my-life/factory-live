import { msg } from '@factory-live/contracts';
import type {
  CardView,
  HistoryStats,
  IssueDetail,
  ModelRef,
  ProfileLimit,
  ProfileView,
  RunView,
  StationId,
  TimelineEntry,
  TranscriptView,
  UsageReport,
} from '@factory-live/contracts';
import {
  HOOK_TIMEOUT_DEFAULT,
  TERMINAL_TIMEOUT_DEFAULT,
  TOOL_DEADLINE_DEFAULT,
  cardKindOf,
  finishedIssues,
  hookTimeoutsByPlugin,
  gateVerdicts,
  groupByIssue,
  humanResponseMinutes,
  median,
  profileStation,
  runRoleOf,
  stationMinutes,
  timelineOf,
} from '@factory-live/domain';
import type { ProfileFacts, Run, Task } from '@factory-live/domain';
import { configDrift } from './drift.ts';
import type { Hub } from './hub.ts';
import type {
  AgentLogPort,
  CardFilesPort,
  GitHubReadPort,
  HistoryPort,
  ProfilesPort,
  SessionInfo,
  SessionsPort,
} from './ports.ts';
import { iso, projectInterventions, projectIssues } from './projection.ts';

export interface ViewDeps {
  hub: Hub;
  store: HistoryPort;
  sessions: SessionsPort;
  profiles: ProfilesPort;
  github: GitHubReadPort | null;
  files: CardFilesPort;
  /** Hermes agent log: hook timeouts, per guard. */
  agentLog: AgentLogPort | null;
  owner: string;
  boardName: string;
  dashboardUrl: string | null;
  heldAfterSeconds: number;
  now: () => number;
}

const isoSeconds = (seconds: number) => iso(seconds * 1000);

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sessionOf(deps: ViewDeps, run: Run): SessionInfo | null {
  try {
    return deps.sessions.sessionOfRun(run.profile, {
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      workerSessionId: text(run.metadata['worker_session_id']),
    });
  } catch {
    return null;
  }
}

function runModel(
  deps: ViewDeps,
  run: Run,
  task: Task,
  session: SessionInfo | null,
): ModelRef | null {
  if (session) {
    const usage = deps.sessions.modelUsage(run.profile, session.id).at(-1);
    if (usage) return { model: usage.model, provider: usage.provider, source: 'session' };
  }
  if (task.modelOverride)
    return {
      model: task.modelOverride,
      provider: task.providerOverride ?? '?',
      source: 'override',
    };
  const config = deps.hub.configModel(run.profile);
  return config ? { ...config, source: 'config' } : null;
}

function cardStation(task: Task, reviewing: boolean): StationId {
  switch (cardKindOf(task)) {
    case 'brief':
      return 'brief';
    case 'release':
      return 'release';
    case 'watch':
      return 'side';
    default:
      return reviewing ? 'gate' : 'implementation';
  }
}

export function issueDetail(deps: ViewDeps, key: string): IssueDetail | null {
  const board = deps.hub.boardData;
  const tasks = groupByIssue(board).get(key);
  if (!tasks) return null;
  const input = {
    now: deps.now(),
    board,
    owner: deps.owner,
    boardName: deps.boardName,
    dashboardUrl: deps.dashboardUrl,
    heldAfterSeconds: deps.heldAfterSeconds,
    profiles: deps.hub.profiles,
    live: deps.hub.liveAgents,
    issueInfo: (issue: string) => deps.github?.issueInfo(issue) ?? null,
    pullRequest: (issue: string) => deps.github?.pullRequest(issue) ?? null,
    unblock: (id: string) => deps.store.unblock(id),
    stations: deps.store.stations(),
    configModel: (profile: string) => deps.hub.configModel(profile),
    keepFinishedMs: Number.POSITIVE_INFINITY,
    diagnosis: (id: string) => deps.hub.diagnosisOf(id),
    resolved: [],
  };
  const issue = projectIssues(input, projectInterventions(input)).find((item) => item.key === key);
  if (!issue) return null;

  let tokens = 0;
  let cost = 0;
  const parents = new Map<string, string[]>();
  for (const link of board.links)
    parents.set(link.childId, [...(parents.get(link.childId) ?? []), link.parentId]);
  const cards: CardView[] = tasks.map((task) => {
    const events = board.events.filter((event) => event.taskId === task.id);
    const verdicts = deps.hub.verdictsOf(task);
    const runs: RunView[] = board.runs
      .filter((run) => run.taskId === task.id)
      .map((run) => {
        const session = sessionOf(deps, run);
        const runTokens = session ? session.inputTokens + session.outputTokens : null;
        tokens += runTokens ?? 0;
        cost += session?.costUsd ?? 0;
        const claudeModel = text(run.metadata['claude_model']);
        return {
          id: run.id,
          profile: run.profile,
          role: runRoleOf(run, task, events),
          status: run.status,
          outcome: run.outcome,
          startedAt: isoSeconds(run.startedAt),
          endedAt: run.endedAt === null ? null : isoSeconds(run.endedAt),
          model: runModel(deps, run, task, session),
          laneModel: claudeModel
            ? { model: claudeModel, provider: 'anthropic', source: 'session' }
            : null,
          summary: run.summary,
          tokens: runTokens,
          costUsd: session?.costUsd ?? null,
          verdict: verdicts.get(run.id) ?? null,
        };
      });
    const files = new Map<string, number>();
    let testsTotal: number | null = null;
    let testsPassed: number | null = null;
    for (const run of board.runs.filter((item) => item.taskId === task.id)) {
      const changed = run.metadata['changed_files'];
      if (Array.isArray(changed))
        for (const path of changed)
          if (typeof path === 'string') files.set(path, (files.get(path) ?? 0) + 1);
      if (typeof run.metadata['tests_run'] === 'number') testsTotal = run.metadata['tests_run'];
      if (typeof run.metadata['tests_passed'] === 'number')
        testsPassed = run.metadata['tests_passed'];
    }
    const lastBlock = [...events].reverse().find((event) => event.kind === 'blocked');
    const current = runs.at(-1);
    return {
      id: task.id,
      title: task.title,
      kind: cardKindOf(task),
      status: task.status,
      assignee: task.assignee,
      station: cardStation(
        task,
        task.status === 'review' || (task.status === 'running' && current?.role === 'reviewer'),
      ),
      // The type of a past block stays recorded by Hermes: it only counts if the card is blocked.
      blockKind: task.status === 'blocked' ? task.blockKind : null,
      blockReason: task.status === 'blocked' ? text(lastBlock?.payload['reason']) : null,
      parents: parents.get(task.id) ?? [],
      skills: [...task.skills],
      runs,
      changedFiles: [...files].map(([path, edits]) => ({ path, edits })),
      testsPassed,
      testsTotal,
      evidence: (deps.files.evidence(task.id) ?? []).map((file) => ({
        ...file,
        at: isoSeconds(file.at),
      })),
    };
  });

  const ids = tasks.map((task) => task.id);
  const kanban: TimelineEntry[] = timelineOf(
    ids,
    board.events,
    board.comments,
    board.runs,
    new Map(tasks.map((task) => [task.id, task.assignee])),
  ).map((item) => ({ ...item, at: isoSeconds(item.at) }));
  const hooks: TimelineEntry[] = deps.store
    .activityOfCards(ids, { kinds: ['guard', 'skill'], statuses: ['error'] })
    .map((event) => ({
      id: event.id,
      at: event.at,
      source: 'hermes',
      profile: event.profile,
      cardId: event.cardId,
      label: event.label,
      detail: event.detail,
      tone: event.status === 'blocked' || event.status === 'error' ? 'danger' : 'neutral',
    }));
  return {
    issue,
    cards,
    timeline: [...kanban, ...hooks].sort((left, right) => left.at.localeCompare(right.at)),
    tokens,
    costUsd: Math.round(cost * 10_000) / 10_000,
  };
}

/** Transcripts of a run: Hermes session (with card raw log), then Claude Code lane if any. */
export function transcripts(deps: ViewDeps, runId: number): TranscriptView[] | null {
  const board = deps.hub.boardData;
  const run = board.runs.find((item) => item.id === runId);
  const task = run ? board.tasks.find((item) => item.id === run.taskId) : undefined;
  if (!run || !task) return null;
  const session = sessionOf(deps, run);
  const terminal = deps.files.cardLog(task.id) ?? [];
  const views: TranscriptView[] = [
    {
      runId,
      source: 'hermes',
      title: msg('transcript.hermes', { profile: run.profile, session: session?.id ?? null }),
      name: null,
      startedAt: session ? session.startedAt * 1000 : null,
      endedAt: session && session.endedAt !== null ? session.endedAt * 1000 : null,
      costUsd: session?.costUsd ?? null,
      entries: session
        ? deps.sessions
            .transcript(run.profile, session.id)
            .map((entry) => ({ ...entry, at: iso(entry.at) }))
        : [],
      terminal,
    },
  ];
  if (task.workspacePath) {
    const from = run.startedAt * 1000 - 60_000;
    const to = (run.endedAt ?? deps.now() / 1000) * 1000 + 10 * 60_000;
    for (const lane of deps.files.claudeTranscripts(task.workspacePath, from, to)) {
      views.push({
        runId,
        source: 'claude-code',
        title: msg('transcript.claudeCode', { costUsd: lane.costUsd }),
        name: lane.name,
        startedAt: lane.startedAt,
        endedAt: lane.endedAt,
        costUsd: lane.costUsd,
        entries: lane.entries.map((entry) => ({ ...entry, at: iso(entry.at) })),
        terminal: [],
      });
    }
  }
  return views;
}

/** Hermes timeouts that cut agent work: set in its config, or defaults. */
function limitsOf(facts: ProfileFacts | null): ProfileLimit[] {
  if (!facts) return [];
  // A negative or zero value disables the limit in Hermes: nothing set to show.
  const set = (value: number | null) => (value !== null && value > 0 ? value : null);
  return [
    {
      key: 'hook_callback_timeout',
      value: set(facts.hookTimeout),
      defaultValue: HOOK_TIMEOUT_DEFAULT,
      unit: 'seconds',
    },
    {
      key: 'tool_deadline',
      value: set(facts.toolDeadline),
      defaultValue: TOOL_DEADLINE_DEFAULT,
      unit: 'seconds',
    },
    {
      key: 'terminal_timeout',
      value: set(facts.terminalTimeout),
      defaultValue: TERMINAL_TIMEOUT_DEFAULT,
      unit: 'seconds',
    },
    { key: 'max_turns', value: set(facts.maxTurns), defaultValue: null, unit: 'turns' },
  ];
}

export function profileViews(deps: ViewDeps, periodDays = 30): ProfileView[] {
  const manifest = deps.profiles.manifest();
  const board = deps.hub.boardData;
  const since = deps.now() / 1000 - periodDays * 86_400;
  const verdicts = gateVerdicts(board, since);
  // Guard refusals, per agent: coder-guard doesn't refuse the same thing to coder and to scribe.
  const refusals = new Map<string, number>();
  for (const event of deps.store.activityOfKinds(['guard'], 5_000)) {
    // A guard refusal is the plugin message as-is: "coder-guard: missing PR...".
    if (typeof event.detail !== 'string') continue;
    const plugin = /^([\w-]+)\s*:/.exec(event.detail)?.[1];
    const key = `${event.profile}|${plugin ?? ''}`;
    if (plugin) refusals.set(key, (refusals.get(key) ?? 0) + 1);
  }
  return deps.hub.profiles.map((name) => {
    const live = deps.profiles.live(name);
    const repo = deps.profiles.repo(name);
    const runs = board.runs.filter(
      (run) => run.profile === name && run.endedAt !== null && run.startedAt >= since,
    );
    const passes = verdicts.filter((verdict) => verdict.implementer === name);
    const chain = live ? [...(live.model ? [live.model] : []), ...live.fallbacks] : [];
    const facts = safeFacts(deps, name);
    const timeouts = facts
      ? hookTimeoutsByPlugin(safeLogs(deps, name, since, deps.now() / 1000), facts)
      : new Map<string, number>();
    return {
      name,
      role: (manifest.profiles[name]?.skills ?? []).join(', ') || msg('agent.role.default'),
      station: profileStation(name),
      modelChain: chain.map((link) => ({ ...link, source: 'config' as const })),
      effort: live?.effort ?? null,
      toolsets: live?.toolsets ?? [],
      skills: manifest.profiles[name]?.skills ?? [],
      plugins: (live?.plugins ?? []).map((plugin) => ({
        name: plugin,
        refusals: refusals.get(`${name}|${plugin}`) ?? 0,
        timeouts: timeouts.get(plugin) ?? 0,
        longestSeconds: facts?.longestCommands?.[plugin] ?? null,
      })),
      limits: limitsOf(facts),
      mcp: live?.mcp ?? [],
      drift: live && repo ? configDrift(live, repo, manifest.profiles[name]?.plugins ?? null) : [],
      stats: {
        runs: runs.length,
        gatePassRate: passes.length
          ? passes.filter((verdict) => verdict.passed).length / passes.length
          : null,
        medianRunMinutes: median(runs.map((run) => ((run.endedAt as number) - run.startedAt) / 60)),
        costUsd: null,
      },
    };
  });
}

export function usageReport(deps: ViewDeps, periodDays: number): UsageReport {
  const since = new Date(deps.now() - periodDays * 86_400_000).toISOString().slice(0, 10);
  const observed = deps.store.usageSince(since);
  const models = new Map<string, UsageReport['models'][number]>();
  const byProfile = new Map<string, number>();
  const daily = new Map<string, { tokens: number; rateLimited: number }>();
  const add = (
    model: string,
    provider: string,
    patch: {
      calls: number;
      input: number;
      output: number;
      rateLimited: number;
      errors: number;
      cost: number | null;
    },
  ) => {
    const key = `${provider}/${model}`;
    const known = models.get(key) ?? {
      model,
      provider,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: null,
      rateLimited: 0,
      errors: 0,
    };
    known.calls += patch.calls;
    known.inputTokens += patch.input;
    known.outputTokens += patch.output;
    known.rateLimited += patch.rateLimited;
    known.errors += patch.errors;
    if (patch.cost !== null) known.costUsd = (known.costUsd ?? 0) + patch.cost;
    models.set(key, known);
  };
  for (const row of observed) {
    add(row.model, row.provider, {
      calls: row.calls,
      input: row.input,
      output: row.output,
      rateLimited: row.rateLimited,
      errors: row.errors,
      cost: null,
    });
    byProfile.set(row.profile, (byProfile.get(row.profile) ?? 0) + row.input + row.output);
    const day = daily.get(row.day) ?? { tokens: 0, rateLimited: 0 };
    day.tokens += row.input + row.output;
    day.rateLimited += row.rateLimited;
    daily.set(row.day, day);
  }
  if (observed.length === 0) {
    // Before webhooks: usage recorded by Hermes in sessions (model as it sees it, often "auto").
    for (const profile of deps.hub.profiles) {
      for (const row of safeUsage(deps, profile, deps.now() / 1000 - periodDays * 86_400)) {
        add(row.model, row.provider, {
          calls: row.calls,
          input: row.inputTokens,
          output: row.outputTokens,
          rateLimited: 0,
          errors: 0,
          cost: row.costUsd,
        });
        byProfile.set(profile, (byProfile.get(profile) ?? 0) + row.inputTokens + row.outputTokens);
        const day = daily.get(row.day) ?? { tokens: 0, rateLimited: 0 };
        day.tokens += row.inputTokens + row.outputTokens;
        daily.set(row.day, day);
      }
    }
  }
  return {
    periodDays,
    models: [...models.values()].sort(
      (left, right) =>
        right.inputTokens + right.outputTokens - (left.inputTokens + left.outputTokens),
    ),
    byProfile: [...byProfile]
      .map(([profile, tokens]) => ({ profile, tokens }))
      .sort((left, right) => right.tokens - left.tokens),
    daily: [...daily]
      .map(([day, value]) => ({ day, ...value }))
      .sort((left, right) => left.day.localeCompare(right.day)),
    claudeSubscriptionNote: msg('usage.claudeNote'),
  };
}

function safeFacts(deps: ViewDeps, profile: string): ProfileFacts | null {
  try {
    return deps.profiles.facts(profile);
  } catch {
    return null;
  }
}

function safeLogs(deps: ViewDeps, profile: string, from: number, to: number) {
  try {
    return deps.agentLog?.facts(profile, from, to) ?? [];
  } catch {
    return [];
  }
}

function safeUsage(deps: ViewDeps, profile: string, since: number) {
  try {
    return deps.sessions.usageSince(profile, since);
  } catch {
    return [];
  }
}

export function historyStats(deps: ViewDeps, periodDays: number): HistoryStats {
  const board = deps.hub.boardData;
  const since = deps.now() / 1000 - periodDays * 86_400;
  const finished = finishedIssues(board, since);
  const stations = stationMinutes(board, since);
  const verdicts = gateVerdicts(board, since);
  const groups = new Map<
    string,
    { harness: string; model: string | null; runs: number; passed: number }
  >();
  for (const verdict of verdicts) {
    // Without a Claude lane, the model is the agent's: `null`, which the client names.
    const model = verdict.claudeModel;
    const key = `${verdict.harness}|${model ?? ''}`;
    const group = groups.get(key) ?? { harness: verdict.harness, model, runs: 0, passed: 0 };
    group.runs += 1;
    if (verdict.passed) group.passed += 1;
    groups.set(key, group);
  }
  const human = humanResponseMinutes(board, since);
  return {
    periodDays,
    issuesDone: finished.filter((issue) => issue.outcome === 'merged').length,
    medianLeadTimeMinutes: median(finished.map((issue) => issue.leadTimeMinutes)),
    stationMinutes: [...stations].map(([station, values]) => ({
      station,
      medianMinutes: median(values) ?? 0,
    })),
    gatePassRate: [...groups.values()].map((group) => ({
      harness: group.harness,
      model: group.model,
      runs: group.runs,
      rate: group.passed / group.runs,
    })),
    blocks: human.blocks,
    medianHumanResponseMinutes: median(human.responses),
    recent: finished.slice(0, 20).map((issue) => ({
      key: issue.key,
      title: deps.github?.issueInfo(issue.key)?.title ?? issue.key,
      outcome: issue.outcome,
      leadTimeMinutes: issue.leadTimeMinutes,
      finishedAt: isoSeconds(issue.finishedAt),
      version: null,
    })),
  };
}
