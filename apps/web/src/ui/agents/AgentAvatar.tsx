import type { AgentState } from '@factory-live/contracts';
import { Avatar } from '@primer/react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { agentAvatarUri } from './avatar.ts';
import styles from './AgentAvatar.module.css';

const WORKING = new Set<AgentState>(['thinking', 'tool', 'cli']);

/**
 * L'avatar d'un agent, partout le même : ligne d'usine, graphe d'une issue, timeline, interventions.
 * L'anneau dit son état (au travail, en file, bloqué) ; il pulse tant que l'agent travaille, sauf si
 * les animations sont coupées. Sans nom affiché à côté, le texte alternatif nomme l'agent et son état.
 */
export function AgentAvatar({
  profile,
  size = 20,
  state,
  named = false,
}: {
  profile: string;
  size?: number;
  state?: AgentState;
  /** Vrai quand le nom de l'agent est écrit juste à côté : l'image devient décorative. */
  named?: boolean;
}) {
  const { t, locale } = useI18n();
  const label = state ? `${profile}, ${t.agentState[state].toLocaleLowerCase(locale)}` : profile;
  return (
    <span
      className={styles.frame}
      data-state={state}
      data-loop={state && WORKING.has(state) ? '' : undefined}
    >
      <Avatar
        square
        src={agentAvatarUri(profile)}
        size={size}
        alt={named ? '' : label}
        className={styles.avatar}
      />
    </span>
  );
}
