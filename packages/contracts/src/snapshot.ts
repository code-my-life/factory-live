import { z } from 'zod';
import { ActivityEvent } from './activity.ts';
import { AgentActivity } from './agents.ts';
import { KanbanStatus, StationId, Timestamp } from './common.ts';
import { FactoryState, ServiceHealth } from './health.ts';
import { Intervention } from './interventions.ts';
import { CardKind, IssueSummary } from './issues.ts';

/** Une station de la ligne et ses profils ; le client la nomme dans sa langue d'après son `id`. */
export const StationView = z.object({
  id: StationId,
  profiles: z.array(z.string()),
});
export type StationView = z.infer<typeof StationView>;

/** Carte sans issue GitHub (watch, triage, onboarding) : la voie annexe de la ligne. */
export const SideCard = z.object({
  id: z.string(),
  title: z.string(),
  kind: CardKind,
  status: KanbanStatus,
  /** `null` : carte sans assigné. */
  assignee: z.string().nullable(),
  openedAt: Timestamp,
  note: z.string().nullable(),
});
export type SideCard = z.infer<typeof SideCard>;

/** Tout ce qu'il faut pour dessiner l'accueil, en un seul envoi. */
export const Snapshot = z.object({
  generatedAt: Timestamp,
  factory: FactoryState,
  stations: z.array(StationView),
  agents: z.array(AgentActivity),
  issues: z.array(IssueSummary),
  sideCards: z.array(SideCard),
  interventions: z.array(Intervention),
  activity: z.array(ActivityEvent),
  health: z.array(ServiceHealth),
});
export type Snapshot = z.infer<typeof Snapshot>;
