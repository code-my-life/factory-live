import type {
  ChecksState,
  DeploymentState,
  IssueLabel,
  PullRequestReview,
  PullRequestView,
} from '@factory-live/contracts';
import type { GitHubWritePort, IssueInfo } from '../../application/ports.ts';
import { THREADS_QUERY } from './acceptance.ts';
import type {
  CheckRunJson,
  GateCommentJson,
  StatusJson,
  ThreadsJson,
  WorkflowRunJson,
} from './acceptance.ts';
import { StaticTokenSource } from './app.ts';
import type { TokenSource } from './app.ts';

export type { IssueInfo };

/** The environment of the deployments `factory-deploy.py` posts for the factory's local deployments. */
export const DEPLOY_ENVIRONMENT = 'local';

export class GitHubError extends Error {
  readonly status: number;
  /** Refus décidé par factory-live avant d'appeler GitHub : aucun accès, ou connexion requise. */
  readonly access: 'none' | 'login-required' | null;

  constructor(status: number, message: string, access: GitHubError['access'] = null) {
    super(message);
    this.status = status;
    this.access = access;
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

/** Neutral grey, used when GitHub gives a label without a usable color (contract: 6 hex digits). */
const FALLBACK_LABEL_COLOR = 'ededed';

function labelOf(label: Json): IssueLabel {
  const color = str(label['color']);
  return {
    name: str(label['name']),
    color: /^[0-9a-fA-F]{6}$/.test(color) ? color : FALLBACK_LABEL_COLOR,
  };
}

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
    // A POST that only reads (GraphQL) still uses the reading token, the App's.
    kind: 'read' | 'write' = method === 'GET' ? 'read' : 'write',
  ): Promise<unknown> {
    const token = await this.tokens.token(kind);
    if (!token) {
      throw new GitHubError(
        401,
        kind === 'read'
          ? 'Aucun accès GitHub : crée et installe l’App factory-live'
          : 'Connecte-toi à GitHub dans factory-live pour écrire en ton nom',
        kind === 'read' ? 'none' : 'login-required',
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
      return this.request(method, path, body, true, kind);
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
      labels: (Array.isArray(data['labels']) ? data['labels'] : []).map(
        (label: unknown): IssueLabel =>
          typeof label === 'string'
            ? { name: label, color: FALLBACK_LABEL_COLOR }
            : labelOf(obj(label)),
      ),
      state: data['state'] === 'closed' ? 'closed' : 'open',
    };
  }

  async pullRequest(
    repo: string,
    number: number,
  ): Promise<PullRequestView & { headSha: string; mergeSha: string | null }> {
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
    const merged = data['merged'] === true || Boolean(data['merged_at']);
    return {
      number,
      url: str(data['html_url']),
      title: str(data['title']),
      state: merged
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
      reviews: reviewsOf(reviews),
      mergedAt: merged && data['merged_at'] ? new Date(str(data['merged_at'])).toISOString() : null,
      // Main's CI and the deployment of the merged sha are read apart (`mainChecks`, `deployment`).
      mainChecks: null,
      deployment: null,
      headSha,
      mergeSha: merged ? str(data['merge_commit_sha']) || null : null,
    };
  }

  /**
   * The last GitHub deployment of a sha that the factory's `factory-deploy.py` posted (environment
   * `local`), and its status. GitHub Pages deploys every commit of main too: those are not the app's.
   */
  async deployment(repo: string, sha: string): Promise<DeploymentState> {
    const deployments = (await this.request(
      'GET',
      this.path(repo, `/deployments?sha=${sha}&environment=${DEPLOY_ENVIRONMENT}&per_page=1`),
    )) as Json[];
    const latest = Array.isArray(deployments) ? deployments[0] : undefined;
    if (!latest) return 'none';
    const statuses = (await this.request(
      'GET',
      this.path(repo, `/deployments/${String(latest['id'])}/statuses?per_page=1`),
    )) as Json[];
    return deploymentStateOf([latest], Array.isArray(statuses) ? statuses : []);
  }

  /** La PR la plus récente dont la tête est cette branche du dépôt ; `null` s'il n'y en a pas. */
  async pullRequestOfBranch(repo: string, branch: string): Promise<number | null> {
    const head = encodeURIComponent(`${this.owner}:${branch}`);
    const data = await this.request(
      'GET',
      this.path(repo, `/pulls?head=${head}&state=all&sort=created&direction=desc&per_page=1`),
    );
    const first = Array.isArray(data) ? (data[0] as Json | undefined) : undefined;
    return typeof first?.['number'] === 'number' ? first['number'] : null;
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

  /** Opens an issue in a repository of the owner (#61): `repo` is its name. */
  async openIssue(
    repo: string,
    title: string,
    body: string,
  ): Promise<{ number: number; url: string }> {
    const data = (await this.request('POST', this.path(repo, '/issues'), { title, body })) as Json;
    return { number: Number(data['number']), url: str(data['html_url']) };
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

  /**
   * Bytes GitHub serves (an artifact's zip, a file at a commit), with the reading token; redirects are
   * followed (an artifact lives elsewhere, and fetch drops the token there). Past `max` bytes, nothing.
   */
  private async bytes(
    path: string,
    accept: string,
    max: number,
    retried = false,
  ): Promise<Uint8Array> {
    const token = await this.tokens.token('read');
    if (!token)
      throw new GitHubError(
        401,
        'Aucun accès GitHub : crée et installe l’App factory-live',
        'none',
      );
    const response = await this.fetchImpl(`${this.api}${path}`, {
      headers: {
        Accept: accept,
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'factory-live',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 401 && !retried) {
      this.tokens.rejected('read');
      return this.bytes(path, accept, max, true);
    }
    if (!response.ok)
      throw new GitHubError(response.status, `GitHub GET ${path} : HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > max) throw new GitHubError(413, `GitHub GET ${path} : ${length} octets`);
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength > max)
      throw new GitHubError(413, `GitHub GET ${path} : ${data.byteLength} octets`);
    return data;
  }

  /** The text of an issue or a PR as its author wrote it (the criteria, the proofs), and its PR's shas. */
  async pullRequestText(
    repo: string,
    number: number,
  ): Promise<{ body: string; head: string; base: string; url: string }> {
    const data = (await this.request('GET', this.path(repo, `/pulls/${number}`))) as Json;
    return {
      body: str(data['body']),
      head: str(obj(data['head'])['sha']),
      base: str(obj(data['base'])['sha']),
      url: str(data['html_url']),
    };
  }

  async issueBody(repo: string, number: number): Promise<string> {
    const data = (await this.request('GET', this.path(repo, `/issues/${number}`))) as Json;
    return str(data['body']);
  }

  /**
   * Every page of a list GitHub gives by pages of 100 (`per_page=100` in `path`), up to `max` pages:
   * past its first page, a PR's newest gate verdict, captures or threads would be missed.
   */
  private async pages<T>(path: string, pick: (body: unknown) => T[], max: number): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; page <= max; page += 1) {
      const items = pick(await this.request('GET', `${path}&page=${page}`));
      all.push(...items);
      if (items.length < 100) break;
    }
    return all;
  }

  /** The check runs of a commit (each job of each workflow, and the checks of Apps). */
  async checkRuns(repo: string, sha: string): Promise<CheckRunJson[]> {
    return this.pages(
      this.path(repo, `/commits/${sha}/check-runs?per_page=100`),
      (body) => {
        const runs = obj(body)['check_runs'];
        return (Array.isArray(runs) ? runs : []) as CheckRunJson[];
      },
      5,
    );
  }

  /** The commit statuses of a commit, newest first (`factory/gate` among them). */
  async statuses(repo: string, sha: string): Promise<StatusJson[]> {
    const data = await this.request(
      'GET',
      this.path(repo, `/commits/${sha}/statuses?per_page=100`),
    );
    return (Array.isArray(data) ? data : []) as StatusJson[];
  }

  /** The workflow runs of a commit: they name the checks' workflows and hold the test reports. */
  async workflowRuns(repo: string, sha: string): Promise<WorkflowRunJson[]> {
    const data = (await this.request(
      'GET',
      this.path(repo, `/actions/runs?head_sha=${sha}&per_page=50`),
    )) as Json;
    return (Array.isArray(data['workflow_runs']) ? data['workflow_runs'] : []) as WorkflowRunJson[];
  }

  /** The comments of a PR's conversation, oldest first (the gate's verdicts among them). */
  async issueComments(repo: string, number: number): Promise<GateCommentJson[]> {
    return this.pages(
      this.path(repo, `/issues/${number}/comments?per_page=100`),
      (body) => (Array.isArray(body) ? body : []) as GateCommentJson[],
      10,
    );
  }

  /** The files a PR changes, with how (added, modified, removed, renamed). */
  async pullFiles(repo: string, number: number): Promise<{ filename: string; status: string }[]> {
    // GitHub lists up to 3 000 files of a PR, 100 a page.
    const files = await this.pages(
      this.path(repo, `/pulls/${number}/files?per_page=100`),
      (body) => (Array.isArray(body) ? (body as Json[]) : []),
      30,
    );
    return files.map((file) => ({ filename: str(file['filename']), status: str(file['status']) }));
  }

  /** The artifacts of a workflow run that have not expired. */
  async artifacts(repo: string, runId: number): Promise<{ id: number; name: string }[]> {
    const data = (await this.request(
      'GET',
      this.path(repo, `/actions/runs/${runId}/artifacts?per_page=100`),
    )) as Json;
    return (Array.isArray(data['artifacts']) ? (data['artifacts'] as Json[]) : [])
      .filter((artifact) => artifact['expired'] !== true)
      .map((artifact) => ({ id: Number(artifact['id']), name: str(artifact['name']) }));
  }

  /** An artifact's zip (the CI's test reports are a few hundred kilobytes; past 50 MB, nothing). */
  async artifactZip(repo: string, id: number): Promise<Uint8Array> {
    return this.bytes(
      this.path(repo, `/actions/artifacts/${id}/zip`),
      'application/vnd.github+json',
      50 * 1024 * 1024,
    );
  }

  /** A file of the repository at a commit, raw (a capture; past 10 MB, nothing). */
  async fileAt(repo: string, path: string, ref: string): Promise<Uint8Array> {
    const at = path.split('/').map(encodeURIComponent).join('/');
    return this.bytes(
      this.path(repo, `/contents/${at}?ref=${encodeURIComponent(ref)}`),
      'application/vnd.github.raw',
      10 * 1024 * 1024,
    );
  }

  /** The review threads of a PR and its number of reviews, by GraphQL (REST has no threads). */
  async reviewThreads(repo: string, number: number): Promise<ThreadsJson> {
    if (!NAME.test(repo)) throw new GitHubError(400, `Dépôt invalide : ${repo}`);
    type Thread = NonNullable<
      NonNullable<NonNullable<ThreadsJson['data']>['repository']>['pullRequest']
    >['reviewThreads']['nodes'][number];
    const nodes: Thread[] = [];
    let first: ThreadsJson | null = null;
    let after: string | null = null;
    // A hundred threads a page, ten pages at most: a long review keeps its last threads.
    for (let page = 0; page < 10; page += 1) {
      const answer = (await this.request(
        'POST',
        '/graphql',
        { query: THREADS_QUERY, variables: { owner: this.owner, name: repo, number, after } },
        false,
        'read',
      )) as ThreadsJson & { errors?: { type?: string; message?: string }[] };
      // GraphQL answers 200 even when it refuses: a refusal is GitHub's, like a 403 of REST.
      if (answer.errors?.length) {
        const refused = answer.errors.some(
          (error) => error.type === 'FORBIDDEN' || error.type === 'NOT_FOUND',
        );
        throw new GitHubError(
          refused ? 403 : 502,
          `GitHub GraphQL : ${answer.errors[0]?.message ?? ''}`,
        );
      }
      first ??= answer;
      const threads = answer.data?.repository?.pullRequest?.reviewThreads;
      nodes.push(...(threads?.nodes ?? []));
      if (!threads?.pageInfo?.hasNextPage || !threads.pageInfo.endCursor) break;
      after = threads.pageInfo.endCursor;
    }
    const pr = first?.data?.repository?.pullRequest;
    return pr
      ? { data: { repository: { pullRequest: { ...pr, reviewThreads: { nodes } } } } }
      : (first ?? { data: null });
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

/** The decided reviews of a PR (approved, changes requested), from the oldest to the most recent. */
export function reviewsOf(reviews: readonly Json[]): PullRequestReview[] {
  return reviews
    .flatMap((review): PullRequestReview[] => {
      const state = String(review['state']);
      const at = review['submitted_at'];
      if (typeof at !== 'string') return [];
      if (state === 'APPROVED') return [{ state: 'approved', at: new Date(at).toISOString() }];
      if (state === 'CHANGES_REQUESTED')
        return [{ state: 'changes_requested', at: new Date(at).toISOString() }];
      return [];
    })
    .sort((left, right) => left.at.localeCompare(right.at));
}

/**
 * The state of a deployment from its last status (the most recent first, as the API returns them):
 * no deployment, `none`; no status, pending; `inactive` means replaced by a more recent one, so it
 * succeeded.
 */
export function deploymentStateOf(
  deployments: readonly Json[],
  statuses: readonly Json[],
): DeploymentState {
  if (deployments.length === 0) return 'none';
  const latest = statuses[0]?.['state'];
  const state = typeof latest === 'string' ? latest : 'pending';
  if (state === 'success' || state === 'inactive') return 'success';
  if (state === 'failure' || state === 'error') return 'failure';
  return 'pending';
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
