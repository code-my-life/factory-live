import type { AcceptanceView, IssueSummary } from '@factory-live/contracts';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ColumnsIcon,
  FoldIcon,
  GrabberIcon,
  KebabHorizontalIcon,
  LinkExternalIcon,
  PinIcon,
  PinSlashIcon,
  SquareIcon,
  UnfoldIcon,
} from '@primer/octicons-react';
import { ActionList, ActionMenu, Button, Heading, IconButton } from '@primer/react';
import { Reorder, motion, useDragControls } from 'motion/react';
import { useId, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useMotion } from '../../ui/motion.tsx';
import styles from './acceptance.module.css';
import {
  DEFAULT_LAYOUT,
  loadLayout,
  move,
  placeOf,
  reorder,
  saveLayout,
  toggleCollapsed,
  toggleHalf,
  togglePin,
} from './layout.ts';
import type { BoardLayout } from './layout.ts';
import { boardStatus, boardTally, widgetStatus, widgetTally } from './status.ts';
import type { Tally, WidgetId, WidgetStatus } from './status.ts';
import { StatusIcon, TallyBar } from './StatusMark.tsx';
import { TwinsWidget } from './TwinsWidget.tsx';
import {
  ChecksWidget,
  CriteriaWidget,
  ProofsWidget,
  TestsWidget,
  ThreadsWidget,
} from './widgets.tsx';

/** A fold that slides: the content's height, on Primer's short duration and its move easing. */
const FOLD = { duration: 0.2, ease: [0.42, 0, 0.58, 1] } as const;

/** Wide enough for two widgets side by side (Primer's large breakpoint). */
const WIDE = '(min-width: 1012px)';

function subscribeWide(listener: () => void): () => void {
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

interface FrameProps {
  id: WidgetId;
  title: string;
  status: WidgetStatus;
  counts: Tally;
  collapsed: boolean;
  pinned: boolean;
  half: boolean;
  wide: boolean;
  canUp: boolean;
  canDown: boolean;
  github: string;
  onToggle: () => void;
  onPin: () => void;
  onHalf: () => void;
  onMove: (delta: -1 | 1) => void;
  /** A drag let go: the owner hears where the widget landed, as after a move by the keys. */
  onDropped: () => void;
  children: ReactNode;
}

/**
 * A widget of the board: its verdict always in sight, folded or not, as a picto and a bar of its
 * counts. It moves by its handle (a drag, or the arrows when the handle has the focus), or from its
 * menu; a finger elsewhere scrolls the page. Its title row leads to GitHub.
 */
function WidgetFrame({
  id,
  title,
  status,
  counts,
  collapsed,
  pinned,
  half,
  wide,
  canUp,
  canDown,
  github,
  onToggle,
  onPin,
  onHalf,
  onMove,
  onDropped,
  children,
}: FrameProps) {
  const { t } = useI18n();
  const controls = useDragControls();
  const bodyId = useId();
  const hintId = useId();
  const summary = t.acceptance.tally(counts.ok, counts.nok, counts.pending, counts.info);
  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp' && canUp) {
      event.preventDefault();
      onMove(-1);
    } else if (event.key === 'ArrowDown' && canDown) {
      event.preventDefault();
      onMove(1);
    }
  };
  return (
    <Reorder.Item
      as="li"
      value={id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDropped}
      tabIndex={-1}
      layout="position"
      className={styles.widget}
      data-widget={id}
      data-status={status}
      data-size={half ? 'half' : 'full'}
      data-pinned={pinned ? '' : undefined}
      whileDrag={{ scale: 1.01, boxShadow: 'var(--shadow-floating-medium)' }}
    >
      <div className={styles.widgetHead}>
        <button
          type="button"
          className={styles.handle}
          aria-label={t.acceptance.layout.move(title)}
          aria-describedby={hintId}
          onPointerDown={(event) => controls.start(event)}
          onKeyDown={onHandleKey}
        >
          <GrabberIcon size={16} />
        </button>
        <span id={hintId} className="fl-visually-hidden">
          {t.acceptance.layout.moveHint}
        </span>
        <h4 className={styles.widgetHeading}>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={onToggle}
          >
            <StatusIcon status={status} />
            <span className={styles.widgetTitle}>{title}</span>
            {pinned ? (
              <PinIcon
                size={12}
                aria-label={t.acceptance.layout.pinnedMark}
                className={styles.pinnedMark}
              />
            ) : null}
            {summary ? <span className={styles.summary}>{summary}</span> : null}
            <ChevronDownIcon
              size={16}
              className={styles.chevron}
              data-open={collapsed ? undefined : ''}
              aria-hidden="true"
            />
          </button>
        </h4>
        <a
          href={github}
          target="_blank"
          rel="noreferrer"
          className={styles.github}
          aria-label={`${t.acceptance.layout.onGitHub} : ${title}`}
        >
          <span className={styles.githubText}>{t.acceptance.layout.onGitHub}</span>
          <LinkExternalIcon size={16} aria-hidden="true" />
        </a>
        <IconButton
          icon={PinIcon}
          aria-label={t.acceptance.layout.pin}
          aria-pressed={pinned}
          variant="invisible"
          className={`${styles.iconButton} ${styles.pin}`}
          onClick={onPin}
        />
        <ActionMenu>
          <ActionMenu.Anchor>
            <IconButton
              icon={KebabHorizontalIcon}
              aria-label={t.acceptance.layout.actions(title)}
              variant="invisible"
              className={styles.iconButton}
            />
          </ActionMenu.Anchor>
          <ActionMenu.Overlay align="end">
            <ActionList>
              <ActionList.Item disabled={!canUp} onSelect={() => onMove(-1)}>
                <ActionList.LeadingVisual>
                  <ArrowUpIcon />
                </ActionList.LeadingVisual>
                {t.acceptance.layout.up}
              </ActionList.Item>
              <ActionList.Item disabled={!canDown} onSelect={() => onMove(1)}>
                <ActionList.LeadingVisual>
                  <ArrowDownIcon />
                </ActionList.LeadingVisual>
                {t.acceptance.layout.down}
              </ActionList.Item>
              <ActionList.Item onSelect={onPin}>
                <ActionList.LeadingVisual>
                  {pinned ? <PinSlashIcon /> : <PinIcon />}
                </ActionList.LeadingVisual>
                {pinned ? t.acceptance.layout.unpin : t.acceptance.layout.pin}
              </ActionList.Item>
              <ActionList.Item onSelect={onToggle}>
                <ActionList.LeadingVisual>
                  {collapsed ? <UnfoldIcon /> : <FoldIcon />}
                </ActionList.LeadingVisual>
                {collapsed ? t.acceptance.layout.expand : t.acceptance.layout.collapse}
              </ActionList.Item>
              {wide ? (
                <ActionList.Item onSelect={onHalf}>
                  <ActionList.LeadingVisual>
                    {half ? <SquareIcon /> : <ColumnsIcon />}
                  </ActionList.LeadingVisual>
                  {half ? t.acceptance.layout.full : t.acceptance.layout.half}
                </ActionList.Item>
              ) : null}
            </ActionList>
          </ActionMenu.Overlay>
        </ActionMenu>
      </div>
      <TallyBar tally={counts} />
      {/* Folded, the content stays alive (the twins keep their state) but leaves the focus order. */}
      <motion.div
        id={bodyId}
        className={styles.fold}
        initial={false}
        animate={collapsed ? { height: 0, opacity: 0 } : { height: 'auto', opacity: 1 }}
        transition={FOLD}
        inert={collapsed}
        data-collapsed={collapsed ? '' : undefined}
      >
        <div className={styles.widgetBody}>{children}</div>
      </motion.div>
    </Reorder.Item>
  );
}

/**
 * The acceptance of the issue's PR: everything in sight at once, as widgets the owner orders, pins,
 * folds and sizes; the layout is theirs, kept on the device for every PR. Each element leads to GitHub.
 * The header counts the elements, what needs the owner first; each count leads to its first element.
 */
export function AcceptanceBoard({ issue, view }: { issue: IssueSummary; view: AcceptanceView }) {
  const { t } = useI18n();
  const { enabled } = useMotion();
  const titleId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const wide = useWide();
  const [layout, setLayout] = useState<BoardLayout>(loadLayout);
  const [announcement, setAnnouncement] = useState('');
  // Motion can end a drag before React renders the drag's last reorder: the layout that reorder made is
  // kept here, for the announcement, rather than read from a render that predates it.
  const dragged = useRef<BoardLayout | null>(null);
  const repoUrl = issue.url.replace(/\/issues\/\d+$/, '');
  const prUrl = issue.pr?.url ?? `${repoUrl}/pull/${view.pr}`;

  const names: Record<WidgetId, string> = t.acceptance.widget;
  const github: Record<WidgetId, string> = {
    criteria: issue.url,
    checks: `${prUrl}/checks`,
    tests: view.tests[0]?.url ?? `${prUrl}/checks`,
    proofs: view.gate?.url ?? prUrl,
    threads: `${prUrl}/files`,
    twins: `${repoUrl}/compare/${view.base}...${view.head}`,
  };
  const content: Record<WidgetId, ReactNode> = {
    criteria: <CriteriaWidget view={view} />,
    checks: <ChecksWidget view={view} />,
    tests: <TestsWidget view={view} />,
    proofs: <ProofsWidget view={view} />,
    threads: <ThreadsWidget view={view} />,
    twins: <TwinsWidget view={view} />,
  };

  const apply = (next: BoardLayout, message: string | null) => {
    setLayout(next);
    saveLayout(next);
    if (message) setAnnouncement(message);
  };
  const announceMove = (next: BoardLayout, id: WidgetId) => {
    const place = placeOf(next, id);
    return t.acceptance.layout.moved(names[id], place.position, place.count);
  };
  const status = boardStatus(view);
  const counts = boardTally(view);

  /**
   * The first element of this kind, in the owner's order: its widget unfolded, then each fold that hides
   * it opened (a group of green lines, the captures), then in sight with the focus.
   */
  const reveal = (kind: keyof Tally) => {
    const id = layout.order.find((each) => widgetTally(view, each)[kind] > 0);
    if (!id) return;
    if (layout.collapsed.includes(id)) apply(toggleCollapsed(layout, id), null);
    requestAnimationFrame(() => {
      const frame = listRef.current?.querySelector<HTMLElement>(`[data-widget="${id}"]`);
      if (!frame) return;
      const target =
        frame.querySelector<HTMLElement>(`[data-item="${kind}"]`) ??
        frame.querySelector<HTMLElement>('button[aria-expanded]');
      if (!target) return;
      // Each fold is opened once by its own toggle, the one whose `aria-controls` names it.
      const toggles = [...frame.querySelectorAll<HTMLElement>('[aria-controls]')];
      for (let node = target.parentElement; node && node !== frame; node = node.parentElement) {
        const fold = node;
        if (fold.hidden)
          toggles.find((each) => each.getAttribute('aria-controls') === fold.id)?.click();
      }
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: enabled ? 'smooth' : 'auto', block: 'center' });
        target.focus({ preventScroll: true });
      });
    });
  };
  const buckets = (
    [
      ['nok', `${counts.nok} NOK`],
      ['pending', t.acceptance.tally(0, 0, counts.pending)],
      ['info', t.acceptance.tally(0, 0, 0, counts.info)],
      ['ok', t.acceptance.tally(counts.ok, 0, 0)],
    ] as const
  ).filter(([kind]) => counts[kind] > 0);
  // Approving is offered only when every element is OK: a red verdict never sits beside « Approve ».
  const canApprove = status === 'ok' && issue.pr?.reviewDecision === 'review_required';

  return (
    <section className={styles.board} aria-labelledby={titleId}>
      <header className={styles.head}>
        <div className={styles.headTitle}>
          <StatusIcon status={status} size={20} />
          <Heading as="h3" id={titleId} variant="small" className={styles.title}>
            {t.acceptance.title(view.pr)}
          </Heading>
          <span className={styles.headSummary}>
            {buckets.map(([kind, text]) => (
              <button
                key={kind}
                type="button"
                className={styles.bucket}
                data-status={kind}
                aria-label={t.acceptance.goTo(text)}
                onClick={() => reveal(kind)}
              >
                {text}
              </button>
            ))}
          </span>
        </div>
        <div className={styles.headActions}>
          <Button
            as="a"
            href={prUrl}
            target="_blank"
            rel="noreferrer"
            trailingVisual={LinkExternalIcon}
            className={styles.cta}
          >
            {canApprove ? t.pr.approve : t.pr.open}
          </Button>
          <ActionMenu>
            <ActionMenu.Anchor>
              <IconButton
                icon={KebabHorizontalIcon}
                aria-label={t.acceptance.layout.menu}
                className={styles.iconButton}
              />
            </ActionMenu.Anchor>
            <ActionMenu.Overlay align="end">
              <ActionList>
                <ActionList.Item
                  onSelect={() => apply(DEFAULT_LAYOUT, t.acceptance.layout.resetDone)}
                >
                  {t.acceptance.layout.reset}
                </ActionList.Item>
              </ActionList>
            </ActionMenu.Overlay>
          </ActionMenu>
        </div>
        <p className={styles.intro}>{t.acceptance.intro}</p>
      </header>

      <Reorder.Group
        ref={listRef}
        as="ol"
        values={layout.order}
        onReorder={(order) => {
          const next = reorder(layout, order);
          dragged.current = next;
          apply(next, null);
        }}
        className={styles.list}
        aria-labelledby={titleId}
      >
        {layout.order.map((id) => {
          const place = placeOf(layout, id);
          const pinned = layout.pinned.includes(id);
          return (
            <WidgetFrame
              key={id}
              id={id}
              title={names[id]}
              status={widgetStatus(view, id)}
              counts={widgetTally(view, id)}
              collapsed={layout.collapsed.includes(id)}
              pinned={pinned}
              half={layout.half.includes(id)}
              wide={wide}
              canUp={place.canUp}
              canDown={place.canDown}
              github={github[id]}
              onToggle={() => apply(toggleCollapsed(layout, id), null)}
              onPin={() => {
                const next = togglePin(layout, id);
                apply(
                  next,
                  pinned
                    ? t.acceptance.layout.unpinned(names[id])
                    : t.acceptance.layout.pinned(names[id]),
                );
              }}
              onHalf={() => apply(toggleHalf(layout, id), null)}
              onMove={(delta) => {
                const next = move(layout, id, delta);
                apply(next, announceMove(next, id));
              }}
              onDropped={() => {
                const landed = dragged.current ?? layout;
                dragged.current = null;
                setAnnouncement(announceMove(landed, id));
              }}
            >
              {content[id]}
            </WidgetFrame>
          );
        })}
      </Reorder.Group>
      <p role="status" className="fl-visually-hidden">
        {announcement}
      </p>
    </section>
  );
}
