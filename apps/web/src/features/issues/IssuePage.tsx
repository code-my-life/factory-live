import type { CardView, IssueDetail, RunView, TimelineEntry } from '@factory-live/contracts';
import {
  ArrowLeftIcon,
  BellIcon,
  CheckCircleIcon,
  CommentIcon,
  GitPullRequestIcon,
  InfoIcon,
  LinkExternalIcon,
  WorkflowIcon,
  XCircleIcon,
} from '@primer/octicons-react';
import {
  Banner,
  Button,
  Heading,
  Label,
  LabelGroup,
  Link as PrimerLink,
  UnderlineNav,
} from '@primer/react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useIssueDetail, useSnapshot } from '../../data/FactoryProvider.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { ModelBadge } from '../../ui/ModelBadge.tsx';
import { formatClock, formatCompact, formatDuration, formatUsd } from '../../ui/format.ts';
import { INTERVENTION_LABEL, ISSUE_STATUS_LABEL, STATION_LABEL } from '../../ui/vocabulary.ts';
import { CARD_STATUS_LABEL, RUN_ROLE_LABEL, shortCardTitle } from './cardText.ts';
import { IssueGraph } from './IssueGraph.tsx';
import { issueKeyFromParams } from './paths.ts';
import { PullRequestPanel } from './PullRequestPanel.tsx';
import { TranscriptPanel } from './TranscriptPanel.tsx';
import styles from './issues.module.css';

type Tab = 'activity' | 'transcript' | 'pr' | 'costs' | 'evidence';

const TABS: { id: Tab; label: string }[] = [
  { id: 'activity', label: 'Activité' },
  { id: 'transcript', label: 'Transcription' },
  { id: 'pr', label: 'PR et CI' },
  { id: 'costs', label: 'Coûts' },
  { id: 'evidence', label: 'Preuves' },
];

const TONE_ICON = {
  neutral: InfoIcon,
  success: CheckCircleIcon,
  attention: BellIcon,
  danger: XCircleIcon,
  done: CheckCircleIcon,
} as const;

const SOURCE_ICON = {
  kanban: WorkflowIcon,
  hermes: InfoIcon,
  github: GitPullRequestIcon,
  comment: CommentIcon,
  'factory-live': BellIcon,
} as const;

function defaultCard(detail: IssueDetail): CardView | null {
  return (
    detail.cards.find((card) => card.status === 'running' || card.status === 'review') ??
    detail.cards.find((card) => card.status === 'blocked') ??
    detail.cards.at(-1) ??
    null
  );
}

function Timeline({ entries }: { entries: readonly TimelineEntry[] }) {
  const ordered = [...entries].sort((left, right) => right.at.localeCompare(left.at));
  return (
    <ol className={styles.timeline}>
      {ordered.map((entry) => {
        const Icon = entry.tone === 'neutral' ? SOURCE_ICON[entry.source] : TONE_ICON[entry.tone];
        return (
          <li key={entry.id} className={styles.timelineItem} data-tone={entry.tone}>
            <span className={styles.timelineBadge}>
              <Icon size={14} aria-hidden="true" />
            </span>
            <div className={styles.timelineBody}>
              <p className={styles.timelineLabel}>
                {entry.profile ? <strong>{entry.profile}</strong> : null} {entry.label}
              </p>
              {entry.detail ? <p className={styles.timelineDetail}>{entry.detail}</p> : null}
            </div>
            <time className={styles.timelineTime} dateTime={entry.at}>
              {formatClock(entry.at)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}

function RunsTable({
  card,
  selectedRunId,
  onSelectRun,
}: {
  card: CardView;
  selectedRunId: number | null;
  onSelectRun: (runId: number) => void;
}) {
  if (card.runs.length === 0) {
    return <p className={styles.muted}>Cette carte n’a pas encore tourné.</p>;
  }
  return (
    <div className={styles.tableBox}>
      <table className={styles.table}>
        <caption className="fl-visually-hidden">Runs de la carte {card.id}</caption>
        <thead>
          <tr>
            <th scope="col">Run</th>
            <th scope="col">Profil</th>
            <th scope="col">Modèle</th>
            <th scope="col">Résultat</th>
            <th scope="col">Durée</th>
            <th scope="col">
              <span className="fl-visually-hidden">Transcription</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...card.runs].reverse().map((run: RunView) => (
            <tr key={run.id} data-selected={run.id === selectedRunId ? 'true' : undefined}>
              <td className="fl-mono">#{run.id}</td>
              <td>
                {run.profile}
                <span className={styles.cellNote}>{RUN_ROLE_LABEL[run.role]}</span>
              </td>
              <td className={styles.modelCell}>
                {run.model ? <ModelBadge model={run.model} /> : '?'}
                {run.laneModel ? <ModelBadge model={run.laneModel} prefix="lane" emphasis /> : null}
              </td>
              <td>
                {run.outcome ?? 'en cours'}
                {run.summary ? <span className={styles.cellNote}>{run.summary}</span> : null}
              </td>
              <td className="fl-tabular">
                {run.endedAt ? (
                  formatDuration(Date.parse(run.endedAt) - Date.parse(run.startedAt))
                ) : (
                  <Elapsed since={run.startedAt} />
                )}
              </td>
              <td>
                <Button size="small" onClick={() => onSelectRun(run.id)}>
                  Transcription
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EVIDENCE: Record<string, string[]> = {
  impl: [
    'evidence/brief.md',
    'evidence/01-fail-on-base.txt',
    'evidence/10-claude-run.json',
    'evidence/11-cli-diff.patch',
    'evidence/04-tests-after.txt',
    'evidence/pr-body.md',
  ],
  brief: ['evidence/brief-input.md', 'evidence/brief-claude.json'],
  release: ['evidence/gate/1/review.md', 'evidence/gate/1/claude-verdict.json'],
};

export function IssuePage() {
  const params = useParams();
  const navigate = useNavigate();
  const key = issueKeyFromParams(params.repo, params.number);
  const detail = useIssueDetail(key ?? 'inconnue#0');
  const snapshot = useSnapshot();
  const [tab, setTab] = useState<Tab>('activity');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  if (!key || !detail) {
    return (
      <section className={styles.page}>
        <Heading as="h1" variant="medium">
          Issue introuvable
        </Heading>
        <p>
          <Link to="/issues">Revenir à la liste des issues</Link>
        </p>
      </section>
    );
  }

  const { issue } = detail;
  const selectedCard =
    detail.cards.find((card) => card.id === selectedCardId) ?? defaultCard(detail);
  const runForTranscript =
    selectedRunId ??
    selectedCard?.runs.at(-1)?.id ??
    detail.cards.flatMap((card) => card.runs).at(-1)?.id ??
    null;
  const interventions = snapshot.interventions.filter(
    (intervention) => intervention.issueKey === key,
  );
  const agents = snapshot.agents.filter((agent) => agent.issueKey === key);
  const elapsedEnd = issue.status === 'done' ? Date.parse(issue.updatedAt) : null;

  return (
    <article className={styles.page}>
      <nav aria-label="Fil d’Ariane">
        <Link to="/issues" className={styles.back}>
          <ArrowLeftIcon size={14} /> Issues
        </Link>
      </nav>

      <header className={styles.issueHead}>
        <p className={styles.issueKey}>{issue.key}</p>
        <Heading as="h1" variant="medium" className={styles.issueTitle}>
          {issue.title}
        </Heading>
        <div className={styles.issueMeta}>
          <Label
            variant={
              issue.status === 'waiting_human' || issue.status === 'blocked'
                ? 'attention'
                : issue.status === 'done'
                  ? 'done'
                  : 'accent'
            }
          >
            {ISSUE_STATUS_LABEL[issue.status]}
          </Label>
          <span className={styles.metaText}>Étape : {STATION_LABEL[issue.station]}</span>
          <LabelGroup>
            {issue.labels.map((label) => (
              <Label key={label} variant="secondary">
                {label}
              </Label>
            ))}
          </LabelGroup>
          <PrimerLink href={issue.url} target="_blank" rel="noreferrer" className={styles.external}>
            Issue sur GitHub <LinkExternalIcon size={12} />
          </PrimerLink>
        </div>
      </header>

      <dl className={styles.facts}>
        <div>
          <dt>Harnais</dt>
          <dd>{issue.harness ?? 'choisi au brief'}</dd>
        </div>
        <div>
          <dt>Modèle Claude</dt>
          <dd className="fl-mono">{issue.claudeModel ?? 'aucun (pas de label claude)'}</dd>
        </div>
        <div>
          <dt>PR</dt>
          <dd>
            {issue.pr ? (
              <PrimerLink href={issue.pr.url} target="_blank" rel="noreferrer">
                #{issue.pr.number} · {issue.pr.state} · CI {issue.pr.checks}
              </PrimerLink>
            ) : (
              'pas encore ouverte'
            )}
          </dd>
        </div>
        <div>
          <dt>Durée</dt>
          <dd className="fl-tabular">
            {elapsedEnd !== null ? (
              formatDuration(elapsedEnd - Date.parse(issue.startedAt))
            ) : (
              <Elapsed since={issue.startedAt} />
            )}
          </dd>
        </div>
        <div>
          <dt>Jetons</dt>
          <dd className="fl-tabular">{formatCompact(detail.tokens)}</dd>
        </div>
        <div>
          <dt>Coût estimé</dt>
          <dd className="fl-tabular">
            {detail.costUsd > 0 ? formatUsd(detail.costUsd) : 'nul (modèles gratuits)'}
          </dd>
        </div>
      </dl>

      {interventions.map((intervention) => (
        <Banner
          key={intervention.id}
          variant={intervention.push ? 'critical' : 'info'}
          title={`${INTERVENTION_LABEL[intervention.kind]} : ${intervention.title}`}
          description="Ta réponse ou ton action est attendue pour que la carte reparte."
          primaryAction={
            <Banner.PrimaryAction
              onClick={() => void navigate(`/interventions/${intervention.id}`)}
            >
              Répondre
            </Banner.PrimaryAction>
          }
        />
      ))}

      <section className={styles.section} aria-labelledby="graph-title">
        <div className={styles.sectionHead}>
          <h2 id="graph-title" className={styles.sectionTitle}>
            Cartes de l’issue
          </h2>
          <span className={styles.muted}>Clique une carte pour voir ses runs.</span>
        </div>
        <IssueGraph
          cards={detail.cards}
          agents={agents}
          selectedCardId={selectedCard?.id ?? null}
          onSelectCard={(cardId) => {
            setSelectedCardId(cardId);
            setSelectedRunId(null);
          }}
        />
        {selectedCard ? (
          <div className={styles.cardPanel}>
            <h3 className={styles.cardPanelTitle}>
              <span className="fl-mono">#{selectedCard.kind}</span> {shortCardTitle(selectedCard)}
              <span className={styles.muted}>
                {' '}
                · {selectedCard.id} · {CARD_STATUS_LABEL[selectedCard.status]} ·{' '}
                {selectedCard.assignee}
              </span>
            </h3>
            {selectedCard.skills.length > 0 ? (
              <p className={styles.muted}>Skills forcées : {selectedCard.skills.join(', ')}</p>
            ) : null}
            <RunsTable
              card={selectedCard}
              selectedRunId={selectedRunId}
              onSelectRun={(runId) => {
                setSelectedRunId(runId);
                setTab('transcript');
              }}
            />
          </div>
        ) : null}
      </section>

      <section className={styles.section}>
        <UnderlineNav aria-label="Détails de l’issue">
          {TABS.map((entry) => (
            <UnderlineNav.Item
              key={entry.id}
              href={`#${entry.id}`}
              aria-current={tab === entry.id ? 'page' : undefined}
              onSelect={(event) => {
                event.preventDefault();
                setTab(entry.id);
              }}
            >
              {entry.label}
            </UnderlineNav.Item>
          ))}
        </UnderlineNav>
        <div className={styles.tabPanel}>
          {tab === 'activity' ? <Timeline entries={detail.timeline} /> : null}
          {tab === 'transcript' ? (
            runForTranscript !== null ? (
              <TranscriptPanel key={runForTranscript} runId={runForTranscript} />
            ) : (
              <p className={styles.muted}>Aucun run pour l’instant.</p>
            )
          ) : null}
          {tab === 'pr' ? <PullRequestPanel issue={issue} /> : null}
          {tab === 'costs' ? (
            <div className={styles.tableBox}>
              <table className={styles.table}>
                <caption className="fl-visually-hidden">Consommation par run</caption>
                <thead>
                  <tr>
                    <th scope="col">Run</th>
                    <th scope="col">Profil</th>
                    <th scope="col">Modèle</th>
                    <th scope="col">Jetons</th>
                    <th scope="col">Coût</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.cards
                    .flatMap((card) => card.runs)
                    .map((run) => (
                      <tr key={run.id}>
                        <td className="fl-mono">#{run.id}</td>
                        <td>{run.profile}</td>
                        <td className="fl-mono">
                          {run.laneModel?.model ?? run.model?.model ?? '?'}
                        </td>
                        <td className="fl-tabular">
                          {run.tokens !== null ? formatCompact(run.tokens) : '?'}
                        </td>
                        <td className="fl-tabular">
                          {run.costUsd !== null ? formatUsd(run.costUsd) : 'gratuit'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {tab === 'evidence' ? (
            <div className={styles.evidence}>
              <p className={styles.muted}>
                Fichiers de preuve de la carte sélectionnée ({selectedCard?.id ?? 'aucune'}), lus
                dans son worktree ou dans les preuves archivées par la gate.
              </p>
              <ul className={styles.evidenceList}>
                {(EVIDENCE[selectedCard?.kind ?? 'impl'] ?? []).map((file) => (
                  <li key={file} className="fl-mono">
                    {file}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </article>
  );
}
