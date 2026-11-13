import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import type * as NodeFs from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type * as NodeSqlite from 'node:sqlite';
import { ProfileView } from '@factory-live/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptanceOf } from '../../application/acceptance.ts';
import type { AcceptanceSource, GitHubReadPort } from '../../application/ports.ts';
import { issueDetail, profileViews, transcripts } from '../../application/views.ts';
import type { ViewDeps } from '../../application/views.ts';
import { createLogger } from '../../logger.ts';
import { fakeCore } from '../../test/fake-core.ts';
import type { FakeCore } from '../../test/fake-core.ts';
import { CardFiles, HermesPaths, SECRET, TwinBench, coreState } from '../../test/core-scenario.ts';
import { harness } from '../../test/harness.ts';
import type { Harness } from '../../test/harness.ts';
import { tempDir } from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';
import { noAgentLog, noCardFiles, noSessions } from './absent.ts';
import { FactoryViews } from './factoryViews.ts';

// What the core's side opens, recorded at the boundary (C5): every path given to node:fs and node:sqlite.
const opened = vi.hoisted(() => ({ on: false, paths: [] as string[] }));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof NodeFs>();
  const record =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      if (opened.on && (typeof args[0] === 'string' || args[0] instanceof URL))
        opened.paths.push(String(args[0]));
      return fn(...args);
    };
  const wrapped = {
    ...real,
    readFileSync: record(real.readFileSync),
    statSync: record(real.statSync),
    existsSync: record(real.existsSync),
    readdirSync: record(real.readdirSync),
    openSync: record(real.openSync),
    realpathSync: record(real.realpathSync),
    createReadStream: record(real.createReadStream),
  };
  return { ...wrapped, default: wrapped };
});
vi.mock('node:sqlite', async (importOriginal) => {
  const real = await importOriginal<typeof NodeSqlite>();
  class RecordedDatabase extends real.DatabaseSync {
    constructor(...args: ConstructorParameters<typeof real.DatabaseSync>) {
      if (opened.on) opened.paths.push(String(args[0]));
      super(...args);
    }
  }
  return { ...real, DatabaseSync: RecordedDatabase };
});

const log = createLogger('silent');
const REPO = 'factory-live';
const PR = 24;
const HEAD = '9a72096265a97aab5223e2e1d77bf48411a8c962';
const BASE = 'c9fa041a00000000000000000000000000000000';
const CARD = 't_1a9f0049';
const PASSWORD = 'mot-de-passe-des-spectateurs';

/** The pair as the bench writes it in the board (hermes-software-factory, `factory-twins.py`). */
const BENCH_FILE = {
  surfaces: [
    {
      id: 'app',
      label: 'App',
      kind: 'web',
      changed: true,
      base: {
        sha: BASE,
        stream: `http://127.0.0.1:52000/?usr=proprietaire&pwd=${PASSWORD}`,
        poster: null,
      },
      head: {
        sha: HEAD,
        stream: `http://127.0.0.1:52002/?usr=proprietaire&pwd=${PASSWORD}`,
        poster: null,
      },
      differences: 2,
    },
    {
      id: 'site',
      label: 'Site',
      kind: 'site',
      changed: false,
      base: { sha: BASE, stream: null, poster: null },
      head: { sha: HEAD, stream: null, poster: null },
      differences: null,
    },
  ],
  state: 'ready',
  divergence: 'clic sur « Débloquer » non rejoué',
  mirror: 52004,
};

/** The same pair, as workflow-core publishes it (workflow-core#120): no session, no password. */
function coreTwins(mirror: number) {
  return [
    {
      name: 'twins',
      label: 'Jumeaux',
      values: [
        { type: 'status', label: 'État', status: 'ok', text: 'ready' },
        { type: 'text', label: 'Divergence', text: 'clic sur « Débloquer » non rejoué' },
        {
          type: 'table',
          label: 'Surfaces',
          columns: [
            'Identifiant',
            'Surface',
            'Sorte',
            'Touchée',
            'Différences',
            'Commit de base',
            'Image de base',
            'Commit de tête',
            'Image de tête',
          ],
          rows: [
            ['app', 'App', 'web', true, 2, BASE, null, HEAD, null],
            ['site', 'Site', 'site', false, null, BASE, '', HEAD, ''],
          ],
        },
        { type: 'text', label: 'Miroir', text: String(mirror) },
      ],
    },
  ];
}

/** Three proofs of the gate for a head, one file per rule, numbered, in the head's folder of the gate. */
const PROOFS: [string, string][] = [
  ['failfirst', 'test rouge avant la correction, vert après'],
  ['coverage', 'couverture 91 %'],
  ['capture', 'captures identiques'],
];
const coreProofs = (texts: [string, string][]) => [
  {
    name: 'gate-proofs',
    label: 'Preuves de la gate',
    values: texts.map(([rule, text]) => ({ type: 'text', label: rule, text })),
  },
];

/** A minimal recette's source for the PR (GitHub's side does not change with the source). */
function source(): AcceptanceSource {
  return {
    pr: PR,
    prUrl: `https://github.com/code-my-life/${REPO}/pull/${PR}`,
    head: HEAD,
    base: BASE,
    issueBody: "### Critères d'acceptation\n\n- C1 : la page s'affiche\n",
    prBody: '## Critères\n\n- C1 : capture\n',
    checks: [],
    gate: null,
    tests: { suites: [], results: [] },
    captures: [],
    threads: [],
    reviewRounds: 1,
  };
}

/** A fake mirror of the bench: `POST /viewer/<twin>` gives a viewer's session (hermes-software-factory#116). */
async function fakeMirror() {
  const asked: { path: string; body: string }[] = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += String(chunk)));
    request.on('end', () => {
      asked.push({ path: request.url ?? '', body });
      const side = /^\/viewer\/(base|head)$/.exec(request.url ?? '')?.[1];
      response.setHeader('content-type', 'application/json');
      response.setHeader('cache-control', 'no-store');
      if (request.method !== 'POST' || !side) {
        response.statusCode = 404;
        response.end(JSON.stringify({ error: 'jumeau inconnu' }));
        return;
      }
      response.end(
        JSON.stringify({ port: side === 'base' ? 52000 : 52002, token: `jeton-${side}` }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    asked,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let dir: TempDir;
let core: FakeCore | null = null;
let mirror: Awaited<ReturnType<typeof fakeMirror>> | null = null;
let h: Harness | null = null;

afterEach(async () => {
  opened.on = false;
  await core?.close();
  await mirror?.close();
  h?.close();
  core = null;
  mirror = null;
  h = null;
  dir?.remove();
});

async function coreSide(data: Record<string, unknown[] | 'invalid_id'>) {
  mirror = await fakeMirror();
  core = await fakeCore(SECRET, { ...coreState(), data: { factory: data } });
  const views = new FactoryViews({ url: core.url, secret: SECRET, workflow: 'factory', log });
  const bench = new TwinBench({ declared: (repo, pr) => views.pair(repo, pr), host: '127.0.0.1' });
  return { views, bench };
}

/** The Hermes side: the bench's file and the gate's proofs on disk, read by today's readers. */
function hermesSide() {
  dir = tempDir();
  const board = join(dir.path, 'board');
  mkdirSync(join(board, 'twins'), { recursive: true });
  writeFileSync(join(board, 'twins', `${REPO}-${PR}.json`), JSON.stringify(BENCH_FILE));
  const gate = join(board, 'workspaces', CARD, 'evidence', 'gate', HEAD.slice(0, 7));
  mkdirSync(gate, { recursive: true });
  PROOFS.forEach(([rule, text], index) =>
    writeFileSync(join(gate, `${String(index + 1).padStart(2, '0')}-${rule}.txt`), text),
  );
  const paths = new HermesPaths({
    profilesDir: join(dir.path, 'profiles'),
    boardDir: board,
    factoryRepo: join(dir.path, 'factory'),
  });
  const files = new CardFiles(board, join(dir.path, 'claude'), paths);
  const bench = new TwinBench({ file: (repo, pr) => paths.twins(repo, pr), host: '127.0.0.1' });
  return { files, bench };
}

/** A view of the core's side, on the harness' hub: nothing of Hermes' readers. */
function coreViewDeps(on: Harness): ViewDeps {
  return {
    hub: on.hub,
    store: on.store,
    sessions: noSessions,
    profiles: {
      profiles: () => ['coder'],
      live: () => null,
      repo: () => null,
      manifest: () => ({
        owner: null,
        projects: {},
        profiles: { coder: { skills: [], plugins: [] } },
      }),
      root: () => ({ maxInProgress: 0, maxInProgressPerProfile: 0 }),
      facts: () => null,
      factsStamp: () => '',
    },
    github: null,
    files: noCardFiles,
    agentLog: noAgentLog,
    owner: 'code-my-life',
    boardName: 'factory',
    dashboardUrl: null,
    heldAfterSeconds: 1_800,
    now: () => on.clock.now,
  };
}

describe('données déclarées de la factory lues par le socle (#60)', () => {
  it('côté socle, la recette d’une PR montre les jumeaux et les preuves publiés', async () => {
    const hermes = hermesSide();
    const fromHermes = acceptanceOf(
      source(),
      hermes.files.gateProofs(CARD, HEAD.slice(0, 7)),
      hermes.bench.view(REPO, PR),
    );
    expect(fromHermes.twins?.surfaces).toHaveLength(2);
    expect(fromHermes.proofs).toHaveLength(3);

    const { views, bench } = await coreSide({
      [`pr:${REPO}#${PR}`]: coreTwins(52004),
      [`card:${CARD}@${HEAD.slice(0, 7)}`]: coreProofs(PROOFS),
    });
    const proofs = await views.acceptance(REPO, PR, [CARD], HEAD);
    const fromCore = acceptanceOf(source(), proofs, bench.view(REPO, PR));

    expect(fromCore).toEqual(fromHermes);
    expect(fromCore.twins?.surfaces[0]?.base.stream).toBe(
      ['/api', 'twins', REPO, PR, 'session', 'base'].join('/'),
    );
  });

  it('la recette montre les preuves du commit de tête', async () => {
    const { views } = await coreSide({
      [`pr:${REPO}#${PR}`]: [],
      [`card:${CARD}@${HEAD.slice(0, 7)}`]: coreProofs([['failfirst', 'preuve de la tête']]),
      [`card:${CARD}@aaaaaaa`]: coreProofs([['failfirst', "preuve d'une ancienne tête"]]),
      [`card:${CARD}`]: coreProofs([['failfirst', 'preuve du passage le plus récent']]),
    });

    const proofs = await views.acceptance(REPO, PR, [CARD], HEAD);

    expect(proofs.map((proof) => proof.text)).toEqual(['preuve de la tête']);
    expect(core!.requests.map((request) => request.path)).toContain('/api/workflows/factory/data');
  });

  it('côté socle, la session d’un jumeau vient du miroir, sans mot de passe', async () => {
    const { views, bench } = await coreSide({ [`pr:${REPO}#${PR}`]: coreTwins(0) });
    // The core publishes the mirror's port: here, the fake mirror's.
    core!.state.data!['factory']![`pr:${REPO}#${PR}`] = coreTwins(mirror!.port);
    await views.acceptance(REPO, PR, [], HEAD);

    const session = await bench.session(REPO, PR, 'base', 'http://localhost:8446');

    expect(session).toEqual({
      ws: 'ws://localhost:52000/api/ws',
      token: 'jeton-base',
      candidateHost: '127.0.0.1',
    });
    expect(mirror!.asked.map((call) => call.path)).toEqual(['/viewer/base']);
    expect(JSON.stringify(mirror!.asked)).not.toContain(PASSWORD);
    expect(JSON.stringify(core!.requests)).not.toContain(PASSWORD);
    expect(JSON.stringify(bench.pair(REPO, PR))).not.toContain('pwd');
  });

  it('côté socle, la transcription d’un run est celle de la lecture d’Hermès', async () => {
    h = harness();
    // What the Hermes reading gives for these messages: the case of sessions.test.ts that transcribes a
    // message, a reasoning, a tool call and its results, at the session's times.
    const at = (s: number) => new Date((1_000 + s) * 1000).toISOString();
    const hermesEntries = [
      {
        at: at(1),
        role: 'user',
        text: 'Implémente la carte',
        toolName: null,
        model: null,
        status: null,
      },
      {
        at: at(2),
        role: 'reasoning',
        text: 'Il faut vérifier',
        toolName: null,
        model: null,
        status: null,
      },
      {
        at: at(2),
        role: 'assistant',
        text: 'Je lance les tests',
        toolName: null,
        model: null,
        status: null,
      },
      {
        at: at(2),
        role: 'tool_call',
        text: '{"command":"npm test"}',
        toolName: 'terminal',
        model: null,
        status: null,
      },
      {
        at: at(3),
        role: 'tool_result',
        text: '{"output": "ok"}',
        toolName: 'terminal',
        model: null,
        status: 'ok',
      },
      {
        at: at(4),
        role: 'tool_result',
        text: '{"error": "File not found"}',
        toolName: 'read_file',
        model: null,
        status: 'error',
      },
    ];
    const row = (entry: (typeof hermesEntries)[number]) => [
      entry.at,
      entry.role,
      entry.text,
      entry.toolName,
      entry.model,
      entry.status,
    ];
    const columns = ['Heure', 'Rôle', 'Texte', 'Outil', 'Modèle', 'Statut'];
    const { views } = await coreSide({
      'run:2': [
        {
          name: 'agent-session',
          label: "Session de l'agent",
          values: [
            { type: 'table', label: "Session de l'agent", columns, rows: hermesEntries.map(row) },
          ],
        },
        {
          name: 'claude-sessions',
          label: 'Sessions de Claude Code',
          values: [
            {
              type: 'table',
              label: 'impl factory-live#24',
              columns,
              rows: [[at(5), 'assistant', 'Fait', null, 'claude-opus', null]],
            },
          ],
        },
        {
          name: 'card-log',
          label: 'Journal de la carte',
          values: [
            { type: 'text', label: 'Journal de la carte', text: '\u001b[32mok\u001b[0m\nfin' },
          ],
        },
      ],
    });

    const prepared = await views.transcripts(2);
    const shown = transcripts(coreViewDeps(h), 2, prepared);

    expect(shown?.map((view) => view.source)).toEqual(['hermes', 'claude-code']);
    expect(shown?.[0]?.entries.map(({ id: _, ...entry }) => entry)).toEqual(hermesEntries);
    expect(new Set(shown?.[0]?.entries.map((entry) => entry.id)).size).toBe(hermesEntries.length);
    expect(shown?.[0]?.terminal).toEqual(['\u001b[32mok\u001b[0m', 'fin']);
    expect(shown?.[1]).toMatchObject({ name: 'impl factory-live#24', terminal: [] });
    expect(shown?.[1]?.entries.map((entry) => [entry.role, entry.text, entry.model])).toEqual([
      ['assistant', 'Fait', 'claude-opus'],
    ]);
  });

  it('côté socle, la dérive d’un agent est celle de la lecture d’Hermès', async () => {
    h = harness();
    // The Hermes reading: the coder's model in service (`auto`) differs from the repository's.
    const hermes = (
      (await (
        await h.app.request('/api/profiles', { headers: { host: 'localhost:8446' } })
      ).json()) as unknown[]
    ).map((view) => ProfileView.parse(view));
    const fromHermes = hermes.find((view) => view.name === 'coder')?.drift;
    expect(fromHermes?.length).toBeGreaterThan(0);

    const { views } = await coreSide({
      'agent:coder': [
        {
          name: 'drift',
          label: 'Dérive de la configuration',
          values: [
            {
              type: 'table',
              label: 'Dérive de la configuration',
              columns: ['Champ', 'Service', 'Dépôt'],
              rows: fromHermes!.map((drift) => [drift.field, drift.live, drift.repo]),
            },
          ],
        },
      ],
    });

    const drift = await views.drift(['coder']);
    const coder = profileViews(coreViewDeps(h), 30, drift).find((view) => view.name === 'coder');

    expect(coder?.drift).toEqual(fromHermes);
  });

  it('une donnée en erreur s’affiche, une donnée absente donne l’état sans jumeaux', async () => {
    const { views, bench } = await coreSide({
      [`pr:${REPO}#${PR}`]: [{ name: 'twins', label: 'Jumeaux', values: [] }],
      [`card:${CARD}@${HEAD.slice(0, 7)}`]: [
        {
          name: 'gate-proofs',
          label: 'Preuves de la gate',
          values: [
            {
              type: 'status',
              label: 'Preuves de la gate',
              status: 'error',
              text: 'illisible : droits',
            },
          ],
        },
      ],
    });

    const proofs = await views.acceptance(REPO, PR, [CARD], HEAD);
    const view = acceptanceOf(source(), proofs, bench.view(REPO, PR));

    expect(view.proofs.map((proof) => proof.content)).toEqual(['illisible : droits']);
    expect(view.twins).toBeNull();
    expect(view.twinsAbsent).toBe('no_build');
  });

  it('des preuves lues pour une autre tête ne sont pas montrées', () => {
    h = harness();
    // GitHub's side moved to a new head while the proofs of the old one were read.
    const github = {
      issueInfo: () => null,
      pullRequest: () => null,
      acceptance: () => ({ ...source(), head: 'b'.repeat(40) }),
    } as unknown as GitHubReadPort;
    const deps = { ...coreViewDeps(h), github };
    const old = [{ order: 1, rule: 'failfirst', text: "preuve de l'ancienne tête" }];

    const stale = issueDetail(deps, 'cv-site#49', { proofs: old, head: HEAD });
    const fresh = issueDetail(deps, 'cv-site#49', { proofs: old, head: 'b'.repeat(40) });

    expect(stale?.acceptance?.proofs).toEqual([]);
    expect(fresh?.acceptance?.proofs.map((proof) => proof.content)).toEqual([
      "preuve de l'ancienne tête",
    ]);
  });

  it('un port de miroir hors des ports possibles ne donne pas de paire', async () => {
    const { views, bench } = await coreSide({ [`pr:${REPO}#${PR}`]: coreTwins(0) });
    for (const port of [0, 70_000]) {
      core!.state.data!['factory']![`pr:${REPO}#${PR}`] = coreTwins(port);
      await views.acceptance(REPO, PR, [], HEAD);
      expect(bench.view(REPO, PR), String(port)).toBeNull();
    }
  });

  it('la dernière réponse du socle n’est gardée que pour les sujets récents', async () => {
    const { views } = await coreSide({});
    const run = (n: number) => [
      {
        name: 'card-log',
        label: 'Journal de la carte',
        values: [{ type: 'text', label: 'Journal de la carte', text: `journal ${n}` }],
      },
    ];
    for (let n = 1; n <= 150; n += 1) {
      core!.state.data!['factory']![`run:${n}`] = run(n);
      await views.transcripts(n);
    }
    await core!.close();
    core = null;

    // The core gone: the latest subjects keep their last answer, the oldest ones are no longer held.
    expect((await views.transcripts(150))?.terminal).toEqual(['journal 150']);
    expect((await views.transcripts(1))?.terminal).toEqual([]);
  });

  it('côté socle, ni Hermès, ni le dépôt de la factory, ni Claude Code ne sont lus', async () => {
    h = harness();
    const { views, bench } = await coreSide({
      [`pr:${REPO}#${PR}`]: coreTwins(52004),
      [`card:${CARD}@${HEAD.slice(0, 7)}`]: coreProofs(PROOFS),
    });
    opened.on = true;
    await views.acceptance(REPO, PR, [CARD], HEAD);
    acceptanceOf(source(), [], bench.view(REPO, PR));
    transcripts(coreViewDeps(h), 2, await views.transcripts(2));
    profileViews(coreViewDeps(h), 30, await views.drift(['coder']));
    opened.on = false;
    expect(opened.paths).toEqual([]);

    // The adapter of the core knows no path of the factory; only factoryViews.ts names its data.
    const adapter = import.meta.dirname;
    const NAMES = /['"`](twins|gate-proofs|agent-session|claude-sessions|card-log|drift)['"`]/;
    for (const file of readdirSync(adapter).filter((name) => name.endsWith('.ts'))) {
      if (file.endsWith('.test.ts')) continue;
      const code = readFileSync(join(adapter, file), 'utf8');
      expect(code, file).not.toMatch(/twins\/|evidence\/gate|\.claude\/projects/i);
      if (file !== 'factoryViews.ts') expect(code, file).not.toMatch(NAMES);
    }
    const sources = join(adapter, '..', '..');
    const walk = (folder: string): string[] =>
      readdirSync(folder).flatMap((name) => {
        const path = join(folder, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    const outside = walk(sources).filter(
      (path) =>
        path.endsWith('.ts') &&
        !path.endsWith('.test.ts') &&
        !path.includes(`${join('adapters', 'workflow-core')}`) &&
        !path.includes(join('src', 'test')),
    );
    for (const path of outside)
      expect(readFileSync(path, 'utf8'), path).not.toMatch(
        /['"`](gate-proofs|agent-session|claude-sessions|card-log)['"`]/,
      );
  });
});
