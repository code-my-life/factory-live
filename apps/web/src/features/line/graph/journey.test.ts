import { parseWorkflowSheet } from '@factory-live/contracts';
import type { JourneyStep } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { journeyEdges } from './layout.ts';

/**
 * A step of a journey. A sheet's station and lane keys are any string: the journey's type names the
 * code line's, and `journeyEdges` reads them as strings.
 */
const step = (station: string, lane: string | null = null) => ({
  station: station as JourneyStep['station'],
  lane: lane as JourneyStep['lane'],
});

describe('journeyEdges à travers un groupe', () => {
  it('une issue passe la gate par le membre de sa lane, sur ses deux courbes du fan', () => {
    expect(
      journeyEdges([step('implementation', 'sabotage'), step('gate', 'sabotage'), step('review')]),
    ).toEqual(['in:sabotage', 'out:sabotage']);
  });

  it('sans lane, ou avec une lane qu’aucun membre ne porte, elle passe par le premier membre', () => {
    expect(journeyEdges([step('implementation'), step('gate'), step('review')])).toEqual([
      'in:failfirst',
      'out:failfirst',
    ]);
    expect(
      journeyEdges([step('implementation', 'nope'), step('gate', 'nope'), step('review', 'nope')]),
    ).toEqual(['in:failfirst', 'out:failfirst']);
  });

  it('un groupe sans fan sur sa fiche se traverse par ses liens de ligne, quelle que soit la lane', () => {
    const parsed = parseWorkflowSheet({
      item: { type: 'video', label: 'Vidéo' },
      groups: [{ key: 'check', label: 'Contrôle', icon: 'shield-check' }],
      stations: [
        { key: 'write', label: 'Scénario', icon: 'pencil', kind: 'ai', col: 0, row: 1 },
        { key: 'check:a', label: 'A', icon: 'eye', kind: 'script', col: 1, row: 1, group: 'check' },
        { key: 'done', label: 'Fin', icon: 'check', kind: 'end', col: 2, row: 1 },
      ],
      edges: [
        { from: 'write', to: 'check', kind: 'line' },
        { from: 'check', to: 'done', kind: 'line' },
      ],
      models: [],
    });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(
      journeyEdges([step('write', 'b'), step('check', 'b'), step('done')], parsed.sheet),
    ).toEqual(['line:write', 'line:check']);
  });
});
