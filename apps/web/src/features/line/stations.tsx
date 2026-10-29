import type { AgentActivity, IssueSummary, StationId, StationView } from '@factory-live/contracts';
import { CounterLabel } from '@primer/react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { AgentAvatar } from '../../ui/agents/AgentAvatar.tsx';
import type { FlowTone } from '../../ui/flow/FlowStop.tsx';
import styles from './line.module.css';

const AGENT_ORDER: Record<AgentActivity['state'], number> = {
  cli: 0,
  tool: 1,
  thinking: 2,
  blocked: 3,
  queued: 4,
  idle: 5,
};
const WORKING = new Set<AgentActivity['state']>(['thinking', 'tool', 'cli']);

/** La couleur de l'arrêt d'une station : ce qui t'attend d'abord, puis ce qui travaille. */
export function stationTone(
  station: StationId,
  agents: readonly AgentActivity[],
  issues: readonly IssueSummary[],
): FlowTone {
  if (issues.some((issue) => issue.status === 'blocked')) return 'danger';
  if (issues.some((issue) => issue.status === 'waiting_human')) return 'attention';
  if (agents.some((agent) => WORKING.has(agent.state))) return 'accent';
  if (station === 'done' && issues.length > 0) return 'done';
  return 'muted';
}

/** Le compteur d'issues posé sur l'arrêt ; il bat une fois quand une issue arrive. */
export function StationCounter({ count, arrived }: { count: number; arrived: boolean }) {
  const { t } = useI18n();
  return (
    <span className={styles.counter} data-arrived={arrived ? '' : undefined}>
      <CounterLabel aria-label={t.common.issueCount(count)}>{count}</CounterLabel>
    </span>
  );
}

/** L'équipe d'une station : un avatar par agent, en gris au repos, les plus occupés d'abord. */
export function StationCrew({
  station,
  agents,
}: {
  station: StationView;
  agents: readonly AgentActivity[];
}) {
  const { t, locale } = useI18n();
  const crew = station.profiles.map(
    (profile) =>
      agents.find((agent) => agent.profile === profile) ?? { profile, state: 'idle' as const },
  );
  if (crew.length === 0) return null;
  crew.sort((left, right) => AGENT_ORDER[left.state] - AGENT_ORDER[right.state]);
  return (
    <ul className={styles.crew} aria-label={t.line.crewOf(t.station[station.id])}>
      {crew.map((member) => (
        <li
          key={member.profile}
          className={styles.crewMember}
          data-idle={member.state === 'idle' ? '' : undefined}
          title={t.common.labelValue(
            member.profile,
            t.agentState[member.state].toLocaleLowerCase(locale),
          )}
        >
          <AgentAvatar profile={member.profile} size={20} />
        </li>
      ))}
    </ul>
  );
}
