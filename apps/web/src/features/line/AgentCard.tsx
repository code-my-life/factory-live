import type { AgentActivity } from '@factory-live/contracts';
import { CommentDiscussionIcon, TerminalIcon, ToolsIcon } from '@primer/octicons-react';
import { Link } from 'react-router';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { LiveDot } from '../../ui/LiveDot.tsx';
import type { DotTone } from '../../ui/LiveDot.tsx';
import { ModelBadge } from '../../ui/ModelBadge.tsx';
import { ProfileIcon } from '../../ui/ProfileIcon.tsx';
import { AGENT_STATE_LABEL } from '../../ui/vocabulary.ts';
import { issuePath } from '../issues/paths.ts';
import styles from './line.module.css';

const STATE_TONE: Record<AgentActivity['state'], DotTone> = {
  idle: 'muted',
  queued: 'muted',
  thinking: 'accent',
  tool: 'success',
  cli: 'done',
  blocked: 'danger',
};

const ACTION_ICON = { llm: CommentDiscussionIcon, tool: ToolsIcon, cli: TerminalIcon } as const;

/** Un profil au travail : son modèle réel, ce qu'il fait à la seconde près, sur quelle issue. */
export function AgentCard({
  agent,
  maxInProgress,
}: {
  agent: AgentActivity;
  maxInProgress: number;
}) {
  const ActionIcon = agent.action ? ACTION_ICON[agent.action.kind] : null;
  const working = agent.state !== 'idle' && agent.state !== 'queued';
  return (
    <article
      className={styles.agent}
      data-state={agent.state}
      aria-label={`${agent.profile}, ${AGENT_STATE_LABEL[agent.state]}`}
    >
      <header className={styles.agentHead}>
        <ProfileIcon profile={agent.profile} />
        <span className={styles.agentName}>{agent.profile}</span>
        {agent.runStartedAt ? (
          <span className={styles.agentElapsed}>
            <Elapsed since={agent.runStartedAt} />
          </span>
        ) : null}
      </header>
      <p className={styles.agentState}>
        <LiveDot tone={STATE_TONE[agent.state]} pulse={working} />
        {AGENT_STATE_LABEL[agent.state]}
      </p>

      {agent.model ? (
        <div className={styles.agentModels}>
          <ModelBadge model={agent.model} />
          {agent.laneModel ? <ModelBadge model={agent.laneModel} prefix="lane" emphasis /> : null}
        </div>
      ) : null}

      {agent.action && ActionIcon ? (
        <p className={styles.action}>
          <ActionIcon size={14} aria-hidden="true" />
          <span className={styles.actionText}>
            <span className={styles.actionLabel}>{agent.action.label}</span>
            {agent.action.detail ? (
              <span className={styles.actionDetail}>{agent.action.detail}</span>
            ) : null}
          </span>
          <span className={styles.actionElapsed}>
            <Elapsed since={agent.action.startedAt} />
          </span>
        </p>
      ) : null}

      {agent.state === 'queued' ? (
        <p className={styles.queued}>
          Attend une place : {maxInProgress} cartes en cours sur {maxInProgress} autorisées
        </p>
      ) : null}

      {agent.issueKey ? (
        <Link className={styles.agentIssue} to={issuePath(agent.issueKey)}>
          {agent.issueKey}
        </Link>
      ) : null}
    </article>
  );
}
