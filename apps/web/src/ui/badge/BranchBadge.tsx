import { GitBranchIcon } from '@primer/octicons-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Badge } from './Badge.tsx';
import { hueOf } from './hues.ts';

/**
 * A branch: the word « branche » as the label, its name in a code font, in the hue of its repository
 * (neutral while the repository is not known).
 */
export function BranchBadge({ repo, name }: { repo?: string | undefined; name: string }) {
  const { t } = useI18n();
  return (
    <Badge
      {...(repo ? { hue: hueOf('repo', repo), description: t.badge.branchOf(repo, name) } : {})}
      label={t.badge.branch}
      labelIcon={GitBranchIcon}
      value={name}
      code
    />
  );
}
