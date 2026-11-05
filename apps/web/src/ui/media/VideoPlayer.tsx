import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from '@primer/octicons-react';
import { IconButton } from '@primer/react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { FPS, clampFrame, frameOf, secondsOf } from './frames.ts';
import styles from './media.module.css';

/**
 * A master, to the frame: the caller keeps the frame shown (an integer, 0 to `total - 1`) and the
 * player sets its `<video>` on it. ← and → step one frame, with Shift one second (30 frames), Space
 * plays and pauses; the time reads to the hundredth of a second, with the frame's number. Without a
 * master, a 9:16 frame stands in its place, with the same time and number.
 */
export function VideoPlayer({
  src,
  total,
  frame,
  onFrame,
  label,
}: {
  /** The master's address; `null` until there is one. */
  src: string | null;
  /** How many frames the clip has. */
  total: number;
  frame: number;
  onFrame: (frame: number) => void;
  /** What the player shows, for screen readers. */
  label: string;
}) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  // The last frame the video itself reported (or was set on): a `frame` that differs is a jump asked
  // for by a key, a button or a word; one that matches only follows the playback.
  const reported = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const last = Math.max(total - 1, 0);
  // Without a master, playing steps the frames itself, and stops at the last one.
  const stepping = playing && src === null && frame < last;

  // The video follows the frame. While it plays, the frame follows the video, except for a jump.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (playing) {
      if (frame !== reported.current) {
        reported.current = frame;
        element.currentTime = secondsOf(frame);
      }
      return;
    }
    reported.current = frame;
    if (frameOf(element.currentTime) !== frame) element.currentTime = secondsOf(frame);
  }, [frame, playing]);

  useEffect(() => {
    if (!stepping) return;
    const timer = window.setTimeout(() => onFrame(frame + 1), 1000 / FPS);
    return () => window.clearTimeout(timer);
  }, [stepping, frame, onFrame]);

  const go = (next: number) => onFrame(clampFrame(next, total));
  const toggle = () => {
    const element = video.current;
    if (element) {
      if (element.paused) void element.play().catch(() => setPlaying(false));
      else element.pause();
      return;
    }
    if (stepping) setPlaying(false);
    else {
      if (frame >= last) onFrame(0);
      setPlaying(true);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? FPS : 1;
    if (event.key === 'ArrowRight') go(frame + step);
    else if (event.key === 'ArrowLeft') go(frame - step);
    else if (event.key === ' ') toggle();
    else return;
    event.preventDefault();
  };
  const running = src === null ? stepping : playing;

  return (
    <div
      className={styles.player}
      role="group"
      aria-label={label}
      aria-roledescription={t.media.player}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-frame={frame}
    >
      {src === null ? (
        <div className={styles.screen} data-empty="">
          <span className={styles.screenNote}>{t.media.noMaster}</span>
        </div>
      ) : (
        <video
          ref={video}
          className={styles.screen}
          src={src}
          preload="metadata"
          playsInline
          aria-label={label}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => {
            const next = clampFrame(frameOf(event.currentTarget.currentTime), total);
            reported.current = next;
            onFrame(next);
          }}
        />
      )}
      <div className={styles.bar}>
        <IconButton
          className={styles.control}
          icon={ChevronLeftIcon}
          aria-label={t.media.previous}
          variant="invisible"
          onClick={() => go(frame - 1)}
        />
        <IconButton
          className={styles.control}
          icon={running ? PauseIcon : PlayIcon}
          aria-label={running ? t.media.pause : t.media.play}
          variant="invisible"
          onClick={toggle}
        />
        <IconButton
          className={styles.control}
          icon={ChevronRightIcon}
          aria-label={t.media.next}
          variant="invisible"
          onClick={() => go(frame + 1)}
        />
        <p className={styles.clock}>
          <span data-time="">{t.media.time(secondsOf(frame))}</span>
          <span data-frame-number="">{t.media.frame(frame, total)}</span>
        </p>
      </div>
      <p className={styles.keys}>{t.media.keys}</p>
    </div>
  );
}
