import type { IssueKey, IssueStatus } from '@factory-live/contracts';
import { IssueClosedIcon, IssueOpenedIcon, SkipIcon } from '@primer/octicons-react';
import { issuePath } from '../paths.ts';
import { Badge } from './Badge.tsx';

/** L'état GitHub d'une issue : ouverte, fermée (faite), ou arrêtée (abandonnée). */
export type IssueState = 'open' | 'closed' | 'stopped';

/** L'état GitHub d'une issue de la factory : ouverte tant qu'elle n'est ni terminée ni arrêtée. */
export function issueState(status: IssueStatus): IssueState {
  return status === 'done' ? 'closed' : status === 'stopped' ? 'stopped' : 'open';
}

/** L'icône et la couleur d'une issue, comme sur GitHub : verte ouverte, violette fermée, grise arrêtée. */
const STATE_ICON = {
  open: { icon: IssueOpenedIcon, tone: 'success' },
  closed: { icon: IssueClosedIcon, tone: 'done' },
  stopped: { icon: SkipIcon, tone: undefined },
} as const;

/**
 * Une issue, partout le même badge : l'icône d'issue de GitHub et son dépôt en étiquette, son numéro
 * en valeur. Le numéro reste entier, c'est le dépôt qui se tronque. L'icône prend la couleur de l'état
 * quand on le connaît ; dans une boîte de job, dont la tête montre déjà l'état, le badge s'en passe.
 * Lien vers la page de l'issue, sauf dans une boîte qui y mène déjà.
 */
export function IssueBadge({
  issueKey,
  state,
  icon = true,
  link = false,
}: {
  issueKey: IssueKey;
  state?: IssueState;
  icon?: boolean;
  link?: boolean;
}) {
  const hash = issueKey.lastIndexOf('#');
  const mark = STATE_ICON[state ?? 'open'];
  return (
    <Badge
      {...(link ? { to: issuePath(issueKey) } : {})}
      {...(icon && state && mark.tone ? { labelIconTone: mark.tone } : {})}
      {...(icon ? { labelIcon: mark.icon } : {})}
      label={issueKey.slice(0, hash)}
      value={issueKey.slice(hash)}
      code
      yields="label"
      description={issueKey}
    />
  );
}
