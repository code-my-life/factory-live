import { describe, expect, it } from 'vitest';
import { historyStats } from '../application/views.ts';
import { harness, NOW } from './harness.ts';
import type { Harness } from './harness.ts';
import type { ViewDeps } from '../application/views.ts';

describe('historyStats', () => {
  it('calcule les stats sur les issues terminées', () => {
    const h: Harness = harness();
    const deps = {
      ...h.hub,
      hub: h.hub,
      store: h.store,
      profiles: {
        manifest: () => ({ profiles: {} }),
        live: () => null,
        repo: () => null,
        facts: () => null,
      },
      github: null,
      owner: 'code-my-life',
      boardName: 'factory',
      dashboardUrl: null,
      heldAfterSeconds: 1800,
      now: () => NOW,
    } as unknown as ViewDeps;

    const result = historyStats(deps, 30);

    expect(result.periodDays).toBe(30);
    expect(typeof result.issuesDone).toBe('number');
    expect(
      result.medianLeadTimeMinutes === null || typeof result.medianLeadTimeMinutes === 'number',
    ).toBe(true);
    expect(Array.isArray(result.stationMinutes)).toBe(true);
    expect(Array.isArray(result.gatePassRate)).toBe(true);

    h.close();
  });
});
