import { describe, expect, it, vi } from 'vitest';
import { CORE_UNHEALTHY_AFTER_MS, CoreWatch } from './core-watch.ts';
import type { LoggerPort } from './ports.ts';

const T = Date.parse('2026-11-12T10:00:00Z');
const REFUSED = 'fetch failed: connect ECONNREFUSED 127.0.0.1:8447';

/** A watch on a hand-driven clock, with a logger that records every line and an exit spy. */
function setup() {
  const clock = { now: T };
  const lines: { level: string; message: string }[] = [];
  const record = (level: string) => (_context: object, message: string) => {
    lines.push({ level, message });
  };
  const log: LoggerPort = {
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    debug: record('debug'),
  };
  const requestExit = vi.fn<(code: number) => void>();
  const watch = new CoreWatch({ now: () => clock.now, log, requestExit });
  return { clock, lines, requestExit, watch };
}

describe('CoreWatch (#62)', () => {
  it('/healthz échoue après 60 secondes sans le socle et revient seul', () => {
    const { clock, lines, watch } = setup();
    expect(CORE_UNHEALTHY_AFTER_MS).toBe(60_000);
    watch.answered(T - 300);
    expect(watch.healthy()).toBe(true);

    watch.failed(REFUSED, T);
    clock.now = T + 59_000;
    watch.failed(REFUSED, clock.now);
    expect(watch.healthy()).toBe(true);
    clock.now = T + 60_000;
    expect(watch.healthy()).toBe(false);
    expect(watch.unreachableSince()).toBe(T);

    // The core answers again: healthy at once, without a restart of factory-live.
    watch.answered(T + 61_000);
    expect(watch.healthy()).toBe(true);
    expect(watch.unreachableSince()).toBeNull();
    // One line per outage, one when it ends.
    expect(lines.map((line) => line.level)).toEqual(['error', 'info']);
  });

  it('un socle injoignable ne fait pas arrêter le processus', () => {
    const { clock, requestExit, watch } = setup();
    watch.answered(T - 300);
    for (let at = T; at <= T + 5 * 60_000; at += 2_000) {
      clock.now = at;
      watch.failed(REFUSED, at);
    }
    expect(watch.healthy()).toBe(false);
    expect(requestExit).not.toHaveBeenCalled();
  });
});
