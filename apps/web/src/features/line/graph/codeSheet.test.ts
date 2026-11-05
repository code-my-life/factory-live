import { describe, expect, it } from 'vitest';
import { readCodeSheet } from './codeSheet.ts';
import { CODE_LINE_SHEET } from './layout.ts';

describe('readCodeSheet', () => {
  it('la ligne du code se dessine depuis la fiche publiée, la copie embarquée en repli', async () => {
    if (!CODE_LINE_SHEET.ok) throw new Error(CODE_LINE_SHEET.error);
    const answer =
      (body: unknown, status = 200) =>
      () =>
        Promise.resolve(Response.json(body, { status }));
    const renamed = {
      ...CODE_LINE_SHEET.sheet,
      stations: CODE_LINE_SHEET.sheet.stations.map((station, index) =>
        index === 0 ? { ...station, label: 'Arrivée' } : station,
      ),
    };
    expect(await readCodeSheet(answer({ code: { source: 'published', sheet: renamed } }))).toEqual({
      ok: true,
      sheet: renamed,
    });
    // Missing on the factory, invalid, or this server does not answer: the embedded copy.
    expect(await readCodeSheet(answer({ code: { source: 'embedded', reason: 'absent' } }))).toBe(
      CODE_LINE_SHEET,
    );
    expect(
      await readCodeSheet(
        answer({ code: { source: 'published', sheet: { ...renamed, models: ['x'] } } }),
      ),
    ).toBe(CODE_LINE_SHEET);
    expect(await readCodeSheet(answer({}, 502))).toBe(CODE_LINE_SHEET);
    expect(await readCodeSheet(() => Promise.reject(new TypeError('offline')))).toBe(
      CODE_LINE_SHEET,
    );
  });
});
