import { describe, expect, it } from 'vitest';
import { wasNudged } from './limits.ts';

describe('erreurs des runs', () => {
  it('reconnaît la relance d’un agent qui sortait sans rendre sa carte', () => {
    expect(
      wasNudged(
        '⚠️ Kanban worker tried to exit without a terminal board call (…) nudging to finish',
      ),
    ).toBe(true);
    expect(wasNudged(undefined)).toBe(false);
  });
});
