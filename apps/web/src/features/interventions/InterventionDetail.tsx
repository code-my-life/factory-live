import type { Intervention, InterventionAction } from '@factory-live/contracts';
import { CheckIcon, CopyIcon, LinkExternalIcon, PaperAirplaneIcon } from '@primer/octicons-react';
import { Button, FormControl, Heading, Label, Textarea } from '@primer/react';
import { useId, useState } from 'react';
import { describeError } from '../../data/errors.ts';
import { useFactorySource } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { AgentAvatar } from '../../ui/agents/AgentAvatar.tsx';
import { CardBadge } from '../../ui/badge/CardBadge.tsx';
import { IssueBadge } from '../../ui/badge/IssueBadge.tsx';
import { Markdown } from '../../ui/Markdown.tsx';
import styles from './interventions.module.css';

const SEVERITY_VARIANT = { critical: 'danger', warning: 'attention', info: 'accent' } as const;

const STEPS = ['sent', 'acknowledged', 'resumed'] as const;

function CopyCommand({ action }: { action: Extract<InterventionAction, { kind: 'copy' }> }) {
  const { t, text } = useI18n();
  const [copied, setCopied] = useState(false);
  const commandId = useId();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(action.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const element = document.getElementById(commandId);
      if (element) window.getSelection()?.selectAllChildren(element);
    }
  };
  return (
    <div className={styles.copy}>
      <p className={styles.copyLabel}>{text(action.label)}</p>
      <pre className={styles.command} id={commandId}>
        {action.command}
      </pre>
      <Button
        size="small"
        leadingVisual={copied ? CheckIcon : CopyIcon}
        onClick={() => void copy()}
      >
        {copied ? t.interventions.copied : t.interventions.copy}
      </Button>
    </div>
  );
}

function UnblockForm({ intervention }: { intervention: Intervention }) {
  const { t } = useI18n();
  const source = useFactorySource();
  const [text, setText] = useState('');
  // L'erreur s'écrit à l'affichage : elle suit la langue si on la change entre-temps.
  const [failure, setFailure] = useState<{ cause: unknown } | 'empty' | null>(null);
  const error =
    failure === null
      ? null
      : failure === 'empty'
        ? t.interventions.emptyAnswer
        : failure.cause instanceof Error
          ? describeError(failure.cause, t)
          : t.interventions.sendFailed;
  const [sending, setSending] = useState(false);
  const fieldId = `reponse-${intervention.id}`;

  if (intervention.unblock) {
    const reached = STEPS.findIndex((step) => step === intervention.unblock?.state);
    return (
      <section className={styles.progress} aria-live="polite" aria-labelledby={`${fieldId}-suivi`}>
        <h3 id={`${fieldId}-suivi`} className={styles.subTitle}>
          {t.interventions.tracking}
        </h3>
        <blockquote className={styles.answer}>{intervention.unblock.text}</blockquote>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li
              key={step}
              className={styles.step}
              data-done={index <= reached ? 'true' : undefined}
            >
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
        {intervention.unblock.commentUrl ? (
          <a
            href={intervention.unblock.commentUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.inlineLink}
          >
            {t.interventions.viewComment} <LinkExternalIcon size={12} />
          </a>
        ) : null}
      </section>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) {
      setFailure('empty');
      return;
    }
    setSending(true);
    setFailure(null);
    try {
      await source.unblock(intervention.id, text.trim());
    } catch (cause) {
      setFailure({ cause });
    } finally {
      setSending(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <FormControl id={fieldId} className={styles.field}>
        <FormControl.Label>{t.interventions.answer}</FormControl.Label>
        <Textarea
          {...(error ? { validationStatus: 'error' as const } : {})}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          block
          resize="vertical"
          placeholder={t.interventions.placeholder}
        />
        {error ? (
          <FormControl.Validation variant="error">{error}</FormControl.Validation>
        ) : (
          <FormControl.Caption>
            {t.interventions.caption(intervention.issueKey)}
          </FormControl.Caption>
        )}
      </FormControl>
      <Button type="submit" variant="primary" leadingVisual={PaperAirplaneIcon} loading={sending}>
        {t.interventions.unblock}
      </Button>
    </form>
  );
}

/** Une intervention : la question entière de l'agent, son contexte, et ce que tu peux faire d'ici. */
export function InterventionDetail({ intervention }: { intervention: Intervention }) {
  const { t, fmt, text } = useI18n();
  const unblockable = intervention.actions.some((action) => action.kind === 'unblock');
  return (
    <article className={styles.card} aria-labelledby={`titre-${intervention.id}`}>
      <header className={styles.cardHead}>
        <div className={styles.cardLabels}>
          <Label variant={SEVERITY_VARIANT[intervention.severity]}>
            {t.interventions.severity[intervention.severity]}
          </Label>
          <span className={styles.kind}>{t.intervention[intervention.kind]}</span>
          {intervention.push ? (
            <span className={styles.kind}>{t.interventions.pushSent}</span>
          ) : null}
        </div>
        <Heading as="h2" variant="small" id={`titre-${intervention.id}`}>
          {text(intervention.title)}
        </Heading>
        <p className={styles.context}>
          {intervention.issueKey ? <IssueBadge issueKey={intervention.issueKey} link /> : null}
          {intervention.cardId ? <CardBadge id={intervention.cardId} /> : null}
          {intervention.profile ? (
            <span className={styles.agent}>
              <AgentAvatar profile={intervention.profile} size={16} named />
              {intervention.profile}
            </span>
          ) : null}
          <span>{t.interventions.openedAt(fmt.clock(intervention.openedAt))}</span>
        </p>
      </header>

      <section className={styles.question} aria-label={t.interventions.question}>
        <Markdown>{text(intervention.question)}</Markdown>
      </section>

      {unblockable ? <UnblockForm intervention={intervention} /> : null}

      {intervention.actions.map((action, index) =>
        action.kind === 'copy' ? (
          <CopyCommand key={index} action={action} />
        ) : action.kind === 'link' ? (
          <Button
            key={index}
            as="a"
            href={action.url}
            target="_blank"
            rel="noreferrer"
            trailingVisual={LinkExternalIcon}
            variant={unblockable ? 'default' : 'primary'}
          >
            {text(action.label)}
          </Button>
        ) : null,
      )}
    </article>
  );
}
