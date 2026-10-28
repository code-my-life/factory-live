import type { AgentActivity, CardView } from '@factory-live/contracts';
import dagre from '@dagrejs/dagre';
import type { Edge } from '@xyflow/react';
import { useMemo } from 'react';
import { FlowCanvas, flowEdge, useFlowFrame } from '../../ui/flow/FlowCanvas.tsx';
import { CARD_STATUS_LABEL } from '../../ui/vocabulary.ts';
import { CardNode, NODE_HEIGHT, NODE_WIDTH } from './CardNode.tsx';
import type { CardFlowNode } from './CardNode.tsx';
import { shortCardTitle } from './cardText.ts';

const NODE_TYPES = { card: CardNode };

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
  let height = 0;
  for (const card of cards) {
    const node = graph.node(card.id) as { x: number; y: number };
    const y = node.y - NODE_HEIGHT / 2;
    positions.set(card.id, { x: node.x - NODE_WIDTH / 2, y });
    height = Math.max(height, y + NODE_HEIGHT);
  }
  return { positions, height };
}

/** Le graphe des cartes d'une issue (brief, impl, release), dessiné comme la ligne d'usine. */
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
  const [containerRef, frame] = useFlowFrame();
  const { positions, height } = useMemo(
    () => layout(cards, frame.vertical),
    [cards, frame.vertical],
  );

  const nodes: CardFlowNode[] = cards.map((card) => ({
    id: card.id,
    type: 'card',
    position: positions.get(card.id) ?? { x: 0, y: 0 },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    data: {
      card,
      agent: agents.find((agent) => agent.cardId === card.id) ?? null,
      vertical: frame.vertical,
      selected: card.id === selectedCardId,
    },
    ariaLabel: `${card.kind} ${shortCardTitle(card)}, ${CARD_STATUS_LABEL[card.status]}, ${card.assignee}`,
    draggable: false,
    connectable: false,
  }));

  const edges: Edge[] = cards.flatMap((card) =>
    card.parents
      .filter((parent) => cards.some((candidate) => candidate.id === parent))
      .map((parent) =>
        flowEdge(`${parent}->${card.id}`, parent, card.id, { flowing: card.status === 'running' }),
      ),
  );

  return (
    <FlowCanvas
      containerRef={containerRef}
      frame={frame}
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      height={Math.max(height + 16, NODE_HEIGHT + 16)}
      label="Graphe des cartes de l’issue"
      onNodeClick={onSelectCard}
    />
  );
}
