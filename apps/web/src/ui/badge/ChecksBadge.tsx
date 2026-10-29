import type { ChecksState } from '@factory-live/contracts';
import { CheckIcon, DotFillIcon, XIcon } from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Badge } from './Badge.tsx';
import type { BadgeTone } from './Badge.tsx';

/** Couleurs et icônes des workflows, comme sur GitHub : en cours (jaune), réussie, en échec. */
const CHECKS: Record<Exclude<ChecksState, 'none'>, { tone: BadgeTone; icon: Icon }> = {
  pending: { tone: 'attention', icon: DotFillIcon },
  success: { tone: 'success', icon: CheckIcon },
  failure: { tone: 'danger', icon: XIcon },
};

/** La CI d'une PR, le badge le plus classique de shields.io : rien quand la PR n'a pas de workflow. */
export function ChecksBadge({ checks }: { checks: ChecksState }) {
  const { t } = useI18n();
  if (checks === 'none') return null;
  return (
    <Badge
      label={t.pr.ciLabel}
      value={t.pr.ci[checks]}
      tone={CHECKS[checks].tone}
      icon={CHECKS[checks].icon}
    />
  );
}
