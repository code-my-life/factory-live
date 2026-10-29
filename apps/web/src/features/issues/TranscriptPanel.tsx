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
import { AnsiLog } from '../../ui/AnsiLog.tsx';
import { Markdown } from '../../ui/Markdown.tsx';
import { formatClock } from '../../ui/format.ts';
import styles from './issues.module.css';

const ROLE_LABEL: Record<TranscriptEntry['role'], string> = {
  user: 'Consigne',
  assistant: 'Réponse',
  reasoning: 'Raisonnement',
  tool_call: 'Appel d’outil',
  tool_result: 'Résultat',
  system: 'Session',
};

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

function choices(views: readonly TranscriptView[]): { label: string; choice: ViewChoice }[] {
  const result: { label: string; choice: ViewChoice }[] = [];
  for (const view of views) {
    result.push({
      label:
        view.source === 'hermes'
          ? 'Session Hermès'
          : view.source === 'claude-code'
            ? 'Claude Code'
            : 'OpenCode',
      choice: { kind: 'entries', view },
    });
  }
  const terminal = views.find((view) => view.terminal.length > 0);
  if (terminal) result.push({ label: 'Terminal', choice: { kind: 'terminal', view: terminal } });
  return result;
}

function Entry({ entry }: { entry: TranscriptEntry }) {
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
          <span className={styles.entryRole}>{ROLE_LABEL[entry.role]}</span>
          {entry.toolName ? <code className={styles.entryTool}>{entry.toolName}</code> : null}
          {entry.model ? <span className={styles.entryModel}>{entry.model}</span> : null}
          <time className={styles.entryTime} dateTime={entry.at}>
            {formatClock(entry.at)}
          </time>
        </p>
        {long ? (
          <details className={styles.entryDetails}>
            <summary className={styles.entrySummary}>
              Afficher en entier ({entry.text?.length ?? 0} caractères)
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
  const views = useTranscripts(runId);
  const [index, setIndex] = useState(0);
  if (!views || views.length === 0) {
    return (
      <p className={styles.muted}>
        Transcription non conservée pour ce run : Hermès purge les sessions des cartes terminées
        après 30 jours.
      </p>
    );
  }
  const options = choices(views);
  const current = options[Math.min(index, options.length - 1)];
  return (
    <div className={styles.transcript}>
      <SegmentedControl
        aria-label="Source de la transcription"
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
        <AnsiLog lines={current.choice.view.terminal} label={`Log brut du run ${runId}`} />
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
      <p className={styles.redaction}>
        Les secrets (jetons, clés, mots de passe) sont masqués avant affichage.
      </p>
    </div>
  );
}
