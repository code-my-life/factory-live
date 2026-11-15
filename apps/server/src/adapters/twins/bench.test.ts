import { beforeEach, describe, expect, it } from 'vitest';
import type { DeclaredPair } from './bench.ts';
import { TwinBench } from './bench.ts';

/** The pair as workflow-core publishes it (#60): no password, the mirror's port. */
const PAIR = {
  surfaces: [
    {
      id: 'app',
      label: 'App',
      kind: 'web',
      changed: true,
      base: { sha: 'a'.repeat(40), stream: null, poster: null },
      head: { sha: 'b'.repeat(40), stream: null, poster: null },
      differences: null,
    },
  ],
  state: 'ready',
  divergence: null,
  mirror: 52129,
};

let calls: { url: string; init: RequestInit | undefined }[];
let published: Record<string, typeof PAIR>;

function bench(
  answer: (url: string) => Response = () => Response.json({ port: 52127, token: 'tok' }),
) {
  return new TwinBench({
    declared: (repo, pr) => {
      const pair = published[`${repo}-${pr}`];
      if (!pair) return null;
      const { mirror, ...twins } = pair;
      return { twins, mirror } as DeclaredPair;
    },
    host: 'host.docker.internal',
    fetchImpl: ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(answer(url));
    }) as typeof fetch,
  });
}

beforeEach(() => {
  published = {};
  calls = [];
});

describe('banc de jumeaux', () => {
  it('sans paire publiée, la PR n’a pas de jumeaux', () => {
    expect(bench().view('factory-live', 25)).toBeNull();
  });

  it('la vue des jumeaux donne à la PWA l’adresse de ce serveur pour chaque session', () => {
    published['factory-live-25'] = PAIR;
    const view = bench().view('factory-live', 25);
    expect(view?.state).toBe('ready');
    expect(view?.surfaces[0]?.base.stream).toBe('/api/twins/factory-live/25/session/base');
  });

  it('la session s’ouvre par le miroir, et le WebSocket suit l’hôte de la PWA', async () => {
    published['factory-live-25'] = PAIR;
    const tailnet = await bench().session(
      'factory-live',
      25,
      'head',
      'https://machine.tailnet.ts.net:8446',
    );
    expect(tailnet).toEqual({
      ws: 'wss://machine.tailnet.ts.net:52127/api/ws',
      token: 'tok',
      candidateHost: null,
    });
    expect(calls[0]?.url).toBe('http://host.docker.internal:52129/viewer/head');
    const local = await bench().session('factory-live', 25, 'base', 'http://localhost:8446');
    expect(local).toMatchObject({ ws: 'ws://localhost:52127/api/ws', candidateHost: '127.0.0.1' });
  });

  it('le miroir est relayé : geste, état, piloter séparément, resynchroniser', async () => {
    published['factory-live-25'] = PAIR;
    const twins = bench((url) =>
      url.endsWith('/state')
        ? Response.json({
            mirror: false,
            divergence: 'Les deux écrans diffèrent',
            lag_ms: { median: 0.12 },
          })
        : new Response(null, { status: 200 }),
    );
    await twins.gesture('factory-live', 25, {
      side: 'head',
      event: 'control/move',
      payload: { x: 78, y: 300 },
    });
    await twins.mirror('factory-live', 25, false);
    await twins.resync('factory-live', 25);
    expect(calls.map((call) => call.url)).toEqual([
      'http://host.docker.internal:52129/gesture',
      'http://host.docker.internal:52129/mirror',
      'http://host.docker.internal:52129/resync',
    ]);
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
      twin: 'head',
      event: 'control/move',
      payload: { x: 78, y: 300 },
    });
    expect(await twins.state('factory-live', 25)).toEqual({
      mirror: false,
      divergence: 'Les deux écrans diffèrent',
      lagMs: 0.12,
    });
  });

  it('une autre surface que l’app ne montre ni ne pilote les jumeaux de l’app', () => {
    const site = { ...PAIR.surfaces[0]!, id: 'site', label: 'Site', kind: 'site' };
    published['factory-live-25'] = { ...PAIR, surfaces: [PAIR.surfaces[0]!, site] };
    const view = bench().view('factory-live', 25);
    expect(view?.surfaces.map((each) => [each.id, each.head.stream])).toEqual([
      ['app', '/api/twins/factory-live/25/session/head'],
      ['site', null],
    ]);
  });
});
