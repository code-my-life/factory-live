import { describe, expect, it } from 'vitest';
import { issueKeyFromParams, issuePath } from './paths.ts';

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
