import { describe, expect, it } from 'vitest';
import { DEMO_CODE_LINE } from '../../../demo/sheets.ts';
import { readCodeSheet } from './codeSheet.ts';

describe('readCodeSheet', () => {
  it('la ligne du code se dessine depuis la fiche du socle, sans copie embarquée', async () => {
    const answer =
      (body: unknown, status = 200) =>
      () =>
        Promise.resolve(Response.json(body, { status }));
    const renamed = {
      ...DEMO_CODE_LINE,
      stations: DEMO_CODE_LINE.stations.map((station, index) =>
        index === 0 ? { ...station, label: 'Arrivée' } : station,
      ),
    };
    expect(await readCodeSheet(answer({ code: { source: 'published', sheet: renamed } }))).toEqual({
      sheet: renamed,
      refusal: null,
    });
    // Not received from the core yet, of a wrong form, or this server does not answer: no sheet.
    expect(await readCodeSheet(answer({ code: null }))).toBeNull();
    expect(
      await readCodeSheet(answer({ code: { source: 'published', sheet: { item: 1 } } })),
    ).toBeNull();
    expect(await readCodeSheet(answer({}, 502))).toBeNull();
    expect(await readCodeSheet(() => Promise.reject(new TypeError('offline')))).toBeNull();
  });

  it('une fiche refusée par le socle dit pourquoi, la dernière reçue restant', async () => {
    const answer = (body: unknown) => () => Promise.resolve(Response.json(body));
    const refusal = 'duplicate station "impl"';
    // Refused with a sheet served before: both, the line drawn under the banner.
    expect(
      await readCodeSheet(
        answer({ code: { source: 'published', sheet: DEMO_CODE_LINE, refusal } }),
      ),
    ).toEqual({ sheet: DEMO_CODE_LINE, refusal });
    // Refused before any sheet: the reason alone.
    expect(
      await readCodeSheet(answer({ code: { source: 'published', sheet: null, refusal } })),
    ).toEqual({ sheet: null, refusal });
  });
});
