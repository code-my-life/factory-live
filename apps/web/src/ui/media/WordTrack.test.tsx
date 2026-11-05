import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider.tsx';
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
});
afterEach(() => localStorage.clear());

/** Three words of a script; « usine » starts at 1.37 s, between two frames: frame 42. */
const WORDS = [
  { mot: 'Mon', debut: 0.5, fin: 0.8 },
  { mot: 'usine', debut: 1.37, fin: 1.9 },
  { mot: 'à', debut: 1.9, fin: 2.2 },
];

function Harness() {
  const [frame, setFrame] = useState(0);
  return (
    <I18nProvider>
      <VideoPlayer src={null} total={90} frame={frame} onFrame={setFrame} label="Master" />
      <WordTrack words={WORDS} frame={frame} onSeek={setFrame} label="Script" />
    </I18nProvider>
  );
}

describe('WordTrack', () => {
  it('toucher un mot amène la vidéo à son image', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const master = screen.getByRole('group', { name: 'Master' });
    const words = screen.getByRole('group', { name: 'Script' });
    expect(master).toHaveTextContent('image 0 / 90');
    expect(words.querySelector('[aria-current]')).toBeNull();

    // « usine » starts at 1.37 s: the first frame shown at or after it is 42 (1.40 s).
    await user.click(screen.getByRole('button', { name: 'usine' }));
    expect(master).toHaveTextContent('image 42 / 90');
    expect(master).toHaveTextContent('1,40 s');
    expect(screen.getByRole('button', { name: 'usine' })).toHaveAttribute('aria-current', 'true');

    await user.click(screen.getByRole('button', { name: 'Mon' }));
    expect(master).toHaveTextContent('image 15 / 90');
    expect(screen.getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'usine' })).not.toHaveAttribute('aria-current');
  });
});
