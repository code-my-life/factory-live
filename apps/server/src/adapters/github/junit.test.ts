import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { junitFiles, readJUnit, testSuitesOf } from './junit.ts';

/** Real reports of this repository (fixtures/github-junit), one green, one red, one skipped test each. */
const FIXTURES = new URL('../../../../../fixtures/github-junit/', import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES));

const AT = {
  repo: 'code-my-life/factory-live',
  head: '9a72096265a97aab5223e2e1d77bf48411a8c962',
  url: 'https://github.com/code-my-life/factory-live/actions/runs/41859193780',
};

describe('rapports JUnit de la CI', () => {
  it('lit les suites et les tests en échec des rapports JUnit de la CI', () => {
    const reports = junitFiles(new Uint8Array(fixture('junit.zip'))).map(readJUnit);
    expect(reports.map((report) => report.runner)).toEqual(['vitest', 'playwright']);

    const [vitest, playwright] = reports;
    expect(vitest!.tests).toHaveLength(7);
    expect(vitest!.tests.find((test) => test.outcome === 'failed')).toEqual({
      file: 'packages/domain/src/recette.test.ts',
      name: 'recette > un critère rouge',
      project: null,
      outcome: 'failed',
      location: { path: 'packages/domain/src/recette.test.ts', line: 8 },
    });
    expect(playwright!.tests.filter((test) => test.outcome === 'failed')).toEqual(
      ['demo-bureau', 'demo-iphone'].map((project) => ({
        file: 'recette.spec.ts',
        name: 'recette › une preuve rouge',
        project,
        outcome: 'failed',
        location: { path: '/home/user/perso/factory-live/e2e/recette.spec.ts', line: 10 },
      })),
    );

    // One suite for the unit tests, one per project of the end-to-end tests, each failure at its
    // line at the head.
    const suites = testSuitesOf(reports, AT);
    expect(
      suites.map(({ kind, name, status, passed, failed, skipped }) => ({
        kind,
        name,
        status,
        passed,
        failed,
        skipped,
      })),
    ).toEqual([
      { kind: 'unit', name: 'Vitest', status: 'nok', passed: 5, failed: 1, skipped: 1 },
      { kind: 'e2e', name: 'demo-bureau', status: 'nok', passed: 1, failed: 1, skipped: 1 },
      { kind: 'e2e', name: 'demo-iphone', status: 'nok', passed: 1, failed: 1, skipped: 1 },
    ]);
    expect(suites[0]!.url).toBe(AT.url);
    expect(suites[0]!.failures).toEqual([
      {
        name: 'recette > un critère rouge',
        url: `https://github.com/code-my-life/factory-live/blob/${AT.head}/packages/domain/src/recette.test.ts#L8`,
      },
    ]);
    expect(suites[1]!.failures[0]!.url).toBe(
      `https://github.com/code-my-life/factory-live/blob/${AT.head}/e2e/recette.spec.ts#L10`,
    );
  });

  it('une archive a un budget : un nombre de rapports et d’octets en tout, au-delà rien', () => {
    const zip = new Uint8Array(fixture('junit.zip'));
    expect(junitFiles(zip, { reports: 1, bytes: 50 * 1024 * 1024 })).toHaveLength(1);
    // The first report fits, the second would pass the budget: it is left.
    const first = junitFiles(zip)[0]!;
    expect(junitFiles(zip, { reports: 50, bytes: Buffer.byteLength(first) + 10 })).toEqual([first]);
  });

  it('un fichier de l’artefact qui n’est pas un rapport JUnit est laissé de côté', () => {
    const files = junitFiles(new Uint8Array(fixture('junit.zip')));
    expect(files).toHaveLength(2);
    expect(readJUnit('<html>pas un rapport</html>').tests).toEqual([]);
  });
});

describe('rapports JUnit publiés par la CI de factory-live', () => {
  const read = (path: string) =>
    readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

  it('la CI publie ses rapports JUnit (Vitest, Playwright) à chaque exécution, verte comprise', () => {
    const ci = read('.github/workflows/ci.yml');
    // Each report is written by its runner...
    expect(ci).toMatch(/--reporter=junit --outputFile\.junit=reports\/junit\/vitest\.xml/);
    expect(read('playwright.config.ts')).toMatch(
      /\['junit', \{ outputFile: 'reports\/junit\/playwright\.xml' \}\]/,
    );
    // ...then published whatever the outcome, under the name the cache reads (`junit…`).
    for (const name of ['junit-unit', 'junit-e2e']) {
      const step = new RegExp(
        `if: always\\(\\)[^\\n]*\\n\\s+uses: actions/upload-artifact@[0-9a-f]{40}[^\\n]*\\n\\s+with:\\n\\s+name: ${name}\\n\\s+path: reports/junit/`,
      );
      expect(ci, name).toMatch(step);
    }
  });
});
