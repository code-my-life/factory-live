import type { ChecksState, PullRequestView } from '@factory-live/contracts';
import type { GitHubWritePort, IssueInfo } from '../../application/ports.ts';
import { StaticTokenSource } from './app.ts';
import type { TokenSource } from './app.ts';

export type { IssueInfo };

export class GitHubError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'GitHubError';
  }
}

export interface RateLimit {
  remaining: number;
  limit: number;
  /** Millisecondes epoch. */
  resetAt: number;
}

export interface Reaction {
  content: string;
  user: string;
}

export interface WebhookDelivery {
  /** Millisecondes epoch. */
  at: number;
  status: number;
  event: string;
}

type Fetch = typeof fetch;
type Json = Record<string, unknown>;

const NAME = /^[\w.-]+$/;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null ? (value as Json) : {};

/**
 * Client REST de GitHub. Les jetons viennent d'une source (`TokenSource`) : jeton d'installation de
 * la GitHub App pour lire, jeton de Clément pour écrire, ou le jeton fine-grained en repli. Lectures
 * conditionnelles par ETag (une réponse 304 ne compte pas dans le quota) ; la CI se lit par l'API
 * Actions, ouverte à tous ces jetons.
 */
export class GitHubClient implements GitHubWritePort {
  private readonly cache = new Map<string, { etag: string; body: unknown }>();
  rateLimit: RateLimit | null = null;

  private readonly tokens: TokenSource;
  private readonly owner: string;
  private readonly api: string;
  private readonly fetchImpl: Fetch;

  constructor(
    tokens: TokenSource | string,
    owner: string,
    api = 'https://api.github.com',
    fetchImpl: Fetch = fetch,
  ) {
    this.tokens = typeof tokens === 'string' ? new StaticTokenSource(tokens) : tokens;
    this.owner = owner;
    this.api = api;
    this.fetchImpl = fetchImpl;
  }

  private path(repo: string, rest: string): string {
    if (!NAME.test(repo)) throw new GitHubError(400, `Dépôt invalide : ${repo}`);
    return `/repos/${this.owner}/${repo}${rest}`;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    retried = false,
  ): Promise<unknown> {
    const kind = method === 'GET' ? 'read' : 'write';
    const token = await this.tokens.token(kind);
    if (!token) {
      throw new GitHubError(
        401,
        kind === 'read'
          ? 'Aucun accès GitHub : crée et installe l’App factory-live'
          : 'Connecte-toi à GitHub dans factory-live pour écrire en ton nom',
      );
    }
    const cached = method === 'GET' ? this.cache.get(path) : undefined;
    const response = await this.fetchImpl(`${this.api}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'factory-live',
        ...(cached ? { 'If-None-Match': cached.etag } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    const limit = Number(response.headers.get('x-ratelimit-limit'));
    if (Number.isFinite(remaining) && Number.isFinite(limit) && limit > 0) {
      this.rateLimit = {
        remaining,
        limit,
        resetAt: Number(response.headers.get('x-ratelimit-reset') ?? 0) * 1000,
      };
    }
    if (response.status === 304 && cached) return cached.body;
    if (response.status === 401 && !retried) {
      // Jeton expiré ou révoqué : la source en fournit un neuf (installation renouvelée, rafraîchissement).
      this.tokens.rejected(kind);
      return this.request(method, path, body, true);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new GitHubError(
        response.status,
        `GitHub ${method} ${path} : HTTP ${response.status} ${detail.slice(0, 200)}`,
      );
    }
    const parsed: unknown = response.status === 204 ? null : await response.json();
    const etag = response.headers.get('etag');
    if (method === 'GET' && etag) this.cache.set(path, { etag, body: parsed });
    return parsed;
  }

  async issue(repo: string, number: number): Promise<IssueInfo> {
    const data = (await this.request('GET', this.path(repo, `/issues/${number}`))) as Json;
    return {
      title: str(data['title']),
      url: str(data['html_url']),
      labels: (Array.isArray(data['labels']) ? data['labels'] : []).map((label: unknown) =>
        typeof label === 'string' ? label : str(obj(label)['name']),
      ),
      state: data['state'] === 'closed' ? 'closed' : 'open',
    };
  }

  async pullRequest(repo: string, number: number): Promise<PullRequestView & { headSha: string }> {
    const data = (await this.request('GET', this.path(repo, `/pulls/${number}`))) as Json;
    const reviews = (await this.request(
      'GET',
      this.path(repo, `/pulls/${number}/reviews?per_page=100`),
    )) as Json[];
    const headSha = str(obj(data['head'])['sha']);
    const runs = headSha
      ? ((await this.request(
          'GET',
          this.path(repo, `/actions/runs?head_sha=${headSha}&per_page=50`),
        )) as Json)
      : {};
    return {
      number,
      url: str(data['html_url']),
      title: str(data['title']),
      state:
        data['merged'] === true || data['merged_at']
          ? 'merged'
          : data['state'] === 'closed'
            ? 'closed'
            : data['draft'] === true
              ? 'draft'
              : 'open',
      checks: checksOf(
        (Array.isArray(runs['workflow_runs']) ? runs['workflow_runs'] : []) as Json[],
      ),
      reviewDecision: reviewDecisionOf(
        reviews,
        Array.isArray(data['requested_reviewers']) && data['requested_reviewers'].length > 0,
      ),
      autoMerge: data['auto_merge'] !== null && data['auto_merge'] !== undefined,
      additions: Number(data['additions'] ?? 0),
      deletions: Number(data['deletions'] ?? 0),
      changedFiles: Number(data['changed_files'] ?? 0),
      headSha,
    };
  }

  /** Workflows de main après un merge (ce que surveille `watch-main` côté factory). */
  async mainChecks(repo: string, sha: string): Promise<ChecksState> {
    const runs = (await this.request(
      'GET',
      this.path(repo, `/actions/runs?head_sha=${sha}&per_page=50`),
    )) as Json;
    return checksOf((Array.isArray(runs['workflow_runs']) ? runs['workflow_runs'] : []) as Json[]);
  }

  async comment(repo: string, number: number, body: string): Promise<{ id: number; url: string }> {
    const data = (await this.request('POST', this.path(repo, `/issues/${number}/comments`), {
      body,
    })) as Json;
    return { id: Number(data['id']), url: str(data['html_url']) };
  }

  async reactions(repo: string, commentId: number): Promise<Reaction[]> {
    const data = (await this.request(
      'GET',
      this.path(repo, `/issues/comments/${commentId}/reactions?per_page=100`),
    )) as Json[];
    return data.map((reaction) => ({
      content: String(reaction['content']),
      user: str(obj(reaction['user'])['login']),
    }));
  }

  /** Dernières livraisons des webhooks du dépôt, vues par GitHub (permission « Webhooks : lecture »). */
  async webhookDeliveries(repo: string): Promise<WebhookDelivery[]> {
    const hooks = (await this.request('GET', this.path(repo, '/hooks?per_page=20'))) as Json[];
    const deliveries: WebhookDelivery[] = [];
    for (const hook of hooks.filter((item) => item['active'] === true)) {
      const list = (await this.request(
        'GET',
        this.path(repo, `/hooks/${Number(hook['id'])}/deliveries?per_page=5`),
      )) as Json[];
      for (const delivery of list) {
        deliveries.push({
          at: Date.parse(str(delivery['delivered_at'])),
          status: Number(delivery['status_code'] ?? 0),
          event: str(delivery['event']),
        });
      }
    }
    return deliveries.sort((left, right) => right.at - left.at);
  }
}

/** État de CI d'un commit à partir des runs de workflow (API Actions). */
export function checksOf(runs: readonly Json[]): ChecksState {
  if (runs.length === 0) return 'none';
  const latest = new Map<string, Json>();
  for (const run of runs) {
    const key = String(run['workflow_id'] ?? run['name'] ?? run['id']);
    const known = latest.get(key);
    if (!known || Number(run['run_attempt'] ?? 1) >= Number(known['run_attempt'] ?? 1))
      latest.set(key, run);
  }
  const all = [...latest.values()];
  if (all.some((run) => run['status'] !== 'completed')) return 'pending';
  if (
    all.some((run) =>
      ['failure', 'timed_out', 'cancelled', 'startup_failure', 'action_required'].includes(
        String(run['conclusion']),
      ),
    )
  )
    return 'failure';
  return 'success';
}

/** Décision de revue (l'API REST ne la donne pas) : dernier avis de chaque relecteur. */
export function reviewDecisionOf(
  reviews: readonly Json[],
  reviewRequested: boolean,
): PullRequestView['reviewDecision'] {
  const last = new Map<string, string>();
  for (const review of reviews) {
    const state = String(review['state']);
    if (state === 'COMMENTED' || state === 'PENDING') continue;
    last.set(str(obj(review['user'])['login']), state);
  }
  const states = [...last.values()];
  if (states.includes('CHANGES_REQUESTED')) return 'changes_requested';
  if (states.includes('APPROVED') && !reviewRequested) return 'approved';
  return reviewRequested || states.length > 0 ? 'review_required' : null;
}
