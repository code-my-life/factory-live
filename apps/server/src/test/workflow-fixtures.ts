import type { WorkflowSheet } from '@factory-live/contracts';

/**
 * A workflow's generic API, version 1 (video-factory's ADR 0006), answered in memory: its sheet and
 * items can change between two reads, it can stop answering, and every call it receives is kept.
 */

export const STUDIO_SHEET: WorkflowSheet = {
  item: { type: 'video', label: 'Vidéo' },
  stations: [
    { key: 'script', label: 'Script', icon: 'file', kind: 'ai', col: 0, row: 0 },
    { key: 'revue', label: 'Revue', icon: 'eye', kind: 'owner', col: 1, row: 0 },
    { key: 'publiee', label: 'Publiée', icon: 'check-circle-fill', kind: 'end', col: 2, row: 0 },
  ],
  edges: [
    { from: 'script', to: 'revue', kind: 'line' },
    { from: 'revue', to: 'publiee', kind: 'line' },
    { from: 'revue', to: 'script', kind: 'return', id: 'refaire:script', label: 'Refaire' },
  ],
  models: ['script'],
};

export interface FakeItem {
  id: string;
  card: string;
  title: string;
  station: string | null;
  state: 'running' | 'waiting' | 'failed' | 'done';
  since: string | null;
  waits: string | null;
  failure: string | null;
}

/** The bytes of the master: 0 to 255, so a range shows which bytes came back. */
export const MASTER = Uint8Array.from({ length: 256 }, (_, index) => index);

export class FakeWorkflow {
  sheet: unknown = structuredClone(STUDIO_SHEET);
  items: FakeItem[] = [];
  down = false;
  /** The answer to a gesture: 200, or the workflow's own refusal. */
  gestureStatus = 200;
  readonly calls: { method: string; path: string; headers: Headers; body: unknown }[] = [];

  readonly fetch = (input: string | URL | Request, init: RequestInit = {}): Promise<Response> =>
    Promise.resolve().then(() => this.answer(input, init));

  private answer(input: string | URL | Request, init: RequestInit): Response {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString(),
    );
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    this.calls.push({ method, path: url.pathname, headers, body });
    if (this.down) throw new TypeError('fetch failed');
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    const path = url.pathname;
    if (path === '/api/workflow') return json({ api: 1, sheet: this.sheet });
    if (path === '/api/items') return json({ api: 1, items: this.items });
    const media = /^\/v\/([^/]+)\/media\/([^/]+)$/.exec(path);
    if (media) return this.media(media[1] ?? '', headers.get('range'));
    const gesture = /^\/api\/items\/([^/]+)\/gesture$/.exec(path);
    if (gesture && method === 'POST') {
      const item = this.items.find(({ id }) => id === gesture[1]);
      if (!item) return json({ message: 'vidéo inconnue' }, 404);
      return this.gestureStatus === 200
        ? json({ api: 1, card: item.card, decision: (body as { decision: string }).decision })
        : json({ message: 'refus du board' }, this.gestureStatus);
    }
    return json({ message: 'inconnu' }, 404);
  }

  private media(id: string, range: string | null): Response {
    if (!this.items.some((item) => item.id === id)) return new Response(null, { status: 404 });
    const asked = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null;
    if (!asked)
      return new Response(MASTER, {
        status: 200,
        headers: { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': '256' },
      });
    const start = Number(asked[1]);
    const end = asked[2] ? Number(asked[2]) : MASTER.length - 1;
    return new Response(MASTER.slice(start, end + 1), {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${MASTER.length}`,
        'Content-Length': String(end - start + 1),
      },
    });
  }
}

export function waitingVideo(patch: Partial<FakeItem> = {}): FakeItem {
  return {
    id: 'essai',
    card: 't_studio1',
    title: 'Une vidéo d’essai',
    station: 'revue',
    state: 'waiting',
    since: '2026-11-04T14:00:00Z',
    waits: 'Regarder le master',
    failure: null,
    ...patch,
  };
}
