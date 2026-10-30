import {
  CommentIcon,
  HubotIcon,
  MarkGithubIcon,
  ProjectIcon,
  PulseIcon,
} from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Badge } from './Badge.tsx';
import { hueOf } from './hues.ts';

/** The sources of a fact: the kanban, Hermes, GitHub, a comment, factory-live. */
export type SourceKind = 'kanban' | 'hermes' | 'github' | 'comment' | 'factory-live';

const SOURCE_ICON: Record<SourceKind, Icon> = {
  kanban: ProjectIcon,
  hermes: HubotIcon,
  github: MarkGithubIcon,
  comment: CommentIcon,
  'factory-live': PulseIcon,
};

/** A source: the source's icon and the word « source » as the label, its name as the value. */
export function SourceBadge({ kind, name }: { kind: SourceKind; name: string }) {
  const { t } = useI18n();
  return (
    <Badge
      label={t.badge.source}
      labelIcon={SOURCE_ICON[kind]}
      value={name}
      hue={hueOf('source', kind)}
    />
  );
}
