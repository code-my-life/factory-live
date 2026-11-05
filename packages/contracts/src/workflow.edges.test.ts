import { describe, expect, it } from 'vitest';
import { parseWorkflowSheet } from './workflow.ts';

const station = (key: string, col: number) => ({
  key,
  label: key,
  icon: 'dot',
  kind: 'script',
  col,
  row: 1,
});

describe('les identifiants des liens d’une fiche', () => {
  it('deux liens du même identifiant sont refusés, et la fiche dit lequel', () => {
    const result = parseWorkflowSheet({
      item: { type: 'video', label: 'Vidéo' },
      stations: [station('a', 0), station('b', 1), station('c', 2)],
      edges: [
        { from: 'a', to: 'b', kind: 'line', id: 'same' },
        { from: 'b', to: 'c', kind: 'line', id: 'same' },
      ],
      models: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('"same"');
  });
});
