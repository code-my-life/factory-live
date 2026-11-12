import type * as NodeFs from 'node:fs';
import type * as NodeSqlite from 'node:sqlite';
import { ProfileView } from '@factory-live/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { profileViews } from '../../application/views.ts';
import type { ViewDeps } from '../../application/views.ts';
import { createLogger } from '../../logger.ts';
import { SECRET, coreSide, coreState, until } from '../../test/core-scenario.ts';
import type { Side } from '../../test/core-scenario.ts';
import { fakeCore } from '../../test/fake-core.ts';
import type { FakeCore, FakeCoreState } from '../../test/fake-core.ts';
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
const LIMITS = [
  { key: 'hook_callback_timeout', value: null, default: 30, unit: 'seconds' },
  { key: 'tool_deadline', value: null, default: 420, unit: 'seconds' },
  { key: 'terminal_timeout', value: null, default: 180, unit: 'seconds' },
  { key: 'max_turns', value: null, default: null, unit: 'turns' },
];

/** One agent as workflow-core publishes it (#129): the harness' configuration of a factory agent. */
const agent = (name: string, skill: string, patch: Record<string, unknown> = {}) => ({
  name,
  skills: [skill],
  model: { name: 'auto', provider: 'freellmapi' },
  fallbacks: [],
  effort: null,
  toolsets: [],
  plugins: [{ name: 'factory-notify', longest_seconds: null, hook_timeouts: 0 }],
  mcp: [],
  limits: LIMITS,
  ...patch,
});

/** The harness' factory (four agents, the kanban at 2 and 1), as the core serves it, by name. */
const AGENTS = {
  kanban: { max_in_progress: 2, max_in_progress_per_profile: 1 },
  agents: [
    agent('coder', 'factory-author-proof'),
    agent('coordinator', 'factory-brief'),
    agent('gate', 'factory-gate'),
    agent('release', 'factory-release'),
  ],
};

let dir: TempDir | null = null;
let core: FakeCore | null = null;
let side: Side | null = null;
let h: Harness | null = null;

afterEach(async () => {
  opened.on = false;
  opened.paths = [];
  await side?.reader.stop();
  await core?.close();
  h?.close();
  dir?.remove();
  side = null;
  core = null;
  h = null;
  dir = null;
});

async function start(state: Partial<FakeCoreState>): Promise<Side> {
  dir = tempDir();
  core = await fakeCore(SECRET, { ...coreState(), ...state });
  side = coreSide(dir, core);
  side.reader.start();
  await until(() => side!.hub.profiles.length > 0);
  return side;
}

/** The agents' screen on the core's side: the core's agents, on the harness' board and activity. */
function coreViews(on: Harness, of: Side): ViewDeps {
  const board = on.hub.boardData;
  of.hub.replaceBoard(
    {
      tasks: [...board.tasks],
      runs: [...board.runs],
      links: [...board.links],
      events: [...board.events],
      comments: [...board.comments],
    },
    on.clock.now,
  );
  return {
    hub: of.hub,
    store: on.store,
    sessions: noSessions,
    profiles: of.profiles,
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

const byName = (views: ProfileView[]) => Object.fromEntries(views.map((view) => [view.name, view]));

async function hermesProfiles(on: Harness): Promise<ProfileView[]> {
  const answer = await on.app.request('/api/profiles', { headers: { host: 'localhost:8446' } });
  return ((await answer.json()) as unknown[]).map((view) => ProfileView.parse(view));
}

describe('écran Agents lu par le socle (#93)', () => {
  it('côté socle, l’écran Agents est celui de la lecture d’Hermès', async () => {
    h = harness();
    const fromHermes = await hermesProfiles(h);
    expect(fromHermes.find((view) => view.name === 'coder')!.drift.length).toBeGreaterThan(0);
    // Each agent's drift, as the core publishes it in declared data (#60).
    const driftData = Object.fromEntries(
      fromHermes.map((view) => [
        `agent:${view.name}`,
        [
          {
            name: 'drift',
            label: 'Dérive de la configuration',
            values: [
              {
                type: 'table',
                label: 'Dérive de la configuration',
                columns: ['Champ', 'Service', 'Dépôt'],
                rows: view.drift.map((drift) => [drift.field, drift.live, drift.repo]),
              },
            ],
          },
        ],
      ]),
    );
    const { hub, profiles } = await start({
      agents: { factory: AGENTS },
      data: { factory: driftData },
    });
    const declared = new FactoryViews({ url: core!.url, secret: SECRET, workflow: 'factory', log });

    const fromCore = profileViews(coreViews(h, side!), 30, await declared.drift(hub.profiles));

    // The same agents, the same views field by field; the core lists them by name.
    expect(hub.profiles).toEqual(['coder', 'coordinator', 'gate', 'release']);
    expect(byName(fromCore)).toEqual(byName(fromHermes));
    expect(profiles.profiles()).toEqual(hub.profiles);
  });

  it('côté socle, les dépassements et la plus longue commande d’un plugin viennent du socle', async () => {
    h = harness();
    await start({
      agents: {
        factory: {
          ...AGENTS,
          agents: [
            agent('coder', 'factory-author-proof', {
              plugins: [{ name: 'coder-guard', longest_seconds: 900, hook_timeouts: 2 }],
            }),
          ],
        },
      },
    });

    const [coder] = profileViews(coreViews(h, side!), 30, new Map());

    expect(coder?.plugins).toEqual([
      { name: 'coder-guard', refusals: 0, timeouts: 2, longestSeconds: 900 },
    ]);
    // The facts the hub reads for the guards come from the same answer.
    expect(side!.profiles.facts('coder')?.longestCommands).toEqual({ 'coder-guard': 900 });
  });

  it('côté socle, la dérive d’un agent apparaît sur l’écran Agents', async () => {
    h = harness();
    const drift = [{ field: 'model' as const, live: 'freellmapi/auto', repo: 'freellmapi/agnes' }];
    await start({ agents: { factory: AGENTS } });

    const views = profileViews(coreViews(h, side!), 30, new Map([['coder', drift]]));

    expect(byName(views)['coder']?.drift).toEqual(drift);
    expect(byName(views)['gate']?.drift).toEqual([]);
  });

  it('côté socle, les réglages du kanban et les derniers agents reçus restent', async () => {
    const { hub, reader } = await start({
      agents: {
        factory: { ...AGENTS, kanban: { max_in_progress: 3, max_in_progress_per_profile: 2 } },
      },
    });
    expect(hub.settings).toEqual({ maxInProgress: 3, maxInProgressPerProfile: 2 });
    const station = (id: string) => hub.snapshot().stations.find((view) => view.id === id);
    expect(station('implementation')?.profiles).toContain('coder');

    // The core stops answering: the last agents and settings received stay.
    await core!.close();
    core = null;
    await reader.refreshAgents();
    expect(hub.profiles).toEqual(['coder', 'coordinator', 'gate', 'release']);
    expect(hub.settings).toEqual({ maxInProgress: 3, maxInProgressPerProfile: 2 });
  });

  it('côté socle, ni Hermès ni le dépôt de la factory ne sont lus pour les agents', async () => {
    h = harness();
    const { reader } = await start({ agents: { factory: AGENTS } });
    opened.on = true;
    await reader.refreshAgents();
    profileViews(coreViews(h, side!), 30, new Map());
    side!.hub.reloadConfig();
    side!.hub.snapshot();
    opened.on = false;

    expect(opened.paths.filter((path) => !path.includes('core-data'))).toEqual([]);
    const agentsCalls = core!.requests.filter((request) => request.path.endsWith('/agents'));
    expect(agentsCalls.length).toBeGreaterThan(1);
  });
});
