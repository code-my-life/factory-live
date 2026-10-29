import type { AgentActivity, Intervention, IssueSummary } from '@factory-live/contracts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { IssueBadge, issueState } from '../../ui/badge/IssueBadge.tsx';
import { ModelBadge } from '../../ui/ModelBadge.tsx';
import { actionModel } from '../../ui/modelText.ts';
import { issuePath } from '../../ui/paths.ts';
import { JobAction, JobBox, JobDetail } from '../../ui/work/JobBox.tsx';
import { issueWorkState } from '../../ui/work/workState.tsx';

/**
 * Une issue sur la ligne d'usine : sa boîte, son état, l'agent qui la tient, et ce qu'il y fait
 * ou ce qu'on attend de toi. Résumée en tête et titre dans une étape de bord (intake, terminé).
 */
export function IssueJob({
  issue,
  agent,
  intervention,
  maxInProgress,
  compact,
  now,
}: {
  issue: IssueSummary;
  /** L'agent occupé sur l'issue en ce moment, s'il y en a un. */
  agent: AgentActivity | null;
  /** La question ou le blocage qui attend Clément sur cette issue. */
  intervention: Intervention | null;
  maxInProgress: number;
  compact: boolean;
  now: number;
}) {
  const { t, fmt } = useI18n();
  const state = issueWorkState(issue, agent, t);
  // Une issue finie n'attend plus rien : son ancienneté dans « Terminé » n'apprend rien.
  const finished = issue.status === 'done' || issue.status === 'stopped';
  const since = fmt.stay(now - Date.parse(issue.stationChangedAt ?? issue.startedAt));
  return (
    <JobBox
      {...(finished ? {} : { since })}
      id={issue.key}
      state={state}
      badge={<IssueBadge issueKey={issue.key} state={issueState(issue.status)} icon={false} />}
      title={issue.title}
      to={issuePath(issue.key)}
      compact={compact}
      agent={agent?.profile ?? issue.activeProfiles[0] ?? null}
    >
      {compact ? null : (
        <IssueJobDetail
          issue={issue}
          agent={agent}
          intervention={intervention}
          maxInProgress={maxInProgress}
        />
      )}
    </JobBox>
  );
}

function IssueJobDetail({
  issue,
  agent,
  intervention,
  maxInProgress,
}: {
  issue: IssueSummary;
  agent: AgentActivity | null;
  intervention: Intervention | null;
  maxInProgress: number;
}) {
  const { t, text } = useI18n();
  if (issue.status === 'waiting_human' || issue.status === 'blocked') {
    const tone = issue.status === 'blocked' ? 'danger' : 'attention';
    return (
      <>
        {intervention ? <JobDetail tone={tone}>{text(intervention.title)}</JobDetail> : null}
        {intervention ? (
          <JobAction to={`/interventions/${encodeURIComponent(intervention.id)}`}>
            {t.interventionAction[intervention.kind]}
          </JobAction>
        ) : null}
      </>
    );
  }
  if (issue.status === 'queued')
    return <JobDetail>{t.common.waitingForSlot(maxInProgress)}</JobDetail>;
  if (!agent) return null;
  const called = actionModel(agent);
  if (agent.action && called)
    return (
      <>
        <JobDetail code>{text(agent.action.label)}</JobDetail>
        <ModelBadge model={called} />
      </>
    );
  if (agent.action)
    return (
      <JobDetail code>
        {text(agent.action.label)}
        {agent.action.detail ? ` · ${agent.action.detail}` : ''}
      </JobDetail>
    );
  return <JobDetail>{t.agentState[agent.state]}</JobDetail>;
}
