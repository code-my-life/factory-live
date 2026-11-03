import type { GateLane } from '@factory-live/contracts';
import {
  CheckCircleIcon,
  CodeIcon,
  EyeIcon,
  GitMergeIcon,
  IssueOpenedIcon,
  MarkGithubIcon,
  PersonIcon,
  PlayIcon,
  RocketIcon,
  SearchIcon,
  SparkleFillIcon,
  TerminalIcon,
  WorkflowIcon,
} from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';
import { AnimatePresence, motion } from 'motion/react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { Badge } from '../../../ui/badge/Badge.tsx';
import { IssueBadge } from '../../../ui/badge/IssueBadge.tsx';
import { ModelBadge } from '../../../ui/ModelBadge.tsx';
import { MOVE_TRANSITION } from '../../../ui/motion.tsx';
import {
  WorkStateIcon,
  interventionHeadline,
  interventionTone,
  issueWorkState,
} from '../../../ui/work/workState.tsx';
import { DONE_SHOWN, INTAKE_SHOWN, ROW_H } from './layout.ts';
import type { Box, BoxId, RowKind, StationBox as Station } from './layout.ts';
import { calledModel, finishedAt } from './model.ts';
import type { LineIssue, ProviderRow } from './model.ts';
import { BRANCH_COLOR } from './palette.ts';
import styles from './graph.module.css';

/** Who does the work at a station: an agent calling a model, a script, GitHub, or the owner. */
export type Kind = 'ai' | 'script' | 'github' | 'owner';

const STATIONS: Record<Station, { icon: Icon; kind: Kind | null }> = {
  intake: { icon: IssueOpenedIcon, kind: 'script' },
  brief: { icon: WorkflowIcon, kind: 'ai' },
  implementation: { icon: CodeIcon, kind: 'ai' },
  review: { icon: EyeIcon, kind: 'owner' },
  merge: { icon: GitMergeIcon, kind: 'github' },
  ci: { icon: PlayIcon, kind: 'github' },
  deploy: { icon: RocketIcon, kind: 'script' },
  done: { icon: CheckCircleIcon, kind: null },
  diagnostic: { icon: SearchIcon, kind: 'ai' },
};

const KIND_ICON: Record<Kind, Icon> = {
  ai: SparkleFillIcon,
  script: TerminalIcon,
  github: MarkGithubIcon,
  owner: PersonIcon,
};

/** The issue types of each proof, in the order of `config/types.yaml` of the factory. */
const LANE_TYPES = {
  failfirst: ['bug', 'interface', 'fonctionnalite'],
  sabotage: ['tests'],
  invariance: ['maintenance'],
  documents: ['documentation'],
} as const satisfies Record<GateLane, readonly string[]>;

const STATION_TEXT = new Set(['gate', 'review', 'merge', 'ci', 'deploy']);

export function KindChip({ kind }: { kind: Kind }) {
  const { t } = useI18n();
  const KindIcon = KIND_ICON[kind];
  return (
    <span className={styles.kind} data-kind={kind} title={t.line.graph.kindHint[kind]}>
      <KindIcon size={12} />
      {t.line.graph.kind[kind]}
    </span>
  );
}

export function StationBox({
  id,
  box,
  items,
  row,
  selectedKey,
  travelling,
  landed,
  shown,
  onSelect,
  now,
  maxInProgress,
}: {
  id: BoxId;
  box: Box;
  items: readonly LineIssue[];
  row: RowKind;
  selectedKey: string | null;
  /** Issues whose card is still on its way here: their row waits for it. */
  travelling: ReadonlySet<string>;
  /** Issues whose card has just landed here. */
  landed: ReadonlySet<string>;
  /** The issues the search keeps, or null when nothing is filtered. */
  shown: ReadonlySet<string> | null;
  onSelect: (key: string) => void;
  now: number;
  maxInProgress: number;
}) {
  const { t } = useI18n();
  const lane = id.startsWith('gate:') ? (id.slice('gate:'.length) as GateLane) : null;
  const station = lane ? null : (id as Station);
  const info = station ? STATIONS[station] : null;
  const limit = id === 'done' ? DONE_SHOWN : id === 'intake' ? INTAKE_SHOWN : items.length;
  // A box that lists only its first issues still shows the open one and those the search keeps.
  const wanted = (item: LineIssue) =>
    item.issue.key === selectedKey || (shown?.has(item.issue.key) ?? false);
  const listed = (
    limit < items.length
      ? [...items.filter(wanted), ...items.filter((item) => !wanted(item))]
      : items
  ).slice(0, limit);
  const more = items.length - listed.length;
  const tone = items.some((item) => item.issue.status === 'blocked')
    ? 'danger'
    : items.some((item) => item.issue.status === 'waiting_human')
      ? 'attention'
      : undefined;
  const StationIcon = info?.icon;
  return (
    <motion.div
      className={styles.box}
      data-box={id}
      data-proof={lane ?? undefined}
      data-tone={tone}
      initial={false}
      animate={{ top: box.y, height: box.h }}
      transition={MOVE_TRANSITION}
      style={{ left: box.x, width: box.w }}
    >
      <div
        className={styles.head}
        style={{ height: box.head }}
        title={station ? t.stationHint[station] : t.line.graph.gateHint}
      >
        <span className={styles.headLine}>
          {StationIcon ? (
            <StationIcon size={16} className={styles.headIcon} aria-hidden="true" />
          ) : null}
          {lane ? (
            <span
              className={styles.proofSwatch}
              style={{ backgroundColor: BRANCH_COLOR[lane] }}
              aria-hidden="true"
            />
          ) : null}
          <span className={styles.headName}>
            {station ? t.station[station] : t.line.graph.lane[lane as GateLane]}
          </span>
          {info?.kind ? <KindChip kind={info.kind} /> : null}
        </span>
        {lane ? (
          <span className={styles.headTypes}>
            {LANE_TYPES[lane].map((type) => t.issueType[type]).join(' · ')}
          </span>
        ) : null}
      </div>
      <div className={styles.body}>
        {/* A row leaving with its card fades where it stood, out of the flow of the others. */}
        <AnimatePresence initial={false} mode="popLayout">
          {listed.length === 0 ? (
            <motion.p
              key="empty"
              className={styles.empty}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
            >
              {t.line.graph.empty}
            </motion.p>
          ) : (
            listed.map((item) => (
              <motion.div
                key={item.issue.key}
                className={styles.slot}
                exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } }}
              >
                <IssueRow
                  item={item}
                  row={row}
                  selected={item.issue.key === selectedKey}
                  arriving={travelling.has(item.issue.key)}
                  landed={landed.has(item.issue.key)}
                  dimmed={shown !== null && !shown.has(item.issue.key)}
                  onSelect={onSelect}
                  now={now}
                  maxInProgress={maxInProgress}
                />
              </motion.div>
            ))
          )}
        </AnimatePresence>
        {more > 0 ? <p className={styles.more}>{t.line.graph.more(more)}</p> : null}
      </div>
    </motion.div>
  );
}

/** What the row says under the title: what waits for the owner, the agent and its model, or the step. */
function useDetail(
  item: LineIssue,
  maxInProgress: number,
): { text: string; tone: 'muted' | 'attention' | 'danger' } | null {
  const { t, text } = useI18n();
  const { issue, agent, intervention } = item;
  if (intervention)
    return { text: text(interventionHeadline(intervention)), tone: interventionTone(intervention) };
  if (issue.status === 'queued')
    return { text: t.common.waitingForSlot(maxInProgress), tone: 'muted' };
  // Only an agent at an AI station calls a model; at the gate and beyond, scripts and GitHub work.
  // What the agent does: the model it calls, or else the tool it runs.
  const atAi = item.box === 'brief' || item.box === 'implementation' || item.box === 'diagnostic';
  const called = atAi ? calledModel(agent) : null;
  if (agent && called)
    return { text: t.line.graph.calls(agent.profile, called.model), tone: 'muted' };
  if (atAi && agent?.action) {
    const { label, detail } = agent.action;
    return { text: `${text(label)}${detail ? ` · ${detail}` : ''}`, tone: 'muted' };
  }
  if (issue.status === 'active' && STATION_TEXT.has(issue.station))
    return {
      text: t.line.graph.atStation[issue.station as 'gate' | 'review' | 'merge' | 'ci' | 'deploy'],
      tone: 'muted',
    };
  return null;
}

function IssueRow({
  item,
  row,
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
  const detail = useDetail(item, maxInProgress);
  const finished = issue.status === 'done' || issue.status === 'stopped';
  // How long it has stood at its station; for a finished issue, how long ago it finished.
  const since = finished
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

export function ModelsBox({ box, rows }: { box: Box; rows: readonly ProviderRow[] }) {
  const { t } = useI18n();
  return (
    <motion.div
      className={styles.box}
      data-box="models"
      initial={false}
      animate={{ top: box.y, height: box.h }}
      transition={MOVE_TRANSITION}
      style={{ left: box.x, width: box.w }}
    >
      <div className={styles.head} style={{ height: box.head }} title={t.line.graph.providersTitle}>
        <span className={styles.headLine}>
          <SparkleFillIcon size={16} className={styles.headIcon} aria-hidden="true" />
          <span className={styles.headName}>{t.line.graph.providers}</span>
        </span>
        <span className={styles.headTypes}>{t.line.graph.providersHint}</span>
      </div>
      <ul className={styles.providers}>
        {rows.length === 0 ? (
          <li className={styles.empty}>{t.line.graph.empty}</li>
        ) : (
          rows.map((row) => (
            <li
              key={`${row.lane ? 'lane' : 'agent'}|${row.model.provider ?? ''}|${row.model.model}`}
              className={styles.provider}
              data-busy={row.busy ? '' : undefined}
            >
              <ModelBadge model={row.model} lane={row.lane} />
              <span className={styles.serves}>
                {t.line.graph.serves(
                  row.stations.map((station) => t.station[station]).join(', '),
                  row.agents.join(', '),
                )}
              </span>
            </li>
          ))
        )}
      </ul>
    </motion.div>
  );
}
