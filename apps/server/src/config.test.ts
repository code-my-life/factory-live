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
