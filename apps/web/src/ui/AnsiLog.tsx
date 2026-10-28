import Anser from 'anser';
import styles from './AnsiLog.module.css';

const TONES = new Set(['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']);

/** Log brut d'un worker : couleurs ANSI rendues avec les jetons du thème, texte jamais interprété en HTML. */
export function AnsiLog({ lines, label }: { lines: readonly string[]; label: string }) {
  return (
    <div className={styles.frame} role="log" aria-label={label} tabIndex={0}>
      <pre className={styles.log}>
        {lines.map((line, lineIndex) => (
          <span key={lineIndex} className={styles.line}>
            {Anser.ansiToJson(line, { use_classes: true, remove_empty: true }).map(
              (chunk, chunkIndex) => {
                const tone = chunk.fg?.replace('ansi-', '').replace('-fg', '');
                return (
                  <span
                    key={chunkIndex}
                    data-tone={tone && TONES.has(tone) ? tone : undefined}
                    data-dim={chunk.decorations.includes('dim') ? 'true' : undefined}
                    data-bold={chunk.decorations.includes('bold') ? 'true' : undefined}
                  >
                    {chunk.content}
                  </span>
                );
              },
            )}
            {'\n'}
          </span>
        ))}
      </pre>
    </div>
  );
}
