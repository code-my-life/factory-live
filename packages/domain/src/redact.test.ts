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
    ['jeton de bot Telegram', '123456789:' + 'AAH'.repeat(11) + 'xy'],
    ['jeton Hugging Face', 'hf_' + 'h'.repeat(34)],
    ['jeton Slack', 'xoxb-' + '1'.repeat(12) + '-' + 'abcdef'.repeat(4)],
    ['clé Google', 'AIza' + 'G'.repeat(35)],
    ['JWT', 'eyJhbGciOiJIUzI1NiJ9.' + 'eyJzdWIiOiIxMjMifQ' + '.' + 's'.repeat(20)],
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

  it('masque le jeton d’un bot Telegram jusque dans l’URL de son API', () => {
    const token = '123456789:' + 'AAH'.repeat(11) + 'xy';
    expect(redactSecrets(`curl https://api.telegram.org/bot${token}/sendMessage`)).toBe(
      `curl https://api.telegram.org/bot${MASK}/sendMessage`,
    );
  });

  it('masque un en-tête Authorization en token ou en Basic, en gardant le schéma', () => {
    expect(redactSecrets('-H "Authorization: token abcdefghijklmnop0123"')).toBe(
      `-H "Authorization: token ${MASK}"`,
    );
    expect(redactSecrets('authorization: Basic dXNlcjpwYXNzd29yZA==')).toBe(
      `authorization: Basic ${MASK}`,
    );
  });

  it('masque le mot de passe d’une URL, en gardant l’utilisateur et l’hôte', () => {
    expect(redactSecrets('git clone https://alice:hunter2-long@github.com/x.git')).toBe(
      `git clone https://alice:${MASK}@github.com/x.git`,
    );
  });

  it('masque les clés secrètes écrites en minuscules, en JSON comme en YAML', () => {
    expect(
      redactSecrets('{"api_key": "abc123def", "client_secret": "s3cr3t-value", "user": "alice"}'),
    ).toBe(`{"api_key": ${MASK}, "client_secret": ${MASK}, "user": "alice"}`);
    expect(redactSecrets('password: correct-horse\naccess_token=abcdef123456')).toBe(
      `password: ${MASK}\naccess_token=${MASK}`,
    );
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

  it('laisse intacts les compteurs, le code et les adresses sans mot de passe', () => {
    const text = [
      'max_tokens: 4096, input_tokens: 1200, token: 12',
      'const token = await getToken();',
      'http://localhost:8446/api/snapshot, git@github.com:code-my-life/factory-live.git',
      'le token est expiré, relance la connexion',
    ].join('\n');
    expect(redactSecrets(text)).toBe(text);
  });
});
