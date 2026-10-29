import { describe, expect, it, vi } from 'vitest';
import { reportClientErrors } from './errors.ts';

describe('reportClientErrors', () => {
  it('remonte une erreur au serveur une seule fois, cinq par minute au plus', () => {
    const target = new EventTarget();
    const send = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    let now = 1_000_000;
    const stop = reportClientErrors(target, send, () => now);
    const fail = (message: string) =>
      target.dispatchEvent(new ErrorEvent('error', { message, error: new Error(message) }));
    fail('boom');
    fail('boom');
    expect(send).toHaveBeenCalledOnce();
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/client-logs');
    expect(JSON.parse(init.body as string)).toMatchObject({ level: 'error', message: 'boom' });
    for (const index of [1, 2, 3, 4, 5]) fail(`erreur ${index}`);
    expect(send).toHaveBeenCalledTimes(5);
    now += 61_000;
    fail('erreur 6');
    expect(send).toHaveBeenCalledTimes(6);
    stop();
    fail('après');
    expect(send).toHaveBeenCalledTimes(6);
  });

  it('donne le fichier et la ligne quand l’erreur arrive sans pile', () => {
    const target = new EventTarget();
    const send = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    reportClientErrors(target, send, () => 0);
    target.dispatchEvent(
      new ErrorEvent('error', {
        message: 'Script error.',
        filename: 'https://machine.tailnet.ts.net:8446/assets/index-abc.js',
        lineno: 12,
        colno: 345,
      }),
    );
    const [, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      message: 'Script error. (index-abc.js:12:345)',
      stack: null,
    });
  });
});
