import type {
  GitHubAccess,
  HistoryStats,
  IssueDetail,
  IssueKey,
  ProfileView,
  Snapshot,
  TranscriptView,
  UsageReport,
} from '@factory-live/contracts';

/**
 * Ce que les écrans attendent des données, quelle que soit leur origine :
 * le scénario de démonstration (maquette, e2e) ou l'API de factory-live (SSE + REST).
 * Chaque getter rend la même référence tant que rien n'a changé (contrat de useSyncExternalStore).
 */
/** Le lien avec factory-live : ouvert, en train de se rétablir, ou perdu (hors ligne, hors tailnet). */
export type Connection = 'open' | 'connecting' | 'lost';

export interface FactoryDataSource {
  readonly kind: 'demo' | 'live';
  subscribe(listener: () => void): () => void;
  getSnapshot(): Snapshot;
  getConnection(): Connection;
  /** Quand l'état affiché a été reçu (ms) : le dernier connu, gardé sur l'appareil, s'affiche hors ligne. */
  getLastUpdate(): number | null;
  getIssueDetail(key: IssueKey): IssueDetail | null;
  /** Transcriptions d'un run : session Hermès, puis lane CLI s'il y en a une. */
  getTranscripts(runId: number): readonly TranscriptView[] | null;
  getProfiles(): readonly ProfileView[];
  getUsage(periodDays: UsagePeriod): UsageReport;
  getHistory(): HistoryStats;
  /** Poste la réponse sur l'issue (`/factory unblock`) ; le suivi arrive par le flux. */
  unblock(interventionId: string, text: string): Promise<void>;
  /** Accès de factory-live à GitHub (App, connexion de Clément) ; `null` le temps de le lire. En direct seulement. */
  getGitHubAccess?(): GitHubAccess | null;
  /** Déconnecte Clément de GitHub dans factory-live. En direct seulement. */
  logoutGitHub?(): Promise<void>;
  /** Démo seulement : rejoue le scénario depuis le début. */
  restart?(): void;
}

export type UsagePeriod = 1 | 7 | 30;
