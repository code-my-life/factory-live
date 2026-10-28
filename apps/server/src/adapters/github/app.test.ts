import { createHash, createPublicKey, createVerify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { appPem } from '../../test/github-fixtures.ts';
import { GitHubAppAuth, GitHubAuthError, appJwt } from './app.ts';
import type { AppCredentials, GitHubAuthStore, UserTokens } from './app.ts';

const NOW = Date.parse('2026-10-28T18:00:00Z');
const LOCAL = 'http://localhost:8446';
const TAILNET = 'https://desktop-gja56n4.tail40220c.ts.net:8446';
const TOKEN_URL = 'POST https://github.com/login/oauth/access_token';
const INSTALLATION_URL = 'GET https://api.github.com/orgs/code-my-life/installation';
const ACCESS_TOKENS_URL = 'POST https://api.github.com/app/installations/99/access_tokens';

class MemoryStore implements GitHubAuthStore {
  app: AppCredentials | null = null;
  user: UserTokens | null = null;
  githubApp() {
    return this.app;
  }
  saveGitHubApp(app: AppCredentials) {
    this.app = app;
  }
  githubUser() {
    return this.user;
  }
  saveGitHubUser(user: UserTokens) {
    this.user = user;
  }
  clearGitHubUser() {
    this.user = null;
  }
}

interface Call {
  method: string;
  url: string;
  auth: string | null;
  body: Record<string, unknown> | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const userTokens = (access: string, refresh: string) =>
  json({
    access_token: access,
    expires_in: 28_800,
    refresh_token: refresh,
    refresh_token_expires_in: 15_897_600,
  });

/** GitHub simulé : chaque route est remplaçable par un test (`routes['GET https://…']`). */
function fakeGitHub(clock: { now: number }) {
  const calls: Call[] = [];
  const routes: Record<string, () => Response> = {
    'POST https://api.github.com/app-manifests/': () =>
      json({
        id: 123,
        slug: 'factory-live-code-my-life',
        client_id: 'Iv23litest',
        client_secret: 'secret-app',
        pem: appPem(),
        html_url: 'https://github.com/apps/factory-live-code-my-life',
      }),
    [TOKEN_URL]: () => userTokens('ghu_1', 'ghr_1'),
    'GET https://api.github.com/user': () =>
      json({ login: 'cddev', id: 42, avatar_url: 'https://avatars.githubusercontent.com/u/42' }),
    [INSTALLATION_URL]: () => json({ id: 99 }),
    [ACCESS_TOKENS_URL]: () =>
      json({ token: 'ghs_1', expires_at: new Date(clock.now + 3_600_000).toISOString() }),
  };
  const impl = ((input: string | URL | Request, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const url = input instanceof Request ? input.url : input.toString();
    calls.push({
      method,
      url,
      auth: new Headers(init.headers).get('authorization'),
      body:
        typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });
    const route = Object.keys(routes).find((key) => `${method} ${url}`.startsWith(key));
    return Promise.resolve(route ? routes[route]!() : json({ message: 'Not Found' }, 404));
  }) as typeof fetch;
  return { impl, calls, routes };
}

function setup(fallbackToken: string | null = null) {
  const store = new MemoryStore();
  const clock = { now: NOW };
  const github = fakeGitHub(clock);
  const auth = new GitHubAppAuth({
    store,
    owner: 'code-my-life',
    login: 'cddev',
    origins: [LOCAL, TAILNET],
    fallbackToken,
    fetchImpl: github.impl,
    now: () => clock.now,
  });
  return { store, clock, github, auth };
}

const stateOf = (url: string) => new URL(url).searchParams.get('state') ?? '';

function createApp(auth: GitHubAppAuth) {
  return auth.completeManifest('code-manifeste', stateOf(auth.manifestRequest(LOCAL).action));
}

function connect(auth: GitHubAppAuth, origin = LOCAL) {
  return auth.completeLogin('code-connexion', stateOf(auth.authorizeUrl(origin)));
}

function decodeJwt(jwt: string) {
  const [header = '', payload = '', signature = ''] = jwt.split('.');
  const verified = createVerify('RSA-SHA256')
    .update(`${header}.${payload}`)
    .verify(createPublicKey(appPem()), Buffer.from(signature, 'base64url'));
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString()) as unknown,
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString()) as unknown,
    verified,
  };
}

describe('appJwt', () => {
  it('signe en RS256 un jeton que la clé publique de l’App vérifie, daté 60 s plus tôt et valable 9 min', () => {
    expect(decodeJwt(appJwt('Iv23litest', appPem(), NOW))).toEqual({
      header: { alg: 'RS256', typ: 'JWT' },
      payload: { iat: NOW / 1000 - 60, exp: NOW / 1000 + 540, iss: 'Iv23litest' },
      verified: true,
    });
  });
});

describe('création de l’App par manifeste', () => {
  it('prépare une App privée, sans webhook, avec un retour de connexion par origine', () => {
    const { auth } = setup();
    const { action, manifest } = auth.manifestRequest(TAILNET);
    const url = new URL(action);
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://github.com/organizations/code-my-life/settings/apps/new',
    );
    expect(stateOf(action)).toMatch(/^[\w-]{32}$/);
    expect(manifest).toMatchObject({
      public: false,
      hook_attributes: { active: false },
      redirect_url: `${TAILNET}/api/github/manifest/callback`,
      setup_url: `${TAILNET}/api/github/installed`,
      callback_urls: [`${LOCAL}/api/github/oauth/callback`, `${TAILNET}/api/github/oauth/callback`],
      request_oauth_on_install: false,
      default_events: [],
      default_permissions: {
        metadata: 'read',
        issues: 'write',
        pull_requests: 'read',
        actions: 'read',
        checks: 'read',
        statuses: 'read',
        contents: 'read',
        repository_hooks: 'read',
      },
    });
    expect(String(manifest['name']).length).toBeLessThanOrEqual(34);
  });

  it('échange le code contre les clés de l’App et donne le lien d’installation', async () => {
    const { auth, store, github } = setup();
    const app = await createApp(auth);
    expect(github.calls).toMatchObject([
      { method: 'POST', url: 'https://api.github.com/app-manifests/code-manifeste/conversions' },
    ]);
    expect(app).toMatchObject({ id: 123, slug: 'factory-live-code-my-life', createdAt: NOW });
    expect(store.app).toEqual(app);
    expect(auth.installUrl()).toBe(
      'https://github.com/apps/factory-live-code-my-life/installations/new',
    );
  });

  it('refuse un état inconnu, déjà servi ou vieux de plus d’une heure, sans appeler GitHub', async () => {
    const { auth, clock, github } = setup();
    await expect(auth.completeManifest('code', 'forge')).rejects.toMatchObject({ status: 400 });
    const old = stateOf(auth.manifestRequest(LOCAL).action);
    clock.now += 61 * 60_000;
    await expect(auth.completeManifest('code', old)).rejects.toMatchObject({ status: 400 });
    expect(github.calls).toEqual([]);
    const fresh = stateOf(auth.manifestRequest(LOCAL).action);
    await auth.completeManifest('code', fresh);
    await expect(auth.completeManifest('code', fresh)).rejects.toBeInstanceOf(GitHubAuthError);
    expect(github.calls).toHaveLength(1);
  });

  it('refuse une réponse de GitHub sans clé privée', async () => {
    const { auth, store, github } = setup();
    github.routes['POST https://api.github.com/app-manifests/'] = () =>
      json({ id: 1, slug: 'x', client_id: 'y', client_secret: 'z' });
    await expect(createApp(auth)).rejects.toMatchObject({ status: 502 });
    expect(store.app).toBeNull();
  });
});

describe('connexion de Clément', () => {
  it('passe par GitHub avec PKCE S256, le compte attendu et le retour de l’origine utilisée', async () => {
    const { auth, github } = setup();
    await createApp(auth);
    const url = new URL(auth.authorizeUrl(TAILNET));
    expect(`${url.origin}${url.pathname}`).toBe('https://github.com/login/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'Iv23litest',
      redirect_uri: `${TAILNET}/api/github/oauth/callback`,
      code_challenge_method: 'S256',
      login: 'cddev',
      allow_signup: 'false',
    });
    await auth.completeLogin('code-connexion', stateOf(url.toString()));
    const exchange = github.calls.find((call) => `${call.method} ${call.url}` === TOKEN_URL);
    expect(exchange?.body).toMatchObject({
      client_id: 'Iv23litest',
      client_secret: 'secret-app',
      code: 'code-connexion',
      redirect_uri: `${TAILNET}/api/github/oauth/callback`,
    });
    const verifier = String(exchange?.body?.['code_verifier']);
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      url.searchParams.get('code_challenge'),
    );
  });

  it('garde les jetons de cddev et les donne pour écrire', async () => {
    const { auth, store } = setup();
    await createApp(auth);
    expect(auth.canWrite()).toBe(false);
    await connect(auth);
    expect(store.user).toEqual({
      login: 'cddev',
      userId: 42,
      avatarUrl: 'https://avatars.githubusercontent.com/u/42',
      accessToken: 'ghu_1',
      expiresAt: NOW + 28_800_000,
      refreshToken: 'ghr_1',
      refreshExpiresAt: NOW + 15_897_600_000,
    });
    expect(await auth.token('write')).toBe('ghu_1');
    expect(auth.canWrite()).toBe(true);
    expect(auth.status().user).toEqual({
      login: 'cddev',
      avatarUrl: 'https://avatars.githubusercontent.com/u/42',
      expiresAt: NOW + 28_800_000,
    });
  });

  it('refuse un autre compte, et un compte qui a repris le login cddev', async () => {
    const { auth, store, github } = setup();
    await createApp(auth);
    github.routes['GET https://api.github.com/user'] = () => json({ login: 'intrus', id: 7 });
    await expect(connect(auth)).rejects.toMatchObject({ status: 403 });
    expect(store.user).toBeNull();
    github.routes['GET https://api.github.com/user'] = () => json({ login: 'cddev', id: 42 });
    await connect(auth);
    github.routes['GET https://api.github.com/user'] = () => json({ login: 'CDDev', id: 43 });
    await expect(connect(auth)).rejects.toMatchObject({ status: 403 });
    expect(store.user?.userId).toBe(42);
  });

  it('refuse une origine inconnue, un état inconnu, déjà servi ou vieux de plus de 10 min', async () => {
    const { auth, clock } = setup();
    expect(() => auth.authorizeUrl(LOCAL)).toThrow(/n’existe pas encore/);
    await createApp(auth);
    expect(() => auth.authorizeUrl('https://evil.example')).toThrow(GitHubAuthError);
    await expect(auth.completeLogin('code', 'forge')).rejects.toMatchObject({ status: 400 });
    const state = stateOf(auth.authorizeUrl(LOCAL));
    await auth.completeLogin('code', state);
    await expect(auth.completeLogin('code', state)).rejects.toMatchObject({ status: 400 });
    const old = stateOf(auth.authorizeUrl(LOCAL));
    clock.now += 11 * 60_000;
    await expect(auth.completeLogin('code', old)).rejects.toMatchObject({ status: 400 });
  });

  it('rend le refus de GitHub lisible', async () => {
    const { auth, github } = setup();
    await createApp(auth);
    github.routes[TOKEN_URL] = () =>
      json({ error: 'bad_verification_code', error_description: 'The code passed is incorrect.' });
    await expect(connect(auth)).rejects.toThrow(
      'GitHub a refusé le jeton : The code passed is incorrect.',
    );
  });

  it('se déconnecte', async () => {
    const { auth, store } = setup();
    await createApp(auth);
    await connect(auth);
    auth.logout();
    expect(store.user).toBeNull();
    expect(auth.canWrite()).toBe(false);
    expect(await auth.token('write')).toBeNull();
  });
});

describe('choix des jetons', () => {
  it('lit avec le jeton d’installation, demandé par un JWT de l’App et gardé jusqu’à 5 min de son échéance', async () => {
    const { auth, github, clock } = setup('github_pat_repli');
    expect(await auth.token('read')).toBe('github_pat_repli');
    await createApp(auth);
    expect(await auth.token('read')).toBe('ghs_1');
    const lookup = github.calls.find((call) => `${call.method} ${call.url}` === INSTALLATION_URL);
    expect(decodeJwt(String(lookup?.auth).replace('Bearer ', ''))).toMatchObject({
      payload: { iss: 'Iv23litest' },
      verified: true,
    });
    clock.now += 54 * 60_000;
    expect(await auth.token('read')).toBe('ghs_1');
    github.routes[ACCESS_TOKENS_URL] = () =>
      json({ token: 'ghs_2', expires_at: new Date(clock.now + 3_600_000).toISOString() });
    clock.now += 2 * 60_000;
    expect(await auth.token('read')).toBe('ghs_2');
    expect(
      github.calls.filter((call) => `${call.method} ${call.url}` === ACCESS_TOKENS_URL),
    ).toHaveLength(2);
    expect(auth.status()).toMatchObject({ mode: 'app', app: { installed: true } });
  });

  it('retombe sur le jeton de repli tant que l’App n’est pas installée', async () => {
    const { auth, github } = setup('github_pat_repli');
    await createApp(auth);
    github.routes[INSTALLATION_URL] = () => json({ message: 'Not Found' }, 404);
    expect(await auth.token('read')).toBe('github_pat_repli');
    expect(await auth.token('write')).toBe('github_pat_repli');
    expect(auth.status()).toMatchObject({ mode: 'app', app: { installed: false }, user: null });
  });

  it('renouvelle le jeton de Clément 5 min avant son échéance, une seule fois pour des appels simultanés', async () => {
    const { auth, github, clock, store } = setup();
    await createApp(auth);
    await connect(auth);
    clock.now += 28_800_000 - 4 * 60_000;
    github.routes[TOKEN_URL] = () => userTokens('ghu_2', 'ghr_2');
    expect(await Promise.all([auth.token('write'), auth.token('write')])).toEqual([
      'ghu_2',
      'ghu_2',
    ]);
    const refreshes = github.calls.filter((call) => call.body?.['grant_type'] === 'refresh_token');
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0]?.body).toMatchObject({
      client_id: 'Iv23litest',
      client_secret: 'secret-app',
      refresh_token: 'ghr_1',
    });
    expect(store.user).toMatchObject({
      login: 'cddev',
      userId: 42,
      accessToken: 'ghu_2',
      refreshToken: 'ghr_2',
      expiresAt: clock.now + 28_800_000,
    });
  });

  it('oublie la connexion quand le rafraîchissement échoue ou a expiré', async () => {
    const { auth, github, clock, store } = setup('github_pat_repli');
    await createApp(auth);
    await connect(auth);
    clock.now += 28_800_000;
    github.routes[TOKEN_URL] = () =>
      json({ error: 'bad_refresh_token', error_description: 'The refresh token is expired.' });
    expect(await auth.token('write')).toBe('github_pat_repli');
    expect(store.user).toBeNull();

    github.routes[TOKEN_URL] = () => userTokens('ghu_3', 'ghr_3');
    await connect(auth);
    clock.now += 15_897_600_000;
    const before = github.calls.length;
    expect(await auth.token('write')).toBe('github_pat_repli');
    expect(store.user).toBeNull();
    expect(github.calls).toHaveLength(before);
  });

  it('redemande un jeton après un refus de GitHub (401)', async () => {
    const { auth, github } = setup();
    await createApp(auth);
    await connect(auth);
    expect(await auth.token('read')).toBe('ghs_1');
    github.routes[ACCESS_TOKENS_URL] = () =>
      json({ token: 'ghs_2', expires_at: new Date(NOW + 3_600_000).toISOString() });
    auth.rejected('read');
    expect(await auth.token('read')).toBe('ghs_2');
    github.routes[TOKEN_URL] = () => userTokens('ghu_2', 'ghr_2');
    auth.rejected('write');
    expect(await auth.token('write')).toBe('ghu_2');
  });

  it('sans App ni jeton de repli : aucun accès, et le dit', async () => {
    const { auth } = setup();
    expect(await auth.token('read')).toBeNull();
    expect(await auth.token('write')).toBeNull();
    expect(auth.canWrite()).toBe(false);
    expect(auth.status()).toEqual({ mode: 'none', app: null, user: null });
    expect(setup('github_pat_repli').auth.status().mode).toBe('token');
  });
});
