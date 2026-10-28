import type { AgentActivity, CardView, IssueSummary, KanbanStatus } from '@factory-live/contracts';
import {
  AlertFillIcon,
  ArchiveIcon,
  BellFillIcon,
  BlockedIcon,
  CheckCircleFillIcon,
  ClockIcon,
  DotFillIcon,
  EyeIcon,
  IssueClosedIcon,
  SkipIcon,
} from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';
import { Label, Spinner } from '@primer/react';
import { CARD_STATUS_LABEL, ISSUE_STATUS_LABEL } from '../vocabulary.ts';
import styles from './work.module.css';

/** Couleur d'un état, prise aux variantes de `Label` de Primer. */
export type WorkTone = 'accent' | 'attention' | 'danger' | 'secondary' | 'done' | 'success';

/** L'état d'un travail (une issue sur la ligne, une carte d'une issue), tel qu'on le lit d'un coup d'œil. */
export interface WorkState {
  label: string;
  tone: WorkTone;
  icon: Icon;
  /** Un agent y travaille en ce moment : l'icône tourne, comme un job en cours dans GitHub Actions. */
  working: boolean;
}

const BUSY = new Set<AgentActivity['state']>(['thinking', 'tool', 'cli']);

const ISSUE_STATE: Record<IssueSummary['status'], { tone: WorkTone; icon: Icon }> = {
  active: { tone: 'accent', icon: DotFillIcon },
  waiting_human: { tone: 'attention', icon: BellFillIcon },
  blocked: { tone: 'danger', icon: BlockedIcon },
  queued: { tone: 'secondary', icon: ClockIcon },
  done: { tone: 'done', icon: IssueClosedIcon },
  stopped: { tone: 'secondary', icon: SkipIcon },
};

const CARD_STATE: Record<KanbanStatus, { tone: WorkTone; icon: Icon }> = {
  triage: { tone: 'attention', icon: AlertFillIcon },
  todo: { tone: 'secondary', icon: ClockIcon },
  scheduled: { tone: 'secondary', icon: ClockIcon },
  ready: { tone: 'secondary', icon: ClockIcon },
  running: { tone: 'accent', icon: DotFillIcon },
  blocked: { tone: 'danger', icon: BlockedIcon },
  review: { tone: 'done', icon: EyeIcon },
  done: { tone: 'success', icon: CheckCircleFillIcon },
  archived: { tone: 'secondary', icon: ArchiveIcon },
};

export function issueWorkState(issue: IssueSummary, agent: AgentActivity | null): WorkState {
  return {
    label: ISSUE_STATUS_LABEL[issue.status],
    ...ISSUE_STATE[issue.status],
    working: issue.status === 'active' && agent !== null && BUSY.has(agent.state),
  };
}

export function cardWorkState(card: CardView, agent: AgentActivity | null): WorkState {
  return {
    label: CARD_STATUS_LABEL[card.status],
    ...CARD_STATE[card.status],
    working: card.status === 'running' && agent !== null && BUSY.has(agent.state),
  };
}

/**
 * L'icône d'état d'un job : le `Spinner` de Primer (indicateur d'un travail à la durée inconnue)
 * quand un agent y travaille, sinon l'octicon de l'état à sa couleur. Décorative : le badge dit l'état.
 */
export function WorkStateIcon({ state }: { state: WorkState }) {
  if (state.working)
    return <Spinner size="small" srText={null} className={styles.spinner} data-loop="" />;
  const StateIcon = state.icon;
  return (
    <span className={styles.icon} data-tone={state.tone} aria-hidden="true">
      <StateIcon size={16} />
    </span>
  );
}

/** Le badge d'état, un `Label` de Primer à la couleur de l'état. */
export function WorkStateLabel({ state }: { state: WorkState }) {
  return <Label variant={state.tone}>{state.label}</Label>;
}
