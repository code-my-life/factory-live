import type { CardView, IssueDetail, RunView } from '@factory-live/contracts';
import { ArrowLeftIcon, IssueOpenedIcon, LinkExternalIcon } from '@primer/octicons-react';
import {
  Banner,
  Button,
  Heading,
  Label,
  LabelGroup,
  Link as PrimerLink,
  Token,
  UnderlineNav,
} from '@primer/react';
import { Blankslate, Table } from '@primer/react/experimental';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useIssueDetail, useSnapshot } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { Messages } from '../../i18n/fr.ts';
import { AgentAvatar } from '../../ui/agents/AgentAvatar.tsx';
import { CardBadge } from '../../ui/badge/CardBadge.tsx';
import { ChecksBadge } from '../../ui/badge/ChecksBadge.tsx';
import { IssueBadge, issueState } from '../../ui/badge/IssueBadge.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { StationMark } from '../../ui/flow/StationMark.tsx';
import { ModelBadge } from '../../ui/ModelBadge.tsx';
import { useMotion } from '../../ui/motion.tsx';
import { ActivityTimeline } from '../../ui/timeline/ActivityTimeline.tsx';
import { fromTimelineEntry } from '../../ui/timeline/rows.ts';
import {
  WorkStateLabel,
  cardWorkState,
  interventionTone,
  issueWorkState,
} from '../../ui/work/workState.tsx';
import { shortCardTitle } from './cardText.ts';
import { IssueGraph } from './IssueGraph.tsx';
import { issueKeyFromParams } from '../../ui/paths.ts';
import { PullRequestPanel, PullRequestState } from './PullRequestPanel.tsx';
import { TranscriptPanel } from './TranscriptPanel.tsx';
import styles from './issues.module.css';

type Tab = keyof Messages['issue']['tabs'];

const TABS: readonly Tab[] = ['activity', 'transcript', 'pr', 'costs', 'evidence'];

function defaultCard(detail: IssueDetail): CardView | null {
  return (
    detail.cards.find((card) => card.status === 'running' || card.status === 'review') ??
    detail.cards.find((card) => card.status === 'blocked') ??
    detail.cards.at(-1) ??
    null
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
  const { t, fmt } = useI18n();
  if (card.runs.length === 0) {
    return <p className={styles.muted}>{t.issue.runs.notYet}</p>;
  }
  const runs = [...card.runs].reverse();
  const duration = (run: RunView) =>
    run.endedAt ? (
      fmt.duration(Date.parse(run.endedAt) - Date.parse(run.startedAt))
    ) : (
      <Elapsed since={run.startedAt} />
    );
  return (
    <>
      {/* Téléphone : une fiche par run, lisible sans défilement de côté ; le tableau prend le relais au-delà. */}
      <ul className={styles.runList} aria-label={t.issue.runs.of(card.id)}>
        {runs.map((run) => (
          <li
            key={run.id}
            className={styles.runItem}
            data-selected={run.id === selectedRunId ? '' : undefined}
          >
            <p className={styles.runHead}>
              <span className="fl-mono">#{run.id}</span>
              <span className={styles.agentCell}>
                <AgentAvatar profile={run.profile} size={16} named />
                {run.profile}
              </span>
              <span className={styles.cellNote}>{t.runRole[run.role]}</span>
              <span className={styles.runDuration}>{duration(run)}</span>
            </p>
            {run.model || run.laneModel ? (
              <p className={styles.runModels}>
                {run.model ? <ModelBadge model={run.model} /> : null}
                {run.laneModel ? <ModelBadge model={run.laneModel} lane /> : null}
              </p>
            ) : null}
            <p className={styles.runOutcome}>
              {run.outcome ?? t.issue.runs.running}
              {run.summary ? <span className={styles.cellNote}>{run.summary}</span> : null}
            </p>
            <Button size="small" onClick={() => onSelectRun(run.id)}>
              {t.issue.runs.transcriptOf(run.id)}
            </Button>
          </li>
        ))}
      </ul>
      <div className={`${styles.tableBox} ${styles.runTable}`}>
        <Table
          gridTemplateColumns="auto auto minmax(0, 2fr) minmax(0, 2fr) auto auto"
          cellPadding="condensed"
          aria-label={t.issue.runs.of(card.id)}
        >
          <Table.Head>
            <Table.Row>
              <Table.Header>{t.issue.runs.run}</Table.Header>
              <Table.Header>{t.issue.runs.agent}</Table.Header>
              <Table.Header>{t.issue.runs.model}</Table.Header>
              <Table.Header>{t.issue.runs.outcome}</Table.Header>
              <Table.Header align="end">{t.issue.runs.duration}</Table.Header>
              <Table.Header>
                <span className="fl-visually-hidden">{t.issue.runs.transcript}</span>
              </Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {runs.map((run) => (
              <Table.Row
                key={run.id}
                className={run.id === selectedRunId ? styles.selectedRow : undefined}
              >
                <Table.Cell className="fl-mono">#{run.id}</Table.Cell>
                <Table.Cell>
                  <span className={styles.cellStack}>
                    <span className={styles.agentCell}>
                      <AgentAvatar profile={run.profile} size={16} named />
                      {run.profile}
                    </span>
                    <span className={styles.cellNote}>{t.runRole[run.role]}</span>
                  </span>
                </Table.Cell>
                <Table.Cell className={styles.modelCell}>
                  {run.model ? <ModelBadge model={run.model} /> : t.common.unknown}
                  {run.laneModel ? <ModelBadge model={run.laneModel} lane /> : null}
                </Table.Cell>
                <Table.Cell>
                  <span className={styles.cellStack}>
                    {run.outcome ?? t.issue.runs.running}
                    {run.summary ? <span className={styles.cellNote}>{run.summary}</span> : null}
                  </span>
                </Table.Cell>
                <Table.Cell align="end" className="fl-tabular">
                  {duration(run)}
                </Table.Cell>
                <Table.Cell>
                  <Button size="small" onClick={() => onSelectRun(run.id)}>
                    {t.issue.runs.transcript}
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>
    </>
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
  const i18n = useI18n();
  const { t, fmt, text } = i18n;
  const params = useParams();
  const navigate = useNavigate();
  const key = issueKeyFromParams(params.repo, params.number);
  const detail = useIssueDetail(key ?? 'inconnue#0');
  const snapshot = useSnapshot();
  const [tab, setTab] = useState<Tab>('activity');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const cardPanel = useRef<HTMLDivElement | null>(null);
  const motion = useMotion();

  if (!key || !detail) {
    // Le même état vide que la page introuvable : Blankslate de Primer, retour à la liste.
    return (
      <Blankslate spacious>
        <Blankslate.Visual>
          <IssueOpenedIcon size="medium" />
        </Blankslate.Visual>
        <Blankslate.Heading as="h1">{t.issue.notFound}</Blankslate.Heading>
        <Blankslate.PrimaryAction onClick={() => void navigate('/issues')}>
          {t.issue.backToList}
        </Blankslate.PrimaryAction>
      </Blankslate>
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
      <nav aria-label={t.issue.breadcrumb}>
        <Link to="/issues" className={styles.back}>
          <ArrowLeftIcon size={14} /> {t.nav.issues}
        </Link>
      </nav>

      <header className={styles.issueHead}>
        <p className={styles.issueKey}>
          <IssueBadge issueKey={issue.key} state={issueState(issue.status)} />
        </p>
        <Heading as="h1" variant="medium" className={styles.issueTitle}>
          {issue.title}
        </Heading>
        <div className={styles.issueMeta}>
          <WorkStateLabel state={issueWorkState(issue, null, t)} />
          <span className={styles.metaText}>
            <StationMark station={issue.station} label={t.issue.stage(t.station[issue.station])} />
          </span>
          <LabelGroup>
            {issue.labels.map((label) => (
              <Label key={label} variant="secondary">
                {label}
              </Label>
            ))}
          </LabelGroup>
          <PrimerLink href={issue.url} target="_blank" rel="noreferrer" className={styles.external}>
            {t.issue.onGitHub} <LinkExternalIcon size={12} />
          </PrimerLink>
        </div>
      </header>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>{t.issue.facts.harness}</dt>
          <dd className={styles.factValue}>{issue.harness ?? t.issue.facts.harnessPending}</dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>{t.issue.facts.claudeModel}</dt>
          <dd className={styles.factValue}>
            {issue.claudeModel ? (
              <ModelBadge model={{ model: issue.claudeModel, provider: 'anthropic' }} lane />
            ) : (
              t.issue.facts.noClaudeModel
            )}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>{t.issue.facts.pr}</dt>
          <dd className={styles.factValue}>
            {issue.pr ? (
              <span className={styles.factBadges}>
                <PullRequestState state={issue.pr.state} size="small" />
                <PrimerLink href={issue.pr.url} target="_blank" rel="noreferrer">
                  #{issue.pr.number}
                </PrimerLink>
                <ChecksBadge checks={issue.pr.checks} />
              </span>
            ) : issue.prUrl ? (
              <>
                <PrimerLink href={issue.prUrl} target="_blank" rel="noreferrer">
                  #{issue.prUrl.split('/').at(-1)}
                </PrimerLink>{' '}
                <span className={styles.muted}>{t.issue.facts.prUnknownState}</span>
              </>
            ) : (
              t.issue.facts.prNotOpened
            )}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>{t.issue.facts.duration}</dt>
          <dd className={styles.factValue}>
            {elapsedEnd !== null ? (
              fmt.duration(elapsedEnd - Date.parse(issue.startedAt))
            ) : (
              <Elapsed since={issue.startedAt} />
            )}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>{t.issue.facts.tokens}</dt>
          <dd className={styles.factValue}>{fmt.compact(detail.tokens)}</dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>{t.issue.facts.cost}</dt>
          <dd className={styles.factValue}>
            {detail.costUsd > 0 ? fmt.usd(detail.costUsd) : t.issue.facts.noCost}
          </dd>
        </div>
      </dl>

      {interventions.map((intervention) => (
        <Banner
          key={intervention.id}
          // La couleur de l'intervention dans sa liste et sur la ligne : rouge si elle bloque, jaune sinon.
          variant={interventionTone(intervention) === 'danger' ? 'critical' : 'warning'}
          title={t.common.labelValue(t.intervention[intervention.kind], text(intervention.title))}
          description={t.issue.bannerDescription}
          primaryAction={
            <Banner.PrimaryAction
              onClick={() => void navigate(`/interventions/${intervention.id}`)}
            >
              {t.issue.reply}
            </Banner.PrimaryAction>
          }
        />
      ))}

      <section className={styles.section} aria-labelledby="graph-title">
        <div className={styles.sectionHead}>
          <h2 id="graph-title" className={styles.sectionTitle}>
            {t.issue.cardsTitle}
          </h2>
          <span className={styles.muted}>{t.issue.cardsHint}</span>
        </div>
        <IssueGraph
          cards={detail.cards}
          agents={agents}
          selectedCardId={selectedCard?.id ?? null}
          onSelectCard={(cardId) => {
            setSelectedCardId(cardId);
            setSelectedRunId(null);
            // Sur téléphone, les runs s'affichent sous la voie, hors de l'écran : on les y amène.
            requestAnimationFrame(() => {
              const panel = cardPanel.current;
              if (panel && panel.getBoundingClientRect().top > window.innerHeight * 0.7)
                panel.scrollIntoView({
                  block: 'start',
                  behavior: motion.enabled && !motion.reduced ? 'smooth' : 'auto',
                });
            });
          }}
        />
        {selectedCard ? (
          <div ref={cardPanel} className={styles.cardPanel}>
            <h3 className={styles.cardPanelTitle}>{shortCardTitle(selectedCard, t)}</h3>
            <p className={styles.cardPanelMeta}>
              <CardBadge kind={selectedCard.kind} id={selectedCard.id} />
              <WorkStateLabel state={cardWorkState(selectedCard, null, t)} />
              <span className={styles.agentCell}>
                {selectedCard.assignee ? (
                  <AgentAvatar profile={selectedCard.assignee} size={16} named />
                ) : null}
                {selectedCard.assignee ?? t.issue.unassigned}
              </span>
            </p>
            {selectedCard.skills.length > 0 ? (
              <p className={styles.cardPanelMeta}>
                <span className={styles.muted}>{t.issue.forcedSkills}</span>
                {selectedCard.skills.map((skill) => (
                  <Token key={skill} text={skill} size="small" />
                ))}
              </p>
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
        {/* Sur téléphone, les onglets défilent de côté plutôt que de se replier dans « More », que Primer n'écrit qu'en anglais. */}
        <div className={styles.tabsScroller}>
          <UnderlineNav aria-label={t.issue.tabsLabel} className={styles.tabs}>
            {TABS.map((entry) => (
              <UnderlineNav.Item
                key={entry}
                href={`#${entry}`}
                aria-current={tab === entry ? 'page' : undefined}
                onSelect={(event) => {
                  event.preventDefault();
                  setTab(entry);
                }}
              >
                {t.issue.tabs[entry]}
              </UnderlineNav.Item>
            ))}
          </UnderlineNav>
        </div>
        <div className={styles.tabPanel}>
          {tab === 'activity' ? (
            <ActivityTimeline
              rows={[...detail.timeline]
                .sort((left, right) => right.at.localeCompare(left.at))
                .map((entry) => fromTimelineEntry(entry, i18n))}
              label={t.issue.activityOf(issue.key)}
            />
          ) : null}
          {tab === 'transcript' ? (
            runForTranscript !== null ? (
              <TranscriptPanel key={runForTranscript} runId={runForTranscript} />
            ) : (
              <p className={styles.muted}>{t.issue.noRun}</p>
            )
          ) : null}
          {tab === 'pr' ? <PullRequestPanel issue={issue} /> : null}
          {tab === 'costs' ? (
            <div className={styles.tableBox}>
              <Table
                gridTemplateColumns="auto auto minmax(12rem, 1fr) auto auto"
                cellPadding="condensed"
                aria-label={t.issue.costs.label}
              >
                <Table.Head>
                  <Table.Row>
                    <Table.Header>{t.issue.costs.run}</Table.Header>
                    <Table.Header>{t.issue.costs.agent}</Table.Header>
                    <Table.Header>{t.issue.costs.model}</Table.Header>
                    <Table.Header align="end">{t.issue.costs.tokens}</Table.Header>
                    <Table.Header align="end">{t.issue.costs.cost}</Table.Header>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {detail.cards
                    .flatMap((card) => card.runs)
                    .map((run) => (
                      <Table.Row key={run.id}>
                        <Table.Cell className="fl-mono">#{run.id}</Table.Cell>
                        <Table.Cell>
                          <span className={styles.agentCell}>
                            <AgentAvatar profile={run.profile} size={16} named />
                            {run.profile}
                          </span>
                        </Table.Cell>
                        <Table.Cell>
                          {run.laneModel ? (
                            <ModelBadge model={run.laneModel} lane overflow="clamp" />
                          ) : run.model ? (
                            <ModelBadge model={run.model} overflow="clamp" />
                          ) : (
                            t.common.unknown
                          )}
                        </Table.Cell>
                        <Table.Cell align="end" className="fl-tabular">
                          {run.tokens !== null ? fmt.compact(run.tokens) : t.common.unknown}
                        </Table.Cell>
                        <Table.Cell align="end" className="fl-tabular">
                          {run.costUsd !== null ? fmt.usd(run.costUsd) : t.common.free}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                </Table.Body>
              </Table>
            </div>
          ) : null}
          {tab === 'evidence' ? (
            <div className={styles.evidence}>
              <p className={styles.muted}>{t.issue.evidence(selectedCard?.id ?? null)}</p>
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
