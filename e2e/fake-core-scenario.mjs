// The scenario of the fake workflow-core of the « live » e2e (#67): what the core serves, written by hand
// in its format (the JSON Schema copied in packages/contracts/src/workflow-core/schema/ checks every answer).
//
// The factory's code line has two issues of cv-site:
// - cv-site#52, at implementation: its brief done, its impl run by `coder`, who runs `npm test` now; its
//   run names PR factory-live#24, whose twins and gate proofs the core publishes as declared data;
// - cv-site#49, blocked: its impl waits for a decision (needs_input), with its intervention and diagnosis.
// A generic workflow, `essai`, has two items. After a `reset` (`AFTER`), cv-site#52 is at the gate and
// cv-site#49 has gone.
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

/** The secret of the fake core: the fake core checks it, factory-live's server sends it (live-server.mjs). */
export const SECRET = process.env.FAKE_CORE_SECRET ?? 'secret-du-socle-des-e2e';
/** The card of cv-site#49, blocked: its intervention and its diagnosis exist while the board holds it. */
export const BLOCKED_CARD = 't_1a9f0049';

/** The PR of cv-site#52 and the commit of its head, as the fake GitHub serves them. */
// factory-live#24, whose real answers of GitHub are kept in fixtures/github-acceptance/.
export const PR = {
  repo: 'factory-live',
  number: 24,
  head: '9a72096265a97aab5223e2e1d77bf48411a8c962',
  base: 'c9fa041a51e2d8aa5c1b0d8e3b1f1e0b2a7d6c5e',
};
export const PR_URL = `https://github.com/code-my-life/${PR.repo}/pull/${PR.number}`;
/**
 * The intervention of cv-site#49: its id names the event of its block, `generation`, a new one at each
 * reset of the fake core, so that a test that unblocks it finds it open again (one post per intervention).
 */
export const interventionId = (generation) => `needs_input:${BLOCKED_CARD}:${generation}`;
export const QUESTION = 'Quelle base de données ?\nPostgreSQL ou SQLite ?';

/** A card of the core with every field, the empty ones by default. */
function card(fields) {
  return {
    body: null,
    assignee: null,
    started_at: null,
    completed_at: null,
    block_kind: null,
    idempotency_key: null,
    workspace_path: null,
    current_run_id: null,
    last_heartbeat_at: null,
    model_override: null,
    provider_override: null,
    skills: [],
    runs: [],
    parents: [],
    children: [],
    comments: [],
    events: [],
    ...fields,
  };
}

function run(id, profile, status, outcome, startedAt, endedAt, metadata = {}) {
  return {
    id,
    profile,
    status,
    outcome,
    started_at: startedAt,
    ended_at: endedAt,
    summary: null,
    metadata,
  };
}

/** The code line's items at `now` (Unix seconds); `after`: the state the `reset` brings. */
export function factoryItems(now, after = false, generation = 1) {
  const items = [
    card({
      id: 't_b1ef0052',
      title: 'brief cv-site#52 : Pied de page : liens vers les réseaux',
      status: 'done',
      assignee: 'coordinator',
      created_at: now - 7_200,
      started_at: now - 7_100,
      completed_at: now - 6_100,
      idempotency_key: 'gh-cv-site-52',
      runs: [run(1, 'coordinator', 'done', 'completed', now - 7_100, now - 6_100)],
      children: ['t_c0de0052'],
    }),
    // Its impl: run by the coder; after the reset, in review, the gate's run going on.
    card({
      id: 't_c0de0052',
      title: 'impl cv-site#52 : Pied de page : liens vers les réseaux',
      status: after ? 'review' : 'running',
      assignee: after ? 'gate' : 'coder',
      created_at: now - 6_000,
      started_at: now - 5_900,
      idempotency_key: 'gh-cv-site-52',
      workspace_path: '/work/cv-site-52',
      current_run_id: after ? 4 : 3,
      last_heartbeat_at: now - 5,
      runs: [
        run(
          3,
          'coder',
          after ? 'done' : 'running',
          after ? 'completed' : null,
          now - 5_900,
          after ? now - 60 : null,
          { branch: 'feat/52-pied-de-page', pr_url: PR_URL },
        ),
        ...(after ? [run(4, 'gate', 'running', null, now - 40, null)] : []),
      ],
      parents: ['t_b1ef0052'],
    }),
  ];
  // cv-site#49: one blocked impl, waiting for a decision; gone after the reset (no card of it is done, so
  // factory-live's own history does not keep it on the line).
  if (!after)
    items.push(
      card({
        id: BLOCKED_CARD,
        title: 'impl cv-site#49 : Page Projets',
        status: 'blocked',
        assignee: 'coder',
        created_at: now - 7_900,
        started_at: now - 7_800,
        block_kind: 'needs_input',
        idempotency_key: 'gh-cv-site-49',
        runs: [run(2, 'coder', 'done', 'blocked', now - 7_800, now - 600)],
        events: [
          {
            id: generation,
            run_id: 2,
            kind: 'blocked',
            payload: { kind: 'needs_input', reason: QUESTION },
            created_at: now - 600,
          },
        ],
      }),
    );
  return items;
}

/** The generic workflow `essai`: its sheet and two items, each at a station the core names. */
export const ESSAI_SHEET = {
  item: { type: 'essai', label: 'Essai' },
  stations: [
    { key: 'preparation', label: 'Préparation', icon: 'package', kind: 'script', col: 0, row: 1 },
    { key: 'redaction', label: 'Rédaction', icon: 'pencil', kind: 'ai', col: 1, row: 1 },
    { key: 'validation', label: 'Validation', icon: 'check-circle', kind: 'owner', col: 2, row: 1 },
  ],
  edges: [
    { from: 'preparation', to: 'redaction', kind: 'line' },
    { from: 'redaction', to: 'validation', kind: 'line' },
  ],
  models: [],
};

export function essaiItems(now) {
  return [
    card({
      id: 'e_0001',
      title: 'Préparer le jeu de données du trimestre',
      status: 'running',
      assignee: 'preparateur',
      created_at: now - 3_600,
      started_at: now - 3_500,
      station: 'preparation',
    }),
    card({
      id: 'e_0002',
      title: 'Rédiger la note de synthèse',
      status: 'blocked',
      assignee: 'redacteur',
      created_at: now - 3_000,
      started_at: now - 2_900,
      block_kind: 'needs_input',
      station: 'redaction',
      events: [
        {
          id: 1,
          run_id: null,
          kind: 'blocked',
          payload: { reason: 'Quel seuil de tolérance retenir ?' },
          created_at: now - 1_000,
        },
      ],
    }),
  ];
}

/** The code line's sheet: the one factory-live embeds, as the core would serve it. */
export const CODE_SHEET = read('apps/web/src/features/line/graph/workflows/code-line.json');

/** The coder at work on cv-site#52, running `npm test` (#66). */
export function liveAgents(now) {
  const at = (seconds) => new Date((now - seconds) * 1000).toISOString();
  return [
    {
      agent: 'coder',
      item: 't_c0de0052',
      run: 3,
      state: 'tool',
      action: { kind: 'tool', label: 'terminal', detail: 'npm test', started_at: at(10) },
      model: { name: 'agnes-2.5-flash', provider: 'freellmapi', source: 'live' },
      lane_model: null,
      heartbeat_at: at(5),
    },
  ];
}

/** The intervention of cv-site#49, as workflow-core#37 publishes it. */
export function interventions(now, generation = 1) {
  return [
    {
      id: interventionId(generation),
      kind: 'needs_input',
      item: BLOCKED_CARD,
      event: generation,
      opened_at: new Date((now - 600) * 1000).toISOString(),
      agent: 'coder',
      severity: 'critical',
      push: true,
      title: { code: 'intervention.title.needsInput', params: {} },
      question: { quote: QUESTION },
      actions: [
        { kind: 'gesture', gesture: 'unblock' },
        {
          kind: 'copy',
          label: { code: 'intervention.action.showCard', params: {} },
          command: `hermes kanban --board factory show ${BLOCKED_CARD}`,
        },
      ],
    },
  ];
}

/** Its diagnosis: a real one, of an agent's question (fixtures/diagnosis-references). */
export function diagnoses(now, generation = 1) {
  return [
    {
      item: BLOCKED_CARD,
      trigger: {
        id: interventionId(generation),
        kind: 'needs_input',
        event: generation,
        opened_at: new Date((now - 600) * 1000).toISOString(),
        agent: 'coder',
      },
      diagnosis: read('fixtures/diagnosis-references/question.json').output,
    },
  ];
}

/** The twins of PR #24 and the gate's three proofs of its head (workflow-core#36, #120). */
export function declaredData(subject, id) {
  if (subject === 'pr' && id === `${PR.repo}#${PR.number}`)
    return [
      {
        name: 'twins',
        label: 'Jumeaux',
        values: [
          { type: 'status', label: 'État', status: 'ok', text: 'ready' },
          {
            type: 'table',
            label: 'Surfaces',
            columns: [
              'Identifiant',
              'Surface',
              'Sorte',
              'Touchée',
              'Différences',
              'Commit de base',
              'Image de base',
              'Commit de tête',
              'Image de tête',
            ],
            rows: [['app', 'Application', 'web', true, 2, PR.base, '', PR.head, '']],
          },
          { type: 'text', label: 'Miroir', text: '52269' },
        ],
      },
    ];
  if (subject === 'card' && id === `t_c0de0052@${PR.head.slice(0, 7)}`)
    return [
      {
        name: 'gate-proofs',
        label: 'Preuves de la gate',
        values: [
          { type: 'text', label: 'failfirst', text: 'Le test échouait avant la correction.' },
          { type: 'text', label: 'sabotage', text: 'Le test casse quand on retire le lien.' },
          { type: 'text', label: 'invariance', text: 'Les autres pages ne changent pas.' },
        ],
      },
    ];
  return [];
}

export function machine(now) {
  const checked = new Date(now * 1000).toISOString();
  const check = (id, label, group) => ({
    id,
    label,
    group,
    status: 'ok',
    detail: 'Répond',
    metrics: {},
    checked_at: checked,
  });
  return {
    runtime_version: '0.22.2',
    contract: { ok: true, checked_at: checked, problems: [] },
    mode: 'normal',
    boards: { factory: { last_read_at: checked }, essai: { last_read_at: checked } },
    checks: [
      check('gateway', 'Gateway', 'hermes'),
      check('pause', 'Pause', 'hermes'),
      check('freellmapi', 'freellmapi', 'models'),
    ],
  };
}

/** The agents of the factory: the real answer of /agents captured for #93, read-only and without secret. */
export const AGENTS = read('fixtures/workflow-core/agents-factory.json');
