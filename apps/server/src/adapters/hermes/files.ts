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
import type { CardFilesPort, LaneTranscript, TranscriptLine } from '../../application/ports.ts';

const CARD = /^t_[0-9a-f]{8}$/;
const TAIL_BYTES = 512 * 1024;

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
 */
export function claudeTranscriptFiles(
  projectsDir: string,
  workspacePath: string,
  fromMs: number,
  toMs: number,
): string[] {
  const prefix = claudeProjectDir(workspacePath);
  let dirs: string[];
  try {
    dirs = readdirSync(projectsDir).filter(
      (name) => name === prefix || name.startsWith(`${prefix}-`),
    );
  } catch {
    return [];
  }
  const files: { path: string; mtime: number }[] = [];
  for (const dir of dirs) {
    for (const name of readdirSync(join(projectsDir, dir))) {
      if (!name.endsWith('.jsonl')) continue;
      const path = join(projectsDir, dir, name);
      const { mtimeMs, birthtimeMs } = statSync(path);
      if (mtimeMs >= fromMs && (birthtimeMs || mtimeMs) <= toMs)
        files.push({ path, mtime: mtimeMs });
    }
  }
  return files.sort((left, right) => left.mtime - right.mtime).map((file) => file.path);
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

/** Fichiers de la factory lus pour l'interface : logs de cartes et transcriptions des lanes Claude Code. */
export class CardFiles implements CardFilesPort {
  private readonly boardDir: string;
  private readonly claudeProjects: string;

  constructor(boardDir: string, claudeProjects: string) {
    this.boardDir = boardDir;
    this.claudeProjects = claudeProjects;
  }

  cardLog(cardId: string): string[] | null {
    return cardLog(this.boardDir, cardId);
  }

  claudeTranscripts(workspacePath: string, fromMs: number, toMs: number): LaneTranscript[] {
    return claudeTranscriptFiles(this.claudeProjects, workspacePath, fromMs, toMs).map((file) => {
      const content = readFileSync(file, 'utf8');
      return {
        entries: parseClaudeTranscript(content),
        costUsd: claudeCost(content)?.totalCostUsd ?? null,
      };
    });
  }
}
