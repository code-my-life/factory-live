import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gateOf, gateRulesOf, headChecksOf, threadsOf } from './acceptance.ts';
import type {
  CheckRunJson,
  GateCommentJson,
  StatusJson,
  ThreadsJson,
  WorkflowRunJson,
} from './acceptance.ts';

/** Real answers of GitHub for the head of factory-live#24 (fixtures/github-acceptance), and real gate comments. */
const json = <T>(name: string): T =>
  JSON.parse(
    readFileSync(
      new URL(`../../../../../fixtures/github-acceptance/${name}`, import.meta.url),
      'utf8',
    ),
  ) as T;
const gateComment = (name: string) =>
  readFileSync(new URL(`../../../../../fixtures/github-gate/${name}`, import.meta.url), 'utf8');

const HEAD = '9a72096265a97aab5223e2e1d77bf48411a8c962';
const COMMIT = `https://github.com/code-my-life/factory-live/commit/${HEAD}`;

describe('la recette lue sur GitHub', () => {
  it('liste chaque check de la tête avec son workflow, sa durée et son job', () => {
    const checks = headChecksOf(
      json<{ check_runs: CheckRunJson[] }>('check-runs.json').check_runs,
      json<StatusJson[]>('statuses.json'),
      json<{ workflow_runs: WorkflowRunJson[] }>('workflow-runs.json').workflow_runs,
      COMMIT,
    );
    // The check « Conventions » ran three times on this head: only its last run counts, and the gate's
    // status is the gate's, not a check.
    expect(checks).toHaveLength(11);
    expect(
      checks
        .filter((check) => check.name.startsWith('Conventions'))
        .map(({ workflow, status }) => ({ workflow, status })),
    ).toEqual([{ workflow: 'Conventions', status: 'success' }]);
    expect(checks.some((check) => check.name === 'factory/gate')).toBe(false);
    const verify = checks.find((check) => check.name === 'Vérifications (Node 24.22.1)')!;
    expect(verify.workflow).toBe('CI');
    expect(verify.status).toBe('success');
    expect(verify.durationMs).toBeGreaterThan(0);
    expect(verify.url).toMatch(
      /^https:\/\/github\.com\/code-my-life\/factory-live\/actions\/runs\/\d+\/job\/\d+$/,
    );
    // A check of an App (Greptile) has no workflow; a job skipped by its condition is skipped, not red.
    expect(checks.find((check) => check.name === 'Greptile Review')!.workflow).toBeNull();
    expect(checks.find((check) => check.name === 'Publication sur GitHub Pages')!.status).toBe(
      'skipped',
    );
  });

  it('lit les règles de la gate dans son commentaire, au format de factory-gate.py', () => {
    const red = gateRulesOf(gateComment('gate-rouge.md'));
    expect({ head: red!.head, verdict: red!.verdict }).toEqual({ head: '140abfe', verdict: 'nok' });
    expect(red!.rules).toHaveLength(11);
    expect(red!.rules[0]).toEqual({
      rule: 'PR',
      status: 'ok',
      detail: "PR #16 ouverte par l'App, tête `140abfe`",
    });
    expect(red!.rules.at(-1)).toEqual({
      rule: 'Couverture du diff',
      status: 'nok',
      detail:
        'lignes modifiées jamais exécutées par un test : `apps/web/src/features/issues/TranscriptPanel.tsx` : 230',
    });
    const green = gateRulesOf(gateComment('gate-vert.md'));
    expect(green!.verdict).toBe('ok');
    expect(green!.rules.filter((rule) => rule.status === 'info').map((rule) => rule.rule)).toEqual([
      'Contrôles modifiés',
      'Interface',
    ]);
    expect(gateRulesOf('Un commentaire quelconque')).toBeNull();

    // The verdict of the PR: the gate's status on the head, the rules of its last comment.
    const comment: GateCommentJson = {
      body: gateComment('gate-rouge.md'),
      html_url: 'https://github.com/code-my-life/factory-live/pull/16#issuecomment-1',
      created_at: '2026-11-01T10:00:00Z',
      user: { type: 'Bot' },
    };
    const status: StatusJson = {
      context: 'factory/gate',
      state: 'failure',
      description: 'rouge : Couverture du diff',
      target_url: null,
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-01T10:00:00Z',
    };
    expect(gateOf(status, comment, HEAD, COMMIT)).toEqual({
      status: 'nok',
      head: '140abfe',
      at: '2026-11-01T10:00:00Z',
      url: comment.html_url,
      rules: red!.rules,
    });
    // Out of the factory, the gate posts a status and no comment: its description is the only rule.
    const outside = json<StatusJson[]>('statuses.json')[0]!;
    expect(gateOf(outside, null, HEAD, COMMIT)).toEqual({
      status: 'ok',
      head: HEAD.slice(0, 7),
      at: outside.updated_at,
      url: COMMIT,
      rules: [{ rule: 'PR', status: 'info', detail: outside.description }],
    });
    // A gate comment written by a person is not the gate's.
    expect(gateOf(null, { ...comment, user: { type: 'User' } }, HEAD, COMMIT)).toBeNull();
  });

  it('lit les fils de revue par GraphQL, avec la gravité de Greptile', () => {
    const answer = json<ThreadsJson>('review-threads.json');
    const { threads, reviewRounds } = threadsOf(answer);
    expect(reviewRounds).toBe(7);
    expect(threads).toHaveLength(6);
    expect(threads[0]).toEqual({
      author: 'greptile-apps',
      severity: 'P2',
      title: 'Posted reviews disappear',
      resolved: true,
      at: '2026-11-04T14:55:43Z',
      url: 'https://github.com/code-my-life/factory-live/pull/24#discussion_r4469110873',
    });
    // A thread still open says so.
    const pr = answer.data!.repository!.pullRequest!;
    const open = threadsOf({
      data: {
        repository: {
          pullRequest: {
            ...pr,
            reviewThreads: { nodes: [{ ...pr.reviewThreads.nodes[1]!, isResolved: false }] },
          },
        },
      },
    });
    expect(open.threads.map(({ title, resolved }) => ({ title, resolved }))).toEqual([
      { title: 'Unfinished captures look green', resolved: false },
    ]);
  });
});

describe('la recette lue sur GitHub, hors des cas de factory-live', () => {
  it('un statut de commit est un check : le plus récent de chaque nom, sans workflow', () => {
    const at = (state: string, updated: string): StatusJson => ({
      context: 'ci/externe',
      state,
      description: null,
      target_url: 'https://ci.example/build/7',
      created_at: updated,
      updated_at: updated,
    });
    // GitHub gives the statuses newest first.
    const checks = headChecksOf(
      [],
      [at('error', '2026-11-04T10:05:00Z'), at('pending', '2026-11-04T10:00:00Z')],
      [],
      COMMIT,
    );
    expect(checks).toEqual([
      {
        name: 'ci/externe',
        workflow: null,
        status: 'failure',
        durationMs: null,
        url: 'https://ci.example/build/7',
      },
    ]);
  });

  it('un titre de fil s’affiche en texte : aucune balise, même cassée, n’en reste', () => {
    const { threads } = threadsOf({
      data: {
        repository: {
          pullRequest: {
            reviews: { totalCount: 1 },
            reviewThreads: {
              nodes: [
                {
                  isResolved: false,
                  comments: {
                    nodes: [
                      {
                        author: { login: 'quelqu-un' },
                        body: '<scr<script>ipt>alert(1)</scr</script>ipt> le pied de page',
                        createdAt: '2026-11-04T10:00:00Z',
                        url: 'https://github.com/code-my-life/cv-site/pull/50#discussion_r2',
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    });
    expect(threads[0]!.title).not.toMatch(/[<>]/);
    expect(threads[0]!.title).toContain('le pied de page');
  });

  it('un fil écrit par une personne : sa première ligne pour titre, sans gravité', () => {
    const { threads } = threadsOf({
      data: {
        repository: {
          pullRequest: {
            reviews: { totalCount: 1 },
            reviewThreads: {
              nodes: [
                {
                  isResolved: false,
                  comments: {
                    nodes: [
                      {
                        author: null,
                        body: '\n> Le `pied de page` déborde à 390 px.\nSuite du commentaire.',
                        createdAt: '2026-11-04T10:00:00Z',
                        url: 'https://github.com/code-my-life/cv-site/pull/50#discussion_r1',
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    });
    expect(threads).toEqual([
      {
        author: 'ghost',
        severity: null,
        title: 'Le pied de page déborde à 390 px.',
        resolved: false,
        at: '2026-11-04T10:00:00Z',
        url: 'https://github.com/code-my-life/cv-site/pull/50#discussion_r1',
      },
    ]);
  });
});
