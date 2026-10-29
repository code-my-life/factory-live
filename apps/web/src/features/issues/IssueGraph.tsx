import type { AgentActivity, CardView } from '@factory-live/contracts';
import { CounterLabel } from '@primer/react';
import { LayoutGroup } from 'motion/react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { FlowLine } from '../../ui/flow/FlowLine.tsx';
import type { LineStep } from '../../ui/flow/FlowLine.tsx';
import type { FlowTone } from '../../ui/flow/FlowStop.tsx';
import { useNow } from '../../ui/useNow.ts';
import { JobList } from '../../ui/work/JobBox.tsx';
import { KIND_ICON } from '../../ui/badge/CardBadge.tsx';
import { CardJob } from './CardJob.tsx';

/**
 * Les étapes d'une issue : ses cartes rangées par profondeur (une carte vient après ses parents),
 * dans l'ordre de l'issue. Les cartes d'un même rang sont menées en même temps.
 */
export function cardStages(cards: readonly CardView[]): CardView[][] {
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
  const stages: CardView[][] = [];
  for (const card of cards) (stages[depth(card, new Set())] ??= []).push(card);
  return stages.filter((stage) => stage.length > 0);
}

/** La couleur de l'arrêt d'un rang : ce qui bloque, ce qui t'attend, ce qui travaille, ce qui est fait. */
function stageTone(cards: readonly CardView[]): FlowTone {
  if (cards.some((card) => card.status === 'blocked')) return 'danger';
  if (cards.some((card) => card.status === 'triage')) return 'attention';
  if (cards.some((card) => card.status === 'running')) return 'accent';
  if (cards.every((card) => card.status === 'done')) return 'success';
  if (cards.some((card) => card.status === 'review')) return 'done';
  return 'muted';
}

/** Le graphe des cartes d'une issue (brief, impl, release), sur la même voie que la ligne d'usine. */
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
  const { t } = useI18n();
  const now = useNow();
  const stages = cardStages(cards);
  const steps: LineStep[] = stages.map((stage, index) => {
    const title = [...new Set(stage.map((card) => t.cardKind[card.kind]))].join(' · ');
    const following = stages[index + 1];
    return {
      id: stage[0]?.id ?? String(index),
      icon: KIND_ICON[stage[0]?.kind ?? 'other'],
      tone: stageTone(stage),
      title,
      ...(stage.length > 1
        ? {
            aside: (
              <CounterLabel aria-label={t.common.cardCount(stage.length)}>
                {stage.length}
              </CounterLabel>
            ),
          }
        : {}),
      flowing: following ? following.some((card) => card.status === 'running') : false,
      children: (
        <JobList label={t.issue.cardsOf(title)}>
          {stage.map((card) => (
            <CardJob
              key={card.id}
              card={card}
              agent={agents.find((agent) => agent.cardId === card.id) ?? null}
              selected={card.id === selectedCardId}
              onSelect={() => onSelectCard(card.id)}
              now={now}
            />
          ))}
        </JobList>
      ),
    };
  });
  return (
    <LayoutGroup id="cartes">
      <FlowLine steps={steps} label={t.issue.graph} columnMin={12} />
    </LayoutGroup>
  );
}
