import type { ActivityEvent, IssueDetail, Snapshot } from '@factory-live/contracts';
import { describe, expect, it, vi } from 'vitest';
import { LOST_AFTER_MS, LiveSource, RECONNECT_DELAYS_MS, SILENT_AFTER_MS } from './LiveSource.ts';
import type { LiveOptions, StreamLike } from './LiveSource.ts';

class FakeStream implements StreamLike {
  onmessage: StreamLike['onmessage'] = null;
  onopen: StreamLike['onopen'] = null;
  onerror: StreamLike['onerror'] = null;
  readyState = 1;
  private readonly handlers = new Map<string, ((event: MessageEvent<string>) => void)[]>();
  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), listener]);
  }

  emit(type: string, data: unknown, id: string): void {
    for (const handler of this.handlers.get(type) ?? [])
      handler(new MessageEvent(type, { data: JSON.stringify(data), lastEventId: id }));
  }

  close(): void {
    this.readyState = 2;
  }
}

const SNAPSHOT: Snapshot = {
  generatedAt: '2026-10-28T18:00:00.000Z',
  factory: { live: true, paused: false, pauseReason: null, maxInProgress: 2, running: 1 },
  stations: [{ id: 'implementation', label: 'Implémentation', profiles: ['coder'] }],
  agents: [],
  issues: [],
  sideCards: [],
  interventions: [],
  activity: [],
  health: [],
};

function activity(id: string, cardId = 't_1a9f0049'): ActivityEvent {
  return {
    id,
    at: '2026-10-28T18:00:01.000Z',
    kind: 'tool',
    profile: 'coder',
    issueKey: 'cv-site#49',
    cardId,
    label: 'terminal',
    detail: 'npm test',
    status: 'running',
    durationMs: null,
    model: null,
  };
}

function setup(routes: Record<string, unknown> = {}, options: Partial<LiveOptions> = {}) {
  const streams: FakeStream[] = [];
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push({ url, init });
    const body = Object.entries(routes).find(([route]) => url.endsWith(route))?.[1];
    return Promise.resolve(
      body === undefined
        ? new Response('{"error":"Introuvable"}', { status: 404 })
        : new Response(JSON.stringify(body), { status: 200 }),
    );
  }) as unknown as typeof fetch;
  let visibility: DocumentVisibilityState = 'visible';
  const listeners = new Set<() => void>();
  const doc = {
    get visibilityState() {
      return visibility;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  } as unknown as Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  const source = new LiveSource({
    fetch: fetchImpl,
    openStream: (url) => {
      const stream = new FakeStream(url);
      streams.push(stream);
      return stream;
    },
    document: doc,
    storage: null,
    ...options,
  });
  return {
    source,
    streams,
    calls,
    setVisibility: (state: DocumentVisibilityState) => {
      visibility = state;
      for (const listener of listeners) listener();
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('LiveSource', () => {
  it('rend un instantané vide stable, puis celui du flux', () => {
    const { source, streams } = setup();
    const empty = source.getSnapshot();
    expect(source.getSnapshot()).toBe(empty);
    const listener = vi.fn();
    source.subscribe(listener);
    streams[0]?.emit('snapshot', { type: 'snapshot', snapshot: SNAPSHOT }, '7');
    expect(source.getSnapshot()).toEqual(SNAPSHOT);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('fusionne les tranches et ajoute le fil sans doublon', () => {
    const { source, streams } = setup();
    const stream = streams[0] as FakeStream;
    stream.emit('snapshot', { type: 'snapshot', snapshot: SNAPSHOT }, '1');
    stream.emit(
      'health',
      {
        type: 'health',
        factory: { ...SNAPSHOT.factory, paused: true, pauseReason: 'maintenance' },
        health: [],
      },
      '2',
    );
    stream.emit('activity', { type: 'activity', events: [activity('a1'), activity('a2')] }, '3');
    stream.emit('activity', { type: 'activity', events: [activity('a2'), activity('a3')] }, '4');
    const snapshot = source.getSnapshot();
    expect(snapshot.factory.pauseReason).toBe('maintenance');
    expect(snapshot.activity.map((item) => item.id)).toEqual(['a1', 'a2', 'a3']);
    expect(snapshot.stations).toEqual(SNAPSHOT.stations);
  });

  it('lit le détail d’une issue une fois, puis le relit quand le tableau change', async () => {
    const detail = {
      issue: { key: 'cv-site#49' },
      cards: [{ id: 't_1a9f0049' }],
      timeline: [],
      tokens: 0,
      costUsd: 0,
    } as unknown as IssueDetail;
    const { source, streams, calls } = setup({ '/api/issues/cv-site/49': detail });
    expect(source.getIssueDetail('cv-site#49')).toBeNull();
    expect(source.getIssueDetail('cv-site#49')).toBeNull();
    await settle();
    expect(source.getIssueDetail('cv-site#49')).toEqual(detail);
    expect(calls.filter((call) => call.url.endsWith('/api/issues/cv-site/49'))).toHaveLength(1);
    streams[0]?.emit('activity', { type: 'activity', events: [activity('a9')] }, '5');
    expect(source.getIssueDetail('cv-site#49')).toEqual(detail);
    await settle();
    expect(calls.filter((call) => call.url.endsWith('/api/issues/cv-site/49'))).toHaveLength(2);
  });

  it('débloque avec l’en-tête anti-CSRF et remonte le refus du serveur', async () => {
    const { source, calls } = setup();
    await expect(source.unblock('needs_input:t_1:10', 'Prends PostgreSQL')).rejects.toThrow(
      'Introuvable',
    );
    const call = calls.at(-1);
    expect(call?.url).toBe('/api/interventions/needs_input%3At_1%3A10/unblock');
    expect(new Headers(call?.init?.headers).get('x-factory-live')).toBe('1');
    const body = call?.init?.body;
    expect(JSON.parse(typeof body === 'string' ? body : 'null')).toEqual({
      text: 'Prends PostgreSQL',
    });
  });

  it('se reconnecte au retour au premier plan, en reprenant après le dernier événement', () => {
    const { streams, setVisibility } = setup();
    streams[0]?.emit('snapshot', { type: 'snapshot', snapshot: SNAPSHOT }, '42');
    streams[0]?.close();
    setVisibility('hidden');
    expect(streams).toHaveLength(1);
    setVisibility('visible');
    expect(streams).toHaveLength(2);
    expect(streams[1]?.url).toBe('/api/stream?lastEventId=42');
  });

  it('garde des valeurs stables pour les écrans tant que rien n’est arrivé', () => {
    const { source } = setup();
    expect(source.getUsage(7)).toBe(source.getUsage(7));
    expect(source.getHistory()).toBe(source.getHistory());
    expect(source.getProfiles()).toBe(source.getProfiles());
  });
});

describe('LiveSource : lien et dernier état connu', () => {
  function manualTimers() {
    let next = 0;
    const pending = new Map<number, { callback: () => void; ms: number }>();
    return {
      setTimer: (callback: () => void, ms: number) => {
        next += 1;
        pending.set(next, { callback, ms });
        return next;
      },
      clearTimer: (handle: unknown) => void pending.delete(handle as number),
      /** Déclenche les minuteries de cette durée, comme si elle s'était écoulée. */
      fire: (ms: number) => {
        for (const [id, timer] of [...pending])
          if (timer.ms === ms) {
            pending.delete(id);
            timer.callback();
          }
      },
    };
  }

  it('se dit en direct à l’ouverture du flux, et hors ligne seulement après une coupure qui dure', () => {
    const timers = manualTimers();
    const { source, streams } = setup({}, timers);
    expect(source.getConnection()).toBe('connecting');
    const stream = streams[0] as FakeStream;
    stream.onopen?.(new Event('open'));
    expect(source.getConnection()).toBe('open');
    stream.readyState = 0;
    stream.onerror?.(new Event('error'));
    expect(source.getConnection()).toBe('connecting');
    stream.onopen?.(new Event('open'));
    expect(source.getConnection()).toBe('open');
    stream.onerror?.(new Event('error'));
    timers.fire(LOST_AFTER_MS);
    expect(source.getConnection()).toBe('lost');
    stream.emit('snapshot', { type: 'snapshot', snapshot: SNAPSHOT }, '9');
    expect(source.getConnection()).toBe('open');
  });

  it('relance un flux resté muet (réseau perdu sans erreur), puis se dit hors ligne s’il ne revient pas', () => {
    const timers = manualTimers();
    const { source, streams } = setup({}, timers);
    const first = streams[0] as FakeStream;
    first.onopen?.(new Event('open'));
    first.emit('ping', {}, '');
    expect(source.getConnection()).toBe('open');
    timers.fire(SILENT_AFTER_MS);
    expect(streams).toHaveLength(2);
    expect(first.readyState).toBe(2);
    expect(source.getConnection()).toBe('connecting');
    timers.fire(LOST_AFTER_MS);
    expect(source.getConnection()).toBe('lost');
    streams[1]?.onopen?.(new Event('open'));
    expect(source.getConnection()).toBe('open');
    expect(SILENT_AFTER_MS).toBe(45_000);
  });

  it('se dit hors ligne tout de suite quand le flux est refusé, puis le relance de plus en plus espacé', () => {
    const timers = manualTimers();
    const { source, streams } = setup({}, timers);
    const refuse = (stream: FakeStream | undefined) => {
      if (!stream) throw new Error('flux attendu');
      stream.readyState = 2;
      stream.onerror?.(new Event('error'));
    };
    refuse(streams[0]);
    expect(source.getConnection()).toBe('lost');
    timers.fire(RECONNECT_DELAYS_MS[0]);
    expect(streams).toHaveLength(2);
    refuse(streams[1]);
    timers.fire(RECONNECT_DELAYS_MS[0]);
    expect(streams).toHaveLength(2);
    timers.fire(RECONNECT_DELAYS_MS[1]);
    expect(streams).toHaveLength(3);
    streams[2]?.onopen?.(new Event('open'));
    expect(source.getConnection()).toBe('open');
    refuse(streams[2]);
    timers.fire(RECONNECT_DELAYS_MS[0]);
    expect(streams).toHaveLength(4);
    expect(LOST_AFTER_MS).toBe(10_000);
  });

  it('garde le dernier état sur l’appareil et s’ouvre dessus au lancement suivant', () => {
    const stored = new Map<string, string>();
    const storage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    };
    const first = setup({}, { storage, now: () => 1_000_000 });
    first.streams[0]?.emit('snapshot', { type: 'snapshot', snapshot: SNAPSHOT }, '1');
    expect(stored.size).toBe(1);
    const next = setup({}, { storage, now: () => 2_000_000 });
    expect(next.source.getSnapshot()).toEqual(SNAPSHOT);
    expect(next.source.getLastUpdate()).toBe(1_000_000);
    expect(next.source.getConnection()).toBe('connecting');
  });
});

describe('LiveSource : accès GitHub', () => {
  const ACCESS = {
    mode: 'app',
    app: {
      slug: 'factory-live-code-my-life',
      url: 'https://github.com/apps/x',
      installed: true,
      installUrl: 'https://github.com/apps/x/installations/new',
    },
    user: { login: 'cddev', avatarUrl: null, expiresAt: '2026-10-29T02:00:00.000Z' },
    setupUrl: '/api/github/setup',
    loginUrl: '/api/github/login',
  };

  it('lit l’accès GitHub du serveur, puis déconnecte avec l’en-tête anti-CSRF', async () => {
    const { source, calls } = setup({ '/api/github/status': ACCESS, '/api/github/logout': {} });
    expect(source.getGitHubAccess()).toBeNull();
    await settle();
    expect(source.getGitHubAccess()).toEqual(ACCESS);
    await source.logoutGitHub();
    const logout = calls.find((call) => call.url.endsWith('/api/github/logout'));
    expect(logout?.init?.method).toBe('POST');
    expect(new Headers(logout?.init?.headers).get('x-factory-live')).toBe('1');
    expect(calls.filter((call) => call.url.endsWith('/api/github/status'))).toHaveLength(2);
  });
});
