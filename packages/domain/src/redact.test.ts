import { describe, expect, it } from 'vitest';
import { redactSecrets } from './redact.ts';

const MASK = '[secret masqué]';

describe('redactSecrets', () => {
  it.each([
    ['jeton GitHub classique', 'ghp_' + 'a'.repeat(36)],
    ['jeton d’installation', 'ghs_' + 'B1'.repeat(18)],
    ['jeton fine-grained', 'github_pat_11ABCDEFG0_' + 'x'.repeat(59)],
    ['clé OpenAI', 'sk-proj-' + 'q'.repeat(40)],
    ['clé Anthropic', 'sk-ant-api03-' + 'z'.repeat(40)],
    ['clé NVIDIA', 'nvapi-' + 'k'.repeat(40)],
    ['clé freellmapi', 'freellmapi-' + 'f'.repeat(32)],
    ['clé AWS', 'AKIA' + 'ABCDEFGHIJKLMNOP'],
  ])('masque un %s', (_label, secret) => {
    const text = `avant ${secret} après`;
    expect(redactSecrets(text)).toBe(`avant ${MASK} après`);
  });

  it('masque un Bearer en gardant le mot', () => {
    expect(redactSecrets('Authorization: Bearer abcdefghijklmnop0123456789')).toBe(
      `Authorization: Bearer ${MASK}`,
    );
  });

  it('masque la valeur des variables secrètes, avec ou sans guillemets', () => {
    expect(
      redactSecrets('GITHUB_TOKEN=abc123 FACTORY_LIVE_HOOK_SECRET="x y" DB_PASSWORD=\'p\''),
    ).toBe(`GITHUB_TOKEN=${MASK} FACTORY_LIVE_HOOK_SECRET=${MASK} DB_PASSWORD=${MASK}`);
  });

  it('masque une clé privée entière', () => {
    const key =
      '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----';
    expect(redactSecrets(`clé :\n${key}\nfin`)).toBe(`clé :\n${MASK}\nfin`);
  });

  it('laisse le texte ordinaire intact', () => {
    const text = 'sk-learn, ghp_court, task t_5e21c0d9, model claude-opus-5-5, TOKEN_COUNT: 12';
    expect(redactSecrets(text)).toBe(text);
  });
});
