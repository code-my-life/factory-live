import type { AgentActivity, CardView } from '@factory-live/contracts';
import {
  BugIcon,
  CodeIcon,
  EyeIcon,
  RocketIcon,
  ToolsIcon,
  WorkflowIcon,
} from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';
import { ProgressBar } from '@primer/react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { ModelBadge } from '../../ui/ModelBadge.tsx';
import { JobBox, JobDetail } from '../../ui/work/JobBox.tsx';
import { cardWorkState } from '../../ui/work/workState.tsx';
import { shortCardTitle } from './cardText.ts';
import styles from './IssueGraph.module.css';

export const KIND_ICON: Record<CardView['kind'], Icon> = {
  brief: WorkflowIcon,
  impl: CodeIcon,
  release: RocketIcon,
  diagnostic: BugIcon,
  watch: EyeIcon,
  onboarding: ToolsIcon,
  other: ToolsIcon,
};

/**
 * Une carte de l'issue, dans la même boîte qu'une issue de la ligne d'usine : son état, l'agent qui
 * la tient, avec quel modèle (celui de la lane CLI s'il délègue), et ce qu'il fait, ce qui la bloque
 * ou où en sont ses tests. Toute la boîte se choisit, pour voir les runs de la carte.
 */
export function CardJob({
  card,
  agent,
  selected,
  onSelect,
  now,
}: {
  card: CardView;
  agent: AgentActivity | null;
  selected: boolean;
  onSelect: () => void;
  now: number;
}) {
  const { t, fmt, text } = useI18n();
  const run = card.runs.at(-1) ?? null;
  const running = card.status === 'running';
  const model = agent?.model ?? run?.model ?? null;
  const laneModel = agent?.laneModel ?? (running ? run?.laneModel : null) ?? null;
  const since = run
    ? fmt.stay((run.endedAt ? Date.parse(run.endedAt) : now) - Date.parse(run.startedAt))
    : undefined;
  return (
    <JobBox
      {...(since ? { since } : {})}
      id={card.id}
      state={cardWorkState(card, agent, t)}
      badge={card.kind}
      context={card.id}
      title={shortCardTitle(card, t)}
      onSelect={onSelect}
      selected={selected}
      agent={card.assignee}
    >
      {model ? (
        <span className={styles.models}>
          <ModelBadge
            {...(laneModel ? { prefix: t.common.lane, emphasis: true } : {})}
            model={laneModel ?? model}
          />
        </span>
      ) : null}
      {agent?.action ? (
        <JobDetail code>
          {text(agent.action.label)}
          {agent.action.detail ? ` · ${agent.action.detail}` : ''}
        </JobDetail>
      ) : card.blockReason ? (
        <JobDetail tone="danger">{card.blockReason}</JobDetail>
      ) : card.testsTotal ? (
        <span className={styles.progress}>
          <ProgressBar
            className={styles.progressBar}
            progress={Math.round(((card.testsPassed ?? card.testsTotal) / card.testsTotal) * 100)}
            barSize="small"
            aria-label={t.issue.testsPassed(card.testsPassed ?? card.testsTotal, card.testsTotal)}
          />
          <JobDetail>
            {t.issue.tests(card.testsPassed ?? card.testsTotal, card.testsTotal)}
            {card.changedFiles.length > 0 ? ` · ${t.issue.files(card.changedFiles.length)}` : ''}
          </JobDetail>
        </span>
      ) : null}
    </JobBox>
  );
}
