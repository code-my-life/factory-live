import type {
  AcceptanceCriterion,
  AcceptanceGateRule,
  AcceptanceProof,
  AcceptanceView,
} from '@factory-live/contracts';
import type { AcceptanceSource, AcceptanceTestResult, GateProof } from './ports.ts';

/**
 * The recette of a PR from real data (#22): the issue's criteria judged by the tests the PR names in
 * the head's JUnit reports, the checks, the gate, the proofs, the threads. Written rules, no model
 * (ADR 0009, ADR 0011): the same facts always give the same recette.
 */

/** A criterion line, as the factory's standard writes it (`factory_types.py`): `- C1 : …`. */
const CRITERION =
  /^[ \t]*(?:[-*+][ \t]+)?(?:\[[ xX]\][ \t]+)?\**C(\d+)\**[ \t]*[:.)-][ \t]*(.*)$/gm;
const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
/** A test the PR names: « its name », after its file in backquotes. */
const NAMED = /(?:`([^`\s]+\.[A-Za-z0-9]+)`[^«“"`]*)?(?:«\s*([^»]+?)\s*»|“([^”\n]+)”|"([^"\n]+)")/g;
const UNPROVEN = /non[ \t]+prouvé/i;

/** The labels of the gate's rules (`LABELS` of `factory-gate.py`), to find a proof's rule. */
const RULE_LABELS: Record<string, string> = {
  pr: 'PR',
  type: 'Type',
  fraicheur: 'Fraîcheur',
  version: 'Version',
  tests: 'Tests nommés',
  ci: 'CI',
  diff: 'Diff',
  conventions: 'Conventions',
  fail_first: 'Fail-first',
  invariance: 'Invariance',
  documentation: 'Documentation',
  build: 'Build hors ligne',
  couverture: 'Couverture du diff',
  controles: 'Contrôles modifiés',
  interface: 'Interface',
  dependances: 'Dépendances',
  revue: 'Demande de changements',
};

const PROOF_KIND: Record<string, AcceptanceProof['kind']> = {
  fail_first: 'failfirst',
  invariance: 'invariance',
  documentation: 'documents',
  build: 'build',
  couverture: 'coverage',
};

function normalize(text: string): string {
  return text.normalize('NFC').replace(/[’ʼ]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

/** The lines of a section of a Markdown text, to the next heading of its level or above. */
function section(body: string | null, title: string): string[] {
  const lines = (body ?? '').split(/\r?\n/);
  const wanted = normalize(title);
  let level = 0;
  const found: string[] = [];
  for (const line of lines) {
    const heading = HEADING.exec(line);
    if (heading) {
      if (level > 0 && heading[1]!.length <= level) break;
      if (level === 0 && normalize(heading[2]!) === wanted) level = heading[1]!.length;
      continue;
    }
    if (level > 0) found.push(line);
  }
  return found;
}

/** `C1` -> its text, for each criterion line of a section. */
function criteriaLines(lines: string[]): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of lines.join('\n').matchAll(CRITERION)) {
    const id = `C${Number(match[1])}`;
    if (!found.has(id)) found.set(id, match[2]!.trim());
  }
  return found;
}

/** The tests a proof names, each with its file when the proof gives it. */
function namedTests(proof: string): { file: string | null; name: string }[] {
  return [...proof.matchAll(NAMED)].map((match) => ({
    file: match[1] ?? null,
    name: (match[2] ?? match[3] ?? match[4] ?? '').trim(),
  }));
}

/** Two paths name the same file when one ends the other at a folder's edge. */
function sameFile(left: string, right: string): boolean {
  return left === right || left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
}

/** A report's test is the named one: same name, or the same name under its describe blocks. */
function isNamed(
  result: AcceptanceTestResult,
  named: { file: string | null; name: string },
): boolean {
  const name = result.name;
  const sameName =
    name === named.name || name.endsWith(` > ${named.name}`) || name.endsWith(` › ${named.name}`);
  return sameName && (named.file === null || sameFile(result.file, named.file));
}

/**
 * A criterion's verdict, by written rules: NOK « non prouvé » when the PR says so, names no test, or
 * names a test missing from the reports once the CI is over; NOK « sa preuve échoue » when one of its
 * tests is red; running while a check runs and its tests are not reported; OK when all are green.
 */
function judge(
  id: string,
  text: string,
  proof: string | null,
  source: AcceptanceSource,
): AcceptanceCriterion {
  const unproven = {
    id,
    text,
    status: 'nok',
    reason: 'unproven',
    proof,
    url: source.prUrl,
  } as const;
  if (proof === null || UNPROVEN.test(proof)) return unproven;
  const named = namedTests(proof);
  if (named.length === 0) return unproven;
  const running = (source.checks ?? []).some((check) => check.status === 'pending');
  const results = source.tests?.results ?? [];
  const runs = named.map((each) => results.filter((result) => isNamed(result, each)));
  const failed = runs.flat().find((result) => result.outcome === 'failed');
  if (failed) return { id, text, status: 'nok', reason: 'failing', proof, url: failed.url };
  // A skipped run proves nothing: only a passed run counts.
  const passed = runs.map((each) => each.filter((result) => result.outcome === 'passed'));
  if (passed.some((each) => each.length === 0))
    return running
      ? { id, text, status: 'pending', reason: 'running', proof, url: source.prUrl }
      : unproven;
  return { id, text, status: 'ok', reason: 'proven', proof, url: passed[0]![0]!.url };
}

function proofStatus(rule: AcceptanceGateRule | undefined): AcceptanceProof['status'] {
  return rule ? rule.status : 'info';
}

/** What the PR declares it does not prove: one point per item of its section, as written. */
function declared(body: string | null): string[] {
  const items: string[] = [];
  for (const line of section(body, "Ce qui n'est pas prouvé")) {
    const item = /^[-*+][ \t]+(.+)$/.exec(line);
    if (item) items.push(item[1]!.trim());
    else if (/^[ \t]+\S/.test(line) && items.length > 0 && !/^[ \t]*[-*+][ \t]/.test(line))
      items[items.length - 1] = `${items.at(-1)} ${line.trim()}`;
  }
  return items;
}

/**
 * The recette of the issue's PR: the GitHub side read by the cache, the gate's proofs of the head
 * read in the card's evidence. A part GitHub refused stays empty; the rest still shows.
 */
export function acceptanceOf(source: AcceptanceSource, proofs: GateProof[]): AcceptanceView {
  const asked = criteriaLines(section(source.issueBody, "Critères d'acceptation"));
  const given = criteriaLines(section(source.prBody, 'Critères'));
  const criteria = [...asked].map(([id, text]) => judge(id, text, given.get(id) ?? null, source));
  const gate = source.gate;
  const textual: AcceptanceProof[] = proofs.map((proof) => {
    const rule = gate?.rules.find((each) => each.rule === (RULE_LABELS[proof.rule] ?? proof.rule));
    return {
      kind: PROOF_KIND[proof.rule] ?? 'run',
      status: proofStatus(rule),
      detail: rule?.detail ?? RULE_LABELS[proof.rule] ?? proof.rule,
      url: gate?.url ?? source.prUrl,
      content: proof.text,
      before: null,
      after: null,
    };
  });
  const captures: AcceptanceProof[] = (source.captures ?? []).map((capture) => ({
    kind: 'capture',
    status: 'ok',
    detail: capture.path,
    url: capture.url,
    content: null,
    before: capture.before,
    after: capture.after,
  }));
  const unproven: AcceptanceProof[] = declared(source.prBody).map((detail) => ({
    kind: 'unproven',
    status: 'info',
    detail,
    url: source.prUrl,
    content: null,
    before: null,
    after: null,
  }));
  return {
    pr: source.pr,
    head: source.head,
    base: source.base,
    criteria,
    checks: source.checks ?? [],
    gate,
    tests: source.tests?.suites ?? [],
    proofs: [...textual, ...captures, ...unproven],
    threads: source.threads ?? [],
    reviewRounds: source.reviewRounds,
    // The factory's twin bench does not exist yet (hermes-software-factory#26).
    twins: null,
    twinsAbsent: 'no_build',
  };
}
