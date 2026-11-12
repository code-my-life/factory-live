import type { LoggerPort } from './ports.ts';

/** Without a successful contact with workflow-core for this long, `/healthz` answers 503 (#62). */
export const CORE_UNHEALTHY_AFTER_MS = 60_000;

export interface CoreWatchDeps {
  now: () => number;
  log: LoggerPort;
  /**
   * The composition root's way to stop the process, as for the kanban watch. The core's watch never calls
   * it: restarting factory-live would not bring the core back, and would lose the last state kept.
   */
  requestExit: (code: number) => void;
}

/**
 * Follows the reachability of workflow-core on its side of the switch (#62): reachable while its stream is
 * open or a call to its API succeeds. One error line per outage (and per new error message), one line when
 * it answers again; unhealthy after a minute without contact; never an exit.
 */
export class CoreWatch {
  private since: number | null = null;
  private lastError: string | null = null;

  private readonly deps: CoreWatchDeps;

  constructor(deps: CoreWatchDeps) {
    this.deps = deps;
  }

  /** A successful contact: a read, or an event of the stream. */
  answered(at: number): void {
    if (this.since === null) return;
    this.deps.log.info(
      { outageSeconds: Math.round((at - this.since) / 1000) },
      'socle de nouveau joignable',
    );
    this.since = null;
    this.lastError = null;
  }

  /** A failed contact: a read or a reconnection of the stream that did not succeed. */
  failed(error: string, at: number): void {
    if (this.since === null) this.since = at;
    if (error === this.lastError) return;
    this.lastError = error;
    this.deps.log.error({ error }, 'socle injoignable : dernier état gardé');
  }

  /** Since when the core does not answer; `null` while it answers. */
  unreachableSince(): number | null {
    return this.since;
  }

  /** False once an outage has lasted `CORE_UNHEALTHY_AFTER_MS` or more. */
  healthy(): boolean {
    return this.since === null || this.deps.now() - this.since < CORE_UNHEALTHY_AFTER_MS;
  }
}
