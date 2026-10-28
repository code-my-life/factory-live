import type { CardView } from '@factory-live/contracts';

/** « impl claude-cockpit#71 : regrouper… » → « regrouper… » : le nœud affiche déjà l'issue et le type. */
export function shortCardTitle(card: CardView): string {
  const stripped = card.title.replace(/^(impl|release|brief)?\s*[\w.-]+#\d+\s*:?\s*/i, '').trim();
  if (stripped) return stripped;
  return card.kind === 'release' ? 'Merge, tag et surveillance de main' : card.title;
}
