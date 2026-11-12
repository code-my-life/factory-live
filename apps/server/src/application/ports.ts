import type {
  AcceptanceCheck,
  AcceptanceGate,
  AcceptanceTestSuite,
  AcceptanceThread,
  AcceptanceTwins,
  ActivityEvent,
  ConfigDrift,
  IssueLabel,
  PullRequestView,
  ProfileLimit,
  PushPayload,
  StudioItem,
  Text,
  WorkflowSheet,
} from '@factory-live/contracts';
import type {
  Board,
  GuardRisk,
  Comment,
  EvidenceFile,
  Link,
  LogFact,
  ProfileFacts,
  Run,
  SessionFacts,
  Task,
  TaskEvent,
} from '@factory-live/domain';

/**
 * Application ports: what the hub and use cases expect from the outside world. Adapters
 * (`src/adapters`) implement them; the application knows none of them (rule enforced by dependency-cruiser).
 */

/** Structured logger (pino satisfies this). */
export interface LoggerPort {
  info(context: object, message: string): void;
  warn(context: object, message: string): void;
  error(context: object, message: string): void;
  debug(context: object, message: string): void;
}

// --- Kanban d'Hermès ---------------------------------------------------------------------------

/** What changed in the kanban since the last read. */
export interface KanbanDelta {
  tasks: Task[];
  runs: Run[];
  links: Link[];
  /** New events only (heartbeats are excluded; `tasks.last_heartbeat_at` suffices). */
  events: TaskEvent[];
  comments: Comment[];
}

// --- Profils -------------------------------------------------------------------------------------

export interface ModelLink {
  model: string;
  provider: string;
}

/** What matters from a profile's `config.yaml` for factory-live. */
export interface ProfileConfig {
  model: ModelLink | null;
  baseUrl: string | null;
  fallbacks: ModelLink[];
  effort: string | null;
  toolsets: string[];
  plugins: string[];
  mcp: string[];
  outboundHooks: string[];
}

export interface FactoryManifest {
  owner: string | null;
  projects: Record<string, { repo: string }>;
  profiles: Record<string, { skills: string[]; plugins: string[] }>;
}

export interface RootSettings {
  maxInProgress: number;
  maxInProgressPerProfile: number;
}

export interface ProfilesPort {
  profiles(): string[];
  live(profile: string): ProfileConfig | null;
  repo(profile: string): ProfileConfig | null;
  manifest(): FactoryManifest;
  root(): RootSettings;
  // In-service timeouts, repo value and plugin hooks, for diagnosis; null = unreadable config.
  facts(profile: string): ProfileFacts | null;
  // Fingerprint of files read by `facts` (modification times); it changes when any of them changes.
  factsStamp(profile: string): string;
  /**
   * How many times each plugin's hook ran past its delay, when the source counts them itself (workflow-core,
   * #93); absent: the agents' screen counts them in the agent's journal.
   */
  hookTimeouts?(profile: string): ReadonlyMap<string, number> | null;
  /**
   * The guards at risk as the source computes them itself, with the time it was read (workflow-core, #96);
   * absent: the hub finds them with the rule on each agent's facts. `null`: nothing read yet.
   */
  guardRisks?(): { risks: GuardRisk[]; checkedAt: number } | null;
  /**
   * The agent's limits with their defaults, when the source publishes them (workflow-core, #93); absent:
   * the agents' screen takes them from `facts` and Hermes' defaults.
   */
  limits?(profile: string): ProfileLimit[] | null;
}

// --- Sessions des workers ------------------------------------------------------------------------

export interface SessionInfo {
  id: string;
  profile: string;
  model: string | null;
  title: string | null;
  /** Secondes epoch. */
  startedAt: number;
  endedAt: number | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface ModelUsageRow {
  model: string;
  provider: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  /** Secondes epoch. */
  lastSeen: number;
}

export interface TranscriptLine {
  id: string;
  /** Millisecondes epoch. */
  at: number;
  role: 'user' | 'assistant' | 'reasoning' | 'tool_call' | 'tool_result' | 'system';
  text: string | null;
  toolName: string | null;
  model: string | null;
  status: 'ok' | 'error' | 'blocked' | null;
}

/** A card run, with what's needed to find its session without guessing. */
export interface RunRef {
  id: number;
  taskId: string;
  /** Secondes epoch. */
  startedAt: number;
  endedAt: number | null;
  // `metadata.worker_session_id`, recorded by Hermes.
  workerSessionId: string | null;
  // The `hermes --resume <sid>` session, found in the run's error or output.
  resumeSessionId: string | null;
}

export interface SessionsPort {
  sessionOfRun(
    profile: string,
    run: { startedAt: number; endedAt: number | null; workerSessionId: string | null },
  ): SessionInfo | null;
  modelUsage(profile: string, sessionId: string): ModelUsageRow[];
  usageSince(profile: string, since: number): (ModelUsageRow & { day: string })[];
  transcript(profile: string, sessionId: string): TranscriptLine[];
  /**
   * Tool calls and results from these runs' sessions, for diagnosis. A run whose session
   * cannot be found has none; `null` = unreadable agent database.
   */
  runFacts(profile: string, runs: readonly RunRef[]): SessionFacts[] | null;
  // Agent sessions open at this instant (epoch seconds); `null` = unreadable database.
  sessionsActiveAt(profile: string, at: number): string[] | null;
}

// --- Fichiers de la factory (logs de cartes, lanes Claude Code) -------------------------------------

export interface LaneTranscript {
  entries: TranscriptLine[];
  name: string | null;
  startedAt: number | null;
  endedAt: number | null;
  costUsd: number | null;
}

/** A proof of the gate for a head (#22): its rule, its place in the gate's order, its text (cut). */
/**
 * What a run's transcripts are made of, read from workflow-core's declared data (#60): the agent's session,
 * each Claude Code session, the card's raw log. Times in ms epoch.
 */
export interface RunTranscripts {
  hermes: TranscriptLine[];
  lanes: { name: string | null; entries: TranscriptLine[] }[];
  terminal: string[];
}

/**
 * The factory's declared data, as the views of the core's side read them before showing (#60): only
 * `adapters/workflow-core/factoryViews.ts` knows their names. A route asks for them, then gives them to its
 * view; the twins it reads stay for the bench (`TwinBench`, ADR 0013).
 */
/** A PR's twin pair as workflow-core publishes it (#60): its state and its mirror's port, no session nor password. */
export interface DeclaredPair {
  twins: AcceptanceTwins;
  mirror: number;
}

export interface DeclaredViewsPort {
  /** The gate's proofs of the PR's head for these cards, and the PR's twins read for the bench. */
  acceptance(
    repo: string,
    pr: number,
    cardIds: readonly string[],
    head: string,
  ): Promise<GateProof[]>;
  transcripts(runId: number): Promise<RunTranscripts | null>;
  /** The drift of each of these agents; an agent the core does not answer for has none. */
  drift(agents: readonly string[]): Promise<ReadonlyMap<string, ConfigDrift[]>>;
}

export interface GateProof {
  order: number;
  rule: string;
  text: string;
}

export interface CardFilesPort {
  // Raw card log, ANSI sequences kept; `null` if absent.
  cardLog(cardId: string): string[] | null;
  // Claude Code transcripts launched from a card's workspace during a window (epoch ms).
  claudeTranscripts(workspacePath: string, fromMs: number, toMs: number): LaneTranscript[];
  // `evidence/` files left by the agent; `null` = no readable evidence folder.
  evidence(cardId: string): EvidenceFile[] | null;
  // Evidence folder fingerprint: changes when a file is added or removed there.
  evidenceStamp(cardId: string): string;
  // The gate's proofs of a head (`evidence/gate/<sha7>/NN-<rule>.txt`), texts cut at 64 KB.
  gateProofs(cardId: string, sha7: string): GateProof[];
}

// --- Journal d'Hermès ----------------------------------------------------------------------------

export interface AgentLogPort {
  // Catalogued log lines of an agent between two instants (epoch seconds); `null` = unreadable.
  facts(profile: string, from: number, to: number): LogFact[] | null;
}

// --- GitHub --------------------------------------------------------------------------------------

export interface IssueInfo {
  title: string;
  url: string;
  labels: IssueLabel[];
  state: 'open' | 'closed';
}

export interface TrackedIssue {
  key: string;
  prUrl: string | null;
  // The work branch, to find the PR when no run recorded the link.
  branch?: string | null;
  active: boolean;
}

export interface GitHubStatus {
  ok: boolean;
  // What health says about GitHub access, written by the client in its language.
  detail: Text;
  checkedAt: number | null;
}

// Cached GitHub data, read by the hub at each projection.
/** A test of the head's JUnit reports, as the criteria that name it need it (#22). */
export interface AcceptanceTestResult {
  /** The file as the report names it. */
  file: string;
  /** The full name, describe blocks included (« recette > un critère vert »). */
  name: string;
  project: string | null;
  outcome: 'passed' | 'failed' | 'skipped';
  /** The test at the head, or the run that ran it when the report does not say where it is. */
  url: string;
}

/**
 * The recette of an issue's PR as GitHub gives it (#22), before the factory's evidence joins it. A
 * part GitHub refused, or could not give, is `null`: the recette shows that part without data.
 */
export interface AcceptanceSource {
  pr: number;
  prUrl: string;
  head: string;
  base: string;
  issueBody: string | null;
  prBody: string | null;
  checks: AcceptanceCheck[] | null;
  gate: AcceptanceGate | null;
  /** The head's test reports, as suites and test by test; `null` while none is published. */
  tests: { suites: AcceptanceTestSuite[]; results: AcceptanceTestResult[] } | null;
  /** The pictures the PR modifies, served by factory-live before (base) and after (head). */
  captures: { path: string; before: string; after: string; url: string }[] | null;
  threads: AcceptanceThread[] | null;
  reviewRounds: number;
}

export interface GitHubReadPort {
  issueInfo(key: string): IssueInfo | null;
  pullRequest(key: string): PullRequestView | null;
  /** The recette's GitHub side for the issue's PR; `null` while there is no PR (or not read yet). */
  acceptance(key: string): AcceptanceSource | null;
  /** A picture the PR modifies, at its base or its head; `null` when the PR does not modify it. */
  capture(
    repo: string,
    pr: number,
    path: string,
    side: 'base' | 'head',
  ): Promise<Uint8Array | null>;
  readonly status: GitHubStatus;
  readonly lastDelivery: { at: number; status: number } | null;
  readonly rateLimit: { remaining: number; limit: number } | null;
}

// Direct writes and reads needed for unblocking.
export interface GitHubWritePort {
  comment(repo: string, number: number, body: string): Promise<{ id: number; url: string }>;
  /** Opens an issue in `repo` (a repository of the owner), in the name of the connected account (#61). */
  openIssue(repo: string, title: string, body: string): Promise<{ number: number; url: string }>;
  reactions(repo: string, commentId: number): Promise<{ content: string; user: string }[]>;
}

// --- Stockage propre à factory-live --------------------------------------------------------------

// --- Gestes déclarés (#61, ADR 0016) -------------------------------------------------------------

/**
 * A gesture a workflow declares: a comment `/<workflow> <name> <note>` on the issue of an item, or an issue
 * opened in `repo`. factory-live posts only these.
 */
export interface DeclaredGesture {
  name: string;
  kind: 'comment' | 'issue';
  /** The repository an `issue` gesture opens its issue in; `null` for a comment. */
  repo: string | null;
}

export interface GesturesPort {
  /** The gestures a workflow declares; `null` when the workflow is unknown. */
  declared(workflow: string): readonly DeclaredGesture[] | null;
}

export interface UsageDelta {
  day: string;
  model: string;
  provider: string;
  profile: string;
  calls?: number;
  input?: number;
  output?: number;
  rateLimited?: number;
  errors?: number;
}

export type UsageRow = Required<UsageDelta>;

export type UnblockState = 'sent' | 'acknowledged' | 'resumed' | 'rejected' | 'failed';

export interface UnblockRecord {
  interventionId: string;
  issueKey: string;
  text: string;
  actor: string;
  state: UnblockState;
  commentId: number | null;
  commentUrl: string | null;
  /** Millisecondes epoch. */
  at: number;
  updatedAt: number;
}

export interface StationRecord {
  station: string;
  previous: string | null;
  /** Millisecondes epoch. */
  changedAt: number;
}

// A card's activity lines: only these kinds or statuses (one or the other), most recent.
export interface ActivityFilter {
  limit?: number;
  kinds?: readonly string[];
  statuses?: readonly string[];
}

export interface HistoryPort {
  mirror(delta: KanbanDelta): void;
  board(): Board & { comments: Comment[] };
  appendActivity(events: readonly ActivityEvent[]): void;
  recentActivity(limit: number): ActivityEvent[];
  activityOfCards(cardIds: readonly string[], filter?: ActivityFilter): ActivityEvent[];
  // Most recent lines of these kinds, across all cards (guard refusals).
  activityOfKinds(kinds: readonly string[], limit: number): ActivityEvent[];
  addUsage(delta: UsageDelta): void;
  /**
   * Usage rows as workflow-core serves them (#66): each one sets its day, model, provider and agent, so a
   * day served again is not counted twice, and a day the core no longer serves stays.
   */
  setUsage(rows: readonly UsageRow[]): void;
  usageSince(day: string): UsageRow[];
  claimNotification(interventionId: string, now: number): boolean;
  unblock(interventionId: string): UnblockRecord | null;
  openUnblocks(): UnblockRecord[];
  reserveUnblock(record: Omit<UnblockRecord, 'commentId' | 'commentUrl' | 'updatedAt'>): boolean;
  updateUnblock(
    interventionId: string,
    patch: { state: UnblockState; commentId?: number | null; commentUrl?: string | null },
    now: number,
  ): void;
  forgetUnblock(interventionId: string): void;
  audit(actor: string, action: string, detail: string | null, now: number): void;
  stations(): Map<string, StationRecord>;
  saveStation(issueKey: string, record: StationRecord): void;
  /**
   * factory-live's own history of a workflow's items, as workflow-core serves them (#63). Each item keeps its
   * last full state, one row per item. `complete`: these are all the items of the workflow (a full read), so
   * an item that is not among them is marked gone at `at`, its last state kept; an item seen again is no
   * longer gone.
   */
  recordItems(
    workflow: string,
    items: readonly { id: string; state: unknown }[],
    at: number,
    complete: boolean,
  ): void;
  historyItems(workflow: string): HistoryItem[];
  /** Pours these items into the history once per workflow (the mirror, at the first start on the core's side). */
  seedHistory(
    workflow: string,
    items: readonly { id: string; state: unknown }[],
    at: number,
  ): boolean;
}

/** One item of factory-live's history (#63): its last state as the core served it; times in ms epoch. */
export interface HistoryItem {
  id: string;
  state: unknown;
  firstSeenAt: number;
  lastSeenAt: number;
  goneAt: number | null;
}

// --- Notifications -------------------------------------------------------------------------------

// A push, written by each device's service worker in the language chosen there.
export type PushMessage = PushPayload;

export interface PushPort {
  notify(message: PushMessage): Promise<{ sent: number; removed: number; failed: number }>;
}

/** A workflow followed by its generic API (#31), as last read (`adapters/workflows/api.ts`). */
/**
 * An agent's live state as workflow-core serves it (#66), in factory-live's units: times in ms epoch, a
 * model's provider never null. `cardId` is the card its run is on.
 */
export interface CoreAgentState {
  profile: string;
  cardId: string;
  runId: number | null;
  state: 'thinking' | 'tool' | 'cli' | 'blocked';
  action: {
    kind: 'llm' | 'tool' | 'cli';
    label: string;
    detail: string | null;
    startedAt: number;
  } | null;
  model: { model: string; provider: string; source: 'live' | 'session' } | null;
  laneModel: { model: string; provider: string } | null;
  lastHeartbeatAt: number | null;
}

/** One check of the machine, as workflow-core publishes it (#62); `checkedAt` in ms epoch. */
export interface CoreCheckState {
  id: string;
  label: string;
  group: string;
  status: 'ok' | 'degraded' | 'down' | 'unknown';
  detail: string;
  metrics: Record<string, string>;
  checkedAt: number | null;
}

/** The state of the machine as workflow-core publishes it (#62), times in ms epoch. */
export interface CoreMachineState {
  runtimeVersion: string | null;
  contract: { ok: boolean; problems: string[] } | null;
  mode: 'normal' | 'observer';
  boards: { board: string; lastReadAt: number | null }[];
  checks: CoreCheckState[];
}

/**
 * An intervention as workflow-core announces it (#59), in factory-live's units: opening time in seconds epoch,
 * as the kanban's; titles, questions and labels as factory-live's texts (a code of its catalogue, or a quote);
 * the core's gesture `unblock` as the action Débloquer. The links to an issue or a dashboard are factory-live's.
 */
export interface CoreInterventionState {
  id: string;
  kind: 'needs_input' | 'capability' | 'transient' | 'gave_up' | 'triage_loop' | 'held_active_pr';
  cardId: string;
  eventId: number | null;
  openedAt: number;
  profile: string | null;
  severity: 'critical' | 'warning' | 'info';
  push: boolean;
  title: Text;
  question: Text;
  actions: (
    | { kind: 'unblock' }
    | { kind: 'copy'; label: Text; command: string }
    | { kind: 'link'; label: Text; url: string }
  )[];
}

/** One recent fact of the board's activity, as workflow-core serves it (#66); `at` in ms epoch. */
export interface CoreActivityFact {
  id: string;
  at: number;
  kind: 'tool' | 'llm' | 'kanban' | 'guard' | 'system';
  profile: string | null;
  cardId: string | null;
  text: string;
  status: 'ok' | 'running' | 'error' | 'blocked' | null;
}

export interface WorkflowView {
  name: string;
  /** The sheet the workflow serves; `null` until read, or while it is invalid (`sheetError`). */
  sheet: WorkflowSheet | null;
  sheetError: string | null;
  items: StudioItem[];
  /** When the workflow last answered; `null` before it ever did. */
  readAt: number | null;
  /** Since when it does not answer, the last state staying as it was; `null` while it answers. */
  unreachableSince: number | null;
  error: string | null;
}

/** Where the code line's sheet comes from (#31): the factory's published one, or the web's copy. */
export type PublishedSheet =
  { source: 'published'; sheet: WorkflowSheet } | { source: 'embedded'; reason: string };
