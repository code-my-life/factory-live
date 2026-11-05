import { parseWorkflowSheet } from '@factory-live/contracts';
import type {
  AgentActivity,
  IssueStatus,
  IssueSummary,
  StationKind,
  WorkflowSheet,
} from '@factory-live/contracts';
import { ChevronDownIcon, ChevronUpIcon } from '@primer/octicons-react';
import { Banner, Button, Heading } from '@primer/react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { DEMO_WORDS } from '../../demo/studio.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { VideoPlayer, WordTrack, frameOf } from '../../ui/media/index.ts';
import page from '../../ui/page.module.css';
import {
  BranchLink,
  FanLink,
  GroupFrame,
  ItemRow,
  KindChip,
  Legend,
  LineLink,
  ProvidersBlock,
  ReturnArch,
  StationBlock,
  ZoomControls,
  octicon,
  useSheetText,
} from '../line/graph/blocks/index.ts';
import type { StationLook } from '../line/graph/blocks/index.ts';
import { HEAD_H, PROOF_HEAD_H, bodyHeight, planOf } from '../line/graph/layout.ts';
import type { Box, Fill } from '../line/graph/layout.ts';
import type { LineIssue, ProviderRow } from '../line/graph/model.ts';
import { BACK, paletteOf } from '../line/graph/palette.ts';
import { WorkflowGraph } from '../line/graph/WorkflowGraph.tsx';
import graph from '../line/graph/graph.module.css';
import styles from './ComponentsPage.module.css';

/** The moment the samples are seen from: their times read the same on every visit. */
const NOW = Date.parse('2026-11-05T12:00:00Z');
const STATUSES: readonly IssueStatus[] = [
  'active',
  'waiting_human',
  'blocked',
  'queued',
  'done',
  'stopped',
];
const KINDS: readonly StationKind[] = ['ai', 'script', 'github', 'owner', 'end'];
const MODEL = { model: 'claude-opus-5-5', provider: 'anthropic', source: 'live' } as const;
const noop = () => undefined;

/** A sample item of the studio. */
function sample(number: number, title: string, status: IssueStatus, box: string): LineIssue {
  const key = `video-factory#${number}`;
  const issue: IssueSummary = {
    key,
    repo: 'video-factory',
    number,
    title,
    url: `https://github.com/code-my-life/video-factory/issues/${number}`,
    labels: [],
    station: 'implementation',
    previousStation: null,
    stationChangedAt: '2026-11-05T10:40:00Z',
    status,
    claudeModel: null,
    harness: null,
    pr: null,
    prUrl: null,
    activeProfiles: [],
    interventionIds: [],
    startedAt: '2026-11-05T09:00:00Z',
    updatedAt: '2026-11-05T11:00:00Z',
    type: null,
    lane: null,
    journey: [],
  };
  return { issue, box, agent: null, intervention: null };
}

/** An agent writing the script, calling its model right now. */
function writer(issueKey: string): AgentActivity {
  return {
    profile: 'coder-claude',
    station: 'implementation',
    state: 'thinking',
    cardId: null,
    issueKey,
    model: MODEL,
    laneModel: null,
    action: null,
    runStartedAt: '2026-11-05T11:50:00Z',
    lastHeartbeatAt: '2026-11-05T11:59:00Z',
  };
}

/** A box at the origin of its own stage, as tall as what it holds. */
function boxOf(id: string, fill: Fill, w = 220, head = HEAD_H): Box {
  return { id, x: 0, y: 0, w, h: head + bodyHeight(fill) + 2, head, portY: HEAD_H / 2 };
}

/** A block, absolutely placed as in the graph, in a stage of its size. */
function Stage({ w, h, children }: { w: number; h: number; children: ReactNode }) {
  return (
    <div className={styles.stage} style={{ width: w, height: h }}>
      {children}
    </div>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className={styles.cell}>
      {children}
      <figcaption className={styles.caption}>{label}</figcaption>
    </figure>
  );
}

/** The legend as a graph folds it: closed under its toggle, or open. */
function LegendDrawer({
  id,
  initiallyOpen,
  legend,
}: {
  id: string;
  initiallyOpen: boolean;
  legend: ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div className={styles.legend}>
      <Button
        className={graph.control}
        variant="invisible"
        size="small"
        trailingVisual={open ? ChevronUpIcon : ChevronDownIcon}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        {t.line.graph.legend}
      </Button>
      {open ? <div id={id}>{legend}</div> : null}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className={page.panel} aria-labelledby={`components-${id}`}>
      <h2 id={`components-${id}`} className={page.sectionTitle}>
        {title}
      </h2>
      <div className={styles.cells}>{children}</div>
    </section>
  );
}

/** The first words of the demo's aligned words (derived from a script, not a master's). */
const SAMPLE_WORDS = (DEMO_WORDS['presenter-factory-live'] ?? []).slice(0, 14);
const SAMPLE_TOTAL = frameOf(SAMPLE_WORDS[SAMPLE_WORDS.length - 1]?.fin ?? 0) + 1;

/** The player and its words, at `start`: touching a word or a key moves both. */
function MediaSample({ start, words }: { start: number; words: boolean }) {
  const { t } = useI18n();
  const [frame, setFrame] = useState(start);
  return (
    <div className={styles.media}>
      <VideoPlayer
        src={null}
        total={SAMPLE_TOTAL}
        frame={frame}
        onFrame={setFrame}
        label={t.components.media.sample}
      />
      {words ? <WordTrack words={SAMPLE_WORDS} frame={frame} onSeek={setFrame} /> : null}
    </div>
  );
}

/**
 * The catalogue of the standard blocks of a workflow's graph, each in its states, then a sheet of
 * three stations drawn with them, and a refused sheet. Opened by `/composants` only: no link in the
 * navigation.
 */
export function ComponentsPage() {
  const { t } = useI18n();
  const c = t.components;
  const s = c.sample;

  // The sample workflow: a video studio of three stations, one per kind of work that varies.
  const studio = useMemo(
    () =>
      parseWorkflowSheet({
        item: { type: 'video', label: s.item },
        stations: [
          { key: 'write', label: s.write, icon: 'pencil', kind: 'ai', col: 0, row: 1 },
          { key: 'render', label: s.render, icon: 'video', kind: 'script', col: 1, row: 1 },
          { key: 'approve', label: s.approve, icon: 'eye', kind: 'owner', col: 2, row: 1 },
        ],
        edges: [
          { from: 'write', to: 'render', kind: 'line' },
          { from: 'render', to: 'approve', kind: 'line' },
          { from: 'approve', to: 'write', kind: 'return', label: s.again },
        ],
        models: ['write'],
      }),
    [s],
  );
  const refused = useMemo(
    () =>
      parseWorkflowSheet({
        item: { type: 'video', label: s.item },
        stations: [
          { key: 'write', label: s.write, icon: 'pencil', kind: 'ai', col: 0, row: 1 },
          { key: 'write', label: s.render, icon: 'video', kind: 'script', col: 1, row: 1 },
        ],
        edges: [],
        models: [],
      }),
    [s],
  );
  const sheet: WorkflowSheet = studio.ok
    ? studio.sheet
    : { item: { type: '', label: '' }, stations: [], edges: [], models: [] };
  const plan = planOf(sheet);
  const text = useSheetText(plan);
  const palette = useMemo(() => paletteOf(['fan', 'branch']), []);

  const items = [
    sample(12, s.titles.intro, 'active', 'write'),
    sample(13, s.titles.demo, 'waiting_human', 'write'),
    sample(14, s.titles.teaser, 'queued', 'write'),
  ];
  const [first] = items as [LineIssue];
  const thinking = { ...first, agent: writer(first.issue.key) };
  const look = (key: string): StationLook => ({
    label: text.label(key),
    hint: text.hint(key),
    icon: octicon(plan.station.get(key)?.icon ?? ''),
    kind: plan.station.get(key)?.kind ?? null,
    swatch: null,
    types: null,
    member: null,
  });
  const station = (
    label: string,
    list: readonly LineIssue[],
    limit: number,
    selectedKey: string | null,
  ) => {
    const fill: Fill = {
      rows: Math.min(list.length, limit),
      row: 'full',
      more: list.length - limit,
    };
    const box = boxOf('write', fill);
    return (
      <Cell label={label}>
        <Stage w={box.w} h={box.h}>
          <StationBlock
            id="write"
            box={box}
            look={look('write')}
            items={list}
            row="full"
            limit={limit}
            ai
            selectedKey={selectedKey}
            travelling={new Set()}
            landed={new Set()}
            shown={null}
            onSelect={noop}
            now={NOW}
            maxInProgress={2}
          />
        </Stage>
      </Cell>
    );
  };

  const providerRows = (busy: boolean): ProviderRow[] => [
    { model: MODEL, lane: false, agents: ['coder-claude'], stations: ['write'], busy },
  ];
  const providers = (label: string, rows: readonly ProviderRow[]) => {
    const box = boxOf(
      'models',
      { rows: rows.length, row: 'compact', more: 0, rowH: 34 },
      300,
      PROOF_HEAD_H,
    );
    return (
      <Cell label={label}>
        <Stage w={box.w} h={box.h}>
          <ProvidersBlock box={box} rows={rows} label={text.label} />
        </Stage>
      </Cell>
    );
  };

  const member = {
    ...boxOf('checks:proofreading', { rows: 0, row: 'full', more: 0 }),
    x: 10,
    y: 40,
  };
  const frame = { x: 0, y: 0, w: 240, h: member.y + member.h + 10 };
  const link = (state: string) => (kind: string) => c.links.sample(kind, state);

  return (
    <section className={page.page} aria-labelledby="components-title">
      <header className={page.head}>
        <Heading as="h1" variant="medium" id="components-title">
          {c.title}
        </Heading>
        <p className={page.intro}>{c.intro}</p>
      </header>

      <Section id="station" title={c.station.title}>
        {station(c.station.empty, [], 0, null)}
        {station(c.station.rows, items.slice(0, 2), 2, null)}
        {station(c.station.more, items, 1, null)}
        {station(c.station.selected, items.slice(0, 1), 1, first.issue.key)}
      </Section>

      <Section id="kind" title={c.kind.title}>
        {KINDS.map((kind) => (
          <Cell key={kind} label={kind === 'end' ? c.kind.end : t.line.graph.kindHint[kind]}>
            <span className={styles.chip}>
              <KindChip kind={kind} />
            </span>
          </Cell>
        ))}
      </Section>

      <Section id="row" title={c.row.title}>
        {STATUSES.map((status, index) => {
          const item = sample(20 + index, s.titles.tutorial, status, 'write');
          return (
            <Cell key={status} label={t.issueStatus[status]}>
              <div className={styles.row}>
                <ItemRow
                  item={item}
                  row="full"
                  ai
                  selected={false}
                  arriving={false}
                  landed={false}
                  dimmed={false}
                  onSelect={noop}
                  now={NOW}
                  maxInProgress={2}
                />
              </div>
            </Cell>
          );
        })}
        {[
          { label: c.row.agent, item: thinking },
          { label: c.row.waiting, item: sample(14, s.titles.teaser, 'queued', 'write') },
        ].map(({ label, item }) => (
          <Cell key={label} label={label}>
            <div className={styles.row}>
              <ItemRow
                item={item}
                row="full"
                ai
                selected={false}
                arriving={false}
                landed={false}
                dimmed={false}
                onSelect={noop}
                now={NOW}
                maxInProgress={2}
              />
            </div>
          </Cell>
        ))}
      </Section>

      <Section id="providers" title={c.providers.title}>
        {providers(c.providers.empty, [])}
        {providers(c.providers.idle, providerRows(false))}
        {providers(c.providers.busy, providerRows(true))}
      </Section>

      <Section id="group" title={c.group.title}>
        <Cell label={s.group}>
          <Stage w={frame.w} h={frame.h}>
            <GroupFrame
              frame={frame}
              label={s.group}
              hint={s.group}
              icon={octicon('shield-check')}
              kind="script"
            />
            <StationBlock
              id={member.id}
              box={member}
              look={{
                label: s.member,
                hint: s.member,
                icon: null,
                kind: null,
                swatch: palette.color('fan'),
                types: s.item,
                member: 'proofreading',
              }}
              items={[]}
              row="full"
              limit={0}
              ai={false}
              selectedKey={null}
              travelling={new Set()}
              landed={new Set()}
              shown={null}
              onSelect={noop}
              now={NOW}
              maxInProgress={2}
            />
          </Stage>
        </Cell>
      </Section>

      <Section id="links" title={c.links.title}>
        {(
          [
            ['line', LineLink, palette.color('line')],
            ['branch', BranchLink, palette.color('branch')],
            ['fan', FanLink, palette.color('fan')],
          ] as const
        ).flatMap(([kind, Sample, color]) =>
          [false, true].map((active) => {
            const state = active ? c.links.active : c.links.rest;
            return (
              <Cell key={`${kind}:${state}`} label={`${c.links.kind[kind]} · ${state}`}>
                <Sample color={color} active={active} label={link(state)(c.links.kind[kind])} />
              </Cell>
            );
          }),
        )}
        {(
          [
            [c.links.rest, undefined, '7 5'],
            [c.links.problem, 'problem', '7 5'],
            [c.links.request, 'request', '1 5'],
          ] as const
        ).map(([state, cause, dash]) => (
          <Cell key={state} label={`${c.links.kind.return} · ${state}`}>
            <ReturnArch
              color={palette.color(BACK)}
              mark={palette.mark(BACK, cause)}
              dash={dash}
              active={cause !== undefined}
              cause={cause}
              label={link(state)(c.links.kind.return)}
            />
          </Cell>
        ))}
      </Section>

      <Section id="legend" title={c.legend.title}>
        {[false, true].map((open) => (
          <Cell key={String(open)} label={open ? c.legend.open : c.legend.closed}>
            <LegendDrawer
              id={`components-legend-${String(open)}`}
              initiallyOpen={open}
              legend={
                <Legend
                  entries={plan.legend}
                  palette={paletteOf(plan.series)}
                  label={text.vector}
                />
              }
            />
          </Cell>
        ))}
      </Section>

      <Section id="zoom" title={c.zoom.title}>
        <Cell label={t.line.graph.zoom}>
          <ZoomControls zoomBy={noop} fit={noop} />
        </Cell>
      </Section>

      <Section id="media" title={c.media.title}>
        <Cell label={c.media.noMaster}>
          <MediaSample start={0} words={false} />
        </Cell>
        <Cell label={c.media.word}>
          <MediaSample start={frameOf(SAMPLE_WORDS[3]?.debut ?? 0)} words />
        </Cell>
      </Section>

      <section className={page.panel} aria-labelledby="components-sheet">
        <h2 id="components-sheet" className={page.sectionTitle}>
          {c.sheet.title}
        </h2>
        {studio.ok ? (
          <WorkflowGraph
            sheet={studio.sheet}
            items={[thinking, ...items.slice(1)]}
            providers={providerRows(true)}
            selectedKey={null}
            onSelect={noop}
            now={NOW}
            maxInProgress={2}
          />
        ) : (
          <Banner variant="critical" title={t.workflow.invalid} description={studio.error} />
        )}
        <h3 className={page.sectionTitle}>{c.sheet.invalid}</h3>
        {refused.ok ? null : (
          <Banner variant="critical" title={t.workflow.invalid} description={refused.error} />
        )}
      </section>
    </section>
  );
}
