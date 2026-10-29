import { msg } from '@factory-live/contracts';
import type {
  AgentActivity,
  CardView,
  Intervention,
  IssueDetail,
  IssueSummary,
  PullRequestView,
  RunView,
  TimelineEntry,
  TranscriptEntry,
  TranscriptView,
} from '@factory-live/contracts';
import {
  NEMOTRON_SUPER,
  QWEN_LOCAL,
  buildHealth,
  buildHistory,
  buildProfiles,
  buildUsage,
  model,
} from './catalog.ts';
import {
  HOOK_INCIDENT,
  heldDiagnosis,
  hookTimeoutDiagnosis,
  incidentEvidenceFiles,
  questionDiagnosis,
} from './diagnoses.ts';
import { iso, nextId } from './state.ts';
import type { DemoState } from './state.ts';

/** Identifiants stables, partagés avec le script du scénario. */
export const KEYS = {
  team: 'claude-cockpit#71',
  contact: 'cv-site#47',
  shortcut: 'claude-cockpit#73',
  projects: 'cv-site#49',
  tags: 'claude-cockpit#68',
  footer: 'cv-site#44',
  hook: HOOK_INCIDENT.key,
  e2e: 'claude-cockpit#42',
  overlap: 'claude-cockpit#52',
  codeowners: 'cv-site#46',
} as const;

export const CARDS = {
  teamBrief: 't_5e21a7c4',
  teamImpl: 't_5e21c0d9',
  teamRelease: 't_5e21d4f2',
  contactBrief: 't_83b0e611',
  contactImpl: 't_83b1f2a0',
  contactRelease: 't_83b20c7e',
  shortcutBrief: 't_a90c3d18',
  shortcutImpl: 't_a90c5e02',
  shortcutRelease: 't_a90c6b9f',
  projectsBrief: 't_c41e8a07',
  tagsBrief: 't_2f6d0b31',
  tagsImpl: 't_2f6d1c84',
  tagsRelease: 't_2f6d2e15',
  footerBrief: 't_9c04d2a6',
  footerImpl: 't_9c04e18b',
  footerRelease: 't_9c04f35c',
  e2eBrief: 't_dc67e1d8',
  e2eImpl: 't_93914cb4',
  e2eRelease: 't_4c7f58b3',
  overlapImpl: 't_d6702099',
  overlapRelease: 't_b7c03d7b',
  codeownersImpl: 't_70e1b2c9',
  hookBrief: HOOK_INCIDENT.brief,
  hookImpl: HOOK_INCIDENT.impl,
  hookRelease: HOOK_INCIDENT.release,
} as const;

export const RUNS = { teamBrief: 181, contactImpl: 179, contactGate: 183, teamImpl: 184 } as const;

const REPOS: Record<string, string> = {
  'claude-cockpit': 'https://github.com/code-my-life/claude-cockpit',
  'cv-site': 'https://github.com/code-my-life/cv-site',
  'factory-live': 'https://github.com/code-my-life/factory-live',
};

function issueUrl(key: string): string {
  const [repo, number] = key.split('#');
  return `${REPOS[repo ?? ''] ?? 'https://github.com/code-my-life'}/issues/${number ?? ''}`;
}

export function prUrl(repo: string, number: number): string {
  return `${REPOS[repo] ?? 'https://github.com/code-my-life'}/pull/${number}`;
}

/** Le label qui fait entrer une issue dans la factory, posé par cddev. */
const LABELED = msg('github.labeled', { label: 'factory', actor: 'cddev' });

/** La raison écrite par l'agent quand il a bloqué factory-live#2 (run 191), telle quelle. */
const HOOK_REASON =
  "Terminal et tous les outils bloqués par 'pre_tool_call plugin callback timed out' - impossible de committer, push, créer PR ou appeler kanban_request_review. Travail d'implémentation terminé et vérifié (evidence/01-07 créés, 426 tests passent, typecheck/build/e2e OK), mais workflow git inachevé.";

/** La lane Claude Code de coder-claude, telle que le terminal d'Hermès la lance. */
export const LANE_COMMAND =
  'claude -p "$(cat evidence/brief.md)" --model claude-opus-5-5 --max-turns 40 --output-format json';

function pr(
  repo: string,
  number: number,
  patch: Partial<PullRequestView> & { title: string },
): PullRequestView {
  return {
    number,
    url: prUrl(repo, number),
    state: 'draft',
    checks: 'pending',
    reviewDecision: null,
    autoMerge: false,
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    ...patch,
  };
}

function card(
  id: string,
  title: string,
  patch: Partial<CardView> & Pick<CardView, 'kind' | 'status' | 'assignee' | 'station'>,
): CardView {
  return {
    id,
    title,
    blockKind: null,
    blockReason: null,
    parents: [],
    skills: [],
    runs: [],
    changedFiles: [],
    testsPassed: null,
    testsTotal: null,
    evidence: [],
    ...patch,
  };
}

function run(
  id: number,
  profile: string,
  patch: Partial<RunView> & Pick<RunView, 'role' | 'status' | 'startedAt'>,
): RunView {
  return {
    id,
    profile,
    outcome: null,
    endedAt: null,
    model: null,
    laneModel: null,
    summary: null,
    tokens: null,
    costUsd: null,
    verdict: null,
    ...patch,
  };
}

function timeline(
  at: string,
  label: TimelineEntry['label'],
  patch: Partial<Omit<TimelineEntry, 'id' | 'at' | 'label'>> = {},
): TimelineEntry {
  return {
    id: nextId('tl'),
    at,
    label,
    source: 'kanban',
    profile: null,
    cardId: null,
    detail: null,
    tone: 'neutral',
    ...patch,
  };
}

function entry(
  at: string,
  role: TranscriptEntry['role'],
  text: string | null,
  patch: Partial<Omit<TranscriptEntry, 'id' | 'at' | 'role' | 'text'>> = {},
): TranscriptEntry {
  return { id: nextId('tr'), at, role, text, toolName: null, model: null, status: null, ...patch };
}

function idle(
  profile: string,
  station: AgentActivity['station'],
  configModel: AgentActivity['model'],
): AgentActivity {
  return {
    profile,
    station,
    state: 'idle',
    cardId: null,
    issueKey: null,
    model: configModel,
    laneModel: null,
    action: null,
    runStartedAt: null,
    lastHeartbeatAt: null,
  };
}

/** Le lien de PR que la factory relève dans ses runs : en démo, celui de la PR quand il y en a une. */
function withPrUrl(summaries: Omit<IssueSummary, 'prUrl'>[]): IssueSummary[] {
  return summaries.map((summary) => ({ ...summary, prUrl: summary.pr?.url ?? null }));
}

/** L'état de la factory au lancement du scénario : deux cartes en cours, trois interventions. */
export function createInitialState(now: number): DemoState {
  const ago = (seconds: number) => iso(now - seconds * 1000);
  const min = 60;

  const summaries: IssueSummary[] = withPrUrl([
    {
      key: KEYS.team,
      repo: 'claude-cockpit',
      number: 71,
      title: 'Vue ÉQUIPE : regrouper les cartes par projet',
      url: issueUrl(KEYS.team),
      labels: ['factory', 'claude:opus'],
      station: 'implementation',
      previousStation: null,
      stationChangedAt: null,
      status: 'active',
      claudeModel: 'claude-opus-5-5',
      harness: 'coder-claude',
      pr: null,
      activeProfiles: ['coder-claude'],
      interventionIds: [],
      startedAt: ago(38 * min),
      updatedAt: ago(6),
    },
    {
      key: KEYS.contact,
      repo: 'cv-site',
      number: 47,
      title: 'Formulaire de contact : validation côté serveur',
      url: issueUrl(KEYS.contact),
      labels: ['factory'],
      station: 'gate',
      previousStation: null,
      stationChangedAt: null,
      status: 'active',
      claudeModel: null,
      harness: 'coder',
      pr: pr('cv-site', 52, {
        title: 'feat(contact): validation côté serveur du formulaire (#47)',
        additions: 214,
        deletions: 18,
        changedFiles: 5,
      }),
      activeProfiles: ['gate'],
      interventionIds: [],
      startedAt: ago(82 * min),
      updatedAt: ago(12),
    },
    {
      key: KEYS.shortcut,
      repo: 'claude-cockpit',
      number: 73,
      title: 'Raccourci clavier pour répondre à la dernière question',
      url: issueUrl(KEYS.shortcut),
      labels: ['factory'],
      station: 'brief',
      previousStation: null,
      stationChangedAt: null,
      status: 'queued',
      claudeModel: null,
      harness: null,
      pr: null,
      activeProfiles: [],
      interventionIds: [],
      startedAt: ago(4 * min),
      updatedAt: ago(4 * min),
    },
    {
      key: KEYS.projects,
      repo: 'cv-site',
      number: 49,
      title: 'Page Projets : filtres par techno',
      url: issueUrl(KEYS.projects),
      labels: ['factory'],
      station: 'brief',
      previousStation: null,
      stationChangedAt: null,
      status: 'waiting_human',
      claudeModel: null,
      harness: null,
      pr: null,
      activeProfiles: [],
      interventionIds: [],
      startedAt: ago(26 * min),
      updatedAt: ago(14 * min),
    },
    {
      key: KEYS.tags,
      repo: 'claude-cockpit',
      number: 68,
      title: 'Tag automatique des versions sur main',
      url: issueUrl(KEYS.tags),
      labels: ['factory'],
      station: 'release',
      previousStation: null,
      stationChangedAt: null,
      status: 'waiting_human',
      claudeModel: null,
      harness: 'coder',
      pr: pr('claude-cockpit', 74, {
        title: 'ci: tag automatique à chaque changement de version (#68)',
        state: 'open',
        checks: 'success',
        reviewDecision: 'review_required',
        autoMerge: true,
        additions: 96,
        deletions: 4,
        changedFiles: 3,
      }),
      activeProfiles: [],
      interventionIds: [],
      startedAt: ago(3 * 60 * min),
      updatedAt: ago(22 * min),
    },
    {
      key: KEYS.footer,
      repo: 'cv-site',
      number: 44,
      title: 'Pied de page : liens vers GitHub et LinkedIn',
      url: issueUrl(KEYS.footer),
      labels: ['factory'],
      station: 'implementation',
      previousStation: null,
      stationChangedAt: null,
      status: 'blocked',
      claudeModel: null,
      harness: 'coder',
      pr: pr('cv-site', 50, {
        title: 'feat(footer): liens sociaux (#44)',
        additions: 41,
        deletions: 2,
        changedFiles: 2,
      }),
      activeProfiles: [],
      interventionIds: [],
      startedAt: ago(2 * 60 * min),
      updatedAt: ago(42 * min),
    },
    {
      key: KEYS.hook,
      repo: 'factory-live',
      number: 2,
      title: 'Réglages : la version de factory-live est écrite en dur au lieu de celle du serveur',
      url: issueUrl(KEYS.hook),
      labels: ['factory'],
      station: 'implementation',
      previousStation: null,
      stationChangedAt: null,
      status: 'blocked',
      claudeModel: null,
      harness: 'coder',
      pr: null,
      activeProfiles: [],
      interventionIds: [],
      startedAt: ago(80 * min),
      updatedAt: ago(22 * min),
    },
    {
      key: KEYS.e2e,
      repo: 'claude-cockpit',
      number: 42,
      title: 'E2E PR 2 : actions des cartes et lanceur',
      url: issueUrl(KEYS.e2e),
      labels: ['factory'],
      station: 'done',
      previousStation: null,
      stationChangedAt: null,
      status: 'done',
      claudeModel: null,
      harness: 'coder',
      pr: pr('claude-cockpit', 69, {
        title: 'test(e2e): PR 2a, scénarios des cartes et outillage (#42)',
        state: 'merged',
        checks: 'success',
        reviewDecision: 'approved',
        additions: 458,
        deletions: 9,
        changedFiles: 6,
      }),
      activeProfiles: [],
      interventionIds: [],
      startedAt: ago(9 * 24 * 60 * min),
      updatedAt: ago(8 * 24 * 60 * min),
    },
    {
      key: KEYS.overlap,
      repo: 'claude-cockpit',
      number: 52,
      title: "Île : le bouton Détails chevauche l'encart d'autorisation",
      url: issueUrl(KEYS.overlap),
      labels: ['factory', 'claude'],
      station: 'done',
      previousStation: null,
      stationChangedAt: null,
      status: 'done',
      claudeModel: 'claude-sonnet-5-5',
      harness: 'coder-claude',
      pr: pr('claude-cockpit', 70, {
        title: "fix(island): le bouton Détails ne chevauche plus l'encart (#52)",
        state: 'merged',
        checks: 'success',
        reviewDecision: 'approved',
        additions: 37,
        deletions: 12,
        changedFiles: 2,
      }),
      activeProfiles: [],
      interventionIds: [],
      startedAt: ago(8 * 24 * 60 * min + 3 * 60 * min),
      updatedAt: ago(8 * 24 * 60 * min),
    },
    {
      key: KEYS.codeowners,
      repo: 'cv-site',
      number: 46,
      title: 'CODEOWNERS sur main',
      url: issueUrl(KEYS.codeowners),
      labels: ['factory'],
      station: 'done',
      previousStation: null,
      stationChangedAt: null,
      status: 'done',
      claudeModel: null,
      harness: 'scribe',
      pr: pr('cv-site', 46, {
        title: 'chore: CODEOWNERS (* @cddev)',
        state: 'merged',
        checks: 'success',
        reviewDecision: 'approved',
        additions: 1,
        deletions: 0,
        changedFiles: 1,
      }),
      activeProfiles: [],
      interventionIds: [],
      startedAt: ago(11 * 24 * 60 * min + 96 * min),
      updatedAt: ago(11 * 24 * 60 * min),
    },
  ]);

  const opus = model('anthropic', 'claude-opus-5-5', 'live');
  const qwenLive = model('llamacpp', QWEN_LOCAL, 'live');

  const details: Record<string, IssueDetail> = {};
  const find = (key: string) => {
    const summary = summaries.find((candidate) => candidate.key === key);
    if (!summary) throw new Error(key);
    return summary;
  };

  details[KEYS.team] = {
    issue: find(KEYS.team),
    tokens: 412_000,
    costUsd: 3.12,
    cards: [
      card(CARDS.teamBrief, `${KEYS.team} : Vue ÉQUIPE : regrouper les cartes par projet`, {
        kind: 'brief',
        status: 'done',
        assignee: 'coordinator-claude',
        station: 'brief',
        skills: ['factory-brief', 'factory-cli-lane'],
        runs: [
          run(RUNS.teamBrief, 'coordinator-claude', {
            role: 'coordinator',
            status: 'done',
            outcome: 'completed',
            startedAt: ago(38 * min),
            endedAt: ago(31 * min),
            model: model('freellmapi', 'agnes-2.5-flash', 'session'),
            laneModel: model('anthropic', 'claude-opus-5-5', 'session'),
            summary:
              'Brief rédigé : base 3f9c2e1, test fail-first desktop/test/team.test.js, 2 cartes créées',
            tokens: 48_200,
            costUsd: 0.31,
          }),
        ],
      }),
      card(CARDS.teamImpl, `impl ${KEYS.team} : regrouper les cartes par projet`, {
        kind: 'impl',
        status: 'running',
        assignee: 'coder-claude',
        station: 'implementation',
        parents: [CARDS.teamBrief],
        skills: ['factory-author-proof', 'factory-cli-lane'],
        changedFiles: [
          { path: 'desktop/src/team/TeamView.tsx', edits: 3 },
          { path: 'desktop/src/team/groupByProject.ts', edits: 2 },
          { path: 'desktop/test/team.test.js', edits: 1 },
        ],
        testsPassed: 11,
        testsTotal: 13,
        runs: [
          run(RUNS.teamImpl, 'coder-claude', {
            role: 'implementer',
            status: 'running',
            startedAt: ago(11 * min),
            model: qwenLive,
            laneModel: opus,
            tokens: 318_000,
            costUsd: 2.81,
          }),
        ],
      }),
      card(CARDS.teamRelease, `release ${KEYS.team}`, {
        kind: 'release',
        status: 'todo',
        assignee: 'coordinator-claude',
        station: 'release',
        parents: [CARDS.teamImpl],
        skills: ['factory-release'],
      }),
    ],
    timeline: [
      timeline(ago(39 * min), LABELED, { source: 'github' }),
      timeline(ago(39 * min), msg('timeline.created'), {
        cardId: CARDS.teamBrief,
        detail: msg('timeline.created.for', { assignee: 'coordinator-claude' }),
      }),
      timeline(ago(38 * min), msg('timeline.claimed'), {
        profile: 'coordinator-claude',
        cardId: CARDS.teamBrief,
      }),
      timeline(ago(31 * min), msg('timeline.completed'), {
        profile: 'coordinator-claude',
        cardId: CARDS.teamBrief,
        tone: 'done',
        detail:
          'Brief rédigé : base 3f9c2e1, test fail-first desktop/test/team.test.js, 2 cartes créées',
      }),
      timeline(ago(11 * min), msg('timeline.claimed'), {
        profile: 'coder-claude',
        cardId: CARDS.teamImpl,
      }),
      timeline(ago(8 * min), msg('timeline.comment', { author: 'coder-claude' }), {
        source: 'comment',
        profile: 'coder-claude',
        cardId: CARDS.teamImpl,
        detail: 'Échec prouvé sur la base 3f9c2e1 : 2 tests rouges (npm test -- team)',
      }),
      timeline(ago(7 * min), 'claude -p', {
        source: 'hermes',
        profile: 'coder-claude',
        cardId: CARDS.teamImpl,
        detail: LANE_COMMAND,
      }),
    ],
  };

  details[KEYS.contact] = {
    issue: find(KEYS.contact),
    tokens: 286_000,
    costUsd: 0,
    cards: [
      card(
        CARDS.contactBrief,
        `${KEYS.contact} : Formulaire de contact : validation côté serveur`,
        {
          kind: 'brief',
          status: 'done',
          assignee: 'coordinator',
          station: 'brief',
          skills: ['factory-brief'],
          runs: [
            run(176, 'coordinator', {
              role: 'coordinator',
              status: 'done',
              outcome: 'completed',
              startedAt: ago(82 * min),
              endedAt: ago(74 * min),
              model: model('moa', 'mix', 'session'),
              summary: 'Brief rédigé : base 8d41c07, test fail-first api/test/contact.test.ts',
              tokens: 61_000,
            }),
          ],
        },
      ),
      card(CARDS.contactImpl, `impl ${KEYS.contact} : validation côté serveur`, {
        kind: 'impl',
        status: 'running',
        assignee: 'gate',
        station: 'gate',
        parents: [CARDS.contactBrief],
        skills: ['factory-author-proof'],
        changedFiles: [
          { path: 'api/src/routes/contact.ts', edits: 4 },
          { path: 'api/src/validation/contact.ts', edits: 2 },
          { path: 'api/test/contact.test.ts', edits: 3 },
        ],
        testsPassed: 34,
        testsTotal: 34,
        runs: [
          run(RUNS.contactImpl, 'coder', {
            role: 'implementer',
            status: 'done',
            outcome: 'review_requested',
            startedAt: ago(70 * min),
            endedAt: ago(9 * min),
            model: model('freellmapi', 'dots3-note-preview', 'session'),
            summary: 'Validation zod côté serveur, 3 tests ajoutés, PR #52 en brouillon',
            tokens: 171_000,
          }),
          run(RUNS.contactGate, 'gate', {
            role: 'reviewer',
            status: 'running',
            startedAt: ago(6 * min),
            model: model('nvidia', NEMOTRON_SUPER, 'live'),
            tokens: 54_000,
          }),
        ],
      }),
      card(CARDS.contactRelease, `release ${KEYS.contact}`, {
        kind: 'release',
        status: 'todo',
        assignee: 'coordinator',
        station: 'release',
        parents: [CARDS.contactImpl],
        skills: ['factory-release'],
      }),
    ],
    timeline: [
      timeline(ago(83 * min), LABELED, { source: 'github' }),
      timeline(ago(82 * min), msg('timeline.claimed'), {
        profile: 'coordinator',
        cardId: CARDS.contactBrief,
      }),
      timeline(ago(74 * min), msg('timeline.completed'), {
        profile: 'coordinator',
        cardId: CARDS.contactBrief,
        tone: 'done',
        detail: 'Brief rédigé : base 8d41c07, test fail-first api/test/contact.test.ts',
      }),
      timeline(ago(70 * min), msg('timeline.claimed'), {
        profile: 'coder',
        cardId: CARDS.contactImpl,
      }),
      timeline(
        ago(52 * min),
        msg('activity.llm.rateLimited', {
          model: 'agnes-2.5-flash',
          attempt: null,
          attempts: null,
        }),
        {
          source: 'hermes',
          profile: 'coder',
          cardId: CARDS.contactImpl,
          tone: 'danger',
          detail: 'Too Many Requests',
        },
      ),
      timeline(ago(12 * min), msg('github.prOpened', { pr: 52, draft: true }), {
        source: 'github',
        cardId: CARDS.contactImpl,
        detail: msg('github.diffstat', { additions: 214, deletions: 18, files: 5 }),
      }),
      timeline(ago(9 * min), msg('timeline.reviewRequested', { reviewer: 'gate' }), {
        profile: 'coder',
        cardId: CARDS.contactImpl,
        tone: 'attention',
        detail: 'coder-guard : branche poussée au même commit, PR citée dans le handoff',
      }),
      timeline(ago(6 * min), msg('timeline.claimed'), {
        profile: 'gate',
        cardId: CARDS.contactImpl,
      }),
    ],
  };

  details[KEYS.shortcut] = {
    issue: find(KEYS.shortcut),
    tokens: 0,
    costUsd: 0,
    cards: [
      card(
        CARDS.shortcutBrief,
        `${KEYS.shortcut} : Raccourci clavier pour répondre à la dernière question`,
        {
          kind: 'brief',
          status: 'ready',
          assignee: 'coordinator',
          station: 'brief',
          skills: ['factory-brief'],
        },
      ),
    ],
    timeline: [
      timeline(ago(4 * min), LABELED, { source: 'github' }),
      timeline(ago(4 * min), msg('timeline.created'), {
        cardId: CARDS.shortcutBrief,
        detail: msg('timeline.created.for', { assignee: 'coordinator' }),
      }),
    ],
  };

  details[KEYS.projects] = {
    issue: find(KEYS.projects),
    tokens: 23_000,
    costUsd: 0,
    cards: [
      card(CARDS.projectsBrief, `${KEYS.projects} : Page Projets : filtres par techno`, {
        kind: 'brief',
        status: 'blocked',
        assignee: 'coordinator',
        station: 'brief',
        blockKind: 'needs_input',
        blockReason: 'Carte UI sans maquette jointe',
        skills: ['factory-brief'],
        runs: [
          run(182, 'coordinator', {
            role: 'coordinator',
            status: 'blocked',
            outcome: 'blocked',
            startedAt: ago(25 * min),
            endedAt: ago(14 * min),
            model: model('moa', 'mix', 'session'),
            summary: 'Bloqué : carte UI sans maquette jointe',
            tokens: 23_000,
          }),
        ],
      }),
    ],
    timeline: [
      timeline(ago(26 * min), LABELED, { source: 'github' }),
      timeline(ago(25 * min), msg('timeline.claimed'), {
        profile: 'coordinator',
        cardId: CARDS.projectsBrief,
      }),
      timeline(ago(14 * min), msg('timeline.blocked', { kind: 'needs_input' }), {
        profile: 'coordinator',
        cardId: CARDS.projectsBrief,
        tone: 'danger',
        detail: 'Carte UI sans maquette jointe',
      }),
      timeline(ago(14 * min), msg('timeline.comment', { author: 'coordinator' }), {
        source: 'comment',
        profile: 'coordinator',
        cardId: CARDS.projectsBrief,
        detail:
          'Question publiée sur l’issue : joindre une maquette, ou valider des filtres en pastilles au-dessus de la grille ?',
      }),
    ],
  };

  details[KEYS.tags] = {
    issue: find(KEYS.tags),
    tokens: 198_000,
    costUsd: 0,
    cards: [
      card(CARDS.tagsBrief, `${KEYS.tags} : Tag automatique des versions sur main`, {
        kind: 'brief',
        status: 'done',
        assignee: 'coordinator',
        station: 'brief',
      }),
      card(CARDS.tagsImpl, `impl ${KEYS.tags} : workflow Tag on version`, {
        kind: 'impl',
        status: 'done',
        assignee: 'gate',
        station: 'gate',
        parents: [CARDS.tagsBrief],
        testsPassed: 52,
        testsTotal: 52,
        changedFiles: [
          { path: '.github/workflows/tag-on-version.yml', edits: 2 },
          { path: 'docs/RELEASE.md', edits: 1 },
        ],
      }),
      card(CARDS.tagsRelease, `release ${KEYS.tags}`, {
        kind: 'release',
        status: 'blocked',
        assignee: 'coordinator',
        station: 'release',
        parents: [CARDS.tagsImpl],
        blockKind: 'needs_input',
        blockReason: 'Prêt à merger claude-cockpit#74',
      }),
    ],
    timeline: [
      timeline(ago(180 * min), LABELED, { source: 'github' }),
      timeline(ago(31 * min), msg('timeline.completed'), {
        profile: 'gate',
        cardId: CARDS.tagsImpl,
        tone: 'done',
        detail: 'Approuvé : 52 tests, CI verte (Tests, E2E, GitHub Pages)',
      }),
      timeline(
        ago(30 * min),
        msg('github.reviewRequested', { pr: 74, reviewer: 'cddev', autoMerge: true }),
        { source: 'github' },
      ),
      timeline(ago(22 * min), msg('timeline.blocked', { kind: 'needs_input' }), {
        profile: 'coordinator',
        cardId: CARDS.tagsRelease,
        tone: 'danger',
        detail: 'Prêt à merger claude-cockpit#74',
      }),
    ],
  };

  details[KEYS.footer] = {
    issue: find(KEYS.footer),
    tokens: 94_000,
    costUsd: 0,
    cards: [
      card(CARDS.footerBrief, `${KEYS.footer} : Pied de page : liens vers GitHub et LinkedIn`, {
        kind: 'brief',
        status: 'done',
        assignee: 'coordinator',
        station: 'brief',
      }),
      card(CARDS.footerImpl, `impl ${KEYS.footer} : liens sociaux`, {
        kind: 'impl',
        status: 'ready',
        assignee: 'coder',
        station: 'implementation',
        parents: [CARDS.footerBrief],
      }),
      card(CARDS.footerRelease, `release ${KEYS.footer}`, {
        kind: 'release',
        status: 'todo',
        assignee: 'coordinator',
        station: 'release',
        parents: [CARDS.footerImpl],
      }),
    ],
    timeline: [
      timeline(ago(120 * min), LABELED, { source: 'github' }),
      timeline(ago(61 * min), msg('timeline.changesRequested', { reviewer: 'gate' }), {
        profile: 'gate',
        cardId: CARDS.footerImpl,
        tone: 'danger',
        detail: 'Lien LinkedIn sans rel="noopener"',
      }),
      timeline(ago(42 * min), msg('timeline.respawnGuarded'), {
        cardId: CARDS.footerImpl,
        tone: 'attention',
        detail: msg('timeline.respawnGuarded.activePr'),
      }),
    ],
  };

  // Réplique de l'incident du 2026-10-29 (voir diagnoses.ts) : la carte impl bloquée et ses trois runs.
  const clock = { ago };
  const hookDiagnosis = hookTimeoutDiagnosis(clock);
  const verdictOf = (runId: number) =>
    hookDiagnosis.runs.find((verdict) => verdict.runId === runId) ?? null;
  const coderModel = model('freellmapi', 'auto', 'session');
  details[KEYS.hook] = {
    issue: find(KEYS.hook),
    tokens: 5_060_000,
    costUsd: 0,
    cards: [
      card(
        CARDS.hookBrief,
        `${KEYS.hook} : Réglages : la version de factory-live est écrite en dur`,
        {
          kind: 'brief',
          status: 'done',
          assignee: 'coordinator',
          station: 'brief',
        },
      ),
      card(CARDS.hookImpl, `impl ${KEYS.hook}`, {
        kind: 'impl',
        status: 'blocked',
        assignee: 'coder',
        station: 'implementation',
        blockKind: 'capability',
        blockReason: HOOK_REASON,
        parents: [CARDS.hookBrief],
        skills: ['factory-author-proof'],
        runs: [
          run(HOOK_INCIDENT.runs.model, 'coder', {
            role: 'implementer',
            status: 'crashed',
            outcome: 'crashed',
            startedAt: ago(73 * min),
            endedAt: ago(56 * min),
            model: coderModel,
            verdict: verdictOf(HOOK_INCIDENT.runs.model),
          }),
          run(HOOK_INCIDENT.runs.refused, 'coder', {
            role: 'implementer',
            status: 'crashed',
            outcome: 'crashed',
            startedAt: ago(56 * min),
            endedAt: ago(33 * min),
            model: coderModel,
            verdict: verdictOf(HOOK_INCIDENT.runs.refused),
          }),
          run(HOOK_INCIDENT.runs.blocked, 'coder', {
            role: 'implementer',
            status: 'blocked',
            outcome: 'blocked',
            startedAt: ago(33 * min),
            endedAt: ago(22 * min),
            model: coderModel,
            verdict: verdictOf(HOOK_INCIDENT.runs.blocked),
          }),
        ],
        evidence: incidentEvidenceFiles(clock),
      }),
      card(CARDS.hookRelease, `release ${KEYS.hook}`, {
        kind: 'release',
        status: 'todo',
        assignee: 'coordinator',
        station: 'release',
        parents: [CARDS.hookImpl],
      }),
    ],
    timeline: [
      timeline(ago(80 * min), LABELED, { source: 'github' }),
      timeline(ago(74 * min), msg('timeline.completed'), {
        profile: 'coordinator',
        cardId: CARDS.hookBrief,
        tone: 'success',
      }),
      timeline(ago(73 * min), msg('timeline.claimed'), {
        profile: 'coder',
        cardId: CARDS.hookImpl,
      }),
      timeline(ago(56 * min), msg('timeline.protocolViolation'), {
        profile: 'coder',
        cardId: CARDS.hookImpl,
        tone: 'danger',
      }),
      timeline(ago(33 * min), msg('timeline.protocolViolation'), {
        profile: 'coder',
        cardId: CARDS.hookImpl,
        tone: 'danger',
      }),
      timeline(ago(22 * min), msg('timeline.blocked', { kind: 'capability' }), {
        profile: 'coder',
        cardId: CARDS.hookImpl,
        tone: 'danger',
        detail: HOOK_REASON,
      }),
    ],
  };

  const doneDetail = (key: string, cards: CardView[], tokens: number, costUsd: number) => {
    details[key] = {
      issue: find(key),
      tokens,
      costUsd,
      cards,
      timeline: [
        timeline(find(key).startedAt, LABELED, { source: 'github' }),
        timeline(find(key).updatedAt, msg('github.merged'), { source: 'github', tone: 'done' }),
      ],
    };
  };
  doneDetail(
    KEYS.e2e,
    [
      card(CARDS.e2eBrief, `${KEYS.e2e} : E2E PR 2 : actions des cartes et lanceur`, {
        kind: 'brief',
        status: 'done',
        assignee: 'coordinator',
        station: 'brief',
      }),
      card(CARDS.e2eImpl, `impl ${KEYS.e2e} : E2E PR 2b, île et lanceur`, {
        kind: 'impl',
        status: 'done',
        assignee: 'gate',
        station: 'gate',
        parents: [CARDS.e2eBrief],
        testsPassed: 13,
        testsTotal: 13,
      }),
      card(CARDS.e2eRelease, `release ${KEYS.e2e} : E2E PR 2b, île et lanceur`, {
        kind: 'release',
        status: 'done',
        assignee: 'coordinator',
        station: 'release',
        parents: [CARDS.e2eImpl],
      }),
    ],
    1_840_000,
    6.4,
  );
  doneDetail(
    KEYS.overlap,
    [
      card(CARDS.overlapImpl, `impl ${KEYS.overlap}`, {
        kind: 'impl',
        status: 'done',
        assignee: 'gate-claude',
        station: 'gate',
      }),
      card(CARDS.overlapRelease, `release ${KEYS.overlap}`, {
        kind: 'release',
        status: 'done',
        assignee: 'coordinator-claude',
        station: 'release',
        parents: [CARDS.overlapImpl],
      }),
    ],
    233_000,
    1.94,
  );
  doneDetail(
    KEYS.codeowners,
    [
      card(CARDS.codeownersImpl, `impl ${KEYS.codeowners}`, {
        kind: 'impl',
        status: 'done',
        assignee: 'gate',
        station: 'gate',
      }),
    ],
    31_000,
    0,
  );

  const agents: AgentActivity[] = [
    idle('coordinator', 'brief', model('moa', 'mix')),
    idle('coordinator-claude', 'brief', model('freellmapi', 'auto')),
    {
      profile: 'coder-claude',
      station: 'implementation',
      state: 'cli',
      cardId: CARDS.teamImpl,
      issueKey: KEYS.team,
      model: qwenLive,
      laneModel: opus,
      action: {
        kind: 'cli',
        label: 'claude -p · Edit',
        detail: 'desktop/src/team/TeamView.tsx',
        startedAt: ago(6),
      },
      runStartedAt: ago(11 * min),
      lastHeartbeatAt: ago(40),
    },
    idle('coder', 'implementation', model('freellmapi', 'auto')),
    idle('coder-opencode', 'implementation', model('nvidia', 'nvidia/nemotron-3-ultra-550b-a55b')),
    idle('scribe', 'implementation', model('freellmapi', 'auto')),
    {
      profile: 'gate',
      station: 'gate',
      state: 'tool',
      cardId: CARDS.contactImpl,
      issueKey: KEYS.contact,
      model: model('nvidia', NEMOTRON_SUPER, 'live'),
      laneModel: null,
      action: { kind: 'tool', label: 'terminal', detail: 'pnpm -r test', startedAt: ago(12) },
      runStartedAt: ago(6 * min),
      lastHeartbeatAt: ago(25),
    },
    idle('gate-claude', 'gate', model('freellmapi', 'auto')),
    idle('release', 'release', model('freellmapi', 'auto')),
    idle('tool-setup', 'side', model('freellmapi', 'auto')),
  ];
  const coordinator = agents[0];
  if (coordinator) {
    coordinator.state = 'queued';
    coordinator.issueKey = KEYS.shortcut;
    coordinator.cardId = CARDS.shortcutBrief;
  }

  const interventions: Intervention[] = [
    {
      id: 'iv-hook',
      kind: 'capability',
      severity: 'critical',
      title: HOOK_REASON,
      issueKey: KEYS.hook,
      cardId: CARDS.hookImpl,
      profile: 'coder',
      question: HOOK_REASON,
      openedAt: ago(22 * min),
      push: true,
      actions: [
        { kind: 'unblock' },
        {
          kind: 'copy',
          label: msg('intervention.action.showCard'),
          command: `hermes kanban --board factory show ${CARDS.hookImpl}`,
        },
        {
          kind: 'link',
          label: msg('intervention.action.openIssue', { issueKey: KEYS.hook }),
          url: issueUrl(KEYS.hook),
        },
      ],
      unblock: null,
      diagnosis: hookDiagnosis,
      resolvedAt: null,
      followUp: null,
    },
    {
      id: 'iv-projects',
      kind: 'needs_input',
      severity: 'critical',
      title: 'Carte UI sans maquette jointe',
      issueKey: KEYS.projects,
      cardId: CARDS.projectsBrief,
      profile: 'coordinator',
      question: [
        "La carte touche l'interface (page Projets) et aucune maquette n'est jointe à l'issue. Les règles du brief exigent une maquette pour une carte UI.",
        '',
        'Deux options :',
        '',
        "1. Joindre une maquette (capture ou lien) à l'issue.",
        '2. Valider une mise en page simple : filtres en pastilles au-dessus de la grille, sélection multiple, état vide « Aucun projet pour ces technos ».',
        '',
        'Quelle option retiens-tu ?',
      ].join('\n'),
      openedAt: ago(14 * min),
      push: true,
      actions: [
        { kind: 'unblock' },
        {
          kind: 'link',
          label: msg('intervention.action.openIssue', { issueKey: KEYS.projects }),
          url: issueUrl(KEYS.projects),
        },
      ],
      unblock: null,
      diagnosis: questionDiagnosis(clock, 14 * min),
      resolvedAt: null,
      followUp: null,
    },
    {
      id: 'iv-footer',
      kind: 'held_active_pr',
      severity: 'warning',
      title: msg('intervention.title.held', { minutes: 42 }),
      issueKey: KEYS.footer,
      cardId: CARDS.footerImpl,
      profile: 'coder',
      question: msg('intervention.question.held'),
      openedAt: ago(42 * min),
      push: true,
      actions: [
        {
          kind: 'copy',
          label: msg('intervention.action.relay', { owner: 'coder' }),
          command: `hermes kanban --board factory reassign ${CARDS.footerImpl} scribe --reason "relais active_pr" && hermes kanban --board factory reassign ${CARDS.footerImpl} coder --reason "reprise sur la PR"`,
        },
        {
          kind: 'link',
          label: msg('intervention.action.prWorkflows'),
          url: prUrl('cv-site', 50),
        },
      ],
      unblock: null,
      diagnosis: heldDiagnosis(
        clock,
        CARDS.footerImpl,
        42,
        `hermes kanban --board factory reassign ${CARDS.footerImpl} scribe --reason "relais active_pr" && hermes kanban --board factory reassign ${CARDS.footerImpl} coder --reason "reprise sur la PR"`,
      ),
      resolvedAt: null,
      followUp: null,
    },
    {
      id: 'iv-tags',
      kind: 'pr_approval',
      severity: 'info',
      title: msg('intervention.title.prReady'),
      issueKey: KEYS.tags,
      cardId: CARDS.tagsRelease,
      profile: 'coordinator',
      question:
        'La gate a approuvé la PR #74 et la CI est verte (Tests, E2E, GitHub Pages). Revue demandée à @cddev, auto-merge armé : ton approbation déclenche le merge, le tag puis la release.',
      openedAt: ago(22 * min),
      push: false,
      actions: [
        {
          kind: 'link',
          label: msg('intervention.action.approvePr'),
          url: prUrl('claude-cockpit', 74),
        },
      ],
      unblock: null,
      diagnosis: null,
      resolvedAt: null,
      followUp: null,
    },
  ];
  for (const intervention of interventions) {
    const summary = summaries.find((candidate) => candidate.key === intervention.issueKey);
    if (summary) summary.interventionIds.push(intervention.id);
  }
  for (const [key, detail] of Object.entries(details)) {
    const summary = summaries.find((candidate) => candidate.key === key);
    if (summary) detail.issue = { ...summary };
  }

  const transcripts: Record<number, TranscriptView[]> = {
    [RUNS.teamImpl]: [
      {
        runId: RUNS.teamImpl,
        source: 'hermes',
        title: msg('transcript.hermes', { profile: 'coder-claude', session: null }),
        entries: [
          entry(ago(11 * min), 'user', `work kanban task ${CARDS.teamImpl}`),
          entry(
            ago(11 * min - 5),
            'assistant',
            'Je lis la carte et le brief, puis je prépare le worktree.',
            {
              model: QWEN_LOCAL,
            },
          ),
          entry(ago(11 * min - 8), 'tool_call', `{"task_id": "${CARDS.teamImpl}"}`, {
            toolName: 'kanban_show',
          }),
          entry(
            ago(11 * min - 9),
            'tool_result',
            `Carte impl ${KEYS.team} · base 3f9c2e1 · contrat local-only · skills factory-author-proof, factory-cli-lane · claude_model: claude-opus-5-5`,
            { toolName: 'kanban_show', status: 'ok' },
          ),
          entry(ago(10 * min), 'tool_call', '{"name": "factory-cli-lane"}', {
            toolName: 'skill_view',
          }),
          entry(
            ago(10 * min - 4),
            'reasoning',
            "Le label claude:opus impose claude-opus-5-5 pour la lane. Je dois d'abord prouver l'échec sur la base, puis déléguer à Claude Code et relancer les tests moi-même.",
          ),
          entry(ago(9 * min), 'tool_call', 'npm test -- team', { toolName: 'terminal' }),
          entry(
            ago(8 * min),
            'tool_result',
            '  team view\n    ✓ renders one card per conversation\n    ✗ groups cards by project\n    ✗ sorts groups by project name\n\n  11 passing, 2 failing',
            { toolName: 'terminal', status: 'error' },
          ),
          entry(
            ago(8 * min - 20),
            'assistant',
            'Échec prouvé sur la base 3f9c2e1 : 2 tests rouges. Je délègue l’implémentation à Claude Code.',
            { model: QWEN_LOCAL },
          ),
          entry(
            ago(7 * min),
            'tool_call',
            'claude -p "$(cat evidence/brief.md)" --model claude-opus-5-5 --allowedTools "Read,Edit,Write,Bash(npm *),Bash(git diff*),Bash(git status*)" --max-turns 40 --output-format json > evidence/10-claude-run.json',
            { toolName: 'terminal' },
          ),
        ],
        terminal: [
          `\u001b[2m${new Date(now - 11 * 60_000).toLocaleTimeString('fr-FR')}\u001b[0m Query: work kanban task ${CARDS.teamImpl}`,
          `\u001b[2m${new Date(now - 11 * 60_000 + 1000).toLocaleTimeString('fr-FR')}\u001b[0m Initializing agent... profile=coder-claude provider=llamacpp`,
          `  model=${QWEN_LOCAL}`,
          '\u001b[36m  kanban_show\u001b[0m t_5e21c0d9 \u001b[2m(0,2 s)\u001b[0m',
          '\u001b[36m  skill_view\u001b[0m factory-cli-lane \u001b[2m(0,1 s)\u001b[0m',
          '\u001b[35m  [thinking]\u001b[0m preuve de l’échec sur la base avant la lane',
          '\u001b[36m  terminal\u001b[0m npm test -- team \u001b[2m(8,4 s)\u001b[0m',
          '',
          '  team view',
          ...[
            'renders one card per conversation',
            'shows the agent name and model on each card',
            'marks a running conversation with the live dot',
            'hides archived conversations by default',
            'shows archived conversations when the filter is on',
          ].map((name) => `\u001b[32m    ✓\u001b[0m ${name}`),
          '\u001b[31m    1) groups cards by project\u001b[0m',
          '\u001b[31m    2) sorts groups by project name\u001b[0m',
          '',
          '  team header',
          ...[
            'counts running conversations',
            'counts conversations waiting for an answer',
            'links each counter to its filtered list',
          ].map((name) => `\u001b[32m    ✓\u001b[0m ${name}`),
          '',
          '  team filters',
          ...[
            'keeps the filter in the URL',
            'restores the filter after a reload',
            'resets the filter from the empty state',
          ].map((name) => `\u001b[32m    ✓\u001b[0m ${name}`),
          '',
          '\u001b[32m  11 passing\u001b[0m \u001b[2m(412ms)\u001b[0m',
          '\u001b[31m  2 failing\u001b[0m',
          '',
          '  1) team view',
          '       groups cards by project:',
          "\u001b[31m     AssertionError: expected [ 'cv-site', 'claude-cockpit' ] to deeply equal [ 'claude-cockpit', 'cv-site' ]\u001b[0m",
          '  2) team view',
          '       sorts groups by project name:',
          "\u001b[31m     AssertionError: expected 'cv-site' to equal 'claude-cockpit'\u001b[0m",
          '',
          '\u001b[36m  terminal\u001b[0m claude -p "$(cat evidence/brief.md)" --model claude-opus-5-5 --max-turns 40 \u001b[33m(en cours)\u001b[0m',
        ],
      },
      {
        runId: RUNS.teamImpl,
        source: 'claude-code',
        title: msg('transcript.claudeCode', { costUsd: null }),
        entries: [
          entry(
            ago(7 * min),
            'system',
            `Session 4cd140d2 · ~/perso/claude-cockpit/.worktrees/${CARDS.teamImpl} · claude-opus-5-5`,
          ),
          entry(
            ago(7 * min),
            'user',
            'Implémente le regroupement des cartes par projet dans la vue ÉQUIPE. Les tests desktop/test/team.test.js décrivent le comportement attendu. Interdits : affaiblir une assertion, allonger un timeout, git push --force.',
          ),
          entry(
            ago(7 * min - 6),
            'reasoning',
            'Les tests attendent groupByProject(cards) qui renvoie des groupes triés par nom de projet, cartes sans projet à la fin. Je lis la vue avant de toucher quoi que ce soit.',
            { model: 'claude-opus-5-5' },
          ),
          entry(ago(7 * min - 10), 'tool_call', 'desktop/src/team/TeamView.tsx', {
            toolName: 'Read',
          }),
          entry(ago(7 * min - 11), 'tool_result', '212 lignes', { toolName: 'Read', status: 'ok' }),
          entry(ago(6 * min), 'tool_call', 'desktop/src/team/groupByProject.ts (nouveau fichier)', {
            toolName: 'Write',
          }),
          entry(ago(5 * min), 'tool_call', 'desktop/src/team/TeamView.tsx', { toolName: 'Edit' }),
          entry(ago(4 * min), 'tool_call', 'npm test -- team', { toolName: 'Bash' }),
          entry(
            ago(4 * min - 9),
            'tool_result',
            '12 passing, 1 failing (sorts groups by project name)',
            {
              toolName: 'Bash',
              status: 'error',
            },
          ),
          entry(
            ago(3 * min),
            'assistant',
            "Il reste l'ordre des groupes : je trie avec localeCompare en français pour que « Élan » passe avant « Zéphyr ».",
            { model: 'claude-opus-5-5' },
          ),
        ],
        terminal: [],
      },
    ],
    [RUNS.contactGate]: [
      {
        runId: RUNS.contactGate,
        source: 'hermes',
        title: msg('transcript.hermes', { profile: 'gate', session: null }),
        entries: [
          entry(ago(6 * min), 'user', `work kanban task ${CARDS.contactImpl}`),
          entry(ago(6 * min - 4), 'tool_call', '{"name": "factory-gate"}', {
            toolName: 'skill_view',
          }),
          entry(ago(5 * min), 'tool_call', 'pnpm install --frozen-lockfile', {
            toolName: 'terminal',
          }),
          entry(ago(4 * min), 'tool_result', 'Done in 41,2s', {
            toolName: 'terminal',
            status: 'ok',
          }),
          entry(ago(3 * min), 'tool_call', 'pnpm -r typecheck', { toolName: 'terminal' }),
          entry(ago(2 * min), 'tool_result', '3 projets, aucune erreur', {
            toolName: 'terminal',
            status: 'ok',
          }),
          entry(ago(12), 'tool_call', 'pnpm -r test', { toolName: 'terminal' }),
        ],
        terminal: [
          `\u001b[2m${new Date(now - 6 * 60_000).toLocaleTimeString('fr-FR')}\u001b[0m Query: work kanban task ${CARDS.contactImpl}`,
          `  model=${NEMOTRON_SUPER} provider=nvidia reasoning=high`,
          '\u001b[36m  terminal\u001b[0m pnpm install --frozen-lockfile \u001b[2m(41,2 s)\u001b[0m',
          '\u001b[36m  terminal\u001b[0m pnpm -r typecheck \u001b[2m(27,9 s)\u001b[0m',
          '\u001b[36m  terminal\u001b[0m pnpm -r test \u001b[33m(en cours)\u001b[0m',
        ],
      },
    ],
    [RUNS.teamBrief]: [
      {
        runId: RUNS.teamBrief,
        source: 'hermes',
        title: msg('transcript.hermes', { profile: 'coordinator-claude', session: null }),
        entries: [
          entry(ago(38 * min), 'user', `work kanban task ${CARDS.teamBrief}`),
          entry(ago(37 * min), 'tool_call', 'desktop/src/team', {
            toolName: 'mcp_graphify_get_neighbors',
          }),
          entry(
            ago(36 * min),
            'tool_call',
            'claude -p "$(cat evidence/brief-input.md)" --model claude-opus-5-5 --max-turns 15',
            {
              toolName: 'terminal',
            },
          ),
          entry(
            ago(32 * min),
            'tool_result',
            'Brief rendu (evidence/brief-claude.json, 15 tours, 0,31 $US)',
            {
              toolName: 'terminal',
              status: 'ok',
            },
          ),
          entry(ago(31 * min), 'tool_call', 'impl claude-cockpit#71 → coder-claude', {
            toolName: 'kanban_create',
          }),
          entry(ago(31 * min), 'tool_call', 'release claude-cockpit#71 → coordinator-claude', {
            toolName: 'kanban_create',
          }),
          entry(ago(31 * min), 'assistant', 'Brief rédigé, 2 cartes créées. Je termine la carte.', {
            model: 'agnes-2.5-flash',
          }),
        ],
        terminal: [],
      },
    ],
  };

  return {
    snapshot: {
      generatedAt: iso(now),
      factory: { live: true, paused: false, pauseReason: null, maxInProgress: 2, running: 2 },
      stations: [
        { id: 'intake', profiles: [] },
        { id: 'brief', profiles: ['coordinator', 'coordinator-claude'] },
        { id: 'implementation', profiles: ['coder', 'coder-claude', 'coder-opencode', 'scribe'] },
        { id: 'gate', profiles: ['gate', 'gate-claude'] },
        { id: 'release', profiles: ['release'] },
        { id: 'done', profiles: [] },
      ],
      agents,
      issues: summaries,
      sideCards: [
        {
          id: 't_7d2e90a1',
          title:
            'watch 2026-10-28 : 2 PR ouvertes sur code-my-life/claude-cockpit (merge en attente ?)',
          kind: 'watch',
          status: 'triage',
          assignee: 'coordinator',
          openedAt: ago(21 * min),
          note: null,
        },
      ],
      interventions,
      activity: [
        {
          id: nextId('ev'),
          at: ago(6),
          kind: 'tool',
          profile: 'coder-claude',
          issueKey: KEYS.team,
          cardId: CARDS.teamImpl,
          label: 'Edit',
          detail: 'desktop/src/team/TeamView.tsx',
          status: 'running',
          durationMs: null,
          model: 'claude-opus-5-5',
        },
        {
          id: nextId('ev'),
          at: ago(12),
          kind: 'tool',
          profile: 'gate',
          issueKey: KEYS.contact,
          cardId: CARDS.contactImpl,
          label: 'terminal',
          detail: 'pnpm -r test',
          status: 'running',
          durationMs: null,
          model: NEMOTRON_SUPER,
        },
        {
          id: nextId('ev'),
          at: ago(40),
          kind: 'kanban',
          profile: 'coder-claude',
          issueKey: KEYS.team,
          cardId: CARDS.teamImpl,
          label: 'heartbeat',
          detail: null,
          status: 'ok',
          durationMs: null,
          model: null,
        },
        {
          id: nextId('ev'),
          at: ago(2 * 60),
          kind: 'tool',
          profile: 'gate',
          issueKey: KEYS.contact,
          cardId: CARDS.contactImpl,
          label: 'terminal',
          detail: 'pnpm -r typecheck',
          status: 'ok',
          durationMs: 27_900,
          model: NEMOTRON_SUPER,
        },
        {
          id: nextId('ev'),
          at: ago(4 * 60),
          kind: 'tool',
          profile: 'coder-claude',
          issueKey: KEYS.team,
          cardId: CARDS.teamImpl,
          label: 'Bash',
          detail: 'npm test -- team',
          status: 'error',
          durationMs: 8_900,
          model: 'claude-opus-5-5',
        },
        {
          id: nextId('ev'),
          at: ago(4 * 60 + 30),
          kind: 'kanban',
          profile: null,
          issueKey: KEYS.shortcut,
          cardId: CARDS.shortcutBrief,
          label: msg('timeline.created'),
          detail: msg('timeline.created.for', { assignee: 'coordinator' }),
          status: null,
          durationMs: null,
          model: null,
        },
        {
          id: nextId('ev'),
          at: ago(9 * 60),
          kind: 'kanban',
          profile: 'coder',
          issueKey: KEYS.contact,
          cardId: CARDS.contactImpl,
          label: msg('timeline.reviewRequested', { reviewer: 'gate' }),
          detail: 'coder-guard : branche poussée, PR #52 citée',
          status: 'ok',
          durationMs: null,
          model: null,
        },
        {
          id: nextId('ev'),
          at: ago(14 * 60),
          kind: 'kanban',
          profile: 'coordinator',
          issueKey: KEYS.projects,
          cardId: CARDS.projectsBrief,
          label: 'blocked',
          detail: 'Carte UI sans maquette jointe',
          status: 'blocked',
          durationMs: null,
          model: null,
        },
        {
          id: nextId('ev'),
          at: ago(22 * 60),
          kind: 'github',
          profile: null,
          issueKey: KEYS.tags,
          cardId: null,
          label: msg('github.reviewRequested', { pr: 74, reviewer: 'cddev', autoMerge: true }),
          detail: null,
          status: null,
          durationMs: null,
          model: null,
        },
      ],
      health: buildHealth(now),
      // Exemple générique : la vraie adresse tailnet ne vit que dans la configuration du serveur.
      addresses: { local: 'http://localhost:8446', tailnet: 'https://machine.tailnet.ts.net:8446' },
    },
    details,
    transcripts,
    profiles: buildProfiles(),
    usage: buildUsage(now),
    history: buildHistory(now),
  };
}
