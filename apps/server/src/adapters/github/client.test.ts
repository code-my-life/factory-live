import { describe, expect, it } from 'vitest';
import { GitHubClient, GitHubError, checksOf, reviewDecisionOf } from './client.ts';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(routes: Record<string, () => Response>) {
  const calls: Call[] = [];
  const impl = ((input: string | URL | Request, init: RequestInit = {}) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push({ url, init });
    const key = Object.keys(routes).find((route) => url.endsWith(route));
    return Promise.resolve(key ? routes[key]!() : new Response('{}', { status: 404 }));
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'x-ratelimit-remaining': '4812',
      'x-ratelimit-limit': '5000',
      ...headers,
    },
  });

describe('checksOf', () => {
  it('résume les workflows du commit : en cours, en échec, au vert, aucun', () => {
    expect(checksOf([])).toBe('none');
    expect(checksOf([{ workflow_id: 1, status: 'in_progress', conclusion: null }])).toBe('pending');
    expect(
      checksOf([
        { workflow_id: 1, status: 'completed', conclusion: 'success' },
        { workflow_id: 2, status: 'completed', conclusion: 'failure' },
      ]),
    ).toBe('failure');
    expect(
      checksOf([
        { workflow_id: 1, status: 'completed', conclusion: 'success' },
        { workflow_id: 2, status: 'completed', conclusion: 'skipped' },
      ]),
    ).toBe('success');
  });

  it('ne garde que la dernière tentative d’un workflow relancé', () => {
    expect(
      checksOf([
        { workflow_id: 1, run_attempt: 1, status: 'completed', conclusion: 'failure' },
        { workflow_id: 1, run_attempt: 2, status: 'completed', conclusion: 'success' },
      ]),
    ).toBe('success');
  });
});

describe('reviewDecisionOf', () => {
  const review = (login: string, state: string) => ({ user: { login }, state });

  it('prend le dernier avis de chaque relecteur', () => {
    expect(
      reviewDecisionOf([review('cddev', 'CHANGES_REQUESTED'), review('cddev', 'APPROVED')], false),
    ).toBe('approved');
    expect(
      reviewDecisionOf([review('cddev', 'APPROVED'), review('autre', 'CHANGES_REQUESTED')], false),
    ).toBe('changes_requested');
    expect(reviewDecisionOf([review('cddev', 'COMMENTED')], true)).toBe('review_required');
    expect(reviewDecisionOf([], false)).toBeNull();
  });
});

describe('GitHubClient', () => {
  it('lit une issue avec le jeton, et relit par ETag sans consommer le quota', async () => {
    let first = true;
    const { impl, calls } = fakeFetch({
      '/repos/code-my-life/cv-site/issues/49': () => {
        if (first) {
          first = false;
          return json(
            {
              title: 'Page Projets',
              html_url: 'https://github.com/code-my-life/cv-site/issues/49',
              labels: [{ name: 'factory', color: 'a2eeef' }, 'bug', { name: 'odd', color: 'zz' }],
              state: 'open',
            },
            { etag: 'W/"abc"' },
          );
        }
        return new Response(null, { status: 304 });
      },
    });
    const client = new GitHubClient('jeton', 'code-my-life', 'https://api.github.com', impl);
    const issue = await client.issue('cv-site', 49);
    expect(issue).toEqual({
      title: 'Page Projets',
      url: 'https://github.com/code-my-life/cv-site/issues/49',
      labels: [
        { name: 'factory', color: 'a2eeef' },
        { name: 'bug', color: 'ededed' },
        { name: 'odd', color: 'ededed' },
      ],
      state: 'open',
    });
    expect(await client.issue('cv-site', 49)).toEqual(issue);
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe('Bearer jeton');
    expect(new Headers(calls[1]?.init.headers).get('if-none-match')).toBe('W/"abc"');
    expect(client.rateLimit).toMatchObject({ remaining: 4812, limit: 5000 });
  });

  it('retrouve la PR d’une branche du dépôt, ou rien', async () => {
    const { impl, calls } = fakeFetch({
      'head=code-my-life%3Afix%2F2-server-version-in-settings&state=all&sort=created&direction=desc&per_page=1':
        () => json([{ number: 3, head: { ref: 'fix/2-server-version-in-settings' } }]),
      'head=code-my-life%3Afix%2F9-absente&state=all&sort=created&direction=desc&per_page=1': () =>
        json([]),
    });
    const client = new GitHubClient('jeton', 'code-my-life', 'https://api.github.com', impl);
    expect(
      await client.pullRequestOfBranch('factory-live', 'fix/2-server-version-in-settings'),
    ).toBe(3);
    expect(await client.pullRequestOfBranch('factory-live', 'fix/9-absente')).toBeNull();
    expect(calls[0]?.url).toContain('/repos/code-my-life/factory-live/pulls?');
  });

  it('poste le commentaire de déblocage sur l’issue', async () => {
    const { impl, calls } = fakeFetch({
      '/repos/code-my-life/cv-site/issues/49/comments': () =>
        json({
          id: 77,
          html_url: 'https://github.com/code-my-life/cv-site/issues/49#issuecomment-77',
        }),
    });
    const client = new GitHubClient('jeton', 'code-my-life', 'https://api.github.com', impl);
    expect(await client.comment('cv-site', 49, '/factory unblock Prends PostgreSQL')).toEqual({
      id: 77,
      url: 'https://github.com/code-my-life/cv-site/issues/49#issuecomment-77',
    });
    expect(calls[0]?.init.method).toBe('POST');
    expect(
      JSON.parse(typeof calls[0]?.init.body === 'string' ? calls[0].init.body : 'null'),
    ).toEqual({
      body: '/factory unblock Prends PostgreSQL',
    });
  });

  it('refuse un nom de dépôt qui sortirait du propriétaire, et remonte les erreurs HTTP', async () => {
    const { impl } = fakeFetch({});
    const client = new GitHubClient('jeton', 'code-my-life', 'https://api.github.com', impl);
    await expect(client.issue('../../orgs/x', 1)).rejects.toThrow(GitHubError);
    await expect(client.issue('cv-site', 1)).rejects.toMatchObject({ status: 404 });
  });
});
