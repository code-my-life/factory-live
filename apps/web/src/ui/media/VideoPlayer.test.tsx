import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider.tsx';
import { frameOf, secondsOf, wordAt } from './frames.ts';
import { VideoPlayer } from './VideoPlayer.tsx';
import { WordTrack } from './WordTrack.tsx';

// jsdom has no `popover` attribute (Primer's tooltips on the icon buttons): stubbed here.
beforeEach(() => {
  localStorage.setItem('factory-live:locale', 'fr');
  Object.defineProperty(HTMLElement.prototype, 'popover', {
    value: null,
    writable: true,
    configurable: true,
  });
  // Nor the popover methods Primer's tooltip calls when it opens, 50 ms after a hover: a slow run
  // reaches them before the test ends.
  HTMLElement.prototype.showPopover = vi.fn();
  HTMLElement.prototype.hidePopover = vi.fn();
});
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Two words on the 30 fps grid: « Mes » on frames 15 to 23, « outils » on frames 24 to 32. */
const WORDS = [
  { mot: 'Mes', debut: 0.5, fin: 0.8 },
  { mot: 'outils', debut: 0.8, fin: 1.1 },
];

/** The player and the words, sharing the frame shown, as the studio's detail does. */
function Harness({
  start,
  src = null,
  total = 60,
}: {
  start: number;
  src?: string | null;
  total?: number;
}) {
  const [frame, setFrame] = useState(start);
  return (
    <I18nProvider>
      <VideoPlayer src={src} total={total} frame={frame} onFrame={setFrame} label="Master" />
      <WordTrack words={WORDS} frame={frame} onSeek={setFrame} />
    </I18nProvider>
  );
}

/** Lets `ms` of fake time run, with React's updates. */
const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const player = () => screen.getByRole('group', { name: 'Master' });
const lit = () =>
  within(screen.getByRole('group', { name: 'Mots calés' }))
    .getAllByRole('button')
    .filter((word) => word.getAttribute('aria-current') === 'true')
    .map((word) => word.textContent);

describe('VideoPlayer', () => {
  it('une flèche avance d’une image et le mot surligné suit l’image', async () => {
    const user = userEvent.setup();
    render(<Harness start={23} />);
    // Frame 23 is the last of « Mes ».
    expect(player()).toHaveTextContent('image 23 / 60');
    expect(player()).toHaveTextContent('0,77 s');
    expect(lit()).toEqual(['Mes']);

    // → one frame: the number says it, and the lit word follows the frame shown.
    player().focus();
    await user.keyboard('{ArrowRight}');
    expect(player()).toHaveTextContent('image 24 / 60');
    expect(player()).toHaveTextContent('0,80 s');
    expect(lit()).toEqual(['outils']);

    // ← back one frame; Shift with an arrow, one second (30 frames); never past the clip's ends.
    await user.keyboard('{ArrowLeft}');
    expect(player()).toHaveTextContent('image 23 / 60');
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(player()).toHaveTextContent('image 53 / 60');
    expect(lit()).toEqual([]);
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(player()).toHaveTextContent('image 59 / 60');
    await user.keyboard('{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}');
    expect(player()).toHaveTextContent('image 0 / 60');
    // Another key does nothing.
    await user.keyboard('a');
    expect(player()).toHaveTextContent('image 0 / 60');

    // The touch buttons step one frame too.
    await user.click(screen.getByRole('button', { name: 'Image suivante' }));
    expect(player()).toHaveTextContent('image 1 / 60');
    await user.click(screen.getByRole('button', { name: 'Image précédente' }));
    expect(player()).toHaveTextContent('image 0 / 60');
    // Without a master, the 9:16 frame says so.
    expect(player()).toHaveTextContent('Pas encore de master');
  });

  it('sans master, Espace lit image par image jusqu’à la dernière, puis repart du début', () => {
    vi.useFakeTimers();
    render(<Harness start={57} />);
    fireEvent.keyDown(player(), { key: ' ' });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    tick(1000 / 30 + 1);
    expect(player()).toHaveTextContent('image 58 / 60');
    tick(1000);
    expect(player()).toHaveTextContent('image 59 / 60');
    // At the last frame it stops; Space starts again from the first.
    expect(screen.getByRole('button', { name: 'Lecture' })).toBeInTheDocument();
    fireEvent.keyDown(player(), { key: ' ' });
    expect(player()).toHaveTextContent('image 0 / 60');
    tick(1000 / 30 + 1);
    expect(player()).toHaveTextContent('image 1 / 60');
    // Space again pauses.
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    tick(1000);
    expect(player()).toHaveTextContent('image 1 / 60');
  });

  it('avec un master, la vidéo se cale sur l’image et l’image suit la lecture', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      this.dispatchEvent(new Event('pause'));
    });
    let paused = true;
    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(() => paused);
    const { container } = render(<Harness start={24} src="/master.mp4" />);
    const video = container.querySelector('video') as HTMLVideoElement;
    // Set on the frame: 24 / 30 s.
    expect(video.currentTime).toBeCloseTo(0.8);
    fireEvent.keyDown(player(), { key: 'ArrowRight' });
    expect(video.currentTime).toBeCloseTo(25 / 30);

    // Space plays the video; while it plays, the frame follows its time.
    fireEvent.keyDown(player(), { key: ' ' });
    expect(play).toHaveBeenCalledOnce();
    paused = false;
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    video.currentTime = 1.0;
    fireEvent.timeUpdate(video);
    expect(player()).toHaveTextContent('image 30 / 60');
    fireEvent.keyDown(player(), { key: ' ' });
    expect(pause).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Lecture' })).toBeInTheDocument();

    // A play the browser refuses leaves the player paused.
    paused = true;
    play.mockImplementation(() => Promise.reject(new Error('NotAllowedError')));
    fireEvent.keyDown(player(), { key: ' ' });
    await act(() => Promise.resolve());
    expect(screen.getByRole('button', { name: 'Lecture' })).toBeInTheDocument();
  });

  it('pendant la lecture, une flèche, un bouton ou un mot déplacent la vidéo', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });
    let paused = true;
    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(() => paused);
    const { container } = render(<Harness start={24} src="/master.mp4" />);
    const video = container.querySelector('video') as HTMLVideoElement;
    fireEvent.keyDown(player(), { key: ' ' });
    paused = false;
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    video.currentTime = 1.0;
    fireEvent.timeUpdate(video);
    expect(player()).toHaveTextContent('image 30 / 60');

    // → while it plays: the video jumps one frame, and the next time update keeps it there.
    fireEvent.keyDown(player(), { key: 'ArrowRight' });
    expect(video.currentTime).toBeCloseTo(31 / 30);
    fireEvent.timeUpdate(video);
    expect(player()).toHaveTextContent('image 31 / 60');

    // Shift with an arrow, one second back, still playing.
    fireEvent.keyDown(player(), { key: 'ArrowLeft', shiftKey: true });
    expect(video.currentTime).toBeCloseTo(1 / 30);
    fireEvent.timeUpdate(video);
    expect(player()).toHaveTextContent('image 1 / 60');

    // The touch buttons, and a word touched, move it too.
    fireEvent.click(screen.getByRole('button', { name: 'Image suivante' }));
    expect(video.currentTime).toBeCloseTo(2 / 30);
    fireEvent.click(screen.getByRole('button', { name: 'outils' }));
    expect(video.currentTime).toBeCloseTo(24 / 30);
    fireEvent.timeUpdate(video);
    expect(player()).toHaveTextContent('image 24 / 60');
    expect(lit()).toEqual(['outils']);
    // Still playing.
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('une seule règle d’image : la tolérance absorbe l’arrondi des secondes', () => {
    expect(frameOf(0.5 + 0.3)).toBe(24);
    expect(frameOf(0.81)).toBe(25);
    expect(secondsOf(45)).toBe(1.5);
    expect(wordAt(WORDS, 14)).toBe(-1);
    expect(wordAt(WORDS, 15)).toBe(0);
    expect(wordAt(WORDS, 33)).toBe(-1);
  });
});
