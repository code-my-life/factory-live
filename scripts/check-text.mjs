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

if (offenders.length > 0) {
  console.error(`Tiret cadratin interdit (U+2014) :\n${offenders.join('\n')}`);
  process.exit(1);
}
console.log(`check-text : ${files.length} fichiers, aucun tiret cadratin.`);
