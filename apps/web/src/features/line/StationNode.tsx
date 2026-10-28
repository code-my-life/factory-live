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
import { Link, useNavigate } from 'react-router';
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
/** Sur la voie, la place ne manque pas en hauteur : on montre plus d'issues, titres compris. */
const ISSUES_ON_RAIL = 4;
/** États qu'on lit sous le titre de l'issue ; « en cours » se voit à l'agent qui y travaille. */
const FLAGGED = new Set<IssueSummary['status']>(['waiting_human', 'blocked', 'queued']);

export interface StationNodeData extends Record<string, unknown> {
  station: StationView;
  agents: readonly AgentActivity[];
  issues: readonly IssueSummary[];
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

function sortedIssues(issues: readonly IssueSummary[]): IssueSummary[] {
  return [...issues].sort(
    (left, right) =>
      ISSUE_ORDER[left.status] - ISSUE_ORDER[right.status] ||
      right.updatedAt.localeCompare(left.updatedAt),
  );
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
  size,
}: {
  station: StationView;
  agents: readonly AgentActivity[];
  size: 20 | 24;
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
          <AgentAvatar profile={member.profile} size={size} state={member.state} />
        </li>
      ))}
    </ul>
  );
}

function doing(agent: AgentActivity): string {
  const issue = agent.issueKey ? `#${agent.issueKey.split('#')[1] ?? ''} · ` : '';
  if (agent.action)
    return `${issue}${agent.action.label}${agent.action.detail ? ` ${agent.action.detail}` : ''}`;
  return `${issue}${AGENT_STATE_LABEL[agent.state].toLowerCase()}`;
}

/**
 * Le contenu d'une station sur la voie verticale (téléphone) : qui y travaille et à quoi, puis ses
 * issues avec leur titre, chacune une ligne qui se touche et mène à l'issue.
 */
export function StationRailDetails({
  station,
  agents,
  issues,
}: {
  station: StationId;
  agents: readonly AgentActivity[];
  issues: readonly IssueSummary[];
}) {
  const label = STATION_LABEL[station];
  const working = agents
    .filter((agent) => agent.state !== 'idle')
    .sort((left, right) => AGENT_ORDER[left.state] - AGENT_ORDER[right.state]);
  const sorted = sortedIssues(issues);
  const shown = sorted.slice(0, ISSUES_ON_RAIL);
  if (working.length === 0 && shown.length === 0) return null;
  return (
    <>
      {working.length > 0 ? (
        <ul className={styles.railAgents} aria-label={`Au travail à l’étape ${label}`}>
          {working.map((agent) => (
            <li key={agent.profile} className={styles.railAgent} data-state={agent.state}>
              <AgentAvatar profile={agent.profile} size={20} state={agent.state} named />
              <span className={styles.railAgentName}>{agent.profile}</span>
              <span className={styles.railAgentDoing}>{doing(agent)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {shown.length > 0 ? (
        <ul className={styles.railIssues} aria-label={`Issues à l’étape ${label}`}>
          {shown.map((issue) => {
            const IssueIcon = ISSUE_ICON[issue.status];
            return (
              <li key={issue.key}>
                <Link
                  to={issuePath(issue.key)}
                  className={styles.railIssue}
                  data-status={issue.status}
                >
                  <IssueIcon size={16} className={styles.issueIcon} />
                  <span className={styles.railIssueTitle}>{issue.title}</span>
                  <span className={styles.railIssueMeta}>
                    <span className={styles.railIssueKey}>{issue.key}</span>
                    {FLAGGED.has(issue.status) ? (
                      <span className={styles.railIssueStatus}>
                        {' · '}
                        {ISSUE_STATUS_LABEL[issue.status]}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {sorted.length > shown.length ? (
        <Link to="/issues" className={styles.railMore}>
          Voir les {sorted.length} issues
        </Link>
      ) : null}
    </>
  );
}

/** Une station de la ligne en largeur : qui y travaille (avatars), combien d'issues, lesquelles. Le détail est sous le graphe. */
export function StationNode({ data }: NodeProps<StationFlowNode>) {
  const { station, agents, issues, arrived } = data;
  const navigate = useNavigate();
  const tone = stationTone(station.id, agents, issues);
  const sorted = sortedIssues(issues);
  const shown = sorted.slice(0, ISSUES_SHOWN);
  const label = STATION_LABEL[station.id];
  return (
    <FlowNode
      icon={STATION_ICON[station.id]}
      title={label}
      tone={tone}
      active={tone === 'accent'}
      aside={<StationCounter count={issues.length} arrived={arrived} />}
    >
      <StationCrew station={station} agents={agents} size={24} />
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
