import { msg } from '@factory-live/contracts';
import type {
  ActivityEvent,
  AppAddresses,
  Diagnosis,
  Intervention,
  ProbeReport,
  RunVerdict,
  Snapshot,
  StreamEvent,
} from '@factory-live/contracts';
import { applyHook, branchOf, guardRisks } from '@factory-live/domain';
import type {
  Board,
  Comment,
  Intervention as FoundIntervention,
  GuardRisk,
  HookEvent,
  LiveAgent,
  ProfileFacts,
  Task,
} from '@factory-live/domain';
import { DIAGNOSED } from './diagnosis.ts';
import type { DiagnosisService } from './diagnosis.ts';
import { buildHealth } from './health.ts';
import type { HealthSignals } from './health.ts';
import {
  coreActivityEvent,
  coreIntervention,
  foundInterventions,
  issueOfCards,
  projectAgents,
  projectCoreAgents,
  projectInterventions,
  projectIssues,
  projectSideCards,
  stationViews,
  toActivityEvent,
} from './projection.ts';
import type { ProjectionInput, ResolvedIntervention } from './projection.ts';
import type {
  CoreActivityFact,
  CoreInterventionState,
  CoreAgentState,
  CoreCheckState,
  CoreMachineState,
  GitHubReadPort,
  HistoryPort,
  KanbanDelta,
  LoggerPort,
  ProfilesPort,
  PublishedSheet,
  RootSettings,
  StationRecord,
  TrackedIssue,
  WorkflowView,
} from './ports.ts';

export interface HubOptions {
  owner: string;
  boardName: string;
  /** Dashboard d'Hermès (lien des interventions) ; `null` : pas de lien. */
  dashboardUrl: string | null;
  /** Où ouvrir l'app, d'après la configuration (Réglages). */
  addresses: AppAddresses;
  heldAfterSeconds: number;
  keepFinishedMs: number;
}

export interface HubDeps {
  store: HistoryPort;
  profiles: ProfilesPort;
  github: GitHubReadPort | null;
  /** Le diagnostic des blocages ; `null` : interventions sans diagnostic. */
  diagnoses: DiagnosisService | null;
  log: LoggerPort;
  now: () => number;
  /** The workflows followed by their API, as last read (#31); absent: none. */
  workflows?: () => readonly WorkflowView[];
  /** Where the code line's sheet comes from (#31). */
  codeSheet?: () => PublishedSheet;
  /**
   * Where the factory is read (#57, ADR 0015); `hermes` by default. On workflow-core's side, the board
   * starts empty (the kanban mirror holds Hermes' cards, not the core's), the agents and the activity come
   * from the core (#66), and Hermes' webhooks no longer change anything.
   */
  source?: 'hermes' | 'workflow-core';
}

type Slice = 'board' | 'agents' | 'health';
type FullBoard = Board & { comments: Comment[] };

const ACTIVITY_KEPT = 200;
const STALE_AGENT_MS = 20 * 60_000;
const PR_KEYS = ['pr_url', 'published_pr'];
/** Une intervention débloquée reste visible ce temps-là, pour suivre la reprise de la carte. */
const RESOLVED_KEPT_MS = 30 * 60_000;
/** Statuts d'une carte repartie (débloquée, relayée) : son intervention se ferme. */
const RESUMED = new Set(['ready', 'running', 'review', 'done']);
const RESUME_EVENTS = new Set(['unblocked', 'claimed', 'promoted', 'status', 'assigned']);

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
  /** On workflow-core's side (#66): the agents it announces. */
  private coreAgents: CoreAgentState[] = [];
  /** On workflow-core's side (#62): since when it does not answer, why, and the machine it last published. */
  private coreUnreachableSince: number | null = null;
  private coreError: string | null = null;
  private coreMachine: CoreMachineState | null = null;
  private coreChecks: CoreCheckState[] = [];
  /** On workflow-core's side (#59): its open interventions, their diagnoses, the verdicts of the runs. */
  private coreInterventions = new Map<string, CoreInterventionState>();
  private coreDiagnoses = new Map<string, Diagnosis>();
  private readonly coreVerdicts = new Map<string, ReadonlyMap<number, RunVerdict>>();
  /** Les interventions du kanban au dernier passage, et celles fermées depuis moins de 30 min. */
  private found: FoundIntervention[] = [];
  private readonly resolved = new Map<
    string,
    { intervention: FoundIntervention; resolvedAt: number }
  >();
  /** Les gardes à risque, relues quand la config ou le code d'un plugin d'un agent change. */
  private guards: { risks: GuardRisk[]; checkedAt: number } | null = null;
  private guardsStamp: string | null = null;
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
    this.board =
      deps.source === 'workflow-core'
        ? { tasks: [], runs: [], links: [], events: [], comments: [] }
        : deps.store.board();
    this.issueOfCard = issueOfCards(this.board);
    this.stations = deps.store.stations();
    this.activity = deps.store.recentActivity(ACTIVITY_KEPT);
    this.root = deps.profiles.root();
    this.factoryProfiles = this.loadProfiles();
    // Le miroir du kanban suffit pour montrer les interventions avant la première lecture.
    this.found = this.foundNow();
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
    this.trackInterventions();
    this.dirty.add('board').add('agents').add('health');
  }

  /**
   * The whole board, read from workflow-core (#57): it replaces the one held, so a card gone from the
   * core is gone here too. Nothing is written in the kanban mirror (ADR 0019): the core holds the state.
   */
  replaceBoard(board: KanbanDelta, readAt: number): void {
    const seenEvents = new Set(this.board.events.map((event) => event.id));
    this.board = {
      tasks: [...board.tasks],
      runs: [...board.runs].sort((left, right) => left.id - right.id),
      links: [...board.links],
      events: [...board.events],
      comments: [...board.comments],
    };
    this.issueOfCard = issueOfCards(this.board);
    this.kanbanStatus = { state: 'read', cards: this.board.tasks.length, error: null, readAt };
    this.trackUnblocks(
      { ...board, events: board.events.filter((event) => !seenEvents.has(event.id)) },
      readAt,
    );
    this.trackInterventions();
    this.dirty.add('board').add('agents').add('health');
  }

  /**
   * Suit les interventions d'un passage à l'autre : celle dont la carte est repartie (un run lancé
   * après elle, ou un statut de reprise) passe dans les « récemment débloquées » pendant 30 min.
   * Puis recalcule les diagnostics dont les faits ont changé.
   */
  private trackInterventions(): void {
    const now = this.deps.now();
    const found = this.foundNow();
    const ids = new Set(found.map((item) => item.id));
    const tasks = new Map(this.board.tasks.map((task) => [task.id, task]));
    for (const previous of this.found) {
      if (ids.has(previous.id) || !DIAGNOSED.has(previous.kind)) continue;
      const restarted = this.board.runs.some(
        (run) => run.taskId === previous.cardId && run.startedAt >= previous.openedAt,
      );
      const status = tasks.get(previous.cardId)?.status ?? '';
      if (restarted || RESUMED.has(status))
        this.resolved.set(previous.id, {
          intervention: previous,
          resolvedAt: this.resumedAt(previous) ?? now,
        });
    }
    for (const [id, entry] of this.resolved)
      if (ids.has(id) || now - entry.resolvedAt > RESOLVED_KEPT_MS) this.resolved.delete(id);
    this.found = found;
    this.refreshDiagnoses();
  }

  /** Quand la carte est repartie : premier événement de reprise, sinon premier run, après l'intervention. */
  private resumedAt(intervention: FoundIntervention): number | null {
    const after = (at: number, id: number) =>
      at >= intervention.openedAt && (intervention.eventId === null || id > intervention.eventId);
    const event = this.board.events.find(
      (item) =>
        item.taskId === intervention.cardId &&
        RESUME_EVENTS.has(item.kind) &&
        after(item.createdAt, item.id),
    );
    const run = this.board.runs.find(
      (item) => item.taskId === intervention.cardId && item.startedAt >= intervention.openedAt,
    );
    const at = event?.createdAt ?? run?.startedAt;
    return at === undefined ? null : at * 1000;
  }

  /** Le run lancé après le déblocage, son issue, et s'il rebloque pour la même cause. */
  private followUpOf(intervention: FoundIntervention): Intervention['followUp'] {
    const run = this.board.runs
      .filter(
        (item) => item.taskId === intervention.cardId && item.startedAt >= intervention.openedAt,
      )
      .sort((left, right) => left.id - right.id)[0];
    if (!run) return null;
    const next = this.found.find(
      (item) => item.cardId === intervention.cardId && DIAGNOSED.has(item.kind),
    );
    const before = this.deps.diagnoses?.primaryOf(intervention.id) ?? null;
    const after = next ? (this.deps.diagnoses?.primaryOf(next.id) ?? null) : null;
    return {
      runId: run.id,
      outcome: run.outcome,
      sameCause: before && after ? before === after : null,
    };
  }

  /**
   * Recalcule ce qui dépend des fichiers d'Hermès quand ils changent : les diagnostics (config d'un
   * agent, plugin, preuves) et les délais des gardes de la santé. Appelé après chaque lecture du
   * kanban, et par une minuterie pour voir une correction en direct.
   */
  refreshDiagnoses(): void {
    this.refreshGuards();
    const diagnoses = this.deps.diagnoses;
    if (!diagnoses) return;
    const all = [...this.found, ...[...this.resolved.values()].map((entry) => entry.intervention)];
    if (diagnoses.refresh(this.board, all, this.deps.now())) this.dirty.add('board');
  }

  /** Les gardes dont le code peut attendre au moins le délai de leur hook, agent par agent. */
  private refreshGuards(): void {
    const stamp = () =>
      this.factoryProfiles.map((profile) => this.deps.profiles.factsStamp(profile)).join('#');
    if (this.guardsStamp !== null && stamp() === this.guardsStamp) return;
    const facts = this.factoryProfiles.flatMap((profile): ProfileFacts[] => {
      try {
        const read = this.deps.profiles.facts(profile);
        return read ? [read] : [];
      } catch {
        return [];
      }
    });
    // L'empreinte se relit après coup : `facts` y ajoute les fichiers des plugins qu'il a lus.
    this.guardsStamp = stamp();
    const risks = guardRisks(facts);
    if (JSON.stringify(risks) !== JSON.stringify(this.guards?.risks)) this.dirty.add('health');
    this.guards = { risks, checkedAt: this.deps.now() };
  }

  diagnosisOf(interventionId: string): Diagnosis | null {
    if (this.deps.source === 'workflow-core') return this.coreDiagnoses.get(interventionId) ?? null;
    return this.deps.diagnoses?.of(interventionId) ?? null;
  }

  /**
   * The interventions of the moment. On workflow-core's side (#59), those the core publishes, with
   * factory-live's links, and the two kinds factory-live still computes from the cards the core serves:
   * a pull request to approve and a red main.
   */
  private foundNow(): FoundIntervention[] {
    const input = this.projectionInput();
    if (this.deps.source !== 'workflow-core') return foundInterventions(input);
    const own = foundInterventions(input).filter(
      (item) => item.kind === 'pr_approval' || item.kind === 'main_red',
    );
    const fromCore = [...this.coreInterventions.values()].map((item) =>
      coreIntervention(item, this.issueOfCard.get(item.cardId) ?? null, {
        owner: this.options.owner,
        dashboardUrl: this.options.dashboardUrl,
      }),
    );
    return [...fromCore, ...own].sort((left, right) => left.openedAt - right.openedAt);
  }

  /** Every open intervention of the core, from a full read (#59): they replace those held. */
  replaceCoreInterventions(items: readonly CoreInterventionState[]): void {
    this.coreInterventions = new Map(items.map((item) => [item.id, item]));
    this.trackInterventions();
    this.dirty.add('board');
  }

  /** An intervention the core announces as opened (#59). */
  openCoreIntervention(item: CoreInterventionState): void {
    this.coreInterventions.set(item.id, item);
    this.trackInterventions();
    this.dirty.add('board');
  }

  /** An intervention the core announces as closed (#59): it stays 30 min if its card started again. */
  closeCoreIntervention(id: string): void {
    if (!this.coreInterventions.delete(id)) return;
    this.trackInterventions();
    this.dirty.add('board');
  }

  /** The core's diagnoses, by intervention; `null` for one whose form the core's schema refused (#59). */
  applyCoreDiagnoses(entries: readonly (readonly [string, Diagnosis | null])[]): void {
    this.coreDiagnoses = new Map(
      entries.flatMap(([id, diagnosis]) => (diagnosis ? [[id, diagnosis] as const] : [])),
    );
    this.dirty.add('board');
  }

  /** The verdicts of a card's failed runs, as the core computes them (#59). */
  applyCoreVerdicts(cardId: string, verdicts: readonly RunVerdict[]): void {
    this.coreVerdicts.set(cardId, new Map(verdicts.map((verdict) => [verdict.runId, verdict])));
  }

  /** Le verdict des runs en échec d'une carte (page d'une issue), calculé à la demande et gardé. */
  verdictsOf(task: Task): ReadonlyMap<number, RunVerdict> {
    if (this.deps.source === 'workflow-core') return this.coreVerdicts.get(task.id) ?? new Map();
    return this.deps.diagnoses?.verdictsOf(this.board, task, this.deps.now()) ?? new Map();
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

  /** workflow-core answered (#62): a read or an event of its stream. */
  coreAnswered(): void {
    if (this.coreUnreachableSince === null) return;
    this.coreUnreachableSince = null;
    this.coreError = null;
    this.dirty.add('health').add('board');
  }

  /** A read or a reconnection to workflow-core failed (#62): the last state stays. */
  coreFailed(error: string, at: number): void {
    const first = this.coreUnreachableSince === null;
    this.coreUnreachableSince ??= at;
    this.coreError = error;
    this.dirty.add('health');
    if (first) this.dirty.add('board');
  }

  /** The state of the machine workflow-core publishes (#62), read in full. */
  applyCoreMachine(machine: CoreMachineState): void {
    this.coreMachine = machine;
    this.coreChecks = [...machine.checks];
    this.dirty.add('health');
  }

  /**
   * The machine's checks, from an event of the core's stream (#62): they replace those held, even before
   * the machine's first read has succeeded.
   */
  applyCoreChecks(checks: readonly CoreCheckState[]): void {
    this.coreChecks = [...checks];
    this.dirty.add('health');
  }

  /** The agents workflow-core announces, all of them: they replace those held (#66). */
  replaceCoreAgents(agents: readonly CoreAgentState[]): void {
    this.coreAgents = [...agents];
    this.dirty.add('agents');
  }

  /**
   * Facts of workflow-core's activity (#66): those not yet in the feed join it, in their order. The feed
   * itself (200 lines, restored from the base at start) says which are already there: the core serves its
   * last 200 facts at most, so nothing it sends again falls out of it, and nothing grows without bound.
   */
  addCoreActivity(facts: readonly CoreActivityFact[]): void {
    const known = new Set(this.activity.map((line) => line.id));
    const lines: ActivityEvent[] = [];
    for (const fact of facts) {
      const line = coreActivityEvent(fact, this.issueOfCard);
      if (known.has(line.id)) continue;
      known.add(line.id);
      lines.push(line);
    }
    if (lines.length === 0) return;
    this.activity = [...this.activity, ...lines].slice(-ACTIVITY_KEPT);
    this.pendingActivity.push(...lines);
    this.deps.store.appendActivity(lines);
  }

  applyHook(event: HookEvent): void {
    // On workflow-core's side, the live state comes from the core: a webhook still received changes nothing.
    if (this.deps.source === 'workflow-core') return;
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
    // Un refus ou une erreur sur une carte : son diagnostic se relit au prochain passage (2 s au plus).
    for (const line of lines)
      if (line.cardId && (line.status === 'blocked' || line.status === 'error'))
        this.deps.diagnoses?.touch(line.cardId);
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
      // Hermès classe lui-même l'échec (`error.type`) : une limite de débit sans code 429 en est une.
      const error = extra['error'];
      const type =
        typeof error === 'object' && error !== null
          ? (error as Record<string, unknown>)['type']
          : null;
      const limited = extra['status_code'] === 429 || type === 'rate_limit';
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

  /** A workflow answered differently, or stopped answering (#31): the Health page follows. */
  workflowsChanged(): void {
    this.dirty.add('health');
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
      diagnosis: (id) => this.diagnosisOf(id),
      resolved: this.resolvedInterventions(),
    };
  }

  private resolvedInterventions(): ResolvedIntervention[] {
    return [...this.resolved.values()]
      .sort((left, right) => right.resolvedAt - left.resolvedAt)
      .map((entry) => ({ ...entry, followUp: this.followUpOf(entry.intervention) }));
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
      guards: this.guards,
      running: this.board.tasks.filter((task) => task.status === 'running').length,
      maxInProgress: this.root.maxInProgress,
      maxInProgressPerProfile: this.root.maxInProgressPerProfile,
      ...(this.deps.workflows ? { workflows: this.deps.workflows() } : {}),
      ...(this.deps.codeSheet ? { codeSheet: this.deps.codeSheet() } : {}),
      ...(this.deps.source === 'workflow-core'
        ? {
            core: {
              unreachableSince: this.coreUnreachableSince,
              error: this.coreError,
              machine: this.coreMachine,
              checks: this.coreChecks,
            },
          }
        : {}),
    });
  }

  private boardSlice() {
    const input = this.projectionInput();
    const interventions = projectInterventions(input, this.found);
    if (this.deps.source === 'workflow-core' && this.coreUnreachableSince !== null)
      interventions.unshift(this.coreDown(this.coreUnreachableSince));
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

  /** workflow-core does not answer (#62): the intervention of a service down, with the tile's text. */
  private coreDown(since: number): Intervention {
    const seconds = Math.max(0, Math.round((this.deps.now() - since) / 1000));
    return {
      id: 'service_down:workflow-core',
      kind: 'service_down',
      severity: 'critical',
      title: msg('health.core.unreachableTitle'),
      issueKey: null,
      cardId: null,
      profile: null,
      question: msg('health.core.unreachable', { seconds }),
      openedAt: new Date(since).toISOString(),
      push: false,
      actions: [],
      unblock: null,
      diagnosis: null,
      resolvedAt: null,
      followUp: null,
    };
  }

  private noticeInterventions(interventions: Intervention[]): void {
    // Une intervention débloquée n'est plus ouverte : ni notifiée, ni comptée.
    const open = interventions.filter((item) => !item.resolvedAt);
    this.interventions = open;
    const opened = open.filter((item) => !this.knownInterventions.has(item.id));
    this.knownInterventions = new Set(open.map((item) => item.id));
    if (this.firstBoard) {
      this.firstBoard = false;
      for (const listener of this.interventionListeners) listener(opened, open);
      return;
    }
    if (opened.length > 0)
      for (const listener of this.interventionListeners) listener(opened, open);
  }

  get openInterventions(): readonly Intervention[] {
    return this.interventions;
  }

  private agentsSlice() {
    if (this.deps.source === 'workflow-core')
      return projectCoreAgents(this.coreAgents, this.board.runs, this.issueOfCard);
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
      addresses: this.options.addresses,
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
    this.trackInterventions();
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
    const tasks = new Map(this.board.tasks.map((task) => [task.id, task]));
    for (const [card, key] of this.issueOfCard) {
      const urls = runsByTask.get(card) ?? [];
      const known = tracked.get(key);
      const task = tasks.get(card);
      tracked.set(key, {
        key,
        prUrl: urls.at(-1) ?? known?.prUrl ?? null,
        branch: (task ? branchOf(task, this.board.runs) : null) ?? known?.branch ?? null,
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
