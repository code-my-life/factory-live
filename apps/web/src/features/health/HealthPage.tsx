import type { ServiceHealth } from '@factory-live/contracts';
import { Heading } from '@primer/react';
import { useSnapshot } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { serviceMark } from '../../ui/badge/marks.ts';
import { MarkIcon } from '../../ui/badge/MarkIcon.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { LiveDot } from '../../ui/LiveDot.tsx';
import type { DotTone } from '../../ui/LiveDot.tsx';
import page from '../../ui/page.module.css';
import { needsWatch } from '../../ui/vocabulary.ts';
import styles from './health.module.css';

const GROUPS: readonly ServiceHealth['group'][] = [
  'hermes',
  'models',
  'tools',
  'intake',
  'factory-live',
];

const TONE: Record<ServiceHealth['status'], DotTone> = {
  ok: 'success',
  degraded: 'attention',
  down: 'danger',
  unknown: 'muted',
};

export function HealthPage() {
  const { t, text } = useI18n();
  const snapshot = useSnapshot();
  const problems = snapshot.health.filter((service) => needsWatch(service.status));
  return (
    <section className={page.page} aria-labelledby="health-title">
      <header className={page.head}>
        <div>
          <Heading as="h1" variant="medium" id="health-title">
            {t.health.title}
          </Heading>
          <p className={page.intro}>
            {problems.length === 0
              ? t.health.allGood
              : t.health.toWatch(
                  problems.length,
                  problems.map((service) => text(service.label)).join(', '),
                )}{' '}
            {t.health.probeNote}
          </p>
        </div>
      </header>
      {GROUPS.map((group) => {
        const services = snapshot.health.filter((service) => service.group === group);
        if (services.length === 0) return null;
        return (
          <section key={group} className={page.section} aria-labelledby={`groupe-${group}`}>
            <h2 id={`groupe-${group}`} className={page.sectionTitle}>
              {t.health.groups[group].label}{' '}
              <span className={styles.groupHint}>{t.health.groups[group].hint}</span>
            </h2>
            <ul className={styles.tiles}>
              {services.map((service) => (
                <li key={service.id} className={styles.tile} data-status={service.status}>
                  <p className={styles.tileHead}>
                    <LiveDot tone={TONE[service.status]} />
                    {/* Le logo du service (GitHub, Tailscale, NVIDIA…), le même que dans les badges. */}
                    <MarkIcon
                      mark={serviceMark(service.id)}
                      className={styles.tileIcon}
                      size={16}
                    />
                    <span className={styles.tileLabel}>{text(service.label)}</span>
                    <span className={styles.tileStatus}>{t.healthStatus[service.status]}</span>
                  </p>
                  <p className={styles.tileDetail}>{text(service.detail)}</p>
                  {service.metrics.length > 0 ? (
                    <dl className={styles.metrics}>
                      {service.metrics.map((metric) => (
                        <div key={text(metric.label)}>
                          <dt className={styles.metricTerm}>{text(metric.label)}</dt>
                          <dd className={styles.metricValue}>{text(metric.value)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {service.checkedAt ? (
                    <p className={styles.checked}>
                      {t.health.checked} <Elapsed since={service.checkedAt} mode="age" />
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
