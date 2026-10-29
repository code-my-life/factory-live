import { describe, expect, it } from 'vitest';
import { browserLocale, readLocale, writeLocale } from './locale.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

describe('browserLocale', () => {
  it('prend le français pour un navigateur en français, l’anglais pour tout le reste', () => {
    expect(browserLocale('fr-FR')).toBe('fr');
    expect(browserLocale('fr')).toBe('fr');
    expect(browserLocale('FR-ca')).toBe('fr');
    expect(browserLocale('en-US')).toBe('en');
    expect(browserLocale('de-DE')).toBe('en');
    expect(browserLocale('')).toBe('en');
    expect(browserLocale(undefined)).toBe('en');
  });
});

describe('readLocale', () => {
  it('suit la langue du navigateur tant que rien n’est choisi', () => {
    expect(readLocale(memoryStorage(), 'fr-BE')).toBe('fr');
    expect(readLocale(memoryStorage(), 'es-ES')).toBe('en');
  });

  it('garde le choix fait dans Réglages, quelle que soit la langue du navigateur', () => {
    const storage = memoryStorage();
    writeLocale('en', storage);
    expect(storage.values.get('factory-live:locale')).toBe('en');
    expect(readLocale(storage, 'fr-FR')).toBe('en');
  });

  it('ignore une valeur inconnue et survit à un stockage indisponible', () => {
    expect(readLocale(memoryStorage({ 'factory-live:locale': 'de' }), 'fr-FR')).toBe('fr');
    const broken = {
      getItem: () => {
        throw new Error('navigation privée');
      },
      setItem: () => {
        throw new Error('navigation privée');
      },
    };
    expect(readLocale(broken, 'en-GB')).toBe('en');
    expect(() => writeLocale('fr', broken)).not.toThrow();
    expect(readLocale(null, 'fr-FR')).toBe('fr');
  });
});
