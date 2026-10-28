// Refuse tout tiret cadratin (U+2014) dans les fichiers texte suivis par git.
// Règle de rédaction de l'organisation : jamais de tiret cadratin, ni dans le code, ni dans les docs.
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
  '',
]);
const FORBIDDEN = String.fromCharCode(0x2014);

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
for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  content.split('\n').forEach((line, index) => {
    if (line.includes(FORBIDDEN)) offenders.push(`${file}:${index + 1}`);
  });
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

if (offenders.length > 0 || vocabulary.length > 0) {
  if (offenders.length > 0)
    console.error(`Tiret cadratin interdit (U+2014) :\n${offenders.join('\n')}`);
  if (vocabulary.length > 0)
    console.error(`Vocabulaire de l'interface :\n${vocabulary.join('\n')}`);
  process.exit(1);
}
console.log(
  `check-text : ${files.length} fichiers, aucun tiret cadratin, vocabulaire de l'interface respecté.`,
);
