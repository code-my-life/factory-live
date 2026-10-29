import { z } from 'zod';
import { StationId } from './common.ts';
import { Text } from './messages.ts';

/** Consommation agrégée par modèle et fournisseur, sur une période. */
export const ModelUsage = z.object({
  model: z.string(),
  provider: z.string(),
  calls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().nullable(),
  rateLimited: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});
export type ModelUsage = z.infer<typeof ModelUsage>;

export const UsageReport = z.object({
  periodDays: z.number().int().positive(),
  models: z.array(ModelUsage),
  byProfile: z.array(z.object({ profile: z.string(), tokens: z.number().int().nonnegative() })),
  daily: z.array(
    z.object({
      day: z.string(),
      tokens: z.number().int().nonnegative(),
      rateLimited: z.number().int().nonnegative(),
    }),
  ),
  claudeSubscriptionNote: Text,
});
export type UsageReport = z.infer<typeof UsageReport>;

/** Statistiques de parcours, pour l'écran Historique. */
export const HistoryStats = z.object({
  periodDays: z.number().int().positive(),
  issuesDone: z.number().int().nonnegative(),
  medianLeadTimeMinutes: z.number().nonnegative().nullable(),
  stationMinutes: z.array(
    z.object({ station: StationId, medianMinutes: z.number().nonnegative() }),
  ),
  /** `model` : le modèle Claude de la lane, `null` pour le modèle de l'agent lui-même. */
  gatePassRate: z.array(
    z.object({
      harness: z.string(),
      model: z.string().nullable(),
      runs: z.number().int(),
      rate: z.number(),
    }),
  ),
  blocks: z.number().int().nonnegative(),
  medianHumanResponseMinutes: z.number().nonnegative().nullable(),
  recent: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      outcome: z.enum(['merged', 'stopped', 'closed']),
      leadTimeMinutes: z.number().nonnegative(),
      finishedAt: z.iso.datetime(),
      version: z.string().nullable(),
    }),
  ),
});
export type HistoryStats = z.infer<typeof HistoryStats>;
