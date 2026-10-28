import { ReactFlow } from '@xyflow/react';
import type { Edge, EdgeTypes, Node, NodeTypes } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useColorMode } from '../../app/colorMode.tsx';
import { FlowEdge } from './FlowEdge.tsx';
import styles from './flow.module.css';

const EDGE_TYPES: EdgeTypes = { flow: FlowEdge };
const VERTICAL_BELOW = 720;

export interface FlowFrame {
  width: number;
  /** Sous 720 px de large, le graphe se lit de haut en bas (iPhone). */
  vertical: boolean;
}

/**
 * Largeur disponible du graphe, mesurée pour choisir le sens de lecture avant de placer les nœuds.
 * Rend la référence à poser sur le conteneur et, à part, ce qu'on en a mesuré.
 */
export function useFlowFrame(): [RefObject<HTMLDivElement | null>, FlowFrame] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, { width, vertical: width > 0 && width < VERTICAL_BELOW }];
}

/** Une liaison du graphe, au même dessin partout : un tronçon de voie, que parcourt un flux quand il sert. */
export function flowEdge(
  id: string,
  source: string,
  target: string,
  data: Edge['data'] = {},
): Edge {
  return { id, source, target, type: 'flow', data, focusable: false };
}

/**
 * Le graphe de factory-live, celui de la ligne d'usine comme celui d'une issue : statique (ni zoom
 * ni glisser, il ne capture jamais le défilement de la page), aux couleurs du thème Primer.
 */
export function FlowCanvas<N extends Node>({
  containerRef,
  frame,
  nodes,
  edges,
  nodeTypes,
  height,
  label,
  onNodeClick,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  frame: FlowFrame;
  nodes: N[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  height: number;
  label: string;
  onNodeClick?: (id: string) => void;
}) {
  const { preference } = useColorMode();
  return (
    <div
      ref={containerRef}
      className={styles.canvas}
      style={{ height }}
      role="group"
      aria-label={label}
    >
      {frame.width > 0 ? (
        <ReactFlow
          {...(onNodeClick ? { onNodeClick: (_event, node: N) => onNodeClick(node.id) } : {})}
          className={styles.flowRoot}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={EDGE_TYPES}
          colorMode={preference === 'system' ? 'system' : preference}
          fitView
          fitViewOptions={{ padding: 0.04, maxZoom: 1 }}
          minZoom={0.3}
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
      ) : null}
    </div>
  );
}
