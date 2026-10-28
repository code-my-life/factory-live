import type { ActivityEvent } from '@factory-live/contracts';
import { SegmentedControl } from '@primer/react';
import { useState } from 'react';
import { ActivityTimeline } from '../../ui/timeline/ActivityTimeline.tsx';
import { fromActivity } from '../../ui/timeline/rows.ts';
import styles from './line.module.css';

const FILTERS: { label: string; kinds: readonly ActivityEvent['kind'][] | null }[] = [
  { label: 'Tout', kinds: null },
  { label: 'Outils', kinds: ['tool', 'skill', 'guard'] },
  { label: 'Modèles', kinds: ['llm'] },
  { label: 'Kanban', kinds: ['kanban'] },
  { label: 'GitHub', kinds: ['github'] },
];

/** Le fil en direct de la ligne : la même timeline que sur une issue, du plus récent au plus ancien. */
export function LiveActivity({
  events,
  limit = 30,
}: {
  events: readonly ActivityEvent[];
  limit?: number;
}) {
  const [filterIndex, setFilterIndex] = useState(0);
  const kinds = FILTERS[filterIndex]?.kinds ?? null;
  const rows = [...events]
    .filter((event) => kinds === null || kinds.includes(event.kind))
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, limit)
    .map(fromActivity);
  return (
    <section className={styles.panel} aria-labelledby="activity-title">
      <header className={styles.panelHead}>
        <h2 id="activity-title" className={styles.panelTitle}>
          Activité
        </h2>
        <SegmentedControl
          aria-label="Filtrer l’activité"
          size="small"
          onChange={(index) => setFilterIndex(index)}
        >
          {FILTERS.map((filter, index) => (
            <SegmentedControl.Button key={filter.label} selected={index === filterIndex}>
              {filter.label}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
      </header>
      {rows.length === 0 ? (
        <p className={styles.quiet}>Rien pour ce filtre pour l’instant.</p>
      ) : (
        <ActivityTimeline rows={rows} label="Activité de la factory" />
      )}
    </section>
  );
}
