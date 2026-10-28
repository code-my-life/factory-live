import type { AgentActivity, CardView } from '@factory-live/contracts';
import dagre from '@dagrejs/dagre';
import { ReactFlow } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useColorMode } from '../../app/colorMode.tsx';
import { CardNode, NODE_HEIGHT, NODE_WIDTH } from './CardNode.tsx';
import type { CardFlowNode } from './CardNode.tsx';
import { CARD_STATUS_LABEL, shortCardTitle } from './cardText.ts';
import styles from './IssueGraph.module.css';

const NODE_TYPES = { card: CardNode };
const VERTICAL_BELOW = 720;

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function layout(cards: readonly CardView[], vertical: boolean) {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: vertical ? 'TB' : 'LR',
    nodesep: 32,
    ranksep: vertical ? 48 : 72,
    marginx: 8,
    marginy: 8,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const card of cards) graph.setNode(card.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const card of cards) {
    for (const parent of card.parents)
      if (cards.some((candidate) => candidate.id === parent)) graph.setEdge(parent, card.id);
  }
  dagre.layout(graph);
  const positions = new Map<string, { x: number; y: number }>();
  let width = 0;
  let height = 0;
  for (const card of cards) {
    const node = graph.node(card.id) as { x: number; y: number };
    const x = node.x - NODE_WIDTH / 2;
    const y = node.y - NODE_HEIGHT / 2;
    positions.set(card.id, { x, y });
    width = Math.max(width, x + NODE_WIDTH);
    height = Math.max(height, y + NODE_HEIGHT);
  }
  return { positions, width, height };
}

/** Le graphe des cartes d'une issue (brief → impl → release), statique : il ne capture jamais le défilement. */
export function IssueGraph({
  cards,
  agents,
  selectedCardId,
  onSelectCard,
}: {
  cards: readonly CardView[];
  agents: readonly AgentActivity[];
  selectedCardId: string | null;
  onSelectCard: (cardId: string) => void;
}) {
  const [containerRef, width] = useWidth();
  const { preference } = useColorMode();
  const vertical = width > 0 && width < VERTICAL_BELOW;
  const { positions, height } = useMemo(() => layout(cards, vertical), [cards, vertical]);

  const nodes: CardFlowNode[] = cards.map((card) => ({
    id: card.id,
    type: 'card',
    position: positions.get(card.id) ?? { x: 0, y: 0 },
    data: {
      card,
      agent: agents.find((agent) => agent.cardId === card.id) ?? null,
      vertical,
      selected: card.id === selectedCardId,
    },
    ariaLabel: `${card.kind} ${shortCardTitle(card)}, ${CARD_STATUS_LABEL[card.status]}, ${card.assignee}`,
    draggable: false,
    connectable: false,
  }));

  const edges: Edge[] = cards.flatMap((card) =>
    card.parents
      .filter((parent) => cards.some((candidate) => candidate.id === parent))
      .map((parent) => ({
        id: `${parent}->${card.id}`,
        source: parent,
        target: card.id,
        type: 'smoothstep',
        animated: card.status === 'running' || card.status === 'review',
        className: styles.edge,
      })),
  );

  return (
    <div
      ref={containerRef}
      className={styles.graph}
      style={{ height: Math.max(height + 32, NODE_HEIGHT + 32) }}
    >
      {width > 0 ? (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          colorMode={preference === 'system' ? 'system' : preference}
          fitView
          fitViewOptions={{ padding: 0.04, maxZoom: 1 }}
          minZoom={0.4}
          maxZoom={1}
          nodesDraggable={false}
          nodesConnectable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => onSelectCard(node.id)}
        />
      ) : null}
    </div>
  );
}
