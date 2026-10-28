import type { AgentActivity, CardView } from '@factory-live/contracts';
import dagre from '@dagrejs/dagre';
import type { Edge } from '@xyflow/react';
import { useMemo } from 'react';
import { FlowView, flowEdge } from '../../ui/flow/FlowCanvas.tsx';
import type { RailStep } from '../../ui/flow/FlowRail.tsx';
import { CARD_STATUS_LABEL } from '../../ui/vocabulary.ts';
import {
  CardNode,
  CardSummary,
  KIND_ICON,
  NODE_HEIGHT,
  NODE_WIDTH,
  STATUS_TONE,
} from './CardNode.tsx';
import type { CardFlowNode } from './CardNode.tsx';
import { shortCardTitle } from './cardText.ts';

const NODE_TYPES = { card: CardNode };
const MARGIN = 8;

function layout(cards: readonly CardView[]) {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 72, marginx: MARGIN, marginy: MARGIN });
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
    width = Math.max(width, x + NODE_WIDTH + MARGIN);
    height = Math.max(height, y + NODE_HEIGHT);
  }
  return { positions, width, height };
}

/**
 * L'ordre des cartes sur la voie verticale : par profondeur (une carte vient après ses parents), puis
 * dans l'ordre de l'issue. Une carte de même profondeur que la précédente est menée en parallèle.
 */
export function railOrder(cards: readonly CardView[]): { card: CardView; parallel: boolean }[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const depths = new Map<string, number>();
  const depth = (card: CardView, path: ReadonlySet<string>): number => {
    const known = depths.get(card.id);
    if (known !== undefined) return known;
    const parents = card.parents
      .filter((parent) => !path.has(parent))
      .flatMap((parent) => byId.get(parent) ?? []);
    const next = new Set(path).add(card.id);
    const value =
      parents.length === 0 ? 0 : 1 + Math.max(...parents.map((parent) => depth(parent, next)));
    depths.set(card.id, value);
    return value;
  };
  const ordered = cards
    .map((card, index) => ({ card, index, depth: depth(card, new Set()) }))
    .sort((left, right) => left.depth - right.depth || left.index - right.index);
  return ordered.map(({ card, depth: level }, index) => ({
    card,
    parallel: index > 0 && ordered[index - 1]?.depth === level,
  }));
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
  const { positions, width, height } = useMemo(() => layout(cards), [cards]);
  const agentOf = (card: CardView) => agents.find((agent) => agent.cardId === card.id) ?? null;

  const nodes: CardFlowNode[] = cards.map((card) => ({
    id: card.id,
    type: 'card',
    position: positions.get(card.id) ?? { x: 0, y: 0 },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    data: { card, agent: agentOf(card), selected: card.id === selectedCardId },
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

  const order = railOrder(cards);
  const steps: RailStep[] = order.map(({ card, parallel }, index) => {
    const following = order[index + 1]?.card;
    return {
      id: card.id,
      icon: KIND_ICON[card.kind],
      tone: STATUS_TONE[card.status],
      active: card.status === 'running',
      title: shortCardTitle(card),
      meta: CARD_STATUS_LABEL[card.status],
      children: <CardSummary card={card} agent={agentOf(card)} align="start" />,
      ...(following
        ? {
            next: {
              flowing: following.status === 'running' && following.parents.includes(card.id),
            },
          }
        : {}),
      parallel,
      selected: card.id === selectedCardId,
      onSelect: () => onSelectCard(card.id),
    };
  });

  return (
    <FlowView
      label="Graphe des cartes de l’issue"
      naturalWidth={width}
      height={Math.max(height + 16, NODE_HEIGHT + 16)}
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      steps={steps}
      onNodeClick={onSelectCard}
    />
  );
}
