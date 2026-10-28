import type {
  ActivityEvent,
  GitHubAccess,
  HistoryStats,
  IssueDetail,
  IssueKey,
  ProfileView,
  Snapshot,
  StreamEvent,
  TranscriptView,
  UsageReport,
} from '@factory-live/contracts';
import { STREAM_PING, STREAM_PING_EVERY_MS } from '@factory-live/contracts';
import type { Connection, FactoryDataSource, UsagePeriod } from './source.ts';

type Fetch = typeof fetch;

export interface StreamLike {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
  readonly readyState: number;
}

export interface LiveOptions {
  base?: string;
  fetch?: Fetch;
  openStream?: (url: string) => StreamLike;
  now?: () => number;
  /** Document observé pour se reconnecter au retour au premier plan (iOS coupe le flux en arrière-plan). */
  document?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  /** Où garder le dernier état connu, montré hors ligne (`localStorage` par défaut). */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/** Un flux en erreur depuis ce délai sans s'être rétabli : la PWA se dit hors ligne. */
export const LOST_AFTER_MS = 10_000;
/** Un flux muet depuis ce délai (trois battements manqués) est coupé : on le relance. */
export const SILENT_AFTER_MS = STREAM_PING_EVERY_MS * 3;
/**
 * Flux refusé par le serveur (502 pendant un redémarrage du conteneur) : le navigateur ne réessaie
 * plus de lui-même ; l'app le relance après ces délais, de plus en plus espacés.
 */
export const RECONNECT_DELAYS_MS = [2_000, 5_000, 10_000, 30_000, 60_000] as const;
const SAVE_EVERY_MS = 5_000;
const STORAGE_KEY = 'factory-live:last-snapshot';

interface Saved {
  receivedAt: number;
  snapshot: Snapshot;
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

interface Cached<T> {
  value: T;
  fetchedAt: number;
  stale: boolean;
}

const CLOSED = 2;
const ACTIVITY_KEPT = 100;
const STREAM_EVENTS = ['snapshot', 'agents', 'activity', 'board', 'health'] as const;

/** Instantané vide le temps que le flux livre le premier : la ligne s'affiche vide plutôt que de planter. */
const EMPTY_SNAPSHOT: Snapshot = {
  generatedAt: new Date(0).toISOString(),
  factory: { live: false, paused: false, pauseReason: null, maxInProgress: 1, running: 0 },
  stations: [],
  agents: [],
  issues: [],
  sideCards: [],
  interventions: [],
  activity: [],
  health: [],
};

const EMPTY_USAGE = (periodDays: number): UsageReport => ({
  periodDays,
  models: [],
  byProfile: [],
  daily: [],
  claudeSubscriptionNote: '',
});

const EMPTY_HISTORY: HistoryStats = {
  periodDays: 30,
  issuesDone: 0,
  medianLeadTimeMinutes: null,
  stationMinutes: [],
  gatePassRate: [],
  blocks: 0,
  medianHumanResponseMinutes: null,
  recent: [],
};

const EMPTY_PROFILES: readonly ProfileView[] = [];

/**
 * Source branchée sur l'API de factory-live : flux SSE pour l'accueil, REST à la demande pour le
 * détail. Les getters sont synchrones (contrat de `useSyncExternalStore`) : ils rendent la dernière
 * valeur connue, la même référence tant que rien n'a changé, et relancent une lecture en arrière-plan
 * quand elle est périmée.
 */
export class LiveSource implements FactoryDataSource {
  readonly kind = 'live' as const;
  private snapshot: Snapshot = EMPTY_SNAPSHOT;
  private connection: Connection = 'connecting';
  private lastUpdate: number | null = null;
  private lastSaved = 0;
  private lostTimer: unknown = null;
  private silenceTimer: unknown = null;
  private reconnectTimer: unknown = null;
  private reconnectAttempt = 0;
  private github: Cached<GitHubAccess> | null = null;
  private readonly listeners = new Set<() => void>();
  private stream: StreamLike | null = null;
  private lastEventId: string | null = null;
  private readonly details = new Map<IssueKey, Cached<IssueDetail | null>>();
  private readonly transcripts = new Map<number, Cached<readonly TranscriptView[] | null>>();
  private readonly usage = new Map<UsagePeriod, Cached<UsageReport>>();
  private profiles: Cached<readonly ProfileView[]> | null = null;
  private history: Cached<HistoryStats> | null = null;
  private readonly inFlight = new Set<string>();
  private readonly base: string;
  private readonly fetchImpl: Fetch;
  private readonly openStream: (url: string) => StreamLike;
  private readonly now: () => number;
  private readonly doc: LiveOptions['document'];
  private readonly storage: LiveOptions['storage'];
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly onVisible = () => {
    if (
      this.doc?.visibilityState === 'visible' &&
      (!this.stream || this.stream.readyState === CLOSED)
    )
      this.connect();
  };

  constructor(options: LiveOptions = {}) {
    this.base = options.base ?? '';
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.openStream = options.openStream ?? ((url) => new EventSource(url));
    this.now = options.now ?? Date.now;
    this.doc = options.document ?? (typeof document === 'undefined' ? undefined : document);
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer =
      options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.restore();
    this.doc?.addEventListener('visibilitychange', this.onVisible);
    this.connect();
  }

  /** Le dernier état connu, gardé sur l'appareil : la PWA s'ouvre dessus, même hors ligne. */
  private restore(): void {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Saved;
      if (!saved.snapshot?.stations) return;
      this.snapshot = saved.snapshot;
      this.lastUpdate = saved.receivedAt;
    } catch {
      // Sauvegarde illisible : on attend simplement le flux.
    }
  }

  private save(): void {
    if (!this.storage || this.now() - this.lastSaved < SAVE_EVERY_MS) return;
    this.lastSaved = this.now();
    try {
      const saved: Saved = { receivedAt: this.lastUpdate ?? this.now(), snapshot: this.snapshot };
      this.storage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Stockage plein ou refusé : l'état ne sera simplement pas gardé.
    }
  }

  private setConnection(connection: Connection): void {
    if (connection !== 'connecting' && this.lostTimer !== null) {
      this.clearTimer(this.lostTimer);
      this.lostTimer = null;
    }
    if (this.connection === connection) return;
    this.connection = connection;
    this.notify();
  }

  private connect(): void {
    if (this.reconnectTimer !== null) {
      this.clearTimer(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stream?.close();
    const query = this.lastEventId ? `?lastEventId=${encodeURIComponent(this.lastEventId)}` : '';
    const stream = this.openStream(`${this.base}/api/stream${query}`);
    for (const type of STREAM_EVENTS) stream.addEventListener(type, (event) => this.receive(event));
    stream.addEventListener(STREAM_PING, () => this.watchSilence());
    stream.onopen = () => {
      if (stream !== this.stream) return;
      this.reconnectAttempt = 0;
      this.watchSilence();
      this.setConnection('open');
    };
    stream.onerror = () => {
      if (stream !== this.stream) return;
      // EventSource se reconnecte seul (Last-Event-ID) ; s'il abandonne (réponse en erreur), l'app relance.
      // Une coupure brève (redémarrage du serveur, retour d'arrière-plan) ne fait pas crier « hors ligne ».
      if (stream.readyState === CLOSED) {
        this.setConnection('lost');
        this.scheduleReconnect();
        return;
      }
      this.setConnection('connecting');
      this.lostTimer ??= this.setTimer(() => {
        this.lostTimer = null;
        if (this.connection === 'connecting') this.setConnection('lost');
      }, LOST_AFTER_MS);
    };
    this.stream = stream;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ??
      RECONNECT_DELAYS_MS[0];
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /**
   * Un réseau perdu ne coupe pas toujours la connexion (sortie du tailnet, iPhone en veille) : le
   * serveur bat toutes les 15 s, et un flux muet trois fois plus longtemps est relancé ; s'il ne
   * revient pas, l'app se dit hors ligne après le délai de grâce.
   */
  private watchSilence(): void {
    if (this.silenceTimer !== null) this.clearTimer(this.silenceTimer);
    this.silenceTimer = this.setTimer(() => {
      this.silenceTimer = null;
      this.connect();
      this.setConnection('connecting');
      this.lostTimer ??= this.setTimer(() => {
        this.lostTimer = null;
        if (this.connection === 'connecting') this.setConnection('lost');
      }, LOST_AFTER_MS);
    }, SILENT_AFTER_MS);
  }

  close(): void {
    this.stream?.close();
    if (this.lostTimer !== null) this.clearTimer(this.lostTimer);
    if (this.silenceTimer !== null) this.clearTimer(this.silenceTimer);
    if (this.reconnectTimer !== null) this.clearTimer(this.reconnectTimer);
    this.doc?.removeEventListener('visibilitychange', this.onVisible);
  }

  private receive(message: MessageEvent<string>): void {
    if (message.lastEventId) this.lastEventId = message.lastEventId;
    // Le flux vient de notre serveur, dont les contrats sont vérifiés par ses tests : pas de zod dans la PWA.
    let event: StreamEvent;
    try {
      event = JSON.parse(message.data) as StreamEvent;
    } catch {
      return;
    }
    if (!STREAM_EVENTS.includes(event.type)) return;
    this.lastUpdate = this.now();
    this.watchSilence();
    // Un message prouve que le lien est rétabli ; l'avis aux abonnés part avec la mise à jour.
    const reopened = this.connection !== 'open';
    if (reopened) {
      if (this.lostTimer !== null) this.clearTimer(this.lostTimer);
      this.lostTimer = null;
      this.connection = 'open';
    }
    switch (event.type) {
      case 'snapshot':
        this.snapshot = event.snapshot;
        break;
      case 'agents':
        this.snapshot = { ...this.snapshot, agents: event.agents };
        break;
      case 'health':
        this.snapshot = { ...this.snapshot, factory: event.factory, health: event.health };
        break;
      case 'board': {
        const { type: _type, ...board } = event;
        this.snapshot = { ...this.snapshot, ...board };
        for (const cached of this.details.values()) cached.stale = true;
        break;
      }
      case 'activity': {
        const known = new Set(this.snapshot.activity.map((item) => item.id));
        const fresh = event.events.filter((item: ActivityEvent) => !known.has(item.id));
        if (fresh.length === 0) {
          if (reopened) this.notify();
          return;
        }
        this.snapshot = {
          ...this.snapshot,
          activity: [...this.snapshot.activity, ...fresh].slice(-ACTIVITY_KEPT),
        };
        const cards = new Set(fresh.map((item) => item.cardId));
        for (const [key, cached] of this.details)
          if (cached.value?.cards.some((card) => cards.has(card.id)))
            this.details.get(key)!.stale = true;
        for (const cached of this.transcripts.values()) cached.stale = true;
        break;
      }
    }
    this.notify();
    this.save();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): Snapshot {
    return this.snapshot;
  }

  getConnection(): Connection {
    return this.connection;
  }

  getLastUpdate(): number | null {
    return this.lastUpdate;
  }

  getGitHubAccess(): GitHubAccess | null {
    if (!this.fresh(this.github, 60_000)) {
      this.load<GitHubAccess>('github', '/api/github/status', (value) => {
        this.github = { value, fetchedAt: this.now(), stale: false };
      });
    }
    return this.github?.value ?? null;
  }

  async logoutGitHub(): Promise<void> {
    const response = await this.fetchImpl(`${this.base}/api/github/logout`, {
      method: 'POST',
      headers: { 'X-Factory-Live': '1' },
    });
    if (!response.ok) throw new Error(`Déconnexion refusée (HTTP ${response.status})`);
    if (this.github) this.github.stale = true;
    this.getGitHubAccess();
  }

  /** Lecture en arrière-plan, une seule à la fois par clé ; prévient les abonnés à l'arrivée. */
  private load<T>(key: string, url: string, store: (value: T) => void): void {
    if (this.inFlight.has(key)) return;
    this.inFlight.add(key);
    this.fetchImpl(`${this.base}${url}`, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as T;
      })
      .then((value) => {
        store(value as T);
        this.notify();
      })
      .catch(() => {
        // Réseau coupé ou serveur indisponible : on garde la dernière valeur, une lecture suivante réessaiera.
      })
      .finally(() => this.inFlight.delete(key));
  }

  private fresh<T>(cached: Cached<T> | null | undefined, maxAgeMs: number): cached is Cached<T> {
    return (
      cached !== null &&
      cached !== undefined &&
      !cached.stale &&
      this.now() - cached.fetchedAt < maxAgeMs
    );
  }

  getIssueDetail(key: IssueKey): IssueDetail | null {
    const cached = this.details.get(key);
    if (!this.fresh(cached, 60_000)) {
      const [repo = '', number = ''] = key.split('#');
      this.load<IssueDetail | null>(
        `issue:${key}`,
        `/api/issues/${encodeURIComponent(repo)}/${encodeURIComponent(number)}`,
        (value) => this.details.set(key, { value, fetchedAt: this.now(), stale: false }),
      );
    }
    return cached?.value ?? null;
  }

  getTranscripts(runId: number): readonly TranscriptView[] | null {
    const cached = this.transcripts.get(runId);
    if (!this.fresh(cached, 30_000)) {
      this.load<TranscriptView[] | null>(
        `runs:${runId}`,
        `/api/runs/${runId}/transcripts`,
        (value) => this.transcripts.set(runId, { value, fetchedAt: this.now(), stale: false }),
      );
    }
    return cached?.value ?? null;
  }

  getProfiles(): readonly ProfileView[] {
    if (!this.fresh(this.profiles, 60_000)) {
      this.load<ProfileView[]>('profiles', '/api/profiles', (value) => {
        this.profiles = { value, fetchedAt: this.now(), stale: false };
      });
    }
    return this.profiles?.value ?? EMPTY_PROFILES;
  }

  getUsage(periodDays: UsagePeriod): UsageReport {
    const cached = this.usage.get(periodDays);
    if (!this.fresh(cached, 60_000)) {
      this.load<UsageReport>(`usage:${periodDays}`, `/api/usage?days=${periodDays}`, (value) =>
        this.usage.set(periodDays, { value, fetchedAt: this.now(), stale: false }),
      );
    }
    if (cached) return cached.value;
    const placeholder = { value: EMPTY_USAGE(periodDays), fetchedAt: 0, stale: true };
    this.usage.set(periodDays, placeholder);
    return placeholder.value;
  }

  getHistory(): HistoryStats {
    if (!this.fresh(this.history, 5 * 60_000)) {
      this.load<HistoryStats>('history', '/api/history?days=30', (value) => {
        this.history = { value, fetchedAt: this.now(), stale: false };
      });
    }
    return this.history?.value ?? EMPTY_HISTORY;
  }

  async unblock(interventionId: string, text: string): Promise<void> {
    const response = await this.fetchImpl(
      `${this.base}/api/interventions/${encodeURIComponent(interventionId)}/unblock`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Factory-Live': '1' },
        body: JSON.stringify({ text }),
      },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Déblocage refusé (HTTP ${response.status})`);
    }
  }
}
