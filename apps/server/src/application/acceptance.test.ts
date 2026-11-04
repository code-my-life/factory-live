import { describe, expect, it } from 'vitest';
import { acceptanceOf } from './acceptance.ts';
import type { AcceptanceSource, AcceptanceTestResult, GateProof } from './ports.ts';

const PR = 'https://github.com/code-my-life/factory-live/pull/24';
const HEAD = '9a72096265a97aab5223e2e1d77bf48411a8c962';
const RUN = 'https://github.com/code-my-life/factory-live/actions/runs/41859193780';

/** The issue's criteria and the PR's proof lines, as #21 and its PR wrote them. */
const ISSUE = `### Constat

La recette des PR.

### Critères d'acceptation

- C1 : la recette apparaît sous les faits de toute issue qui a une PR.
- C2 : le verdict de chaque widget est un picto seul.
- C3 : un critère non prouvé rend le widget des critères rouge.
- C4 : un compte de l'en-tête déplie le premier widget de son genre.

### Tests

- \`apps/web/src/features/acceptance/AcceptanceBoard.test.tsx\` « montre les six widgets »
`;

const PR_BODY = `Fixes #21

## Ce qui a été fait

La recette.

## Critères

- C1 : \`AcceptanceBoard.test.tsx\` « montre les six widgets » ; \`layout.test.ts\` « par défaut, tout est visible »
- C2 : \`e2e/acceptance.spec.ts\` « recette : aucune violation WCAG 2.2 AA (axe) : /issues/factory-live/18 »
- C3 : non prouvé
- C4 : la démo le montre

## Ce qui n'est pas prouvé

- Le glisser au doigt : aucun test ne le fait.
- Le thème sombre : vu dans la démo, sans capture de référence.

## Version

0.5.0
`;

function result(
  file: string,
  name: string,
  outcome: AcceptanceTestResult['outcome'],
  project: string | null = null,
): AcceptanceTestResult {
  return { file, name, project, outcome, url: `${RUN}#${encodeURIComponent(name)}` };
}

/** Every C1 and C2 test green: the unit tests, and the axe audit on both projects. */
const GREEN: AcceptanceTestResult[] = [
  result(
    'apps/web/src/features/acceptance/AcceptanceBoard.test.tsx',
    'recette d’une PR > montre les six widgets',
    'passed',
  ),
  result(
    'apps/web/src/features/acceptance/layout.test.ts',
    'disposition > par défaut, tout est visible',
    'passed',
  ),
  ...['demo-bureau', 'demo-iphone'].map((project) =>
    result(
      'acceptance.spec.ts',
      'recette : aucune violation WCAG 2.2 AA (axe) : /issues/factory-live/18',
      'passed',
      project,
    ),
  ),
];

function source(overrides: Partial<AcceptanceSource> = {}): AcceptanceSource {
  return {
    pr: 24,
    prUrl: PR,
    head: HEAD,
    base: 'c9fa041a'.padEnd(40, '0'),
    issueBody: ISSUE,
    prBody: PR_BODY,
    checks: [
      {
        name: 'Vérifications (Node 24.22.1)',
        workflow: 'CI',
        status: 'success',
        durationMs: 164_000,
        url: `${RUN}/job/1`,
      },
    ],
    gate: null,
    tests: { suites: [], results: GREEN },
    captures: [],
    threads: [],
    reviewRounds: 2,
    ...overrides,
  };
}

const criterion = (view: ReturnType<typeof acceptanceOf>, id: string) =>
  view.criteria.find((each) => each.id === id)!;

describe('la recette d’une PR', () => {
  it('un critère prend le verdict de ses tests nommés dans les rapports JUnit de la tête', () => {
    const green = acceptanceOf(source(), []);
    expect(green.criteria.map((each) => each.id)).toEqual(['C1', 'C2', 'C3', 'C4']);
    expect(criterion(green, 'C1')).toEqual({
      id: 'C1',
      text: 'la recette apparaît sous les faits de toute issue qui a une PR.',
      status: 'ok',
      reason: 'proven',
      proof:
        '`AcceptanceBoard.test.tsx` « montre les six widgets » ; `layout.test.ts` « par défaut, tout est visible »',
      url: GREEN[0]!.url,
    });
    // An end-to-end test runs on every project: green on each, the criterion is.
    expect(criterion(green, 'C2')).toMatchObject({ status: 'ok', reason: 'proven' });

    // One red run of a named test, and the criterion fails.
    const red = acceptanceOf(
      source({
        tests: {
          suites: [],
          results: GREEN.map((each) =>
            each.project === 'demo-iphone' ? { ...each, outcome: 'failed' as const } : each,
          ),
        },
      }),
      [],
    );
    expect(criterion(red, 'C2')).toMatchObject({ status: 'nok', reason: 'failing' });

    // A named test missing from the reports proves nothing.
    const missing = acceptanceOf(
      source({
        tests: {
          suites: [],
          results: GREEN.filter((each) => !each.file.endsWith('layout.test.ts')),
        },
      }),
      [],
    );
    expect(criterion(missing, 'C1')).toMatchObject({ status: 'nok', reason: 'unproven', url: PR });
  });

  it('une ligne non prouvé de la PR rend son critère NOK', () => {
    const view = acceptanceOf(source(), []);
    expect(criterion(view, 'C3')).toEqual({
      id: 'C3',
      text: 'un critère non prouvé rend le widget des critères rouge.',
      status: 'nok',
      reason: 'unproven',
      proof: 'non prouvé',
      url: PR,
    });
    // A proof that names no test is not a proof the CI checks.
    expect(criterion(view, 'C4')).toMatchObject({
      status: 'nok',
      reason: 'unproven',
      proof: 'la démo le montre',
    });
    // Without any line for a criterion, the PR does not prove it either.
    const silent = acceptanceOf(
      source({ prBody: 'Fixes #21\n\n## Critères\n\n- C1 : non prouvé\n' }),
      [],
    );
    expect(criterion(silent, 'C2')).toMatchObject({
      status: 'nok',
      reason: 'unproven',
      proof: null,
    });
  });

  it("tant qu'un check tourne sans rapport, les critères sont en cours", () => {
    const running = source({
      tests: null,
      checks: [
        {
          name: 'Bout en bout',
          workflow: 'CI',
          status: 'pending',
          durationMs: null,
          url: `${RUN}/job/2`,
        },
      ],
    });
    const view = acceptanceOf(running, []);
    expect(criterion(view, 'C1')).toMatchObject({ status: 'pending', reason: 'running' });
    expect(criterion(view, 'C2')).toMatchObject({ status: 'pending', reason: 'running' });
    // What the PR says it does not prove stays NOK whatever the CI does.
    expect(criterion(view, 'C3')).toMatchObject({ status: 'nok', reason: 'unproven' });
    // The CI over and still no report: a named test proves nothing.
    const over = acceptanceOf(
      { ...running, checks: [{ ...running.checks![0]!, status: 'success' }] },
      [],
    );
    expect(criterion(over, 'C1')).toMatchObject({ status: 'nok', reason: 'unproven' });
  });

  it("une lecture GitHub refusée laisse l'élément sans données sans faire tomber la recette", () => {
    const view = acceptanceOf(
      source({
        checks: null,
        gate: null,
        tests: null,
        captures: null,
        threads: null,
        issueBody: null,
      }),
      [],
    );
    expect(view).toMatchObject({
      pr: 24,
      head: HEAD,
      criteria: [],
      checks: [],
      gate: null,
      tests: [],
      threads: [],
      reviewRounds: 2,
      twins: null,
      twinsAbsent: 'no_build',
    });
    // The PR's own text still gives what it declares unproven.
    expect(view.proofs.map((proof) => proof.kind)).toEqual(['unproven', 'unproven']);
  });

  it('les preuves : celles de la gate avec leur texte, les captures avant et après, ce que la PR ne prouve pas', () => {
    const proofs: GateProof[] = [
      { order: 9, rule: 'fail_first', text: '$ npx vitest run\n1 failed' },
      { order: 11, rule: 'couverture', text: '$ npx vitest run --coverage' },
    ];
    const view = acceptanceOf(
      source({
        gate: {
          status: 'ok',
          head: HEAD.slice(0, 7),
          at: '2026-11-04T15:00:00Z',
          url: `${PR}#issuecomment-1`,
          rules: [
            {
              rule: 'Fail-first',
              status: 'ok',
              detail: '« montre les six widgets » rouge sur la base',
            },
            {
              rule: 'Couverture du diff',
              status: 'nok',
              detail: 'lignes jamais exécutées : `a.ts` : 3',
            },
          ],
        },
        captures: [
          {
            path: 'e2e/captures.spec.ts-snapshots/recette-captures-bureau-linux.png',
            before: '/api/acceptance/factory-live/24/capture?path=x&side=base',
            after: '/api/acceptance/factory-live/24/capture?path=x&side=head',
            url: `${PR}/files#diff-1`,
          },
        ],
      }),
      proofs,
    );
    expect(view.proofs).toEqual([
      {
        kind: 'failfirst',
        status: 'ok',
        detail: '« montre les six widgets » rouge sur la base',
        url: `${PR}#issuecomment-1`,
        content: '$ npx vitest run\n1 failed',
        before: null,
        after: null,
      },
      {
        kind: 'coverage',
        status: 'nok',
        detail: 'lignes jamais exécutées : `a.ts` : 3',
        url: `${PR}#issuecomment-1`,
        content: '$ npx vitest run --coverage',
        before: null,
        after: null,
      },
      {
        kind: 'capture',
        status: 'ok',
        detail: 'e2e/captures.spec.ts-snapshots/recette-captures-bureau-linux.png',
        url: `${PR}/files#diff-1`,
        content: null,
        before: '/api/acceptance/factory-live/24/capture?path=x&side=base',
        after: '/api/acceptance/factory-live/24/capture?path=x&side=head',
      },
      {
        kind: 'unproven',
        status: 'info',
        detail: 'Le glisser au doigt : aucun test ne le fait.',
        url: PR,
        content: null,
        before: null,
        after: null,
      },
      {
        kind: 'unproven',
        status: 'info',
        detail: 'Le thème sombre : vu dans la démo, sans capture de référence.',
        url: PR,
        content: null,
        before: null,
        after: null,
      },
    ]);
  });
});
