import type { TranscriptEntry, TranscriptView } from '@factory-live/contracts';
import {
  CommentDiscussionIcon,
  CpuIcon,
  InfoIcon,
  LightBulbIcon,
  PersonIcon,
  ToolsIcon,
} from '@primer/octicons-react';
import { SegmentedControl } from '@primer/react';
import { useMemo, useState } from 'react';
import { useTranscripts } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { Messages } from '../../i18n/fr.ts';
import { AnsiLog } from '../../ui/AnsiLog.tsx';
import { Markdown } from '../../ui/Markdown.tsx';
import { ModelBadge } from '../../ui/ModelBadge.tsx';
import styles from './issues.module.css';

const ROLE_ICON = {
  user: PersonIcon,
  assistant: CommentDiscussionIcon,
  reasoning: LightBulbIcon,
  tool_call: ToolsIcon,
  tool_result: CpuIcon,
  system: InfoIcon,
} as const;

type ViewChoice =
  { kind: 'entries'; view: TranscriptView } | { kind: 'terminal'; view: TranscriptView };

function labelForView(view: TranscriptView, t: Messages, unnamedIndex: number): string {
  // If the lane has a name (custom-title), use it
  if (view.name && view.name.trim()) {
    // If the name contains a role (e.g., "Implementation: name"), extract the role
    const colonIdx = view.name.indexOf(':');
    if (colonIdx > 0 && colonIdx <= 20) {
      return `Claude Code : ${view.name}`;
    }
    return view.name;
  }
  // Otherwise, generate a distinct label based on index
  if (unnamedIndex === 0) return t.transcript.source['claude-code'];
  return `${t.transcript.source['claude-code']} ${unnamedIndex + 1}`;
}

function choices(
  views: readonly TranscriptView[],
  t: Messages,
): { label: string; choice: ViewChoice; startedAt: number | null }[] {
  // Sort by startedAt (launch time), nulls last
  const sorted = [...views].sort((a, b) => {
    if (a.startedAt === null && b.startedAt === null) return 0;
    if (a.startedAt === null) return 1;
    if (b.startedAt === null) return -1;
    return a.startedAt - b.startedAt;
  });

  const result: { label: string; choice: ViewChoice; startedAt: number | null }[] = [];
  let unnamedClaudeIndex = 0;
  for (const view of sorted) {
    if (view.source === 'hermes') {
      result.push({
        label: t.transcript.source.hermes,
        choice: { kind: 'entries', view },
        startedAt: view.startedAt,
      });
    } else if (view.source === 'claude-code' || view.source === 'opencode') {
      const label = labelForView(view, t, unnamedClaudeIndex);
      result.push({ label, choice: { kind: 'entries', view }, startedAt: view.startedAt });
      unnamedClaudeIndex++;
    }
  }
  const terminal = views.find((view) => view.terminal.length > 0);
  if (terminal)
    result.push({
      label: t.transcript.source.terminal,
      choice: { kind: 'terminal', view: terminal },
      startedAt: terminal.startedAt,
    });
  return result;
}

function Entry({ entry }: { entry: TranscriptEntry }) {
  const { t, fmt } = useI18n();
  const Icon = ROLE_ICON[entry.role];
  const long = (entry.text?.length ?? 0) > 280 || (entry.text?.split('\n').length ?? 0) > 6;
  const body =
    entry.role === 'assistant' && entry.text ? (
      <Markdown>{entry.text}</Markdown>
    ) : entry.text ? (
      <pre className={styles.entryText}>{entry.text}</pre>
    ) : null;
  return (
    <li className={styles.entry} data-role={entry.role} data-status={entry.status ?? undefined}>
      <span className={styles.entryIcon}>
        <Icon size={14} aria-hidden="true" />
      </span>
      <div className={styles.entryBody}>
        <p className={styles.entryHead}>
          <span className={styles.entryRole}>{t.transcript.role[entry.role]}</span>
          {entry.toolName ? <code className={styles.entryTool}>{entry.toolName}</code> : null}
          {entry.model ? <ModelBadge model={{ model: entry.model }} /> : null}
          <time className={styles.entryTime} dateTime={entry.at}>
            {fmt.clock(entry.at)}
          </time>
        </p>
        {long ? (
          <details className={styles.entryDetails}>
            <summary className={styles.entrySummary}>
              {t.transcript.showAll(fmt.integer(entry.text?.length ?? 0))}
            </summary>
            {body}
          </details>
        ) : (
          body
        )}
      </div>
    </li>
  );
}

/** Full transcript of a run, on demand: Hermès session, CLI lane, or raw log. */
export function TranscriptPanel({ runId }: { runId: number }) {
  const { t, text } = useI18n();
  const views = useTranscripts(runId);
  const [index, setIndex] = useState(0);
  const options = useMemo(() => choices(views ?? [], t), [views, t]);
  if (!views || views.length === 0) {
    return <p className={styles.muted}>{t.transcript.notKept}</p>;
  }
  const current = options[Math.min(index, options.length - 1)];
  return (
    <div className={styles.transcript}>
      <SegmentedControl
        aria-label={t.transcript.sourceLabel}
        className={styles.sources}
        size="small"
        onChange={(next) => setIndex(next ?? 0)}
      >
        {options.map((option, optionIndex) => (
          <SegmentedControl.Button
            key={`${option.choice.kind}-${option.choice.view.source}-${optionIndex}`}
            selected={optionIndex === Math.min(index, options.length - 1)}
          >
            {option.label}
          </SegmentedControl.Button>
        ))}
      </SegmentedControl>
      {current?.choice.kind === 'terminal' ? (
        <AnsiLog lines={current.choice.view.terminal} label={t.transcript.rawLog(runId)} />
      ) : current ? (
        <>
          <p className={styles.muted}>{text(current.choice.view.title)}</p>
          {/* Most recent at top, in a self-scrolling box: the page no longer grows with the run. */}
          <div
            className={styles.entriesFrame}
            role="region"
            aria-label={text(current.choice.view.title)}
            tabIndex={0}
          >
            <ol className={styles.entries} reversed>
              {[...current.choice.view.entries].reverse().map((entry) => (
                <Entry key={entry.id} entry={entry} />
              ))}
            </ol>
          </div>
        </>
      ) : null}
      <p className={styles.redaction}>{t.transcript.redaction}</p>
    </div>
  );
}
