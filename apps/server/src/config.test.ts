import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

/**
 * No real secret is read by these tests: the secrets folder is a temporary one, holding a test secret of the
 * core. factory-live reads the core alone (#72), and requires its address and its secret.
 */
const SECRETS = mkdtempSync(join(tmpdir(), 'factory-live-secrets-'));
writeFileSync(join(SECRETS, 'workflow-core-secret'), 'secret-du-socle\n');
afterAll(() => rmSync(SECRETS, { recursive: true, force: true }));
const BASE = { SECRETS_DIR: SECRETS, WORKFLOW_CORE_URL: 'http://host.docker.internal:8447' };

describe('configuration, hôtes autorisés (contrôle contre le DNS rebinding)', () => {
  it('ce PC sur le port du service, les hôtes des origines publiques, puis ALLOWED_HOSTS', () => {
    const config = loadConfig({
      ...BASE,
      PORT: '8446',
      PUBLIC_ORIGINS: 'http://localhost:8446,https://Machine.Tailnet.ts.net:8446',
      ALLOWED_HOSTS: 'factory-live.lan:9000, autre.lan:9000',
    });
    expect(config.allowedHosts).toEqual([
      'localhost:8446',
      '127.0.0.1:8446',
      '[::1]:8446',
      'machine.tailnet.ts.net:8446',
      'factory-live.lan:9000',
      'autre.lan:9000',
    ]);
  });

  it('suit le port du service', () => {
    const config = loadConfig({ ...BASE, PORT: '9000' });
    expect(config.allowedHosts).toEqual(['localhost:9000', '127.0.0.1:9000', '[::1]:9000']);
  });

  it('refuse une origine publique qui n’est pas une URL', () => {
    expect(() => loadConfig({ ...BASE, PUBLIC_ORIGINS: 'pas-une-url' })).toThrow();
  });
});

describe('configuration, valeurs propres à ce PC (docker/.env, jamais dans le dépôt)', () => {
  it('sans rien de configuré : ce PC seulement, ni adresse tailnet, ni login Tailscale, ni dashboard', () => {
    const config = loadConfig(BASE);
    expect(config.PUBLIC_ORIGINS).toEqual(['http://localhost:8446']);
    expect(config.addresses).toEqual({ local: 'http://localhost:8446', tailnet: null });
    expect(config.TAILSCALE_LOGINS).toEqual([]);
    expect(config.DASHBOARD_URL).toBeNull();
  });

  it('l’adresse tailnet, le login Tailscale et le dashboard viennent de la configuration', () => {
    const config = loadConfig({
      ...BASE,
      PUBLIC_ORIGINS: 'http://localhost:8446,https://machine.tailnet.ts.net:8446',
      DASHBOARD_URL: 'https://machine.tailnet.ts.net:9443',
      TAILSCALE_LOGINS: 'alice@github',
    });
    expect(config.addresses).toEqual({
      local: 'http://localhost:8446',
      tailnet: 'https://machine.tailnet.ts.net:8446',
    });
    expect(config.DASHBOARD_URL).toBe('https://machine.tailnet.ts.net:9443');
    expect(config.TAILSCALE_LOGINS).toEqual(['alice@github']);
  });

  it('un DASHBOARD_URL vide, comme le passe compose sans valeur, ne fait pas de lien', () => {
    expect(loadConfig({ ...BASE, DASHBOARD_URL: '' }).DASHBOARD_URL).toBeNull();
  });
});

describe('configuration, bot de la factory', () => {
  it('seule sa réaction au déblocage compte : code-my-life-factory[bot] par défaut, réglable', () => {
    expect(loadConfig(BASE).FACTORY_BOT_LOGIN).toBe('code-my-life-factory[bot]');
    expect(loadConfig({ ...BASE, FACTORY_BOT_LOGIN: 'autre-factory[bot]' }).FACTORY_BOT_LOGIN).toBe(
      'autre-factory[bot]',
    );
  });
});

describe('configuration, le socle seul (#72)', () => {
  it('factory-live exige l’adresse et le secret du socle', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-live-secrets-'));
    try {
      expect(() => loadConfig({ SECRETS_DIR: dir })).toThrow(/WORKFLOW_CORE_URL/);
      const core = { SECRETS_DIR: dir, WORKFLOW_CORE_URL: 'http://host.docker.internal:8447' };
      expect(() => loadConfig(core)).toThrow(/workflow-core-secret/);

      writeFileSync(join(dir, 'workflow-core-secret'), 'secret-du-socle\n');
      const config = loadConfig(core);
      expect(config.WORKFLOW_CORE_URL).toBe('http://host.docker.internal:8447');
      expect(config.secrets.workflowCoreSecret).toBe('secret-du-socle');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('une variable de l’ancienne lecture encore posée est ignorée : le serveur lit le socle', () => {
    // Whatever its value, the switch no longer exists; nor do the folders of the old reading.
    const retired = {
      LIVE_SOURCE: 'ancienne-lecture',
      FACTORY_REPO: '/factory',
      CLAUDE_PROJECTS: '/claude-projects',
    };
    const config = loadConfig({ ...BASE, ...retired });
    expect(config.WORKFLOW_CORE_URL).toBe('http://host.docker.internal:8447');
    for (const key of Object.keys(retired)) expect(config, key).not.toHaveProperty(key);
    expect(config.secrets).not.toHaveProperty('hookSecret');
  });
});
