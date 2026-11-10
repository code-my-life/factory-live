import { describe, expect, it, vi } from 'vitest';
import { KanbanWatch } from './kanban-watch.ts';
import type { LoggerPort } from './ports.ts';

const T = Date.parse('2026-11-10T08:00:00Z');
const UNREADABLE = 'unable to open database file';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogLine {
  level: LogLevel;
  context: object;
  message: string;
}

/** A watch on a hand-driven clock, with a spy logger that records every line it receives. */
function setup() {
  const clock = { now: T };
  const lines: LogLine[] = [];
  const record =
    (level: LogLevel) =>
    (context: object, message: string): void => {
      lines.push({ level, context, message });
    };
  const log: LoggerPort = {
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    debug: record('debug'),
  };
  const requestExit = vi.fn<(code: number) => void>();
  const watch = new KanbanWatch({ now: () => clock.now, log, requestExit });
  return { clock, lines, requestExit, watch };
}

describe('KanbanWatch', () => {
  it("demande l'arrêt après 3 min d'échec quand le kanban a déjà été lu", () => {
    const { requestExit, watch } = setup();
    watch.read(T - 300);
    watch.failed(UNREADABLE, T);
    watch.failed(UNREADABLE, T + 179_999);
    expect(requestExit).not.toHaveBeenCalled();
    watch.failed(UNREADABLE, T + 180_000);
    expect(requestExit).toHaveBeenCalledTimes(1);
    expect(requestExit).toHaveBeenCalledWith(1);
    watch.failed(UNREADABLE, T + 181_000);
    expect(requestExit).toHaveBeenCalledTimes(1);
  });

  it("ne demande pas l'arrêt quand le kanban n'a jamais été lu", () => {
    const { clock, requestExit, watch } = setup();
    for (let at = T; at <= T + 600_000; at += 300) watch.failed(UNREADABLE, at);
    clock.now = T + 600_000;
    expect(requestExit).not.toHaveBeenCalled();
    expect(watch.healthy()).toBe(false);
  });

  it("écrit une seule ligne d'erreur pendant une panne, puis une ligne de retour avec sa durée", () => {
    const { lines, watch } = setup();
    watch.read(T - 300);
    let at = T;
    for (let i = 0; i < 1_000; i += 1) {
      watch.failed(UNREADABLE, at);
      at += 30;
    }
    expect(lines.filter((line) => line.level === 'error')).toHaveLength(1);
    watch.read(at);
    const infos = lines.filter((line) => line.level === 'info');
    expect(infos).toHaveLength(1);
    expect(infos[0]!.context).toHaveProperty('outageSeconds', 30);
  });
});
