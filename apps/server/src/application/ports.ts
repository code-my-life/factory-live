import type {
  ActivityEvent,
  IssueLabel,
  PullRequestView,
  PushPayload,
  Text,
} from '@factory-live/contracts';
import type {
  Board,
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

export interface CardFilesPort {
  // Raw card log, ANSI sequences kept; `null` if absent.
  cardLog(cardId: string): string[] | null;
  // Claude Code transcripts launched from a card's workspace during a window (epoch ms).
  claudeTranscripts(workspacePath: string, fromMs: number, toMs: number): LaneTranscript[];
  // `evidence/` files left by the agent; `null` = no readable evidence folder.
  evidence(cardId: string): EvidenceFile[] | null;
  // Evidence folder fingerprint: changes when a file is added or removed there.
  evidenceStamp(cardId: string): string;
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
export interface GitHubReadPort {
  issueInfo(key: string): IssueInfo | null;
  pullRequest(key: string): PullRequestView | null;
  readonly status: GitHubStatus;
  readonly lastDelivery: { at: number; status: number } | null;
  readonly rateLimit: { remaining: number; limit: number } | null;
}

// Direct writes and reads needed for unblocking.
export interface GitHubWritePort {
  comment(repo: string, number: number, body: string): Promise<{ id: number; url: string }>;
  reactions(repo: string, commentId: number): Promise<{ content: string; user: string }[]>;
}

// --- Stockage propre à factory-live --------------------------------------------------------------

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
}

// --- Notifications -------------------------------------------------------------------------------

// A push, written by each device's service worker in the language chosen there.
export type PushMessage = PushPayload;

export interface PushPort {
  notify(message: PushMessage): Promise<{ sent: number; removed: number; failed: number }>;
}
