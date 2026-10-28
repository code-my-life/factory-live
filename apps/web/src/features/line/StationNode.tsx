import type { AgentActivity, IssueSummary, StationId, StationView } from '@factory-live/contracts';
import {
  BellIcon,
  BlockedIcon,
  CheckCircleIcon,
  ClockIcon,
  CodeIcon,
  DotFillIcon,
  IssueOpenedIcon,
  RocketIcon,
  ShieldCheckIcon,
  WorkflowIcon,
} from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';
import { CounterLabel, Token } from '@primer/react';
import type { Node, NodeProps } from '@xyflow/react';
import { useNavigate } from 'react-router';
import { AgentAvatar } from '../../ui/agents/AgentAvatar.tsx';
import { FlowNode } from '../../ui/flow/FlowNode.tsx';
import type { FlowTone } from '../../ui/flow/FlowNode.tsx';
import { issuePath } from '../../ui/paths.ts';
import { AGENT_STATE_LABEL, ISSUE_STATUS_LABEL, STATION_LABEL } from '../../ui/vocabulary.ts';
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

const ISSUE_ICON: Record<IssueSummary['status'], Icon> = {
  active: DotFillIcon,
  queued: ClockIcon,
  waiting_human: BellIcon,
  blocked: BlockedIcon,
  done: CheckCircleIcon,
  stopped: BlockedIcon,
};

const ISSUE_ORDER: Record<IssueSummary['status'], number> = {
  waiting_human: 0,
  blocked: 1,
  active: 2,
  queued: 3,
  done: 4,
  stopped: 5,
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
const ISSUES_SHOWN = 3;

export interface StationNodeData extends Record<string, unknown> {
  station: StationView;
  agents: readonly AgentActivity[];
  issues: readonly IssueSummary[];
  vertical: boolean;
  /** Une issue vient d'arriver : le compteur le signale une fois. */
  arrived: boolean;
}

export type StationFlowNode = Node<StationNodeData, 'station'>;

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

/** Une station de la ligne : qui y travaille (avatars), combien d'issues, lesquelles. Le détail est sous le graphe. */
export function StationNode({ data }: NodeProps<StationFlowNode>) {
  const { station, agents, issues, vertical, arrived } = data;
  const navigate = useNavigate();
  const tone = stationTone(station.id, agents, issues);
  const crew = station.profiles.map(
    (profile) =>
      agents.find((agent) => agent.profile === profile) ?? { profile, state: 'idle' as const },
  );
  crew.sort((left, right) => AGENT_ORDER[left.state] - AGENT_ORDER[right.state]);
  const sorted = [...issues].sort(
    (left, right) =>
      ISSUE_ORDER[left.status] - ISSUE_ORDER[right.status] ||
      right.updatedAt.localeCompare(left.updatedAt),
  );
  const shown = sorted.slice(0, ISSUES_SHOWN);
  const label = STATION_LABEL[station.id];
  return (
    <FlowNode
      icon={STATION_ICON[station.id]}
      title={label}
      tone={tone}
      active={tone === 'accent'}
      vertical={vertical}
      aside={
        <span className={styles.counter} data-arrived={arrived ? '' : undefined}>
          <CounterLabel aria-label={`${issues.length} issue${issues.length > 1 ? 's' : ''}`}>
            {issues.length}
          </CounterLabel>
        </span>
      }
    >
      {crew.length > 0 ? (
        <ul className={styles.crew} aria-label={`Agents de l’étape ${label}`}>
          {crew.map((member) => (
            <li
              key={member.profile}
              className={styles.crewMember}
              data-idle={member.state === 'idle' ? '' : undefined}
              title={`${member.profile} : ${AGENT_STATE_LABEL[member.state].toLowerCase()}`}
            >
              <AgentAvatar profile={member.profile} size={24} state={member.state} />
            </li>
          ))}
        </ul>
      ) : null}
      {shown.length > 0 ? (
        <ul className={styles.issues} aria-label={`Issues à l’étape ${label}`}>
          {shown.map((issue) => {
            const IssueIcon = ISSUE_ICON[issue.status];
            return (
              <li key={issue.key} className={styles.issueItem} data-status={issue.status}>
                <Token
                  as="button"
                  size="small"
                  text={`#${issue.number}`}
                  leadingVisual={() => <IssueIcon size={12} className={styles.issueIcon} />}
                  title={`${issue.key} : ${issue.title} (${ISSUE_STATUS_LABEL[issue.status].toLowerCase()})`}
                  aria-label={`${issue.key}, ${issue.title}, ${ISSUE_STATUS_LABEL[issue.status].toLowerCase()}`}
                  onClick={() => void navigate(issuePath(issue.key))}
                />
              </li>
            );
          })}
          {sorted.length > shown.length ? (
            <li className={styles.more}>+{sorted.length - shown.length}</li>
          ) : null}
        </ul>
      ) : null}
    </FlowNode>
  );
}
