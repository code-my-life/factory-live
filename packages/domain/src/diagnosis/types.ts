import type { Run, Task, TaskEvent } from '../hermes.ts';
import type { Message, NoParams } from '../messages.ts';

/*
 * Le diagnostic d'un blocage, côté domaine : horodatages en secondes epoch, textes en codes du
 * catalogue (`diagnosis.*`). Le serveur le convertit en contrat `Diagnosis` ; la compilation vérifie
 * que chaque code émis ici existe dans le catalogue, avec les mêmes paramètres.
 */

export type FindingCode =
  | 'guard_hook_timeout'
  | 'guard_hook_hung'
  | 'guard_hook_raised'
  | 'plugin_load_failed'
  | 'stopped_after_refusals'
  | 'stopped_without_kanban_call'
  | 'protocol_breaker'
  | 'iteration_budget'
  | 'runtime_limit'
  | 'tool_deadline'
  | 'command_timeout'
  | 'guard_refusal'
  | 'refusal_loop'
  | 'provider_quota'
  | 'provider_terminal'
  | 'provider_unavailable'
  | 'pr_acceptance_infra'
  | 'pr_acceptance_missing'
  | 'spawn_failed'
  | 'held_active_pr'
  | 'triage_loop'
  | 'question'
  | 'unexplained';

export type Actor = 'you_factory' | 'you_answer' | 'agent' | 'wait';

export type Cause =
  | { readonly state: 'present' }
  | {
      readonly state: 'fixed';
      readonly at: number;
      readonly verified: boolean;
      readonly durable: boolean | null;
    }
  | { readonly state: 'unknown' }
  | { readonly state: 'none' };

/** Un nombre de secondes, ou rien quand l'information manque. */
type Seconds = { seconds: number };

export type DiagnosisMessage =
  | Message<'diagnosis.summary.guardHookTimeout', { plugin: string | null } & Seconds>
  | Message<'diagnosis.summary.guardHookHung', { plugin: string | null }>
  | Message<'diagnosis.summary.guardHookRaised', { plugin: string | null }>
  | Message<'diagnosis.summary.pluginLoadFailed', { plugin: string }>
  | Message<'diagnosis.summary.stoppedAfterRefusals', NoParams>
  | Message<'diagnosis.summary.stoppedWithoutKanbanCall', { count: number }>
  | Message<'diagnosis.summary.protocolBreaker', { count: number }>
  | Message<'diagnosis.summary.iterationBudget', { max: number }>
  | Message<'diagnosis.summary.runtimeLimit', Seconds>
  | Message<'diagnosis.summary.toolDeadline', { tool: string } & Seconds>
  | Message<'diagnosis.summary.commandTimeout', Seconds>
  | Message<'diagnosis.summary.guardRefusal', { plugin: string }>
  | Message<'diagnosis.summary.refusalLoop', { plugin: string; count: number }>
  | Message<'diagnosis.summary.providerQuota', { provider: string | null }>
  | Message<'diagnosis.summary.providerTerminal', { provider: string | null }>
  | Message<
      'diagnosis.summary.providerUnavailable',
      { mode: 'stalled' | 'failing'; seconds: number | null }
    >
  | Message<'diagnosis.summary.prAcceptanceInfra', NoParams>
  | Message<'diagnosis.summary.prAcceptanceMissing', NoParams>
  | Message<'diagnosis.summary.spawnFailed', NoParams>
  | Message<'diagnosis.summary.heldActivePr', { minutes: number }>
  | Message<'diagnosis.summary.triageLoop', NoParams>
  | Message<'diagnosis.summary.question', NoParams>
  | Message<'diagnosis.summary.unexplained', NoParams>
  | Message<
      'diagnosis.why.guardHookTimeout',
      { plugin: string | null; trigger: string | null } & Seconds
    >
  | Message<'diagnosis.why.guardHookHung', { plugin: string | null; workers: number | null }>
  | Message<'diagnosis.why.guardHookRaised', { plugin: string | null }>
  | Message<'diagnosis.why.pluginLoadFailed', { plugin: string }>
  | Message<'diagnosis.why.stoppedAfterRefusals', NoParams>
  | Message<'diagnosis.why.stoppedWithoutKanbanCall', { nudges: number | null }>
  | Message<'diagnosis.why.protocolBreaker', { count: number }>
  | Message<'diagnosis.why.iterationBudget', { used: number; max: number }>
  | Message<'diagnosis.why.runtimeLimit', Seconds & { limit: number }>
  | Message<'diagnosis.why.toolDeadline', { tool: string } & Seconds>
  | Message<'diagnosis.why.commandTimeout', Seconds>
  | Message<'diagnosis.why.guardRefusal', { plugin: string }>
  | Message<'diagnosis.why.refusalLoop', { plugin: string; count: number }>
  | Message<'diagnosis.why.providerQuota', { provider: string | null }>
  | Message<'diagnosis.why.providerTerminal', { provider: string | null }>
  | Message<
      'diagnosis.why.providerUnavailable',
      { mode: 'stalled' | 'failing'; seconds: number | null }
    >
  | Message<'diagnosis.why.prAcceptanceInfra', NoParams>
  | Message<'diagnosis.why.prAcceptanceMissing', { checks: boolean }>
  | Message<'diagnosis.why.spawnFailed', NoParams>
  | Message<'diagnosis.why.heldActivePr', NoParams>
  | Message<'diagnosis.why.triageLoop', NoParams>
  | Message<'diagnosis.why.question', NoParams>
  | Message<'diagnosis.why.unexplained', NoParams>
  | Message<'diagnosis.step.setValue', { key: string; value: number; profile: string }>
  | Message<'diagnosis.step.reportInRepo', { path: string }>
  | Message<'diagnosis.step.verifyValue', { key: string }>
  | Message<'diagnosis.step.unblockWithTemplate', NoParams>
  | Message<'diagnosis.step.answer', NoParams>
  | Message<'diagnosis.step.fixPlugin', { plugin: string }>
  | Message<'diagnosis.step.reinstall', NoParams>
  | Message<'diagnosis.step.chooseModel', NoParams>
  | Message<'diagnosis.step.giveCommand', NoParams>
  | Message<'diagnosis.step.wait', { minutes: number }>
  | Message<'diagnosis.step.checkProvider', { provider: string | null }>
  | Message<'diagnosis.step.relay', { owner: string }>
  | Message<'diagnosis.step.leaveTriage', NoParams>
  | Message<'diagnosis.step.raiseLimit', { key: string; profile: string }>
  | Message<'diagnosis.step.updateGh', NoParams>
  | Message<'diagnosis.step.configureChecks', NoParams>
  | Message<'diagnosis.step.fixWorkspace', NoParams>
  | Message<'diagnosis.evidence.toolRefusals', { count: number; tools: string }>
  | Message<'diagnosis.evidence.hookTimedOut', { callback: string } & Seconds>
  | Message<'diagnosis.evidence.trigger', { tool: string }>
  | Message<'diagnosis.evidence.settingMissing', { key: string } & Seconds>
  | Message<'diagnosis.evidence.settingValue', { key: string; value: number }>
  | Message<'diagnosis.evidence.settingChanged', { key: string; value: number }>
  | Message<'diagnosis.evidence.toolDeadlineCap', Seconds>
  | Message<'diagnosis.evidence.pluginHook', { plugin: string; callback: string; hook: string }>
  | Message<'diagnosis.evidence.workerExited', NoParams>
  | Message<'diagnosis.evidence.stopNudges', { count: number }>
  | Message<'diagnosis.evidence.guardMessage', { plugin: string; count: number }>
  | Message<'diagnosis.evidence.commitPassed', Seconds>
  | Message<'diagnosis.evidence.breaker', { count: number }>
  | Message<'diagnosis.evidence.apiErrors', { count: number; provider: string | null }>
  | Message<'diagnosis.evidence.lastSignals', { count: number }>
  | Message<'diagnosis.evidence.kanbanErrors', { count: number; tool: string }>
  | Message<'diagnosis.evidence.prAcceptance', { classification: string; count: number }>
  | Message<'diagnosis.evidence.spawnError', NoParams>
  | Message<'diagnosis.evidence.workerOutput', NoParams>
  | Message<'diagnosis.evidence.budget', { used: number; max: number }>
  | Message<'diagnosis.run.modelStopped', NoParams>
  | Message<'diagnosis.run.refusedThenStopped', { count: number }>
  | Message<'diagnosis.run.blockedAfterRefusals', { count: number }>
  | Message<'diagnosis.run.breaker', NoParams>
  | Message<'diagnosis.run.timedOut', NoParams>
  | Message<'diagnosis.run.quota', NoParams>
  | Message<'diagnosis.run.refusalLoop', { count: number }>
  | Message<'diagnosis.run.providerUnavailable', NoParams>
  | Message<'diagnosis.run.spawnFailed', NoParams>
  | Message<'diagnosis.run.prAcceptance', NoParams>
  | Message<'diagnosis.run.question', NoParams>
  | Message<'diagnosis.run.unexplained', { outcome: string }>
  | Message<
      'diagnosis.unblock.hookTimeoutFixed',
      {
        plugin: string | null;
        value: number;
        branch: string | null;
        committed: boolean;
        evidence: number | null;
      } & Seconds
    >
  | Message<'diagnosis.unblock.causeFixed', { branch: string | null }>
  | Message<'diagnosis.unblock.refusalLoop', { plugin: string; refusal: string }>
  | Message<'diagnosis.unblock.finishWithKanbanCall', NoParams>;

export type EvidenceSource =
  'kanban' | 'transcript' | 'webhook' | 'agent_log' | 'config' | 'plugin' | 'workspace';

export interface Evidence {
  readonly source: EvidenceSource;
  readonly at: number | null;
  readonly until: number | null;
  readonly runId: number | null;
  readonly fact: DiagnosisMessage;
  /** Texte d'Hermès, d'un outil ou de l'agent, tel quel : secrets masqués, coupé. */
  readonly quote: string | null;
  readonly count: number | null;
}

export interface Step {
  readonly text: DiagnosisMessage;
  readonly command: string | null;
  readonly done: boolean;
}

export interface Setting {
  readonly profile: string;
  readonly key: string;
  readonly unit: 'seconds' | 'turns';
  readonly observed: number | null;
  readonly current: number | null;
  readonly defaultValue: number | null;
  readonly effective: number | null;
  readonly repo: number | null;
}

export interface Finding {
  readonly code: FindingCode;
  readonly confidence: 'certain' | 'likely';
  readonly actor: Actor;
  readonly cause: Cause;
  readonly summary: DiagnosisMessage;
  readonly why: DiagnosisMessage;
  readonly subject: {
    readonly profile: string | null;
    readonly plugin: string | null;
    readonly tool: string | null;
  };
  readonly setting: Setting | null;
  readonly evidence: readonly Evidence[];
  readonly steps: readonly Step[];
  /** Les runs où la cause s'est manifestée, dans l'ordre. */
  readonly runIds: readonly number[];
}

export interface RunVerdict {
  readonly runId: number;
  readonly finding: FindingCode | null;
  readonly role: 'cause' | 'consequence' | null;
  readonly text: DiagnosisMessage;
  readonly sessionId: string | null;
}

export interface EvidenceFile {
  readonly name: string;
  readonly bytes: number;
  readonly at: number;
}

export interface WorkState {
  readonly branch: string | null;
  readonly commits: 'none' | 'some' | 'unknown';
  readonly commitsRefused: number;
  readonly pushed: 'yes' | 'no' | 'unknown';
  readonly prUrl: string | null;
  readonly editedFiles: number;
  readonly evidence: readonly EvidenceFile[];
}

export interface UnblockAdvice {
  readonly when: 'now' | 'after_fix' | 'answer' | 'wait' | 'not_unblockable';
  readonly template: DiagnosisMessage | null;
  readonly nextBlock: 'blocked' | 'triage' | null;
}

export interface Diagnosis {
  readonly computedAt: number;
  readonly episode: { readonly from: number; readonly runIds: readonly number[] };
  readonly primary: Finding;
  readonly others: readonly Finding[];
  readonly unblock: UnblockAdvice;
  readonly runs: readonly RunVerdict[];
  readonly work: WorkState | null;
  readonly sources: {
    readonly transcript: boolean;
    readonly agentLog: boolean;
    readonly config: boolean;
    readonly workspace: boolean;
  };
}

/* ------------------------------------------------------------------------------------------------
 * Les faits d'entrée, lus par les adaptateurs du serveur dans les sources d'Hermès.
 * ---------------------------------------------------------------------------------------------- */

/** Un appel d'outil de l'agent (message `assistant`, colonne `tool_calls` de `state.db`). */
export interface ToolCallFact {
  readonly at: number;
  readonly tool: string;
  /** La commande du terminal, sinon le chemin ou le nom passé à l'outil ; `null` sans argument parlant. */
  readonly input: string | null;
  readonly callId: string | null;
}

/** Le résultat d'un outil (message `tool` de `state.db`), contenu tel quel (coupé par l'adaptateur). */
export interface ToolResultFact {
  readonly at: number;
  readonly tool: string;
  readonly callId: string | null;
  readonly content: string;
}

export interface SessionFacts {
  readonly id: string;
  /** Le run auquel l'adaptateur a rattaché la session ; `null` s'il n'a pas pu. */
  readonly runId: number | null;
  readonly calls: readonly ToolCallFact[];
  readonly results: readonly ToolResultFact[];
}

export type LogFactKind =
  | 'hook_timeout'
  | 'hook_skipped'
  | 'hook_abandoned'
  | 'hook_raised'
  | 'plugin_load_failed'
  | 'stop_nudge'
  | 'turn_ended'
  | 'tool_deadline'
  | 'api_failed';

/** Une ligne cataloguée du journal d'Hermès (`logs/agent.log` de l'agent), déjà datée. */
export interface LogFact {
  readonly at: number;
  readonly sessionId: string | null;
  readonly kind: LogFactKind;
  readonly hook: string | null;
  readonly callback: string | null;
  /** Le module Python du plugin (`hermes_plugins.<nom>`), quand Hermès le nomme. */
  readonly module: string | null;
  readonly seconds: number | null;
  readonly plugin: string | null;
  readonly detail: string | null;
  readonly count: number | null;
  /** Le message de la ligne, tel quel. */
  readonly line: string;
}

/** Un hook branché par un plugin (`register_hook("<hook>", <callback>)` dans ses sources). */
export interface PluginHook {
  readonly plugin: string;
  readonly hook: string;
  readonly callback: string;
  /** La ligne d'enregistrement, telle quelle. */
  readonly source: string;
}

/** La config en service de l'agent (`profiles/<agent>/config.yaml`) et celle du dépôt. */
export interface ProfileFacts {
  readonly profile: string;
  /** `plugins.hook_callback_timeout` ; `null` : absent, la valeur par défaut d'Hermès s'applique. */
  readonly hookTimeout: number | null;
  /** `timeouts.tools.sequential_call`, qui englobe le hook. */
  readonly toolDeadline: number | null;
  readonly terminalTimeout: number | null;
  readonly maxTurns: number | null;
  /** Dernière modification du fichier en service (secondes epoch). */
  readonly changedAt: number | null;
  /** La même clé dans le dépôt de la factory : `undefined` quand le dépôt n'est pas lisible. */
  readonly repoHookTimeout?: number | null;
  readonly plugins: readonly string[];
  readonly hooks: readonly PluginHook[];
}

export interface DiagnosisInput {
  readonly now: number;
  readonly board: string;
  readonly task: Task;
  /** Les runs de la carte, tous. */
  readonly runs: readonly Run[];
  /** Les événements de la carte, tous. */
  readonly events: readonly TaskEvent[];
  /** L'événement que l'intervention raconte (blocage, abandon, boucle) ; `null` : le dernier. */
  readonly anchor: TaskEvent | null;
  /** `null` : les sessions de l'agent sont illisibles. */
  readonly sessions: readonly SessionFacts[] | null;
  /** `null` : le journal d'Hermès est illisible. */
  readonly logs: readonly LogFact[] | null;
  readonly profile: ProfileFacts | null;
  /** `null` : le worktree est illisible. */
  readonly evidence: readonly EvidenceFile[] | null;
  readonly branch: string | null;
  readonly prUrl: string | null;
  /** L'agent d'origine d'une carte retenue, pour la commande de relais. */
  readonly owner?: string | null;
}
