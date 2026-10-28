// Le plugin ESLint de Primer est publié sans types : juste ce qu'en lit eslint.config.js.
declare module 'eslint-plugin-primer-react' {
  import type { ESLint, Linter } from 'eslint';

  const plugin: ESLint.Plugin & { configs: { recommended: { rules: Linter.RulesRecord } } };
  export default plugin;
}
