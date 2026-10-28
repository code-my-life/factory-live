import type {
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
export interface FactoryDataSource {
  readonly kind: 'demo' | 'live';
  subscribe(listener: () => void): () => void;
  getSnapshot(): Snapshot;
  getIssueDetail(key: IssueKey): IssueDetail | null;
  /** Transcriptions d'un run : session Hermès, puis lane CLI s'il y en a une. */
  getTranscripts(runId: number): readonly TranscriptView[] | null;
  getProfiles(): readonly ProfileView[];
  getUsage(periodDays: UsagePeriod): UsageReport;
  getHistory(): HistoryStats;
  /** Poste la réponse sur l'issue (`/factory unblock`) ; le suivi arrive par le flux. */
  unblock(interventionId: string, text: string): Promise<void>;
  /** Démo seulement : rejoue le scénario depuis le début. */
  restart?(): void;
}

export type UsagePeriod = 1 | 7 | 30;
