import { z } from 'zod';
import { Timestamp } from './common.ts';
import { Text } from './messages.ts';
import { FACTORY_RUNTIME } from './runtime.ts';

export const HealthStatus = z.enum(['ok', 'degraded', 'down', 'unknown']);
export type HealthStatus = z.infer<typeof HealthStatus>;

/** The state of a service of the factory, checked by the core or deduced from passive signals. */
export const ServiceHealth = z.object({
  id: z.string(),
  /** As the core sends them, or made by factory-live for what it observes itself. */
  label: Text,
  group: z.enum([FACTORY_RUNTIME, 'models', 'tools', 'intake', 'factory-live']),
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
