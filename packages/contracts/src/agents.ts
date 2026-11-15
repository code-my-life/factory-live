import { z } from 'zod';
import { IssueKey, StationId, Timestamp } from './common.ts';
import { Text } from './messages.ts';

/**
 * The model actually used, and where the information comes from: `live` (the last call observed),
 * `session` (the usage the factory recorded), `override` (forced on the card), `config` (the agent's
 * configuration).
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

/** An agent of the factory, seen live. */
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

/**
 * The factory's delays that cut an agent's work: a plugin's hook (`hook_callback_timeout`), a tool's cap, hook
 * included (`tool_deadline`), a terminal command, the turns of a run. `value`: set in the agent's config;
 * `null`, the factory's default applies.
 */
export const LimitKey = z.enum([
  'hook_callback_timeout',
  'tool_deadline',
  'terminal_timeout',
  'max_turns',
]);
export type LimitKey = z.infer<typeof LimitKey>;

export const ProfileLimit = z.object({
  key: LimitKey,
  value: z.number().nonnegative().nullable(),
  defaultValue: z.number().nonnegative().nullable(),
  unit: z.enum(['seconds', 'turns']),
});
export type ProfileLimit = z.infer<typeof ProfileLimit>;

/**
 * Un plugin de l'agent : ses refus (l'agent a reçu « <plugin> : ... »), les dépassements de son hook,
 * et la plus longue commande que son code peut lancer, quand elle dépasse le délai du hook (risque).
 */
export const ProfilePlugin = z.object({
  name: z.string(),
  refusals: z.number().int().nonnegative(),
  timeouts: z.number().int().nonnegative().default(0),
  longestSeconds: z.number().nonnegative().nullable().default(null),
});
export type ProfilePlugin = z.infer<typeof ProfilePlugin>;

/** Configuration d'un profil et ses statistiques, pour l'écran Agents. */
export const ProfileView = z.object({
  name: z.string(),
  role: Text,
  station: StationId,
  modelChain: z.array(ModelRef),
  effort: z.string().nullable(),
  toolsets: z.array(z.string()),
  skills: z.array(z.string()),
  plugins: z.array(ProfilePlugin),
  limits: z.array(ProfileLimit).default([]),
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
