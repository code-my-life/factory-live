// Octicons (les icônes de Primer, celles de l'app) rendues en SVG au build : aucune police d'icônes,
// aucun script. Le site n'en garde que le dessin, décoratif (aria-hidden), la couleur venant du texte.
import * as Octicons from '@primer/octicons-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * @param {string} name nom du composant Octicon, par exemple `WorkflowIcon`
 * @param {number} [size] 16 ou 24 (les deux dessins d'Octicons)
 */
export function icon(name, size = 16) {
  const component = /** @type {Record<string, unknown>} */ (Octicons)[name];
  if (!component) throw new Error(`Octicon inconnue : ${name}`);
  const svg = renderToStaticMarkup(
    createElement(/** @type {import('react').ElementType} */ (component), { size }),
  );
  return svg
    .replace(/ data-component="Octicon"/, '')
    .replace(/ display="inline-block" overflow="visible" style="[^"]*"/, '')
    .replace(/ class="octicon /, ' class="icon octicon ');
}

/** Le logo de factory-live (celui de l'app et de son icône) : quatre arrêts reliés. */
export function logo(className = 'logo') {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="4" cy="12" r="2.5"/><circle cx="12" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><circle cx="20" cy="12" r="2.5"/><path d="M6.2 11 9.8 7.2M6.2 13l3.6 3.8M14.2 7.2l3.6 3.8M14.2 16.8l3.6-3.8" fill="none" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}
