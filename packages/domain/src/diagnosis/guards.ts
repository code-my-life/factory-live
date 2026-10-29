import { HOOK_TIMEOUT_DEFAULT, HOOK_TIMEOUT_MAX, TOOL_DEADLINE_DEFAULT } from './hermesText.ts';
import type { LogFact, ProfileFacts } from './types.ts';

/*
 * Les gardes et leurs délais : ce qu'Hermès laisse vraiment au hook d'un plugin, ce que le code d'une
 * garde peut attendre, et les dépassements notés dans le journal. Pour la santé (risques latents, avant
 * tout incident) et pour l'écran Agents.
 */

/**
 * Le délai qu'Hermès laisse réellement à un hook : `plugins.hook_callback_timeout` (30 s par défaut,
 * négatif : le défaut, 600 s au plus, 0 : aucun délai), jamais plus que le plafond d'un appel d'outil,
 * qui l'englobe (`timeouts.tools.sequential_call`, 420 s par défaut, 0 ou moins : aucun). `null` : aucun
 * délai ne coupe le hook.
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

/** Une garde dont le code peut attendre au moins le délai de son hook, sur un ou plusieurs agents. */
export interface GuardRisk {
  readonly plugin: string;
  /** Les agents concernés, dans l'ordre donné. */
  readonly profiles: readonly string[];
  /** La plus longue commande que son code peut lancer (secondes). */
  readonly longest: number;
  /** Le délai effectif de son hook sur ces agents (secondes). */
  readonly limit: number;
}

/**
 * Les gardes à risque : un plugin actif qui branche un hook et dont le code lance une commande d'au
 * moins le délai effectif de ce hook. Regroupées par garde et par délais, pour une ligne chacune.
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
 * Les dépassements de hook notés dans le journal d'un agent, garde par garde. Hermès nomme le callback,
 * pas le plugin : un callback que deux plugins actifs partagent (`guard`) n'est compté pour aucun.
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
