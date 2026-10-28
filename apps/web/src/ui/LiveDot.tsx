import styles from './LiveDot.module.css';

export type DotTone = 'success' | 'accent' | 'attention' | 'danger' | 'done' | 'muted';

/** Pastille d'état ; `pulse` signale un travail en cours (coupé si l'utilisateur réduit les animations). */
export function LiveDot({
  tone,
  pulse = false,
  label,
}: {
  tone: DotTone;
  pulse?: boolean;
  label?: string;
}) {
  return (
    <span
      className={styles.dot}
      data-tone={tone}
      data-pulse={pulse ? 'true' : undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
