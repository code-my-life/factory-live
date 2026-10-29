import { formatters } from '../ui/format.ts';
import type { Formatters } from '../ui/format.ts';
import { en } from './en.ts';
import { fr } from './fr.ts';
import type { Messages } from './fr.ts';
import type { Locale } from './locale.ts';

/**
 * Tout ce qu'il faut pour écrire dans une langue : ses textes (`t`) et ses formats (`fmt`).
 * Sans React, pour les fonctions utilitaires, les tests et le service worker.
 */
export interface I18n {
  readonly locale: Locale;
  readonly t: Messages;
  readonly fmt: Formatters;
}

export const DICTIONARIES: Readonly<Record<Locale, Messages>> = { fr, en };

const cache = new Map<Locale, I18n>();

export function i18nOf(locale: Locale): I18n {
  let found = cache.get(locale);
  if (!found) {
    found = { locale, t: DICTIONARIES[locale], fmt: formatters(locale) };
    cache.set(locale, found);
  }
  return found;
}
