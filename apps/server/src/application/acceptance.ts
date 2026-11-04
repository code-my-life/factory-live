import type {
  AcceptanceCriterion,
  AcceptanceGateRule,
  AcceptanceProof,
  AcceptanceTwins,
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
/** A test the PR names: « its name » (or between double quotes). */
const QUOTED = /«\s*([^»]+?)\s*»|“([^”\n]+)”|"([^"\n]+)"/g;
/** A test's file, in backquotes, before the names it holds. */
const FILE_OR_NAME = /`([^`\s]+\.[A-Za-z0-9]+)`|\uE000(\d+)\uE001/g;
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

/**
 * A proof line as its author writes it: the names of its tests set aside, so that what they say counts
 * for nothing else (a test may be named « … non prouvé … »). `marked` is the line with each name as a
 * mark; `rest` is the same without its notes in parentheses, where no test is named (a note may quote
 * a word).
 */
function proofParts(proof: string): { names: string[]; marked: string; rest: string } {
  const names: string[] = [];
  const marked = proof.replace(
    QUOTED,
    (_whole, angled?: string, curly?: string, straight?: string) => {
      names.push((angled ?? curly ?? straight ?? '').trim());
      return `\uE000${names.length - 1}\uE001`;
    },
  );
  let rest = marked;
  for (let previous = ''; previous !== rest;) {
    previous = rest;
    rest = rest.replace(/\([^()]*\)/g, ' ');
  }
  return { names, marked, rest };
}

/** The tests a proof names, each with the file written before it, when there is one. */
function namedTests(proof: string): { file: string | null; name: string }[] {
  const { names, rest } = proofParts(proof);
  const tests: { file: string | null; name: string }[] = [];
  let file: string | null = null;
  for (const token of rest.matchAll(FILE_OR_NAME)) {
    if (token[1]) file = token[1];
    else tests.push({ file, name: names[Number(token[2])] ?? '' });
  }
  return tests;
}

/**
 * The PR says it does not prove the criterion: « non prouvé » anywhere outside the names of its tests,
 * a note in parentheses included (« (non prouvé sur téléphone) » is a reservation the owner reads).
 */
function saysUnproven(proof: string): boolean {
  return UNPROVEN.test(proofParts(proof).marked.replace(/\uE000\d+\uE001/g, ' '));
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
 * A criterion's verdict, by written rules: NOK « non prouvé » when the PR says so, names no test,
 * names a test missing from the reports once the CI is over, or a test a project skipped; NOK « sa
 * preuve échoue » when one of its tests is red; running while a check runs and its tests are not
 * reported; OK when all are green on every project that reports them.
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
  if (proof === null || saysUnproven(proof)) return unproven;
  const named = namedTests(proof);
  if (named.length === 0) return unproven;
  const running = (source.checks ?? []).some((check) => check.status === 'pending');
  const results = source.tests?.results ?? [];
  const runs = named.map((each) => results.filter((result) => isNamed(result, each)));
  const failed = runs.flat().find((result) => result.outcome === 'failed');
  if (failed) return { id, text, status: 'nok', reason: 'failing', proof, url: failed.url };
  // A named test missing from the reports: the CI may still run it, else nothing proves it.
  if (runs.some((each) => each.length === 0))
    return running
      ? { id, text, status: 'pending', reason: 'running', proof, url: source.prUrl }
      : unproven;
  // Green on every project that reports it (ADR 0012): a project that skipped it proves nothing there.
  if (runs.flat().some((result) => result.outcome !== 'passed')) return unproven;
  return { id, text, status: 'ok', reason: 'proven', proof, url: runs[0]![0]!.url };
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
 * read in the card's evidence, its twins on the factory's bench. A part GitHub refused stays empty;
 * the rest still shows.
 */
export function acceptanceOf(
  source: AcceptanceSource,
  proofs: GateProof[],
  twins: AcceptanceTwins | null = null,
): AcceptanceView {
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
    // The pair the factory's bench runs for this PR (#23); without one, the bench does not serve it.
    twins,
    twinsAbsent: twins ? null : 'no_build',
  };
}
