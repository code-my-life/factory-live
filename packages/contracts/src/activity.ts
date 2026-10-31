import { z } from 'zod';
import { IssueKey, Timestamp } from './common.ts';
import { Text } from './messages.ts';

/** Une ligne du fil d'activité : appel d'outil, appel au modèle, événement kanban, GitHub ou garde. */
export const ActivityEvent = z.object({
  id: z.string(),
  at: Timestamp,
  kind: z.enum(['tool', 'llm', 'kanban', 'github', 'skill', 'guard', 'system']),
  profile: z.string().nullable(),
  issueKey: IssueKey.nullable(),
  cardId: z.string().nullable(),
  /** Nom d'outil ou de modèle, événement du kanban (tels quels), ou texte fabriqué par factory-live. */
  label: Text,
  detail: Text.nullable(),
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
 * A transcript of a run. A lane run has two: the Hermès session that drives
 * it and the CLI session (Claude Code or OpenCode). `terminal` is the raw log of the card (ANSI).
 * The fields `name`, `startedAt`, `endedAt`, `costUsd` come from the `custom-title` record
 * (for the name) and the first/last dated records of the transcript.
 */
export const TranscriptView = z.object({
  runId: z.number().int().positive(),
  source: z.enum(['hermes', 'claude-code', 'opencode']),
  title: Text,
  /** Lane name read from the last `custom-title` record, or `null` without it. */
  name: z.string().nullable(),
  /** Start time (ms epoch) of the first dated record, or `null`. */
  startedAt: z.number().int().nonnegative().nullable(),
  /** End time (ms epoch) of the last dated record, or `null` if the lane is in progress. */
  endedAt: z.number().int().nonnegative().nullable(),
  /** Estimated cost in USD, or `null` if unknown. */
  costUsd: z.number().nullable(),
  entries: z.array(TranscriptEntry),
  terminal: z.array(z.string()),
});
export type TranscriptView = z.infer<typeof TranscriptView>;
