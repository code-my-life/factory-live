import type { IssueLabel } from '@factory-live/contracts';
import type { Run, Task } from '@factory-live/domain';
import { describe, expect, it } from 'vitest';
import { projectIssues } from './projection.ts';
import type { ProjectionInput } from './projection.ts';

const CARD = 't_49a1b2c3';
const T0 = 1_793_260_612;

const LABELS: IssueLabel[] = [
  { name: 'factory', color: 'a2eeef' },
  { name: 'claude:claude-sonnet-5-5', color: 'ededed' },
];

function task(): Task {
  return {
    id: CARD,
    title: 'impl cv-site#49 : titre',
    body: '',
    assignee: 'coder-claude',
    status: 'running',
    createdAt: T0 - 600,
    startedAt: T0,
    completedAt: null,
    idempotencyKey: null,
    blockKind: null,
    currentRunId: 1,
    workspacePath: null,
    skills: [],
    modelOverride: null,
    providerOverride: null,
    lastHeartbeatAt: T0 + 60,
    branchName: null,
    consecutiveFailures: 0,
    blockRecurrences: 0,
    lastFailureError: null,
    maxRuntimeSeconds: null,
  };
}

function run(metadata: Run['metadata']): Run {
  return {
    id: 1,
    taskId: CARD,
    profile: 'coder-claude',
    status: 'running',
    outcome: null,
    startedAt: T0,
    endedAt: null,
    summary: null,
    metadata,
    error: null,
  };
}

/** A minimal projection input: one implementer card, one run, no event, link or comment. */
function input(metadata: Run['metadata']): ProjectionInput {
  return {
    now: (T0 + 120) * 1000,
    board: { tasks: [task()], runs: [run(metadata)], events: [], links: [], comments: [] },
    owner: 'code-my-life',
    boardName: 'factory',
    dashboardUrl: null,
    heldAfterSeconds: 600,
    profiles: [],
    live: new Map(),
    issueInfo: () => ({
      title: 'titre',
      url: 'https://github.com/code-my-life/cv-site/issues/49',
      labels: LABELS,
    }),
    pullRequest: () => null,
    unblock: () => null,
    stations: new Map(),
    configModel: () => null,
    keepFinishedMs: Number.MAX_SAFE_INTEGER,
    diagnosis: () => null,
    resolved: [],
  };
}

describe('projectIssues', () => {
  it("lit le modèle Claude sur une étiquette claude: quand le run n'en déclare pas", () => {
    const [summary] = projectIssues(input({}), []);

    expect(summary?.claudeModel).toBe('claude-sonnet-5-5');
    // The labels reach the summary untouched, color included.
    expect(summary?.labels).toEqual(LABELS);
  });

  it("préfère la métadonnée claude_model du run à l'étiquette", () => {
    const [summary] = projectIssues(input({ claude_model: 'claude-opus-5-5' }), []);

    expect(summary?.claudeModel).toBe('claude-opus-5-5');
  });
});
