import { describe, expect, it } from 'vitest';
import { FIXED_HUES, HUES, fingerprint, hueOf, spareHues } from './hues.ts';
import type { HueKind } from './hues.ts';

const KINDS = Object.keys(FIXED_HUES) as HueKind[];

describe('la table des teintes', () => {
  it('compte les 19 teintes de la palette display de Primer', () => {
    expect(new Set(HUES).size).toBe(19);
  });

  it('ne fixe que des teintes de la palette, et jamais le rouge, réservé au danger', () => {
    for (const kind of KINDS)
      for (const [name, hue] of Object.entries(FIXED_HUES[kind])) {
        expect(HUES, `${kind}/${name}`).toContain(hue);
        expect(hue, `${kind}/${name}`).not.toBe('red');
      }
  });

  it('donne à chaque élément connu d’un type une teinte distincte de celles des autres', () => {
    // Claude Code and the Claude API are a single provider, coral.
    for (const kind of KINDS.filter((candidate) => candidate !== 'provider')) {
      const hues = Object.values(FIXED_HUES[kind]);
      expect(new Set(hues).size, kind).toBe(hues.length);
    }
  });

  it('dit la même chose d’un type à l’autre : le brief est indigo, factory-live bleu', () => {
    expect(FIXED_HUES.station['brief']).toBe('indigo');
    expect(FIXED_HUES.card['brief']).toBe('indigo');
    expect(FIXED_HUES.skill['factory-brief']).toBe('indigo');
    expect(FIXED_HUES.repo['factory-live']).toBe('blue');
    expect(FIXED_HUES.product['factory-live']).toBe('blue');
    expect(FIXED_HUES.source['factory-live']).toBe('blue');
  });
});

describe('hueOf', () => {
  it('ne lit pas les propriétés héritées d’un objet : « constructor » a une vraie teinte', () => {
    for (const kind of KINDS)
      for (const name of ['constructor', 'toString', 'hasOwnProperty']) {
        expect(HUES, `${kind}/${name}`).toContain(hueOf(kind, name));
        expect(hueOf(kind, name), `${kind}/${name}`).not.toBe('red');
      }
  });

  it('rend la teinte fixée d’un élément connu', () => {
    expect(hueOf('skill', 'factory-brief')).toBe('indigo');
    expect(hueOf('agent', 'coder-claude')).toBe('plum');
    expect(hueOf('provider', 'nvidia')).toBe('lime');
  });

  it('tire la teinte d’un inconnu de son nom, toujours la même', () => {
    for (const kind of KINDS)
      for (const name of ['nouvelle-skill', 'dots3-note-preview', 'zzz', '']) {
        expect(hueOf(kind, name)).toBe(hueOf(kind, name));
      }
    expect(fingerprint('nouvelle-skill', 0)).toBe(fingerprint('nouvelle-skill', 0));
  });

  it('ne tire jamais le rouge, ni une teinte déjà prise dans son type', () => {
    for (const kind of KINDS) {
      const taken = new Set(Object.values(FIXED_HUES[kind]));
      expect(spareHues(kind)).not.toContain('red');
      for (let index = 0; index < 200; index += 1) {
        const hue = hueOf(kind, `element-${index}`);
        expect(hue, `${kind} ${index}`).not.toBe('red');
        expect(taken.has(hue), `${kind} ${index}`).toBe(false);
      }
    }
  });

  it('répartit les inconnus sur plusieurs teintes', () => {
    const hues = new Set(
      Array.from({ length: 100 }, (_, index) => hueOf('model', `modele-${index}`)),
    );
    expect(hues.size).toBeGreaterThan(5);
  });
});
