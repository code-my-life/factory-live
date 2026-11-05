import type { StationKind } from '@factory-live/contracts';
import type { Icon } from '@primer/octicons-react';
import { AnimatePresence, motion } from 'motion/react';
import { useI18n } from '../../../../i18n/I18nProvider.tsx';
import { MOVE_TRANSITION } from '../../../../ui/motion.tsx';
import type { Box, BoxId, RowKind } from '../layout.ts';
import type { LineIssue } from '../model.ts';
import { ItemRow } from './ItemRow.tsx';
import { KindChip } from './KindChip.tsx';
import styles from '../graph.module.css';

/** How a station's head shows it: everything comes from its sheet and the dictionaries. */
export interface StationLook {
  label: string;
  hint: string;
  /** Its icon; a member of a group shows its swatch instead. */
  icon: Icon | null;
  /** The kind of work done there; a member of a group leaves it to its frame. */
  kind: StationKind | null;
  /** A group member's colour, the colour of its curves. */
  swatch: string | null;
  /** The item types it handles, on the second line of its head. */
  types: string | null;
  /** A group member's key without its group. */
  member: string | null;
}

/**
 * A station: its head (icon, name, the kind of its work), then its items as rows, the first ones
 * only when it lists a few (the entry, the end), counting the others.
 */
export function StationBlock({
  id,
  box,
  look,
  items,
  row,
  limit,
  ai,
  selectedKey,
  travelling,
  landed,
  shown,
  onSelect,
  now,
  maxInProgress,
}: {
  id: BoxId;
  box: Box;
  look: StationLook;
  items: readonly LineIssue[];
  row: RowKind;
  /** How many items it lists at most. */
  limit: number;
  /** An agent calls a model here. */
  ai: boolean;
  selectedKey: string | null;
  /** Items whose card is still on its way here: their row waits for it. */
  travelling: ReadonlySet<string>;
  /** Items whose card has just landed here. */
  landed: ReadonlySet<string>;
  /** The items the search keeps, or null when nothing is filtered. */
  shown: ReadonlySet<string> | null;
  onSelect: (key: string) => void;
  now: number;
  maxInProgress: number;
}) {
  const { t } = useI18n();
  // A box that lists only its first items still shows the open one and those the search keeps.
  const wanted = (item: LineIssue) =>
    item.issue.key === selectedKey || (shown?.has(item.issue.key) ?? false);
  const listed = (
    limit < items.length
      ? [...items.filter(wanted), ...items.filter((item) => !wanted(item))]
      : items
  ).slice(0, limit);
  const more = items.length - listed.length;
  const tone = items.some((item) => item.issue.status === 'blocked')
    ? 'danger'
    : items.some((item) => item.issue.status === 'waiting_human')
      ? 'attention'
      : undefined;
  const StationIcon = look.icon;
  return (
    <motion.div
      className={styles.box}
      data-box={id}
      data-proof={look.member ?? undefined}
      data-tone={tone}
      initial={false}
      animate={{ top: box.y, height: box.h }}
      transition={MOVE_TRANSITION}
      style={{ left: box.x, width: box.w }}
    >
      <div className={styles.head} style={{ height: box.head }} title={look.hint}>
        <span className={styles.headLine}>
          {StationIcon ? (
            <StationIcon size={16} className={styles.headIcon} aria-hidden="true" />
          ) : null}
          {look.swatch ? (
            <span
              className={styles.proofSwatch}
              style={{ backgroundColor: look.swatch }}
              aria-hidden="true"
            />
          ) : null}
          <span className={styles.headName}>{look.label}</span>
          {look.kind ? <KindChip kind={look.kind} /> : null}
        </span>
        {look.types !== null ? <span className={styles.headTypes}>{look.types}</span> : null}
      </div>
      <div className={styles.body}>
        {/* A row leaving with its card fades where it stood, out of the flow of the others. */}
        <AnimatePresence initial={false} mode="popLayout">
          {listed.length === 0 ? (
            <motion.p
              key="empty"
              className={styles.empty}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
            >
              {t.line.graph.empty}
            </motion.p>
          ) : (
            listed.map((item) => (
              <motion.div
                key={item.issue.key}
                className={styles.slot}
                exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } }}
              >
                <ItemRow
                  item={item}
                  row={row}
                  ai={ai}
                  selected={item.issue.key === selectedKey}
                  arriving={travelling.has(item.issue.key)}
                  landed={landed.has(item.issue.key)}
                  dimmed={shown !== null && !shown.has(item.issue.key)}
                  onSelect={onSelect}
                  now={now}
                  maxInProgress={maxInProgress}
                />
              </motion.div>
            ))
          )}
        </AnimatePresence>
        {more > 0 ? <p className={styles.more}>{t.line.graph.more(more)}</p> : null}
      </div>
    </motion.div>
  );
}
