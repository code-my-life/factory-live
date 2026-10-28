// Transforme le build de démo en page publiable en artifact : l'hôte fournit déjà doctype, html, head
// et body, la page ne garde que son titre, ses feuilles de style, la racine et ses scripts.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2];
if (!outDir) throw new Error('Usage : node scripts/artifact-page.mjs <dossier du build>');
const html = readFileSync(join(outDir, 'index.html'), 'utf8');
const pick = (pattern) => [...html.matchAll(pattern)].map((match) => match[0]);
const styles = pick(/<link rel="stylesheet"[^>]*>/g);
const scripts = pick(/<script type="module"[^>]*><\/script>/g);
if (styles.length === 0 || scripts.length === 0)
  throw new Error('Build inattendu : feuille de style ou script absent');
const page = [
  '<title>factory-live</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  ...styles,
  '<div id="root"></div>',
  ...scripts,
  '',
].join('\n');
writeFileSync(join(outDir, 'factory-live.html'), page);

// micromark écrit U+FFFD en clair dans des littéraux ; l'hôte des artifacts refuse ce caractère.
// La séquence d'échappement est équivalente dans une chaîne, un gabarit ou une expression régulière.
const REPLACEMENT = String.fromCharCode(0xfffd);
for (const file of readdirSync(join(outDir, 'assets')).filter((name) => name.endsWith('.js'))) {
  const path = join(outDir, 'assets', file);
  const source = readFileSync(path, 'utf8');
  if (source.includes(REPLACEMENT)) writeFileSync(path, source.replaceAll(REPLACEMENT, '\\uFFFD'));
}
console.log(`Page artifact écrite : ${join(outDir, 'factory-live.html')}`);
