/**
 * Règles d'architecture (clean architecture), vérifiées en CI par `npm run check:arch`.
 * Le domaine ne dépend de rien ; l'application ne connaît que le domaine, les contrats et ses ports ;
 * le front ne connaît que les contrats.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Aucune dépendance circulaire.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment: 'Le domaine ne dépend de rien : ni paquet npm, ni Node, ni autre espace de travail.',
      from: { path: '^packages/domain/src' },
      to: { pathNot: '^packages/domain/src' },
    },
    {
      name: 'contracts-only-zod',
      severity: 'error',
      comment: 'Les contrats ne dépendent que de zod.',
      from: { path: '^packages/contracts/src' },
      to: { pathNot: ['^packages/contracts/src', 'node_modules/zod'] },
    },
    {
      name: 'web-knows-only-contracts',
      severity: 'error',
      comment: 'Le front ne connaît ni le domaine ni le serveur, seulement les contrats de l’API.',
      from: { path: '^apps/web/src' },
      to: { path: ['^packages/domain', '^apps/server'] },
    },
    {
      name: 'application-knows-no-adapter',
      severity: 'error',
      comment:
        'Les cas d’usage ne connaissent que des ports, jamais un adaptateur ni un framework.',
      from: { path: '^apps/server/src/application' },
      to: {
        path: [
          '^apps/server/src/(adapters|http|infrastructure)',
          'node_modules/(hono|@hono|pino|web-push)',
        ],
      },
    },
    {
      name: 'no-test-code-in-production',
      severity: 'error',
      from: { pathNot: '\\.test\\.tsx?$' },
      to: { path: '\\.test\\.tsx?$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['dist', '\\.css$'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['source', 'import', 'types', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.mjs'],
    },
  },
};
