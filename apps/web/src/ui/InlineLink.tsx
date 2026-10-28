import { Link as PrimerLink } from '@primer/react';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';

/**
 * Un lien interne posé dans une phrase : souligné (Primer, `inline`), pas seulement coloré, pour
 * qu'on le repère sans percevoir les couleurs (WCAG 1.4.1, règle axe `link-in-text-block`).
 */
export function InlineLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <PrimerLink as={RouterLink} to={to} inline>
      {children}
    </PrimerLink>
  );
}
