import { describe, expect, it } from 'vitest';
import { formatAge, formatDuration } from './format.ts';

describe('formatDuration', () => {
  it.each([
    [0, '0 s'],
    [38_000, '38 s'],
    [60_000, '1 min'],
    [252_000, '4 min 12 s'],
    [7_500_000, '2 h 05'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it('ne rend jamais de durée négative (horloges décalées)', () => {
    expect(formatDuration(-5_000)).toBe('0 s');
  });
});

describe('formatAge', () => {
  const now = Date.parse('2026-10-28T16:00:00Z');

  it("dit « à l'instant » sous cinq secondes", () => {
    expect(formatAge('2026-10-28T15:59:57Z', now)).toBe("à l'instant");
  });

  it('dit « il y a » au-delà', () => {
    expect(formatAge('2026-10-28T15:56:00Z', now)).toBe('il y a 4 min');
  });
});
