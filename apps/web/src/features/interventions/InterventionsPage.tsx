import type { Intervention } from '@factory-live/contracts';
import { ArrowLeftIcon, BellIcon, CheckCircleIcon } from '@primer/octicons-react';
import { Heading } from '@primer/react';
import { Link, useParams } from 'react-router';
import { useSnapshot } from '../../data/FactoryProvider.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { INTERVENTION_LABEL } from '../../ui/vocabulary.ts';
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

export function InterventionsPage() {
  const { id } = useParams();
  const snapshot = useSnapshot();
  const interventions = sortInterventions(snapshot.interventions);
  const selected = interventions.find((intervention) => intervention.id === id) ?? null;
  const showDetailOnly = id !== undefined;

  return (
    <section
      className={styles.page}
      data-detail={showDetailOnly ? 'true' : undefined}
      aria-labelledby="interventions-title"
    >
      <header className={styles.head}>
        <Heading as="h1" variant="medium" id="interventions-title">
          Interventions
        </Heading>
        <p className={styles.intro}>
          Ce qui attend ta décision. Une cloche signale ce qui t’envoie une notification push ; le
          reste se voit ici et sur la ligne.
        </p>
      </header>

      <div className={styles.layout}>
        <nav className={styles.list} aria-label="Interventions en attente">
          {interventions.length === 0 ? (
            <p className={styles.empty}>
              <CheckCircleIcon size={16} aria-hidden="true" /> Rien n’attend ta décision.
            </p>
          ) : (
            <ul className={styles.items}>
              {interventions.map((intervention) => (
                <li key={intervention.id}>
                  <Link
                    to={`/interventions/${intervention.id}`}
                    className={styles.item}
                    data-severity={intervention.severity}
                    aria-current={intervention.id === id ? 'page' : undefined}
                  >
                    <span className={styles.itemKind}>
                      {intervention.push ? (
                        <BellIcon size={12} aria-label="Notification push" />
                      ) : null}
                      {INTERVENTION_LABEL[intervention.kind]}
                    </span>
                    <span className={styles.itemTitle}>{intervention.title}</span>
                    <span className={styles.itemMeta}>
                      {intervention.issueKey ?? intervention.cardId} · ouverte{' '}
                      <Elapsed since={intervention.openedAt} mode="age" />
                    </span>
                    {intervention.unblock ? (
                      <span className={styles.itemProgress}>
                        Réponse {PROGRESS_LABEL[intervention.unblock.state]}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <div className={styles.detail}>
          {showDetailOnly ? (
            <Link to="/interventions" className={styles.back}>
              <ArrowLeftIcon size={14} /> Toutes les interventions
            </Link>
          ) : null}
          {selected ? (
            <InterventionDetail intervention={selected} />
          ) : id ? (
            <p className={styles.empty}>
              <CheckCircleIcon size={16} aria-hidden="true" /> Cette intervention est résolue.
            </p>
          ) : interventions[0] ? (
            <InterventionDetail intervention={interventions[0]} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

const PROGRESS_LABEL = {
  sent: 'envoyée',
  acknowledged: 'prise en compte',
  resumed: 'appliquée',
  rejected: 'refusée',
} as const;
