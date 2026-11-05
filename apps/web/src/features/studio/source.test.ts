import { describe, expect, it } from 'vitest';
import { createLiveStudioSource } from './source.ts';

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
  it('sans réponse, le geste est refusé et le détail garde la vidéo déjà lue', async () => {
    let online = true;
    const source = createLiveStudioSource((input) => {
      if (!online) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(
        (input instanceof Request ? input.url : input.toString()).endsWith('/api/workflows/studio')
          ? Response.json({
              name: 'studio',
              sheet: null,
              sheetError: null,
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
