// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import primerReact from 'eslint-plugin-primer-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const WRITE_FUNCTIONS = [
  'writeFile',
  'writeFileSync',
  'appendFile',
  'appendFileSync',
  'rm',
  'rmSync',
  'unlink',
  'unlinkSync',
  'mkdir',
  'mkdirSync',
  'rename',
  'renameSync',
  'copyFile',
  'copyFileSync',
  'truncate',
  'truncateSync',
];
const READ_ONLY_MESSAGE =
  'Les adaptateurs Hermès lisent seulement : aucune écriture dans ~/.hermes.';

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/dist-e2e/**',
    'playwright-report/**',
    'test-results/**',
    'graphify-out/**',
    '.hermes/**',
    '**/coverage/**',
    '**/node_modules/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          defaultProject: 'tsconfig.config.json',
          allowDefaultProject: [
            '*.js',
            'vitest.config.ts',
            'playwright.config.ts',
            'scripts/*.mjs',
            'apps/web/scripts/*.mjs',
            'types/*.d.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
    // Règles officielles de Primer React : composants, accessibilité, CSS modules, jetons de couleur.
    plugins: { 'primer-react': primerReact },
    rules: {
      ...primerReact.configs.recommended.rules,
      'primer-react/no-wildcard-imports': 'error',
      'primer-react/no-deprecated-octicon': 'error',
      'primer-react/spread-props-first': 'error',
      'primer-react/enforce-css-module-default-import': 'error',
      'primer-react/a11y-link-in-text-block': 'error',
    },
  },
  {
    files: ['apps/server/src/adapters/hermes/**/*.ts'],
    // Les tests préparent leurs bases dans un dossier temporaire, jamais dans ~/.hermes.
    ignores: ['apps/server/src/adapters/hermes/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'node:fs', importNames: WRITE_FUNCTIONS, message: READ_ONLY_MESSAGE },
            { name: 'node:fs/promises', importNames: WRITE_FUNCTIONS, message: READ_ONLY_MESSAGE },
          ],
        },
      ],
    },
  },
]);
