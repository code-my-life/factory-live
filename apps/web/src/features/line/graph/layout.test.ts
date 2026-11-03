import { describe, expect, it } from 'vitest';
import { INTAKE_SHOWN, LANES, MIN_SCALE, ROW_H, layout } from './layout.ts';
import type { BoxId, Edge, Fill } from './layout.ts';

const BOXES: readonly BoxId[] = [
  'intake',
  'brief',
  'implementation',
  ...LANES.map((lane) => `gate:${lane}` as const),
  'review',
  'merge',
  'ci',
  'deploy',
  'done',
  'diagnostic',
  'models',
];

/** Fills like the demo's busiest moment: several issues here and there, empty boxes elsewhere. */
function fills(rows: Partial<Record<BoxId, number>>): Record<BoxId, Fill> {
  const result = {} as Record<BoxId, Fill>;
  for (const id of BOXES) result[id] = { rows: rows[id] ?? 0, row: 'full', more: 0 };
  return result;
}

/** The point of a cubic connector `M x y C c1 c2 end` at `t`. */
function at(edge: Edge, t: number): { x: number; y: number } {
  const numbers = (edge.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const [x0, y0, x1, y1, x2, y2, x3, y3] = numbers as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const u = 1 - t;
  return {
    x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
    y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
  };
}

describe('layout', () => {
  const cases = [
    fills({}),
    fills({ brief: 2, implementation: 4, 'gate:failfirst': 2, review: 1, done: 2, models: 4 }),
    fills({ 'gate:sabotage': 3, 'gate:documents': 1, ci: 1, deploy: 1, diagnostic: 2 }),
  ];

  it('chaque lien a ses deux ports, sans port partagé ni courbes croisées dans les éventails de la gate', () => {
    for (const fill of cases) {
      const { edges } = layout(fill);
      const ports = edges.flatMap((edge) => [edge.from, edge.to]);
      expect(ports).toHaveLength(edges.length * 2);
      const keys = ports.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`);
      expect(new Set(keys).size).toBe(keys.length);

      for (const side of ['in', 'out'] as const) {
        const fan = LANES.map(
          (lane) => edges.find((edge) => edge.id === `${side}:${lane}`) as Edge,
        );
        expect(fan.every(Boolean)).toBe(true);
        for (let step = 0; step <= 20; step += 1) {
          const ys = fan.map((edge) => at(edge, step / 20).y);
          for (let index = 1; index < ys.length; index += 1)
            expect(ys[index] as number).toBeGreaterThan(ys[index - 1] as number);
        }
      }
    }
  });

  it('les boîtes ne se chevauchent pas, quelle que soit leur hauteur', () => {
    for (const fill of cases) {
      const boxes = Object.values(layout(fill).boxes);
      for (const a of boxes)
        for (const b of boxes) {
          if (a === b) continue;
          const apart =
            a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(apart, `${a.id} / ${b.id}`).toBe(true);
        }
    }
  });

  it('au plus petit zoom, deux issues qui se suivent dans une boîte restent à 24 px l’une de l’autre', () => {
    // WCAG 2.5.8: two touch targets smaller than 24 px keep 24 px between their centres.
    for (const kind of ['full', 'finished'] as const)
      expect(ROW_H[kind] * MIN_SCALE, kind).toBeGreaterThanOrEqual(24);
    // A compact row is shorter: Intake never shows two of them.
    expect(ROW_H.compact * MIN_SCALE).toBeLessThan(24);
    expect(INTAKE_SHOWN).toBe(1);
  });
});
