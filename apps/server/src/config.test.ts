import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

/**
 * No real secret is read by these tests: the secrets folder does not exist. Hermes' side is named: since #68,
 * without LIVE_SOURCE, factory-live reads the core and requires its address and its secret.
 */
const BASE = { SECRETS_DIR: '/nonexistent/factory-live-secrets', LIVE_SOURCE: 'hermes' };

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

describe('configuration, fuseau du journal d’Hermès', () => {
  it('Paris par défaut, un autre fuseau IANA si demandé, et rien d’inconnu', () => {
    expect(loadConfig(BASE).HERMES_TZ).toBe('Europe/Paris');
    expect(loadConfig({ ...BASE, HERMES_TZ: 'America/Montreal' }).HERMES_TZ).toBe(
      'America/Montreal',
    );
    expect(() => loadConfig({ ...BASE, HERMES_TZ: 'Mars/Olympus' })).toThrow();
  });
});

describe('configuration, source de la lecture (interrupteur LIVE_SOURCE, #57)', () => {
  it('la source du socle exige son adresse et son secret', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-live-secrets-'));
    try {
      // Hermes, named: nothing about the core is needed.
      expect(loadConfig({ SECRETS_DIR: dir, LIVE_SOURCE: 'hermes' }).LIVE_SOURCE).toBe('hermes');

      // An unknown value stops the start, naming it.
      expect(() => loadConfig({ SECRETS_DIR: dir, LIVE_SOURCE: 'socle' })).toThrow(/LIVE_SOURCE/);

      // The core's side without its address, then without its secret.
      expect(() => loadConfig({ SECRETS_DIR: dir, LIVE_SOURCE: 'workflow-core' })).toThrow(
        /WORKFLOW_CORE_URL/,
      );
      const core = {
        SECRETS_DIR: dir,
        LIVE_SOURCE: 'workflow-core',
        WORKFLOW_CORE_URL: 'http://host.docker.internal:8447',
      };
      expect(() => loadConfig(core)).toThrow(/workflow-core-secret/);

      writeFileSync(join(dir, 'workflow-core-secret'), 'secret-du-socle\n');
      const config = loadConfig(core);
      expect(config.LIVE_SOURCE).toBe('workflow-core');
      expect(config.WORKFLOW_CORE_URL).toBe('http://host.docker.internal:8447');
      expect(config.secrets.workflowCoreSecret).toBe('secret-du-socle');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('configuration, le socle par défaut (#68)', () => {
  const core = (dir: string) => ({
    SECRETS_DIR: dir,
    WORKFLOW_CORE_URL: 'http://host.docker.internal:8447',
  });

  it('sans LIVE_SOURCE, factory-live lit le socle', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-live-secrets-'));
    try {
      writeFileSync(join(dir, 'workflow-core-secret'), 'secret-du-socle');
      expect(loadConfig(core(dir)).LIVE_SOURCE).toBe('workflow-core');
      // An empty value, as compose passes an unset variable without its default, is the default too.
      expect(loadConfig({ ...core(dir), LIVE_SOURCE: undefined }).LIVE_SOURCE).toBe(
        'workflow-core',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('LIVE_SOURCE=hermes ramène la lecture d’Hermès', () => {
    // The way back: Hermes again, with nothing of the core needed (no address, no secret).
    const config = loadConfig({
      SECRETS_DIR: '/nonexistent/factory-live-secrets',
      LIVE_SOURCE: 'hermes',
    });
    expect(config.LIVE_SOURCE).toBe('hermes');
    expect(config.WORKFLOW_CORE_URL).toBeNull();
  });

  it('la source par défaut exige l’adresse et le secret du socle', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-live-secrets-'));
    try {
      expect(() => loadConfig({ SECRETS_DIR: dir })).toThrow(/WORKFLOW_CORE_URL/);
      expect(() => loadConfig(core(dir))).toThrow(/workflow-core-secret/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
