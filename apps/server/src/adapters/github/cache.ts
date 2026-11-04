import { createHash } from 'node:crypto';
import { msg } from '@factory-live/contracts';
import type { PullRequestView, Text } from '@factory-live/contracts';
import type {
  AcceptanceSource,
  GitHubReadPort,
  GitHubStatus,
  LoggerPort,
  TrackedIssue,
} from '../../application/ports.ts';
import { GATE_CONTEXT, gateOf, gateRulesOf, headChecksOf, threadsOf } from './acceptance.ts';
import type { WorkflowRunJson } from './acceptance.ts';
import { GitHubError } from './client.ts';
import type { GitHubClient, IssueInfo } from './client.ts';
import { junitFiles, readJUnit, testResultsOf, testSuitesOf } from './junit.ts';
import type { JUnitReport } from './junit.ts';

const PR_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/;

export function parsePrUrl(
  url: string | null,
): { owner: string; repo: string; number: number } | null {
  const match = url ? PR_URL.exec(url) : null;
  return match
    ? { owner: match[1] as string, repo: match[2] as string, number: Number(match[3]) }
    : null;
}

/**
 * Cache des données GitHub affichées (titres, labels, PR, CI). Rafraîchi par le hub : les issues actives
 * toutes les 30 s, les autres une fois. Sans jeton, tout reste vide et l'interface se rabat sur le kanban.
 */
const MISSING_RETRY_MS = 3_600_000;
/** Artifacts whose reports are kept, and pictures kept for the recette's thumbnails. */
const REPORTS_KEPT = 50;
const IMAGES_KEPT = 24;

/** The address factory-live serves a picture of a PR at: no token in it, the server reads GitHub. */
function captureUrl(repo: string, pr: number, path: string, side: 'base' | 'head'): string {
  return `/api/acceptance/${repo}/${pr}/capture?path=${encodeURIComponent(path)}&side=${side}`;
}

/** Forget the oldest entries of a map past its size. */
function bound<K, V>(map: Map<K, V>, size: number): void {
  for (const key of map.keys()) {
    if (map.size <= size) return;
    map.delete(key);
  }
}

export class GitHubCache implements GitHubReadPort {
  private readonly issues = new Map<string, IssueInfo>();
  private readonly prs = new Map<string, PullRequestView>();
  private readonly fetchedOnce = new Set<string>();
  /** Issues introuvables sur GitHub (cartes de test, dépôt supprimé) : relues une fois l'heure. */
  private readonly missing = new Map<string, number>();
  /** Optional reads GitHub has refused once (a permission the App lacks): told once in the log. */
  private readonly refused = new Set<string>();
  /** The recette's GitHub side of each issue's PR (#22). */
  private readonly acceptances = new Map<string, AcceptanceSource>();
  /** The JUnit reports of each artifact read: an artifact never changes. */
  private readonly reports = new Map<number, JUnitReport[]>();
  /** The last pictures served, by commit and path. */
  private readonly images = new Map<string, Uint8Array>();
  status: GitHubStatus = { ok: false, detail: msg('health.github.notYet'), checkedAt: null };
  lastDelivery: { at: number; status: number } | null = null;

  readonly client: GitHubClient;
  private readonly owner: string;
  private readonly log: LoggerPort;
  private readonly describe: () => Text;

  constructor(
    client: GitHubClient,
    owner: string,
    log: LoggerPort,
    describe: () => Text = () => msg('health.github.ok'),
  ) {
    this.client = client;
    this.owner = owner;
    this.log = log;
    this.describe = describe;
  }

  issueInfo(key: string): IssueInfo | null {
    return this.issues.get(key) ?? null;
  }

  pullRequest(key: string): PullRequestView | null {
    return this.prs.get(key) ?? null;
  }

  acceptance(key: string): AcceptanceSource | null {
    return this.acceptances.get(key) ?? null;
  }

  async capture(
    repo: string,
    pr: number,
    path: string,
    side: 'base' | 'head',
  ): Promise<Uint8Array | null> {
    const source = [...this.acceptances.values()].find(
      (each) => each.pr === pr && parsePrUrl(each.prUrl)?.repo === repo,
    );
    // Only a picture the PR modifies: any other path of the repository is never read.
    if (!source?.captures?.some((capture) => capture.path === path)) return null;
    const sha = side === 'base' ? source.base : source.head;
    const known = this.images.get(`${sha}:${path}`);
    if (known) return known;
    const image = await this.client.fileAt(repo, path, sha);
    this.images.set(`${sha}:${path}`, image);
    bound(this.images, IMAGES_KEPT);
    return image;
  }

  get rateLimit() {
    return this.client.rateLimit;
  }

  /** Rend vrai si quelque chose a changé (le hub renvoie alors la tranche board). */
  async refresh(tracked: readonly TrackedIssue[], now: number): Promise<boolean> {
    let changed = false;
    for (const issue of tracked) {
      if (!issue.active && this.fetchedOnce.has(issue.key)) continue;
      const missingSince = this.missing.get(issue.key);
      if (missingSince !== undefined && now - missingSince < MISSING_RETRY_MS) continue;
      const [repo = '', number = '0'] = issue.key.split('#');
      try {
        const info = await this.client.issue(repo, Number(number));
        if (JSON.stringify(info) !== JSON.stringify(this.issues.get(issue.key))) {
          this.issues.set(issue.key, info);
          changed = true;
        }
        // Sans lien noté par un run, la PR se retrouve par sa branche (celle du brief, par exemple).
        const pr =
          parsePrUrl(issue.prUrl) ??
          (issue.branch ? await this.pullRequestOfBranch(repo, issue.branch) : null);
        if (pr && pr.owner === this.owner) {
          const { headSha, mergeSha, ...fetched } = await this.client.pullRequest(
            pr.repo,
            pr.number,
          );
          // Merged: main's CI and the deployment of the merged sha tell how far the delivery has gone.
          // Each is read apart: one GitHub refuses stays unknown, and the PR and the next issues go on.
          const view: PullRequestView = mergeSha
            ? {
                ...fetched,
                mainChecks: await this.optional('mainChecks', () =>
                  this.client.mainChecks(pr.repo, mergeSha),
                ),
                deployment: await this.optional('deployment', () =>
                  this.client.deployment(pr.repo, mergeSha),
                ),
              }
            : fetched;
          if (JSON.stringify(view) !== JSON.stringify(this.prs.get(issue.key))) {
            this.prs.set(issue.key, view);
            changed = true;
          }
          // The recette (#22): each part read apart, one GitHub refuses stays without data.
          const source = await this.readAcceptance(pr.repo, pr.number, repo, Number(number));
          if (JSON.stringify(source) !== JSON.stringify(this.acceptances.get(issue.key))) {
            this.acceptances.set(issue.key, source);
            changed = true;
          }
        }
        this.fetchedOnce.add(issue.key);
        this.missing.delete(issue.key);
        this.status = { ok: true, detail: this.describe(), checkedAt: now };
      } catch (error) {
        const status = error instanceof GitHubError ? error.status : 0;
        if (status === 404) {
          // L'issue n'existe pas (carte de test au numéro inventé) : rien à voir avec l'accès à GitHub.
          if (!this.missing.has(issue.key))
            this.log.info(
              { issue: issue.key },
              'issue introuvable sur GitHub, relue dans une heure',
            );
          this.missing.set(issue.key, now);
          continue;
        }
        const access = error instanceof GitHubError ? error.access : null;
        this.status = {
          ok: false,
          detail:
            access === 'none'
              ? msg('health.github.noAccess')
              : access === 'login-required'
                ? msg('health.github.loginToWrite')
                : status === 401
                  ? msg('health.github.unauthorized')
                  : status === 403
                    ? msg('health.github.forbidden')
                    : msg('health.github.error', { status: status || null, issue: issue.key }),
          checkedAt: now,
        };
        this.log.warn({ issue: issue.key, status }, 'lecture GitHub en échec');
        if (status === 401 || status === 403) break;
      }
    }
    return changed;
  }

  /**
   * A read the App may not be allowed (403) or GitHub may not have (404): `null` then, told once in
   * the log, and the rest goes on. Any other failure (a timeout, a 5xx, a 403 of a rate limit) is
   * thrown: the issue keeps its last view and is read again at the next pass, so that a deployment
   * under way is not taken for done.
   */
  private async optional<T>(what: string, read: () => Promise<T>): Promise<T | null> {
    try {
      return await read();
    } catch (error) {
      const status = error instanceof GitHubError ? error.status : 0;
      const refused =
        status === 404 || (status === 403 && !/rate limit/i.test((error as Error).message));
      if (!refused) throw error;
      if (!this.refused.has(what)) {
        this.refused.add(what);
        this.log.warn({ what, status }, 'lecture GitHub refusée, laissée inconnue');
      }
      return null;
    }
  }

  /** The recette of a PR as GitHub gives it: the texts, the head's checks, the gate, the tests, the threads. */
  private async readAcceptance(
    repo: string,
    number: number,
    issueRepo: string,
    issueNumber: number,
  ): Promise<AcceptanceSource> {
    const text = await this.client.pullRequestText(repo, number);
    const head = text.head;
    const commitUrl = `${text.url.replace(/\/pull\/\d+$/, '')}/commit/${head}`;
    const issueBody = await this.optional('issueBody', () =>
      this.client.issueBody(issueRepo, issueNumber),
    );
    const runs = await this.optional('checkRuns', () => this.client.checkRuns(repo, head));
    const statuses = await this.optional('statuses', () => this.client.statuses(repo, head));
    const workflows = await this.optional('workflowRuns', () =>
      this.client.workflowRuns(repo, head),
    );
    const comments = await this.optional('comments', () => this.client.issueComments(repo, number));
    const files = await this.optional('pullFiles', () => this.client.pullFiles(repo, number));
    const answer = await this.optional('reviewThreads', () =>
      this.client.reviewThreads(repo, number),
    );
    const tests = await this.optional('testReports', () =>
      this.testReports(repo, head, workflows ?? []),
    );
    // The gate's last verdict: its last comment that the gate wrote (a person's copy is not one).
    const verdict =
      [...(comments ?? [])]
        .reverse()
        .find((comment) => comment.user?.type === 'Bot' && gateRulesOf(comment.body) !== null) ??
      null;
    const threads = answer ? threadsOf(answer) : null;
    return {
      pr: number,
      prUrl: text.url,
      head,
      base: text.base,
      issueBody,
      prBody: text.body,
      checks:
        runs || statuses
          ? headChecksOf(runs ?? [], statuses ?? [], workflows ?? [], commitUrl)
          : null,
      gate: gateOf(
        statuses?.find((status) => status.context === GATE_CONTEXT) ?? null,
        verdict,
        head,
        commitUrl,
      ),
      tests,
      captures: files
        ? files
            .filter((file) => file.status === 'modified' && /\.png$/i.test(file.filename))
            .map((file) => ({
              path: file.filename,
              before: captureUrl(repo, number, file.filename, 'base'),
              after: captureUrl(repo, number, file.filename, 'head'),
              url: `${text.url}/files#diff-${createHash('sha256').update(file.filename).digest('hex')}`,
            }))
        : null,
      threads: threads?.threads ?? null,
      reviewRounds: threads?.reviewRounds ?? 0,
    };
  }

  /**
   * The head's test reports: the artifacts named `junit…` of its workflow runs, each read once (an
   * artifact never changes). `null` while no run has published any.
   */
  private async testReports(
    repo: string,
    head: string,
    workflows: WorkflowRunJson[],
  ): Promise<AcceptanceSource['tests']> {
    let found = false;
    const tests: NonNullable<AcceptanceSource['tests']> = { suites: [], results: [] };
    for (const run of workflows) {
      const artifacts = (await this.client.artifacts(repo, run.id)).filter((artifact) =>
        /^junit/i.test(artifact.name),
      );
      if (artifacts.length === 0) continue;
      found = true;
      const reports: JUnitReport[] = [];
      for (const artifact of artifacts) {
        let read = this.reports.get(artifact.id);
        if (!read) {
          read = junitFiles(await this.client.artifactZip(repo, artifact.id)).map(readJUnit);
          this.reports.set(artifact.id, read);
          bound(this.reports, REPORTS_KEPT);
        }
        reports.push(...read);
      }
      const at = { repo: `${this.owner}/${repo}`, head, url: run.html_url };
      tests.suites.push(...testSuitesOf(reports, at));
      tests.results.push(...testResultsOf(reports, at));
    }
    return found ? tests : null;
  }

  private async pullRequestOfBranch(
    repo: string,
    branch: string,
  ): Promise<{ owner: string; repo: string; number: number } | null> {
    const number = await this.client.pullRequestOfBranch(repo, branch);
    return number === null ? null : { owner: this.owner, repo, number };
  }

  /** Livraisons des webhooks GitHub des dépôts de la factory (intake vu depuis GitHub). */
  async refreshDeliveries(repos: readonly string[]): Promise<void> {
    for (const repo of repos) {
      try {
        const [latest] = await this.client.webhookDeliveries(repo);
        if (latest && (!this.lastDelivery || latest.at > this.lastDelivery.at))
          this.lastDelivery = { at: latest.at, status: latest.status };
      } catch (error) {
        this.log.debug({ repo, error: String(error) }, 'livraisons des webhooks illisibles');
      }
    }
  }
}
