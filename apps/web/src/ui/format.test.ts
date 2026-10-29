import { describe, expect, it } from 'vitest';
import { formatters } from './format.ts';

const fr = formatters('fr');
const en = formatters('en');
/** Les espaces insécables (milliers, unités) deviennent des espaces simples : on compare le texte lu. */
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('formatters : durées', () => {
  it.each([
    [0, '0 s', '0s'],
    [38_000, '38 s', '38s'],
    [60_000, '1 min', '1m'],
    [252_000, '4 min 12 s', '4m 12s'],
    [7_500_000, '2 h 05', '2h 5m'],
    [7_200_000, '2 h 00', '2h'],
  ])('%i ms → %s, %s', (ms, french, english) => {
    expect(fr.duration(ms)).toBe(french);
    expect(en.duration(ms)).toBe(english);
  });

  it('ne rend jamais de durée négative (horloges décalées)', () => {
    expect(fr.duration(-5_000)).toBe('0 s');
    expect(en.duration(-5_000)).toBe('0s');
  });

  it('compte un séjour à la minute, puis en heures, puis en jours', () => {
    expect(fr.stay(20_000)).toBe("moins d'une minute");
    expect(fr.stay(11 * 60_000 + 59_000)).toBe('11 min');
    expect(fr.stay(2 * 3_600_000 + 5 * 60_000)).toBe('2 h 05');
    expect(fr.stay(216 * 3_600_000)).toBe('9 j');
    expect(en.stay(20_000)).toBe('less than a minute');
    expect(en.stay(11 * 60_000 + 59_000)).toBe('11m');
    expect(en.stay(2 * 3_600_000 + 5 * 60_000)).toBe('2h 5m');
    expect(en.stay(216 * 3_600_000)).toBe('9d');
  });

  it('rend des minutes comme une durée', () => {
    expect(fr.minutes(74)).toBe('1 h 14');
    expect(en.minutes(74)).toBe('1h 14m');
  });
});

describe('formatters : âges relatifs', () => {
  const now = Date.parse('2026-10-28T16:00:00Z');

  it("dit « à l'instant » sous cinq secondes, « il y a » au-delà", () => {
    expect(fr.age('2026-10-28T15:59:57Z', now)).toBe("à l'instant");
    expect(fr.age('2026-10-28T15:56:00Z', now)).toBe('il y a 4 min');
    expect(en.age('2026-10-28T15:59:57Z', now)).toBe('just now');
    expect(en.age('2026-10-28T15:56:00Z', now)).toBe('4m ago');
  });

  it('arrondit un âge en secondes comme le serveur : secondes, minutes puis heures', () => {
    expect(fr.ago(9)).toBe('il y a 9 s');
    expect(fr.ago(240)).toBe('il y a 4 min');
    expect(fr.ago(7_200)).toBe('il y a 2 h');
    expect(fr.span(240)).toBe('4 min');
    expect(en.ago(9)).toBe('9s ago');
    expect(en.ago(240)).toBe('4m ago');
    expect(en.ago(7_200)).toBe('2h ago');
    expect(en.span(240)).toBe('4m');
  });
});

describe('formatters : nombres et dates', () => {
  it('groupe les milliers et écrit les décimales à la manière de chaque langue', () => {
    expect(plain(fr.integer(4812))).toBe('4 812');
    expect(en.integer(4812)).toBe('4,812');
    expect(plain(fr.compact(9_200_000))).toBe('9,2 M');
    expect(en.compact(9_200_000)).toBe('9.2M');
    expect(plain(fr.usd(18.62))).toBe('18,62 $US');
    expect(en.usd(18.62)).toBe('$18.62');
    expect(plain(fr.percent(0.58))).toBe('58 %');
    expect(en.percent(0.58)).toBe('58%');
  });

  it('écrit l’heure et le jour dans l’ordre de chaque langue', () => {
    const at = new Date(2026, 9, 28, 16, 4, 5).toISOString();
    expect(fr.clock(at)).toBe('16:04:05');
    expect(plain(en.clock(at))).toBe('4:04:05 PM');
    expect(fr.dayMonth(at)).toBe('28 oct.');
    expect(en.dayMonth(at)).toBe('Oct 28');
  });
});

describe('formatters : pluriels', () => {
  it('suit les règles de chaque langue (Intl.PluralRules) : zéro est singulier en français', () => {
    expect(fr.plural(0, 'carte', 'cartes')).toBe('carte');
    expect(fr.plural(1, 'carte', 'cartes')).toBe('carte');
    expect(fr.plural(2, 'carte', 'cartes')).toBe('cartes');
    expect(fr.plural(1_000_000, 'carte', 'cartes')).toBe('cartes');
    expect(en.plural(0, 'card', 'cards')).toBe('cards');
    expect(en.plural(1, 'card', 'cards')).toBe('card');
    expect(en.plural(2, 'card', 'cards')).toBe('cards');
  });
});
