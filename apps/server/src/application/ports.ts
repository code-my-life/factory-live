import type { ActivityEvent, PullRequestView, PushPayload, Text } from '@factory-live/contracts';
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
 * Ports de l'application : ce que le hub et les cas d'usage attendent du monde extérieur. Les adaptateurs
 * (`src/adapters`) les implémentent ; l'application n'en connaît aucun (règle vérifiée par dependency-cruiser).
 */

/** Journal structuré (pino le satisfait). */
export interface LoggerPort {
  info(context: object, message: string): void;
  warn(context: object, message: string): void;
  error(context: object, message: string): void;
  debug(context: object, message: string): void;
}

// --- Kanban d'Hermès ---------------------------------------------------------------------------

/** Ce qui a changé dans le kanban depuis la lecture précédente. */
export interface KanbanDelta {
  tasks: Task[];
  runs: Run[];
  links: Link[];
  /** Nouveaux événements seulement (les battements de cœur sont écartés, `tasks.last_heartbeat_at` suffit). */
  events: TaskEvent[];
  comments: Comment[];
}

// --- Profils -------------------------------------------------------------------------------------

export interface ModelLink {
  model: string;
  provider: string;
}

/** Ce qui compte d'un `config.yaml` de profil pour factory-live. */
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
  /** Délais en service, valeur du dépôt et hooks des plugins, pour le diagnostic ; null : config illisible. */
  facts(profile: string): ProfileFacts | null;
  /** Empreinte des fichiers lus par `facts` (dates de modification) : elle change quand l'un d'eux change. */
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

/** Un run de la carte, avec ce qui permet de retrouver sa session sans la deviner. */
export interface RunRef {
  id: number;
  taskId: string;
  /** Secondes epoch. */
  startedAt: number;
  endedAt: number | null;
  /** `metadata.worker_session_id`, noté par Hermès. */
  workerSessionId: string | null;
  /** La session de `hermes --resume <sid>`, relevée dans l'erreur ou la sortie du run. */
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
   * Appels d'outils et résultats des sessions de ces runs, pour le diagnostic. Un run dont la session
   * reste introuvable n'en a pas ; `null` : la base de l'agent est illisible.
   */
  runFacts(profile: string, runs: readonly RunRef[]): SessionFacts[] | null;
}

// --- Fichiers de la factory (logs de cartes, lanes Claude Code) -------------------------------------

export interface LaneTranscript {
  entries: TranscriptLine[];
  costUsd: number | null;
}

export interface CardFilesPort {
  /** Log brut d'une carte, séquences ANSI gardées ; null si absent. */
  cardLog(cardId: string): string[] | null;
  /** Transcriptions Claude Code lancées depuis le workspace d'une carte pendant une fenêtre (ms epoch). */
  claudeTranscripts(workspacePath: string, fromMs: number, toMs: number): LaneTranscript[];
  /** Les fichiers de `evidence/` laissés par l'agent ; `null` : aucun dossier de preuves lisible. */
  evidence(cardId: string): EvidenceFile[] | null;
  /** Empreinte du dossier de preuves : elle change quand un fichier y est ajouté ou retiré. */
  evidenceStamp(cardId: string): string;
}

// --- Journal d'Hermès ----------------------------------------------------------------------------

export interface AgentLogPort {
  /** Lignes cataloguées du journal d'un agent entre deux instants (secondes epoch) ; null : illisible. */
  facts(profile: string, from: number, to: number): LogFact[] | null;
}

// --- GitHub --------------------------------------------------------------------------------------

export interface IssueInfo {
  title: string;
  url: string;
  labels: string[];
  state: 'open' | 'closed';
}

export interface TrackedIssue {
  key: string;
  prUrl: string | null;
  active: boolean;
}

export interface GitHubStatus {
  ok: boolean;
  /** Ce que la santé dit de l'accès à GitHub, écrit par le client dans sa langue. */
  detail: Text;
  checkedAt: number | null;
}

/** Données GitHub en cache, lues par le hub à chaque projection. */
export interface GitHubReadPort {
  issueInfo(key: string): IssueInfo | null;
  pullRequest(key: string): PullRequestView | null;
  readonly status: GitHubStatus;
  readonly lastDelivery: { at: number; status: number } | null;
  readonly rateLimit: { remaining: number; limit: number } | null;
}

/** Écritures et lectures directes nécessaires au déblocage. */
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

/** Les lignes du fil d'une carte : ces types ou ces statuts seulement (l'un ou l'autre), les plus récentes. */
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
  /** Les lignes les plus récentes de ces types, toutes cartes confondues (refus des gardes). */
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

/** Un push, écrit par le service worker de chaque appareil dans la langue qui y est choisie. */
export type PushMessage = PushPayload;

export interface PushPort {
  notify(message: PushMessage): Promise<{ sent: number; removed: number; failed: number }>;
}
