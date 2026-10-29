import { z } from 'zod';
import { Timestamp } from './common.ts';
import { Text } from './messages.ts';

export const HealthStatus = z.enum(['ok', 'degraded', 'down', 'unknown']);
export type HealthStatus = z.infer<typeof HealthStatus>;

/** État d'un service de la factory, vu par la sonde ou déduit des signaux passifs. */
export const ServiceHealth = z.object({
  id: z.string(),
  /** Tels que la sonde les envoie, ou fabriqués par factory-live pour ce qu'il observe lui-même. */
  label: Text,
  group: z.enum(['hermes', 'models', 'tools', 'intake', 'factory-live']),
  status: HealthStatus,
  detail: Text,
  checkedAt: Timestamp.nullable(),
  metrics: z.array(z.object({ label: Text, value: Text })),
});
export type ServiceHealth = z.infer<typeof ServiceHealth>;

export const FactoryState = z.object({
  live: z.boolean(),
  paused: z.boolean(),
  pauseReason: z.string().nullable(),
  maxInProgress: z.number().int().positive(),
  running: z.number().int().nonnegative(),
});
export type FactoryState = z.infer<typeof FactoryState>;
