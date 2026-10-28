import { readFileSync } from 'node:fs';
import { HermesHookBody } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { toHookEvent } from './hermes.ts';
import { ReplayGuard, sign, verifySignature } from './signature.ts';

const samples = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/hermes-webhooks/outbound-sample.json', import.meta.url),
    'utf8',
  ),
) as {
  headers: Record<string, string>;
  body: unknown;
}[];

describe('verifySignature', () => {
  it('accepte la signature exacte d’Hermès et refuse toute altération', () => {
    const body = Buffer.from('{"a":1}');
    const header = sign(body, 'secret');
    expect(verifySignature(body, header, 'secret')).toBe(true);
    expect(verifySignature(Buffer.from('{"a":2}'), header, 'secret')).toBe(false);
    expect(verifySignature(body, header, 'autre')).toBe(false);
    expect(verifySignature(body, header.replace('sha256=', 'sha1='), 'secret')).toBe(false);
    expect(verifySignature(body, 'sha256=abcd', 'secret')).toBe(false);
    expect(verifySignature(body, undefined, 'secret')).toBe(false);
  });
});

describe('ReplayGuard', () => {
  const now = 1_800_000_000_000;

  it('accepte une livraison neuve, laisse passer sans rejouer un nouvel essai, refuse hors fenêtre', () => {
    const guard = new ReplayGuard();
    expect(guard.check('d1', now - 1_000, now)).toBe('fresh');
    expect(guard.check('d1', now - 1_000, now)).toBe('duplicate');
    expect(guard.check('d2', now - 11 * 60_000, now)).toBe('stale');
    expect(guard.check('d3', now + 3 * 60_000, now)).toBe('stale');
    expect(guard.check('d4', Number.NaN, now)).toBe('stale');
  });

  it('borne sa mémoire en oubliant les plus anciennes livraisons', () => {
    const guard = new ReplayGuard(10 * 60_000, 60_000, 3);
    for (const id of ['a', 'b', 'c', 'd']) guard.check(id, now, now);
    expect(guard.check('d', now, now)).toBe('duplicate');
    expect(guard.check('a', now, now)).toBe('fresh');
  });
});

describe('toHookEvent', () => {
  it('convertit les charges réelles d’Hermès', () => {
    const [pre, api] = samples.map((sample) => toHookEvent(HermesHookBody.parse(sample.body)));
    expect(pre).toMatchObject({
      event: 'pre_tool_call',
      toolName: 'terminal',
      toolInput: { command: 'npm test -- team' },
      sessionId: '20261028_160211_ab12cd',
    });
    expect(pre?.at).toBe(Date.parse('2026-10-28T17:41:53.546969Z'));
    expect(api?.extra).toMatchObject({
      response_model: 'agnes-2.5-flash',
      provider: 'freellmapi',
      usage: { input_tokens: 1200 },
    });
  });

  it('écarte résultats, requêtes et contenus d’écriture, borne et masque le reste', () => {
    const event = toHookEvent(
      HermesHookBody.parse({
        hook_event_name: 'post_tool_call',
        profile: 'coder',
        tool_name: 'write_file',
        tool_input: { path: 'src/a.ts', content: 'export const secret = 1;' },
        session_id: 's',
        cwd: '/w',
        extra: {
          result: 'x'.repeat(100_000),
          request: { body: {} },
          status: 'error',
          error_message: `token ghp_${'a'.repeat(36)}`,
          summary: 'y'.repeat(5_000),
        },
        delivery_id: '0123456789abcdef',
        timestamp: '2026-10-28T17:41:53Z',
      }),
    );
    expect(event.toolInput).toEqual({ path: 'src/a.ts' });
    expect(Object.keys(event.extra).sort()).toEqual(['error_message', 'status', 'summary']);
    expect(event.extra['error_message']).toBe('token [secret masqué]');
    expect(String(event.extra['summary'])).toHaveLength(2_001);
  });
});
