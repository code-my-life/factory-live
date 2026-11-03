import type { CardKind, StationId } from '@factory-live/contracts';
import { Heading } from '@primer/react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useSnapshot } from '../../data/FactoryProvider.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Elapsed } from '../../ui/Elapsed.tsx';
import { MotionToggle } from '../../ui/motion.tsx';
import { issueKeyFromParams } from '../../ui/paths.ts';
import { useNow } from '../../ui/useNow.ts';
import { IssuePage } from '../issues/IssuePage.tsx';
import { FactoryGraph } from './graph/FactoryGraph.tsx';
import { lineIssues, providerRows } from './graph/model.ts';
import styles from './line.module.css';

/** The card at work at a station: its runs open under the graph. */
const CARD_AT: Partial<Record<StationId, CardKind>> = {
  intake: 'brief',
  brief: 'brief',
  implementation: 'impl',
  gate: 'impl',
  review: 'impl',
  merge: 'release',
  ci: 'release',
  deploy: 'release',
  release: 'release',
  done: 'release',
  diagnostic: 'diagnostic',
};

/**
 * The line page: the factory as a graph of its stations, and under it the open issue's details only.
 * A link to an issue (`/issues/:repo/:number`) opens the line on that issue; otherwise, what waits for
 * the owner opens first.
 */
export function FactoryLinePage() {
  const { t } = useI18n();
  const snapshot = useSnapshot();
  const now = useNow();
  const params = useParams();
  const fromLink = issueKeyFromParams(params.repo, params.number);
  const items = useMemo(() => lineIssues(snapshot), [snapshot]);
  const providers = useMemo(() => providerRows(snapshot.agents), [snapshot.agents]);

  // The owner's pick holds for the link it was made on; until then, or after another link, the
  // link's issue opens, else the first that waits for the owner. `null`: the owner closed it.
  const [choice, setChoice] = useState<{ link: string | null; key: string | null } | null>(null);
  const selected =
    choice && choice.link === fromLink
      ? choice.key
      : (fromLink ??
        items.find((item) => item.issue.status === 'waiting_human')?.issue.key ??
        null);
  const open = items.find((item) => item.issue.key === selected) ?? null;

  const lastEvent = [...snapshot.activity].sort((left, right) =>
    right.at.localeCompare(left.at),
  )[0];
  const running = items.filter(
    (item) => item.issue.status !== 'done' && item.issue.status !== 'stopped',
  ).length;

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div className={styles.pageTitleBlock}>
          <Heading as="h1" variant="medium">
            {t.line.title}
          </Heading>
          <p className={styles.pageSubtitle}>
            {t.line.openIssues(running)}
            {lastEvent ? (
              <>
                {' · '}
                {t.line.lastEvent} <Elapsed since={lastEvent.at} mode="age" />
              </>
            ) : null}
          </p>
        </div>
        <div className={styles.pageTools}>
          <MotionToggle />
        </div>
      </header>

      <FactoryGraph
        items={items}
        providers={providers}
        selectedKey={selected}
        onSelect={(key) => setChoice({ link: fromLink, key: selected === key ? null : key })}
        now={now}
        maxInProgress={snapshot.factory.maxInProgress}
      />

      {open ? (
        <IssuePage
          key={open.issue.key}
          issueKey={open.issue.key}
          cardKind={CARD_AT[open.issue.station] ?? null}
        />
      ) : (
        <p className={styles.pageSubtitle}>{t.line.graph.selectHint}</p>
      )}
    </div>
  );
}
