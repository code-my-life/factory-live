import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { i18nOf } from './i18n.ts';
import type { I18n } from './i18n.ts';
import { readLocale, writeLocale } from './locale.ts';
import type { Locale } from './locale.ts';
import { shareLocaleWithWorker } from './workerLocale.ts';

export interface I18nValue extends I18n {
  /** Change la langue tout de suite, sans recharger, et la mémorise sur l'appareil. */
  setLocale: (locale: Locale) => void;
}

/** Hors fournisseur (tests de composants), l'interface parle sa langue source. */
const I18nContext = createContext<I18nValue>({ ...i18nOf('fr'), setLocale: () => undefined });

/**
 * La langue de l'interface : celle choisie dans Réglages, sinon celle du navigateur (français s'il
 * est en français, anglais sinon). Elle pose `<html lang>` et la laisse au service worker.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
    void shareLocaleWithWorker(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    writeLocale(next);
    setLocaleState(next);
  }, []);

  const value = useMemo(() => ({ ...i18nOf(locale), setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
