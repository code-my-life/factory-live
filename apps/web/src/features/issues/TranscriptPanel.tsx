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
import { useState } from 'react';
import { useTranscripts } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { Messages } from '../../i18n/fr.ts';
import { AnsiLog } from '../../ui/AnsiLog.tsx';
import { Markdown } from '../../ui/Markdown.tsx';
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

function choices(
  views: readonly TranscriptView[],
  t: Messages,
): { label: string; choice: ViewChoice }[] {
  const result: { label: string; choice: ViewChoice }[] = [];
  for (const view of views) {
    result.push({ label: t.transcript.source[view.source], choice: { kind: 'entries', view } });
  }
  const terminal = views.find((view) => view.terminal.length > 0);
  if (terminal)
    result.push({
      label: t.transcript.source.terminal,
      choice: { kind: 'terminal', view: terminal },
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
          {entry.model ? <span className={styles.entryModel}>{entry.model}</span> : null}
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

/** Transcription intégrale d'un run, à la demande : session Hermès, lane CLI, ou log brut. */
export function TranscriptPanel({ runId }: { runId: number }) {
  const { t } = useI18n();
  const views = useTranscripts(runId);
  const [index, setIndex] = useState(0);
  if (!views || views.length === 0) {
    return <p className={styles.muted}>{t.transcript.notKept}</p>;
  }
  const options = choices(views, t);
  const current = options[Math.min(index, options.length - 1)];
  return (
    <div className={styles.transcript}>
      <SegmentedControl
        aria-label={t.transcript.sourceLabel}
        size="small"
        onChange={(next) => setIndex(next ?? 0)}
      >
        {options.map((option, optionIndex) => (
          <SegmentedControl.Button
            key={option.label}
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
          <p className={styles.muted}>{current.choice.view.title}</p>
          {/* Le plus récent en haut, dans une boîte qui défile seule : la page ne s'allonge plus avec le run. */}
          <div
            className={styles.entriesFrame}
            role="region"
            aria-label={current.choice.view.title}
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
