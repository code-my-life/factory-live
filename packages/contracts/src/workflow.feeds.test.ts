import { describe, expect, it } from 'vitest';
import { MODELS_KEY, parseWorkflowSheet } from './workflow.ts';

const station = (key: string, kind: string, col: number) => ({
  key,
  label: key,
  icon: 'dot',
  kind,
  col,
  row: 1,
});

describe('les flux des fournisseurs d’une fiche', () => {
  it('un identifiant de la fiche ne prend jamais celui d’un flux des fournisseurs', () => {
    const result = parseWorkflowSheet({
      item: { type: 'video', label: 'Vidéo' },
      stations: [station('a', 'ai', 0), station('b', 'script', 1)],
      edges: [{ from: 'a', to: 'b', kind: 'line', id: `${MODELS_KEY}:a` }],
      models: ['a'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(`"${MODELS_KEY}:a"`);
  });
});
