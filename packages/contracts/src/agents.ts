import { z } from 'zod';
import { IssueKey, StationId, Timestamp } from './common.ts';
import { Text } from './messages.ts';

/**
 * Modèle effectivement utilisé et d'où vient l'information :
 * `live` (dernier appel observé), `session` (usage enregistré par Hermès),
 * `override` (forcé sur la carte), `config` (configuration du profil).
 */
export const ModelRef = z.object({
  model: z.string(),
  provider: z.string(),
  source: z.enum(['live', 'session', 'override', 'config']),
});
export type ModelRef = z.infer<typeof ModelRef>;

/** Ce que fait un agent à l'instant : appel au modèle, outil, ou lane CLI (Claude Code, OpenCode). */
export const CurrentAction = z.object({
  kind: z.enum(['llm', 'tool', 'cli']),
  label: Text,
  detail: z.string().nullable(),
  startedAt: Timestamp,
});
export type CurrentAction = z.infer<typeof CurrentAction>;

export const AgentState = z.enum(['idle', 'queued', 'thinking', 'tool', 'cli', 'blocked']);
export type AgentState = z.infer<typeof AgentState>;

/** Un profil Hermès vu en direct. */
export const AgentActivity = z.object({
  profile: z.string(),
  station: StationId,
  state: AgentState,
  cardId: z.string().nullable(),
  issueKey: IssueKey.nullable(),
  model: ModelRef.nullable(),
  laneModel: ModelRef.nullable(),
  action: CurrentAction.nullable(),
  runStartedAt: Timestamp.nullable(),
  lastHeartbeatAt: Timestamp.nullable(),
});
export type AgentActivity = z.infer<typeof AgentActivity>;

/** Champ de la configuration d'un profil comparé entre le service et le dépôt (le client le nomme). */
export const ConfigField = z.enum([
  'model',
  'baseUrl',
  'fallbacks',
  'effort',
  'toolsets',
  'plugins',
  'outboundHooks',
]);
export type ConfigField = z.infer<typeof ConfigField>;

/** Écart entre la configuration en service et celle du dépôt de la factory ; `null` : rien de réglé. */
export const ConfigDrift = z.object({
  field: ConfigField,
  live: z.string().nullable(),
  repo: z.string().nullable(),
});
export type ConfigDrift = z.infer<typeof ConfigDrift>;

/** Configuration d'un profil et ses statistiques, pour l'écran Agents. */
export const ProfileView = z.object({
  name: z.string(),
  role: Text,
  station: StationId,
  modelChain: z.array(ModelRef),
  effort: z.string().nullable(),
  toolsets: z.array(z.string()),
  skills: z.array(z.string()),
  plugins: z.array(z.object({ name: z.string(), refusals: z.number().int().nonnegative() })),
  mcp: z.array(z.string()),
  drift: z.array(ConfigDrift),
  stats: z.object({
    runs: z.number().int().nonnegative(),
    gatePassRate: z.number().min(0).max(1).nullable(),
    medianRunMinutes: z.number().nonnegative().nullable(),
    costUsd: z.number().nonnegative().nullable(),
  }),
});
export type ProfileView = z.infer<typeof ProfileView>;
