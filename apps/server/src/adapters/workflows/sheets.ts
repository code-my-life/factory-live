import { readFileSync, statSync } from 'node:fs';
import { parseWorkflowSheet } from '@factory-live/contracts';
import type { PublishedSheet } from '../../application/ports.ts';

export type { PublishedSheet };

/**
 * The sheet of the code line as the factory publishes it (`config/workflow.json` of
 * hermes-software-factory, its #31), read in the repository this server mounts read-only. The web keeps
 * an embedded copy: it draws that one only when the published sheet is missing or invalid, and the
 * Health page says so.
 */

const MAX_SHEET_BYTES = 256 * 1024;

export function publishedSheet(path: string | null): PublishedSheet {
  if (!path)
    return { source: 'embedded', reason: 'config/workflow.json absent du dépôt de la factory' };
  try {
    if (statSync(path).size > MAX_SHEET_BYTES)
      return { source: 'embedded', reason: 'config/workflow.json trop gros' };
    const parsed = parseWorkflowSheet(JSON.parse(readFileSync(path, 'utf8')));
    return parsed.ok
      ? { source: 'published', sheet: parsed.sheet }
      : { source: 'embedded', reason: `config/workflow.json invalide : ${parsed.error}` };
  } catch (cause) {
    return {
      source: 'embedded',
      reason: `config/workflow.json illisible : ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
}
