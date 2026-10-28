import { z } from 'zod';
import { IssueKey, Severity, Timestamp } from './common.ts';

export const InterventionKind = z.enum([
  'needs_input',
  'capability',
  'transient',
  'gave_up',
  'triage_loop',
  'held_active_pr',
  'pr_approval',
  'main_red',
  'service_down',
]);
export type InterventionKind = z.infer<typeof InterventionKind>;

/** Ce que l'outil propose pour répondre : débloquer, copier une commande, ou ouvrir un lien. */
export const InterventionAction = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unblock') }),
  z.object({ kind: z.literal('copy'), label: z.string(), command: z.string() }),
  z.object({ kind: z.literal('link'), label: z.string(), url: z.url() }),
]);
export type InterventionAction = z.infer<typeof InterventionAction>;

/** Suivi d'un déblocage : envoyé sur l'issue, accepté par le bot, carte repartie. */
export const UnblockProgress = z.object({
  state: z.enum(['sent', 'acknowledged', 'resumed', 'rejected']),
  text: z.string(),
  commentUrl: z.url().nullable(),
  at: Timestamp,
});
export type UnblockProgress = z.infer<typeof UnblockProgress>;

export const Intervention = z.object({
  id: z.string(),
  kind: InterventionKind,
  severity: Severity,
  title: z.string(),
  issueKey: IssueKey.nullable(),
  cardId: z.string().nullable(),
  profile: z.string().nullable(),
  question: z.string(),
  openedAt: Timestamp,
  push: z.boolean(),
  actions: z.array(InterventionAction),
  unblock: UnblockProgress.nullable(),
});
export type Intervention = z.infer<typeof Intervention>;

export const UnblockRequest = z.object({ text: z.string().trim().min(1).max(4000) });
export type UnblockRequest = z.infer<typeof UnblockRequest>;
