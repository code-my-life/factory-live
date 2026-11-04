import { describe, expect, it, vi } from 'vitest';
import { GitHubCache } from './cache.ts';
import { GitHubError } from './client.ts';
import type { GitHubClient } from './client.ts';

function fakeClient() {
  const issue = vi.fn((repo: string, number: number) =>
    number === 99999
      ? Promise.reject(new GitHubError(404, 'Not Found'))
      : Promise.resolve({
          title: `Issue ${repo}#${number}`,
          url: `https://github.com/code-my-life/${repo}/issues/${number}`,
          labels: [{ name: 'factory', color: 'a2eeef' }],
          state: 'open' as const,
        }),
  );
  return { client: { issue, rateLimit: null } as unknown as GitHubClient, issue };
}

const log = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() });

describe('GitHubCache', () => {
  it('relit une issue introuvable une fois l’heure, le dit une fois, et l’accès reste bon', async () => {
    const { client, issue } = fakeClient();
    const logger = log();
    const cache = new GitHubCache(client, 'code-my-life', logger, () => 'App reliée');
    const tracked = [
      { key: 'claude-cockpit#99999', prUrl: null, active: true },
      { key: 'cv-site#49', prUrl: null, active: true },
    ];
    await cache.refresh(tracked, 0);
    await cache.refresh(tracked, 30_000);
    expect(issue.mock.calls.filter(([, number]) => number === 99999)).toHaveLength(1);
    expect(issue.mock.calls.filter(([, number]) => number === 49)).toHaveLength(2);
    expect(logger.info).toHaveBeenCalledOnce();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(cache.status).toMatchObject({ ok: true, detail: 'App reliée' });
    await cache.refresh(tracked, 3_600_001);
    expect(issue.mock.calls.filter(([, number]) => number === 99999)).toHaveLength(2);
    expect(logger.info).toHaveBeenCalledOnce();
  });

  it('un déploiement que GitHub refuse de lire ne fait perdre ni la PR fusionnée ni les issues suivantes', async () => {
    const { client, issue } = fakeClient();
    const pullRequest = vi.fn((repo: string, number: number) =>
      Promise.resolve({
        number,
        url: `https://github.com/code-my-life/${repo}/pull/${number}`,
        title: 'feat: ligne',
        state: 'merged' as const,
        checks: 'success' as const,
        reviewDecision: 'approved' as const,
        autoMerge: false,
        additions: 1,
        deletions: 1,
        changedFiles: 1,
        reviews: [],
        mergedAt: '2026-11-03T18:00:00.000Z',
        mainChecks: null,
        deployment: null,
        headSha: 'b055de5',
        mergeSha: 'c0ffee1',
      }),
    );
    const mainChecks = vi.fn(() => Promise.resolve('success' as const));
    // The App lacks the Deployments permission: GitHub answers 403 on the deployments.
    const deployment = vi.fn(() =>
      Promise.reject(new GitHubError(403, 'Resource not accessible by integration')),
    );
    Object.assign(client, { pullRequest, mainChecks, deployment });
    const cache = new GitHubCache(client, 'code-my-life', log(), () => 'App reliée');
    await cache.refresh(
      [
        {
          key: 'factory-live#18',
          prUrl: 'https://github.com/code-my-life/factory-live/pull/19',
          active: true,
        },
        { key: 'cv-site#49', prUrl: null, active: true },
      ],
      0,
    );
    expect(cache.pullRequest('factory-live#18')).toMatchObject({
      state: 'merged',
      mainChecks: 'success',
      deployment: null,
    });
    expect(issue.mock.calls.filter(([, number]) => number === 49)).toHaveLength(1);
    expect(cache.status).toMatchObject({ ok: true });
  });

  it('une panne passagère de GitHub sur le déploiement garde son dernier état connu, puis le relit', async () => {
    const { client } = fakeClient();
    const pullRequest = vi.fn((repo: string, number: number) =>
      Promise.resolve({
        number,
        url: `https://github.com/code-my-life/${repo}/pull/${number}`,
        title: 'feat: ligne',
        state: 'merged' as const,
        checks: 'success' as const,
        reviewDecision: 'approved' as const,
        autoMerge: false,
        additions: 1,
        deletions: 1,
        changedFiles: 1,
        reviews: [],
        mergedAt: '2026-11-03T18:00:00.000Z',
        mainChecks: null,
        deployment: null,
        headSha: 'b055de5',
        mergeSha: 'c0ffee1',
      }),
    );
    const mainChecks = vi.fn(() => Promise.resolve('success' as const));
    const deployment = vi
      .fn()
      .mockResolvedValueOnce('pending')
      .mockRejectedValueOnce(new GitHubError(502, 'Bad Gateway'))
      .mockRejectedValueOnce(
        new GitHubError(403, 'HTTP 403 {"message":"You have exceeded a secondary rate limit"}'),
      )
      .mockResolvedValueOnce('success');
    Object.assign(client, { pullRequest, mainChecks, deployment });
    const cache = new GitHubCache(client, 'code-my-life', log(), () => 'App reliée');
    const tracked = [
      {
        key: 'factory-live#18',
        prUrl: 'https://github.com/code-my-life/factory-live/pull/19',
        active: true,
      },
    ];
    await cache.refresh(tracked, 0);
    expect(cache.pullRequest('factory-live#18')?.deployment).toBe('pending');
    // GitHub fails for a moment, or limits the rate: the deployment under way is not taken for done.
    await cache.refresh(tracked, 30_000);
    expect(cache.pullRequest('factory-live#18')?.deployment).toBe('pending');
    await cache.refresh(tracked, 45_000);
    expect(cache.pullRequest('factory-live#18')?.deployment).toBe('pending');
    await cache.refresh(tracked, 60_000);
    expect(cache.pullRequest('factory-live#18')?.deployment).toBe('success');
  });

  it('retrouve la PR par sa branche quand aucun run n’en a noté le lien', async () => {
    const { client } = fakeClient();
    const pullRequestOfBranch = vi.fn(() => Promise.resolve(3));
    const pullRequest = vi.fn(() =>
      Promise.resolve({
        number: 3,
        url: 'https://github.com/code-my-life/factory-live/pull/3',
        title: 'fix: version serveur',
        state: 'open' as const,
        checks: 'success' as const,
        reviewDecision: 'review_required' as const,
        autoMerge: false,
        additions: 10,
        deletions: 2,
        changedFiles: 4,
        headSha: 'b055de5',
      }),
    );
    Object.assign(client, { pullRequestOfBranch, pullRequest });
    const cache = new GitHubCache(client, 'code-my-life', log());
    await cache.refresh(
      [
        {
          key: 'factory-live#2',
          prUrl: null,
          branch: 'fix/2-server-version-in-settings',
          active: true,
        },
      ],
      0,
    );
    expect(pullRequestOfBranch).toHaveBeenCalledWith(
      'factory-live',
      'fix/2-server-version-in-settings',
    );
    expect(pullRequest).toHaveBeenCalledWith('factory-live', 3);
    expect(cache.pullRequest('factory-live#2')?.url).toBe(
      'https://github.com/code-my-life/factory-live/pull/3',
    );
  });
});

describe('GitHubCache, recette d’une PR', () => {
  function prClient(refuseThreads: boolean) {
    const fileAt = vi.fn(() => Promise.resolve(new Uint8Array([0x89, 0x50, 0x4e, 0x47])));
    const client = {
      rateLimit: null,
      issue: () =>
        Promise.resolve({
          title: 'La recette',
          url: 'https://github.com/code-my-life/factory-live/issues/21',
          labels: [],
          state: 'open' as const,
        }),
      pullRequest: () =>
        Promise.resolve({
          number: 24,
          url: 'https://github.com/code-my-life/factory-live/pull/24',
          title: 'interface: la recette',
          state: 'open',
          checks: 'success',
          reviewDecision: 'review_required',
          autoMerge: false,
          additions: 1,
          deletions: 0,
          changedFiles: 1,
          reviews: [],
          mergedAt: null,
          mainChecks: null,
          deployment: null,
          headSha: 'b'.repeat(40),
          mergeSha: null,
        }),
      pullRequestText: () =>
        Promise.resolve({
          body: '## Critères\n- C1 : non prouvé',
          head: 'b'.repeat(40),
          base: 'a'.repeat(40),
          url: 'https://github.com/code-my-life/factory-live/pull/24',
        }),
      issueBody: () => Promise.resolve('### Critères d’acceptation\n- C1 : la recette s’affiche'),
      checkRuns: () =>
        Promise.resolve([
          {
            id: 1,
            name: 'Vérifications',
            status: 'completed',
            conclusion: 'success',
            started_at: '2026-11-04T10:00:00Z',
            completed_at: '2026-11-04T10:02:00Z',
            html_url: 'https://github.com/code-my-life/factory-live/actions/runs/1/job/2',
            check_suite: { id: 7 },
          },
        ]),
      statuses: () => Promise.resolve([]),
      workflowRuns: () =>
        Promise.resolve([
          {
            id: 1,
            name: 'CI',
            check_suite_id: 7,
            html_url: 'https://github.com/code-my-life/factory-live/actions/runs/1',
          },
        ]),
      issueComments: () => Promise.resolve([]),
      pullFiles: () =>
        Promise.resolve([
          { filename: 'e2e/captures.spec.ts-snapshots/ligne.png', status: 'modified' },
          { filename: 'e2e/captures.spec.ts-snapshots/neuve.png', status: 'added' },
        ]),
      reviewThreads: () =>
        refuseThreads
          ? Promise.reject(new GitHubError(403, 'GitHub GraphQL : Resource not accessible'))
          : Promise.resolve({ data: { repository: { pullRequest: null } } }),
      artifacts: () => Promise.resolve([]),
      fileAt,
    } as unknown as GitHubClient;
    return { client, fileAt };
  }

  const tracked = [
    {
      key: 'factory-live#21',
      prUrl: 'https://github.com/code-my-life/factory-live/pull/24',
      active: true,
    },
  ];

  it('lit la recette partie par partie : un refus laisse la sienne sans données, le reste vient', async () => {
    const { client } = prClient(true);
    const cache = new GitHubCache(client, 'code-my-life', log());
    await cache.refresh(tracked, 0);
    const source = cache.acceptance('factory-live#21');
    expect(source).toMatchObject({
      pr: 24,
      head: 'b'.repeat(40),
      base: 'a'.repeat(40),
      prBody: '## Critères\n- C1 : non prouvé',
      threads: null,
      reviewRounds: 0,
      tests: null,
    });
    expect(
      source!.checks!.map(({ name, workflow, status }) => ({ name, workflow, status })),
    ).toEqual([{ name: 'Vérifications', workflow: 'CI', status: 'success' }]);
    // Only a modified picture is a capture (an added one has no « before »).
    expect(source!.captures!.map((capture) => capture.path)).toEqual([
      'e2e/captures.spec.ts-snapshots/ligne.png',
    ]);
    expect(cache.status.ok).toBe(true);
  });

  it('ne lit une image que si la PR modifie ce fichier, à la base ou à la tête', async () => {
    const { client, fileAt } = prClient(false);
    const cache = new GitHubCache(client, 'code-my-life', log());
    await cache.refresh(tracked, 0);
    const path = 'e2e/captures.spec.ts-snapshots/ligne.png';
    expect(await cache.capture('factory-live', 24, path, 'base')).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
    expect(fileAt).toHaveBeenCalledWith('factory-live', path, 'a'.repeat(40));
    await cache.capture('factory-live', 24, path, 'head');
    expect(fileAt).toHaveBeenLastCalledWith('factory-live', path, 'b'.repeat(40));
    expect(await cache.capture('factory-live', 24, 'apps/server/.env', 'head')).toBeNull();
    expect(
      await cache.capture('factory-live', 24, 'e2e/captures.spec.ts-snapshots/neuve.png', 'head'),
    ).toBeNull();
    expect(fileAt).toHaveBeenCalledTimes(2);
  });
});
