import type { AgentActivity, CardView } from '@factory-live/contracts';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import { ProgressBar } from '@primer/react';
import { LiveDot } from '../../ui/LiveDot.tsx';
import type { DotTone } from '../../ui/LiveDot.tsx';
import { ModelBadge } from '../../ui/ModelBadge.tsx';
import { ProfileIcon } from '../../ui/ProfileIcon.tsx';
import { CARD_STATUS_LABEL, shortCardTitle } from './cardText.ts';
import styles from './IssueGraph.module.css';

export interface CardNodeData extends Record<string, unknown> {
  card: CardView;
  agent: AgentActivity | null;
  vertical: boolean;
  selected: boolean;
}

export type CardFlowNode = Node<CardNodeData, 'card'>;

const STATUS_TONE: Partial<Record<CardView['status'], DotTone>> = {
  running: 'accent',
  review: 'done',
  blocked: 'danger',
  done: 'success',
  ready: 'attention',
};

export const NODE_WIDTH = 264;
export const NODE_HEIGHT = 168;

/** Un nœud du graphe d'une issue, dans l'esprit d'agenttrail : type, état, qui, quel modèle, quoi. */
export function CardNode({ data }: NodeProps<CardFlowNode>) {
  const { card, agent, vertical, selected } = data;
  const run = card.runs.at(-1) ?? null;
  const running = card.status === 'running';
  const model = agent?.model ?? run?.model ?? null;
  const laneModel = agent?.laneModel ?? (running ? run?.laneModel : null) ?? null;
  const topFile = [...card.changedFiles].sort((left, right) => right.edits - left.edits)[0];
  return (
    <div
      className={styles.node}
      data-status={card.status}
      data-selected={selected ? 'true' : undefined}
    >
      <Handle
        type="target"
        position={vertical ? Position.Top : Position.Left}
        className={styles.handle}
      />
      <div className={styles.nodeTop}>
        <span className={styles.nodeKind}>#{card.kind}</span>
        <span className={styles.nodeStatus}>
          <LiveDot tone={STATUS_TONE[card.status] ?? 'muted'} pulse={running} />
          {CARD_STATUS_LABEL[card.status]}
        </span>
      </div>
      <p className={styles.nodeTitle}>{shortCardTitle(card)}</p>
      <div className={styles.nodeWho}>
        <ProfileIcon profile={card.assignee} size={14} />
        <span className={styles.nodeProfile}>{card.assignee}</span>
      </div>
      {model ? (
        <div className={styles.nodeModels}>
          <ModelBadge
            model={laneModel ?? model}
            {...(laneModel ? { prefix: 'lane', emphasis: true } : {})}
          />
        </div>
      ) : null}
      {agent?.action ? (
        <p className={styles.nodeAction}>
          {agent.action.label}
          {agent.action.detail ? ` · ${agent.action.detail}` : ''}
        </p>
      ) : card.blockReason ? (
        <p className={styles.nodeBlock}>{card.blockReason}</p>
      ) : null}
      {card.testsTotal ? (
        <div className={styles.nodeProgress}>
          <ProgressBar
            progress={Math.round(((card.testsPassed ?? 0) / card.testsTotal) * 100)}
            barSize="small"
            aria-label={`${card.testsPassed ?? 0} tests réussis sur ${card.testsTotal}`}
          />
          <span className={styles.nodeMeta}>
            {card.testsPassed}/{card.testsTotal} tests
            {topFile ? ` · ${card.changedFiles.length} fichiers` : ''}
          </span>
        </div>
      ) : null}
      <Handle
        type="source"
        position={vertical ? Position.Bottom : Position.Right}
        className={styles.handle}
      />
    </div>
  );
}
