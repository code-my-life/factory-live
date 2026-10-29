import { msg } from '@factory-live/contracts';
import type {
  ActivityEvent,
  Intervention,
  ProbeReport,
  Snapshot,
  StreamEvent,
} from '@factory-live/contracts';
import { applyHook } from '@factory-live/domain';
import type { Board, Comment, HookEvent, LiveAgent } from '@factory-live/domain';
import { buildHealth } from './health.ts';
import type { HealthSignals } from './health.ts';
import {
  issueOfCards,
  projectAgents,
  projectInterventions,
  projectIssues,
  projectSideCards,
  stationViews,
  toActivityEvent,
} from './projection.ts';
import type { ProjectionInput } from './projection.ts';
import type {
  GitHubReadPort,
  HistoryPort,
  KanbanDelta,
  LoggerPort,
  ProfilesPort,
  RootSettings,
  StationRecord,
  TrackedIssue,
} from './ports.ts';

export interface HubOptions {
  owner: string;
  boardName: string;
  dashboardUrl: string;
  heldAfterSeconds: number;
  keepFinishedMs: number;
}

export interface HubDeps {
  store: HistoryPort;
  profiles: ProfilesPort;
  github: GitHubReadPort | null;
  log: LoggerPort;
  now: () => number;
}

type Slice = 'board' | 'agents' | 'health';
type FullBoard = Board & { comments: Comment[] };

const ACTIVITY_KEPT = 200;
const STALE_AGENT_MS = 20 * 60_000;
const PR_KEYS = ['pr_url', 'published_pr'];

interface ProviderStats {
  lastOkAt: number | null;
  lastErrorAt: number | null;
  rateLimited: number[];
}

/**
 * État en direct de la factory : le kanban (miroir compris), les webhooks, la sonde et GitHub entrent ;
 * le flux SSE et l'instantané sortent. Les tranches ne sont renvoyées que si elles ont changé.
 */
export class Hub {
  private board: FullBoard;
  private live = new Map<string, LiveAgent>();
  private activity: ActivityEvent[];
  private pendingActivity: ActivityEvent[] = [];
  private readonly bootId = Date.now().toString(36);
  private seq = 0;
  private probe: { report: ProbeReport; receivedAt: number } | null = null;
  private lastTickAt: number | null = null;
  private lastHookAt: number | null = null;
  private hookTimes: number[] = [];
  private providers = new Map<string, ProviderStats>();
  private claudeLastSessionAt: number | null = null;
  private kanbanStatus: HealthSignals['kanban'] = {
    state: 'pending',
    cards: 0,
    error: null,
    readAt: null,
  };
  private sessionsStatus: HealthSignals['sessions'] = { error: null };
  private readonly stations: Map<string, StationRecord>;
  private issueOfCard = new Map<string, string>();
  private readonly listeners = new Set<(event: StreamEvent) => void>();
  private readonly lastSent = new Map<Slice, string>();
  private readonly dirty = new Set<Slice>(['board', 'agents', 'health']);
  private interventions: Intervention[] = [];
  private root: RootSettings;
  private factoryProfiles: string[];
  private readonly configModels = new Map<string, { model: string; provider: string } | null>();
  readonly interventionListeners = new Set<(opened: Intervention[], all: Intervention[]) => void>();
  private knownInterventions = new Set<string>();
  private firstBoard = true;

  private readonly options: HubOptions;
  private readonly deps: HubDeps;

  constructor(options: HubOptions, deps: HubDeps) {
    this.options = options;
    this.deps = deps;
    this.board = deps.store.board();
    this.issueOfCard = issueOfCards(this.board);
    this.stations = deps.store.stations();
    this.activity = deps.store.recentActivity(ACTIVITY_KEPT);
    this.root = deps.profiles.root();
    this.factoryProfiles = this.loadProfiles();
  }

  private loadProfiles(): string[] {
    const manifest = Object.keys(this.deps.profiles.manifest().profiles);
    const installed = this.deps.profiles.profiles();
    const profiles = manifest.length > 0 ? manifest : installed;
    for (const profile of profiles)
      this.configModels.set(profile, this.deps.profiles.live(profile)?.model ?? null);
    return profiles;
  }

  /** Relit configs et réglages (appelé de temps en temps : un `hermes config set` change le modèle). */
  reloadConfig(): void {
    this.root = this.deps.profiles.root();
    this.factoryProfiles = this.loadProfiles();
    this.dirty.add('agents').add('board').add('health');
  }

  get profiles(): readonly string[] {
    return this.factoryProfiles;
  }

  get boardData(): FullBoard {
    return this.board;
  }

  get liveAgents(): ReadonlyMap<string, LiveAgent> {
    return this.live;
  }

  get settings(): RootSettings {
    return this.root;
  }

  issueKeyOfCard(cardId: string): string | null {
    return this.issueOfCard.get(cardId) ?? null;
  }

  configModel(profile: string): { model: string; provider: string } | null {
    return this.configModels.get(profile) ?? null;
  }

  // --- Entrées -------------------------------------------------------------------------------

  applyKanban(delta: KanbanDelta, readAt: number): void {
    this.deps.store.mirror(delta);
    const tasks = new Map(this.board.tasks.map((task) => [task.id, task]));
    for (const task of delta.tasks) tasks.set(task.id, task);
    const runs = new Map(this.board.runs.map((run) => [run.id, run]));
    for (const run of delta.runs) runs.set(run.id, run);
    const links = new Map(
      this.board.links.map((link) => [`${link.parentId}>${link.childId}`, link]),
    );
    for (const link of delta.links) links.set(`${link.parentId}>${link.childId}`, link);
    const seenEvents = new Set(this.board.events.map((event) => event.id));
    const seenComments = new Set(this.board.comments.map((comment) => comment.id));
    this.board = {
      tasks: [...tasks.values()],
      runs: [...runs.values()].sort((left, right) => left.id - right.id),
      links: [...links.values()],
      events: [...this.board.events, ...delta.events.filter((event) => !seenEvents.has(event.id))],
      comments: [
        ...this.board.comments,
        ...delta.comments.filter((comment) => !seenComments.has(comment.id)),
      ],
    };
    this.issueOfCard = issueOfCards(this.board);
    this.kanbanStatus = { state: 'read', cards: this.board.tasks.length, error: null, readAt };
    this.trackUnblocks(delta, readAt);
    this.dirty.add('board').add('agents').add('health');
  }

  /** La lecture de `kanban.db` échoue : `error`, le message de l'erreur, tel quel. */
  kanbanFailed(error: string): void {
    this.kanbanStatus = { ...this.kanbanStatus, state: 'failed', error };
    this.dirty.add('health');
  }

  sessionsFailed(error: string | null): void {
    this.sessionsStatus = { error };
    this.dirty.add('health');
  }

  applyHook(event: HookEvent): void {
    const now = this.deps.now();
    this.lastHookAt = now;
    this.hookTimes.push(now);
    if (event.event === 'on_kanban_dispatch_tick') {
      this.lastTickAt = event.at;
      this.dirty.add('health');
      return;
    }
    this.account(event);
    const running = this.board.tasks.filter((task) => task.status === 'running');
    const result = applyHook(this.live, event, running);
    this.live = result.agents;
    const lines = result.lines
      .map((line) => toActivityEvent(line, this.seq++, this.issueOfCard))
      .map((item) => ({ ...item, id: `${this.bootId}-${item.id}` }));
    if (lines.length > 0) {
      this.activity = [...this.activity, ...lines].slice(-ACTIVITY_KEPT);
      this.pendingActivity.push(...lines);
      this.deps.store.appendActivity(lines);
    }
    this.dirty.add('agents');
  }

  private account(event: HookEvent): void {
    const extra = event.extra;
    const provider = typeof extra['provider'] === 'string' ? extra['provider'] : null;
    const model =
      typeof extra['response_model'] === 'string'
        ? extra['response_model']
        : typeof extra['model'] === 'string'
          ? extra['model']
          : null;
    const day = new Date(event.at).toISOString().slice(0, 10);
    if (
      event.event === 'pre_tool_call' &&
      typeof event.toolInput?.['command'] === 'string' &&
      /(?:^|[\s;&|(])claude\s+-p\b/.test(event.toolInput['command'])
    ) {
      this.claudeLastSessionAt = event.at;
      this.dirty.add('health');
    }
    if (!provider || !model) return;
    const stats = this.providers.get(provider) ?? {
      lastOkAt: null,
      lastErrorAt: null,
      rateLimited: [],
    };
    if (event.event === 'post_api_request') {
      const usage = (extra['usage'] ?? {}) as Record<string, unknown>;
      stats.lastOkAt = event.at;
      this.deps.store.addUsage({
        day,
        model,
        provider,
        profile: event.profile,
        calls: 1,
        input: Number(usage['input_tokens'] ?? 0) || 0,
        output: Number(usage['output_tokens'] ?? 0) || 0,
      });
    } else if (event.event === 'api_request_error') {
      const limited = extra['status_code'] === 429;
      stats.lastErrorAt = event.at;
      if (limited) stats.rateLimited.push(event.at);
      this.deps.store.addUsage({
        day,
        model,
        provider,
        profile: event.profile,
        rateLimited: limited ? 1 : 0,
        errors: limited ? 0 : 1,
      });
    } else {
      return;
    }
    this.providers.set(provider, stats);
    this.dirty.add('health');
  }

  applyProbe(report: ProbeReport, receivedAt: number): void {
    this.probe = { report, receivedAt };
    // Plafonds du dispatcher : la sonde les lit dans le config.yaml racine, que le conteneur ne voit pas.
    const settings = report.kanban;
    if (settings) {
      this.root = {
        maxInProgress: settings.max_in_progress ?? this.root.maxInProgress,
        maxInProgressPerProfile:
          settings.max_in_progress_per_profile ?? this.root.maxInProgressPerProfile,
      };
      this.dirty.add('agents').add('board');
    }
    this.dirty.add('health');
  }

  githubChanged(): void {
    this.dirty.add('board').add('health');
  }

  /** Suivi d'un déblocage : la carte repart quand le kanban note `unblocked` après la demande. */
  private trackUnblocks(delta: KanbanDelta, now: number): void {
    const unblocked = delta.events.filter((event) => event.kind === 'unblocked');
    if (unblocked.length === 0) return;
    for (const record of this.deps.store.openUnblocks()) {
      const resumed = unblocked.some(
        (event) =>
          this.issueOfCard.get(event.taskId) === record.issueKey &&
          event.createdAt * 1000 >= record.at - 5_000,
      );
      if (resumed) this.deps.store.updateUnblock(record.interventionId, { state: 'resumed' }, now);
    }
  }

  unblockChanged(): void {
    this.dirty.add('board');
  }

  // --- Sorties -------------------------------------------------------------------------------

  private projectionInput(): ProjectionInput {
    return {
      now: this.deps.now(),
      board: this.board,
      owner: this.options.owner,
      boardName: this.options.boardName,
      dashboardUrl: this.options.dashboardUrl,
      heldAfterSeconds: this.options.heldAfterSeconds,
      profiles: this.factoryProfiles,
      live: this.live,
      issueInfo: (key) => this.deps.github?.issueInfo(key) ?? null,
      pullRequest: (key) => this.deps.github?.pullRequest(key) ?? null,
      unblock: (id) => this.deps.store.unblock(id),
      stations: this.stations,
      configModel: (profile) => this.configModel(profile),
      keepFinishedMs: this.options.keepFinishedMs,
    };
  }

  private healthSlice() {
    const now = this.deps.now();
    this.hookTimes = this.hookTimes.filter((at) => now - at < 60_000);
    const providers = new Map(
      [...this.providers].map(([name, stats]) => {
        stats.rateLimited = stats.rateLimited.filter((at) => now - at < 10 * 60_000);
        return [
          name,
          {
            lastOkAt: stats.lastOkAt,
            lastErrorAt: stats.lastErrorAt,
            rateLimited10m: stats.rateLimited.length,
          },
        ];
      }),
    );
    const github = this.deps.github;
    return buildHealth({
      now,
      probe: this.probe,
      lastTickAt: this.lastTickAt,
      lastHookAt: this.lastHookAt,
      hooksPerMinute: this.hookTimes.length,
      kanban: this.kanbanStatus,
      sessions: this.sessionsStatus,
      github: github
        ? {
            configured: true,
            ...github.status,
            remaining: github.rateLimit?.remaining ?? null,
            limit: github.rateLimit?.limit ?? null,
          }
        : {
            configured: false,
            ok: false,
            detail: msg('health.github.noToken'),
            remaining: null,
            limit: null,
            checkedAt: null,
          },
      webhookDeliveries: github?.lastDelivery ?? null,
      providers,
      claudeLastSessionAt: this.claudeLastSessionAt,
      running: this.board.tasks.filter((task) => task.status === 'running').length,
      maxInProgress: this.root.maxInProgress,
      maxInProgressPerProfile: this.root.maxInProgressPerProfile,
    });
  }

  private boardSlice() {
    const input = this.projectionInput();
    const interventions = projectInterventions(input);
    const issues = projectIssues(input, interventions);
    const now = this.deps.now();
    for (const issue of issues) {
      const memory = this.stations.get(issue.key);
      if (memory?.station === issue.station) continue;
      const record: StationRecord = {
        station: issue.station,
        previous: memory?.station ?? null,
        changedAt: now,
      };
      this.stations.set(issue.key, record);
      this.deps.store.saveStation(issue.key, record);
      issue.previousStation = record.previous as typeof issue.previousStation;
      issue.stationChangedAt = new Date(now).toISOString();
    }
    this.noticeInterventions(interventions);
    return {
      stations: stationViews(this.factoryProfiles),
      issues,
      sideCards: projectSideCards(input),
      interventions,
    };
  }

  private noticeInterventions(interventions: Intervention[]): void {
    this.interventions = interventions;
    const opened = interventions.filter((item) => !this.knownInterventions.has(item.id));
    this.knownInterventions = new Set(interventions.map((item) => item.id));
    if (this.firstBoard) {
      this.firstBoard = false;
      for (const listener of this.interventionListeners) listener(opened, interventions);
      return;
    }
    if (opened.length > 0)
      for (const listener of this.interventionListeners) listener(opened, interventions);
  }

  get openInterventions(): readonly Intervention[] {
    return this.interventions;
  }

  private agentsSlice() {
    const now = this.deps.now();
    const running = new Set(
      this.board.tasks.filter((task) => task.status === 'running').map((task) => task.id),
    );
    for (const [key, agent] of this.live) {
      if (
        now - agent.lastHeartbeatAt > STALE_AGENT_MS &&
        !(agent.cardId && running.has(agent.cardId))
      )
        this.live.delete(key);
    }
    return projectAgents(this.projectionInput(), this.issueOfCard);
  }

  snapshot(): Snapshot {
    const board = this.boardSlice();
    const health = this.healthSlice();
    return {
      generatedAt: new Date(this.deps.now()).toISOString(),
      factory: health.factory,
      stations: board.stations,
      agents: this.agentsSlice(),
      issues: board.issues,
      sideCards: board.sideCards,
      interventions: board.interventions,
      activity: this.activity.slice(-100),
      health: health.health,
    };
  }

  subscribe(listener: (event: StreamEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: StreamEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.deps.log.warn({ component: 'hub', error: String(error) }, 'abonné du flux en erreur');
      }
    }
  }

  /** Envoie ce qui a changé ; appelé par une minuterie (quelques fois par seconde au plus). */
  flush(): void {
    if (this.pendingActivity.length > 0) {
      this.emit({ type: 'activity', events: this.pendingActivity });
      this.pendingActivity = [];
    }
    for (const slice of [...this.dirty]) {
      this.dirty.delete(slice);
      const event: StreamEvent =
        slice === 'board'
          ? { type: 'board', ...this.boardSlice() }
          : slice === 'agents'
            ? { type: 'agents', agents: this.agentsSlice() }
            : { type: 'health', ...this.healthSlice() };
      const serialized = JSON.stringify(event);
      if (this.lastSent.get(slice) === serialized) continue;
      this.lastSent.set(slice, serialized);
      this.emit(event);
    }
  }

  /** Ce qui dépend de l'heure (carte retenue depuis 30 min, dispatcher muet, âges) se recalcule régulièrement. */
  tick(): void {
    this.dirty.add('board').add('agents').add('health');
  }

  /** Issues à suivre sur GitHub : actives souvent, finies une fois (titres de l'historique). */
  trackedIssues(): TrackedIssue[] {
    const input = this.projectionInput();
    const runsByTask = new Map<string, string[]>();
    for (const run of this.board.runs) {
      for (const key of PR_KEYS) {
        const url = run.metadata[key];
        if (typeof url === 'string' && url.startsWith('https://'))
          runsByTask.set(run.taskId, [...(runsByTask.get(run.taskId) ?? []), url]);
      }
    }
    const tracked = new Map<string, TrackedIssue>();
    for (const [card, key] of this.issueOfCard) {
      const urls = runsByTask.get(card) ?? [];
      const known = tracked.get(key);
      tracked.set(key, {
        key,
        prUrl: urls.at(-1) ?? known?.prUrl ?? null,
        active: known?.active ?? false,
      });
    }
    for (const issue of projectIssues({ ...input, keepFinishedMs: 0 }, [])) {
      const entry = tracked.get(issue.key);
      if (entry) entry.active = issue.station !== 'done' && issue.station !== 'stopped';
    }
    return [...tracked.values()];
  }
}
