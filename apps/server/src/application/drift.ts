import type { ConfigDrift, ConfigField } from '@factory-live/contracts';
import type { ModelLink, ProfileConfig } from './ports.ts';

/**
 * Écarts entre la config en service et celle du dépôt, champ par champ. Les valeurs sont celles de la
 * config (modèles, URL, noms) ; `null` quand rien n'est réglé, et le client nomme champ et absence.
 * Les plugins se comparent à `factory.yaml` quand il les liste : `install.sh` les active d'après lui,
 * le `config.yaml` du dépôt ne les nomme pas.
 */
export function configDrift(
  live: ProfileConfig,
  repo: ProfileConfig,
  manifestPlugins: readonly string[] | null = null,
): ConfigDrift[] {
  const show = (link: ModelLink) => `${link.model} (${link.provider})`;
  const list = (values: readonly string[]) => (values.length > 0 ? values.join(', ') : null);
  const fields: [ConfigField, string | null, string | null][] = [
    ['model', live.model && show(live.model), repo.model && show(repo.model)],
    ['baseUrl', live.baseUrl, repo.baseUrl],
    ['fallbacks', list(live.fallbacks.map(show)), list(repo.fallbacks.map(show))],
    ['effort', live.effort, repo.effort],
    ['toolsets', list(live.toolsets), list(repo.toolsets)],
    [
      'plugins',
      list([...live.plugins].sort()),
      list([...(manifestPlugins ?? repo.plugins)].sort()),
    ],
    ['outboundHooks', list(live.outboundHooks), list(repo.outboundHooks)],
  ];
  return fields
    .filter(([, left, right]) => left !== right)
    .map(([field, left, right]) => ({ field, live: left, repo: right }));
}
