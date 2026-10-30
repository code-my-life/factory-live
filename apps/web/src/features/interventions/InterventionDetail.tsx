import type { Intervention } from '@factory-live/contracts';
import { LinkExternalIcon } from '@primer/octicons-react';
import { Button, Heading, Label } from '@primer/react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { AgentAvatar } from '../../ui/agents/AgentAvatar.tsx';
import { CardBadge } from '../../ui/badge/CardBadge.tsx';
import { IssueBadge } from '../../ui/badge/IssueBadge.tsx';
import { repoOfKey } from '../../ui/paths.ts';
import { CopyCommand } from '../../ui/CopyCommand.tsx';
import { Markdown } from '../../ui/Markdown.tsx';
import { interventionHeadline, interventionTone } from '../../ui/work/workState.tsx';
import { DiagnosisPanel } from './DiagnosisPanel.tsx';
import styles from './interventions.module.css';
import { UnblockForm } from './UnblockForm.tsx';

/**
 * Une intervention : la cause du blocage (diagnostic calculé par des règles), ce que l'agent a
 * écrit, tel quel, et ce que tu peux faire d'ici.
 */
export function InterventionDetail({ intervention }: { intervention: Intervention }) {
  const { t, fmt, text } = useI18n();
  const unblockable = intervention.actions.some((action) => action.kind === 'unblock');
  const diagnosis = intervention.diagnosis;
  // Avec une cause trouvée, le titre est la cause ; le texte de l'agent reste entier, plus bas.
  const title = interventionHeadline(intervention);
  return (
    <article className={styles.card} aria-labelledby={`titre-${intervention.id}`}>
      <header className={styles.cardHead}>
        <div className={styles.cardLabels}>
          {intervention.resolvedAt ? (
            <Label variant="success">{t.interventions.resolvedLabel}</Label>
          ) : (
            <Label variant={interventionTone(intervention)}>
              {t.interventions.severity[intervention.severity]}
            </Label>
          )}
          <span className={styles.kind}>{t.intervention[intervention.kind]}</span>
          {intervention.push ? (
            <span className={styles.kind}>{t.interventions.pushSent}</span>
          ) : null}
        </div>
        <Heading as="h2" variant="small" id={`titre-${intervention.id}`}>
          {text(title)}
        </Heading>
        <p className={styles.context}>
          {intervention.issueKey ? (
            <IssueBadge issueKey={intervention.issueKey} state="open" link />
          ) : null}
          {intervention.cardId ? <CardBadge id={intervention.cardId} /> : null}
          {intervention.profile ? (
            <span className={styles.agent}>
              <AgentAvatar profile={intervention.profile} size={16} named />
              {intervention.profile}
            </span>
          ) : null}
          <span>{t.interventions.openedAt(fmt.clock(intervention.openedAt))}</span>
          {intervention.resolvedAt ? (
            <span>{t.interventions.resolvedAt(fmt.clock(intervention.resolvedAt))}</span>
          ) : null}
        </p>
      </header>

      {diagnosis ? (
        <DiagnosisPanel
          diagnosis={diagnosis}
          repo={intervention.issueKey ? repoOfKey(intervention.issueKey) : undefined}
          unblocked={intervention.unblock?.state ?? null}
        />
      ) : null}

      <section
        className={styles.question}
        aria-label={diagnosis ? t.diagnosis.agentText : t.interventions.question}
      >
        {diagnosis ? <p className={styles.questionLabel}>{t.diagnosis.agentText}</p> : null}
        <Markdown>{text(intervention.question)}</Markdown>
      </section>

      {unblockable ? <UnblockForm intervention={intervention} /> : null}

      {intervention.actions.map((action, index) =>
        action.kind === 'copy' ? (
          <CopyCommand key={index} label={text(action.label)} command={action.command} />
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
