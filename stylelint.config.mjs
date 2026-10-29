// Règles officielles de Primer pour les CSS : jetons de couleur, d'espacement, de typographie et de
// mouvement au lieu de valeurs brutes (la même vérification que l'outil lint_css du MCP Primer).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const primitives = (path) => require.resolve(`@primer/primitives/dist/css/${path}`);

export default {
  extends: ['@primer/stylelint-config'],
  overrides: [
    {
      // Remise à zéro globale et rendu du Markdown (contenu sans classes) : seuls les éléments sont ciblables.
      files: [
        'apps/web/src/styles/global.css',
        'apps/web/src/ui/Markdown.module.css',
        'site/src/reset.css',
      ],
      rules: { 'selector-max-type': null, 'selector-no-qualifying-type': null },
    },
  ],
  rules: {
    // Liste de Primer, plus les jetons de mouvement (absents de sa liste) et nos variables de mise en page.
    'csstools/value-no-unknown-custom-properties': [
      true,
      {
        severity: 'error',
        importFrom: [
          'functional/size/size-coarse.css',
          'functional/size/border.css',
          'functional/size/radius.css',
          'functional/size/size.css',
          'functional/size/size-fine.css',
          'functional/size/breakpoints.css',
          'functional/size/viewport.css',
          'functional/themes/light.css',
          'functional/typography/typography.css',
          'functional/motion/motion.css',
          'base/size/size.css',
          'base/typography/typography.css',
          'base/motion/motion.css',
        ]
          .map(primitives)
          .concat(['apps/web/src/styles/tokens.css']),
      },
    ],
  },
};
