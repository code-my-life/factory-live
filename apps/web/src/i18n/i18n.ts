import type { Message, Text } from '@factory-live/contracts';
import { formatters } from '../ui/format.ts';
import type { Formatters } from '../ui/format.ts';
import { en } from './en.ts';
import { fr } from './fr.ts';
import type { Messages } from './fr.ts';
import type { Locale } from './locale.ts';

/**
 * Tout ce qu'il faut pour écrire dans une langue : ses textes (`t`), ses formats (`fmt`) et les textes
 * venus du serveur (`text`). Sans React, pour les fonctions utilitaires, les tests et le service worker.
 */
export interface I18n {
  readonly locale: Locale;
  readonly t: Messages;
  readonly fmt: Formatters;
  /**
   * Un texte du serveur : tel quel s'il vient d'ailleurs (agent, outil, sonde, GitHub), écrit dans la
   * langue s'il est fabriqué par factory-live (un code et ses paramètres).
   */
  readonly text: (value: Text) => string;
}

export const DICTIONARIES: Readonly<Record<Locale, Messages>> = { fr, en };

/** Un code inconnu (serveur plus récent que la page) reste lisible plutôt que de casser l'écran. */
function render(messages: Messages, value: Message): string {
  const write = (
    messages.server as Readonly<Record<string, ((params: unknown) => string) | undefined>>
  )[value.code];
  return write ? write(value.params) : value.code;
}

const cache = new Map<Locale, I18n>();

export function i18nOf(locale: Locale): I18n {
  let found = cache.get(locale);
  if (!found) {
    const t = DICTIONARIES[locale];
    found = {
      locale,
      t,
      fmt: formatters(locale),
      text: (value) => (typeof value === 'string' ? value : render(t, value)),
    };
    cache.set(locale, found);
  }
  return found;
}
