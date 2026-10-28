import type { PullRequestView } from '@factory-live/contracts';
import type {
  GitHubReadPort,
  GitHubStatus,
  LoggerPort,
  TrackedIssue,
} from '../../application/ports.ts';
import { GitHubError } from './client.ts';
import type { GitHubClient, IssueInfo } from './client.ts';

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

export class GitHubCache implements GitHubReadPort {
  private readonly issues = new Map<string, IssueInfo>();
  private readonly prs = new Map<string, PullRequestView>();
  private readonly fetchedOnce = new Set<string>();
  /** Issues introuvables sur GitHub (cartes de test, dépôt supprimé) : relues une fois l'heure. */
  private readonly missing = new Map<string, number>();
  status: GitHubStatus = { ok: false, detail: 'Pas encore interrogée', checkedAt: null };
  lastDelivery: { at: number; status: number } | null = null;

  readonly client: GitHubClient;
  private readonly owner: string;
  private readonly log: LoggerPort;
  private readonly describe: () => string;

  constructor(
    client: GitHubClient,
    owner: string,
    log: LoggerPort,
    describe: () => string = () => 'Accès GitHub valide',
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
        const pr = parsePrUrl(issue.prUrl);
        if (pr && pr.owner === this.owner) {
          const { headSha, ...view } = await this.client.pullRequest(pr.repo, pr.number);
          if (JSON.stringify(view) !== JSON.stringify(this.prs.get(issue.key))) {
            this.prs.set(issue.key, view);
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
        // Nos propres messages (aucun accès, connexion requise) sont déjà lisibles.
        const ours =
          error instanceof GitHubError && /^(Aucun accès|Connecte-toi)/.test(error.message);
        this.status = {
          ok: false,
          detail: ours
            ? error.message
            : status === 401
              ? 'Accès refusé (401) : reconnecte ou réinstalle l’App GitHub'
              : status === 403
                ? 'Accès refusé ou quota épuisé (403)'
                : `Erreur ${status || 'réseau'} sur ${issue.key}`,
          checkedAt: now,
        };
        this.log.warn({ issue: issue.key, status }, 'lecture GitHub en échec');
        if (status === 401 || status === 403) break;
      }
    }
    return changed;
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
