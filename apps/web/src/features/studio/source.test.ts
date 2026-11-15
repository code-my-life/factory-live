import { describe, expect, it } from 'vitest';
import { DEMO_STUDIO } from '../../demo/sheets.ts';
import { createDemoStudioSource, createLiveStudioSource } from './source.ts';

const VIDEO = {
  id: 'essai',
  card: 't_studio1',
  title: 'Une vidéo d’essai',
  station: 'revue',
  state: 'waiting',
  since: '2026-11-05T10:00:00.000Z',
  waits: 'Regarder le master',
  failure: null,
};

describe('createLiveStudioSource', () => {
  it('la vue du studio dessine la fiche servie par le socle', async () => {
    // What this server answers for the studio: the sheet workflow-core serves (#72), the videos its own
    // adapter reads from the studio (WORKFLOWS).
    let served: { sheet: unknown; sheetRefusal: string | null } = {
      sheet: null,
      sheetRefusal: null,
    };
    const asked: string[] = [];
    const source = createLiveStudioSource((input) => {
      asked.push(input instanceof Request ? input.url : input.toString());
      return Promise.resolve(
        Response.json({
          name: 'studio',
          ...served,
          items: [VIDEO],
          readAt: 0,
          unreachableSince: null,
          error: null,
        }),
      );
    });

    // Before the core's first sheet: the studio waits for it, its videos already there.
    expect(await source.status()).toMatchObject({ sheetRead: false });
    expect(await source.items()).toEqual([VIDEO]);

    // The core's sheet: the studio's graph is drawn from it, as it is.
    served = { sheet: DEMO_STUDIO, sheetRefusal: null };
    expect(await source.status()).toMatchObject({
      sheetRead: true,
      sheet: { ok: true, sheet: DEMO_STUDIO },
    });

    // The core refuses the sheet: why, as it says it.
    served = { sheet: null, sheetRefusal: 'duplicate station "revue"' };
    expect((await source.status()).sheet).toEqual({
      ok: false,
      error: 'duplicate station "revue"',
    });
    // Everything is read through this server, nothing from the studio itself.
    expect(asked.every((url) => url.startsWith('/api/workflows/studio'))).toBe(true);
  });

  it('sans réponse, le geste est refusé et le détail garde la vidéo déjà lue', async () => {
    let online = true;
    const source = createLiveStudioSource((input) => {
      if (!online) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(
        (input instanceof Request ? input.url : input.toString()).endsWith('/api/workflows/studio')
          ? Response.json({
              name: 'studio',
              sheet: null,
              sheetRefusal: null,
              items: [VIDEO],
              readAt: 0,
              unreachableSince: null,
              error: null,
            })
          : (input instanceof Request ? input.url : input.toString()).endsWith('/items/rendu')
            ? Response.json({
                ...VIDEO,
                id: 'rendu',
                script: '# Rendu',
                steps: [],
                files: [],
                links: {},
              })
            : (input instanceof Request ? input.url : input.toString()).endsWith(
                  '/items/rendu/words',
                )
              ? Response.json({ words: [{ mot: 'Bonjour', debut: 0, fin: 0.5, garde: true }] })
              : Response.json({ error: 'erreur' }, { status: 502 }),
      );
    });
    expect((await source.status()).sheetRead).toBe(false);
    expect(await source.items()).toEqual([VIDEO]);
    const rendu = await source.item('rendu');
    const renduWords = await source.words('rendu');

    online = false;
    // The form is free again, with why.
    expect(await source.gesture('essai', { decision: 'ok' })).toEqual({
      ok: false,
      error: 'Failed to fetch',
    });
    // The video as the last list read it, without its files; its words empty, never a failure.
    expect(await source.item('essai')).toEqual({
      ...VIDEO,
      script: '',
      steps: [],
      files: [],
      links: {},
    });
    expect(await source.item('inconnue')).toBeNull();
    expect(await source.words('essai')).toEqual([]);
    // A detail and words read before the outage stay as they were.
    expect(await source.item('rendu')).toEqual(rendu);
    expect(rendu?.script).toBe('# Rendu');
    expect(await source.words('rendu')).toEqual(renduWords);
    expect(renduWords).toHaveLength(1);
    expect((await source.status()).unreachableSince).not.toBeNull();
  });
});

describe('wordsDerived', () => {
  it('dans la démo, seuls les mots de presenter sont dérivés ; en direct, jamais', () => {
    const demo = createDemoStudioSource();
    expect(demo.wordsDerived('presenter-factory-live')).toBe(true);
    expect(demo.wordsDerived('vitrine-factory-live')).toBe(false);
    const live = createLiveStudioSource(() => Promise.reject(new Error('hors ligne')));
    expect(live.wordsDerived('presenter-factory-live')).toBe(false);
  });
});
