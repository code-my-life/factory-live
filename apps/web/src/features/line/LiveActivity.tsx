import type { ActivityEvent } from '@factory-live/contracts';
import { SegmentedControl } from '@primer/react';
import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { Messages } from '../../i18n/fr.ts';
import { ActivityTimeline } from '../../ui/timeline/ActivityTimeline.tsx';
import { fromActivity } from '../../ui/timeline/rows.ts';
import styles from './line.module.css';

const FILTERS: {
  label: keyof Messages['activity']['filters'];
  kinds: readonly ActivityEvent['kind'][] | null;
}[] = [
  { label: 'all', kinds: null },
  { label: 'tools', kinds: ['tool', 'skill', 'guard'] },
  { label: 'models', kinds: ['llm'] },
  { label: 'kanban', kinds: ['kanban'] },
  { label: 'github', kinds: ['github'] },
];

/** Le fil en direct de la ligne : la même timeline que sur une issue, du plus récent au plus ancien. */
export function LiveActivity({
  events,
  limit = 30,
}: {
  events: readonly ActivityEvent[];
  limit?: number;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const [filterIndex, setFilterIndex] = useState(0);
  const kinds = FILTERS[filterIndex]?.kinds ?? null;
  const rows = [...events]
    .filter((event) => kinds === null || kinds.includes(event.kind))
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, limit)
    .map((event) => fromActivity(event, i18n));
  return (
    <section className={styles.panel} aria-labelledby="activity-title">
      <header className={styles.panelHead}>
        <h2 id="activity-title" className={styles.panelTitle}>
          {t.activity.title}
        </h2>
        <SegmentedControl
          aria-label={t.activity.filterLabel}
          size="small"
          onChange={(index) => setFilterIndex(index)}
        >
          {FILTERS.map((filter, index) => (
            <SegmentedControl.Button key={filter.label} selected={index === filterIndex}>
              {t.activity.filters[filter.label]}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
      </header>
      {rows.length === 0 ? (
        <p className={styles.quiet}>{t.activity.empty}</p>
      ) : (
        <ActivityTimeline rows={rows} label={t.activity.label} />
      )}
    </section>
  );
}
