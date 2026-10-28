import type { Icon } from '@primer/octicons-react';
import type { ReactNode } from 'react';
import styles from './flow.module.css';

export type FlowTone = 'accent' | 'success' | 'attention' | 'danger' | 'done' | 'muted';

/**
 * L'arrêt rond d'une étape sur la voie : icône, couleur de l'état de l'étape, et un compteur posé
 * dessus. Le travail en cours se lit sur les jobs de l'étape (leur icône tourne), pas sur l'arrêt.
 */
export function FlowStop({
  icon: StopIcon,
  tone,
  aside,
}: {
  icon: Icon;
  tone: FlowTone;
  aside?: ReactNode;
}) {
  return (
    <span className={styles.stop} data-tone={tone}>
      <StopIcon size={24} />
      {aside ? <span className={styles.stopAside}>{aside}</span> : null}
    </span>
  );
}
