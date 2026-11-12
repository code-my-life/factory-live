import { Banner, Heading } from '@primer/react';
import { useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { MotionToggle } from '../../ui/motion.tsx';
import { useNow } from '../../ui/useNow.ts';
import { WorkStateLabel, issueWorkState } from '../../ui/work/workState.tsx';
import { SheetGraph } from '../line/graph/FactoryGraph.tsx';
import { ItemDetail } from './ItemDetail.tsx';
import { itemIssue, placed } from './model.ts';
import type { GenericItem } from './model.ts';
import { useWorkflows } from './WorkflowsProvider.tsx';
import styles from './workflows.module.css';

/** The items as a plain list, when the sheet is refused: the page keeps its items under the banner. */
function ItemList({
  items,
  selected,
  onSelect,
}: {
  items: readonly GenericItem[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <ul className={styles.itemList} aria-label={t.workflows.items}>
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className={styles.itemRow}
            aria-current={item.id === selected ? 'true' : undefined}
            title={item.title}
            onClick={() => onSelect(item.id)}
          >
            <span className={styles.itemTitle}>{item.title}</span>
            <span className={styles.itemMeta}>
              {item.station ? <span className="fl-mono">{item.station}</span> : null}
              <WorkStateLabel state={issueWorkState(item, null, t)} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The screen of any workflow the core declares (#65): the standard graph drawn from its sheet, one
 * row per item at its station, and under it the open item's detail. `/workflows/:workflow/:item`
 * opens on that item. Nothing here knows the workflow: its sheet and its items draw it.
 */
export function WorkflowPage() {
  const { t, fmt } = useI18n();
  const { ready, workflows } = useWorkflows();
  const now = useNow();
  const navigate = useNavigate();
  const { workflow: key, item: selected = null } = useParams();
  const workflow = workflows.find((each) => each.key === key) ?? null;
  const sheet = workflow?.sheet.ok ? workflow.sheet.sheet : null;
  const rows = useMemo(
    () =>
      workflow && sheet
        ? workflow.items
            .filter((item) => placed(item, sheet))
            .map((item) => itemIssue(item, sheet, workflow.key))
        : [],
    [workflow, sheet],
  );
  // The items the core places at no station of the sheet: listed under the graph, never lost.
  const unplaced = workflow && sheet ? workflow.items.filter((item) => !placed(item, sheet)) : [];
  const open = (id: string) =>
    void navigate(id === selected ? `/workflows/${key}` : `/workflows/${key}/${id}`);
  const item = workflow?.items.find((each) => each.id === selected) ?? null;
  const waiting = workflow?.items.filter((each) => each.status === 'waiting_human').length ?? 0;

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div className={styles.pageTitle}>
          <Heading as="h1" variant="medium">
            {key}
          </Heading>
          {workflow ? (
            <p className={styles.subtitle}>{t.workflows.summary(workflow.items.length, waiting)}</p>
          ) : null}
        </div>
        <MotionToggle />
      </header>

      {!ready ? (
        <p className={styles.quiet}>{t.workflows.loading}</p>
      ) : !workflow ? (
        <Banner variant="info" title={t.workflows.unknownTitle} description={t.workflows.unknown} />
      ) : (
        <>
          {workflow.unreachableSince !== null ? (
            <Banner
              variant="warning"
              title={t.workflows.unreachableTitle}
              description={t.workflows.unreachable(fmt.stay(now - workflow.unreachableSince))}
            />
          ) : null}

          {!workflow.sheet.ok ? (
            <>
              <Banner
                variant="critical"
                title={t.workflow.invalid}
                description={workflow.sheet.error}
              />
              {workflow.items.length > 0 ? (
                <ItemList items={workflow.items} selected={selected} onSelect={open} />
              ) : null}
            </>
          ) : (
            <>
              <SheetGraph
                parsed={workflow.sheet}
                items={rows}
                providers={[]}
                selectedKey={selected}
                onSelect={open}
                now={now}
                maxInProgress={1}
              />
              {unplaced.length > 0 ? (
                <section className={styles.section} aria-labelledby="workflow-unplaced">
                  <Heading as="h2" variant="small" id="workflow-unplaced">
                    {t.workflows.unplaced}
                  </Heading>
                  <ItemList items={unplaced} selected={selected} onSelect={open} />
                </section>
              ) : null}
            </>
          )}

          {workflow.items.length === 0 ? (
            <p className={styles.quiet}>{t.workflows.empty}</p>
          ) : item ? (
            <ItemDetail key={item.id} workflow={workflow.key} item={item} sheet={sheet} now={now} />
          ) : selected ? (
            <p className={styles.quiet}>{t.workflows.unknownItem}</p>
          ) : (
            <p className={styles.quiet}>{t.workflows.selectHint}</p>
          )}
        </>
      )}
    </div>
  );
}

/** `/workflows`: the first workflow the core declares, or the line when it declares none. */
export function FirstWorkflow() {
  const { ready, workflows } = useWorkflows();
  const first = workflows[0];
  if (!ready) return null;
  return <Navigate to={first ? `/workflows/${first.key}` : '/'} replace />;
}
