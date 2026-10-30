import { z } from 'zod';
import { ModelRef } from './agents.ts';
import { BlockKind, IssueKey, KanbanStatus, StationId, Timestamp } from './common.ts';
import { EvidenceFile, RunVerdict } from './diagnosis.ts';
import { Text } from './messages.ts';

export const ChecksState = z.enum(['none', 'pending', 'success', 'failure']);
export type ChecksState = z.infer<typeof ChecksState>;

export const PullRequestView = z.object({
  number: z.number().int().positive(),
  url: z.url(),
  title: z.string(),
  state: z.enum(['draft', 'open', 'merged', 'closed']),
  checks: ChecksState,
  reviewDecision: z.enum(['approved', 'changes_requested', 'review_required']).nullable(),
  autoMerge: z.boolean(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changedFiles: z.number().int().nonnegative(),
});
export type PullRequestView = z.infer<typeof PullRequestView>;

export const IssueStatus = z.enum([
  'active',
  'queued',
  'waiting_human',
  'blocked',
  'done',
  'stopped',
]);
export type IssueStatus = z.infer<typeof IssueStatus>;

/** A GitHub label: its name and color (hexadecimal without « # », as the GitHub API returns it). */
export const IssueLabel = z.object({
  name: z.string(),
  color: z.string().regex(/^[0-9a-fA-F]{6}$/),
});
export type IssueLabel = z.infer<typeof IssueLabel>;

/** Une issue GitHub traitée par la factory, résumée pour la ligne d'usine et les listes. */
export const IssueSummary = z.object({
  key: IssueKey,
  repo: z.string(),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.url(),
  labels: z.array(IssueLabel),
  station: StationId,
  /** Station quittée au dernier changement, pour animer la liaison franchie. */
  previousStation: StationId.nullable(),
  stationChangedAt: Timestamp.nullable(),
  status: IssueStatus,
  claudeModel: z.string().nullable(),
  harness: z.string().nullable(),
  pr: PullRequestView.nullable(),
  /** Lien de la PR relevé dans les runs d'Hermès : connu même quand GitHub n'est pas relié. */
  prUrl: z.url().nullable(),
  activeProfiles: z.array(z.string()),
  interventionIds: z.array(z.string()),
  startedAt: Timestamp,
  updatedAt: Timestamp,
});
export type IssueSummary = z.infer<typeof IssueSummary>;

export const CardKind = z.enum([
  'brief',
  'impl',
  'release',
  'diagnostic',
  'watch',
  'onboarding',
  'other',
]);
export type CardKind = z.infer<typeof CardKind>;

export const RunRole = z.enum(['coordinator', 'implementer', 'reviewer', 'release', 'other']);
export type RunRole = z.infer<typeof RunRole>;

/** Un passage d'un profil sur une carte (une ligne `task_runs`). */
export const RunView = z.object({
  id: z.number().int().positive(),
  profile: z.string(),
  role: RunRole,
  status: z.string(),
  outcome: z.string().nullable(),
  startedAt: Timestamp,
  endedAt: Timestamp.nullable(),
  model: ModelRef.nullable(),
  laneModel: ModelRef.nullable(),
  summary: z.string().nullable(),
  tokens: z.number().int().nonnegative().nullable(),
  costUsd: z.number().nonnegative().nullable(),
  /** Ce qu'il s'est passé dans ce run quand il a échoué ou bloqué ; `null` sinon. */
  verdict: RunVerdict.nullable().default(null),
});
export type RunView = z.infer<typeof RunView>;

/** Une carte du kanban et sa place dans le graphe de l'issue. */
export const CardView = z.object({
  id: z.string(),
  title: z.string(),
  kind: CardKind,
  status: KanbanStatus,
  /** `null` : carte sans assigné. */
  assignee: z.string().nullable(),
  station: StationId,
  blockKind: BlockKind.nullable(),
  blockReason: z.string().nullable(),
  parents: z.array(z.string()),
  skills: z.array(z.string()),
  runs: z.array(RunView),
  changedFiles: z.array(z.object({ path: z.string(), edits: z.number().int().positive() })),
  testsPassed: z.number().int().nonnegative().nullable(),
  testsTotal: z.number().int().nonnegative().nullable(),
  /** Les fichiers de `evidence/` du worktree de la carte, tels qu'ils sont sur le disque. */
  evidence: z.array(EvidenceFile).default([]),
});
export type CardView = z.infer<typeof CardView>;

/** Une ligne de la timeline d'une issue, toutes sources confondues. */
export const TimelineEntry = z.object({
  id: z.string(),
  at: Timestamp,
  source: z.enum(['kanban', 'hermes', 'github', 'comment', 'factory-live']),
  profile: z.string().nullable(),
  cardId: z.string().nullable(),
  label: Text,
  detail: Text.nullable(),
  tone: z.enum(['neutral', 'success', 'attention', 'danger', 'done']),
  /** Événement répété à chaque tick, fusionné en une ligne : combien de fois (2 ou plus). */
  repeats: z.number().int().min(2).optional(),
});
export type TimelineEntry = z.infer<typeof TimelineEntry>;

export const IssueDetail = z.object({
  issue: IssueSummary,
  cards: z.array(CardView),
  timeline: z.array(TimelineEntry),
  tokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
});
export type IssueDetail = z.infer<typeof IssueDetail>;
