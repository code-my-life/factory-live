import type { ChecksState } from '@factory-live/contracts';
import { CheckIcon, DotFillIcon, XIcon } from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Badge } from './Badge.tsx';
import type { BadgeTone } from './Badge.tsx';
import { CHECKS_MARK } from './marks.ts';

/** Couleurs et icônes des workflows, comme sur GitHub : en cours (jaune), réussie, en échec. */
const CHECKS: Record<Exclude<ChecksState, 'none'>, { tone: BadgeTone; icon: Icon }> = {
  pending: { tone: 'attention', icon: DotFillIcon },
  success: { tone: 'success', icon: CheckIcon },
  failure: { tone: 'danger', icon: XIcon },
};

/**
 * A PR's CI, the most classic shields.io badge: the GitHub Actions logo and « CI » on
 * the grey label, the state tinted with its color (its role's « muted » tokens), like any badge.
 * Nothing when the PR has no workflow.
 */
export function ChecksBadge({ checks }: { checks: ChecksState }) {
  const { t } = useI18n();
  if (checks === 'none') return null;
  return (
    <Badge
      label={t.pr.ciLabel}
      labelIcon={CHECKS_MARK}
      value={t.pr.ci[checks]}
      tone={CHECKS[checks].tone}
      icon={CHECKS[checks].icon}
    />
  );
}
