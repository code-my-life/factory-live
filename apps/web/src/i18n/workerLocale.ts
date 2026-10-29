import { browserLocale, isLocale } from './locale.ts';
import type { Locale } from './locale.ts';

/*
 * Le service worker n'a pas `localStorage` : la page lui laisse la langue choisie dans le Cache
 * Storage de l'origine, qu'il relit à chaque push pour écrire la notification dans cette langue.
 */
const CACHE = 'factory-live-settings';
const KEY = '/__factory-live/locale';

export async function shareLocaleWithWorker(locale: Locale): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(CACHE);
    await cache.put(KEY, new Response(locale, { headers: { 'Content-Type': 'text/plain' } }));
  } catch {
    // Cache refusé (navigation privée, hôte d'artifact) : les push suivront la langue du navigateur.
  }
}

/** La langue laissée par la page, sinon celle du navigateur. */
export async function workerLocale(language: string | undefined): Promise<Locale> {
  try {
    if (typeof caches !== 'undefined') {
      const response = await (await caches.open(CACHE)).match(KEY);
      const stored = (await response?.text())?.trim();
      if (isLocale(stored)) return stored;
    }
  } catch {
    // Cache illisible : la langue du navigateur.
  }
  return browserLocale(language);
}
