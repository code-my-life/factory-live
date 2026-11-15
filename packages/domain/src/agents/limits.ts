/*
 * The factory's delays and the marker of an agent's nudge, as the factory writes them: the defaults the Agents
 * screen shows when the core does not give them, and the nudge a timeline points out.
 */

/** `plugins.hook_callback_timeout` by default, and its maximum. */
export const HOOK_TIMEOUT_DEFAULT = 30;
export const HOOK_TIMEOUT_MAX = 600;
/** `timeouts.tools.sequential_call` by default: the cap of a tool call, hooks included. */
export const TOOL_DEADLINE_DEFAULT = 420;
/** `terminal.timeout` by default: the delay of a terminal command. */
export const TERMINAL_TIMEOUT_DEFAULT = 180;

const NUDGE_MARKER = 'Kanban worker tried to exit without a terminal board call';

/** The factory nudged the agent to hand the card back before letting it exit. */
export function wasNudged(workerOutput: string | null | undefined): boolean {
  return !!workerOutput && workerOutput.includes(NUDGE_MARKER);
}
