import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { KanbanWatch } from './kanban-watch.ts';

const T = Date.parse('2026-11-10T08:00:00Z');
const UNREADABLE = 'unable to open database file';

/** A watch on a hand-driven clock, with its log lines captured as pino writes them. */
function setup() {
  const clock = { now: T };
  const lines: { level: number; msg: string; outageSeconds?: number }[] = [];
  const log = pino(
    { level: 'info' },
    {
      write: (line: string) => {
        lines.push(JSON.parse(line) as { level: number; msg: string; outageSeconds?: number });
      },
    },
  );
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
    expect(lines.filter((line) => line.level === 50)).toHaveLength(1);
    watch.read(at);
    const infos = lines.filter((line) => line.level === 30);
    expect(infos).toHaveLength(1);
    expect(infos[0]!.outageSeconds).toBe(30);
  });
});
