import type { Icon } from '@primer/octicons-react';
import { Handle, Position } from '@xyflow/react';
import type { CSSProperties, ReactNode } from 'react';
import styles from './flow.module.css';

export type FlowTone = 'accent' | 'success' | 'attention' | 'danger' | 'done' | 'muted';

/** Diamètre de l'arrêt (`--base-size-48`) : les liaisons partent et arrivent sur son bord. */
const STOP = 48;
const TARGET: CSSProperties = { left: `calc(50% - ${STOP / 2}px)`, top: STOP / 2 };
const SOURCE: CSSProperties = { left: `calc(50% + ${STOP / 2}px)`, right: 'auto', top: STOP / 2 };

/**
 * L'arrêt rond d'une étape : icône, couleur de l'état, anneau qui respire quand on y travaille, et
 * un compteur posé dessus. Le même dans le graphe (grand écran) et sur la voie verticale (téléphone).
 */
export function FlowStop({
  icon: StopIcon,
  tone,
  active = false,
  aside,
}: {
  icon: Icon;
  tone: FlowTone;
  active?: boolean;
  aside?: ReactNode;
}) {
  return (
    <span
      className={styles.stop}
      data-tone={tone}
      data-active={active ? '' : undefined}
      data-loop={active ? '' : undefined}
    >
      <StopIcon size={24} />
      {aside ? <span className={styles.stopAside}>{aside}</span> : null}
    </span>
  );
}

/**
 * Un nœud du graphe en largeur, le même pour une station de la ligne d'usine et pour une carte d'une
 * issue : un arrêt rond, son nom, puis son contenu. Les liaisons relient les arrêts par leur bord,
 * comme une voie (la voie verticale du téléphone reprend le même arrêt, voir `FlowRail`).
 */
export function FlowNode({
  icon,
  title,
  aside,
  tone,
  active = false,
  selected = false,
  titleLines = 1,
  children,
}: {
  icon: Icon;
  title: string;
  /** Compteur ou état, posé sur l'arrêt. */
  aside?: ReactNode;
  tone: FlowTone;
  /** Du travail en cours ici : l'arrêt prend l'accent et son anneau respire. */
  active?: boolean;
  selected?: boolean;
  titleLines?: 1 | 2;
  children?: ReactNode;
}) {
  return (
    <div className={styles.node} data-selected={selected ? '' : undefined}>
      <Handle type="target" position={Position.Left} className={styles.handle} style={TARGET} />
      <FlowStop icon={icon} tone={tone} active={active} aside={aside} />
      <span className={styles.nodeTitle} data-lines={titleLines}>
        {title}
      </span>
      {children ? <div className={styles.nodeBody}>{children}</div> : null}
      <Handle type="source" position={Position.Right} className={styles.handle} style={SOURCE} />
    </div>
  );
}
