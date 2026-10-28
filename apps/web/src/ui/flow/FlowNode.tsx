import type { Icon } from '@primer/octicons-react';
import { Handle, Position } from '@xyflow/react';
import type { CSSProperties, ReactNode } from 'react';
import styles from './flow.module.css';

export type FlowTone = 'accent' | 'success' | 'attention' | 'danger' | 'done' | 'muted';

/** Diamètre de l'arrêt (`--base-size-48`) : les liaisons partent et arrivent sur son bord. */
const STOP = 48;

/**
 * Un nœud du graphe, le même pour une station de la ligne d'usine et pour une carte d'une issue :
 * un arrêt rond (icône, couleur de l'état, anneau qui respire quand on y travaille), son nom, puis
 * son contenu. Les liaisons relient les arrêts entre eux, comme une voie.
 */
export function FlowNode({
  icon: NodeIcon,
  title,
  aside,
  tone,
  active = false,
  selected = false,
  vertical,
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
  vertical: boolean;
  titleLines?: 1 | 2;
  children?: ReactNode;
}) {
  const target: CSSProperties = vertical
    ? {}
    : { left: `calc(50% - ${STOP / 2}px)`, top: STOP / 2 };
  const source: CSSProperties = vertical
    ? {}
    : { left: `calc(50% + ${STOP / 2}px)`, right: 'auto', top: STOP / 2 };
  return (
    <div className={styles.node} data-selected={selected ? '' : undefined}>
      <Handle
        type="target"
        position={vertical ? Position.Top : Position.Left}
        className={styles.handle}
        style={target}
      />
      <span
        className={styles.stop}
        data-tone={tone}
        data-active={active ? '' : undefined}
        data-loop={active ? '' : undefined}
      >
        <NodeIcon size={24} />
        {aside ? <span className={styles.stopAside}>{aside}</span> : null}
      </span>
      <span className={styles.nodeTitle} data-lines={titleLines}>
        {title}
      </span>
      {children ? <div className={styles.nodeBody}>{children}</div> : null}
      <Handle
        type="source"
        position={vertical ? Position.Bottom : Position.Right}
        className={styles.handle}
        style={source}
      />
    </div>
  );
}
