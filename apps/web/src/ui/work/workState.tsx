import type {
  AgentActivity,
  CardView,
  Intervention,
  IssueSummary,
  KanbanStatus,
  Text,
} from '@factory-live/contracts';
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
import type { Messages } from '../../i18n/fr.ts';
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

/**
 * Les mêmes couleurs que pour une issue : bleu au travail (la revue en est un), jaune ce qui t'attend,
 * rouge ce qui bloque, gris ce qui patiente, violet ce qui est fini (« Terminée » partout pareil).
 */
const CARD_STATE: Record<KanbanStatus, { tone: WorkTone; icon: Icon }> = {
  triage: { tone: 'attention', icon: AlertFillIcon },
  todo: { tone: 'secondary', icon: ClockIcon },
  scheduled: { tone: 'secondary', icon: ClockIcon },
  ready: { tone: 'secondary', icon: ClockIcon },
  running: { tone: 'accent', icon: DotFillIcon },
  blocked: { tone: 'danger', icon: BlockedIcon },
  review: { tone: 'accent', icon: EyeIcon },
  done: { tone: 'done', icon: CheckCircleFillIcon },
  archived: { tone: 'secondary', icon: ArchiveIcon },
};

export function issueWorkState(
  issue: Pick<IssueSummary, 'status'>,
  agent: AgentActivity | null,
  t: Messages,
): WorkState {
  return {
    label: t.issueStatus[issue.status],
    ...ISSUE_STATE[issue.status],
    working: issue.status === 'active' && agent !== null && BUSY.has(agent.state),
  };
}

export function cardWorkState(
  card: Pick<CardView, 'status'>,
  agent: AgentActivity | null,
  t: Messages,
): WorkState {
  return {
    label: t.cardStatus[card.status],
    ...CARD_STATE[card.status],
    working: card.status === 'running' && agent !== null && BUSY.has(agent.state),
  };
}

/**
 * La couleur d'une intervention, la même partout où elle se montre (liste, détail, bandeaux, ligne) :
 * celle de sa gravité, rouge quand elle bloque, jaune quand elle est à traiter ou pour info. L'issue
 * qu'elle arrête garde la sienne (« Attend ta décision », jaune).
 */
export function interventionTone(
  intervention: Pick<Intervention, 'severity'>,
): 'attention' | 'danger' {
  return intervention.severity === 'critical' ? 'danger' : 'attention';
}

/**
 * Le titre d'une intervention, le même partout : la cause quand le diagnostic en a trouvé une,
 * sinon la phrase de l'agent, telle quelle (une vraie question, ou un blocage que rien n'explique,
 * se lit mieux dans ses mots que dans une formule générale).
 */
export function interventionHeadline(
  intervention: Pick<Intervention, 'title' | 'diagnosis'>,
): Text {
  const finding = intervention.diagnosis?.primary;
  return finding && finding.code !== 'question' && finding.code !== 'unexplained'
    ? finding.summary
    : intervention.title;
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

/**
 * Le badge d'état : un `Label` de Primer peint de la couleur franche de l'état (jetons « emphasis »,
 * texte blanc), avec son icône, comme les `StateLabel` d'une issue ou d'une PR. Dans une boîte de job,
 * l'icône est déjà en tête de la boîte : le badge s'en passe.
 */
export function WorkStateLabel({ state, icon = true }: { state: WorkState; icon?: boolean }) {
  const StateIcon = state.icon;
  return (
    <Label variant={state.tone} className={styles.state} data-solid="">
      {icon ? <StateIcon size={12} aria-hidden="true" /> : null}
      {state.label}
    </Label>
  );
}
