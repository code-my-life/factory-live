import { HOOK_TIMEOUT_DEFAULT, HOOK_TIMEOUT_MAX, TOOL_DEADLINE_DEFAULT } from './limits.ts';
import type { LogFact, ProfileFacts } from './types.ts';

/*
 * The guards and their delays: what the factory really leaves to a plugin's hook, what a guard's code can
 * wait for, and the overruns noted in the journal. For the health (latent risks, before any incident) and for
 * the Agents screen.
 */

/**
 * The delay the factory really leaves to a hook: `plugins.hook_callback_timeout` (30 s by default, negative:
 * the default, 600 s at most, 0: no delay), never more than the cap of a tool call, which wraps it
 * (`timeouts.tools.sequential_call`, 420 s by default, 0 or less: none). `null`: no delay cuts the hook.
 */
export function effectiveHookLimit(
  profile: Pick<ProfileFacts, 'hookTimeout' | 'toolDeadline'>,
): number | null {
  const own = profile.hookTimeout;
  const hook =
    own === null || own < 0
      ? HOOK_TIMEOUT_DEFAULT
      : own === 0
        ? null
        : Math.min(own, HOOK_TIMEOUT_MAX);
  const deadline = profile.toolDeadline;
  const tool = deadline === null ? TOOL_DEADLINE_DEFAULT : deadline > 0 ? deadline : null;
  if (hook === null) return tool;
  return tool === null ? hook : Math.min(hook, tool);
}

/** A guard whose code can wait at least its hook's delay, on one agent or more. */
export interface GuardRisk {
  readonly plugin: string;
  /** The agents concerned, in the order given. */
  readonly profiles: readonly string[];
  /** The longest command its code can run (seconds). */
  readonly longest: number;
  /** The effective delay of its hook on these agents (seconds). */
  readonly limit: number;
}

/**
 * The guards at risk: an active plugin that registers a hook and whose code runs a command of at least the
 * effective delay of that hook. Grouped by guard and by delays, one line each.
 */
export function guardRisks(profiles: readonly ProfileFacts[]): GuardRisk[] {
  const risks = new Map<
    string,
    { plugin: string; profiles: string[]; longest: number; limit: number }
  >();
  for (const profile of profiles) {
    const limit = effectiveHookLimit(profile);
    if (limit === null) continue;
    for (const plugin of profile.plugins) {
      const longest = profile.longestCommands?.[plugin];
      if (longest === undefined || longest < limit) continue;
      if (!profile.hooks.some((hook) => hook.plugin === plugin)) continue;
      const key = `${plugin}|${longest}|${limit}`;
      const known = risks.get(key);
      if (known) known.profiles.push(profile.profile);
      else risks.set(key, { plugin, profiles: [profile.profile], longest, limit });
    }
  }
  return [...risks.values()].sort(
    (left, right) =>
      left.plugin.localeCompare(right.plugin) ||
      right.longest - left.longest ||
      left.limit - right.limit,
  );
}

/**
 * The hook overruns noted in an agent's journal, guard by guard. The factory names the callback, not the
 * plugin: a callback two active plugins share (`guard`) counts for neither.
 */
export function hookTimeoutsByPlugin(
  logs: readonly LogFact[],
  profile: Pick<ProfileFacts, 'plugins' | 'hooks'>,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const fact of logs) {
    if (fact.kind !== 'hook_timeout') continue;
    const owners = new Set(
      profile.hooks
        .filter(
          (hook) =>
            hook.callback === fact.callback &&
            (fact.hook === null || hook.hook === fact.hook) &&
            profile.plugins.includes(hook.plugin),
        )
        .map((hook) => hook.plugin),
    );
    if (owners.size !== 1) continue;
    const [plugin] = owners;
    if (plugin) counts.set(plugin, (counts.get(plugin) ?? 0) + 1);
  }
  return counts;
}
