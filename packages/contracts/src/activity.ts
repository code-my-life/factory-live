import { z } from 'zod';
import { IssueKey, Timestamp } from './common.ts';

/** Une ligne du fil d'activité : appel d'outil, appel au modèle, événement kanban, GitHub ou garde. */
export const ActivityEvent = z.object({
  id: z.string(),
  at: Timestamp,
  kind: z.enum(['tool', 'llm', 'kanban', 'github', 'skill', 'guard', 'system']),
  profile: z.string().nullable(),
  issueKey: IssueKey.nullable(),
  cardId: z.string().nullable(),
  label: z.string(),
  detail: z.string().nullable(),
  status: z.enum(['ok', 'running', 'error', 'blocked']).nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  model: z.string().nullable(),
});
export type ActivityEvent = z.infer<typeof ActivityEvent>;

/** Une entrée de transcription, quelle que soit la source (session Hermès ou lane CLI). */
export const TranscriptEntry = z.object({
  id: z.string(),
  at: Timestamp,
  role: z.enum(['user', 'assistant', 'reasoning', 'tool_call', 'tool_result', 'system']),
  text: z.string().nullable(),
  toolName: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['ok', 'error', 'blocked']).nullable(),
});
export type TranscriptEntry = z.infer<typeof TranscriptEntry>;

/**
 * Une transcription d'un run. Un run de lane en a deux : la session Hermès qui pilote
 * et la session du CLI (Claude Code ou OpenCode). `terminal` est le log brut de la carte (ANSI).
 */
export const TranscriptView = z.object({
  runId: z.number().int().positive(),
  source: z.enum(['hermes', 'claude-code', 'opencode']),
  title: z.string(),
  entries: z.array(TranscriptEntry),
  terminal: z.array(z.string()),
});
export type TranscriptView = z.infer<typeof TranscriptView>;
