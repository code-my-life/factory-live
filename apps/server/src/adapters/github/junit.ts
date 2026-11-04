import { inflateRawSync } from 'node:zlib';
import type { AcceptanceTestSuite } from '@factory-live/contracts';

/**
 * The JUnit reports the CI publishes as artifacts (Vitest, Playwright), read without any dependency:
 * the artifact is a zip read through its central directory, the report a small, regular XML.
 */

/** A report's file in the artifact: past this size, it is not read (a zip can claim anything). */
const MAX_REPORT_BYTES = 20 * 1024 * 1024;
const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** The JUnit reports of an artifact's zip, as text, in the zip's order; any other file is left out. */
export function junitFiles(zip: Uint8Array): string[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = -1;
  for (let at = zip.byteLength - 22; at >= Math.max(0, zip.byteLength - 65_557); at -= 1) {
    if (view.getUint32(at, true) === EOCD) {
      end = at;
      break;
    }
  }
  if (end < 0) return [];
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const reports: string[] = [];
  for (let index = 0; index < count && at + 46 <= zip.byteLength; index += 1) {
    if (view.getUint32(at, true) !== CENTRAL) break;
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (!name.toLowerCase().endsWith('.xml') || local + 30 > zip.byteLength) continue;
    if (view.getUint32(local, true) !== LOCAL) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = zip.subarray(start, start + size);
    try {
      const bytes =
        method === 0
          ? data
          : method === 8
            ? inflateRawSync(data, { maxOutputLength: MAX_REPORT_BYTES })
            : null;
      if (bytes && bytes.byteLength <= MAX_REPORT_BYTES)
        reports.push(new TextDecoder().decode(bytes));
    } catch {
      // A damaged or oversized entry: the other reports still count.
    }
  }
  return reports;
}

/** A test of a report: its file, its full name (describe blocks included), and how it ended. */
export interface JUnitTest {
  /** The file as the report names it: from the root for Vitest, from `testDir` for Playwright. */
  file: string;
  name: string;
  /** The Playwright project that ran it; `null` for Vitest. */
  project: string | null;
  outcome: 'passed' | 'failed' | 'skipped';
  /** For a failure, where the report points: a path as it writes it (maybe absolute), and a line. */
  location: { path: string; line: number } | null;
}

export interface JUnitReport {
  runner: 'vitest' | 'playwright' | 'junit';
  tests: JUnitTest[];
  /** Time spent per project (`null`: Vitest, or a report without projects), in milliseconds. */
  durations: { project: string | null; ms: number }[];
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X'))
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return ENTITIES[entity] ?? whole;
  });
}

function attributes(tag: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, key, value] of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) found[key!] = decode(value!);
  return found;
}

/** The text of an element's body: CDATA sections as they are, the rest decoded. */
function bodyText(body: string): string {
  return body
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
    .map((part) => (part.startsWith('<![CDATA[') ? part.slice(9, -3) : decode(part)))
    .join('');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Where a failure points in its file: the first place with a directory, else the first place. */
function locate(file: string, failure: string): JUnitTest['location'] {
  const places = [
    ...failure.matchAll(new RegExp(`([^\\s'"()\\[\\]]*${escapeRegExp(file)}):(\\d+)`, 'g')),
  ].map(([, path, line]) => ({ path: path!, line: Number(line) }));
  return places.find((place) => place.path.includes('/')) ?? places[0] ?? null;
}

/** A JUnit report of Vitest or Playwright; anything else gives no test. */
export function readJUnit(xml: string): JUnitReport {
  const root = /<testsuites\b[^>]*>/.exec(xml)?.[0] ?? '';
  const runner = /\bname="vitest tests"/.test(root)
    ? 'vitest'
    : /\bid="/.test(root)
      ? 'playwright'
      : 'junit';
  const tests: JUnitTest[] = [];
  const durations: JUnitReport['durations'] = [];
  for (const [, suiteTag, suiteBody] of xml.matchAll(
    /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g,
  )) {
    const suite = attributes(suiteTag!);
    const project = runner === 'playwright' ? (suite.hostname ?? null) : null;
    const ms = Math.round(Number(suite.time ?? 0) * 1000);
    const known = durations.find((each) => each.project === project);
    if (known) known.ms += ms;
    else durations.push({ project, ms });
    for (const [, caseTag, caseBody = ''] of suiteBody!.matchAll(
      /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g,
    )) {
      const test = attributes(caseTag!);
      const failure = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(caseBody);
      const file = test.classname ?? suite.name ?? '';
      const text = failure
        ? `${attributes(failure[2]!).message ?? ''}\n${bodyText(failure[3] ?? '')}`
        : '';
      tests.push({
        file,
        name: test.name ?? '',
        project,
        outcome: failure ? 'failed' : /<skipped\b/.test(caseBody) ? 'skipped' : 'passed',
        location: failure ? locate(file, text) : null,
      });
    }
  }
  return { runner, tests, durations };
}

/** Where to read a file at the head: a path from the repository's root, from what a report wrote. */
function repoPath(path: string, repo: string): string {
  if (!path.startsWith('/')) return path;
  const marker = `/${repo.split('/').pop()}/`;
  const at = path.lastIndexOf(marker);
  return at >= 0 ? path.slice(at + marker.length) : path.slice(path.lastIndexOf('/') + 1);
}

/**
 * The suites of the recette from the reports of one CI run: the unit tests as one suite, each
 * Playwright project as its own; each failure leads to its line at the head.
 */
export function testSuitesOf(
  reports: JUnitReport[],
  at: { repo: string; head: string; url: string },
): AcceptanceTestSuite[] {
  const groups = new Map<
    string,
    { kind: 'unit' | 'e2e'; name: string; tests: JUnitTest[]; ms: number }
  >();
  for (const report of reports) {
    for (const test of report.tests) {
      const kind = report.runner === 'playwright' ? 'e2e' : 'unit';
      const name =
        report.runner === 'playwright'
          ? (test.project ?? 'Playwright')
          : report.runner === 'vitest'
            ? 'Vitest'
            : 'JUnit';
      const key = `${kind}:${name}`;
      const group = groups.get(key) ?? { kind, name, tests: [], ms: 0 };
      group.tests.push(test);
      groups.set(key, group);
    }
    for (const { project, ms } of report.durations) {
      const name =
        report.runner === 'playwright'
          ? (project ?? 'Playwright')
          : report.runner === 'vitest'
            ? 'Vitest'
            : 'JUnit';
      const group = groups.get(`${report.runner === 'playwright' ? 'e2e' : 'unit'}:${name}`);
      if (group) group.ms += ms;
    }
  }
  return [...groups.values()].map(({ kind, name, tests, ms }) => {
    const failed = tests.filter((test) => test.outcome === 'failed');
    return {
      kind,
      name,
      status: failed.length > 0 ? 'nok' : 'ok',
      passed: tests.filter((test) => test.outcome === 'passed').length,
      failed: failed.length,
      skipped: tests.filter((test) => test.outcome === 'skipped').length,
      durationMs: ms,
      url: at.url,
      failures: failed.map((test) => ({
        name: test.name,
        url: test.location
          ? `https://github.com/${at.repo}/blob/${at.head}/${repoPath(test.location.path, at.repo)}#L${test.location.line}`
          : at.url,
      })),
    };
  });
}
