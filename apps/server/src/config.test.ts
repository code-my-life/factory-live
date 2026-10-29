import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

/** Aucun secret réel n'est lu par ces tests : le dossier des secrets n'existe pas. */
const BASE = { SECRETS_DIR: '/nonexistent/factory-live-secrets' };

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
