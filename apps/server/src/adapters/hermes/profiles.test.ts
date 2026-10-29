import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDir } from '../../test/hermes-fixtures.ts';
import type { TempDir } from '../../test/hermes-fixtures.ts';
import { HermesPaths } from './paths.ts';
import { ProfileConfigReader, pluginHooksOf, profileFactsOf } from './profiles.ts';

/** Le bloc `register()` de coder-guard, tel qu'il est dans la factory. */
const CODER_GUARD = `def register(ctx):
    ctx.register_hook("pre_tool_call", pre_tool)
    ctx.register_hook("post_tool_call", post_tool)
    ctx.register_hook("pre_llm_call", inject)
`;

let dir: TempDir;
let hermes: string;
let factory: string;
let reader: ProfileConfigReader;

function writeConfig(root: string, yaml: string) {
  mkdirSync(join(root, 'profiles', 'coder'), { recursive: true });
  writeFileSync(join(root, 'profiles', 'coder', 'config.yaml'), yaml);
}

beforeEach(() => {
  dir = tempDir();
  hermes = join(dir.path, 'hermes');
  factory = join(dir.path, 'factory');
  writeConfig(
    hermes,
    'agent:\n  max_turns: 400\nterminal:\n  timeout: 900\nplugins:\n  enabled: [coder-guard, comment-guard]\n',
  );
  writeConfig(factory, 'plugins:\n  enabled: [coder-guard]\n  hook_callback_timeout: 600\n');
  mkdirSync(join(hermes, 'profiles', 'coder', 'plugins', 'coder-guard'), { recursive: true });
  writeFileSync(
    join(hermes, 'profiles', 'coder', 'plugins', 'coder-guard', '__init__.py'),
    CODER_GUARD,
  );
  mkdirSync(join(factory, 'plugins', 'comment-guard'), { recursive: true });
  writeFileSync(
    join(factory, 'plugins', 'comment-guard', '__init__.py'),
    'def register(ctx):\n    ctx.register_hook( "pre_tool_call",guard )',
  );
  reader = new ProfileConfigReader(
    hermes,
    factory,
    new HermesPaths({
      profilesDir: join(hermes, 'profiles'),
      boardDir: join(hermes, 'kanban', 'boards', 'factory'),
      factoryRepo: factory,
    }),
  );
});

afterEach(() => dir.remove());

describe('ProfileConfigReader.facts', () => {
  it('lit les délais en service, la valeur du dépôt et les hooks des plugins actifs', () => {
    const facts = reader.facts('coder');
    expect(facts).toMatchObject({
      profile: 'coder',
      hookTimeout: null,
      toolDeadline: null,
      terminalTimeout: 900,
      maxTurns: 400,
      repoHookTimeout: 600,
      plugins: ['coder-guard', 'comment-guard'],
    });
    expect(facts?.changedAt).toBeGreaterThan(0);
    expect(
      facts?.hooks.map((hook) => [hook.plugin, hook.hook, hook.callback, hook.source]),
    ).toEqual([
      ['coder-guard', 'pre_tool_call', 'pre_tool', 'ctx.register_hook("pre_tool_call", pre_tool)'],
      [
        'coder-guard',
        'post_tool_call',
        'post_tool',
        'ctx.register_hook("post_tool_call", post_tool)',
      ],
      ['coder-guard', 'pre_llm_call', 'inject', 'ctx.register_hook("pre_llm_call", inject)'],
      // Absent du profil : le code du dépôt de la factory, dernière ligne sans retour à la ligne.
      ['comment-guard', 'pre_tool_call', 'guard', 'ctx.register_hook( "pre_tool_call",guard )'],
    ]);
  });

  it('dit « dépôt illisible » autrement que « clé absente du dépôt »', () => {
    writeConfig(factory, 'plugins:\n  enabled: [coder-guard]\n');
    expect(reader.facts('coder')).toHaveProperty('repoHookTimeout', null);
    writeConfig(factory, 'plugins: [');
    expect(reader.facts('coder')).not.toHaveProperty('repoHookTimeout');
  });

  it('change d’empreinte quand la config ou le code d’un plugin change', () => {
    reader.facts('coder');
    const before = reader.factsStamp('coder');
    expect(reader.factsStamp('coder')).toBe(before);
    const plugin = join(hermes, 'profiles', 'coder', 'plugins', 'coder-guard', '__init__.py');
    utimesSync(plugin, new Date(), new Date(Date.now() + 5_000));
    const afterPlugin = reader.factsStamp('coder');
    expect(afterPlugin).not.toBe(before);
    writeConfig(hermes, 'plugins:\n  hook_callback_timeout: 600\n');
    expect(reader.factsStamp('coder')).not.toBe(afterPlugin);
    expect(reader.facts('coder')).toMatchObject({ hookTimeout: 600, plugins: [], hooks: [] });
  });

  it('rend null pour une config absente, illisible ou un nom dangereux', () => {
    expect(reader.facts('inconnu')).toBeNull();
    expect(reader.facts('../coder')).toBeNull();
    writeConfig(hermes, 'plugins: [');
    expect(reader.facts('coder')).toBeNull();
    expect(reader.factsStamp('inconnu')).toBe('-');
  });
});

describe('profileFactsOf', () => {
  it('lit les nombres comme Hermès, et le délai d’un lot d’outils à défaut de celui d’un appel', () => {
    const facts = profileFactsOf(
      'coder',
      {
        plugins: { hook_callback_timeout: '600' },
        timeouts: { tools: { concurrent_batch: 300 } },
        terminal: { timeout: true },
        agent: { max_turns: '' },
      },
      null,
      null,
      [],
    );
    expect(facts).toMatchObject({
      hookTimeout: 600,
      toolDeadline: 300,
      terminalTimeout: null,
      maxTurns: null,
    });
    expect(
      profileFactsOf(
        'coder',
        { timeouts: { tools: { sequential_call: 500, concurrent_batch: 300 } } },
        null,
        null,
        [],
      ).toolDeadline,
    ).toBe(500);
  });

  it('ne retient que les enregistrements de hooks', () => {
    expect(pluginHooksOf('x', '# register_hook est appelé plus bas\nregister(ctx)')).toEqual([]);
  });
});
