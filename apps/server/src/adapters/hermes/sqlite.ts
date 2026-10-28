import { DatabaseSync } from 'node:sqlite';

/** Colonnes dont factory-live a besoin, par table : une mise à jour d'Hermès qui en retire une est signalée, pas subie. */
export type RequiredSchema = Readonly<Record<string, readonly string[]>>;

export class SchemaError extends Error {
  readonly database: string;
  readonly missing: readonly string[];

  constructor(database: string, missing: readonly string[]) {
    super(`Schéma inattendu dans ${database} : ${missing.join(', ')} absent (Hermès mis à jour ?)`);
    this.database = database;
    this.missing = missing;
    this.name = 'SchemaError';
  }
}

/**
 * Ouvre une base d'Hermès en lecture seule. SQLite refuse alors toute écriture ; le dossier reste monté
 * en écriture seulement parce qu'un lecteur WAL partage le fichier `-shm` avec Hermès.
 */
export function openReadOnly(path: string, required: RequiredSchema): DatabaseSync {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const missing: string[] = [];
    for (const [table, columns] of Object.entries(required)) {
      const present = new Set(
        db
          .prepare(`PRAGMA table_info(${JSON.stringify(table)})`)
          .all()
          .map((row) => String(row['name'])),
      );
      if (present.size === 0) missing.push(`table ${table}`);
      else
        for (const column of columns) if (!present.has(column)) missing.push(`${table}.${column}`);
    }
    if (missing.length > 0) throw new SchemaError(path, missing);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function dataVersion(db: DatabaseSync): number {
  return Number(db.prepare('PRAGMA data_version').get()?.['data_version'] ?? 0);
}

/** Lecture cohérente de plusieurs tables : une transaction de lecture très courte, jamais gardée ouverte. */
export function readTransaction<T>(db: DatabaseSync, read: () => T): T {
  db.exec('BEGIN');
  try {
    return read();
  } finally {
    db.exec('COMMIT');
  }
}

export function json(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function stringList(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed))
      return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    // ancien format : liste séparée par des virgules
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function int(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  return null;
}
