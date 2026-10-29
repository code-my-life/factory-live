import type { Intervention } from '@factory-live/contracts';
import {
  AlertIcon,
  CheckCircleIcon,
  CheckIcon,
  LinkExternalIcon,
  PaperAirplaneIcon,
  XCircleIcon,
} from '@primer/octicons-react';
import { Button, FormControl, Textarea } from '@primer/react';
import { useState } from 'react';
import { describeError } from '../../data/errors.ts';
import { useFactorySource } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import styles from './interventions.module.css';

const STEPS = ['sent', 'acknowledged', 'resumed'] as const;
const MAX_ANSWER = 4000;

/** Assez de lignes pour lire la réponse préremplie sans défiler, sans dépasser l'écran d'un téléphone. */
function rowsFor(answer: string): number {
  const lines = answer
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 72)), 0);
  return Math.min(16, Math.max(4, lines));
}

/** Le run lancé après le déblocage : en cours, puis son issue, et s'il rebloque pour la même cause. */
function FollowUp({ intervention }: { intervention: Intervention }) {
  const { t, text } = useI18n();
  const followUp = intervention.followUp;
  if (!followUp) return null;
  return (
    <p className={styles.followUp} data-tone={followUp.sameCause ? 'danger' : undefined}>
      <strong>{t.interventions.runAfter}</strong> #{followUp.runId} ·{' '}
      {followUp.outcome
        ? (t.runOutcome[followUp.outcome] ?? followUp.outcome)
        : t.issue.runs.running}
      {followUp.sameCause && intervention.diagnosis ? (
        <span className={styles.stepHint}>{text(intervention.diagnosis.primary.summary)}</span>
      ) : null}
    </p>
  );
}

/**
 * Où en est la réponse postée : envoyée, prise en compte par le bot, carte repartie, ou refusée.
 * Débloquée sans réponse de l'app (Telegram, terminal) : le suivi le dit, sans rien à envoyer.
 */
function Tracking({ intervention }: { intervention: Intervention }) {
  const { t } = useI18n();
  const unblock = intervention.unblock;
  const titleId = `suivi-${intervention.id}`;
  if (!unblock) {
    if (!intervention.resolvedAt) return null;
    return (
      <section className={styles.progress} aria-live="polite" aria-labelledby={titleId}>
        <h3 id={titleId} className={styles.subTitle}>
          {t.interventions.tracking}
        </h3>
        <p className={styles.stepHint}>{t.interventions.resolvedElsewhere}</p>
        <FollowUp intervention={intervention} />
      </section>
    );
  }
  const rejected = unblock.state === 'rejected';
  // Refusée : la réponse a bien été postée, le bot ne l'a pas appliquée.
  const reached = rejected ? 0 : STEPS.findIndex((step) => step === unblock.state);
  return (
    <section className={styles.progress} aria-live="polite" aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.subTitle}>
        {t.interventions.tracking}
      </h3>
      <blockquote className={styles.answer}>{unblock.text}</blockquote>
      <ol className={styles.steps}>
        {STEPS.map((step, index) => (
          <li key={step} className={styles.step} data-done={index <= reached ? 'true' : undefined}>
            <span className={styles.stepMark} aria-hidden="true">
              {index <= reached ? <CheckIcon size={12} /> : index + 1}
            </span>
            <span>
              <strong>{t.interventions.steps[step].label}</strong>
              <span className={styles.stepHint}>{t.interventions.steps[step].hint}</span>
            </span>
          </li>
        ))}
      </ol>
      {rejected ? (
        <p className={styles.rejected} role="alert">
          <XCircleIcon size={16} aria-hidden="true" className={styles.rejectedIcon} />
          <span>
            <strong>{t.interventions.rejected.label}</strong>
            <span className={styles.stepHint}>{t.interventions.rejected.hint}</span>
          </span>
        </p>
      ) : null}
      <FollowUp intervention={intervention} />
      {unblock.commentUrl ? (
        <a href={unblock.commentUrl} target="_blank" rel="noreferrer" className={styles.inlineLink}>
          {t.interventions.viewComment} <LinkExternalIcon size={12} />
        </a>
      ) : null}
    </section>
  );
}

/**
 * La réponse postée sur l'issue (`/factory unblock`). Préremplie par le diagnostic tant que Clément
 * ne l'a pas modifiée ; tant que la cause est encore là côté factory, l'envoi demande une confirmation.
 */
export function UnblockForm({ intervention }: { intervention: Intervention }) {
  const { t, fmt, text } = useI18n();
  const source = useFactorySource();
  const diagnosis = intervention.diagnosis;
  const template = diagnosis?.unblock.template ? text(diagnosis.unblock.template) : '';
  // `null` : le texte affiché est la réponse préremplie, qui suit le diagnostic et la langue.
  const [draft, setDraft] = useState<string | null>(null);
  const answer = draft ?? template;
  const [confirming, setConfirming] = useState(false);
  // L'erreur s'écrit à l'affichage : elle suit la langue si on la change entre-temps.
  const [failure, setFailure] = useState<{ cause: unknown } | 'empty' | null>(null);
  const [sending, setSending] = useState(false);
  const fieldId = `reponse-${intervention.id}`;
  const causePresent = diagnosis?.unblock.when === 'after_fix';
  const fixedAt = diagnosis?.primary.cause.state === 'fixed' ? diagnosis.primary.cause.at : null;
  const error =
    failure === null
      ? null
      : failure === 'empty'
        ? t.interventions.emptyAnswer
        : failure.cause instanceof Error
          ? describeError(failure.cause, t)
          : t.interventions.sendFailed;

  // Repartie (par l'app ou ailleurs), la carte n'a plus rien à débloquer : le suivi seulement. Une
  // réponse refusée sur une carte encore bloquée se renvoie, corrigée.
  if (
    intervention.resolvedAt ||
    (intervention.unblock && intervention.unblock.state !== 'rejected')
  ) {
    return <Tracking intervention={intervention} />;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!answer.trim()) {
      setFailure('empty');
      return;
    }
    setSending(true);
    setFailure(null);
    try {
      await source.unblock(intervention.id, answer.trim(), { acknowledgeCause: causePresent });
      setConfirming(false);
    } catch (cause) {
      setFailure({ cause });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {intervention.unblock ? <Tracking intervention={intervention} /> : null}
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        {fixedAt && !causePresent ? (
          <p className={styles.causeFixed} role="status">
            <CheckCircleIcon size={16} aria-hidden="true" />
            {t.interventions.causeFixed(fmt.clock(fixedAt))}
          </p>
        ) : null}
        <FormControl id={fieldId} className={styles.field}>
          <FormControl.Label>{t.interventions.answer}</FormControl.Label>
          <Textarea
            {...(error ? { validationStatus: 'error' as const } : {})}
            value={answer}
            onChange={(event) => setDraft(event.target.value)}
            rows={rowsFor(answer)}
            maxLength={MAX_ANSWER}
            block
            resize="vertical"
            placeholder={t.interventions.placeholder}
          />
          {error ? (
            <FormControl.Validation variant="error">{error}</FormControl.Validation>
          ) : (
            <FormControl.Caption>
              {draft === null && template
                ? t.interventions.prefilled
                : t.interventions.caption(intervention.issueKey)}
            </FormControl.Caption>
          )}
        </FormControl>
        {!causePresent ? (
          <Button
            type="submit"
            variant="primary"
            leadingVisual={PaperAirplaneIcon}
            loading={sending}
          >
            {t.interventions.unblock}
          </Button>
        ) : confirming ? (
          <div className={styles.confirm} role="alert">
            <p className={styles.confirmText}>
              <AlertIcon size={16} aria-hidden="true" className={styles.confirmIcon} />
              {t.interventions.anywayWarning(diagnosis?.unblock.nextBlock === 'triage')}
            </p>
            <div className={styles.confirmActions}>
              <Button type="submit" variant="danger" loading={sending}>
                {t.interventions.confirmAnyway}
              </Button>
              <Button type="button" onClick={() => setConfirming(false)}>
                {t.interventions.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" leadingVisual={AlertIcon} onClick={() => setConfirming(true)}>
            {t.interventions.unblockAnyway}
          </Button>
        )}
      </form>
    </>
  );
}
