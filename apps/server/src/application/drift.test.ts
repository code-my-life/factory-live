import { describe, expect, it } from 'vitest';
import { configDrift } from './drift.ts';
import type { ProfileConfig } from './ports.ts';

const repo: ProfileConfig = {
  model: { model: 'agnes-2.5-flash', provider: 'freellmapi' },
  baseUrl: null,
  fallbacks: [{ model: 'dots3-note-preview', provider: 'freellmapi' }],
  effort: 'low',
  toolsets: ['terminal', 'file'],
  plugins: ['coder-guard', 'factory-notify'],
  mcp: [],
  outboundHooks: ['factory-live'],
};

describe('configDrift', () => {
  it('nomme chaque champ par un code et donne les valeurs de la config, `null` quand rien n’est réglé', () => {
    const live: ProfileConfig = {
      ...repo,
      model: { model: 'Qwen3.5-9B', provider: 'llamacpp' },
      baseUrl: 'http://127.0.0.1:8080/v1',
      fallbacks: [],
      effort: null,
      plugins: ['factory-notify', 'coder-guard'],
      outboundHooks: [],
    };
    expect(configDrift(live, repo)).toEqual([
      { field: 'model', live: 'Qwen3.5-9B (llamacpp)', repo: 'agnes-2.5-flash (freellmapi)' },
      { field: 'baseUrl', live: 'http://127.0.0.1:8080/v1', repo: null },
      { field: 'fallbacks', live: null, repo: 'dots3-note-preview (freellmapi)' },
      { field: 'effort', live: null, repo: 'low' },
      { field: 'outboundHooks', live: null, repo: 'factory-live' },
    ]);
  });

  it('ne signale rien quand la config en service suit le dépôt', () => {
    expect(configDrift({ ...repo }, repo)).toEqual([]);
  });
});
