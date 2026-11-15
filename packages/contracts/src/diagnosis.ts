import { z } from 'zod';
import { Timestamp } from './common.ts';
import { Text } from './messages.ts';

/*
 * The diagnosis of a blocker: why a card stops, who must act, and whether « Débloquer » is enough. The core
 * (workflow-core) computes it by rules on facts read in the factory's sources (kanban, sessions, journal,
 * agents' config, plugins, worktree), never by a model: each sentence is a code of the `Message` catalogue,
 * each quote a text of the factory or of the agent, as it is.
 */

/** Les causes que factory-live sait reconnaître ; `unexplained` quand aucune règle ne s'applique. */
export const FindingCode = z.enum([
  'guard_hook_timeout',
  'guard_hook_hung',
  'guard_hook_raised',
  'plugin_load_failed',
  'stopped_after_refusals',
  'stopped_without_kanban_call',
  'protocol_breaker',
  'iteration_budget',
  'runtime_limit',
  'tool_deadline',
  'command_timeout',
  'guard_refusal',
  'refusal_loop',
  'provider_quota',
  'provider_terminal',
  'provider_unavailable',
  'pr_acceptance_infra',
  'pr_acceptance_missing',
  'spawn_failed',
  'held_active_pr',
  'triage_loop',
  'question',
  'unexplained',
]);
export type FindingCode = z.infer<typeof FindingCode>;

/** Qui doit agir : toi côté factory (config, plugin), toi par une réponse, l'agent, ou personne (attendre). */
export const Actor = z.enum(['you_factory', 'you_answer', 'agent', 'wait']);
export type Actor = z.infer<typeof Actor>;

/**
 * La cause est-elle encore là ? `fixed` dès que le réglage ou le plugin en cause a changé après
 * l'incident ; `verified` quand l'action qui échouait est repassée ; `durable` quand le dépôt de la
 * factory porte la même valeur (sinon le prochain `./install.sh` l'efface). `none` : rien à corriger.
 */
export const Cause = z.discriminatedUnion('state', [
  z.object({ state: z.literal('present') }),
  z.object({
    state: z.literal('fixed'),
    at: Timestamp,
    verified: z.boolean(),
    durable: z.boolean().nullable(),
  }),
  z.object({ state: z.literal('unknown') }),
  z.object({ state: z.literal('none') }),
]);
export type Cause = z.infer<typeof Cause>;

/** Le réglage en cause : la limite observée à l'incident, la valeur en service, celle du dépôt. */
export const Setting = z.object({
  profile: z.string(),
  key: z.string(),
  unit: z.enum(['seconds', 'turns']),
  observed: z.number().nonnegative().nullable(),
  /** `null`: absent from the config, the factory's default applies. */
  current: z.number().nonnegative().nullable(),
  defaultValue: z.number().nonnegative().nullable(),
  /** The limit really applied, the factory's caps included (the tools' cap wraps the hook). */
  effective: z.number().nonnegative().nullable(),
  repo: z.number().nonnegative().nullable(),
});
export type Setting = z.infer<typeof Setting>;

export const EvidenceSource = z.enum([
  'kanban',
  'transcript',
  'webhook',
  'agent_log',
  'config',
  'plugin',
  'workspace',
]);
export type EvidenceSource = z.infer<typeof EvidenceSource>;

/** Un fait qui fonde le diagnostic : ce qu'en dit factory-live, et la citation exacte de la source. */
export const Evidence = z.object({
  source: EvidenceSource,
  at: Timestamp.nullable(),
  /** Fin d'une plage (« 17 outils refusés entre 09:35 et 09:47 »). */
  until: Timestamp.nullable(),
  runId: z.number().int().positive().nullable(),
  fact: Text,
  /** A text of the factory, of a tool or of the agent, as it is: cut, its secrets masked. */
  quote: z.string().max(400).nullable(),
  count: z.number().int().positive().nullable(),
});
export type Evidence = z.infer<typeof Evidence>;

/** Une étape de « Que faire », avec la commande exacte quand il y en a une. */
export const Step = z.object({
  text: Text,
  command: z.string().nullable(),
  done: z.boolean(),
});
export type Step = z.infer<typeof Step>;

export const Finding = z.object({
  code: FindingCode,
  confidence: z.enum(['certain', 'likely']),
  actor: Actor,
  cause: Cause,
  /** Une ligne, pour la liste, la bannière de l'issue et la notification. */
  summary: Text,
  /** Le mécanisme, en une ou deux phrases. */
  why: Text,
  subject: z.object({
    profile: z.string().nullable(),
    plugin: z.string().nullable(),
    tool: z.string().nullable(),
  }),
  setting: Setting.nullable(),
  evidence: z.array(Evidence).max(8),
  steps: z.array(Step).max(6),
  runIds: z.array(z.number().int().positive()),
});
export type Finding = z.infer<typeof Finding>;

/**
 * Ce qu'il s'est passé dans un run de l'épisode. `role` : le run est la cause de son propre échec (le
 * modèle s'est arrêté seul), ou il a subi la conséquence d'une cause (outils refusés par une garde ou
 * par la factory).
 */
export const RunVerdict = z.object({
  runId: z.number().int().positive(),
  finding: FindingCode.nullable(),
  role: z.enum(['cause', 'consequence']).nullable(),
  text: Text,
  sessionId: z.string().nullable(),
});
export type RunVerdict = z.infer<typeof RunVerdict>;

/** Un fichier de preuve laissé par l'agent dans `evidence/` de son worktree. */
export const EvidenceFile = z.object({
  name: z.string(),
  bytes: z.number().int().nonnegative(),
  at: Timestamp,
});
export type EvidenceFile = z.infer<typeof EvidenceFile>;

/** Où en est le travail de la carte : ce qui est fait, commité, poussé, prouvé. */
export const WorkState = z.object({
  branch: z.string().nullable(),
  commits: z.enum(['none', 'some', 'unknown']),
  commitsRefused: z.number().int().nonnegative(),
  pushed: z.enum(['yes', 'no', 'unknown']),
  prUrl: z.url().nullable(),
  editedFiles: z.number().int().nonnegative(),
  evidence: z.array(EvidenceFile).max(50),
});
export type WorkState = z.infer<typeof WorkState>;

/**
 * Quand débloquer : maintenant, après la correction (la cause est encore là), par une réponse, en
 * attendant, ou jamais d'ici. `template` préremplit la réponse ; `nextBlock` dit où part la carte si
 * elle rebloque pour la même raison (le noyau la passe en triage au 2e blocage du même type).
 */
export const UnblockAdvice = z.object({
  when: z.enum(['now', 'after_fix', 'answer', 'wait', 'not_unblockable']),
  template: Text.nullable(),
  nextBlock: z.enum(['blocked', 'triage']).nullable(),
});
export type UnblockAdvice = z.infer<typeof UnblockAdvice>;

export const Diagnosis = z.object({
  computedAt: Timestamp,
  /** Les runs examinés : depuis le dernier déblocage, la création ou une reprise à la main. */
  episode: z.object({ from: Timestamp, runIds: z.array(z.number().int().positive()) }),
  primary: Finding,
  others: z.array(Finding).max(4),
  unblock: UnblockAdvice,
  runs: z.array(RunVerdict),
  work: WorkState.nullable(),
  /** Les sources lues : une source absente rend certaines conclusions seulement probables. */
  sources: z.object({
    transcript: z.boolean(),
    agentLog: z.boolean(),
    config: z.boolean(),
    workspace: z.boolean(),
  }),
});
export type Diagnosis = z.infer<typeof Diagnosis>;
