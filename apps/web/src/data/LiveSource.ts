import type {
  ActivityEvent,
  HistoryStats,
  IssueDetail,
  IssueKey,
  ProfileView,
  Snapshot,
  StreamEvent,
  TranscriptView,
  UsageReport,
} from '@factory-live/contracts';
import type { FactoryDataSource, UsagePeriod } from './source.ts';

type Fetch = typeof fetch;

export interface StreamLike {
  onmessage: ((event: MessageEvent<string>) => void) | null;
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
    this.doc?.addEventListener('visibilitychange', this.onVisible);
    this.connect();
  }

  private connect(): void {
    this.stream?.close();
    const query = this.lastEventId ? `?lastEventId=${encodeURIComponent(this.lastEventId)}` : '';
    const stream = this.openStream(`${this.base}/api/stream${query}`);
    for (const type of STREAM_EVENTS) stream.addEventListener(type, (event) => this.receive(event));
    stream.onerror = () => {
      // EventSource se reconnecte seul (Last-Event-ID) ; s'il abandonne, le retour au premier plan relance.
    };
    this.stream = stream;
  }

  close(): void {
    this.stream?.close();
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
        if (fresh.length === 0) return;
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
