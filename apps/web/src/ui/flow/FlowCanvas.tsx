import { ReactFlow } from '@xyflow/react';
import type { Edge, EdgeTypes, Node, NodeTypes } from '@xyflow/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useColorMode } from '../../app/colorMode.tsx';
import { FlowEdge } from './FlowEdge.tsx';
import { FlowRail } from './FlowRail.tsx';
import type { RailStep } from './FlowRail.tsx';
import styles from './flow.module.css';

const EDGE_TYPES: EdgeTypes = { flow: FlowEdge };
/** En dessous, le texte des nœuds deviendrait illisible : le graphe laisse la place à la voie verticale. */
export const MIN_READABLE_ZOOM = 0.8;
/** Marge autour du graphe ajusté à son cadre, en fraction de sa taille (`fitViewOptions.padding`). */
const FIT_PADDING = 0.04;

/** Une liaison du graphe, au même dessin partout : un tronçon de voie, que parcourt un flux quand il sert. */
export function flowEdge(
  id: string,
  source: string,
  target: string,
  data: Edge['data'] = {},
): Edge {
  return { id, source, target, type: 'flow', data, focusable: false };
}

/** Le graphe tient-il dans cette largeur sans descendre sous le zoom lisible ? */
export function fitsWide(width: number, naturalWidth: number): boolean {
  return width >= naturalWidth * (1 + FIT_PADDING) * MIN_READABLE_ZOOM;
}

/** Largeur du conteneur, lue avant le premier affichage puis suivie. */
function useWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Le graphe de factory-live, celui de la ligne d'usine comme celui d'une issue, sous deux formes :
 * - en largeur quand il tient à un zoom lisible : React Flow statique (ni zoom ni glisser ; son fond
 *   laisse passer le défilement de la page, à la souris comme au doigt) ;
 * - sinon (téléphone, fenêtre étroite) la voie verticale : mêmes arrêts et mêmes liaisons dans le flux
 *   de la page, où chaque étape montre son contenu en clair et se touche.
 * La page fournit les deux : nœuds et liaisons pour le graphe, étapes pour la voie.
 */
export function FlowView<N extends Node>({
  label,
  naturalWidth,
  height,
  nodes,
  edges,
  nodeTypes,
  steps,
  onNodeClick,
}: {
  label: string;
  /** Largeur du graphe à 100 % : en dessous de son zoom lisible, la voie prend le relais. */
  naturalWidth: number;
  /** Hauteur du graphe en largeur. */
  height: number;
  nodes: N[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  steps: readonly RailStep[];
  onNodeClick?: (id: string) => void;
}) {
  const { preference } = useColorMode();
  const [ref, width] = useWidth();
  const wide = width > 0 && fitsWide(width, naturalWidth);
  return (
    <div
      ref={ref}
      className={styles.canvas}
      style={wide ? { height } : undefined}
      role="group"
      aria-label={label}
      data-form={width === 0 ? undefined : wide ? 'graph' : 'rail'}
    >
      {width === 0 ? null : wide ? (
        <ReactFlow
          {...(onNodeClick ? { onNodeClick: (_event, node: N) => onNodeClick(node.id) } : {})}
          className={styles.flowRoot}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={EDGE_TYPES}
          colorMode={preference === 'system' ? 'system' : preference}
          fitView
          fitViewOptions={{ padding: FIT_PADDING, maxZoom: 1 }}
          minZoom={MIN_READABLE_ZOOM}
          maxZoom={1}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        />
      ) : (
        <FlowRail steps={steps} />
      )}
    </div>
  );
}
