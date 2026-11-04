import type {
  AcceptanceCheck,
  AcceptanceGateRule,
  AcceptanceProof,
  AcceptanceThread,
  AcceptanceView,
} from '@factory-live/contracts';

/**
 * The acceptance of the demo's PRs (« la recette »), as factory-live would read it on GitHub, in the
 * CI reports and in the gate's comment. Everything here imitates content from elsewhere (the issue,
 * the PR, GitHub, the gate, the runners' output): it is written as is, like the titles of the demo's
 * issues. factory-live#18 and its PR #19 are real: their criteria, checks, review threads and
 * captures are those of GitHub.
 */

const GH = 'https://github.com/code-my-life';

/** Stills of cv-site's contact page on main and as each PR makes it: the twins' screens in the demo. */
const TWINS = `${import.meta.env.BASE_URL}demo/twins/cv-site`;

/** The captures of PR #19, base and head, as small pictures for the demo. */
const PR19 = `${import.meta.env.BASE_URL}demo/proofs/factory-live-19`;

function job(repo: string, run: number, id: number): string {
  return `${GH}/${repo}/actions/runs/${run}/job/${id}`;
}

function blob(repo: string, sha: string, path: string, line?: number): string {
  return `${GH}/${repo}/blob/${sha}/${path}${line ? `#L${line}` : ''}`;
}

function check(
  name: string,
  workflow: string | null,
  status: AcceptanceCheck['status'],
  durationMs: number | null,
  url: string,
): AcceptanceCheck {
  return { name, workflow, status, durationMs, url };
}

function rule(
  name: string,
  status: AcceptanceGateRule['status'],
  detail: string,
): AcceptanceGateRule {
  return { rule: name, status, detail };
}

function proof(
  kind: AcceptanceProof['kind'],
  status: AcceptanceProof['status'],
  detail: string,
  url: string,
  extra: Partial<Pick<AcceptanceProof, 'content' | 'before' | 'after'>> = {},
): AcceptanceProof {
  return { kind, status, detail, url, content: null, before: null, after: null, ...extra };
}

function thread(
  author: string,
  severity: string | null,
  title: string,
  resolved: boolean,
  at: string,
  url: string,
): AcceptanceThread {
  return { author, severity, title, resolved, at, url };
}

/**
 * cv-site#47, PR #52: while the gate judges it (the end-to-end tests still run), then once judged.
 * Green everywhere, except one criterion the PR itself says is not proven.
 */
export function contactAcceptance(phase: 'judging' | 'judged', at: string | null): AcceptanceView {
  const repo = 'cv-site';
  const head = '4f2a9c1';
  const base = '8d41c07';
  const pr = `${GH}/${repo}/pull/52`;
  const comment = `${pr}#issuecomment-3497721004`;
  const judged = phase === 'judged';
  const run = 19402231877;
  const unitTest = (line: number) => blob(repo, head, 'api/test/contact.test.ts', line);
  const e2eTest = (line: number) => blob(repo, head, 'e2e/contact.spec.ts', line);
  return {
    pr: 52,
    head,
    base,
    criteria: [
      {
        id: 'C1',
        text: 'Une adresse e-mail invalide est refusée par le serveur, avec une erreur 422 qui nomme le champ.',
        status: 'ok',
        reason: 'proven',
        proof: 'test « rejette un e-mail invalide avec une erreur 422 »',
        url: unitTest(18),
      },
      {
        id: 'C2',
        text: 'Un message de moins de 20 caractères est refusé, avec le nombre de caractères qui manquent.',
        status: 'ok',
        reason: 'proven',
        proof: 'test « refuse un message trop court et dit combien il en manque »',
        url: unitTest(41),
      },
      {
        id: 'C3',
        text: 'Chaque erreur s’affiche sous son champ, le champ porte aria-invalid et le formulaire garde la saisie.',
        status: judged ? 'ok' : 'pending',
        reason: judged ? 'proven' : 'running',
        proof:
          'test « les erreurs du serveur s’affichent sous leurs champs », Chromium et WebKit iPhone',
        url: e2eTest(12),
      },
      {
        id: 'C4',
        text: 'Le résumé des erreurs est annoncé aux lecteurs d’écran dès l’envoi.',
        status: 'nok',
        reason: 'unproven',
        proof: null,
        url: `${pr}#criteres`,
      },
      {
        id: 'C5',
        text: 'Un formulaire valide part comme avant : même confirmation, même délai.',
        status: judged ? 'ok' : 'pending',
        reason: judged ? 'proven' : 'running',
        proof: 'test « un message valide part et affiche la confirmation »',
        url: e2eTest(48),
      },
    ],
    checks: [
      check('Vérifications (Node 24)', 'CI', 'success', 72_000, job(repo, run, 55512340021)),
      check(
        'Bout en bout (Chromium, WebKit)',
        'CI',
        judged ? 'success' : 'pending',
        judged ? 278_000 : null,
        job(repo, run, 55512340022),
      ),
      check(
        'Lighthouse (contact)',
        'CI',
        judged ? 'success' : 'pending',
        judged ? 65_000 : null,
        job(repo, run, 55512340023),
      ),
      check('Conventions', 'Conventions', 'success', 9_000, job(repo, 19402231880, 55512340090)),
      check(
        'Analyze (javascript-typescript)',
        'CodeQL',
        'success',
        107_000,
        job(repo, 19402231884, 55512340101),
      ),
    ],
    gate: {
      status: judged ? 'ok' : 'pending',
      head,
      at,
      url: comment,
      rules: [
        rule('PR', 'ok', 'ouverte par l’App, sur la branche du brief feat/47-validation-contact'),
        rule('Type', 'ok', 'titre, sections et une ligne de preuve par critère'),
        rule('Fraîcheur', 'ok', `à jour avec main (${base})`),
        rule('Version', 'ok', '1.6.0 → 1.7.0, minor'),
        rule('Tests nommés', 'ok', 'les 4 tests de l’issue existent sous leur nom exact'),
        ...(judged
          ? [
              rule(
                'Fail-first',
                'ok',
                `« rejette un e-mail invalide avec une erreur 422 » rouge sur la base ${base}, vert sur la tête`,
              ),
              rule('Couverture du diff', 'ok', '96 % des lignes modifiées (48 sur 50)'),
              rule('Build hors ligne', 'ok', 'npm run build sans réseau, 21 s'),
              rule('CI', 'ok', `5 checks verts sur ${head}`),
              rule('Type', 'info', 'C4 « non prouvé » d’après la PR : à juger par toi'),
            ]
          : [rule('CI', 'info', '2 checks en cours : la gate attend')]),
      ],
    },
    tests: [
      {
        kind: 'unit',
        name: 'Vitest',
        status: 'ok',
        passed: 34,
        failed: 0,
        skipped: 0,
        durationMs: 9_000,
        url: job(repo, run, 55512340021),
        failures: [],
      },
      {
        kind: 'e2e',
        name: 'Chromium',
        status: judged ? 'ok' : 'pending',
        passed: judged ? 12 : 0,
        failed: 0,
        skipped: 0,
        durationMs: judged ? 114_000 : null,
        url: job(repo, run, 55512340022),
        failures: [],
      },
      {
        kind: 'e2e',
        name: 'WebKit iPhone',
        status: judged ? 'ok' : 'pending',
        passed: judged ? 11 : 0,
        failed: 0,
        skipped: judged ? 1 : 0,
        durationMs: judged ? 151_000 : null,
        url: job(repo, run, 55512340022),
        failures: [],
      },
    ],
    proofs: [
      proof(
        'failfirst',
        judged ? 'ok' : 'pending',
        judged
          ? `« rejette un e-mail invalide avec une erreur 422 » rouge sur la base ${base}, vert sur la tête ${head}`
          : 'la gate rejoue le test sur la base et sur la tête',
        comment,
        judged
          ? {
              content: [
                '$ npx vitest run api/test/contact.test.ts -t "rejette un e-mail invalide avec une erreur 422"',
                `== base ${base} : rouge`,
                ' FAIL  api/test/contact.test.ts > contact > rejette un e-mail invalide avec une erreur 422',
                'AssertionError: expected 200 to be 422',
                ' ❯ api/test/contact.test.ts:23:31',
                `== tête ${head} : vert`,
                ' ✓ api/test/contact.test.ts > contact > rejette un e-mail invalide avec une erreur 422 (12 ms)',
                ' Test Files  1 passed (1)',
                '      Tests  1 passed (1)',
              ].join('\n'),
            }
          : {},
      ),
      proof(
        'coverage',
        judged ? 'ok' : 'pending',
        '96 % des lignes modifiées (48 sur 50)',
        comment,
        judged
          ? {
              content: [
                'Couverture des lignes modifiées (lcov) : 48 sur 50, 96 %',
                'api/src/validation/contact.ts   22 / 22   100 %',
                'api/src/routes/contact.ts       26 / 28    93 %   non couvertes : 41, 57',
              ].join('\n'),
            }
          : {},
      ),
      proof(
        'build',
        judged ? 'ok' : 'pending',
        'npm run build sans réseau, 21 s',
        comment,
        judged
          ? {
              content: [
                '$ unshare -rn npm run build',
                `== tête ${head} : code 0, 21 s`,
                'vite v8.3.5 building for production...',
                '✓ 412 modules transformed.',
                'dist/index.html                  1.92 kB',
                'dist/assets/index-3f9a1c.js    148.20 kB │ gzip: 47.11 kB',
                '✓ built in 2.84s',
              ].join('\n'),
            }
          : {},
      ),
      proof(
        'capture',
        judged ? 'ok' : 'pending',
        'Le formulaire envoyé vide, sur iPhone',
        job(repo, run, 55512340022),
        {
          before: `${TWINS}/captures/pr-52-base.png`,
          after: `${TWINS}/captures/pr-52-head.png`,
        },
      ),
    ],
    threads: [],
    reviewRounds: judged ? 1 : 0,
    twins: {
      state: 'ready',
      divergence: null,
      surfaces: [
        {
          id: 'site',
          label: 'Site',
          kind: 'site',
          changed: true,
          base: { sha: base, stream: null, poster: `${TWINS}/captures/pr-52-base.png` },
          head: { sha: head, stream: null, poster: `${TWINS}/captures/pr-52-head.png` },
          differences: judged ? 6 : null,
        },
        {
          id: 'api',
          label: 'API',
          kind: 'api',
          changed: true,
          base: { sha: base, stream: null, poster: null },
          head: { sha: head, stream: null, poster: null },
          differences: null,
        },
      ],
    },
    twinsAbsent: null,
  };
}

/** cv-site#44, PR #50: the gate is red, its end-to-end test fails on the LinkedIn link. */
export function footerAcceptance(at: string): AcceptanceView {
  const repo = 'cv-site';
  const head = 'b7e19d3';
  const base = '8d41c07';
  const pr = `${GH}/${repo}/pull/50`;
  const comment = `${pr}#issuecomment-3497102877`;
  const run = 19401876502;
  const e2eTest = (line: number) => blob(repo, head, 'e2e/footer.spec.ts', line);
  return {
    pr: 50,
    head,
    base,
    criteria: [
      {
        id: 'C1',
        text: 'Le pied de page montre un lien vers GitHub et un lien vers LinkedIn, avec leur nom.',
        status: 'ok',
        reason: 'proven',
        proof: 'test « le pied de page porte les liens GitHub et LinkedIn »',
        url: e2eTest(9),
      },
      {
        id: 'C2',
        text: 'Chaque lien s’ouvre dans un nouvel onglet, avec rel="noopener noreferrer".',
        status: 'nok',
        reason: 'failing',
        proof: 'test « les liens du pied de page ouvrent un onglet sûr », rouge sur Chromium',
        url: e2eTest(27),
      },
      {
        id: 'C3',
        text: 'Les liens gardent une cible tactile de 44 px sur téléphone.',
        status: 'ok',
        reason: 'proven',
        proof: 'test « les liens du pied de page font 44 px sur iPhone »',
        url: e2eTest(41),
      },
    ],
    checks: [
      check('Vérifications (Node 24)', 'CI', 'success', 64_000, job(repo, run, 55498811301)),
      check(
        'Bout en bout (Chromium, WebKit)',
        'CI',
        'failure',
        192_000,
        job(repo, run, 55498811302),
      ),
      check('Lighthouse (contact)', 'CI', 'success', 61_000, job(repo, run, 55498811303)),
      check('Conventions', 'Conventions', 'success', 8_000, job(repo, 19401876510, 55498811390)),
      check(
        'Analyze (javascript-typescript)',
        'CodeQL',
        'success',
        98_000,
        job(repo, 19401876514, 55498811401),
      ),
    ],
    gate: {
      status: 'nok',
      head,
      at,
      url: comment,
      rules: [
        rule('PR', 'ok', 'ouverte par l’App, sur la branche du brief feat/44-liens-sociaux'),
        rule('Type', 'ok', 'titre, sections et une ligne de preuve par critère'),
        rule('Version', 'ok', '1.6.0 → 1.7.0, minor'),
        rule('Tests nommés', 'ok', 'les 3 tests de l’issue existent sous leur nom exact'),
        rule('CI', 'nok', 'Bout en bout (Chromium, WebKit) en échec sur la tête'),
        rule(
          'Fail-first',
          'ok',
          `« le pied de page porte les liens GitHub et LinkedIn » rouge sur la base ${base}, vert sur la tête`,
        ),
        rule('Couverture du diff', 'ok', '100 % des lignes modifiées (14 sur 14)'),
      ],
    },
    tests: [
      {
        kind: 'unit',
        name: 'Vitest',
        status: 'ok',
        passed: 21,
        failed: 0,
        skipped: 0,
        durationMs: 7_000,
        url: job(repo, run, 55498811301),
        failures: [],
      },
      {
        kind: 'e2e',
        name: 'Chromium',
        status: 'nok',
        passed: 9,
        failed: 1,
        skipped: 0,
        durationMs: 88_000,
        url: job(repo, run, 55498811302),
        failures: [
          {
            name: 'les liens du pied de page ouvrent un onglet sûr',
            url: e2eTest(27),
          },
        ],
      },
      {
        kind: 'e2e',
        name: 'WebKit iPhone',
        status: 'ok',
        passed: 10,
        failed: 0,
        skipped: 0,
        durationMs: 97_000,
        url: job(repo, run, 55498811302),
        failures: [],
      },
    ],
    proofs: [
      proof('run', 'nok', 'Bout en bout, Chromium : 1 échec sur 10', job(repo, run, 55498811302), {
        content: [
          '  1) [chromium] › e2e/footer.spec.ts:27:5 › les liens du pied de page ouvrent un onglet sûr',
          '',
          '    Error: expect(locator).toHaveAttribute(expected) failed',
          '',
          "    Locator:  getByRole('link', { name: 'LinkedIn' })",
          '    Expected: "noopener noreferrer"',
          '    Received: ""',
          '',
          '  1 failed',
          '  9 passed (41.2s)',
        ].join('\n'),
      }),
      proof(
        'failfirst',
        'ok',
        `« le pied de page porte les liens GitHub et LinkedIn » rouge sur la base ${base}, vert sur la tête ${head}`,
        comment,
      ),
      proof('coverage', 'ok', '100 % des lignes modifiées (14 sur 14)', comment),
    ],
    threads: [
      thread(
        'code-my-life-factory',
        null,
        'Gate rouge : Bout en bout (Chromium, WebKit) en échec sur la tête',
        false,
        at,
        comment,
      ),
      thread(
        'cddev',
        null,
        'Le lien LinkedIn s’ouvre sans rel="noopener"',
        false,
        at,
        `${pr}#discussion_r4459812230`,
      ),
    ],
    reviewRounds: 2,
    twins: {
      state: 'ready',
      divergence: null,
      surfaces: [
        {
          id: 'site',
          label: 'Site',
          kind: 'site',
          changed: true,
          base: { sha: base, stream: null, poster: `${TWINS}/captures/pr-50-base.png` },
          head: { sha: head, stream: null, poster: `${TWINS}/captures/pr-50-head.png` },
          differences: 1,
        },
      ],
    },
    twinsAbsent: null,
  };
}

/** claude-cockpit#68, PR #74: a maintenance, all green; it changes no screen, its proof is the invariance. */
export function tagsAcceptance(at: string): AcceptanceView {
  const repo = 'claude-cockpit';
  const head = 'c41d8e2';
  const base = '2f90a1b';
  const pr = `${GH}/${repo}/pull/74`;
  const comment = `${pr}#issuecomment-3496650981`;
  const run = 19399120418;
  return {
    pr: 74,
    head,
    base,
    criteria: [
      {
        id: 'C1',
        text: 'Un changement de version sur main pose le tag vX.Y.Z sur le commit fusionné.',
        status: 'ok',
        reason: 'proven',
        proof: 'test « tag posé quand la version change »',
        url: blob(repo, head, 'test/tag-on-version.test.js', 14),
      },
      {
        id: 'C2',
        text: 'Aucun tag quand la version ne change pas.',
        status: 'ok',
        reason: 'proven',
        proof: 'test « aucun tag sans changement de version »',
        url: blob(repo, head, 'test/tag-on-version.test.js', 37),
      },
      {
        id: 'C3',
        text: 'Le workflow n’a que la permission contents: write.',
        status: 'ok',
        reason: 'proven',
        proof: 'test « le workflow ne demande que contents: write »',
        url: blob(repo, head, 'test/workflows.test.js', 52),
      },
    ],
    checks: [
      check('Tests (ubuntu, Node 24)', 'Tests', 'success', 148_000, job(repo, run, 55471200101)),
      check('Tests (windows, Node 24)', 'Tests', 'success', 231_000, job(repo, run, 55471200102)),
      check('Tests (macos, Node 24)', 'Tests', 'success', 176_000, job(repo, run, 55471200103)),
      check('E2E', 'E2E', 'success', 302_000, job(repo, 19399120420, 55471200140)),
      check(
        'build-and-deploy',
        'GitHub Pages',
        'skipped',
        null,
        job(repo, 19399120425, 55471200160),
      ),
    ],
    gate: {
      status: 'ok',
      head,
      at,
      url: comment,
      rules: [
        rule('PR', 'ok', 'ouverte par l’App, sur la branche du brief chore/68-tag-sur-version'),
        rule('Type', 'ok', 'Maintenance : titre et sections du type'),
        rule('Invariance', 'ok', 'aucun test existant modifié ni retiré (52 tests)'),
        rule('Build hors ligne', 'ok', 'npm run build sans réseau, 34 s'),
        rule('CI', 'ok', `4 checks verts, 1 ignoré, sur ${head}`),
      ],
    },
    tests: [
      {
        kind: 'unit',
        name: 'node --test',
        status: 'ok',
        passed: 52,
        failed: 0,
        skipped: 0,
        durationMs: 18_000,
        url: job(repo, run, 55471200101),
        failures: [],
      },
      {
        kind: 'e2e',
        name: 'Electron',
        status: 'ok',
        passed: 26,
        failed: 0,
        skipped: 0,
        durationMs: 244_000,
        url: job(repo, 19399120420, 55471200140),
        failures: [],
      },
    ],
    proofs: [
      proof(
        'invariance',
        'ok',
        'aucun test existant modifié ni retiré : les 52 tests de main passent tels quels',
        comment,
        {
          content: [
            `$ git diff --stat ${base}...${head} -- test/`,
            ' test/tag-on-version.test.js | 61 +++++++++++++++++++++++++',
            ' 1 file changed, 61 insertions(+)',
            'Tests de main modifiés : 0. Tests de main retirés : 0.',
            `$ node --test (tests de main, sur la tête ${head})`,
            '# tests 52',
            '# pass 52',
            '# fail 0',
          ].join('\n'),
        },
      ),
      proof('build', 'ok', 'npm run build sans réseau, 34 s', comment),
    ],
    threads: [],
    reviewRounds: 1,
    twins: null,
    twinsAbsent: 'no_screen',
  };
}

/**
 * factory-live#18, PR #19, as it really went: 104 files, 15 criteria, 12 checks, ten threads of
 * Greptile resolved one by one, six pairs of captures. The gate did not judge it: the PR came from a
 * Claude Code session, not from the factory's agents.
 */
export function graphAcceptance(): AcceptanceView {
  const repo = 'factory-live';
  const head = 'c0c69e3';
  const base = '59291d5';
  const pr = `${GH}/${repo}/pull/19`;
  const run = 41740633513;
  const at = (time: string) => `2026-11-03T${time}Z`;
  const file = (path: string) => blob(repo, head, path);
  const criterion = (id: string, text: string, proofText: string, path: string) => ({
    id,
    text,
    status: 'ok' as const,
    reason: 'proven' as const,
    proof: proofText,
    url: file(path),
  });
  const discussion = (id: number) => `${pr}#discussion_r${id}`;
  const capture = (detail: string, name: string, path: string) =>
    proof('capture', 'ok', detail, file(path), {
      before: `${PR19}/${name}-base.webp`,
      after: `${PR19}/${name}-head.webp`,
    });
  const snapshots = 'e2e/captures.spec.ts-snapshots';
  return {
    pr: 19,
    head,
    base,
    criteria: [
      criterion(
        'C1',
        'Le graphe montre 9 postes, la branche Diagnostic et les Fournisseurs ; chaque issue ouverte ou finie depuis moins de 7 jours apparaît dans une seule boîte, celle de sa station.',
        'tests « place chaque issue dans une seule boîte, celle de sa station » et « chaque issue a sa ligne dans sa station »',
        'apps/web/src/features/line/graph/FactoryGraph.test.tsx',
      ),
      criterion(
        'C2',
        'Une issue à la gate est dans la boîte de la preuve de son type, selon la table de l’Attendu.',
        'tests « une issue Tests passe la gate par la preuve des sabotages » et « chaque type a sa preuve »',
        'apps/server/src/application/issues.test.ts',
      ),
      criterion(
        'C3',
        'La station suit les faits de l’Attendu : gate verte, Ta revue ; approbation, Fusion ; fusion, CI de main ; main verte et déploiement en cours, Déploiement ; main verte sans déploiement, Terminé.',
        'tests « la station suit Ta revue, Fusion, CI de main puis Déploiement » et « sans déploiement, main verte mène à Terminé »',
        'apps/server/src/application/issues.test.ts',
      ),
      criterion(
        'C4',
        'Le trajet compte chaque gate rouge, chaque demande de changements et chaque revert, dans l’ordre des faits.',
        'test « le trajet compte deux gates rouges, une demande de changements et un revert dans l’ordre »',
        'packages/domain/src/journey.test.ts',
      ),
      criterion(
        'C5',
        'Chaque lien a un rond à chacun de ses deux bouts, aucun port n’est partagé par deux liens, et les courbes d’un éventail de la gate ne se croisent pas.',
        'test « chaque lien a ses deux ports, sans port partagé ni courbes croisées »',
        'apps/web/src/features/line/graph/layout.test.ts',
      ),
      criterion(
        'C6',
        'Liens et ronds sont dessinés au-dessus des cartes et du cadre de la gate, aucun texte n’est posé sur un lien, et la légende donne une entrée à chaque sorte de lien.',
        'test « liens et ronds passent au-dessus des cartes et du cadre de la gate »',
        'e2e/line.spec.ts',
      ),
      criterion(
        'C7',
        'Au repos, un lien a l’opacité 0,42 ; seuls les liens actifs s’animent ; au repos, aucun lien n’est rouge.',
        'test « au repos, un lien pâlit à 0,42 sans être rouge »',
        'e2e/line.spec.ts',
      ),
      criterion(
        'C8',
        'Une issue qui change de poste glisse le long des liens qu’elle prend et sa ligne paraît à l’arrivée ; avec la pause ou prefers-reduced-motion, elle change de poste sans trajet.',
        'tests « une issue qui change de poste voyage le long des liens » et « glisse vers sa nouvelle boîte »',
        'apps/web/src/features/line/graph/FactoryGraph.test.tsx',
      ),
      criterion(
        'C9',
        'La recherche « #71 » garde 1 issue sur 9 et pâlit les autres à 0,32 ; chaque filtre (Type, État, Dépôt, Modèle) réduit la liste de la même façon.',
        'tests « la recherche #71 garde une issue sur neuf » et « chaque filtre garde les seules issues qui y répondent »',
        'apps/web/src/features/line/graph/filters.test.ts',
      ),
      criterion(
        'C10',
        'À l’ouverture, à 390 × 844 et à 1440 × 900, le bas du graphe est dans la fenêtre ; deux doigts zooment entre 0,3 et 1,6 ; un doigt fait défiler la page depuis le graphe.',
        'tests « le graphe entier tient dans la fenêtre à l’ouverture » et « deux doigts zooment le graphe »',
        'e2e/line.spec.ts',
      ),
      criterion(
        'C11',
        'La légende est repliée à l’ouverture et s’ouvre au bouton « Légende » ; les boutons de zoom ne recouvrent jamais le graphe.',
        'tests « la légende est repliée à l’ouverture et s’ouvre au bouton »',
        'apps/web/src/features/line/graph/FactoryGraph.test.tsx',
      ),
      criterion(
        'C12',
        'Aucune boîte ne déborde, en particulier Implémentation et Terminé avec plusieurs issues.',
        'test « les blocs Implémentation et Terminé ne débordent pas »',
        'e2e/line.spec.ts',
      ),
      criterion(
        'C13',
        'À moins de 768 px, « T’attend », la recherche et les filtres s’empilent, la recherche occupe toute la largeur et les filtres partent de la gauche.',
        'test « sur téléphone, T’attend, la recherche et les filtres s’empilent »',
        'e2e/line.spec.ts',
      ),
      criterion(
        'C14',
        '/issues/claude-cockpit/68 ouvre la ligne sur cette issue et ses détails dessous ; l’entrée « Issues », « Activité » et « Voie annexe » ont disparu.',
        'tests « un lien vers une issue ouvre la ligne sur elle » et e2e/mobile.spec.ts (4 onglets)',
        'e2e/line.spec.ts',
      ),
      criterion(
        'C15',
        'Une issue finie il y a 6 jours reste dans Terminé, une issue finie il y a 8 jours en sort.',
        'test « une issue finie il y a 6 jours reste dans Terminé, une de 8 jours en sort »',
        'apps/server/src/application/projection.test.ts',
      ),
    ],
    checks: [
      check('Vérifications (Node 24.22.1)', 'CI', 'success', 146_000, job(repo, run, 126280944701)),
      check('Vérifications (Node 26)', 'CI', 'success', 123_000, job(repo, run, 126280945032)),
      check('Image Docker', 'CI', 'success', 43_000, job(repo, run, 126280944752)),
      check(
        'Bout en bout (Chromium, WebKit) et captures',
        'CI',
        'success',
        549_000,
        job(repo, run, 126280944815),
      ),
      check(
        'Site, build et tests (Chromium, WebKit)',
        'Site',
        'success',
        188_000,
        job(repo, 41740633390, 126280944120),
      ),
      check(
        'Publication sur GitHub Pages',
        'Site',
        'skipped',
        null,
        job(repo, 41740633390, 126282326313),
      ),
      check(
        'Branche, titre et texte de PR',
        'Conventions',
        'success',
        7_000,
        job(repo, 41740654995, 126281016701),
      ),
      check(
        'Analyze (javascript-typescript)',
        'CodeQL',
        'success',
        74_000,
        job(repo, 41740627937, 126281933003),
      ),
      check('Analyze (actions)', 'CodeQL', 'success', 43_000, job(repo, 41740627937, 126280932473)),
      check('CodeQL', null, 'success', 3_000, `${GH}/${repo}/runs/126281193683`),
      check('Greptile Review', null, 'success', 150_000, `${GH}/${repo}/runs/126280953960`),
    ],
    gate: {
      status: 'ok',
      head,
      at: at('23:37:40'),
      url: `${pr}/checks`,
      rules: [
        rule(
          'PR',
          'info',
          'hors factory : la PR vient d’une session Claude Code, la gate ne juge que le travail des agents',
        ),
      ],
    },
    tests: [
      {
        kind: 'unit',
        name: 'Vitest',
        status: 'ok',
        passed: 672,
        failed: 0,
        skipped: 0,
        durationMs: 61_000,
        url: job(repo, run, 126280944701),
        failures: [],
      },
      {
        kind: 'e2e',
        name: 'Démo bureau, démo iPhone, live (Chromium)',
        status: 'ok',
        passed: 179,
        failed: 0,
        skipped: 11,
        durationMs: 312_000,
        url: job(repo, run, 126280944815),
        failures: [],
      },
      {
        kind: 'e2e',
        name: 'Site (Chromium, WebKit)',
        status: 'ok',
        passed: 42,
        failed: 0,
        skipped: 0,
        durationMs: 96_000,
        url: job(repo, 41740633390, 126280944120),
        failures: [],
      },
    ],
    proofs: [
      proof('run', 'ok', 'npm run verify:fast', job(repo, run, 126280944701), {
        content: [
          '$ npm run verify:fast',
          'format, ESLint, stylelint de Primer (sans aucune règle désactivée), types, textes, architecture',
          '✔ no dependency violations found (271 modules, 998 dependencies cruised)',
          ' Test Files  71 passed (71)',
          '      Tests  672 passed (672)',
          ' Coverage  packages/domain : lignes 97,4 %, fonctions 93,1 %, branches 86,0 %',
        ].join('\n'),
      }),
      proof(
        'run',
        'ok',
        'Playwright : démo bureau, démo iPhone et live',
        job(repo, run, 126280944815),
        {
          content: [
            '$ npx playwright test --project=demo-bureau --project=demo-iphone --project=live-bureau',
            '  179 passed',
            '  11 skipped (WebKit, et les gestes du téléphone sur le projet bureau)',
            'Audits axe de toutes les routes : 0 violation sur demo-bureau et demo-iphone',
          ].join('\n'),
        },
      ),
      proof('measure', 'ok', 'Mesures sur la démo, à 1440 × 900 et 390 × 844', `${pr}#preuves`, {
        content: [
          'échelle d’ouverture : 0,575 (1440 × 900) et 0,303 (390 × 844)',
          'aucune boîte ne déborde',
          'plans : boîtes 1, liens 2, ports 3',
          'aucun défilement horizontal',
        ].join('\n'),
      }),
      capture(
        'Ligne d’usine, bureau 1440 px',
        'ligne-bureau',
        `${snapshots}/ligne-captures-bureau-linux.png`,
      ),
      capture(
        'Ligne d’usine, iPhone 390 px',
        'ligne-iphone',
        `${snapshots}/ligne-captures-iphone-linux.png`,
      ),
      capture(
        'Issue, bureau 1440 px',
        'issue-bureau',
        `${snapshots}/issue-captures-bureau-linux.png`,
      ),
      capture(
        'Issue, iPhone 390 px',
        'issue-iphone',
        `${snapshots}/issue-captures-iphone-linux.png`,
      ),
      capture(
        'Réglages, bureau 1440 px',
        'reglages-bureau',
        `${snapshots}/reglages-captures-bureau-linux.png`,
      ),
      capture(
        'Réglages, iPhone 390 px',
        'reglages-iphone',
        `${snapshots}/reglages-captures-iphone-linux.png`,
      ),
      proof(
        'unproven',
        'info',
        'WebKit (Safari, iPhone) ne tourne qu’en CI, et les gestes n’ont pas été essayés sur un vrai iPhone.',
        `${pr}#ce-qui-nest-pas-prouv`,
      ),
      proof(
        'unproven',
        'info',
        'Le ressenti des animations (rythme des comètes, course des cartes) se juge sur la démo ; aucun test ne mesure une durée.',
        `${pr}#ce-qui-nest-pas-prouv`,
      ),
      proof(
        'unproven',
        'info',
        'La station Déploiement attend la permission « Deployments » de l’App de la factory ; d’ici là, une issue fusionnée à main verte passe à Terminé.',
        `${pr}#ce-qui-nest-pas-prouv`,
      ),
      proof(
        'unproven',
        'info',
        'Les bornes du zoom (0,3 et 1,6) ne sont pas vérifiées au geste.',
        `${pr}#ce-qui-nest-pas-prouv`,
      ),
    ],
    threads: [
      thread(
        'greptile-apps',
        'P1',
        'Saved snapshots crash the graph',
        true,
        at('22:33:52'),
        discussion(4461256893),
      ),
      thread(
        'greptile-apps',
        'P1',
        'Deployment reads stop GitHub updates',
        true,
        at('22:33:52'),
        discussion(4461256906),
      ),
      thread(
        'greptile-apps',
        'P1',
        'Review rows can stay invisible',
        true,
        at('22:33:52'),
        discussion(4461256918),
      ),
      thread(
        'greptile-apps',
        'P2',
        'Implementation feeds always look idle',
        true,
        at('22:33:52'),
        discussion(4461256934),
      ),
      thread(
        'greptile-apps',
        'P2',
        'Transcript stays on previous card',
        true,
        at('22:33:52'),
        discussion(4461256944),
      ),
      thread(
        'greptile-apps',
        'P2',
        'Live graph outgrows opening fit',
        true,
        at('22:33:52'),
        discussion(4461256953),
      ),
      thread(
        'greptile-apps',
        'P2',
        'Typed rows lose state names',
        true,
        at('22:33:52'),
        discussion(4461256962),
      ),
      thread(
        'greptile-apps',
        'P2',
        'State effects exceed motion limit',
        true,
        at('22:33:52'),
        discussion(4461256969),
      ),
      thread(
        'greptile-apps',
        'P2',
        'Search misses the shown model',
        true,
        at('22:50:50'),
        discussion(4461400802),
      ),
      thread(
        'greptile-apps',
        'P1',
        'Unfinished deployments appear done',
        true,
        at('23:12:53'),
        discussion(4461580465),
      ),
    ],
    reviewRounds: 17,
    twins: {
      state: 'ready',
      divergence:
        'Ton clic sur « Légende » n’a pas d’équivalent dans l’avant : la ligne d’usine de la base n’a pas de légende.',
      surfaces: [
        {
          id: 'app',
          label: 'App',
          kind: 'web',
          changed: true,
          base: { sha: base, stream: null, poster: `${PR19}/ligne-bureau-base.webp` },
          head: { sha: head, stream: null, poster: `${PR19}/ligne-bureau-head.webp` },
          differences: 14,
        },
        {
          id: 'api',
          label: 'Serveur',
          kind: 'api',
          changed: true,
          base: { sha: base, stream: null, poster: null },
          head: { sha: head, stream: null, poster: null },
          differences: null,
        },
        {
          id: 'site',
          label: 'Site',
          kind: 'site',
          changed: true,
          base: { sha: base, stream: null, poster: null },
          head: { sha: head, stream: null, poster: null },
          differences: null,
        },
        {
          id: 'docs',
          label: 'Doc',
          kind: 'docs',
          changed: true,
          base: { sha: base, stream: null, poster: null },
          head: { sha: head, stream: null, poster: null },
          differences: null,
        },
      ],
    },
    twinsAbsent: null,
  };
}
