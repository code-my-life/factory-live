/** Masque les secrets avant stockage et affichage : jetons GitHub, clés d'API, Bearer, clés privées, VARIABLE_TOKEN=… */
const MASK = '[secret masqué]';

const PATTERNS: readonly [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, MASK],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, MASK],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, MASK],
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/g, MASK],
  [/\bnvapi-[A-Za-z0-9_-]{20,}/g, MASK],
  [/\bfreellmapi-[A-Za-z0-9_-]{16,}/g, MASK],
  [/\bAKIA[0-9A-Z]{16}\b/g, MASK],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, `$1${MASK}`],
  [
    /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY))=("[^"]*"|'[^']*'|[^\s'"]+)/g,
    `$1=${MASK}`,
  ],
];

export function redactSecrets(text: string): string {
  return PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text,
  );
}
