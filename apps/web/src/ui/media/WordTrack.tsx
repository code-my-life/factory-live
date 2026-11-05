import { useI18n } from '../../i18n/I18nProvider.tsx';
import { frameOf, wordAt } from './frames.ts';
import type { TimedWord } from './frames.ts';
import styles from './media.module.css';

/**
 * The script with its aligned words: the word under the frame shown is lit, and touching a word
 * brings the player to the frame where it starts.
 */
export function WordTrack({
  words,
  frame,
  onSeek,
  label,
}: {
  words: readonly TimedWord[];
  frame: number;
  onSeek: (frame: number) => void;
  /** What the words are, for screen readers. */
  label?: string;
}) {
  const { t } = useI18n();
  const current = wordAt(words, frame);
  return (
    <div className={styles.words} role="group" aria-label={label ?? t.media.words}>
      {words.map((word, index) => (
        <button
          key={`${index}:${word.debut}`}
          type="button"
          className={styles.word}
          aria-current={index === current ? 'true' : undefined}
          data-start={frameOf(word.debut)}
          onClick={() => onSeek(frameOf(word.debut))}
        >
          {word.mot}
        </button>
      ))}
    </div>
  );
}
