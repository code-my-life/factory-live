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
