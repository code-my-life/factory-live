import { motion } from 'motion/react';
import { useI18n } from '../../../../i18n/I18nProvider.tsx';
import { Badge } from '../../../../ui/badge/Badge.tsx';
import { IssueBadge } from '../../../../ui/badge/IssueBadge.tsx';
import {
  WorkStateIcon,
  interventionHeadline,
  interventionTone,
  issueWorkState,
} from '../../../../ui/work/workState.tsx';
import { ROW_H } from '../layout.ts';
import type { RowKind } from '../layout.ts';
import { calledModel, finishedAt, isFinished } from '../model.ts';
import type { LineIssue } from '../model.ts';
import { entry } from './text.ts';
import styles from '../graph.module.css';

/** What the row says under the title: what waits for the owner, the agent and its model, or the step. */
function useDetail(
  item: LineIssue,
  maxInProgress: number,
  ai: boolean,
): { text: string; tone: 'muted' | 'attention' | 'danger' } | null {
  const { t, text } = useI18n();
  const { issue, agent, intervention } = item;
  if (intervention)
    return { text: text(interventionHeadline(intervention)), tone: interventionTone(intervention) };
  if (issue.status === 'queued')
    return { text: t.common.waitingForSlot(maxInProgress), tone: 'muted' };
  // Only an agent at an AI station calls a model; elsewhere, scripts, GitHub and the owner work.
  // What the agent does: the model it calls, or else the tool it runs.
  const called = ai ? calledModel(agent) : null;
  if (agent && called)
    return { text: t.line.graph.calls(agent.profile, called.model), tone: 'muted' };
  if (ai && agent?.action) {
    const { label, detail } = agent.action;
    return { text: `${text(label)}${detail ? ` · ${detail}` : ''}`, tone: 'muted' };
  }
  const step =
    issue.status === 'active' ? entry<string>(t.line.graph.atStation, issue.station) : undefined;
  if (step) return { text: step, tone: 'muted' };
  return null;
}

/**
 * An item's row in its station: its state, its key and title, its type and how long it has stood
 * there, and what holds it (the owner, an agent and its model, a step).
 */
export function ItemRow({
  item,
  row,
  ai,
  selected,
  arriving,
  landed,
  dimmed,
  onSelect,
  now,
  maxInProgress,
}: {
  item: LineIssue;
  row: RowKind;
  /** The station is one where an agent calls a model. */
  ai: boolean;
  selected: boolean;
  arriving: boolean;
  landed: boolean;
  dimmed: boolean;
  onSelect: (key: string) => void;
  now: number;
  maxInProgress: number;
}) {
  const { t, fmt } = useI18n();
  const { issue, agent } = item;
  const state = issueWorkState(issue, agent, t);
  const detail = useDetail(item, maxInProgress, ai);
  // How long it has stood at its station; for a finished item, how long ago it finished.
  const since = isFinished(issue)
    ? t.line.graph.finishedAgo(fmt.stay(now - Date.parse(finishedAt(issue))))
    : fmt.stay(now - Date.parse(issue.stationChangedAt ?? issue.startedAt));
  const typeLabel = issue.labels.find((label) => label.name === `type:${issue.type ?? ''}`);
  return (
    <motion.div
      className={styles.row}
      data-tone={state.tone}
      data-row={row}
      style={{ height: ROW_H[row] }}
      data-selected={selected ? '' : undefined}
      data-arriving={arriving ? '' : undefined}
      data-landed={landed ? '' : undefined}
      data-dimmed={dimmed ? '' : undefined}
      data-issue={issue.key}
      // The card sets down: the row takes the knock, firmly, without a wobble.
      animate={landed ? { scale: [0.97, 1] } : undefined}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    >
      <span className={styles.rowHead}>
        <WorkStateIcon state={state} />
        {/* The icon is the state on screen when no text says it (a compact row, a type in its place). */}
        {row === 'compact' || issue.type ? (
          <span className="fl-visually-hidden">{state.label}</span>
        ) : null}
        <IssueBadge issueKey={issue.key} icon={false} />
      </span>
      <button
        type="button"
        className={styles.rowTitle}
        aria-pressed={selected}
        title={issue.title}
        onClick={() => onSelect(issue.key)}
      >
        {issue.title}
      </button>
      {row === 'compact' ? null : (
        <>
          <span className={styles.rowFoot}>
            {issue.type ? (
              <Badge
                {...(typeLabel ? { githubColor: typeLabel.color } : {})}
                value={t.issueType[issue.type]}
              />
            ) : (
              <span className={styles.state}>{state.label}</span>
            )}
            <span className={styles.since}>{since}</span>
          </span>
          {row === 'full' ? (
            <span
              className={styles.note}
              data-tone={detail?.tone ?? 'muted'}
              title={detail?.text ?? undefined}
            >
              {detail?.text}
            </span>
          ) : null}
        </>
      )}
    </motion.div>
  );
}
