import type { HealthStatus, StationId } from '@factory-live/contracts';

/**
 * Le vocabulaire de la factory (stations, états, types de cartes…) s'écrit dans chaque langue : il
 * vit dans les dictionnaires (`i18n/fr.ts`, `i18n/en.ts`) et se lit par `useI18n().t`. Restent ici les
 * noms propres, identiques dans toutes les langues, et les règles qui ne sont pas du texte.
 */
export const LINE_STATIONS: readonly StationId[] = [
  'intake',
  'brief',
  'implementation',
  'gate',
  'release',
  'done',
];

export const PROVIDER_LABEL: Record<string, string> = {
  freellmapi: 'freellmapi',
  nvidia: 'NVIDIA',
  llamacpp: 'llama.cpp',
  moa: 'MoA',
  anthropic: 'Claude',
  'claude-code': 'Claude',
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABEL[provider] ?? provider;
}

/** À surveiller : un service dégradé ou en panne. « Inconnu » (rien observé) reste neutre, comme sa pastille grise. */
export function needsWatch(status: HealthStatus): boolean {
  return status === 'degraded' || status === 'down';
}
