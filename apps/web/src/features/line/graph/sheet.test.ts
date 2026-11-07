import { describe, expect, it } from 'vitest';
import { CODE_LINE, CODE_LINE_SHEET, LANES, layout } from './layout.ts';
import type { BoxId, Fill } from './layout.ts';

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

/** The files that draw a workflow's graph: none of them may name a station of the code line. */
const DRAWING = import.meta.glob<string>(
  [
    './{layout,palette}.ts',
    './{boxes,flow,Legend,FactoryGraph,WorkflowGraph,zoom}.tsx',
    './blocks/*.{ts,tsx}',
    '!./**/*.test.*',
  ],
  { query: '?raw', import: 'default', eager: true },
);

describe('la fiche de la ligne du code', () => {
  it('la fiche de la factory donne les boîtes et les liens de la ligne d’usine', () => {
    expect(CODE_LINE_SHEET.ok).toBe(true);

    // The values of main before the graph read its sheet, for the demo's busiest moment.
    const geometry = layout(
      fills({ brief: 2, implementation: 4, 'gate:failfirst': 2, review: 1, done: 2, models: 4 }),
      CODE_LINE,
    );
    expect(geometry.width).toBe(1174);
    expect(geometry.height).toBe(1336);
    expect(geometry.gate).toEqual({ x: 622, y: 136, w: 240, h: 728 });
    expect(Object.values(geometry.boxes).map(({ id, x, y, w, h }) => [id, x, y, w, h])).toEqual([
      ['intake', 40, 24, 220, 72],
      ['brief', 40, 176, 220, 238],
      ['implementation', 336, 176, 220, 438],
      ['gate:failfirst', 632, 176, 220, 254],
      ['gate:sabotage', 632, 448, 220, 88],
      ['gate:invariance', 632, 554, 220, 88],
      ['gate:documents', 632, 660, 220, 88],
      ['gate:skill', 632, 766, 220, 88],
      ['review', 928, 176, 220, 138],
      ['merge', 928, 358, 220, 72],
      ['ci', 928, 474, 220, 72],
      ['deploy', 928, 590, 220, 72],
      ['done', 928, 706, 220, 238],
      ['diagnostic', 40, 678, 220, 72],
      ['models', 96, 806, 460, 454],
    ]);
    expect(geometry.edges.map(({ id, d }) => [id, d])).toEqual([
      ['line:intake', 'M 150 96 C 150 136 150 136 150 176'],
      ['line:brief', 'M 260 194 C 298 194 298 194 336 194'],
      ['in:failfirst', 'M 556 186 C 594 186 594 194 632 194'],
      ['out:failfirst', 'M 852 194 C 890 194 890 186 928 186'],
      ['in:sabotage', 'M 556 201 C 594 201 594 466 632 466'],
      ['out:sabotage', 'M 852 466 C 890 466 890 201 928 201'],
      ['in:invariance', 'M 556 216 C 594 216 594 572 632 572'],
      ['out:invariance', 'M 852 572 C 890 572 890 216 928 216'],
      ['in:documents', 'M 556 231 C 594 231 594 678 632 678'],
      ['out:documents', 'M 852 678 C 890 678 890 231 928 231'],
      ['in:skill', 'M 556 246 C 594 246 594 784 632 784'],
      ['out:skill', 'M 852 784 C 890 784 890 246 928 246'],
      ['line:review', 'M 1038 314 C 1038 336 1038 336 1038 358'],
      ['line:merge', 'M 1038 430 C 1038 452 1038 452 1038 474'],
      ['line:ci', 'M 1038 546 C 1038 568 1038 568 1038 590'],
      ['line:deploy', 'M 1038 662 C 1038 684 1038 684 1038 706'],
      ['diag:in', 'M 150 414 C 150 546 150 546 150 678'],
      [
        'diag:out',
        'M 62 750 L 62 1260 C 62 1282 80 1300 102 1300 L 998 1300 C 1020 1300 1038 1282 1038 1260 L 1038 944',
      ],
      ['loop:gate', 'M 822 136 C 822 70.66666666666667 448 70.66666666666667 448 176'],
      ['loop:review', 'M 984 176 C 984 -5.333333333333333 408 -5.333333333333333 408 176'],
      ['loop:revert', 'M 1148 492 C 1178 492 1178 194 1148 194'],
      ['models:implementation', 'M 446 806 C 446 710 446 710 446 614'],
      ['models:diagnostic', 'M 190 806 C 190 778 190 778 190 750'],
      [
        'models:brief',
        'M 298 806 L 298 478 C 298 459.3 282.7 444 264 444 L 245 444 C 236.75 444 230 437.25 230 429 L 230 414',
      ],
    ]);

    // Nothing but the sheet names the line's stations: no drawing file holds one of their keys,
    // neither as a string nor as a property.
    const files = Object.entries(DRAWING);
    expect(files.length).toBeGreaterThanOrEqual(15);
    const keys = [
      ...CODE_LINE.stations.map(({ key }) => key),
      ...(CODE_LINE.groups ?? []).map(({ key }) => key),
    ];
    for (const [file, source] of files)
      for (const key of keys) {
        const name = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const named = new RegExp(`['"\`]${name}['"\`:]|\\.${name}\\b(?![-(])`);
        expect(source, `${file} : ${key}`).not.toMatch(named);
      }
  });
});
