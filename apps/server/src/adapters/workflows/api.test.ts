import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FakeWorkflow, STUDIO_SHEET, waitingVideo } from '../../test/workflow-fixtures.ts';
import { WorkflowApi } from './api.ts';

const NOW = Date.parse('2026-11-04T14:05:00Z');

function studio(fake: FakeWorkflow, now = () => NOW) {
  return new WorkflowApi({
    name: 'studio',
    url: 'http://host.docker.internal:8448',
    fetchImpl: fake.fetch,
    now,
  });
}

describe('WorkflowApi', () => {
  it("la fiche et les éléments viennent de l'API du workflow, et une station ajoutée apparaît sans redéploiement", async () => {
    const fake = new FakeWorkflow();
    fake.items = [waitingVideo(), waitingVideo({ id: 'sans-carte', station: null })];
    const api = studio(fake);

    expect(await api.refresh()).toBe(true);
    const view = api.view();
    expect(view.sheet).toEqual(STUDIO_SHEET);
    // An item without a station is not on the line yet: it is not shown.
    expect(view.items).toEqual([
      {
        id: 'essai',
        card: 't_studio1',
        title: 'Une vidéo d’essai',
        station: 'revue',
        state: 'waiting',
        since: '2026-11-04T14:00:00Z',
        waits: 'Regarder le master',
        failure: null,
      },
    ]);
    expect(view).toMatchObject({ readAt: NOW, unreachableSince: null, error: null });
    expect(await api.refresh()).toBe(false);

    // The workflow adds a station to its sheet: the next read shows it, nothing else changes here.
    const sheet = structuredClone(STUDIO_SHEET);
    sheet.stations.push({
      key: 'sous-titres',
      label: 'Sous-titres',
      icon: 'comment',
      kind: 'script',
      col: 1,
      row: 1,
    });
    sheet.edges.push({ from: 'revue', to: 'sous-titres', kind: 'branch' });
    fake.sheet = sheet;
    expect(await api.refresh()).toBe(true);
    expect(api.view().sheet?.stations.map(({ key }) => key)).toEqual([
      'script',
      'revue',
      'publiee',
      'sous-titres',
    ]);

    // An invalid sheet keeps the last valid one and says why.
    fake.sheet = { ...sheet, models: ['nulle-part'] };
    await api.refresh();
    expect(api.view().sheet).toEqual(sheet);
    expect(api.view().sheetError).toContain('nulle-part');

    // The detail of an item: its files on this server, its page at the host the viewer came by.
    const detailFetch = fake.fetch;
    const withDetail = new WorkflowApi({
      name: 'studio',
      url: 'http://host.docker.internal:8448',
      now: () => NOW,
      fetchImpl: (input, init) =>
        (input instanceof Request ? input.url : input.toString()).endsWith('/api/items/essai')
          ? Promise.resolve(
              Response.json({
                ...waitingVideo(),
                script: '# Essai',
                steps: [
                  {
                    name: 'master',
                    status: 'done',
                    seconds: 1.5,
                    outputs: { master: 'ab', vide: null },
                  },
                ],
                files: [
                  { kind: 'video', name: 'master', url: '/v/essai/media/master', fps: 30 },
                  { kind: 'words', name: 'mots', url: '/api/items/essai/words', follows: 'master' },
                ],
              }),
            )
          : detailFetch(input, init),
    });
    expect(await withDetail.detail('essai', 'https://machine.tailnet.ts.net:8446')).toMatchObject({
      script: '# Essai',
      steps: [
        {
          name: 'master',
          result: 'done',
          durationMs: 1500,
          outputs: [{ name: 'master', sha256: 'ab' }],
        },
      ],
      files: [
        { kind: 'video', name: 'master', url: '/api/workflows/studio/items/essai/media/master' },
        { kind: 'words', name: 'mots', url: '/api/workflows/studio/items/essai/words' },
      ],
      links: { studio: 'https://machine.tailnet.ts.net:8448/v/essai' },
    });
    // Nothing but an id the workflow writes reaches its API.
    expect(await withDetail.detail('../etc', 'http://localhost:8446')).toBeNull();
  });

  it('un workflow injoignable garde son dernier état et le dit', async () => {
    const fake = new FakeWorkflow();
    fake.items = [waitingVideo()];
    let now = NOW;
    const api = studio(fake, () => now);
    await api.refresh();
    const before = api.view();

    fake.down = true;
    now += 30_000;
    expect(await api.refresh()).toBe(true);
    expect(api.view()).toMatchObject({
      sheet: before.sheet,
      items: before.items,
      readAt: NOW,
      unreachableSince: NOW + 30_000,
      error: 'fetch failed',
    });
    // Still down: the outage keeps its start, and nothing new is said.
    now += 30_000;
    expect(await api.refresh()).toBe(false);
    expect(api.view().unreachableSince).toBe(NOW + 30_000);

    // An API of another version is refused as unreachable, not misread.
    fake.down = false;
    const other = new WorkflowApi({
      name: 'studio',
      url: 'http://host.docker.internal:8448',
      fetchImpl: () => Promise.resolve(Response.json({ api: 2, items: [] })),
    });
    await other.refresh();
    expect(other.view().error).toContain('API 2 inconnue');

    // Back: the outage ends.
    expect(await api.refresh()).toBe(true);
    expect(api.view()).toMatchObject({ unreachableSince: null, error: null, readAt: now });
  });

  it("lit les vraies réponses de l'API du studio, version 1", async () => {
    const real = (name: string) =>
      JSON.parse(
        readFileSync(
          new URL(`../../../../../fixtures/workflow-studio-v1/${name}.json`, import.meta.url),
          'utf8',
        ),
      ) as unknown;
    const routes: Record<string, unknown> = {
      'GET /api/workflow': real('workflow'),
      'GET /api/items': real('items'),
      'GET /api/items/essai': real('item-essai'),
      'GET /api/items/essai/words': real('words-essai'),
    };
    let gesture = real('gesture-ok') as { status: number; body: unknown };
    const api = new WorkflowApi({
      name: 'studio',
      url: 'http://host.docker.internal:8448',
      now: () => NOW,
      fetchImpl: (input, init) => {
        const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
        if (init?.method === 'POST')
          return Promise.resolve(Response.json(gesture.body, { status: gesture.status }));
        const body = routes[`GET ${path}`];
        return Promise.resolve(
          body === undefined ? new Response(null, { status: 404 }) : Response.json(body),
        );
      },
    });

    await api.refresh();
    const view = api.view();
    expect(view.sheetError).toBeNull();
    expect(view.sheet?.item).toEqual({ type: 'video', label: 'Vidéo' });
    expect(
      view.sheet?.stations.filter(({ kind }) => kind === 'owner').map(({ key }) => key),
    ).toEqual(['approbation', 'tournage', 'revue']);
    expect(view.items.map(({ id, station, state }) => [id, station, state])).toEqual([
      ['essai', 'revue', 'waiting'],
      ['rendu', 'montage', 'failed'],
    ]);

    const detail = await api.detail('essai', 'http://localhost:8446');
    expect(detail?.steps.map(({ name, durationMs }) => [name, durationMs])).toEqual([
      ['cut', 1000],
      ['compose', 60000],
      ['master', 30000],
    ]);
    expect(detail?.files.map(({ kind, url }) => [kind, url])).toEqual([
      ['video', '/api/workflows/studio/items/essai/media/master'],
      ['video', '/api/workflows/studio/items/essai/media/tiktok'],
      ['words', '/api/workflows/studio/items/essai/words'],
    ]);
    expect(detail?.links).toEqual({ studio: 'http://localhost:8448/v/essai' });
    expect(await api.words('essai')).toEqual([
      { mot: 'Bonjour', debut: 0, fin: 0.5, garde: true },
      { mot: 'euh', debut: 1, fin: 1.2, garde: false },
    ]);

    expect(await api.gesture('essai', { decision: 'refaire', note: 'le son' })).toEqual({
      ok: true,
    });
    // The studio's own refusal comes back with its words.
    gesture = real('gesture-refused') as typeof gesture;
    expect(await api.gesture('essai', { decision: 'ok' })).toEqual({
      ok: false,
      status: 400,
      error: 'décision inconnue « peut-etre » : ok ou refaire',
    });
  });

  it('une vidéo sans heure d’arrivée garde celle de sa première lecture', async () => {
    const fake = new FakeWorkflow();
    fake.items = [waitingVideo({ since: null })];
    let now = NOW;
    const api = studio(fake, () => now);
    await api.refresh();
    const first = api.view().items[0]?.since;
    expect(first).toBe(new Date(NOW).toISOString());
    now += 30_000;
    await api.refresh();
    expect(api.view().items[0]?.since).toBe(first);
    // Gone from the station, then back: a new arrival.
    fake.items = [waitingVideo({ since: null, station: 'script', state: 'running' })];
    await api.refresh();
    fake.items = [waitingVideo({ since: null })];
    now += 30_000;
    await api.refresh();
    expect(api.view().items[0]?.since).toBe(new Date(now).toISOString());
  });
});
