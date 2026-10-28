import type { Intervention, InterventionAction } from '@factory-live/contracts';
import { CheckIcon, CopyIcon, LinkExternalIcon, PaperAirplaneIcon } from '@primer/octicons-react';
import { Button, FormControl, Heading, Label, Textarea } from '@primer/react';
import { useId, useState } from 'react';
import { useFactorySource } from '../../data/FactoryProvider.tsx';
import { Markdown } from '../../ui/Markdown.tsx';
import { formatClock } from '../../ui/format.ts';
import { INTERVENTION_LABEL } from '../../ui/vocabulary.ts';
import { InlineLink } from '../../ui/InlineLink.tsx';
import { issuePath } from '../../ui/paths.ts';
import styles from './interventions.module.css';

const SEVERITY_LABEL = { critical: 'Bloquant', warning: 'À traiter', info: 'Pour info' } as const;
const SEVERITY_VARIANT = { critical: 'danger', warning: 'attention', info: 'accent' } as const;

const STEPS = [
  {
    state: 'sent',
    label: 'Réponse postée sur l’issue',
    hint: 'commentaire /factory unblock en ton nom',
  },
  {
    state: 'acknowledged',
    label: 'Prise en compte par le bot',
    hint: 'réaction +1, relais active_pr si besoin',
  },
  {
    state: 'resumed',
    label: 'Carte repartie',
    hint: 'le dispatcher la relance dès qu’une place se libère',
  },
] as const;

function CopyCommand({ action }: { action: Extract<InterventionAction, { kind: 'copy' }> }) {
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
      <p className={styles.copyLabel}>{action.label}</p>
      <pre className={styles.command} id={commandId}>
        {action.command}
      </pre>
      <Button
        size="small"
        leadingVisual={copied ? CheckIcon : CopyIcon}
        onClick={() => void copy()}
      >
        {copied ? 'Copiée' : 'Copier la commande'}
      </Button>
    </div>
  );
}

function UnblockForm({ intervention }: { intervention: Intervention }) {
  const source = useFactorySource();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fieldId = `reponse-${intervention.id}`;

  if (intervention.unblock) {
    const reached = STEPS.findIndex((step) => step.state === intervention.unblock?.state);
    return (
      <section className={styles.progress} aria-live="polite" aria-labelledby={`${fieldId}-suivi`}>
        <h3 id={`${fieldId}-suivi`} className={styles.subTitle}>
          Suivi de ta réponse
        </h3>
        <blockquote className={styles.answer}>{intervention.unblock.text}</blockquote>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li
              key={step.state}
              className={styles.step}
              data-done={index <= reached ? 'true' : undefined}
            >
              <span className={styles.stepMark} aria-hidden="true">
                {index <= reached ? <CheckIcon size={12} /> : index + 1}
              </span>
              <span>
                <strong>{step.label}</strong>
                <span className={styles.stepHint}>{step.hint}</span>
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
            Voir le commentaire sur GitHub <LinkExternalIcon size={12} />
          </a>
        ) : null}
      </section>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) {
      setError('Écris ta réponse : elle est postée telle quelle sur l’issue.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await source.unblock(intervention.id, text.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Envoi impossible, réessaie.');
    } finally {
      setSending(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <FormControl id={fieldId} className={styles.field}>
        <FormControl.Label>Ta réponse</FormControl.Label>
        <Textarea
          {...(error ? { validationStatus: 'error' as const } : {})}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          block
          resize="vertical"
          placeholder="Par exemple : option 2, filtres en pastilles au-dessus de la grille."
        />
        {error ? (
          <FormControl.Validation variant="error">{error}</FormControl.Validation>
        ) : (
          <FormControl.Caption>
            Postée sur {intervention.issueKey} en commentaire « /factory unblock », exactement comme
            si tu répondais depuis l’issue. Elle débloque toutes les cartes bloquées de l’issue.
          </FormControl.Caption>
        )}
      </FormControl>
      <Button type="submit" variant="primary" leadingVisual={PaperAirplaneIcon} loading={sending}>
        Débloquer
      </Button>
    </form>
  );
}

/** Une intervention : la question entière de l'agent, son contexte, et ce que tu peux faire d'ici. */
export function InterventionDetail({ intervention }: { intervention: Intervention }) {
  const unblockable = intervention.actions.some((action) => action.kind === 'unblock');
  return (
    <article className={styles.card} aria-labelledby={`titre-${intervention.id}`}>
      <header className={styles.cardHead}>
        <div className={styles.cardLabels}>
          <Label variant={SEVERITY_VARIANT[intervention.severity]}>
            {SEVERITY_LABEL[intervention.severity]}
          </Label>
          <span className={styles.kind}>{INTERVENTION_LABEL[intervention.kind]}</span>
          {intervention.push ? (
            <span className={styles.kind}>· notification push envoyée</span>
          ) : null}
        </div>
        <Heading as="h2" variant="small" id={`titre-${intervention.id}`}>
          {intervention.title}
        </Heading>
        <p className={styles.context}>
          {intervention.issueKey ? (
            <InlineLink to={issuePath(intervention.issueKey)}>{intervention.issueKey}</InlineLink>
          ) : null}
          {intervention.cardId ? <span className="fl-mono"> · {intervention.cardId}</span> : null}
          {intervention.profile ? <span> · {intervention.profile}</span> : null}
          <span> · ouverte à {formatClock(intervention.openedAt)}</span>
        </p>
      </header>

      <section className={styles.question} aria-label="Question de l’agent">
        <Markdown>{intervention.question}</Markdown>
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
            {action.label}
          </Button>
        ) : null,
      )}
    </article>
  );
}
