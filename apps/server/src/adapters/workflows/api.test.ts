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
});
