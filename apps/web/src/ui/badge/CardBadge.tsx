import type { CardKind } from '@factory-live/contracts';
import {
  BugIcon,
  CodeIcon,
  EyeIcon,
  RocketIcon,
  ToolsIcon,
  WorkflowIcon,
} from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';
import { Badge } from './Badge.tsx';

/** L'icône d'un type de carte : la même sur son badge et sur l'étape du graphe de l'issue. */
export const KIND_ICON: Record<CardKind, Icon> = {
  brief: WorkflowIcon,
  impl: CodeIcon,
  release: RocketIcon,
  diagnostic: BugIcon,
  watch: EyeIcon,
  onboarding: ToolsIcon,
  other: ToolsIcon,
};

/** Une carte du kanban : son type en étiquette (brief, impl, release…), son identifiant en valeur. */
export function CardBadge({ kind, id }: { kind?: CardKind; id: string }) {
  return <Badge {...(kind ? { label: kind, labelIcon: KIND_ICON[kind] } : {})} value={id} code />;
}
