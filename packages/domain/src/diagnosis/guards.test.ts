import { describe, expect, it } from 'vitest';
import { effectiveHookLimit, guardRisks, hookTimeoutsByPlugin } from './guards.ts';
import { FACTORY_HOOKS, coderProfile } from './incidents.fixture-builder.test-helpers.ts';
import type { LogFact, ProfileFacts } from './types.ts';

/** Les plus longues commandes des gardes de la factory, lues dans leur code (2026-10-29). */
const LONGEST = { 'coder-guard': 900, 'merge-guard': 30 };

function agent(profile: string, patch: Partial<ProfileFacts> = {}): ProfileFacts {
  return coderProfile({ profile, longestCommands: LONGEST, ...patch });
}

const RELEASE = agent('release', {
  hookTimeout: null,
  plugins: ['comment-guard', 'merge-guard'],
});

function timeout(callback: string, hook = 'pre_tool_call'): LogFact {
  return {
    at: 1_793_263_570,
    sessionId: null,
    kind: 'hook_timeout',
    hook,
    callback,
    module: null,
    seconds: 30,
    plugin: null,
    detail: null,
    count: null,
    line: `Hook '${hook}' callback ${callback} timed out after 30s`,
  };
}

describe('effectiveHookLimit', () => {
  it('suit Hermès : 30 s par défaut, 600 s au plus, jamais plus que le plafond des outils', () => {
    expect(effectiveHookLimit({ hookTimeout: null, toolDeadline: null })).toBe(30);
    expect(effectiveHookLimit({ hookTimeout: -5, toolDeadline: null })).toBe(30);
    expect(effectiveHookLimit({ hookTimeout: 600, toolDeadline: null })).toBe(420);
    expect(effectiveHookLimit({ hookTimeout: 900, toolDeadline: 1_200 })).toBe(600);
    expect(effectiveHookLimit({ hookTimeout: 120, toolDeadline: 900 })).toBe(120);
  });

  it('sans délai du hook ni plafond des outils, plus rien ne le coupe', () => {
    expect(effectiveHookLimit({ hookTimeout: 0, toolDeadline: null })).toBe(420);
    expect(effectiveHookLimit({ hookTimeout: 600, toolDeadline: 0 })).toBe(600);
    expect(effectiveHookLimit({ hookTimeout: 0, toolDeadline: 0 })).toBeNull();
  });
});

describe('guardRisks', () => {
  it('signale, avant tout incident, coder-guard à 900 s sous un hook de 30 s', () => {
    expect(guardRisks([agent('coder')])).toEqual([
      { plugin: 'coder-guard', profiles: ['coder'], longest: 900, limit: 30 },
    ]);
  });

  it('regroupe les agents d’une même garde aux mêmes délais, une ligne par garde et par délai', () => {
    const fixed = (name: string) => agent(name, { hookTimeout: 600 });
    expect(
      guardRisks([fixed('coder'), fixed('coder-claude'), fixed('scribe'), RELEASE, agent('gate')]),
    ).toEqual([
      // Le pire écart d'abord : la même garde, coupée plus tôt.
      { plugin: 'coder-guard', profiles: ['gate'], longest: 900, limit: 30 },
      {
        plugin: 'coder-guard',
        profiles: ['coder', 'coder-claude', 'scribe'],
        longest: 900,
        limit: 420,
      },
      { plugin: 'merge-guard', profiles: ['release'], longest: 30, limit: 30 },
    ]);
  });

  it('ignore une garde sans hook, sans délai connu, ou qui tient dans le délai', () => {
    expect(guardRisks([agent('coder', { hooks: [] })])).toEqual([]);
    expect(guardRisks([agent('coder', { longestCommands: {} })])).toEqual([]);
    expect(guardRisks([agent('coder', { hookTimeout: 0, toolDeadline: 0 })])).toEqual([]);
    expect(guardRisks([agent('release', { hookTimeout: 60, plugins: ['merge-guard'] })])).toEqual(
      [],
    );
  });
});

describe('hookTimeoutsByPlugin', () => {
  it('attribue un dépassement au seul plugin actif qui branche ce callback', () => {
    const counts = hookTimeoutsByPlugin(
      [timeout('pre_tool'), timeout('pre_tool'), timeout('post_tool', 'post_tool_call')],
      coderProfile(),
    );
    expect([...counts]).toEqual([['coder-guard', 3]]);
  });

  it('ne compte pour personne un callback partagé par deux plugins actifs', () => {
    const gate = { plugins: ['comment-guard', 'gate-readonly'], hooks: FACTORY_HOOKS };
    expect(hookTimeoutsByPlugin([timeout('guard')], gate).size).toBe(0);
    // Un seul des deux actif : le dépassement est le sien.
    const counts = hookTimeoutsByPlugin([timeout('guard')], {
      ...gate,
      plugins: ['gate-readonly'],
    });
    expect([...counts]).toEqual([['gate-readonly', 1]]);
  });

  it('ignore les autres lignes du journal', () => {
    const skipped: LogFact = { ...timeout('pre_tool'), kind: 'hook_skipped' };
    expect(hookTimeoutsByPlugin([skipped], coderProfile()).size).toBe(0);
  });
});
