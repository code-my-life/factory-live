import type { WorkflowSheet } from '@factory-live/contracts';
import { Heading } from '@primer/react';
import { useEffect, useState } from 'react';
import type { DeclaredData } from '@factory-live/contracts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { AgentBadge } from '../../ui/badge/AgentBadge.tsx';
import { CardBadge } from '../../ui/badge/CardBadge.tsx';
import { ActivityTimeline } from '../../ui/timeline/ActivityTimeline.tsx';
import { fromTimelineEntry } from '../../ui/timeline/rows.ts';
import { WorkStateLabel, cardWorkState, issueWorkState } from '../../ui/work/workState.tsx';
import { RunsTable } from '../issues/IssuePage.tsx';
import { DeclaredDataList } from './DeclaredData.tsx';
import type { GenericItem } from './model.ts';
import { useWorkflows } from './WorkflowsProvider.tsx';
import styles from './workflows.module.css';

/**
 * An item under the graph (#65): its landmarks (station and since when, state), its cards with their
 * runs, the data its workflow declares for it, then its life, newest first.
 */
/** The data a workflow declares for one subject, read when it changes; `null` while it is read. */
function useDeclared(workflow: string, subject: 'card' | 'run', id: string | null) {
  const { source } = useWorkflows();
  const [read, setRead] = useState<{ id: string; data: DeclaredData[] } | null>(null);
  useEffect(() => {
    if (id === null) return;
    let current = true;
    void source.data(workflow, subject, id).then((data) => {
      if (current) setRead({ id, data });
    });
    return () => {
      current = false;
    };
  }, [source, workflow, subject, id]);
  return read !== null && read.id === id ? read.data : null;
}

export function ItemDetail({
  workflow,
  item,
  sheet,
  now,
}: {
  workflow: string;
  item: GenericItem;
  sheet: WorkflowSheet | null;
  now: number;
}) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const station =
    sheet?.stations.find((each) => each.key === item.station)?.label ??
    item.station ??
    t.workflows.noStation;
  const titleId = `item-${item.id}`;
  // The run whose transcript is open: the last run of the item, until another is picked.
  const lastRun = item.cards.flatMap((card) => card.runs).at(-1)?.id ?? null;
  const [runId, setRunId] = useState<number | null>(lastRun);
  const itemData = useDeclared(workflow, 'card', item.id);
  const runData = useDeclared(workflow, 'run', runId === null ? null : String(runId));
  return (
    <article className={styles.detail} aria-labelledby={titleId}>
      <header className={styles.detailHead}>
        <Heading as="h2" variant="small" id={titleId} className={styles.detailTitle}>
          {item.title}
        </Heading>
        <dl className={styles.marks} aria-label={t.workflows.marks.label}>
          <div className={styles.mark}>
            <dt className={styles.markLabel}>{t.workflows.marks.station}</dt>
            <dd className={styles.markValue}>
              {station} · {t.workflows.marks.since(fmt.stay(now - Date.parse(item.since)))}
            </dd>
          </div>
          <div className={styles.mark}>
            <dt className={styles.markLabel}>{t.workflows.marks.state}</dt>
            <dd className={styles.markValue}>
              <WorkStateLabel state={issueWorkState(item, null, t)} />
            </dd>
          </div>
          <div className={styles.mark}>
            <dt className={styles.markLabel}>{t.workflows.marks.item}</dt>
            <dd className={`${styles.markValue} fl-mono`}>{item.id}</dd>
          </div>
        </dl>
      </header>

      <section className={styles.section} aria-labelledby={`${titleId}-cards`}>
        <Heading as="h3" variant="small" id={`${titleId}-cards`}>
          {t.workflows.cards(item.cards.length)}
        </Heading>
        {item.cards.length === 0 ? (
          <p className={styles.quiet}>{t.workflows.noCard}</p>
        ) : (
          <ul className={styles.cards}>
            {item.cards.map((card) => (
              <li key={card.id} className={styles.card}>
                <p className={styles.cardHead}>
                  <CardBadge id={card.id} />
                  <WorkStateLabel state={cardWorkState(card, null, t)} />
                  {card.assignee ? <AgentBadge profile={card.assignee} /> : null}
                </p>
                <p className={styles.cardTitle}>{card.title}</p>
                {card.blockReason ? (
                  <blockquote className={styles.blockReason}>{card.blockReason}</blockquote>
                ) : null}
                <RunsTable card={card} selectedRunId={runId} onSelectRun={setRunId} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {runId !== null ? (
        <section className={styles.section} aria-labelledby={`${titleId}-transcript`}>
          <Heading as="h3" variant="small" id={`${titleId}-transcript`}>
            {t.workflows.transcriptOf(runId)}
          </Heading>
          {runData === null ? (
            <p className={styles.quiet}>{t.workflows.reading}</p>
          ) : (
            <DeclaredDataList data={runData} idPrefix={`run-${runId}`} />
          )}
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby={`${titleId}-data`}>
        <Heading as="h3" variant="small" id={`${titleId}-data`}>
          {t.workflows.data}
        </Heading>
        {itemData === null ? (
          <p className={styles.quiet}>{t.workflows.reading}</p>
        ) : (
          <DeclaredDataList data={itemData} />
        )}
      </section>

      <section className={styles.section} aria-labelledby={`${titleId}-activity`}>
        <Heading as="h3" variant="small" id={`${titleId}-activity`}>
          {t.workflows.activity}
        </Heading>
        <ActivityTimeline
          rows={[...item.timeline]
            .sort((left, right) => right.at.localeCompare(left.at))
            .map((entry) => fromTimelineEntry(entry, i18n))}
          label={t.workflows.activityOf(item.title)}
        />
      </section>
    </article>
  );
}
