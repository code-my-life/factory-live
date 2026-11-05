/**
 * The standard blocks of a video, shown on `/composants`: the player, to the frame, and the script
 * with its aligned words. They share one rule between seconds and frames (`frames.ts`).
 */
export { FPS, clampFrame, frameOf, secondsOf, wordAt } from './frames.ts';
export type { TimedWord } from './frames.ts';
export { VideoPlayer } from './VideoPlayer.tsx';
export { WordTrack } from './WordTrack.tsx';
