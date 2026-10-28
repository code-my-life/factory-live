import type { ModelLink, ProfileConfig } from './ports.ts';

/** Écarts entre la config en service et celle du dépôt, champ par champ, en texte lisible. */
export function configDrift(
  live: ProfileConfig,
  repo: ProfileConfig,
): { field: string; live: string; repo: string }[] {
  const show = (link: ModelLink | null) => (link ? `${link.model} (${link.provider})` : 'aucun');
  const fields: [string, string, string][] = [
    ['modèle', show(live.model), show(repo.model)],
    ['url du fournisseur', live.baseUrl ?? 'aucune', repo.baseUrl ?? 'aucune'],
    [
      'fallbacks',
      live.fallbacks.map(show).join(', ') || 'aucun',
      repo.fallbacks.map(show).join(', ') || 'aucun',
    ],
    ['effort', live.effort ?? 'défaut', repo.effort ?? 'défaut'],
    ['toolsets', live.toolsets.join(', '), repo.toolsets.join(', ')],
    ['plugins', [...live.plugins].sort().join(', '), [...repo.plugins].sort().join(', ')],
    [
      'webhooks sortants',
      live.outboundHooks.join(', ') || 'aucun',
      repo.outboundHooks.join(', ') || 'aucun',
    ],
  ];
  return fields
    .filter(([, left, right]) => left !== right)
    .map(([field, left, right]) => ({ field, live: left, repo: right }));
}
