import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { logFactOf, parseLogLine } from '@factory-live/domain';
import type { LogFact } from '@factory-live/domain';
import type { AgentLogPort } from '../../application/ports.ts';
import type { HermesPaths } from './paths.ts';

/** À la première lecture, seule la fin d'un gros journal compte : les blocages récents. */
const FIRST_READ_BYTES = 16 * 1024 * 1024;
const CHUNK_BYTES = 1024 * 1024;
/** Les lignes retenues par fichier, au plus : les plus récentes. */
const FACTS_KEPT = 20_000;
/** Une ligne sans session prend celle de la ligne `agent.tool_executor` qui la suit de près. */
const ATTACH_SECONDS = 2;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let known = formatters.get(timeZone);
  if (!known) {
    known = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, known);
  }
  return known;
}

/** L'heure murale du fuseau à cet instant, comme si elle était en UTC (millisecondes). */
function wallAt(epochMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(epochMs))
      .map((part) => [part.type, part.value]),
  );
  return Date.UTC(
    Number(parts['year']),
    Number(parts['month']) - 1,
    Number(parts['day']),
    Number(parts['hour']),
    Number(parts['minute']),
    Number(parts['second']),
  );
}

/**
 * L'instant d'une heure murale d'Hermès (`2026-10-29 09:46:10`, sans fuseau) dans le fuseau de la
 * machine. À l'heure d'hiver, la même heure murale existe deux fois : on prend la première qui ne
 * remonte pas avant la ligne précédente (`notBefore`), le journal s'écrivant dans l'ordre.
 */
export function zonedEpoch(
  wallClock: string,
  millis: number,
  timeZone: string,
  notBefore: number | null = null,
): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(wallClock);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Les décalages de part et d'autre d'un éventuel changement d'heure.
  const offsets = [
    ...new Set(
      [-3, 3].map(
        (hours) => wallAt(asUtc + hours * 3_600_000, timeZone) - (asUtc + hours * 3_600_000),
      ),
    ),
  ];
  const candidates = offsets
    .map((offset) => asUtc - offset)
    .filter((epoch) => wallAt(epoch, timeZone) === asUtc)
    .sort((left, right) => left - right);
  // Une heure qui n'existe pas (le saut du printemps) : l'ancien décalage, comme le ferait l'horloge.
  const chosen =
    candidates.find((epoch) => notBefore === null || epoch / 1000 >= notBefore - 1) ??
    candidates.at(-1) ??
    asUtc - (offsets[0] ?? 0);
  return (chosen + millis) / 1000;
}

/** Les sessions d'un agent ouvertes à un instant (secondes epoch), d'après les sessions d'Hermès. */
export type ActiveSessions = (profile: string, at: number) => readonly string[] | null;

interface FileCache {
  inode: number;
  /** Octets déjà lus ; une ligne inachevée attend la suite dans `pending`. */
  offset: number;
  pending: string;
  facts: LogFact[];
  /** Dernière heure lue, pour lever l'ambiguïté du changement d'heure. */
  lastAt: number | null;
  /** Lignes sans session, en attente d'une ligne `agent.tool_executor` dans les 2 s. */
  orphans: LogFact[];
}

/**
 * Le journal d'Hermès de chaque agent (`logs/agent.log`, puis `agent.log.1` après rotation), lu à la
 * demande et par morceaux : seules les lignes que le diagnostic sait lire sont gardées, datées dans le
 * fuseau de la machine (`HERMES_TZ`). Une relecture reprend où la précédente s'était arrêtée ; un
 * fichier remplacé (rotation) ou raccourci est relu depuis le début. Une ligne sans session prend
 * celle de l'appel d'outil qui la suit de près, sinon la seule session ouverte de l'agent à ce moment.
 */
export class AgentLogReader implements AgentLogPort {
  private readonly paths: HermesPaths;
  private readonly timeZone: string;
  private readonly activeSessions: ActiveSessions | null;
  private readonly files = new Map<string, FileCache>();
  /** Session rattachée après coup à une ligne qui n'en nommait pas ; `null` : aucune ou plusieurs. */
  private readonly attached = new WeakMap<LogFact, string | null>();

  constructor(paths: HermesPaths, timeZone: string, activeSessions: ActiveSessions | null = null) {
    this.paths = paths;
    this.timeZone = timeZone;
    this.activeSessions = activeSessions;
  }

  /** La seule session de l'agent ouverte à l'heure de la ligne ; plusieurs ou aucune : on ne devine pas. */
  private attach(profile: string, fact: LogFact): LogFact {
    if (fact.sessionId || !this.activeSessions) return fact;
    let session = this.attached.get(fact);
    if (session === undefined) {
      const open = this.openSessions(profile, fact.at);
      session = open?.length === 1 ? (open[0] ?? null) : null;
      this.attached.set(fact, session);
    }
    return session ? { ...fact, sessionId: session } : fact;
  }

  private openSessions(profile: string, at: number): readonly string[] | null {
    try {
      return this.activeSessions?.(profile, at) ?? null;
    } catch {
      return null;
    }
  }

  facts(profile: string, from: number, to: number): LogFact[] | null {
    const files = this.paths.agentLogs(profile);
    if (files.length === 0) return null;
    const facts: LogFact[] = [];
    for (const path of files) {
      const cache = this.read(path);
      // Les dernières lignes sans session comptent aussi : l'agent peut s'être arrêté juste après.
      for (const fact of [...(cache?.facts ?? []), ...(cache?.orphans ?? [])])
        if (fact.at >= from && fact.at <= to) facts.push(this.attach(profile, fact));
    }
    return facts.sort((left, right) => left.at - right.at);
  }

  private read(path: string): FileCache | null {
    let fd: number;
    try {
      fd = openSync(path, 'r');
    } catch {
      this.files.delete(path);
      return null;
    }
    try {
      const stat = fstatSync(fd);
      let cache = this.files.get(path);
      if (!cache || cache.inode !== stat.ino || stat.size < cache.offset) {
        const start = Math.max(0, stat.size - FIRST_READ_BYTES);
        cache = {
          inode: stat.ino,
          offset: start,
          pending: '',
          facts: [],
          lastAt: null,
          orphans: [],
        };
        // Commencé au milieu d'une ligne : elle est écartée.
        if (start > 0) cache.pending = '\u0000';
        this.files.set(path, cache);
      }
      while (cache.offset < stat.size) {
        const length = Math.min(CHUNK_BYTES, stat.size - cache.offset);
        const buffer = Buffer.alloc(length);
        const read = readSync(fd, buffer, 0, length, cache.offset);
        if (read <= 0) break;
        cache.offset += read;
        this.parse(cache, buffer.subarray(0, read).toString('utf8'));
      }
      if (cache.facts.length > FACTS_KEPT) cache.facts = cache.facts.slice(-FACTS_KEPT);
      return cache;
    } finally {
      closeSync(fd);
    }
  }

  private parse(cache: FileCache, chunk: string): void {
    const text = cache.pending + chunk;
    const lines = text.split('\n');
    cache.pending = lines.pop() ?? '';
    if (lines[0]?.startsWith('\u0000')) lines.shift();
    for (const line of lines) {
      const parsed = parseLogLine(line.replace(/\r$/, ''));
      if (!parsed) continue;
      const at = zonedEpoch(parsed.wallClock, parsed.millis, this.timeZone, cache.lastAt);
      if (at === null) continue;
      cache.lastAt = at;
      if (parsed.logger === 'agent.tool_executor' && parsed.sessionId) {
        for (const orphan of cache.orphans)
          if (at - orphan.at <= ATTACH_SECONDS)
            cache.facts.push({ ...orphan, sessionId: parsed.sessionId });
        cache.orphans = [];
      }
      // Une ligne sans session reste seule passé 2 s : gardée telle quelle, sans session devinée.
      cache.orphans = cache.orphans.filter((orphan) => {
        if (at - orphan.at <= ATTACH_SECONDS) return true;
        cache.facts.push(orphan);
        return false;
      });
      const fact = logFactOf(parsed);
      if (!fact) continue;
      if (fact.sessionId) cache.facts.push({ ...fact, at });
      else cache.orphans.push({ ...fact, at });
    }
  }
}
