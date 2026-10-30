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
import { hueOf } from './hues.ts';

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

/**
 * A kanban card: its type as the label (brief, impl, release…), its identifier as the value, in the
 * hue of its type (`other`, grey, when the type is not known).
 */
export function CardBadge({ kind, id }: { kind?: CardKind; id: string }) {
  return (
    <Badge
      {...(kind ? { label: kind, labelIcon: KIND_ICON[kind] } : {})}
      value={id}
      hue={hueOf('card', kind ?? 'other')}
      code
    />
  );
}
