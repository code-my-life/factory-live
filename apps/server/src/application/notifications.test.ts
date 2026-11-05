import { msg } from '@factory-live/contracts';
import type { WorkflowSheet } from '@factory-live/contracts';
import { describe, expect, it, vi } from 'vitest';
import { notifyArrivals } from './notifications.ts';
import type { NotifyDeps } from './notify.ts';
import type { PushMessage, WorkflowView } from './ports.ts';

const NOW = Date.parse('2026-11-04T14:05:00Z');

/** The studio's sheet, reduced to what a notification reads: who works at each station. */
const STUDIO_SHEET: WorkflowSheet = {
  item: { type: 'video', label: 'Vidéo' },
  stations: [
    { key: 'script', label: 'Script', icon: 'file', kind: 'ai', col: 0, row: 0 },
    { key: 'revue', label: 'Revue', icon: 'eye', kind: 'owner', col: 1, row: 0 },
  ],
  edges: [{ from: 'script', to: 'revue', kind: 'line' }],
  models: ['script'],
};

function deps() {
  const sent: PushMessage[] = [];
  const claimed = new Set<string>();
  const value = {
    store: {
      claimNotification: (id: string) => (claimed.has(id) ? false : (claimed.add(id), true)),
    },
    notifier: {
      notify: vi.fn((message: PushMessage) => {
        sent.push(message);
        return Promise.resolve({ sent: 1, removed: 0, failed: 0 });
      }),
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    now: () => NOW,
  } as unknown as NotifyDeps;
  return { value, sent };
}

function studio(items: WorkflowView['items']): WorkflowView {
  return {
    name: 'studio',
    sheet: STUDIO_SHEET,
    sheetError: null,
    items,
    readAt: NOW,
    unreachableSince: null,
    error: null,
  };
}

const video = {
  id: 'essai',
  card: 't_studio1',
  title: 'Une vidéo d’essai',
  station: 'revue',
  state: 'waiting' as const,
  since: '2026-11-04T14:00:00.000Z',
  waits: 'Regarder le master',
  failure: null,
};

describe('notifyArrivals', () => {
  it("une vidéo qui arrive à une station qui t'attend envoie une seule notification", async () => {
    const { value, sent } = deps();
    const others = [
      // Running at the owner's station, waiting at a script's, or arrived long ago: not news.
      { ...video, id: 'en-cours', state: 'running' as const },
      { ...video, id: 'script', station: 'script' },
      { ...video, id: 'ancienne', since: '2026-11-03T14:00:00.000Z' },
    ];
    expect(await notifyArrivals(value, studio([video, ...others]))).toBe(1);
    expect(sent).toEqual([
      {
        where: 'studio:essai',
        title: msg('push.studio.title', { station: 'Revue' }),
        body: 'Une vidéo d’essai',
        url: '/studio/essai',
        tag: 'studio:essai:revue:2026-11-04T14:00:00.000Z',
        badge: 2,
      },
    ]);

    // Read again, or after a restart that kept the store: nothing twice.
    expect(await notifyArrivals(value, studio([video, ...others]))).toBe(0);

    // Sent back to the same station later: a new arrival.
    const back = { ...video, since: '2026-11-04T14:04:00.000Z' };
    expect(await notifyArrivals(value, studio([back]))).toBe(1);
    expect(sent).toHaveLength(2);

    // No sheet yet: nothing is known to wait for the owner.
    expect(await notifyArrivals(value, { ...studio([back]), sheet: null })).toBe(0);
  });
});
