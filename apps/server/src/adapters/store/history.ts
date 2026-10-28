import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ActivityEvent } from '@factory-live/contracts';
import type { Board, Comment, Run, Task, TaskEvent } from '@factory-live/domain';
import type {
  HistoryPort,
  KanbanDelta,
  StationRecord,
  UnblockRecord,
  UnblockState,
  UsageDelta,
  UsageRow,
} from '../../application/ports.ts';

export type { StationRecord, UnblockRecord, UnblockState, UsageDelta, UsageRow };

/**
 * Base propre à factory-live, dans son volume Docker : miroir du kanban (le `gc` d'Hermès purge après
 * 30 jours), activité reçue, usage observé, abonnements push, déblocages et journal d'audit.
 * C'est la seule base que factory-live écrit.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, task_id TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY, task_id TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS links (parent_id TEXT NOT NULL, child_id TEXT NOT NULL, PRIMARY KEY (parent_id, child_id));
CREATE TABLE IF NOT EXISTS activity (seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS activity_at ON activity(at);
CREATE TABLE IF NOT EXISTS usage_daily (
  day TEXT NOT NULL, model TEXT NOT NULL, provider TEXT NOT NULL, profile TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0, input INTEGER NOT NULL DEFAULT 0, output INTEGER NOT NULL DEFAULT 0,
  rate_limited INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, model, provider, profile)
);
CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint TEXT PRIMARY KEY, data TEXT NOT NULL, device TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS notified (intervention_id TEXT PRIMARY KEY, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS unblocks (
  intervention_id TEXT PRIMARY KEY, issue_key TEXT NOT NULL, text TEXT NOT NULL, actor TEXT NOT NULL,
  state TEXT NOT NULL, comment_id INTEGER, comment_url TEXT, at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT);
CREATE TABLE IF NOT EXISTS issue_stations (issue_key TEXT PRIMARY KEY, station TEXT NOT NULL, previous TEXT, changed_at INTEGER NOT NULL);
`;

export interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  device: string | null;
}

function parse<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

export class HistoryStore implements HistoryPort {
  private readonly db: DatabaseSync;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(dataDir, 'factory-live.db'));
    this.db.exec(
      'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 2000;',
    );
    this.db.exec(SCHEMA);
  }

  private transaction(write: () => void): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      write();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  meta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? String(row['value']) : null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  /** Recopie ce que le kanban vient de rendre : cartes et runs remplacés, événements et commentaires ajoutés. */
  mirror(delta: KanbanDelta): void {
    this.transaction(() => {
      const task = this.db.prepare(
        'INSERT INTO tasks (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      );
      for (const item of delta.tasks) task.run(item.id, JSON.stringify(item));
      const run = this.db.prepare(
        'INSERT INTO runs (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      );
      for (const item of delta.runs) run.run(item.id, JSON.stringify(item));
      const link = this.db.prepare(
        'INSERT OR IGNORE INTO links (parent_id, child_id) VALUES (?, ?)',
      );
      for (const item of delta.links) link.run(item.parentId, item.childId);
      const event = this.db.prepare(
        'INSERT OR IGNORE INTO events (id, task_id, data) VALUES (?, ?, ?)',
      );
      for (const item of delta.events) event.run(item.id, item.taskId, JSON.stringify(item));
      const comment = this.db.prepare(
        'INSERT OR IGNORE INTO comments (id, task_id, data) VALUES (?, ?, ?)',
      );
      for (const item of delta.comments) comment.run(item.id, item.taskId, JSON.stringify(item));
    });
  }

  board(): Board & { comments: Comment[] } {
    return {
      tasks: this.db
        .prepare('SELECT data FROM tasks')
        .all()
        .map((row) => parse<Task>(row['data'])),
      runs: this.db
        .prepare('SELECT data FROM runs ORDER BY id')
        .all()
        .map((row) => parse<Run>(row['data'])),
      events: this.db
        .prepare('SELECT data FROM events ORDER BY id')
        .all()
        .map((row) => parse<TaskEvent>(row['data'])),
      links: this.db
        .prepare('SELECT parent_id, child_id FROM links')
        .all()
        .map((row) => ({ parentId: String(row['parent_id']), childId: String(row['child_id']) })),
      comments: this.db
        .prepare('SELECT data FROM comments ORDER BY id')
        .all()
        .map((row) => parse<Comment>(row['data'])),
    };
  }

  appendActivity(events: readonly ActivityEvent[]): void {
    if (events.length === 0) return;
    this.transaction(() => {
      const insert = this.db.prepare('INSERT INTO activity (at, data) VALUES (?, ?)');
      for (const event of events) insert.run(Date.parse(event.at), JSON.stringify(event));
    });
  }

  recentActivity(limit: number): ActivityEvent[] {
    return this.db
      .prepare('SELECT data FROM activity ORDER BY seq DESC LIMIT ?')
      .all(limit)
      .map((row) => parse<ActivityEvent>(row['data']))
      .reverse();
  }

  activityOfCards(cardIds: readonly string[], limit = 500): ActivityEvent[] {
    if (cardIds.length === 0) return [];
    const placeholders = cardIds.map(() => '?').join(', ');
    return this.db
      .prepare(
        `SELECT data FROM activity WHERE json_extract(data, '$.cardId') IN (${placeholders}) ORDER BY seq DESC LIMIT ?`,
      )
      .all(...cardIds, limit)
      .map((row) => parse<ActivityEvent>(row['data']))
      .reverse();
  }

  /** Le détail des appels est purgé après 30 jours ; les agrégats d'usage restent. */
  purgeActivity(before: number): number {
    return Number(this.db.prepare('DELETE FROM activity WHERE at < ?').run(before).changes);
  }

  addUsage(delta: UsageDelta): void {
    this.db
      .prepare(
        `INSERT INTO usage_daily (day, model, provider, profile, calls, input, output, rate_limited, errors)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(day, model, provider, profile) DO UPDATE SET
           calls = calls + excluded.calls, input = input + excluded.input, output = output + excluded.output,
           rate_limited = rate_limited + excluded.rate_limited, errors = errors + excluded.errors`,
      )
      .run(
        delta.day,
        delta.model,
        delta.provider,
        delta.profile,
        delta.calls ?? 0,
        delta.input ?? 0,
        delta.output ?? 0,
        delta.rateLimited ?? 0,
        delta.errors ?? 0,
      );
  }

  usageSince(day: string): UsageRow[] {
    return this.db
      .prepare('SELECT * FROM usage_daily WHERE day >= ? ORDER BY day')
      .all(day)
      .map((row) => ({
        day: String(row['day']),
        model: String(row['model']),
        provider: String(row['provider']),
        profile: String(row['profile']),
        calls: Number(row['calls']),
        input: Number(row['input']),
        output: Number(row['output']),
        rateLimited: Number(row['rate_limited']),
        errors: Number(row['errors']),
      }));
  }

  saveSubscription(subscription: StoredSubscription, now: number): void {
    this.db
      .prepare(
        'INSERT INTO push_subscriptions (endpoint, data, device, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET data = excluded.data, device = excluded.device',
      )
      .run(subscription.endpoint, JSON.stringify(subscription.keys), subscription.device, now);
  }

  removeSubscription(endpoint: string): void {
    this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  }

  subscriptions(): StoredSubscription[] {
    return this.db
      .prepare('SELECT endpoint, data, device FROM push_subscriptions')
      .all()
      .map((row) => ({
        endpoint: String(row['endpoint']),
        keys: parse<StoredSubscription['keys']>(row['data']),
        device: row['device'] === null ? null : String(row['device']),
      }));
  }

  /** Vrai la première fois seulement : une intervention ne déclenche qu'une notification, même après redémarrage. */
  claimNotification(interventionId: string, now: number): boolean {
    return (
      Number(
        this.db
          .prepare('INSERT OR IGNORE INTO notified (intervention_id, at) VALUES (?, ?)')
          .run(interventionId, now).changes,
      ) === 1
    );
  }

  unblock(interventionId: string): UnblockRecord | null {
    const row = this.db
      .prepare('SELECT * FROM unblocks WHERE intervention_id = ?')
      .get(interventionId);
    return row ? this.toUnblock(row) : null;
  }

  openUnblocks(): UnblockRecord[] {
    return this.db
      .prepare("SELECT * FROM unblocks WHERE state IN ('sent', 'acknowledged')")
      .all()
      .map((row) => this.toUnblock(row));
  }

  allUnblocks(): UnblockRecord[] {
    return this.db
      .prepare('SELECT * FROM unblocks')
      .all()
      .map((row) => this.toUnblock(row));
  }

  /** Réserve le déblocage d'une intervention : faux si une demande existe déjà (idempotence). */
  reserveUnblock(record: Omit<UnblockRecord, 'commentId' | 'commentUrl' | 'updatedAt'>): boolean {
    return (
      Number(
        this.db
          .prepare(
            'INSERT OR IGNORE INTO unblocks (intervention_id, issue_key, text, actor, state, at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            record.interventionId,
            record.issueKey,
            record.text,
            record.actor,
            record.state,
            record.at,
            record.at,
          ).changes,
      ) === 1
    );
  }

  updateUnblock(
    interventionId: string,
    patch: { state: UnblockState; commentId?: number | null; commentUrl?: string | null },
    now: number,
  ): void {
    this.db
      .prepare(
        'UPDATE unblocks SET state = ?, comment_id = COALESCE(?, comment_id), comment_url = COALESCE(?, comment_url), updated_at = ? WHERE intervention_id = ?',
      )
      .run(patch.state, patch.commentId ?? null, patch.commentUrl ?? null, now, interventionId);
  }

  forgetUnblock(interventionId: string): void {
    this.db.prepare('DELETE FROM unblocks WHERE intervention_id = ?').run(interventionId);
  }

  private toUnblock(row: Record<string, unknown>): UnblockRecord {
    return {
      interventionId: String(row['intervention_id']),
      issueKey: String(row['issue_key']),
      text: String(row['text']),
      actor: String(row['actor']),
      state: String(row['state']) as UnblockState,
      commentId: row['comment_id'] === null ? null : Number(row['comment_id']),
      commentUrl: typeof row['comment_url'] === 'string' ? row['comment_url'] : null,
      at: Number(row['at']),
      updatedAt: Number(row['updated_at']),
    };
  }

  audit(actor: string, action: string, detail: string | null, now: number): void {
    this.db
      .prepare('INSERT INTO audit (at, actor, action, detail) VALUES (?, ?, ?, ?)')
      .run(now, actor, action, detail);
  }

  stations(): Map<string, StationRecord> {
    return new Map(
      this.db
        .prepare('SELECT * FROM issue_stations')
        .all()
        .map((row) => [
          String(row['issue_key']),
          {
            station: String(row['station']),
            previous: row['previous'] === null ? null : String(row['previous']),
            changedAt: Number(row['changed_at']),
          },
        ]),
    );
  }

  saveStation(issueKey: string, record: StationRecord): void {
    this.db
      .prepare(
        'INSERT INTO issue_stations (issue_key, station, previous, changed_at) VALUES (?, ?, ?, ?) ON CONFLICT(issue_key) DO UPDATE SET station = excluded.station, previous = excluded.previous, changed_at = excluded.changed_at',
      )
      .run(issueKey, record.station, record.previous, record.changedAt);
  }

  close(): void {
    this.db.close();
  }
}
