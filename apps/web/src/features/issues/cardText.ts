import type { CardView } from '@factory-live/contracts';
import type { Messages } from '../../i18n/fr.ts';

/** « impl claude-cockpit#71 : regrouper… » → « regrouper… » : le nœud affiche déjà l'issue et le type. */
export function shortCardTitle(card: CardView, t: Messages): string {
  const stripped = card.title.replace(/^(impl|release|brief)?\s*[\w.-]+#\d+\s*:?\s*/i, '').trim();
  if (stripped) return stripped;
  return card.kind === 'release' ? t.issue.releaseTitle : card.title;
}
