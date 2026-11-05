import { z } from 'zod';
import { Timestamp } from './common.ts';

/**
 * The video studio as factory-live reads it, after the v1 API of video-factory (ADR 0006 of
 * video-factory): its videos, each at a station of the studio's sheet, their script, their aligned
 * words and the steps of `vf run`, and the owner's gesture. The web reads it; the server does not.
 */

/** The frame rate of every master of the studio: one frame is 1/30 s. */
export const STUDIO_FPS = 30;

/** Where a video stands at its station: at work, waiting for the owner, failed, or published. */
export const StudioItemState = z.enum(['running', 'waiting', 'failed', 'done']);
export type StudioItemState = z.infer<typeof StudioItemState>;

export const StudioItem = z.object({
  /** The video's id, its folder in video-content. */
  id: z.string().min(1),
  /** The card of the studio's board that carries it. */
  card: z.string(),
  title: z.string(),
  /** A station key of the studio's sheet. */
  station: z.string().min(1),
  state: StudioItemState,
  /** When it reached its station. */
  since: Timestamp,
  /** What it waits for, as the studio says it. */
  waits: z.string().nullable(),
  /** Why its lane failed, as the studio says it. */
  failure: z.string().nullable(),
});
export type StudioItem = z.infer<typeof StudioItem>;

/** A word of the script, aligned on the master: its start and end in seconds of the master's time. */
export const StudioWord = z
  .object({
    mot: z.string(),
    debut: z.number().nonnegative(),
    fin: z.number().nonnegative(),
    /** The word is kept in the cut. */
    garde: z.boolean(),
  })
  .refine((word) => word.fin > word.debut, { message: 'a word ends after it starts' });
export type StudioWord = z.infer<typeof StudioWord>;

/** A step of `vf run`: its result, its duration, and the fingerprint of each output. */
export const StudioStep = z.object({
  name: z.string(),
  result: z.string(),
  durationMs: z.number().int().nonnegative(),
  outputs: z.array(z.object({ name: z.string(), sha256: z.string() })),
});
export type StudioStep = z.infer<typeof StudioStep>;

/** A file the studio serves for a video: its master, or its aligned words. */
export const StudioFile = z.object({
  kind: z.enum(['video', 'words']),
  name: z.string(),
  url: z.string().min(1),
});
export type StudioFile = z.infer<typeof StudioFile>;

export const StudioLinks = z.object({
  /** The video's page on the studio. */
  studio: z.url().optional(),
  /** The page where the owner sends the takes. */
  takes: z.url().optional(),
  /** The published video. */
  publication: z.url().optional(),
});
export type StudioLinks = z.infer<typeof StudioLinks>;

export const StudioItemDetail = StudioItem.extend({
  script: z.string(),
  steps: z.array(StudioStep),
  files: z.array(StudioFile),
  links: StudioLinks,
});
export type StudioItemDetail = z.infer<typeof StudioItemDetail>;

/** The owner's gesture: go on, or do it again, and then a reason is required. */
export const StudioGesture = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('ok'), note: z.string().optional() }),
  z.object({ decision: z.literal('refaire'), note: z.string().trim().min(1) }),
]);
export type StudioGesture = z.infer<typeof StudioGesture>;
/** A gesture as a form gives it, before `StudioGesture` checks it (a blank reason included). */
export type StudioGestureInput = z.input<typeof StudioGesture>;
