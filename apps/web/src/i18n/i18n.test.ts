import { describe, expect, it } from 'vitest';
import { en } from './en.ts';
import { fr } from './fr.ts';
import { i18nOf } from './i18n.ts';

type Entry = { path: string; value: unknown };

/** Chaque feuille du dictionnaire, avec son chemin : `issue.runs.of`, `pr.checks.0.name`… */
function leaves(value: unknown, path = ''): Entry[] {
  if (typeof value === 'object' && value !== null)
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, path ? `${path}.${key}` : key),
    );
  return [{ path, value }];
}

/** Ce qu'un texte affiche : une chaîne telle quelle, une fonction appelée avec des valeurs d'exemple. */
function rendered(value: unknown): string {
  if (typeof value === 'function')
    return String(
      (value as (...args: unknown[]) => unknown)(...Array<number>(value.length).fill(2)),
    );
  return String(value);
}

const EM_DASH = String.fromCharCode(0x2014);
/** Lettres accentuées du français : un texte anglais qui en garde une n'a pas été traduit (sauf Hermès). */
const FRENCH_LETTERS = /[éèêëàâäçùûüôöîï]/i;

describe('dictionnaires', () => {
  const french = leaves(fr);
  const english = leaves(en);

  it('ont exactement les mêmes clés, des deux côtés', () => {
    expect(english.map((entry) => entry.path)).toEqual(french.map((entry) => entry.path));
  });

  it('donnent un texte non vide pour chaque clé, de même nature dans les deux langues', () => {
    const englishByPath = new Map(english.map((entry) => [entry.path, entry.value]));
    for (const { path, value } of french) {
      const other = englishByPath.get(path);
      expect(typeof other, path).toBe(typeof value);
      if (typeof value === 'function')
        expect((other as () => string).length, path).toBe(value.length);
      expect(rendered(value).trim(), `fr ${path}`).not.toBe('');
      expect(rendered(other).trim(), `en ${path}`).not.toBe('');
    }
  });

  it('n’écrivent jamais de tiret cadratin', () => {
    for (const { path, value } of [...french, ...english])
      expect(rendered(value), path).not.toContain(EM_DASH);
  });

  it('ne laissent pas de français dans l’anglais', () => {
    for (const { path, value } of english)
      expect(rendered(value).replaceAll('Hermès', ''), path).not.toMatch(FRENCH_LETTERS);
  });
});

describe('pluriels et nombres dans les textes', () => {
  it('accorde selon la langue : zéro et un au singulier en français, zéro au pluriel en anglais', () => {
    const { t: french } = i18nOf('fr');
    const { t: english } = i18nOf('en');
    expect(french.line.openIssues(0)).toBe('0 issue en cours');
    expect(french.line.openIssues(1)).toBe('1 issue en cours');
    expect(french.line.openIssues(3)).toBe('3 issues en cours');
    expect(english.line.openIssues(0)).toBe('0 issues in progress');
    expect(english.line.openIssues(1)).toBe('1 issue in progress');
    expect(french.line.blockersWaiting(2)).toBe('2 blocages t’attendent');
    expect(english.line.blockersWaiting(1)).toBe('1 blocker waiting for you');
    expect(french.shell.running(1, 2)).toBe('1 carte en cours sur 2');
    expect(english.shell.running(1, 2)).toBe('1 of 2 cards running');
  });

  it('écrit les durées et les nombres de chaque langue', () => {
    expect(i18nOf('fr').fmt.duration(252_000)).toBe('4 min 12 s');
    expect(i18nOf('en').fmt.duration(252_000)).toBe('4m 12s');
    expect(i18nOf('en').fmt.integer(1234)).toBe('1,234');
  });
});
