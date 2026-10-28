import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type ColorPreference = 'system' | 'dark' | 'light';

const STORAGE_KEY = 'factory-live:color-mode';
const THEME_COLORS = { dark: '#0d1117', light: '#ffffff' } as const;

function readPreference(): ColorPreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'system' || stored === 'dark' || stored === 'light') return stored;
  } catch {
    // Stockage indisponible (navigation privée, aperçu) : thème par défaut.
  }
  return 'dark';
}

function writePreference(preference: ColorPreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Préférence non mémorisée : elle vaut pour la session en cours.
  }
}

/** Pose les attributs lus par les thèmes Primer et la couleur de la barre d'état. */
function applyToDocument(preference: ColorPreference): void {
  const root = document.documentElement;
  root.dataset.colorMode = preference === 'system' ? 'auto' : preference;
  root.dataset.lightTheme = 'light';
  root.dataset.darkTheme = 'dark';
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effective = preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  meta.content = THEME_COLORS[effective];
}

interface ColorModeValue {
  preference: ColorPreference;
  setPreference: (preference: ColorPreference) => void;
}

const ColorModeContext = createContext<ColorModeValue | null>(null);

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ColorPreference>(readPreference);

  useEffect(() => {
    applyToDocument(preference);
    if (preference !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyToDocument('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ColorPreference) => {
    writePreference(next);
    setPreferenceState(next);
  }, []);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

export function useColorMode(): ColorModeValue {
  const value = useContext(ColorModeContext);
  if (!value) throw new Error('useColorMode doit être utilisé sous ColorModeProvider');
  return value;
}

/** Valeur attendue par le ThemeProvider de Primer. */
export function primerColorMode(preference: ColorPreference): 'auto' | 'dark' | 'light' {
  return preference === 'system' ? 'auto' : preference;
}
