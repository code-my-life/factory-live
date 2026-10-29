/**
 * Masque les secrets avant stockage et affichage : jetons GitHub et autres clés d'API, jetons de bot
 * Telegram, JWT, en-têtes Authorization, mots de passe d'URL, clés privées, `VARIABLE_TOKEN=…`, et
 * clés secrètes écrites en minuscules (JSON, YAML, `clé=valeur`).
 */
const MASK = '[secret masqué]';

/** Clés dont la valeur est un secret, quelle que soit la casse : `api_key`, `client_secret`, `password`… */
const SECRET_KEYS = [
  'api[_-]?key',
  'access[_-]?token',
  'refresh[_-]?token',
  'auth[_-]?token',
  'id[_-]?token',
  'client[_-]?secret',
  'secret[_-]?key',
  'private[_-]?key',
  'password',
  'passwd',
  'secret',
  'token',
].join('|');

const PATTERNS: readonly [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, MASK],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, MASK],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, MASK],
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/g, MASK],
  [/\bnvapi-[A-Za-z0-9_-]{20,}/g, MASK],
  [/\bfreellmapi-[A-Za-z0-9_-]{16,}/g, MASK],
  [/\bAKIA[0-9A-Z]{16}\b/g, MASK],
  [/\bhf_[A-Za-z0-9]{30,}\b/g, MASK],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, MASK],
  [/\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g, MASK],
  // Jeton de bot Telegram (`<id>:<35 caractères>`), même collé à `bot` dans l'URL de son API.
  [/\d{8,10}:[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])/g, MASK],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, MASK],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, `$1${MASK}`],
  [/(\bAuthorization:\s*(?:token|basic)\s+)[A-Za-z0-9._~+/=-]{8,}/gi, `$1${MASK}`],
  // Mot de passe d'une URL (`https://utilisateur:motdepasse@hôte`) : utilisateur et hôte restent lisibles.
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:)[^/\s@]+@/gi, `$1${MASK}@`],
  [
    /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY))=("[^"]*"|'[^']*'|[^\s'"]+)/g,
    `$1=${MASK}`,
  ],
  // Clé secrète en minuscules : valeur entre guillemets, ou d'au moins 6 caractères qui n'appelle rien
  // (`token = getToken()` reste lisible, comme les compteurs `max_tokens: 4096`).
  [
    new RegExp(
      `((?:^|[^\\w-])["']?(?:${SECRET_KEYS})["']?\\s*[:=]\\s*)("[^"\\n]+"|'[^'\\n]+'|[A-Za-z0-9._~+/=-]{6,}(?![\\w(]))`,
      'gim',
    ),
    `$1${MASK}`,
  ],
];

export function redactSecrets(text: string): string {
  return PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text,
  );
}
