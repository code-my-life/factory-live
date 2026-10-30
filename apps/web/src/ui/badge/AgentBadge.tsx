import { useI18n } from '../../i18n/I18nProvider.tsx';
import { agentAvatarUri } from '../agents/avatar.ts';
import { Badge } from './Badge.tsx';
import { hueOf } from './hues.ts';

/** An agent: its avatar and the word « agent » as the label, its name as the value, in the hue of its avatar. */
export function AgentBadge({ profile }: { profile: string }) {
  const { t } = useI18n();
  return (
    <Badge
      label={t.badge.agent}
      labelImage={agentAvatarUri(profile)}
      value={profile}
      hue={hueOf('agent', profile)}
    />
  );
}
