import type { Intervention } from '@factory-live/contracts';
import { ArrowLeftIcon, BellIcon, CheckCircleIcon } from '@primer/octicons-react';
import { Heading } from '@primer/react';
import { Blankslate } from '@primer/react/experimental';
import { Link, useParams } from 'react-router';
import { useSnapshot } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { CardBadge } from '../../ui/badge/CardBadge.tsx';
import { IssueBadge } from '../../ui/badge/IssueBadge.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { interventionHeadline, interventionTone } from '../../ui/work/workState.tsx';
import { InterventionDetail } from './InterventionDetail.tsx';
import styles from './interventions.module.css';

const SEVERITY_ORDER: Record<Intervention['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function sortInterventions(interventions: readonly Intervention[]): Intervention[] {
  return [...interventions].sort(
    (left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      left.openedAt.localeCompare(right.openedAt),
  );
}

/** Une ligne de la liste : la cause quand un diagnostic l'a trouvée, qui agit, et le suivi. */
function InterventionItem({
  intervention,
  current,
}: {
  intervention: Intervention;
  current: boolean;
}) {
  const { t, text } = useI18n();
  const diagnosis = intervention.diagnosis;
  return (
    <li>
      <Link
        to={`/interventions/${intervention.id}`}
        className={styles.item}
        data-tone={interventionTone(intervention)}
        data-resolved={intervention.resolvedAt ? 'true' : undefined}
        aria-current={current ? 'page' : undefined}
      >
        <span className={styles.itemKind}>
          {intervention.push ? <BellIcon size={12} aria-label={t.interventions.push} /> : null}
          {t.intervention[intervention.kind]}
        </span>
        <span className={styles.itemTitle}>{text(interventionHeadline(intervention))}</span>
        {diagnosis && !intervention.resolvedAt ? (
          <span className={styles.itemActor}>{t.diagnosis.actor[diagnosis.primary.actor]}</span>
        ) : null}
        <span className={styles.itemMeta}>
          {intervention.issueKey ? (
            <IssueBadge issueKey={intervention.issueKey} state="open" />
          ) : intervention.cardId ? (
            <CardBadge id={intervention.cardId} />
          ) : null}{' '}
          <span>
            {t.interventions.opened} <Elapsed since={intervention.openedAt} mode="age" />
          </span>
        </span>
        {intervention.unblock ? (
          <span className={styles.itemProgress}>
            {t.interventions.progress[intervention.unblock.state]}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export function InterventionsPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const snapshot = useSnapshot();
  const all = sortInterventions(snapshot.interventions);
  // Débloquées : encore visibles le temps de suivre la reprise, sous les interventions ouvertes.
  const interventions = all.filter((intervention) => !intervention.resolvedAt);
  const recent = all
    .filter((intervention) => intervention.resolvedAt)
    .sort((left, right) => (right.resolvedAt ?? '').localeCompare(left.resolvedAt ?? ''));
  const selected = all.find((intervention) => intervention.id === id) ?? null;
  const showDetailOnly = id !== undefined;

  return (
    <section
      className={styles.page}
      data-detail={showDetailOnly ? 'true' : undefined}
      aria-labelledby="interventions-title"
    >
      <header className={styles.head}>
        <Heading as="h1" variant="medium" id="interventions-title">
          {t.interventions.title}
        </Heading>
        <p className={styles.intro}>{t.interventions.intro}</p>
      </header>

      {all.length === 0 && !showDetailOnly ? (
        // Rien n'attend : l'état vide de Primer, à la place des deux colonnes vides.
        <Blankslate border spacious>
          <Blankslate.Visual>
            <CheckCircleIcon size="medium" className={styles.calm} />
          </Blankslate.Visual>
          <Blankslate.Heading as="h2">{t.interventions.empty}</Blankslate.Heading>
        </Blankslate>
      ) : (
        <div className={styles.layout}>
          <nav className={styles.list} aria-label={t.interventions.listLabel}>
            {interventions.length === 0 ? (
              <p className={styles.empty}>
                <CheckCircleIcon size={16} aria-hidden="true" /> {t.interventions.empty}
              </p>
            ) : (
              <ul className={styles.items}>
                {interventions.map((intervention) => (
                  <InterventionItem
                    key={intervention.id}
                    intervention={intervention}
                    current={intervention.id === id}
                  />
                ))}
              </ul>
            )}
            {recent.length > 0 ? (
              <>
                <h2 className={styles.groupTitle}>{t.interventions.recent}</h2>
                <ul className={styles.items}>
                  {recent.map((intervention) => (
                    <InterventionItem
                      key={intervention.id}
                      intervention={intervention}
                      current={intervention.id === id}
                    />
                  ))}
                </ul>
              </>
            ) : null}
          </nav>

          <div className={styles.detail}>
            {showDetailOnly ? (
              <Link to="/interventions" className={styles.back}>
                <ArrowLeftIcon size={14} /> {t.interventions.all}
              </Link>
            ) : null}
            {selected ? (
              <InterventionDetail intervention={selected} />
            ) : id ? (
              <Blankslate border>
                <Blankslate.Visual>
                  <CheckCircleIcon size="medium" className={styles.calm} />
                </Blankslate.Visual>
                <Blankslate.Heading as="h2">{t.interventions.resolved}</Blankslate.Heading>
              </Blankslate>
            ) : interventions[0] ? (
              <InterventionDetail intervention={interventions[0]} />
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
