import type { AgentActivity, IssueSummary } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { NO_FILTERS, filtering, matches } from './filters.tsx';
import type { Filters } from './filters.tsx';
import type { LineIssue } from './model.ts';

function item(
  key: string,
  fields: Pick<IssueSummary, 'type' | 'status'>,
  provider: string | null,
): LineIssue {
  const [repo = '', number = '0'] = key.split('#');
  const issue = {
    key,
    repo,
    number: Number(number),
    title: `Issue ${key}`,
    ...fields,
  } as IssueSummary;
  const agent = provider
    ? ({ profile: 'coder', model: { provider, model: 'some-model' } } as AgentActivity)
    : null;
  return { issue, box: 'implementation', agent, intervention: null };
}

const ITEMS = [
  item('cv-site#1', { type: 'bug', status: 'active' }, 'nvidia'),
  item('cv-site#2', { type: 'interface', status: 'blocked' }, 'llama.cpp'),
  item('claude-cockpit#3', { type: 'bug', status: 'waiting_human' }, null),
  item('claude-cockpit#4', { type: null, status: 'done' }, 'nvidia'),
];

const kept = (filters: Partial<Filters>) =>
  ITEMS.filter((candidate) => matches(candidate, { ...NO_FILTERS, ...filters }, String)).map(
    (candidate) => candidate.issue.key,
  );

describe('filters', () => {
  it('chaque filtre (Type, État, Dépôt, Modèle) garde les seules issues qui y répondent', () => {
    expect(kept({})).toHaveLength(4);
    expect(filtering(NO_FILTERS)).toBe(false);
    expect(kept({ types: new Set(['bug']) })).toEqual(['cv-site#1', 'claude-cockpit#3']);
    expect(kept({ states: new Set(['blocked', 'done']) })).toEqual([
      'cv-site#2',
      'claude-cockpit#4',
    ]);
    expect(kept({ repos: new Set(['claude-cockpit']) })).toEqual([
      'claude-cockpit#3',
      'claude-cockpit#4',
    ]);
    expect(kept({ providers: new Set(['nvidia']) })).toEqual(['cv-site#1', 'claude-cockpit#4']);
    // The criteria add up: a bug of claude-cockpit.
    expect(kept({ types: new Set(['bug']), repos: new Set(['claude-cockpit']) })).toEqual([
      'claude-cockpit#3',
    ]);
    expect(filtering({ ...NO_FILTERS, repos: new Set(['cv-site']) })).toBe(true);
  });

  it('la recherche et le filtre Modèle trouvent aussi le modèle de la lane qu’une ligne affiche', () => {
    const lane = item('claude-cockpit#71', { type: 'interface', status: 'active' }, 'llama.cpp');
    lane.agent = {
      ...(lane.agent as AgentActivity),
      state: 'cli',
      laneModel: { provider: 'anthropic', model: 'claude-opus-5-5', source: 'live' },
    };
    const keeps = (filters: Partial<Filters>) =>
      matches(lane, { ...NO_FILTERS, ...filters }, String);
    expect(keeps({ query: 'opus' })).toBe(true);
    expect(keeps({ providers: new Set(['anthropic']) })).toBe(true);
    expect(keeps({ providers: new Set(['llama.cpp']) })).toBe(true);
    expect(keeps({ providers: new Set(['nvidia']) })).toBe(false);
  });
});
