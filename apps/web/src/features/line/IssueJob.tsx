import type { AgentActivity, Intervention, IssueSummary } from '@factory-live/contracts';
import { formatStay } from '../../ui/format.ts';
import { issuePath } from '../../ui/paths.ts';
import { AGENT_STATE_LABEL, INTERVENTION_ACTION_LABEL } from '../../ui/vocabulary.ts';
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
  const state = issueWorkState(issue, agent);
  // Une issue finie n'attend plus rien : son ancienneté dans « Terminé » n'apprend rien.
  const finished = issue.status === 'done' || issue.status === 'stopped';
  const since = formatStay(now - Date.parse(issue.stationChangedAt ?? issue.startedAt));
  return (
    <JobBox
      {...(finished ? {} : { since })}
      id={issue.key}
      state={state}
      badge={`#${issue.number}`}
      context={issue.repo}
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
  if (issue.status === 'waiting_human' || issue.status === 'blocked') {
    const tone = issue.status === 'blocked' ? 'danger' : 'attention';
    return (
      <>
        {intervention ? <JobDetail tone={tone}>{intervention.title}</JobDetail> : null}
        {intervention ? (
          <JobAction to={`/interventions/${encodeURIComponent(intervention.id)}`}>
            {INTERVENTION_ACTION_LABEL[intervention.kind]}
          </JobAction>
        ) : null}
      </>
    );
  }
  if (issue.status === 'queued')
    return <JobDetail>Attend une place : {maxInProgress} cartes en cours au plus</JobDetail>;
  if (!agent) return null;
  if (agent.action)
    return (
      <JobDetail code>
        {agent.action.label}
        {agent.action.detail ? ` · ${agent.action.detail}` : ''}
      </JobDetail>
    );
  return <JobDetail>{AGENT_STATE_LABEL[agent.state]}</JobDetail>;
}
