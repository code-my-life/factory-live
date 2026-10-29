import type { IssueKey } from '@factory-live/contracts';
import { issuePath } from '../paths.ts';
import { Badge } from './Badge.tsx';

/**
 * Une issue, partout le même badge : son dépôt en étiquette, son numéro en valeur. Le numéro reste
 * entier, c'est le dépôt qui se tronque. Lien vers la page de l'issue, sauf dans une boîte qui y mène déjà.
 */
export function IssueBadge({ issueKey, link = false }: { issueKey: IssueKey; link?: boolean }) {
  const hash = issueKey.lastIndexOf('#');
  return (
    <Badge
      {...(link ? { to: issuePath(issueKey) } : {})}
      label={issueKey.slice(0, hash)}
      value={issueKey.slice(hash)}
      code
      yields="label"
      description={issueKey}
    />
  );
}
