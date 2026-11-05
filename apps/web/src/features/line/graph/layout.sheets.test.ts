import { parseWorkflowSheet } from '@factory-live/contracts';
import type { JourneyStep, WorkflowSheet } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { journeyEdges, layout } from './layout.ts';
import type { Box, Edge } from './layout.ts';

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

/** Every pair of boxes that overlap, by their ids. */
function overlaps(boxes: Record<string, Box>): string[] {
  const all = Object.values(boxes);
  const found: string[] = [];
  for (let i = 0; i < all.length; i += 1)
    for (let j = i + 1; j < all.length; j += 1) {
      const [a, b] = [all[i] as Box, all[j] as Box];
      if (overlap(a, b)) found.push(`${a.id}/${b.id}`);
    }
  return found;
}

/** The lowest y a single cubic `M x y C ...` reaches, sampled along it. */
function topOf(edge: Edge): number {
  const n = (edge.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const [, y0, , y1, , y2, , y3] = n as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  let top = Infinity;
  for (let t = 0; t <= 1; t += 0.02) {
    const u = 1 - t;
    top = Math.min(top, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
  }
  return top;
}

describe('le graphe d’une fiche quelconque', () => {
  it('chaque lien a un identifiant à lui', () => {
    const sheet = sheetOf({
      item,
      groups: [
        { key: 'g1', label: 'G1', icon: 'dot' },
        { key: 'g2', label: 'G2', icon: 'dot' },
      ],
      stations: stations([
        ['a', 'ai', 0, 1],
        ['b', 'script', 1, 1],
        ['c', 'script', 1, 2],
        ['g1:x', 'script', 2, 1, 'g1'],
        ['g2:x', 'script', 2, 2, 'g2'],
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
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('un lien qui part d’un groupe ou qui y arrive se dessine sur son cadre', () => {
    const sheet = sheetOf({
      item,
      groups: [{ key: 'check', label: 'Contrôle', icon: 'shield-check' }],
      stations: stations([
        ['write', 'ai', 0, 1],
        ['check:a', 'script', 1, 1, 'check'],
        ['done', 'end', 2, 1],
      ]),
      edges: [
        { from: 'write', to: 'check', kind: 'line' },
        { from: 'check', to: 'done', kind: 'line' },
        { from: 'done', to: 'check', kind: 'return', id: 'redo' },
      ],
      models: [],
    });
    const graph = layout({}, sheet);
    const frame = graph.groups.check;
    const byId = new Map(graph.edges.map((edge) => [edge.id, edge]));
    expect(frame).toBeDefined();
    expect(byId.get('line:write')?.to.x).toBe(frame?.x);
    expect(byId.get('line:check')?.from.x).toBe((frame?.x ?? 0) + (frame?.w ?? 0));
    expect(byId.get('redo')?.to.y).toBe(frame?.y);
  });

  it('le bloc Fournisseurs ne recouvre aucune station', () => {
    const sheet = sheetOf({
      item,
      stations: stations([
        ['a', 'ai', 0, 1],
        ['b', 'script', 0, 2],
        ['c', 'ai', 1, 1],
      ]),
      edges: [
        { from: 'a', to: 'b', kind: 'line' },
        { from: 'b', to: 'c', kind: 'line' },
      ],
      models: ['a', 'c'],
    });
    expect(overlaps(layout({}, sheet).boxes)).toEqual([]);
  });

  it('deux stations ne se recouvrent jamais, celles des branches comprises', () => {
    const sheet = sheetOf({
      item,
      stations: stations([
        ['s', 'ai', 0, 1],
        ['t', 'script', 1, 1],
        ['u', 'script', 2, 1],
        ['v', 'script', 2, 2],
        ['w', 'script', 2, 3],
        ['x', 'ai', 2, 4],
        ['y', 'ai', 0, 2],
      ]),
      edges: [
        { from: 's', to: 't', kind: 'line' },
        { from: 't', to: 'u', kind: 'line' },
        { from: 'u', to: 'v', kind: 'line' },
        { from: 'v', to: 'w', kind: 'line' },
        { from: 's', to: 'x', kind: 'branch' },
        { from: 's', to: 'y', kind: 'branch' },
      ],
      models: [],
    });
    expect(overlaps(layout({}, sheet).boxes)).toEqual([]);
  });

  it('un trajet prend le lien de la branche qu’il a suivie, et seulement des liens dessinés', () => {
    const branches = sheetOf({
      item,
      stations: stations([
        ['s1', 'ai', 0, 1],
        ['s2', 'ai', 1, 1],
        ['e', 'end', 2, 1],
        ['x', 'ai', 0, 2],
      ]),
      edges: [
        { from: 's1', to: 's2', kind: 'line' },
        { from: 's2', to: 'e', kind: 'line' },
        { from: 's1', to: 'x', kind: 'branch', id: 'b1' },
        { from: 's2', to: 'x', kind: 'branch', id: 'b2' },
      ],
      models: [],
    });
    expect(journeyEdges([step('s2'), step('x')], branches)).toEqual(['b2']);
    expect(journeyEdges([step('s1'), step('x')], branches)).toEqual(['b1']);

    const grouped = sheetOf({
      item,
      groups: [{ key: 'check', label: 'Contrôle', icon: 'shield-check' }],
      stations: stations([
        ['write', 'ai', 0, 1],
        ['check:a', 'script', 1, 1, 'check'],
        ['done', 'end', 2, 1],
      ]),
      edges: [
        { from: 'write', to: 'check', kind: 'line' },
        { from: 'check', to: 'done', kind: 'line' },
      ],
      models: [],
    });
    const drawn = new Set(layout({}, grouped).edges.map(({ id }) => id));
    const trip = journeyEdges([step('write', 'a'), step('check', 'a'), step('done')], grouped);
    expect(trip).toEqual(['line:write', 'line:check']);
    for (const id of trip) expect(drawn).toContain(id);
  });

  it('une issue arrêtée au bout d’une branche y finit par le lien de sa branche', () => {
    expect(journeyEdges([step('diagnostic'), step('stopped')])).toEqual(['diag:out']);
    expect(journeyEdges([step('diagnostic'), step('implementation')])).toEqual([]);
  });

  it('chaque courbe d’un éventail touche sa station', () => {
    const members = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
    const sheet = sheetOf({
      item,
      groups: [{ key: 'g', label: 'G', icon: 'dot' }],
      stations: stations([
        ['a', 'ai', 0, 1],
        ...members.map((m, row): Cell => [`g:${m}`, 'script', 1, row + 1, 'g']),
        ['e', 'end', 2, 1],
        ['p', 'script', 0, 2],
        ['q', 'script', 1, 8],
      ]),
      edges: [
        ...members.map((m) => ({ from: 'a', to: `g:${m}`, kind: 'fan' })),
        ...members.map((m) => ({ from: `g:${m}`, to: 'e', kind: 'fan' })),
        { from: 'p', to: 'q', kind: 'fan', id: 'plain' },
      ],
      models: [],
    });
    const graph = layout({}, sheet);
    const fans = graph.edges.filter((edge) => edge.id.startsWith('in:') || edge.id === 'plain');
    const outs = graph.edges.filter((edge) => edge.id.startsWith('out:'));
    expect(fans).toHaveLength(7);
    expect(outs).toHaveLength(6);
    const within = (box: Box | undefined, y: number) =>
      box !== undefined && box.y <= y && y <= box.y + box.h;
    for (const edge of fans) {
      const source = edge.id === 'plain' ? graph.boxes.p : graph.boxes.a;
      expect(within(source, edge.from.y), edge.id).toBe(true);
    }
    for (const edge of outs) expect(within(graph.boxes.e, edge.to.y), edge.id).toBe(true);
  });

  it('aucun retour n’est coupé, et chacun se pose sur sa station', () => {
    const sheet = sheetOf({
      item,
      stations: stations([
        ['c0', 'ai', 0, 1],
        ['c1', 'script', 1, 1],
        ['c2', 'script', 2, 1],
        ['c3', 'script', 3, 1],
        ['c4', 'end', 4, 1],
      ]),
      edges: [
        { from: 'c0', to: 'c1', kind: 'line' },
        { from: 'c1', to: 'c2', kind: 'line' },
        { from: 'c2', to: 'c3', kind: 'line' },
        { from: 'c3', to: 'c4', kind: 'line' },
        { from: 'c1', to: 'c0', kind: 'return', id: 'r1' },
        { from: 'c2', to: 'c0', kind: 'return', id: 'r2' },
        { from: 'c3', to: 'c0', kind: 'return', id: 'r3' },
        { from: 'c4', to: 'c0', kind: 'return', id: 'r4' },
      ],
      models: [],
    });
    const graph = layout({}, sheet);
    const target = graph.boxes.c0 as Box;
    const returns = graph.edges.filter((edge) => edge.id.startsWith('r'));
    expect(returns).toHaveLength(4);
    for (const edge of returns) {
      expect(topOf(edge), edge.id).toBeGreaterThanOrEqual(0);
      expect(edge.to.x, edge.id).toBeGreaterThanOrEqual(target.x);
      expect(edge.to.x, edge.id).toBeLessThanOrEqual(target.x + target.w);
    }
    expect(new Set(returns.map((edge) => edge.to.x)).size).toBe(4);
  });

  it('un graphe vide a des dimensions finies', () => {
    const graph = layout({}, sheetOf({ item, stations: [], edges: [], models: [] }));
    expect(Number.isFinite(graph.width)).toBe(true);
    expect(Number.isFinite(graph.height)).toBe(true);
    expect(graph.width).toBeGreaterThanOrEqual(0);
    expect(graph.height).toBeGreaterThanOrEqual(0);
  });
});
