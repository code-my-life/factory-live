import type { ServiceHealth } from '@factory-live/contracts';
import { Heading } from '@primer/react';
import { useSnapshot } from '../../data/FactoryProvider.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { LiveDot } from '../../ui/LiveDot.tsx';
import type { DotTone } from '../../ui/LiveDot.tsx';
import page from '../../ui/page.module.css';
import styles from './health.module.css';

const GROUPS: { id: ServiceHealth['group']; label: string; hint: string }[] = [
  { id: 'hermes', label: 'Hermès', hint: 'Gateway, dispatcher, pause, dashboard' },
  { id: 'models', label: 'Modèles', hint: 'Fournisseurs appelés par les agents' },
  { id: 'tools', label: 'Outils', hint: 'MCP et API utilisés par les agents' },
  { id: 'intake', label: 'Intake', hint: 'Ce qui fait entrer les issues dans la factory' },
  { id: 'factory-live', label: 'factory-live', hint: 'Les sources de cet outil' },
];

const STATUS: Record<ServiceHealth['status'], { tone: DotTone; label: string }> = {
  ok: { tone: 'success', label: 'OK' },
  degraded: { tone: 'attention', label: 'Dégradé' },
  down: { tone: 'danger', label: 'En panne' },
  unknown: { tone: 'muted', label: 'Inconnu' },
};

export function HealthPage() {
  const snapshot = useSnapshot();
  const problems = snapshot.health.filter((service) => service.status !== 'ok');
  return (
    <section className={page.page} aria-labelledby="health-title">
      <header className={page.head}>
        <div>
          <Heading as="h1" variant="medium" id="health-title">
            Santé
          </Heading>
          <p className={page.intro}>
            {problems.length === 0
              ? 'Tous les services répondent.'
              : `${problems.length} service${problems.length > 1 ? 's' : ''} à surveiller : ${problems.map((service) => service.label).join(', ')}.`}{' '}
            La sonde du gateway passe toutes les 30 s ; le reste vient de ce que les agents
            observent en travaillant.
          </p>
        </div>
      </header>
      {GROUPS.map((group) => {
        const services = snapshot.health.filter((service) => service.group === group.id);
        if (services.length === 0) return null;
        return (
          <section key={group.id} className={page.section} aria-labelledby={`groupe-${group.id}`}>
            <h2 id={`groupe-${group.id}`} className={page.sectionTitle}>
              {group.label} <span className={styles.groupHint}>{group.hint}</span>
            </h2>
            <ul className={styles.tiles}>
              {services.map((service) => (
                <li key={service.id} className={styles.tile} data-status={service.status}>
                  <p className={styles.tileHead}>
                    <LiveDot tone={STATUS[service.status].tone} />
                    <span className={styles.tileLabel}>{service.label}</span>
                    <span className={styles.tileStatus}>{STATUS[service.status].label}</span>
                  </p>
                  <p className={styles.tileDetail}>{service.detail}</p>
                  {service.metrics.length > 0 ? (
                    <dl className={styles.metrics}>
                      {service.metrics.map((metric) => (
                        <div key={metric.label}>
                          <dt className={styles.metricTerm}>{metric.label}</dt>
                          <dd className={styles.metricValue}>{metric.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {service.checkedAt ? (
                    <p className={styles.checked}>
                      Vérifié <Elapsed since={service.checkedAt} mode="age" />
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
