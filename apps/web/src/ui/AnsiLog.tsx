import Anser from 'anser';
import { useLayoutEffect, useRef } from 'react';
import styles from './AnsiLog.module.css';

const TONES = new Set(['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']);
/** À moins de cette distance du bas, le log suit les nouvelles lignes ; plus haut, on lit et rien ne bouge. */
const FOLLOW_SLACK_PX = 24;

/**
 * Log brut d'un worker, comme un terminal : il s'ouvre sur la fin et suit les nouvelles lignes tant
 * qu'on ne remonte pas lire. Couleurs ANSI rendues avec les jetons du thème, texte jamais interprété en HTML.
 */
export function AnsiLog({ lines, label }: { lines: readonly string[]; label: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    const element = frame.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [lines]);
  return (
    <div
      ref={frame}
      className={styles.frame}
      role="log"
      aria-label={label}
      tabIndex={0}
      onScroll={(event) => {
        const element = event.currentTarget;
        following.current =
          element.scrollHeight - element.scrollTop - element.clientHeight <= FOLLOW_SLACK_PX;
      }}
    >
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
