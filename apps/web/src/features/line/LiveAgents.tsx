import type { AgentActivity } from '@factory-live/contracts';
import { CommentDiscussionIcon, TerminalIcon, ToolsIcon } from '@primer/octicons-react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { AgentAvatar } from '../../ui/agents/AgentAvatar.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { ModelBadge } from '../../ui/ModelBadge.tsx';
import { issuePath } from '../../ui/paths.ts';
import styles from './line.module.css';

const ACTION_ICON = { llm: CommentDiscussionIcon, tool: ToolsIcon, cli: TerminalIcon } as const;
const ORDER: Record<AgentActivity['state'], number> = {
  cli: 0,
  tool: 1,
  thinking: 2,
  blocked: 3,
  queued: 4,
  idle: 5,
};

/**
 * Les agents au travail, une carte chacun, à la manière d'agenttrail : avatar, ce qu'il fait à la
 * seconde près, depuis quand, avec quel modèle (et celui de la lane CLI s'il délègue).
 */
export function LiveAgents({
  agents,
  maxInProgress,
}: {
  agents: readonly AgentActivity[];
  maxInProgress: number;
}) {
  const { t, text } = useI18n();
  const busy = agents
    .filter((agent) => agent.state !== 'idle')
    .sort((left, right) => ORDER[left.state] - ORDER[right.state]);
  if (busy.length === 0) {
    return <p className={styles.quiet}>{t.line.noAgent}</p>;
  }
  return (
    <ul className={styles.liveList}>
      {busy.map((agent) => {
        const ActionIcon = agent.action ? ACTION_ICON[agent.action.kind] : null;
        return (
          <li key={agent.profile} className={styles.live} data-state={agent.state}>
            <AgentAvatar profile={agent.profile} size={32} state={agent.state} named />
            <div className={styles.liveBody}>
              <p className={styles.liveHead}>
                <span className={styles.liveName}>{agent.profile}</span>
                <span className={styles.liveState}>{t.agentState[agent.state]}</span>
                <span className={styles.liveWhere}>
                  {t.station[agent.station]}
                  {agent.issueKey ? (
                    <>
                      {' · '}
                      <Link to={issuePath(agent.issueKey)} className={styles.liveIssue}>
                        {agent.issueKey}
                      </Link>
                    </>
                  ) : null}
                </span>
                {agent.runStartedAt ? (
                  <span className={styles.liveElapsed}>
                    <Elapsed since={agent.runStartedAt} />
                  </span>
                ) : null}
              </p>
              {agent.action && ActionIcon ? (
                <p
                  className={styles.liveAction}
                  key={`${text(agent.action.label)}-${agent.action.startedAt}`}
                >
                  <ActionIcon size={14} aria-hidden="true" />
                  <span className={styles.liveActionText}>
                    {text(agent.action.label)}
                    {agent.action.detail ? (
                      <span className={styles.liveActionDetail}> {agent.action.detail}</span>
                    ) : null}
                  </span>
                  <span className={styles.liveElapsed}>
                    <Elapsed since={agent.action.startedAt} />
                  </span>
                </p>
              ) : agent.state === 'queued' ? (
                <p className={styles.liveAction}>{t.common.waitingForSlot(maxInProgress)}</p>
              ) : null}
              {agent.model ? (
                <p className={styles.liveModels}>
                  <ModelBadge model={agent.model} />
                  {agent.laneModel ? (
                    <ModelBadge model={agent.laneModel} prefix={t.common.lane} emphasis />
                  ) : null}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
