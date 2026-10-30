import { describe, expect, it } from 'vitest';
import { issueKeyFromParams, issuePath, prNumberOfUrl, repoOfKey } from './paths.ts';

describe('prNumberOfUrl', () => {
  it('lit le numéro d’une URL de PR simple', () => {
    expect(prNumberOfUrl('https://github.com/code-my-life/claude-cockpit/pull/12')).toBe(12);
  });

  it('ignore ce qui suit le numéro : commentaire, fichiers, requête', () => {
    const base = 'https://github.com/code-my-life/claude-cockpit/pull/12';
    expect(prNumberOfUrl(`${base}#issuecomment-1`)).toBe(12);
    expect(prNumberOfUrl(`${base}/files`)).toBe(12);
    expect(prNumberOfUrl(`${base}/files?w=1#diff-abc`)).toBe(12);
  });

  it('rend null quand l’URL n’a pas de numéro de PR', () => {
    expect(prNumberOfUrl('https://github.com/code-my-life/claude-cockpit/pulls')).toBeNull();
    expect(prNumberOfUrl('https://github.com/code-my-life/claude-cockpit')).toBeNull();
    expect(prNumberOfUrl('')).toBeNull();
  });
});

describe('repoOfKey', () => {
  it('donne le dépôt d’une clé d’issue', () => {
    expect(repoOfKey('claude-cockpit#71')).toBe('claude-cockpit');
  });
});

describe('issuePath', () => {
  it('construit le chemin de la vue issue', () => {
    expect(issuePath('claude-cockpit#71')).toBe('/issues/claude-cockpit/71');
  });

  it('retrouve la clé depuis les paramètres de route', () => {
    expect(issueKeyFromParams('claude-cockpit', '71')).toBe('claude-cockpit#71');
  });

  it('refuse un numéro qui n’en est pas un', () => {
    expect(issueKeyFromParams('cv-site', '12a')).toBeNull();
    expect(issueKeyFromParams(undefined, '12')).toBeNull();
  });
});
