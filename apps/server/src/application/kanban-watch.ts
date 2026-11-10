import type { LoggerPort } from './ports.ts';

/** An outage of the kanban read this long makes `/healthz` answer 503. */
export const KANBAN_UNHEALTHY_AFTER_MS = 60_000;
/** An outage this long, once the kanban has been read, asks the process to exit so Docker restarts it. */
export const KANBAN_EXIT_AFTER_MS = 180_000;

export interface KanbanWatchDeps {
  now: () => number;
  log: LoggerPort;
  /** Asks the composition root to stop the process with this exit code. */
  requestExit: (code: number) => void;
}

/**
 * Follows the kanban reads (#50): one error line per outage (and per new error message), one line
 * when the read comes back, unhealthy after a minute, and an exit request after three minutes when
 * the kanban was readable since the start (a kanban never read is a configuration problem).
 */
export class KanbanWatch {
  private everRead = false;
  private since: number | null = null;
  private lastError: string | null = null;
  private exitRequested = false;

  private readonly deps: KanbanWatchDeps;

  constructor(deps: KanbanWatchDeps) {
    this.deps = deps;
  }

  /** A successful read. */
  read(at: number): void {
    this.everRead = true;
    if (this.since === null) return;
    this.deps.log.info(
      { outageSeconds: Math.round((at - this.since) / 1000) },
      'lecture du kanban rétablie',
    );
    this.since = null;
    this.lastError = null;
    this.exitRequested = false;
  }

  /** A failed read. */
  failed(error: string, at: number): void {
    if (this.since === null) this.since = at;
    if (error !== this.lastError) {
      this.lastError = error;
      this.deps.log.error({ error }, 'lecture du kanban en échec');
    }
    const elapsed = at - this.since;
    if (this.everRead && !this.exitRequested && elapsed >= KANBAN_EXIT_AFTER_MS) {
      this.exitRequested = true;
      this.deps.log.error(
        { error, outageSeconds: Math.round(elapsed / 1000) },
        'kanban illisible depuis 3 min : arrêt pour relance par Docker',
      );
      this.deps.requestExit(1);
    }
  }

  /** False while an outage has lasted `KANBAN_UNHEALTHY_AFTER_MS` or more. */
  healthy(): boolean {
    return this.since === null || this.deps.now() - this.since < KANBAN_UNHEALTHY_AFTER_MS;
  }
}
