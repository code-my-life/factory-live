// The inputs of the diagnosis reference outputs: for each of the 13 real incidents, the input of the
// first call to `diagnose` in its test of `diagnose.test.ts`, with the facts that test adds.
// The core (code-my-life/workflow-core) compares its port to these outputs, field by field.
import { coderProfile, incidentInput } from './incidents.fixture-builder.test-helpers.ts';
import { INCIDENTS } from './incidents.test-helpers.ts';
import type { IncidentName } from './incidents.test-helpers.ts';
import type { DiagnosisInput } from './types.ts';

export { INCIDENTS };

const HOOK = INCIDENTS.hookTimeout;

/** factory-live#2 at 09:47, when it blocked: without run 192, which did not exist yet. */
export function atBlock(patch: Partial<DiagnosisInput> = {}): DiagnosisInput {
  return incidentInput('hookTimeout', {
    profile: coderProfile(),
    sessions: HOOK.sessions.filter((session) => session.runId !== 192),
    runs: HOOK.runs.filter((run) => run.id !== 192),
    branch: 'fix/2-server-version-in-settings',
    evidence: [
      { name: '01-test-fails-on-base.txt', bytes: 6715, at: 1_793_253_600 },
      { name: '07-e2e.txt', bytes: 18_903, at: 1_793_262_000 },
    ],
    ...patch,
  });
}

export interface ReferenceCase {
  readonly name: IncidentName;
  /** The test of `diagnose.test.ts` the input comes from: `<describe> > <it>`. */
  readonly test: string;
  readonly input: () => DiagnosisInput;
}

const HOOK_TESTS = 'factory-live#2 (2026-10-29) : le délai du hook de coder-guard';
const OTHER_TESTS = 'les autres incidents réels du kanban';

function other(name: IncidentName, it: string, patch: Partial<DiagnosisInput> = {}): ReferenceCase {
  return { name, test: `${OTHER_TESTS} > ${it}`, input: () => incidentInput(name, patch) };
}

/** One case per incident, in the order of `INCIDENTS`. */
export const REFERENCE_CASES: readonly ReferenceCase[] = [
  {
    name: 'hookTimeout',
    test: `${HOOK_TESTS} > trouve la cause, qui agit, et retient le déblocage tant qu’elle est là`,
    input: () => atBlock(),
  },
  other(
    'breaker',
    'factory-live#2, première tentative : la gate s’arrête trois fois sans rendre la carte, puis le disjoncteur',
  ),
  other(
    'refusalLoop',
    'claude-cockpit#42 (PR 2a) : 65 fois le même refus de coder-guard, budget de tours compris',
  ),
  other('question', 'claude-cockpit#42 (PR 2a), plus tôt : une vraie question, à toi de répondre'),
  other(
    'budget',
    'claude-cockpit#49 : 150 tours épuisés par coder-claude, à relever dans sa config',
  ),
  other('quota', 'claude-cockpit#49 (brief) : le quota du fournisseur, rien à faire qu’attendre'),
  other(
    'spawn',
    'claude-cockpit#8 : le worker ne se lance pas, le board n’a pas de dossier de travail',
  ),
  other(
    'stalled',
    'claude-cockpit#8 : le fournisseur muet 669 s, puis toute la chaîne de repli en échec',
  ),
  other(
    'failing',
    'claude-cockpit#8 : le fournisseur muet 669 s, puis toute la chaîne de repli en échec',
  ),
  other('prInfra', 'claude-cockpit#8 (rework) : le contrôle de PR d’Hermès ne joint pas GitHub'),
  other(
    'prChecks',
    'claude-cockpit#42 (PR 2b) : aucun check requis sur le dépôt, la gate ne peut pas valider',
  ),
  other('triage', 'claude-cockpit#42 (PR 2b) : deux blocages identiques, la carte est en triage'),
  other(
    'held',
    'claude-cockpit#42 (PR 2a) : la carte prête, retenue par la garde active_pr, à relayer',
    {
      owner: 'coder',
    },
  ),
];
