import { STUDIO_FPS } from '@factory-live/contracts';

/**
 * The one rule between seconds and frames, for the player and the aligned words alike: a master runs
 * at 30 frames per second, frame `n` shows from `n / 30` s.
 */
export const FPS = STUDIO_FPS;

/** A word placed in the master's time, in seconds. */
export interface TimedWord {
  mot: string;
  debut: number;
  fin: number;
}

/** The first frame shown at or after `seconds`; the tolerance absorbs the rounding of a float. */
export function frameOf(seconds: number): number {
  return Math.ceil(seconds * FPS - 1e-6);
}

/** When frame `frame` starts, in seconds. */
export function secondsOf(frame: number): number {
  return frame / FPS;
}

/** The word under frame `frame`: the one with `frameOf(debut) <= frame < frameOf(fin)`, else -1. */
export function wordAt(words: readonly TimedWord[], frame: number): number {
  return words.findIndex((word) => frameOf(word.debut) <= frame && frame < frameOf(word.fin));
}

/** Keeps a frame inside a clip of `total` frames. */
export function clampFrame(frame: number, total: number): number {
  return Math.min(Math.max(frame, 0), Math.max(total - 1, 0));
}
