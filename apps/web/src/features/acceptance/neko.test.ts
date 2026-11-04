import { describe, expect, it } from 'vitest';
import { TwinsApi } from './neko.ts';

/** A bench that answers each request only when the test says so, to see the order things reach it. */
function slowBench() {
  const sent: { path: string; body: unknown }[] = [];
  const waiting: (() => void)[] = [];
  const api = new TwinsApi('/api/twins/factory-live/25', ((url: string, init?: RequestInit) => {
    sent.push({
      path: url.slice('/api/twins/factory-live/25'.length),
      body: JSON.parse(init?.body as string) as unknown,
    });
    return new Promise<Response>((resolve) =>
      waiting.push(() => resolve(new Response(null, { status: 204 }))),
    );
  }) as typeof fetch);
  const answer = async () => {
    waiting.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { api, sent, answer };
}

describe('file des gestes vers le banc', () => {
  it('le miroir et le resync passent après les gestes déjà envoyés, et le resync efface ceux qui attendent, sauf les relâchements', async () => {
    const { api, sent, answer } = slowBench();
    api.gesture({ side: 'head', event: 'control/buttondown', payload: { code: 1 } });
    api.gesture({ side: 'head', event: 'control/buttonup', payload: { code: 1 } });
    api.gesture({ side: 'head', event: 'control/move', payload: { x: 1, y: 1 } });
    const resync = api.resync();
    // Only the press is on its way: the rest waits behind it. The resync drops the move, never the
    // release of a press already sent.
    expect(sent.map((each) => each.path)).toEqual(['/gesture']);
    await answer();
    expect(sent.at(-1)?.body).toEqual({
      side: 'head',
      event: 'control/buttonup',
      payload: { code: 1 },
    });
    await answer();
    expect(sent.map((each) => each.path)).toEqual(['/gesture', '/gesture', '/resync']);
    await answer();
    expect((await resync)?.status).toBe(204);
    api.gesture({ side: 'base', event: 'control/move', payload: { x: 2, y: 2 } });
    api.gesture({ side: 'base', event: 'control/move', payload: { x: 3, y: 3 } });
    api.gesture({ side: 'base', event: 'control/move', payload: { x: 4, y: 4 } });
    await answer();
    // Behind a move on its way, the moves waiting keep only the latest place.
    expect(sent.slice(3).map((each) => each.body)).toEqual([
      { side: 'base', event: 'control/move', payload: { x: 2, y: 2 } },
      { side: 'base', event: 'control/move', payload: { x: 4, y: 4 } },
    ]);
  });
});
