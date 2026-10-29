import { z } from 'zod';
import { IssueKey, Severity, Timestamp } from './common.ts';
import { Diagnosis } from './diagnosis.ts';
import { Text } from './messages.ts';

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
  z.object({ kind: z.literal('copy'), label: Text, command: z.string() }),
  z.object({ kind: z.literal('link'), label: Text, url: z.url() }),
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
  /** Première ligne de la raison donnée par l'agent, sinon un titre de factory-live. */
  title: Text,
  issueKey: IssueKey.nullable(),
  cardId: z.string().nullable(),
  profile: z.string().nullable(),
  /** La raison entière, telle que l'agent l'a écrite, sinon une explication de factory-live. */
  question: Text,
  openedAt: Timestamp,
  push: z.boolean(),
  actions: z.array(InterventionAction),
  unblock: UnblockProgress.nullable(),
  /** Pourquoi la carte bloque, calculé par des règles ; `null` quand rien n'est à expliquer. */
  diagnosis: Diagnosis.nullable().default(null),
  /** Débloquée : l'intervention reste visible un temps pour suivre la reprise de la carte. */
  resolvedAt: Timestamp.nullable().default(null),
  /** Le run lancé après le déblocage : en cours, puis son issue, et s'il rebloque pour la même cause. */
  followUp: z
    .object({
      runId: z.number().int().positive(),
      outcome: z.string().nullable(),
      sameCause: z.boolean().nullable(),
    })
    .nullable()
    .default(null),
});
export type Intervention = z.infer<typeof Intervention>;

/**
 * La réponse postée sur l'issue. `acknowledgeCause` : débloquer malgré une cause encore présente côté
 * factory (le serveur refuse sinon, `cause_present`).
 */
export const UnblockRequest = z.object({
  text: z.string().trim().min(1).max(4000),
  acknowledgeCause: z.boolean().default(false),
});
export type UnblockRequest = z.infer<typeof UnblockRequest>;
