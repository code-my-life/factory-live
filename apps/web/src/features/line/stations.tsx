import type { AgentActivity, IssueSummary, StationId, StationView } from '@factory-live/contracts';
import {
  BlockedIcon,
  CheckCircleIcon,
  CodeIcon,
  IssueOpenedIcon,
  RocketIcon,
  ShieldCheckIcon,
  WorkflowIcon,
} from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';
import { CounterLabel } from '@primer/react';
import { AgentAvatar } from '../../ui/agents/AgentAvatar.tsx';
import type { FlowTone } from '../../ui/flow/FlowStop.tsx';
import { AGENT_STATE_LABEL, STATION_LABEL } from '../../ui/vocabulary.ts';
import styles from './line.module.css';

export const STATION_ICON: Record<StationId, Icon> = {
  intake: IssueOpenedIcon,
  brief: WorkflowIcon,
  implementation: CodeIcon,
  gate: ShieldCheckIcon,
  release: RocketIcon,
  done: CheckCircleIcon,
  stopped: BlockedIcon,
  side: WorkflowIcon,
};

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
  return (
    <span className={styles.counter} data-arrived={arrived ? '' : undefined}>
      <CounterLabel aria-label={`${count} issue${count > 1 ? 's' : ''}`}>{count}</CounterLabel>
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
  const crew = station.profiles.map(
    (profile) =>
      agents.find((agent) => agent.profile === profile) ?? { profile, state: 'idle' as const },
  );
  if (crew.length === 0) return null;
  crew.sort((left, right) => AGENT_ORDER[left.state] - AGENT_ORDER[right.state]);
  return (
    <ul className={styles.crew} aria-label={`Agents de l’étape ${STATION_LABEL[station.id]}`}>
      {crew.map((member) => (
        <li
          key={member.profile}
          className={styles.crewMember}
          data-idle={member.state === 'idle' ? '' : undefined}
          title={`${member.profile} : ${AGENT_STATE_LABEL[member.state].toLowerCase()}`}
        >
          <AgentAvatar profile={member.profile} size={20} />
        </li>
      ))}
    </ul>
  );
}
