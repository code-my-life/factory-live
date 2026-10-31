import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { redactSecrets } from '@factory-live/domain';
import type { EvidenceFile } from '@factory-live/domain';
import type { CardFilesPort, LaneTranscript, TranscriptLine } from '../../application/ports.ts';
import type { HermesPaths } from './paths.ts';

const CARD = /^t_[0-9a-f]{8}$/;
const TAIL_BYTES = 512 * 1024;
const EVIDENCE_MAX_FILES = 50;
/** Les preuves de la gate sont rangées par passage : `gate/<n>/01-….txt`. */
const EVIDENCE_MAX_DEPTH = 3;

/** Fin d'un fichier, sans tout charger : un log de carte peut peser des dizaines de Mo. */
function tail(path: string, bytes: number): string {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    const length = Math.min(size, bytes);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    const text = buffer.toString('utf8');
    return size > bytes ? text.slice(text.indexOf('\n') + 1) : text;
  } finally {
    closeSync(fd);
  }
}

/** Log brut d'une carte (`board/logs/<carte>.log`), séquences ANSI gardées pour le rendu terminal. */
export function cardLog(boardDir: string, cardId: string): string[] | null {
  if (!CARD.test(cardId)) return null;
  const path = join(boardDir, 'logs', `${cardId}.log`);
  if (!existsSync(path)) return null;
  return redactSecrets(tail(path, TAIL_BYTES)).split('\n');
}

/** Dossier de Claude Code pour un répertoire de travail : chaque caractère non alphanumérique devient `-`. */
export function claudeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

export type ClaudeEntry = TranscriptLine;

function contentParts(content: unknown): Record<string, unknown>[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content)
    ? content.filter(
        (part): part is Record<string, unknown> => typeof part === 'object' && part !== null,
      )
    : [];
}

function clip(value: unknown, max = 20_000): string | null {
  const raw =
    typeof value === 'string'
      ? value
      : value === undefined || value === null
        ? null
        : JSON.stringify(value);
  if (raw === null) return null;
  const clean = redactSecrets(raw);
  return clean.length > max
    ? `${clean.slice(0, max)}\n… (${clean.length - max} caractères de plus)`
    : clean;
}

/** Lignes d'une transcription Claude Code (`~/.claude/projects/<dossier>/<session>.jsonl`). */
export function parseClaudeTranscript(jsonl: string): ClaudeEntry[] {
  const entries: ClaudeEntry[] = [];
  jsonl.split('\n').forEach((line, index) => {
    if (!line.trim()) return;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    const message = (record['message'] ?? {}) as Record<string, unknown>;
    const at = typeof record['timestamp'] === 'string' ? Date.parse(record['timestamp']) || 0 : 0;
    const model = typeof message['model'] === 'string' ? message['model'] : null;
    const id = typeof record['uuid'] === 'string' ? record['uuid'] : String(index);
    if (record['type'] !== 'user' && record['type'] !== 'assistant') return;
    contentParts(message['content']).forEach((part, partIndex) => {
      const base = { id: `${id}:${partIndex}`, at, model };
      switch (part['type']) {
        case 'text':
          entries.push({
            ...base,
            role: record['type'] === 'user' ? 'user' : 'assistant',
            text: clip(part['text']),
            toolName: null,
            status: null,
          });
          break;
        case 'thinking':
          entries.push({
            ...base,
            role: 'reasoning',
            text: clip(part['thinking']),
            toolName: null,
            status: null,
          });
          break;
        case 'tool_use':
          entries.push({
            ...base,
            role: 'tool_call',
            text: clip(part['input']),
            toolName: typeof part['name'] === 'string' ? part['name'] : null,
            status: null,
          });
          break;
        case 'tool_result':
          entries.push({
            ...base,
            role: 'tool_result',
            text: clip(part['content']),
            toolName: null,
            status: part['is_error'] === true ? 'error' : 'ok',
          });
          break;
        default:
          break;
      }
    });
  });
  return entries;
}

/**
 * Transcriptions Claude Code d'une carte : dossiers dont le nom commence par celui du workspace
 * (le CLI peut tourner dans un sous-dossier), fichiers modifiés pendant le run.
 * Retourne aussi le nom de la lane (dernier custom-title) et les bornes temporelles.
 */
export function claudeTranscriptFiles(
  projectsDir: string,
  workspacePath: string,
  fromMs: number,
  toMs: number,
): { path: string; mtime: number; name: string | null; startedAt: number | null; endedAt: number | null }[] {
  const prefix = claudeProjectDir(workspacePath);
  let dirs: string[];
  try {
    dirs = readdirSync(projectsDir).filter(
      (name) => name === prefix || name.startsWith(`${prefix}-`),
    );
  } catch {
    return [];
  }
  const files: { path: string; mtime: number; name: string | null; startedAt: number | null; endedAt: number | null }[] = [];
  for (const dir of dirs) {
    for (const name of readdirSync(join(projectsDir, dir))) {
      if (!name.endsWith('.jsonl')) continue;
      const path = join(projectsDir, dir, name);
      const { mtimeMs, birthtimeMs } = statSync(path);
      if (mtimeMs >= fromMs && (birthtimeMs || mtimeMs) <= toMs) {
        // Lire le nom et les bornes temporelles
        let laneName: string | null = null;
        let firstAt: number | null = null;
        let lastAt: number | null = null;
        try {
          const content = readFileSync(path, 'utf8');
          for (const line of content.split('\n')) {
            if (!line.trim()) continue;
            let record: Record<string, unknown>;
            try {
              record = JSON.parse(line) as Record<string, unknown>;
            } catch {
              continue;
            }
            // custom-title record
            if (record['type'] === 'custom-title' && typeof record['title'] === 'string') {
              laneName = record['title'];
            }
            // Timestamp du premier/dernier enregistrement daté
            const at = typeof record['timestamp'] === 'string' ? Date.parse(record['timestamp']) || 0 : 0;
            if (at > 0) {
              if (firstAt === null || at < firstAt) firstAt = at;
              if (lastAt === null || at > lastAt) lastAt = at;
            }
          }
        } catch {
          // Fichier illisible : on garde les valeurs par défaut
        }
        files.push({ path, mtime: mtimeMs, name: laneName, startedAt: firstAt, endedAt: lastAt });
      }
    }
  }
  return files.sort((left, right) => left.mtime - right.mtime);
}

export interface ClaudeCost {
  totalCostUsd: number;
  models: { model: string; inputTokens: number; outputTokens: number; costUsd: number }[];
}

/** Coût d'une session Claude Code : dernier enregistrement `cost-state` de la transcription. */
export function claudeCost(jsonl: string): ClaudeCost | null {
  let last: Record<string, unknown> | null = null;
  for (const line of jsonl.split('\n')) {
    if (!line.includes('"cost-state"')) continue;
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (record['type'] === 'cost-state') last = record;
    } catch {
      // ligne tronquée pendant l'écriture : la suivante fera foi
    }
  }
  if (!last || typeof last['totalCostUSD'] !== 'number') return null;
  const usage = (last['modelUsage'] ?? {}) as Record<string, Record<string, unknown>>;
  return {
    totalCostUsd: last['totalCostUSD'],
    models: Object.entries(usage).map(([model, value]) => ({
      model,
      inputTokens:
        Number(value['inputTokens'] ?? 0) +
        Number(value['cacheReadInputTokens'] ?? 0) +
        Number(value['cacheCreationInputTokens'] ?? 0),
      outputTokens: Number(value['outputTokens'] ?? 0),
      costUsd: Number(value['costUSD'] ?? 0),
    })),
  };
}

/**
 * Les fichiers d'un dossier de preuves, sous-dossiers compris, par ordre de nom : ni fichier caché
 * (marqueurs de la factory), ni lien, ni plus de 50 fichiers.
 */
export function evidenceFiles(paths: HermesPaths, dir: string): EvidenceFile[] {
  const files: EvidenceFile[] = [];
  const visit = (parts: readonly string[]) => {
    let names: string[];
    try {
      names = readdirSync(join(dir, ...parts)).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (files.length >= EVIDENCE_MAX_FILES) return;
      if (name.startsWith('.')) continue;
      const entry = [...parts, name];
      const file = paths.evidenceEntry(dir, entry, 'file');
      if (file) {
        try {
          const stat = statSync(file);
          files.push({ name: entry.join('/'), bytes: stat.size, at: stat.mtimeMs / 1000 });
        } catch {
          // supprimé entre la liste et la lecture : il n'est plus une preuve
        }
      } else if (entry.length < EVIDENCE_MAX_DEPTH && paths.evidenceEntry(dir, entry, 'dir')) {
        visit(entry);
      }
    }
  };
  visit([]);
  return files;
}

/** Fichiers de la factory lus pour l'interface : logs de cartes et transcriptions des lanes Claude Code. */
export class CardFiles implements CardFilesPort {
  private readonly boardDir: string;
  private readonly claudeProjects: string;
  private readonly paths: HermesPaths;

  constructor(boardDir: string, claudeProjects: string, paths: HermesPaths) {
    this.boardDir = boardDir;
    this.claudeProjects = claudeProjects;
    this.paths = paths;
  }

  evidence(cardId: string): EvidenceFile[] | null {
    const dir = this.paths.evidenceDir(cardId);
    return dir ? evidenceFiles(this.paths, dir) : null;
  }

  evidenceStamp(cardId: string): string {
    const dir = this.paths.evidenceDir(cardId);
    if (!dir) return '-';
    try {
      return String(statSync(dir).mtimeMs);
    } catch {
      return '-';
    }
  }

  cardLog(cardId: string): string[] | null {
    return cardLog(this.boardDir, cardId);
  }

  claudeTranscripts(workspacePath: string, fromMs: number, toMs: number): LaneTranscript[] {
    return claudeTranscriptFiles(this.claudeProjects, workspacePath, fromMs, toMs).map((fileInfo) => {
      const content = readFileSync(fileInfo.path, 'utf8');
      return {
        entries: parseClaudeTranscript(content),
        name: fileInfo.name,
        startedAt: fileInfo.startedAt,
        endedAt: fileInfo.endedAt,
        costUsd: claudeCost(content)?.totalCostUsd ?? null,
      };
    });
  }
}
