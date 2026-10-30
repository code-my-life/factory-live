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
 * La CI d'une PR, le badge le plus classique de shields.io : le logo de GitHub Actions en étiquette,
 * l'état peint de sa couleur franche. Rien quand la PR n'a pas de workflow.
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
      solid
      // The "CI" label takes no grey background: it rests on the card background, only
      // the solid-color value keeps its color.
      labelBackground="transparent"
      icon={CHECKS[checks].icon}
    />
  );
}
