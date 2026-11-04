import type { AcceptanceView } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { boardStatus, checkStatus, tally, widgetStatus, worst } from './status.ts';

const URL = 'https://github.com/code-my-life/cv-site/pull/52';

function view(patch: Partial<AcceptanceView> = {}): AcceptanceView {
  return {
    pr: 52,
    head: '4f2a9c1',
    base: '8d41c07',
    criteria: [
      { id: 'C1', text: 'a', status: 'ok', reason: 'proven', proof: 'test', url: URL },
      { id: 'C2', text: 'b', status: 'ok', reason: 'proven', proof: 'test', url: URL },
    ],
    checks: [
      { name: 'Tests', workflow: 'CI', status: 'success', durationMs: 1000, url: URL },
      { name: 'Lint', workflow: 'CI', status: 'skipped', durationMs: null, url: URL },
    ],
    gate: { status: 'ok', head: '4f2a9c1', at: null, url: URL, rules: [] },
    tests: [],
    proofs: [],
    threads: [],
    reviewRounds: 0,
    twins: null,
    twinsAbsent: 'no_screen',
    ...patch,
  };
}

describe('verdict de la recette', () => {
  it('vert si tout est vert, rouge dès qu’un élément est rouge, en cours tant qu’un élément tourne', () => {
    expect(worst(['ok', 'ok'])).toBe('ok');
    expect(worst(['ok', 'pending', 'nok'])).toBe('nok');
    expect(worst(['ok', 'pending'])).toBe('pending');
    expect(worst([])).toBe('none');
  });

  it('les critères sont rouges dès qu’un seul n’est pas prouvé', () => {
    const one = view({
      criteria: [
        { id: 'C1', text: 'a', status: 'ok', reason: 'proven', proof: 'test', url: URL },
        { id: 'C2', text: 'b', status: 'nok', reason: 'unproven', proof: null, url: URL },
      ],
    });
    expect(widgetStatus(one, 'criteria')).toBe('nok');
    expect(boardStatus(one)).toBe('nok');
  });

  it('un job ignoré ne rend pas la CI rouge ; la gate compte avec les checks', () => {
    expect(
      checkStatus({ name: 'x', workflow: null, status: 'skipped', durationMs: null, url: URL }),
    ).toBe('ok');
    expect(widgetStatus(view(), 'checks')).toBe('ok');
    const gateRed = view({
      gate: { status: 'nok', head: '4f2a9c1', at: null, url: URL, rules: [] },
    });
    expect(widgetStatus(gateRed, 'checks')).toBe('nok');
  });

  it('les jumeaux montrent sans juger, et un widget vide n’a pas de verdict', () => {
    expect(widgetStatus(view(), 'twins')).toBe('none');
    expect(widgetStatus(view(), 'tests')).toBe('none');
    expect(boardStatus(view())).toBe('ok');
  });

  it('un retour non résolu est rouge ; ce que la PR dit ne pas prouver est montré sans compter', () => {
    const thread = {
      author: 'greptile-apps',
      severity: 'P1',
      title: 'a',
      resolved: true,
      at: '2026-11-03T22:33:52Z',
      url: URL,
    };
    expect(widgetStatus(view({ threads: [thread] }), 'threads')).toBe('ok');
    expect(
      widgetStatus(view({ threads: [thread, { ...thread, resolved: false }] }), 'threads'),
    ).toBe('nok');
    const caveat = {
      kind: 'unproven' as const,
      status: 'info' as const,
      detail: 'WebKit non lancé sur ce poste',
      url: URL,
      content: null,
      before: null,
      after: null,
    };
    // Only what the PR says it does not prove: an eye, « to see », and no verdict.
    expect(widgetStatus(view({ proofs: [caveat] }), 'proofs')).toBe('info');
    expect(widgetStatus(view(), 'proofs')).toBe('none');
  });

  it('compte les OK, les NOK et ceux en cours', () => {
    expect(tally(['ok', 'nok', 'ok', 'pending'])).toEqual({ ok: 2, nok: 1, pending: 1, info: 0 });
    expect(tally(['ok'], 4)).toEqual({ ok: 1, nok: 0, pending: 0, info: 4 });
  });
});
