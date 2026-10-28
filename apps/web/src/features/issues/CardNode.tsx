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
import type { Node, NodeProps } from '@xyflow/react';
import { AgentAvatar } from '../../ui/agents/AgentAvatar.tsx';
import { FlowNode } from '../../ui/flow/FlowNode.tsx';
import type { FlowTone } from '../../ui/flow/FlowNode.tsx';
import { ModelBadge } from '../../ui/ModelBadge.tsx';
import { CARD_STATUS_LABEL } from '../../ui/vocabulary.ts';
import { shortCardTitle } from './cardText.ts';
import styles from './IssueGraph.module.css';

export interface CardNodeData extends Record<string, unknown> {
  card: CardView;
  agent: AgentActivity | null;
  vertical: boolean;
  selected: boolean;
}

export type CardFlowNode = Node<CardNodeData, 'card'>;

const KIND_ICON: Record<CardView['kind'], Icon> = {
  brief: WorkflowIcon,
  impl: CodeIcon,
  release: RocketIcon,
  diagnostic: BugIcon,
  watch: EyeIcon,
  onboarding: ToolsIcon,
  other: ToolsIcon,
};

const STATUS_TONE: Record<CardView['status'], FlowTone> = {
  triage: 'attention',
  todo: 'muted',
  scheduled: 'muted',
  ready: 'muted',
  running: 'accent',
  blocked: 'danger',
  review: 'done',
  done: 'success',
  archived: 'muted',
};

export const NODE_WIDTH = 232;
export const NODE_HEIGHT = 224;

/** Une carte de l'issue, dans le même cadre qu'une station de la ligne d'usine : qui, quel modèle, quoi. */
export function CardNode({ data }: NodeProps<CardFlowNode>) {
  const { card, agent, vertical, selected } = data;
  const run = card.runs.at(-1) ?? null;
  const running = card.status === 'running';
  const model = agent?.model ?? run?.model ?? null;
  const laneModel = agent?.laneModel ?? (running ? run?.laneModel : null) ?? null;
  const tone = STATUS_TONE[card.status];
  return (
    <FlowNode
      icon={KIND_ICON[card.kind]}
      title={shortCardTitle(card)}
      tone={tone}
      active={running}
      selected={selected}
      vertical={vertical}
      titleLines={2}
    >
      <span className={styles.status}>{CARD_STATUS_LABEL[card.status]}</span>
      <p className={styles.who}>
        <AgentAvatar
          {...(running && agent ? { state: agent.state } : {})}
          profile={card.assignee}
          size={20}
          named
        />
        <span className={styles.agentName}>{card.assignee}</span>
      </p>
      {model ? (
        <p className={styles.models}>
          <ModelBadge
            {...(laneModel ? { prefix: 'lane', emphasis: true } : {})}
            model={laneModel ?? model}
          />
        </p>
      ) : null}
      {agent?.action ? (
        <p className={styles.action}>
          {agent.action.label}
          {agent.action.detail ? ` · ${agent.action.detail}` : ''}
        </p>
      ) : card.blockReason ? (
        <p className={styles.block}>{card.blockReason}</p>
      ) : card.testsTotal ? (
        <div className={styles.progress}>
          <ProgressBar
            progress={Math.round(((card.testsPassed ?? card.testsTotal) / card.testsTotal) * 100)}
            barSize="small"
            aria-label={`${card.testsPassed ?? card.testsTotal} tests réussis sur ${card.testsTotal}`}
          />
          <span className={styles.meta}>
            {card.testsPassed ?? card.testsTotal}/{card.testsTotal} tests
            {card.changedFiles.length > 0 ? ` · ${card.changedFiles.length} fichiers` : ''}
          </span>
        </div>
      ) : null}
    </FlowNode>
  );
}
