/** Langues de l'interface : le français, langue source, et l'anglais. */
export type Locale = 'fr' | 'en';

export const LOCALES: readonly Locale[] = ['fr', 'en'];

/** Étiquette BCP 47 passée aux API Intl (nombres, dates, pluriels). */
export const LOCALE_TAG: Readonly<Record<Locale, string>> = { fr: 'fr-FR', en: 'en-US' };

const STORAGE_KEY = 'factory-live:locale';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

export function isLocale(value: unknown): value is Locale {
  return value === 'fr' || value === 'en';
}

/** Langue par défaut : le français si le navigateur est en français, sinon l'anglais. */
export function browserLocale(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** La langue choisie dans Réglages, sinon celle du navigateur. */
export function readLocale(
  storage: Storage | null = defaultStorage(),
  language: string | undefined = typeof navigator === 'undefined' ? undefined : navigator.language,
): Locale {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Stockage indisponible (navigation privée, aperçu) : la langue du navigateur.
  }
  return browserLocale(language);
}

export function writeLocale(locale: Locale, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, locale);
  } catch {
    // Choix non mémorisé : il vaut pour la session en cours.
  }
}
