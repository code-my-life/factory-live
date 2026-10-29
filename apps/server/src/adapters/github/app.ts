import { createHash, createSign, randomBytes } from 'node:crypto';

/**
 * Intégration GitHub de factory-live par une GitHub App dédiée (choix de Clément, 2026-10-28) :
 * - création en un clic par manifeste depuis factory-live ;
 * - lectures de fond (issues, PR, CI) avec le jeton d'installation de l'App : quota propre, API Checks ;
 * - écriture du seul commentaire `/factory unblock` avec le jeton utilisateur de Clément (connexion
 *   GitHub), pour que le commentaire lui soit attribué, ce qu'exige le bot de la factory.
 * Le jeton fine-grained de `~/.config/factory-live/github-token` reste un repli tant que l'App n'existe pas.
 * Références : docs.github.com, « Registering a GitHub App from a manifest », « Generating a user access
 * token for a GitHub App », « Refreshing user access tokens », « Generating a JSON Web Token ».
 */

export interface AppCredentials {
  id: number;
  slug: string;
  clientId: string;
  clientSecret: string;
  pem: string;
  htmlUrl: string;
  /** Millisecondes epoch. */
  createdAt: number;
}

export interface UserTokens {
  login: string;
  userId: number;
  avatarUrl: string | null;
  accessToken: string;
  /** Millisecondes epoch. */
  expiresAt: number;
  refreshToken: string | null;
  refreshExpiresAt: number | null;
}

export interface GitHubAuthStore {
  githubApp(): AppCredentials | null;
  saveGitHubApp(app: AppCredentials): void;
  githubUser(): UserTokens | null;
  saveGitHubUser(user: UserTokens): void;
  clearGitHubUser(): void;
}

export type TokenKind = 'read' | 'write';

/** Où le client GitHub prend ses jetons : lecture (installation ou jeton fine-grained), écriture (Clément). */
export interface TokenSource {
  token(kind: TokenKind): Promise<string | null>;
  /** GitHub a refusé le jeton (401) : on en redemande un au prochain appel. */
  rejected(kind: TokenKind): void;
}

/** Jeton fixe : le jeton fine-grained d'origine, ou celui des tests. */
export class StaticTokenSource implements TokenSource {
  private readonly value: string | null;

  constructor(value: string | null) {
    this.value = value;
  }

  token(): Promise<string | null> {
    return Promise.resolve(this.value);
  }

  rejected(): void {
    // Rien à renouveler : un jeton fixe refusé doit être remplacé à la main.
  }
}

/** Pourquoi la création de l'App ou la connexion échoue : la page le dit dans la langue de Clément. */
export type GitHubAuthFailure =
  | { reason: 'manifest_unknown' }
  | { reason: 'manifest_refused'; status: number }
  | { reason: 'manifest_incomplete' }
  | { reason: 'app_missing' }
  | { reason: 'origin_unknown' }
  | { reason: 'login_unknown' }
  | { reason: 'login_denied'; detail: string }
  | { reason: 'account_refused'; login: string }
  | { reason: 'token_refused'; detail: string }
  | { reason: 'account_unreadable'; status: number }
  | { reason: 'installation_unreadable'; status: number }
  | { reason: 'installation_token_refused'; status: number };

export class GitHubAuthError extends Error {
  readonly status: number;
  readonly failure: GitHubAuthFailure;

  /** `message` reste en français, pour les journaux ; la page s'écrit d'après `failure`. */
  constructor(status: number, failure: GitHubAuthFailure, message: string) {
    super(message);
    this.status = status;
    this.failure = failure;
    this.name = 'GitHubAuthError';
  }
}

type Fetch = typeof fetch;
type Json = Record<string, unknown>;

const MANIFEST_TTL_MS = 60 * 60_000;
const LOGIN_TTL_MS = 10 * 60_000;
const RENEW_BEFORE_MS = 5 * 60_000;

const PERMISSIONS = {
  metadata: 'read',
  issues: 'write',
  pull_requests: 'read',
  actions: 'read',
  checks: 'read',
  statuses: 'read',
  contents: 'read',
  repository_hooks: 'read',
} as const;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/** JWT d'App GitHub (RS256), émis 60 s dans le passé contre les décalages d'horloge, valable 9 min. */
export function appJwt(clientId: string, pem: string, nowMs: number): string {
  const now = Math.floor(nowMs / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: clientId }));
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(pem);
  return `${header}.${payload}.${base64url(signature)}`;
}

export interface AppAuthOptions {
  store: GitHubAuthStore;
  owner: string;
  /** Seul compte accepté à la connexion (celui que le bot de la factory écoute). */
  login: string;
  /** Origines de la PWA (localhost et tailnet) : une URL de rappel pour chacune. */
  origins: readonly string[];
  fallbackToken: string | null;
  api?: string;
  web?: string;
  fetchImpl?: Fetch;
  now?: () => number;
}

export class GitHubAppAuth implements TokenSource {
  private readonly options: Required<Omit<AppAuthOptions, 'fallbackToken'>> & {
    fallbackToken: string | null;
  };
  private readonly manifestStates = new Map<string, number>();
  private readonly loginStates = new Map<
    string,
    { verifier: string; redirectUri: string; createdAt: number }
  >();
  private installation: { id: number; token: string; expiresAt: number } | null = null;
  private installed: boolean | null = null;
  private refreshing: Promise<UserTokens | null> | null = null;

  constructor(options: AppAuthOptions) {
    this.options = {
      api: 'https://api.github.com',
      web: 'https://github.com',
      fetchImpl: fetch,
      now: Date.now,
      ...options,
    };
  }

  // --- Création de l'App par manifeste --------------------------------------------------------------

  /** Formulaire à poster sur GitHub : le manifeste de l'App et l'adresse de création de l'organisation. */
  manifestRequest(origin: string): { action: string; manifest: Json } {
    const state = base64url(randomBytes(24));
    this.manifestStates.set(state, this.options.now());
    const repoUrl = `https://github.com/${this.options.owner}/factory-live`;
    return {
      action: `${this.options.web}/organizations/${encodeURIComponent(this.options.owner)}/settings/apps/new?state=${state}`,
      manifest: {
        name: `factory-live-${this.options.owner}`.slice(0, 34),
        url: repoUrl,
        description:
          'factory-live : la factory Hermès en temps réel. Lit issues, PR et CI ; poste « /factory unblock » au nom de Clément.',
        hook_attributes: { url: repoUrl, active: false },
        redirect_url: `${origin}/api/github/manifest/callback`,
        callback_urls: this.options.origins.map((item) => `${item}/api/github/oauth/callback`),
        setup_url: `${origin}/api/github/installed`,
        setup_on_update: false,
        public: false,
        request_oauth_on_install: false,
        default_permissions: PERMISSIONS,
        default_events: [],
      },
    };
  }

  /** Retour de GitHub après « Create GitHub App » : échange du code (valable une heure) contre les clés. */
  async completeManifest(code: string, state: string): Promise<AppCredentials> {
    const startedAt = this.manifestStates.get(state);
    this.manifestStates.delete(state);
    if (startedAt === undefined || this.options.now() - startedAt > MANIFEST_TTL_MS) {
      throw new GitHubAuthError(
        400,
        { reason: 'manifest_unknown' },
        'Demande de création inconnue ou expirée : relance la création de l’App',
      );
    }
    const response = await this.options.fetchImpl(
      `${this.options.api}/app-manifests/${encodeURIComponent(code)}/conversions`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'factory-live',
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok)
      throw new GitHubAuthError(
        502,
        { reason: 'manifest_refused', status: response.status },
        `GitHub a refusé la création de l’App (HTTP ${response.status})`,
      );
    const data = (await response.json()) as Json;
    const app: AppCredentials = {
      id: Number(data['id']),
      slug: str(data['slug']) ?? '',
      clientId: str(data['client_id']) ?? '',
      clientSecret: str(data['client_secret']) ?? '',
      pem: str(data['pem']) ?? '',
      htmlUrl: str(data['html_url']) ?? '',
      createdAt: this.options.now(),
    };
    if (!app.slug || !app.clientId || !app.clientSecret || !app.pem)
      throw new GitHubAuthError(
        502,
        { reason: 'manifest_incomplete' },
        'Réponse de GitHub incomplète pour la nouvelle App',
      );
    this.options.store.saveGitHubApp(app);
    this.installation = null;
    this.installed = null;
    return app;
  }

  installUrl(): string | null {
    const app = this.options.store.githubApp();
    return app
      ? `${this.options.web}/apps/${encodeURIComponent(app.slug)}/installations/new`
      : null;
  }

  // --- Connexion de Clément (flux web OAuth de l'App, avec PKCE) ----------------------------------

  authorizeUrl(origin: string): string {
    const app = this.options.store.githubApp();
    if (!app)
      throw new GitHubAuthError(
        409,
        { reason: 'app_missing' },
        'L’App GitHub n’existe pas encore : crée-la d’abord',
      );
    if (!this.options.origins.includes(origin))
      throw new GitHubAuthError(
        400,
        { reason: 'origin_unknown' },
        'Origine inconnue pour le retour de connexion',
      );
    const state = base64url(randomBytes(24));
    const verifier = base64url(randomBytes(32));
    const redirectUri = `${origin}/api/github/oauth/callback`;
    this.loginStates.set(state, { verifier, redirectUri, createdAt: this.options.now() });
    const params = new URLSearchParams({
      client_id: app.clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: base64url(createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
      login: this.options.login,
      allow_signup: 'false',
    });
    return `${this.options.web}/login/oauth/authorize?${params.toString()}`;
  }

  async completeLogin(code: string, state: string): Promise<UserTokens> {
    const app = this.options.store.githubApp();
    const pending = this.loginStates.get(state);
    this.loginStates.delete(state);
    if (!app || !pending || this.options.now() - pending.createdAt > LOGIN_TTL_MS) {
      throw new GitHubAuthError(
        400,
        { reason: 'login_unknown' },
        'Connexion inconnue ou expirée : recommence la connexion',
      );
    }
    const tokens = await this.tokenRequest({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.verifier,
    });
    const user = await this.githubUser(tokens.accessToken);
    const known = this.options.store.githubUser();
    if (
      user.login.toLowerCase() !== this.options.login.toLowerCase() ||
      (known && known.userId !== user.id)
    ) {
      throw new GitHubAuthError(
        403,
        { reason: 'account_refused', login: this.options.login },
        `Seul le compte ${this.options.login} peut se connecter à factory-live`,
      );
    }
    const stored: UserTokens = {
      ...tokens,
      login: user.login,
      userId: user.id,
      avatarUrl: user.avatarUrl,
    };
    this.options.store.saveGitHubUser(stored);
    return stored;
  }

  logout(): void {
    this.options.store.clearGitHubUser();
  }

  private async tokenRequest(
    body: Record<string, string>,
  ): Promise<Omit<UserTokens, 'login' | 'userId' | 'avatarUrl'>> {
    const response = await this.options.fetchImpl(`${this.options.web}/login/oauth/access_token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'factory-live',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json().catch(() => ({}))) as Json;
    const accessToken = str(data['access_token']);
    if (!response.ok || !accessToken) {
      const detail =
        str(data['error_description']) ?? str(data['error']) ?? `HTTP ${response.status}`;
      throw new GitHubAuthError(
        502,
        { reason: 'token_refused', detail },
        `GitHub a refusé le jeton : ${detail}`,
      );
    }
    const now = this.options.now();
    const expiresIn = Number(data['expires_in']);
    const refreshIn = Number(data['refresh_token_expires_in']);
    return {
      accessToken,
      // Sans expiration (option désactivée sur l'App) : on revérifie chaque jour.
      expiresAt:
        Number.isFinite(expiresIn) && expiresIn > 0 ? now + expiresIn * 1000 : now + 86_400_000,
      refreshToken: str(data['refresh_token']),
      refreshExpiresAt: Number.isFinite(refreshIn) && refreshIn > 0 ? now + refreshIn * 1000 : null,
    };
  }

  private async githubUser(
    accessToken: string,
  ): Promise<{ login: string; id: number; avatarUrl: string | null }> {
    const response = await this.options.fetchImpl(`${this.options.api}/user`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'factory-live',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new GitHubAuthError(
        502,
        { reason: 'account_unreadable', status: response.status },
        `Compte GitHub illisible (HTTP ${response.status})`,
      );
    const data = (await response.json()) as Json;
    return {
      login: str(data['login']) ?? '',
      id: Number(data['id']),
      avatarUrl: str(data['avatar_url']),
    };
  }

  /** Jeton de Clément, renouvelé 5 min avant l'échéance ; une seule demande de renouvellement à la fois. */
  private async userToken(): Promise<string | null> {
    const user = this.options.store.githubUser();
    if (!user) return null;
    if (user.expiresAt - this.options.now() > RENEW_BEFORE_MS) return user.accessToken;
    this.refreshing ??= this.refresh(user).finally(() => {
      this.refreshing = null;
    });
    return (await this.refreshing)?.accessToken ?? null;
  }

  private async refresh(user: UserTokens): Promise<UserTokens | null> {
    const app = this.options.store.githubApp();
    if (
      !app ||
      !user.refreshToken ||
      (user.refreshExpiresAt !== null && user.refreshExpiresAt <= this.options.now())
    ) {
      this.options.store.clearGitHubUser();
      return null;
    }
    try {
      const tokens = await this.tokenRequest({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: user.refreshToken,
      });
      // L'ancienne paire ne vaut plus rien dès maintenant : la nouvelle est enregistrée avant tout usage.
      const renewed = { ...user, ...tokens };
      this.options.store.saveGitHubUser(renewed);
      return renewed;
    } catch {
      this.options.store.clearGitHubUser();
      return null;
    }
  }

  /** Jeton d'installation de l'App (1 h), demandé avec un JWT signé par sa clé privée. */
  private async installationToken(): Promise<string | null> {
    const app = this.options.store.githubApp();
    if (!app) return null;
    const now = this.options.now();
    if (this.installation && this.installation.expiresAt - now > RENEW_BEFORE_MS)
      return this.installation.token;
    const jwt = appJwt(app.clientId, app.pem, now);
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${jwt}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'factory-live',
    };
    // L'installation se retrouve par l'organisation : on ne croit jamais un identifiant reçu en paramètre.
    const found = await this.options.fetchImpl(
      `${this.options.api}/orgs/${encodeURIComponent(this.options.owner)}/installation`,
      { headers, signal: AbortSignal.timeout(10_000) },
    );
    if (found.status === 404) {
      this.installed = false;
      return null;
    }
    if (!found.ok)
      throw new GitHubAuthError(
        found.status,
        { reason: 'installation_unreadable', status: found.status },
        `Installation de l’App illisible (HTTP ${found.status})`,
      );
    const id = Number(((await found.json()) as Json)['id']);
    const created = await this.options.fetchImpl(
      `${this.options.api}/app/installations/${id}/access_tokens`,
      { method: 'POST', headers, signal: AbortSignal.timeout(10_000) },
    );
    if (!created.ok)
      throw new GitHubAuthError(
        created.status,
        { reason: 'installation_token_refused', status: created.status },
        `Jeton d’installation refusé (HTTP ${created.status})`,
      );
    const data = (await created.json()) as Json;
    this.installed = true;
    this.installation = {
      id,
      token: str(data['token']) ?? '',
      expiresAt: Date.parse(str(data['expires_at']) ?? '') || now + 3_600_000,
    };
    return this.installation.token;
  }

  async token(kind: TokenKind): Promise<string | null> {
    if (kind === 'write') return (await this.userToken()) ?? this.options.fallbackToken;
    return (await this.installationToken()) ?? this.options.fallbackToken;
  }

  rejected(kind: TokenKind): void {
    if (kind === 'read') this.installation = null;
    else {
      const user = this.options.store.githubUser();
      if (user) this.options.store.saveGitHubUser({ ...user, expiresAt: 0 });
    }
  }

  canWrite(): boolean {
    return this.options.store.githubUser() !== null || this.options.fallbackToken !== null;
  }

  status(): {
    mode: 'app' | 'token' | 'none';
    app: { slug: string; url: string; installed: boolean | null; installUrl: string } | null;
    user: { login: string; avatarUrl: string | null; expiresAt: number } | null;
  } {
    const app = this.options.store.githubApp();
    const user = this.options.store.githubUser();
    return {
      mode: app ? 'app' : this.options.fallbackToken ? 'token' : 'none',
      app: app
        ? {
            slug: app.slug,
            url: app.htmlUrl,
            installed: this.installed,
            installUrl: this.installUrl() as string,
          }
        : null,
      user: user
        ? { login: user.login, avatarUrl: user.avatarUrl, expiresAt: user.expiresAt }
        : null,
    };
  }
}
