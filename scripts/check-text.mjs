// Refuse tout tiret cadratin (U+2014) dans les fichiers texte suivis par git.
// Règle de rédaction de l'organisation : jamais de tiret cadratin, ni dans le code, ni dans les docs.
// Refuse aussi les valeurs propres à ce PC (nom tailnet, login Tailscale) : elles vivent dans
// docker/.env, jamais dans le dépôt ; la doc, les tests et la démo n'emploient que l'exemple fictif.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.html',
  '.css',
  '.svg',
  '.txt',
  '.example',
  '',
]);
const FORBIDDEN = String.fromCharCode(0x2014);

/** Exemples fictifs admis : le gabarit `<machine>.<tailnet>.ts.net` ne ressemble à aucun nom réel. */
const EXAMPLE_TAILNET_HOSTS = new Set(['machine.tailnet.ts.net']);
const EXAMPLE_TAILSCALE_LOGINS = new Set(['alice@github', 'intrus@github']);
const TAILNET_HOST = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.ts\.net\b/gi;
const TAILSCALE_LOGIN = /\b[\w.-]+@github(?![\w.-])/g;
/** Dossier personnel : seul l'exemple `/home/user`, jamais le nom d'un vrai compte. */
const HOME_DIR = /\/home\/[a-z_][\w-]*/g;

const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  {
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter((file) => file && TEXT_EXTENSIONS.has(extname(file)));

const offenders = [];
const infrastructure = [];
for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  content.split('\n').forEach((line, index) => {
    if (line.includes(FORBIDDEN)) offenders.push(`${file}:${index + 1}`);
    // Seuls le lieu et la nature sont imprimés : la valeur réelle ne repart pas dans les journaux.
    for (const [host] of line.matchAll(TAILNET_HOST))
      if (!EXAMPLE_TAILNET_HOSTS.has(host.toLowerCase()))
        infrastructure.push(`${file}:${index + 1} (nom tailnet)`);
    for (const [login] of line.matchAll(TAILSCALE_LOGIN))
      if (!EXAMPLE_TAILSCALE_LOGINS.has(login))
        infrastructure.push(`${file}:${index + 1} (login Tailscale)`);
    for (const [home] of line.matchAll(HOME_DIR))
      if (home !== '/home/user') infrastructure.push(`${file}:${index + 1} (dossier personnel)`);
  });
}

// Workflows GitHub Actions : des permissions en lecture par défaut, en tête de fichier ; un job qui
// a besoin de plus (Pages : pages et id-token en écriture) le déclare lui-même.
const workflows = [];
for (const file of files.filter((name) => /^\.github\/workflows\/.+\.ya?ml$/.test(name))) {
  if (!/^permissions:\s*\n\s+contents: read\s*$/m.test(readFileSync(file, 'utf8')))
    workflows.push(`${file} (permissions: contents: read attendu en tête)`);
}

// Vocabulaire de l'interface : un concept, un mot (AGENTS.md). Un profil Hermès s'appelle « agent »
// à l'écran ; on cherche hors commentaires dans le code de la PWA et dans les textes du serveur.
const GLOSSARY = [{ pattern: /\bprofils?\b/i, word: 'agent' }];
const UI_SOURCES = /^apps\/(web\/src|server\/src\/application)\/.*\.tsx?$/;
const vocabulary = [];
for (const file of files.filter((name) => UI_SOURCES.test(name) && !/\.test\.tsx?$/.test(name))) {
  const code = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
  code.split('\n').forEach((line, index) => {
    for (const rule of GLOSSARY) {
      if (rule.pattern.test(line))
        vocabulary.push(`${file}:${index + 1} (écrire « ${rule.word} »)`);
    }
  });
}

// Les pages publiques (README, site) : le même vocabulaire que l'app. Le nom d'hôte de tailnet réel y
// est déjà refusé plus haut, comme partout ; les exemples s'écrivent <machine>.<tailnet>.ts.net.
const PUBLIC = /^(README(\.fr)?\.md|site\/src\/.*\.(mjs|js|css|html))$/;
const PUBLIC_RULES = [{ pattern: /\bprofile?s?\b/i, message: 'écrire « agent »' }];
for (const file of files.filter((name) => PUBLIC.test(name))) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      for (const rule of PUBLIC_RULES) {
        if (rule.pattern.test(line)) vocabulary.push(`${file}:${index + 1} (${rule.message})`);
      }
    });
}

if (
  offenders.length > 0 ||
  vocabulary.length > 0 ||
  infrastructure.length > 0 ||
  workflows.length > 0
) {
  if (workflows.length > 0)
    console.error(`Workflow sans permissions par défaut :\n${workflows.join('\n')}`);
  if (offenders.length > 0)
    console.error(`Tiret cadratin interdit (U+2014) :\n${offenders.join('\n')}`);
  if (infrastructure.length > 0)
    console.error(
      `Valeur propre à ce PC (à mettre dans docker/.env, exemple fictif ailleurs) :\n${infrastructure.join('\n')}`,
    );
  if (vocabulary.length > 0)
    console.error(`Vocabulaire et pages publiques :\n${vocabulary.join('\n')}`);
  process.exit(1);
}
console.log(
  `check-text : ${files.length} fichiers, aucun tiret cadratin, vocabulaire de l'interface et des pages publiques respecté, aucune valeur propre à ce PC, workflows en lecture par défaut.`,
);
