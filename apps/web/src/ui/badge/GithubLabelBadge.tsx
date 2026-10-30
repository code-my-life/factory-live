import type { IssueLabel } from '@factory-live/contracts';
import { TagIcon } from '@primer/octicons-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Badge } from './Badge.tsx';

/** A GitHub label: the `tag` icon and « étiquette » as the label, its name tinted with its GitHub color. */
export function GithubLabelBadge({ label }: { label: IssueLabel }) {
  const { t } = useI18n();
  return (
    <Badge
      label={t.badge.githubLabel}
      labelIcon={TagIcon}
      value={label.name}
      githubColor={label.color}
    />
  );
}
