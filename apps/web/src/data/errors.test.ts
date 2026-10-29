import type { ApiErrorCode } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en.ts';
import { fr } from '../i18n/fr.ts';
import { ActionError, describeError, refusal } from './errors.ts';

const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('describeError', () => {
  it('écrit le refus de l’API dans la langue de l’interface, d’après son code', async () => {
    const refused = await refusal(
      response(503, { error: 'Connecte-toi à GitHub…', code: 'github_login_required' }),
      'unblock',
    );
    expect(describeError(refused, fr)).toMatch(/^Connecte-toi à GitHub dans factory-live/);
    expect(describeError(refused, en)).toBe(
      'Sign in to GitHub in factory-live (Settings) to unblock from the app',
    );
  });

  it('sans code connu, dit ce qui a échoué et le statut HTTP', async () => {
    const refused = await refusal(response(502, { error: 'Conteneur en redémarrage' }), 'pushTest');
    expect(describeError(refused, fr)).toBe('Test refusé par factory-live (HTTP 502)');
    expect(describeError(refused, en)).toBe('Test refused by factory-live (HTTP 502)');
    const newer = new ActionError('logout', 409, 'code_de_demain' as ApiErrorCode);
    expect(describeError(newer, en)).toBe('Sign-out refused (HTTP 409)');
  });

  it('sans réponse du serveur, dit seulement ce qui a échoué ; une autre erreur garde son message', () => {
    expect(describeError(new ActionError('pushNotAllowed'), en)).toBe(
      'Notifications not allowed yet',
    );
    expect(describeError(new Error('réseau coupé'), en)).toBe('réseau coupé');
    expect(describeError('texte brut', fr)).toBe('texte brut');
  });
});
