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

function labelForView(view: TranscriptView, t: Messages, labelCounts: Map<string, number>): string {
  // If the lane has a name (custom-title), extract the role
  let base: string;
  if (view.name && view.name.trim()) {
    const colonIdx = view.name.indexOf(':');
    if (colonIdx > 0 && colonIdx <= 20) {
      base = view.name.slice(0, colonIdx).trim();
    } else {
      base = t.transcript.source['claude-code'];
    }
  } else {
    base = t.transcript.source['claude-code'];
  }

  // Number duplicates globally across ALL labels
  const count = labelCounts.get(base) ?? 0;
  labelCounts.set(base, count + 1);
  return count === 0 ? base : `${base} ${count + 1}`;
}

function legendForView(
  view: TranscriptView,
  t: Messages,
  allViews: readonly TranscriptView[],
  currentIndex: number,
  fmt: ReturnType<typeof useI18n>['fmt'],
): string {
  // Only claude-code/opencode lanes get the lane legend
  if (view.source !== 'claude-code' && view.source !== 'opencode') {
    return typeof view.title === 'string' ? view.title : view.title.code;
  }

  // Count only claude-code lanes for ranking
  const claudeViews = allViews.filter((v) => v.source === 'claude-code' || v.source === 'opencode');
  const rank = claudeViews.findIndex((v) => v === view);
  const total = claudeViews.length;

  const parts: string[] = [];

  // "Lane Claude Code" or "Lane Claude Code 2 sur 3"
  if (total === 1) {
    parts.push(t.transcript.legend.single(t.transcript.source['claude-code']));
  } else {
    parts.push(t.transcript.legend.withRank(t.transcript.source['claude-code'], rank + 1, total));
  }

  // Lane name if present
  if (view.name && view.name.trim()) {
    parts.push(`« ${view.name.trim()} »`);
  }

  // Time range
  if (view.startedAt !== null) {
    const startIso = new Date(view.startedAt).toISOString();
    const start = fmt.clock(startIso);
    if (view.endedAt !== null) {
      const endIso = new Date(view.endedAt).toISOString();
      const end = fmt.clock(endIso);
      const duration = fmt.duration(view.endedAt - view.startedAt);
      parts.push(`de ${start} à ${end} (${duration})`);
    } else {
      parts.push(`depuis ${start} (en cours)`);
    }
  }

  // Cost if known
  if (view.costUsd !== null) {
    parts.push(fmt.usd(view.costUsd));
  }

  return parts.join(', ');
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
  const labelCounts = new Map<string, number>();
  for (const view of sorted) {
    if (view.source === 'hermes') {
      result.push({
        label: t.transcript.source.hermes,
        choice: { kind: 'entries', view },
        startedAt: view.startedAt,
      });
    } else if (view.source === 'claude-code' || view.source === 'opencode') {
      const label = labelForView(view, t, labelCounts);
      result.push({ label, choice: { kind: 'entries', view }, startedAt: view.startedAt });
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
  const { t, fmt } = useI18n();
  const views = useTranscripts(runId);
  const [index, setIndex] = useState(0);
  const options = useMemo(() => choices(views ?? [], t), [views, t]);
  if (!views || views.length === 0) {
    return <p className={styles.muted}>{t.transcript.notKept}</p>;
  }
  const current = options[Math.min(index, options.length - 1)];
  const legend = current ? legendForView(current.choice.view, t, views ?? [], index, fmt) : '';
  // C11: beyond 6 sources, full-width dropdown at all widths
  const segmentVariant =
    options.length > 6
      ? { narrow: 'dropdown' as const, regular: 'dropdown' as const, wide: 'dropdown' as const }
      : { narrow: 'dropdown' as const, regular: 'default' as const };
  return (
    <div className={styles.transcript}>
      <SegmentedControl
        aria-label={t.transcript.sourceLabel}
        className={styles.sources}
        size="small"
        variant={segmentVariant}
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
      {current ? (
        <>
          <p className={styles.legend}>{legend}</p>
          {current.choice.kind === 'terminal' ? (
            <AnsiLog lines={current.choice.view.terminal} label={t.transcript.rawLog(runId)} />
          ) : (
            <>
              {/* Most recent at top, in a self-scrolling box: the page no longer grows with the run. */}
              <div className={styles.entriesFrame} role="region" aria-label={legend} tabIndex={0}>
                <ol className={styles.entries} reversed>
                  {[...current.choice.view.entries].reverse().map((entry) => (
                    <Entry key={entry.id} entry={entry} />
                  ))}
                </ol>
              </div>
            </>
          )}
        </>
      ) : null}
      <p className={styles.redaction}>{t.transcript.redaction}</p>
    </div>
  );
}
