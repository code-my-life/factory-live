import { BookIcon } from '@primer/octicons-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Badge } from './Badge.tsx';
import { hueOf } from './hues.ts';

/** A skill of an agent or a card: the icon and the word « skill » as the label, its name as the value. */
export function SkillBadge({ name }: { name: string }) {
  const { t } = useI18n();
  return (
    <Badge label={t.badge.skill} labelIcon={BookIcon} value={name} hue={hueOf('skill', name)} />
  );
}
