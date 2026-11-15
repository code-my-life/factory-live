/*
 * The facts of an agent the server's ports describe: its config in service, the catalogued lines of its
 * journal, its sessions and the evidence of its card.
 */

export interface EvidenceFile {
  readonly name: string;
  readonly bytes: number;
  readonly at: number;
}

/** A tool call of the agent. */
export interface ToolCallFact {
  readonly at: number;
  readonly tool: string;
  /** The terminal command, else the path or name given to the tool; `null` without a telling argument. */
  readonly input: string | null;
  readonly callId: string | null;
}

/** A tool's result, its content as it is (cut by the adapter). */
export interface ToolResultFact {
  readonly at: number;
  readonly tool: string;
  readonly callId: string | null;
  readonly content: string;
}

export interface SessionFacts {
  readonly id: string;
  /** The run the adapter tied the session to; `null` if it could not. */
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

/** A catalogued line of the agent's journal, already dated. */
export interface LogFact {
  readonly at: number;
  readonly sessionId: string | null;
  readonly kind: LogFactKind;
  readonly hook: string | null;
  readonly callback: string | null;
  /** The plugin's Python module, when the line names it. */
  readonly module: string | null;
  readonly seconds: number | null;
  readonly plugin: string | null;
  readonly detail: string | null;
  readonly count: number | null;
  /** The line's message, as it is. */
  readonly line: string;
}

/** A hook a plugin registers (`register_hook("<hook>", <callback>)` in its sources). */
export interface PluginHook {
  readonly plugin: string;
  readonly hook: string;
  readonly callback: string;
  /** The registering line, as it is. */
  readonly source: string;
}

/** The agent's config in service, as the core serves it. */
export interface ProfileFacts {
  readonly profile: string;
  /** `plugins.hook_callback_timeout`; `null`: absent, the factory's default applies. */
  readonly hookTimeout: number | null;
  /** `timeouts.tools.sequential_call`, which wraps the hook. */
  readonly toolDeadline: number | null;
  readonly terminalTimeout: number | null;
  readonly maxTurns: number | null;
  /** The last change of the file in service (epoch seconds). */
  readonly changedAt: number | null;
  /** The same key in the factory's repository: `undefined` when the repository cannot be read. */
  readonly repoHookTimeout?: number | null;
  readonly plugins: readonly string[];
  readonly hooks: readonly PluginHook[];
  /** The longest command each plugin's code can run (literal `timeout=`, seconds). */
  readonly longestCommands?: Readonly<Record<string, number>>;
}
