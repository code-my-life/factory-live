import type { CardKind } from '@factory-live/contracts';
import { Badge } from './Badge.tsx';

/** Une carte du kanban : son type en étiquette (brief, impl, release…), son identifiant en valeur. */
export function CardBadge({ kind, id }: { kind?: CardKind; id: string }) {
  return <Badge {...(kind ? { label: kind } : {})} value={id} code />;
}
