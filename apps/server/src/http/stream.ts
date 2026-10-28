import type { StreamEvent } from '@factory-live/contracts';

export interface Numbered {
  id: number;
  event: StreamEvent;
}

/**
 * Tampon des derniers événements du flux, pour la reprise après une coupure (`Last-Event-ID`) : iOS
 * coupe la connexion d'une PWA en arrière-plan, le retour au premier plan ne renvoie que la suite.
 */
export class StreamBuffer {
  private events: Numbered[] = [];
  private nextId = 1;
  private readonly listeners = new Set<(item: Numbered) => void>();

  private readonly max: number;

  constructor(max = 500) {
    this.max = max;
  }

  get lastId(): number {
    return this.nextId - 1;
  }

  push(event: StreamEvent): Numbered {
    const item = { id: this.nextId++, event };
    this.events.push(item);
    if (this.events.length > this.max) this.events = this.events.slice(-this.max);
    for (const listener of this.listeners) listener(item);
    return item;
  }

  /** Événements après `lastId`, ou null s'ils ne sont plus dans le tampon (il faut alors un instantané). */
  since(lastId: number): Numbered[] | null {
    if (!Number.isInteger(lastId) || lastId < 0 || lastId > this.lastId) return null;
    if (lastId === this.lastId) return [];
    const first = this.events[0];
    if (!first || first.id > lastId + 1) return null;
    return this.events.filter((item) => item.id > lastId);
  }

  subscribe(listener: (item: Numbered) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get subscribers(): number {
    return this.listeners.size;
  }
}
