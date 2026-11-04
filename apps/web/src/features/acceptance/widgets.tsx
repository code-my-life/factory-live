import type {
  AcceptanceCheck,
  AcceptanceGateRule,
  AcceptanceProof,
  AcceptanceTestSuite,
  AcceptanceView,
} from '@factory-live/contracts';
import {
  ChevronDownIcon,
  InfoIcon,
  LinkExternalIcon,
  ScreenFullIcon,
} from '@primer/octicons-react';
import { Button, Dialog } from '@primer/react';
import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import styles from './acceptance.module.css';
import { checkStatus, tally, worst } from './status.ts';
import type { WidgetStatus } from './status.ts';
import { StatusIcon } from './StatusMark.tsx';

/**
 * A line of a widget that leads to its element on GitHub: the whole line is the link; its verdict is
 * the picto at the start, the way out the arrow at the end.
 */
function Row({
  href,
  status,
  label,
  children,
  value,
}: {
  href: string;
  status: WidgetStatus;
  /** The picto's words, when the line's text does not already say the verdict. */
  label?: string | null;
  children: ReactNode;
  value?: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={styles.row}
      data-status={status}
      data-item={status}
    >
      <StatusIcon status={status} label={label} />
      <span className={styles.rowMain}>{children}</span>
      {value !== undefined ? <span className={styles.rowValue}>{value}</span> : <span />}
      <LinkExternalIcon size={12} className={styles.rowOut} aria-hidden="true" />
    </a>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

/**
 * The green lines of a long list, folded into one line that says how many they are: what needs the
 * owner stays in sight above it, the rest is one gesture away (« View all », in place).
 */
function OkGroup({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <li className={styles.rowItem}>
      <button
        type="button"
        className={styles.groupToggle}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <StatusIcon status="ok" label={null} />
        <span className={styles.groupLabel}>{label}</span>
        <ChevronDownIcon
          size={16}
          className={styles.chevron}
          data-open={open ? '' : undefined}
          aria-hidden="true"
        />
      </button>
      <ul id={id} className={styles.rows} hidden={!open}>
        {children}
      </ul>
    </li>
  );
}

/** The issue's criteria, one line each: the picto, the criterion, then its proof or why it lacks one. */
export function CriteriaWidget({ view }: { view: AcceptanceView }) {
  const { t } = useI18n();
  if (view.criteria.length === 0) return <Empty>{t.acceptance.criteria.none}</Empty>;
  return (
    <ul className={styles.rows}>
      {view.criteria.map((criterion) => (
        <li key={criterion.id} className={styles.rowItem}>
          <Row href={criterion.url} status={criterion.status}>
            <span className={styles.rowTitle}>
              <span className={styles.criterionId}>{criterion.id}</span>
              {criterion.text}
            </span>
            <span className={styles.rowNote}>
              {criterion.reason === 'proven' ? null : (
                <span className={styles.reason} data-status={criterion.status}>
                  {t.acceptance.criteria.reason[criterion.reason]}
                  {criterion.proof ? ' · ' : ''}
                </span>
              )}
              {criterion.proof}
            </span>
          </Row>
        </li>
      ))}
    </ul>
  );
}

function CheckRow({ check }: { check: AcceptanceCheck }) {
  const { t, fmt } = useI18n();
  return (
    <Row
      href={check.url}
      status={checkStatus(check)}
      label={t.acceptance.checks.status[check.status]}
      value={check.durationMs !== null ? fmt.duration(check.durationMs) : undefined}
    >
      <span className={styles.rowTitle}>{check.name}</span>
      {check.workflow ? <span className={styles.rowNote}>{check.workflow}</span> : null}
    </Row>
  );
}

/** A rule of the gate, as its comment writes it: the whole line leads to that comment. */
function GateRule({ rule, href }: { rule: AcceptanceGateRule; href: string }) {
  const { t } = useI18n();
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={styles.rule}
        data-status={rule.status}
      >
        {rule.status === 'info' ? (
          <InfoIcon
            size={16}
            aria-label={t.acceptance.checks.info}
            className={styles.statusIcon}
            data-status="none"
          />
        ) : (
          <StatusIcon status={rule.status} />
        )}
        <span className={styles.ruleName}>{rule.rule}</span>
        <span className={styles.ruleDetail}>{rule.detail}</span>
        <LinkExternalIcon size={12} className={styles.rowOut} aria-hidden="true" />
      </a>
    </li>
  );
}

/**
 * The checks of the PR's head, then the gate's verdict rule by rule, as its comment writes them. What
 * failed or runs shows; what passed folds into one line.
 */
export function ChecksWidget({ view }: { view: AcceptanceView }) {
  const { t, fmt } = useI18n();
  const passed = view.checks.filter((check) => checkStatus(check) === 'ok');
  const other = view.checks.filter((check) => checkStatus(check) !== 'ok');
  const rules = view.gate?.rules ?? [];
  const gateUrl = view.gate?.url ?? '';
  const green = rules.filter((rule) => rule.status === 'ok');
  const notGreen = rules.filter((rule) => rule.status !== 'ok');
  return (
    <div className={styles.parts}>
      <section className={styles.part}>
        <h5 className={styles.subhead}>{t.acceptance.checks.ci}</h5>
        {view.checks.length === 0 ? (
          <Empty>{t.acceptance.checks.none}</Empty>
        ) : (
          <ul className={styles.rows}>
            {other.map((check) => (
              <li key={`${check.workflow ?? ''}/${check.name}`} className={styles.rowItem}>
                <CheckRow check={check} />
              </li>
            ))}
            {passed.length > 0 ? (
              <OkGroup label={t.acceptance.checks.passed(passed.length)}>
                {passed.map((check) => (
                  <li key={`${check.workflow ?? ''}/${check.name}`} className={styles.rowItem}>
                    <CheckRow check={check} />
                  </li>
                ))}
              </OkGroup>
            ) : null}
          </ul>
        )}
      </section>
      <section className={styles.part}>
        <h5 className={styles.subhead}>{t.acceptance.checks.gate}</h5>
        {view.gate ? (
          <>
            <Row
              href={view.gate.url}
              status={view.gate.status}
              value={view.gate.at ? fmt.clock(view.gate.at) : undefined}
            >
              <span className={styles.rowTitle}>
                factory/gate{' '}
                <span className={styles.rowNote}>{t.acceptance.checks.gateOn(view.gate.head)}</span>
              </span>
            </Row>
            {notGreen.length > 0 ? (
              <ul className={styles.rules}>
                {notGreen.map((rule, index) => (
                  <GateRule key={`${rule.rule}-${index}`} rule={rule} href={gateUrl} />
                ))}
              </ul>
            ) : null}
            {green.length > 0 ? (
              <ul className={styles.rows}>
                <OkGroup label={t.acceptance.checks.okRules(green.length)}>
                  <li className={styles.rowItem}>
                    <ul className={styles.rules}>
                      {green.map((rule, index) => (
                        <GateRule key={`${rule.rule}-${index}`} rule={rule} href={gateUrl} />
                      ))}
                    </ul>
                  </li>
                </OkGroup>
              </ul>
            ) : null}
          </>
        ) : (
          <Empty>{t.acceptance.checks.noGate}</Empty>
        )}
      </section>
    </div>
  );
}

function SuiteRows({ suites }: { suites: AcceptanceTestSuite[] }) {
  const { t, fmt } = useI18n();
  return (
    <ul className={styles.rows}>
      {suites.map((suite) => {
        const ran = suite.passed + suite.failed + suite.skipped > 0;
        return (
          <li key={`${suite.kind}/${suite.name}`} className={styles.rowItem}>
            <Row
              href={suite.url}
              status={suite.status}
              value={suite.durationMs !== null ? fmt.duration(suite.durationMs) : undefined}
            >
              <span className={styles.rowTitle}>{suite.name}</span>
              {suite.status === 'pending' && !ran ? (
                <span className={styles.reason} data-status="pending">
                  {t.acceptance.tests.running}
                </span>
              ) : (
                <span className={styles.counts}>
                  <span>{t.acceptance.tests.passed(suite.passed)}</span>
                  <span className={styles.reason} data-status={suite.failed > 0 ? 'nok' : 'none'}>
                    {t.acceptance.tests.failed(suite.failed)}
                  </span>
                  {suite.skipped > 0 ? (
                    <span>{t.acceptance.tests.skipped(suite.skipped)}</span>
                  ) : null}
                </span>
              )}
            </Row>
            {suite.failures.length > 0 ? (
              <ul className={styles.failures}>
                {suite.failures.map((failure) => (
                  <li key={failure.name} className={styles.rowItem}>
                    <Row href={failure.url} status="nok">
                      <span className={styles.rowTitle}>{failure.name}</span>
                    </Row>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The test reports of the head: the unit tests, then each project of the end-to-end tests. */
export function TestsWidget({ view }: { view: AcceptanceView }) {
  const { t } = useI18n();
  if (view.tests.length === 0) return <Empty>{t.acceptance.tests.none}</Empty>;
  return (
    <div className={styles.parts}>
      {(['unit', 'e2e'] as const).map((kind) => {
        const suites = view.tests.filter((suite) => suite.kind === kind);
        return suites.length > 0 ? (
          <section key={kind} className={styles.part}>
            <h5 className={styles.subhead}>{t.acceptance.tests.kind[kind]}</h5>
            <SuiteRows suites={suites} />
          </section>
        ) : null;
      })}
    </div>
  );
}

/** Lines of a textual proof shown whole; beyond, its head and its tail, where a run says how it ended. */
const PROOF_LINES = 12;
const PROOF_HEAD = 6;
const PROOF_TAIL = 4;

/** The text of a proof, as is: whole when short; else its head and its tail, the whole on demand. */
function ProofText({ text }: { text: string }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const lines = text.replace(/\n+$/, '').split('\n');
  const long = lines.length > PROOF_LINES;
  const shown =
    all || !long
      ? lines
      : [
          ...lines.slice(0, PROOF_HEAD),
          t.acceptance.proofs.hidden(lines.length - PROOF_HEAD - PROOF_TAIL),
          ...lines.slice(-PROOF_TAIL),
        ];
  return (
    <div className={styles.proofText}>
      <pre className={styles.proofPre}>{shown.join('\n')}</pre>
      {long ? (
        <Button size="small" variant="invisible" onClick={() => setAll((value) => !value)}>
          {all ? t.acceptance.proofs.showLess : t.acceptance.proofs.showAll(lines.length)}
        </Button>
      ) : null}
    </div>
  );
}

/** A capture, before and after, as two small pictures; side by side at full size on demand. */
function CapturePair({ proof }: { proof: AcceptanceProof }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const enlarge = useRef<HTMLButtonElement>(null);
  if (!proof.before || !proof.after) return null;
  const sides = [
    ['before', proof.before],
    ['after', proof.after],
  ] as const;
  return (
    <li className={styles.capturePair} data-item={proof.status} tabIndex={-1}>
      <p className={styles.captureHead}>
        <StatusIcon status={proof.status} />
        <span className={styles.captureTitle}>{proof.detail}</span>
      </p>
      <div className={styles.captureThumbs}>
        {sides.map(([side, src]) => (
          <figure key={side} className={styles.capture}>
            <img
              src={src}
              alt={t.acceptance.proofs.captureOf(t.acceptance.proofs[side], proof.detail)}
              className={styles.captureImage}
              loading="lazy"
            />
            <figcaption className={styles.captureCaption}>{t.acceptance.proofs[side]}</figcaption>
          </figure>
        ))}
      </div>
      <div className={styles.captureActions}>
        <Button
          ref={enlarge}
          size="small"
          leadingVisual={ScreenFullIcon}
          className={styles.captureEnlarge}
          onClick={() => setOpen(true)}
        >
          {t.acceptance.proofs.enlarge}
        </Button>
        <a href={proof.url} target="_blank" rel="noreferrer" className={styles.captureSource}>
          {t.acceptance.layout.onGitHub} <LinkExternalIcon size={12} aria-hidden="true" />
        </a>
      </div>
      {open ? (
        <Dialog
          title={proof.detail}
          width="min(96vw, 1440px)"
          position={{ narrow: 'fullscreen', regular: 'center' }}
          returnFocusRef={enlarge}
          onClose={() => setOpen(false)}
        >
          <div className={styles.captureLarge}>
            {sides.map(([side, src]) => (
              <figure key={side} className={styles.capture}>
                <figcaption className={styles.captureCaption}>
                  {t.acceptance.proofs[side]}
                </figcaption>
                <img
                  src={src}
                  alt={t.acceptance.proofs.captureOf(t.acceptance.proofs[side], proof.detail)}
                  className={styles.captureImage}
                />
              </figure>
            ))}
          </div>
        </Dialog>
      ) : null}
    </li>
  );
}

/**
 * The visual proofs, folded by default: on a big PR they would take the whole board. Folded, their line
 * still says the worst of their verdicts, and how many are NOK or still running.
 */
function Captures({ proofs }: { proofs: AcceptanceProof[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  const statuses = proofs.flatMap((proof) => (proof.status === 'info' ? [] : [proof.status]));
  const counts = tally(statuses);
  return (
    <section className={styles.part}>
      <button
        type="button"
        className={styles.disclosure}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <StatusIcon status={worst(statuses)} label={null} />
        <span>{t.acceptance.proofs.visual(proofs.length)}</span>
        {counts.nok + counts.pending > 0 ? (
          <span className={styles.summary}>
            {t.acceptance.tally(counts.ok, counts.nok, counts.pending)}
          </span>
        ) : null}
        <ChevronDownIcon
          size={16}
          className={styles.chevron}
          data-open={open ? '' : undefined}
          aria-hidden="true"
        />
      </button>
      <ul id={id} className={styles.captureList} hidden={!open}>
        {proofs.map((proof, index) => (
          <CapturePair key={`${proof.detail}-${index}`} proof={proof} />
        ))}
      </ul>
    </section>
  );
}

/**
 * The proofs of the PR: the textual ones with their text in sight, the captures folded, then what the
 * PR itself says it does not prove, for the owner to judge.
 */
export function ProofsWidget({ view }: { view: AcceptanceView }) {
  const { t } = useI18n();
  if (view.proofs.length === 0) return <Empty>{t.acceptance.proofs.none}</Empty>;
  const textual = view.proofs.filter(
    (proof) => proof.kind !== 'capture' && proof.kind !== 'unproven',
  );
  const visual = view.proofs.filter((proof) => proof.kind === 'capture');
  const declared = view.proofs.filter((proof) => proof.kind === 'unproven');
  return (
    <div className={styles.parts}>
      {declared.length > 0 ? (
        <section className={styles.part}>
          <h5 className={styles.subhead}>{t.acceptance.proofs.declared}</h5>
          <ul className={styles.rows}>
            {declared.map((proof, index) => (
              <li key={`${proof.kind}-${index}`} className={styles.rowItem}>
                <Row href={proof.url} status="info">
                  <span className={styles.rowTitle}>{proof.detail}</span>
                </Row>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {textual.length > 0 ? (
        <section className={styles.part}>
          <h5 className={styles.subhead}>{t.acceptance.proofs.textual}</h5>
          <ul className={styles.rows}>
            {textual.map((proof, index) => (
              <li key={`${proof.kind}-${index}`} className={styles.rowItem}>
                <Row href={proof.url} status={proof.status}>
                  <span className={styles.rowTitle}>{t.acceptance.proofs.kind[proof.kind]}</span>
                  <span className={styles.rowNote}>{proof.detail}</span>
                </Row>
                {proof.content ? <ProofText text={proof.content} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {visual.length > 0 ? <Captures proofs={visual} /> : null}
    </div>
  );
}

/**
 * The review threads of the PR: those still to handle first, then the resolved ones folded into one
 * line; each leads to its discussion.
 */
export function ThreadsWidget({ view }: { view: AcceptanceView }) {
  const { t, fmt } = useI18n();
  // The reviews posted on the PR count even when none left a thread to handle.
  const rounds =
    view.reviewRounds > 0 ? (
      <p className={styles.empty}>{t.acceptance.threads.rounds(view.reviewRounds)}</p>
    ) : null;
  if (view.threads.length === 0)
    return (
      <div className={styles.parts}>
        {rounds}
        <Empty>{t.acceptance.threads.none}</Empty>
      </div>
    );
  const open = view.threads.filter((thread) => !thread.resolved);
  const resolved = view.threads.filter((thread) => thread.resolved);
  const row = (thread: (typeof view.threads)[number]) => (
    <li key={thread.url} className={styles.rowItem}>
      <Row
        href={thread.url}
        status={thread.resolved ? 'ok' : 'nok'}
        label={thread.resolved ? t.acceptance.threads.resolved : t.acceptance.threads.open}
        value={`${fmt.dayMonth(thread.at)} ${fmt.clock(thread.at)}`}
      >
        <span className={styles.rowTitle}>
          {thread.severity ? <span className={styles.criterionId}>{thread.severity}</span> : null}
          {thread.title}
        </span>
        <span className={styles.rowNote}>{thread.author}</span>
      </Row>
    </li>
  );
  return (
    <div className={styles.parts}>
      {rounds}
      <ul className={styles.rows}>
        {open.map(row)}
        {resolved.length > 0 ? (
          <OkGroup label={t.acceptance.threads.resolvedGroup(resolved.length)}>
            {resolved.map(row)}
          </OkGroup>
        ) : null}
      </ul>
    </div>
  );
}
