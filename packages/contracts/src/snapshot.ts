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

/**
 * Où ouvrir l'app (Réglages, « Installer l'app ») : sur ce PC, et depuis les autres appareils du tailnet.
 * Le serveur les tire de sa configuration (docker/.env) ; `tailnet` vaut `null` s'il n'en a pas.
 */
export const AppAddresses = z.object({
  local: z.url(),
  tailnet: z.url().nullable(),
});
export type AppAddresses = z.infer<typeof AppAddresses>;

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
  addresses: AppAddresses,
});
export type Snapshot = z.infer<typeof Snapshot>;
