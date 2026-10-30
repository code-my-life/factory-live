import type {
  Actor,
  Cause,
  Diagnosis,
  Evidence,
  Finding,
  RunVerdict,
  Setting,
  Step,
  UnblockProgress,
  WorkState,
} from '@factory-live/contracts';
import { CheckIcon, ChevronRightIcon } from '@primer/octicons-react';
import { Label } from '@primer/react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { BranchBadge } from '../../ui/badge/BranchBadge.tsx';
import { PullRequestBadge } from '../../ui/badge/PullRequestBadge.tsx';
import { SourceBadge } from '../../ui/badge/SourceBadge.tsx';
import type { SourceKind } from '../../ui/badge/SourceBadge.tsx';
import { CopyCommand } from '../../ui/CopyCommand.tsx';
import { prNumberOfUrl } from '../../ui/paths.ts';
import styles from './diagnosis.module.css';

type LabelVariant = 'accent' | 'attention' | 'danger' | 'secondary' | 'success';

/** Qui agit : toi en couleur d'accent, l'agent et l'attente en gris, sans concurrencer la gravité. */
const ACTOR_TONE: Record<Actor, LabelVariant> = {
  you_factory: 'accent',
  you_answer: 'accent',
  agent: 'secondary',
  wait: 'secondary',
};

function CauseBadge({ cause }: { cause: Cause }) {
  const { t, fmt } = useI18n();
  if (cause.state === 'none') return null;
  if (cause.state === 'present') return <Label variant="danger">{t.diagnosis.cause.present}</Label>;
  if (cause.state === 'unknown')
    return <Label variant="secondary">{t.diagnosis.cause.unknown}</Label>;
  return (
    <Label variant="success">
      {t.diagnosis.cause.fixed(fmt.clock(cause.at))}
      {cause.verified ? ` · ${t.diagnosis.cause.verified}` : ''}
    </Label>
  );
}

function SettingFacts({ setting }: { setting: Setting }) {
  const { t, fmt } = useI18n();
  const value = (seconds: number) =>
    setting.unit === 'turns' ? t.agents.turns(seconds) : fmt.duration(seconds * 1000);
  const configured = (current: number | null) =>
    current !== null
      ? value(current)
      : setting.defaultValue !== null
        ? t.diagnosis.setting.unset(value(setting.defaultValue))
        : t.diagnosis.setting.none;
  const effective =
    setting.effective !== null && setting.effective !== (setting.current ?? setting.defaultValue)
      ? setting.effective
      : null;
  return (
    <div className={styles.setting}>
      <p className={styles.settingKey}>
        <code className={styles.settingName}>{setting.key}</code>
        <span className={styles.muted}>· {setting.profile}</span>
      </p>
      <dl className={styles.settingValues}>
        {setting.observed !== null ? (
          <div className={styles.settingValue}>
            <dt className={styles.settingTerm}>{t.diagnosis.setting.observed}</dt>
            <dd className={styles.settingData}>{value(setting.observed)}</dd>
          </div>
        ) : null}
        <div className={styles.settingValue}>
          <dt className={styles.settingTerm}>{t.diagnosis.setting.current}</dt>
          <dd className={styles.settingData}>
            {configured(setting.current)}
            {effective !== null ? (
              <span className={styles.settingNote}>
                {' '}
                ({t.diagnosis.setting.effective} {value(effective)})
              </span>
            ) : null}
          </dd>
        </div>
        <div className={styles.settingValue}>
          <dt className={styles.settingTerm}>{t.diagnosis.setting.repo}</dt>
          <dd className={styles.settingData}>{configured(setting.repo)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Steps({ steps }: { steps: readonly Step[] }) {
  const { t, text } = useI18n();
  return (
    <ol className={styles.steps}>
      {steps.map((step, index) => (
        <li key={index} className={styles.step} data-done={step.done ? 'true' : undefined}>
          <span className={styles.stepMark} aria-hidden="true">
            {step.done ? <CheckIcon size={12} /> : index + 1}
          </span>
          <span className={styles.stepBody}>
            <span>
              {text(step.text)}
              {step.done ? (
                <span className="fl-visually-hidden"> ({t.diagnosis.cause.verified})</span>
              ) : null}
            </span>
            {step.command && !step.done ? <CopyCommand command={step.command} compact /> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Where a piece of evidence comes from: the kanban, GitHub (webhook), or Hermes (sessions, journal, config, plugins, worktree). */
const SOURCE_KIND: Record<Evidence['source'], SourceKind> = {
  kanban: 'kanban',
  transcript: 'hermes',
  webhook: 'github',
  agent_log: 'hermes',
  config: 'hermes',
  plugin: 'hermes',
  workspace: 'hermes',
};

function EvidenceList({ evidence }: { evidence: readonly Evidence[] }) {
  const { t, fmt, text } = useI18n();
  return (
    <ul className={styles.evidence}>
      {evidence.map((item, index) => (
        <li key={index} className={styles.evidenceItem}>
          <span className={styles.evidenceHead}>
            <SourceBadge kind={SOURCE_KIND[item.source]} name={t.diagnosis.source[item.source]} />
            {item.at ? (
              <span className={styles.muted}>
                {item.until
                  ? t.diagnosis.between(fmt.clock(item.at), fmt.clock(item.until))
                  : fmt.clock(item.at)}
              </span>
            ) : null}
            {item.runId !== null ? (
              <span className={`${styles.muted} fl-mono`}>#{item.runId}</span>
            ) : null}
          </span>
          <span className={styles.evidenceFact}>{text(item.fact)}</span>
          {item.quote ? <code className={styles.quote}>{item.quote}</code> : null}
        </li>
      ))}
    </ul>
  );
}

function Runs({ runs, primary }: { runs: readonly RunVerdict[]; primary: Finding['code'] }) {
  const { t, text } = useI18n();
  return (
    <ul className={styles.runs}>
      {runs.map((run) => (
        <li key={run.runId} className={styles.run}>
          <span className="fl-mono">#{run.runId}</span>
          <span className={styles.runText}>{text(run.text)}</span>
          {run.finding === primary ? (
            <Label size="small" variant="attention">
              {t.diagnosis.primaryCause}
            </Label>
          ) : run.finding ? (
            <Label size="small" variant="secondary">
              {t.diagnosis.otherFinding}
            </Label>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Work({ work, repo }: { work: WorkState; repo: string | undefined }) {
  const { t } = useI18n();
  // A URL with no PR number is not a PR we can name: it is treated as no PR.
  const prNumber = work.prUrl ? prNumberOfUrl(work.prUrl) : null;
  const facts = [
    work.commits === 'none' && work.commitsRefused > 0
      ? `${t.diagnosis.commits.none} (${t.diagnosis.commitsRefused(work.commitsRefused)})`
      : t.diagnosis.commits[work.commits],
    t.diagnosis.pushed[work.pushed],
    work.editedFiles > 0 ? t.diagnosis.editedFiles(work.editedFiles) : null,
    work.evidence.length > 0 ? t.diagnosis.evidenceFiles(work.evidence.length) : null,
  ].filter((fact): fact is string => fact !== null);
  return (
    <dl className={styles.work}>
      <div className={styles.workItem}>
        <dt className={styles.workTerm}>{t.diagnosis.branch}</dt>
        <dd className={styles.workData}>
          {work.branch ? (
            <BranchBadge repo={repo} name={work.branch} />
          ) : (
            <span className="fl-mono">{t.diagnosis.noBranch}</span>
          )}
        </dd>
      </div>
      <div className={styles.workItem}>
        <dt className={styles.workTerm}>{t.diagnosis.work}</dt>
        <dd className={styles.workData}>{facts.join(' · ')}</dd>
      </div>
      <div className={styles.workItem}>
        <dt className={styles.workTerm}>{t.diagnosis.pr}</dt>
        <dd className={styles.workData}>
          {work.prUrl && prNumber !== null ? (
            <PullRequestBadge repo={repo} number={prNumber} url={work.prUrl} />
          ) : (
            t.diagnosis.noPr
          )}
        </dd>
      </div>
    </dl>
  );
}

function OtherFinding({ finding }: { finding: Finding }) {
  const { t, text } = useI18n();
  return (
    <li className={styles.other}>
      <span className={styles.otherHead}>
        <strong>{text(finding.summary)}</strong>
        <Label size="small" variant={ACTOR_TONE[finding.actor]}>
          {t.diagnosis.actor[finding.actor]}
        </Label>
      </span>
      <span className={styles.muted}>{text(finding.why)}</span>
    </li>
  );
}

/**
 * Le diagnostic d'un blocage, calculé par des règles sur les sources d'Hermès : la cause et son
 * mécanisme, qui agit, si « Débloquer » suffit, le réglage en cause, quoi faire, puis les preuves.
 */
export function DiagnosisPanel({
  diagnosis,
  repo,
  unblocked = null,
}: {
  diagnosis: Diagnosis;
  /** The issue's repository: the hue of the branch and the PR. */
  repo?: string | undefined;
  /** Où en est la réponse déjà postée : elle remplace le conseil « Débloquer suffit ? ». */
  unblocked?: UnblockProgress['state'] | null;
}) {
  const { t, text } = useI18n();
  const { primary } = diagnosis;
  const missing = (Object.keys(diagnosis.sources) as (keyof Diagnosis['sources'])[]).filter(
    (source) => !diagnosis.sources[source],
  );
  return (
    <section className={styles.panel} aria-label={t.diagnosis.label}>
      <div className={styles.section}>
        <p className={styles.kicker}>
          {t.diagnosis.why}
          {primary.confidence === 'likely' ? (
            <Label size="small" variant="secondary">
              {t.diagnosis.confidence.likely}
            </Label>
          ) : null}
        </p>
        <p className={styles.why}>{text(primary.why)}</p>
      </div>

      <dl className={`${styles.section} ${styles.verdict}`}>
        <div className={styles.verdictItem}>
          <dt className={styles.kicker}>{t.diagnosis.who}</dt>
          <dd className={styles.verdictValue}>
            <Label variant={ACTOR_TONE[primary.actor]}>{t.diagnosis.actor[primary.actor]}</Label>
          </dd>
        </div>
        <div className={styles.verdictItem}>
          <dt className={styles.kicker}>{t.diagnosis.enough}</dt>
          <dd className={styles.verdictValue}>
            <CauseBadge cause={primary.cause} />
            <span>
              {unblocked
                ? t.interventions.progress[unblocked]
                : t.diagnosis.advice[diagnosis.unblock.when]}
            </span>
            {!unblocked &&
            diagnosis.unblock.when === 'after_fix' &&
            diagnosis.unblock.nextBlock === 'triage' ? (
              <span className={styles.warning}>{t.diagnosis.nextTriage}</span>
            ) : null}
            {primary.cause.state === 'fixed' && primary.cause.durable === false ? (
              <span className={styles.warning}>{t.diagnosis.cause.notDurable}</span>
            ) : null}
          </dd>
        </div>
      </dl>

      {primary.setting ? (
        <div className={styles.section}>
          <SettingFacts setting={primary.setting} />
        </div>
      ) : null}

      {primary.steps.length > 0 ? (
        <div className={styles.section}>
          <p className={styles.kicker}>{t.diagnosis.todo}</p>
          <Steps steps={primary.steps} />
        </div>
      ) : null}

      {diagnosis.work ? (
        <div className={styles.section}>
          <Work work={diagnosis.work} repo={repo} />
        </div>
      ) : null}

      {primary.evidence.length > 0 ? (
        <details className={styles.more}>
          <summary className={styles.summary}>
            <ChevronRightIcon size={16} className={styles.chevron} aria-hidden="true" />
            {t.diagnosis.evidence}
            <span className={styles.muted}>
              {t.diagnosis.evidenceCount(primary.evidence.length)}
            </span>
          </summary>
          <EvidenceList evidence={primary.evidence} />
        </details>
      ) : null}

      {diagnosis.runs.length > 0 ? (
        <details className={styles.more}>
          <summary className={styles.summary}>
            <ChevronRightIcon size={16} className={styles.chevron} aria-hidden="true" />
            {t.diagnosis.runs}
            <span className={styles.muted}>{diagnosis.runs.length}</span>
          </summary>
          <Runs runs={diagnosis.runs} primary={primary.code} />
        </details>
      ) : null}

      {diagnosis.others.length > 0 ? (
        <details className={styles.more}>
          <summary className={styles.summary}>
            <ChevronRightIcon size={16} className={styles.chevron} aria-hidden="true" />
            {t.diagnosis.others}
            <span className={styles.muted}>{diagnosis.others.length}</span>
          </summary>
          <ul className={styles.others}>
            {diagnosis.others.map((finding, index) => (
              <OtherFinding key={index} finding={finding} />
            ))}
          </ul>
        </details>
      ) : null}

      {missing.length > 0 ? (
        <p className={`${styles.section} ${styles.muted}`}>
          {t.diagnosis.missingSources(
            missing.map((source) => t.diagnosis.sourceName[source]).join(', '),
          )}
        </p>
      ) : null}
    </section>
  );
}
