import { MODELS_KEY, parseWorkflowSheet } from '@factory-live/contracts';
import type { JourneyStep, WorkflowSheet } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { journeyEdges, layout } from './layout.ts';
import type { Box } from './layout.ts';

/** A sheet any workflow could publish, checked like the code line's. */
function sheetOf(input: unknown): WorkflowSheet {
  const parsed = parseWorkflowSheet(input);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.sheet;
}

type Cell = [key: string, kind: string, col: number, row: number, group?: string];
const stations = (cells: readonly Cell[]) =>
  cells.map(([key, kind, col, row, group]) => ({
    key,
    label: key,
    icon: 'dot',
    kind,
    col,
    row,
    ...(group ? { group } : {}),
  }));
const item = { type: 'video', label: 'Vidéo' };

const step = (station: string, lane: string | null = null) => ({
  station: station as JourneyStep['station'],
  lane: lane as JourneyStep['lane'],
});

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('le graphe d’une fiche qui se divise', () => {
  it('deux liens qui partent d’une même station portent chacun leurs deux extrémités', () => {
    const sheet = sheetOf({
      item,
      groups: [
        { key: 'g1', label: 'G1', icon: 'dot' },
        { key: 'g2', label: 'G2', icon: 'dot' },
      ],
      stations: stations([
        ['a', 'script', 0, 1],
        ['b', 'script', 1, 1],
        ['c', 'script', 1, 2],
        ['g1:x', 'script', 2, 1, 'g1'],
        ['g2:x', 'script', 2, 3, 'g2'],
      ]),
      edges: [
        { from: 'a', to: 'b', kind: 'line' },
        { from: 'a', to: 'c', kind: 'line' },
        { from: 'b', to: 'g1:x', kind: 'fan' },
        { from: 'b', to: 'g2:x', kind: 'fan' },
      ],
      models: [],
    });
    const ids = layout({}, sheet).edges.map(({ id }) => id);
    expect(ids).toEqual(['line:a:b', 'line:a:c', 'fan:b:g1:x', 'fan:b:g2:x']);
  });

  it('deux stations de branche d’une même colonne ne se recouvrent pas, dans l’ordre de leurs rangées', () => {
    const sheet = sheetOf({
      item,
      stations: stations([
        ['s', 'ai', 0, 1],
        ['t', 'script', 1, 1],
        ['y', 'script', 1, 3],
        ['x', 'script', 1, 2],
      ]),
      edges: [
        { from: 's', to: 't', kind: 'line' },
        { from: 's', to: 'x', kind: 'branch' },
        { from: 's', to: 'y', kind: 'branch' },
      ],
      models: [],
    });
    const { boxes } = layout({}, sheet);
    const [x, y] = [boxes.x as Box, boxes.y as Box];
    expect(overlap(x, y)).toBe(false);
    expect(x.y).toBeLessThan(y.y);
  });

  it('à une fourche, chaque chemin garde son trajet sur les liens dessinés', () => {
    const sheet = sheetOf({
      item,
      stations: stations([
        ['a', 'ai', 0, 1],
        ['b', 'script', 1, 1],
        ['c', 'script', 1, 2],
        ['d', 'script', 2, 2],
        ['e', 'end', 3, 2],
      ]),
      edges: [
        { from: 'a', to: 'b', kind: 'line', id: 'ab' },
        { from: 'a', to: 'c', kind: 'line', id: 'ac' },
        { from: 'c', to: 'd', kind: 'line', id: 'cd' },
        { from: 'd', to: 'e', kind: 'line', id: 'de' },
      ],
      models: [],
    });
    const drawn = new Set(layout({}, sheet).edges.map(({ id }) => id));
    const trip = journeyEdges([step('a'), step('e')], sheet);
    expect(trip).toEqual(['ac', 'cd', 'de']);
    for (const id of trip) expect(drawn).toContain(id);
  });

  it('un groupe de six membres tient les ports de son éventail dans la station vide', () => {
    const members = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
    const sheet = sheetOf({
      item,
      groups: [{ key: 'g', label: 'G', icon: 'dot' }],
      stations: stations([
        ['a', 'script', 0, 1],
        ...members.map((m, row): Cell => [`g:${m}`, 'script', 1, row + 1, 'g']),
        ['e', 'end', 2, 1],
      ]),
      edges: [
        ...members.map((m) => ({ from: 'a', to: `g:${m}`, kind: 'fan' })),
        ...members.map((m) => ({ from: `g:${m}`, to: 'e', kind: 'fan' })),
      ],
      models: [],
    });
    const graph = layout({}, sheet);
    const [a, e] = [graph.boxes.a as Box, graph.boxes.e as Box];
    const ins = graph.edges.filter((edge) => edge.id.startsWith('in:'));
    const outs = graph.edges.filter((edge) => edge.id.startsWith('out:'));
    expect(ins).toHaveLength(6);
    expect(outs).toHaveLength(6);
    for (const edge of ins) expect(edge.from.y - a.y, edge.id).toBeLessThanOrEqual(a.h);
    for (const edge of outs) expect(edge.to.y - e.y, edge.id).toBeLessThanOrEqual(e.h);
  });

  it('le flux d’un poste qu’une station cache part de la boîte des fournisseurs', () => {
    const sheet = sheetOf({
      item,
      stations: stations([
        ['write', 'ai', 0, 1],
        ['shoot', 'script', 0, 2],
        ['cut', 'owner', 1, 1],
      ]),
      edges: [
        { from: 'write', to: 'shoot', kind: 'line' },
        { from: 'shoot', to: 'cut', kind: 'line' },
      ],
      models: ['write'],
    });
    const graph = layout({}, sheet);
    const models = graph.boxes[MODELS_KEY] as Box;
    const feed = graph.edges.find((edge) => edge.id === `${MODELS_KEY}:write`);
    expect(feed).toBeDefined();
    const { x, y } = feed?.from ?? { x: NaN, y: NaN };
    expect(x).toBeGreaterThanOrEqual(models.x);
    expect(x).toBeLessThanOrEqual(models.x + models.w);
    expect(y).toBeGreaterThanOrEqual(models.y);
    expect(y).toBeLessThanOrEqual(models.y + models.h);
  });
});
