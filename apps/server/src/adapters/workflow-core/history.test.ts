import { describe, expect, it } from 'vitest';
import type { HistoryItem, HistoryPort, KanbanDelta } from '../../application/ports.ts';
import { CORE_ITEMS } from '../../test/core-scenario.ts';
import { CoreHistory } from './history.ts';

/** A history port in memory that counts its reads of the history. */
function memory() {
  const rows = new Map<string, HistoryItem>();
  let reads = 0;
  const port: Pick<HistoryPort, 'recordItems' | 'historyItems' | 'seedHistory'> = {
    recordItems: (_workflow, items, at, complete) => {
      for (const item of items)
        rows.set(item.id, {
          id: item.id,
          state: item.state,
          firstSeenAt: rows.get(item.id)?.firstSeenAt ?? at,
          lastSeenAt: at,
          goneAt: null,
        });
      if (complete)
        for (const row of rows.values())
          if (row.goneAt === null && !items.some((item) => item.id === row.id)) row.goneAt = at;
    },
    historyItems: () => {
      reads += 1;
      return [...rows.values()];
    },
    seedHistory: () => false,
  };
  return { port: port as HistoryPort, reads: () => reads };
}

const EMPTY: KanbanDelta = { tasks: [], runs: [], links: [], events: [], comments: [] };

describe('CoreHistory (#63)', () => {
  it('une carte qui change ne relit pas tout l’historique', () => {
    const { port, reads } = memory();
    const history = new CoreHistory(port, () => 1_000);
    const items = structuredClone(CORE_ITEMS) as never[];
    history.record('factory', items, true);
    // The finished brief is purged.
    history.record('factory', items.slice(1), true);
    expect(history.withGone('factory', EMPTY).tasks.map((task) => task.id)).toEqual(['t_b1ef0049']);
    const after = reads();

    // Ten changes of a card still served: the gone cards come from what is already known.
    for (let n = 0; n < 10; n += 1) {
      history.record('factory', [items[1]!], false);
      expect(history.withGone('factory', EMPTY).tasks.map((task) => task.id)).toEqual([
        't_b1ef0049',
      ]);
    }
    expect(reads()).toBe(after);

    // The purged card served again: it is no longer gone.
    history.record('factory', [items[0]!], false);
    expect(history.withGone('factory', EMPTY).tasks).toEqual([]);
  });
});
