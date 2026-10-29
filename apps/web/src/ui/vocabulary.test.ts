import { describe, expect, it } from 'vitest';
import { needsWatch } from './vocabulary.ts';

describe('needsWatch', () => {
  it('ne signale que les services dégradés ou en panne, pas ceux dont on ne sait rien', () => {
    expect(needsWatch('degraded')).toBe(true);
    expect(needsWatch('down')).toBe(true);
    expect(needsWatch('ok')).toBe(false);
    expect(needsWatch('unknown')).toBe(false);
  });
});
