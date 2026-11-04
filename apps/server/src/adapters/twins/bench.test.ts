import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDir } from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';
import { HermesPaths } from '../hermes/paths.ts';
import { TwinBench } from './bench.ts';

/** The state file as `factory-twins.py status` writes it, plus the mirror's port (hermes-software-factory#29). */
const PAIR = {
  surfaces: [
    {
      id: 'app',
      label: 'App',
      kind: 'web',
      changed: true,
      base: {
        sha: 'a'.repeat(40),
        stream: 'https://machine.tailnet.ts.net:52125/?usr=proprietaire&pwd=secret',
        poster: null,
      },
      head: {
        sha: 'b'.repeat(40),
        stream: 'https://machine.tailnet.ts.net:52127/?usr=proprietaire&pwd=secret',
        poster: null,
      },
      differences: null,
    },
  ],
  state: 'ready',
  divergence: null,
  mirror: 52129,
};

let dir: TempDir;
let board: string;
let calls: { url: string; init: RequestInit | undefined }[];

function bench(answer: (url: string) => Response = () => Response.json({ token: 'tok' })) {
  const paths = new HermesPaths({
    profilesDir: join(dir.path, 'profiles'),
    boardDir: board,
    factoryRepo: join(dir.path, 'factory'),
  });
  return new TwinBench({
    file: (repo, pr) => paths.twins(repo, pr),
    host: 'host.docker.internal',
    fetchImpl: ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(answer(url));
    }) as typeof fetch,
  });
}

beforeEach(() => {
  dir = tempDir();
  board = join(dir.path, 'board');
  mkdirSync(join(board, 'twins'), { recursive: true });
  calls = [];
});

afterEach(() => dir.remove());

describe('banc de jumeaux', () => {
  it('sans fichier d’état, la PR n’a pas de jumeaux', () => {
    expect(bench().view('factory-live', 25)).toBeNull();
  });

  it('la vue des jumeaux ne donne aucun mot de passe à la PWA', () => {
    writeFileSync(join(board, 'twins', 'factory-live-25.json'), JSON.stringify(PAIR));
    const view = bench().view('factory-live', 25);
    expect(view?.state).toBe('ready');
    expect(view?.surfaces[0]?.base.stream).toBe('/api/twins/factory-live/25/session/base');
    expect(JSON.stringify(view)).not.toContain('secret');
  });

  it('un fichier hors du dossier des jumeaux, ou par un lien, n’est pas lu', () => {
    writeFileSync(join(dir.path, 'other.json'), JSON.stringify(PAIR));
    symlinkSync(join(dir.path, 'other.json'), join(board, 'twins', 'factory-live-25.json'));
    expect(bench().view('factory-live', 25)).toBeNull();
    expect(bench().view('../other', 25)).toBeNull();
  });

  it('un fichier mal formé ne fait pas de jumeaux', () => {
    writeFileSync(join(board, 'twins', 'factory-live-25.json'), '{"state":"ready"');
    expect(bench().view('factory-live', 25)).toBeNull();
  });

  it('la session se prend côté serveur, et le WebSocket suit l’hôte de la PWA', async () => {
    writeFileSync(join(board, 'twins', 'factory-live-25.json'), JSON.stringify(PAIR));
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
    expect(calls[0]?.url).toBe('http://host.docker.internal:52127/api/login');
    expect(JSON.parse(calls[0]?.init?.body as string)).toMatchObject({ password: 'secret' });
    const local = await bench().session('factory-live', 25, 'base', 'http://localhost:8446');
    expect(local).toMatchObject({ ws: 'ws://localhost:52125/api/ws', candidateHost: '127.0.0.1' });
  });

  it('le miroir est relayé : geste, état, piloter séparément, resynchroniser', async () => {
    writeFileSync(join(board, 'twins', 'factory-live-25.json'), JSON.stringify(PAIR));
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
});
