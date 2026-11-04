import type {
  AcceptanceCheck,
  AcceptanceGate,
  AcceptanceGateRule,
  AcceptanceStatus,
  AcceptanceThread,
} from '@factory-live/contracts';

/**
 * The recette read on GitHub (#22): the checks of the PR's head, the gate's verdict and rules, the
 * review threads. Pure readers of GitHub's answers, so each is tested on a real one (fixtures/).
 */

/** The commit status the factory's gate posts on each head (ADR 0015 of the factory). */
export const GATE_CONTEXT = 'factory/gate';

/** A check run of the head, as `/commits/{sha}/check-runs` gives it (the fields read). */
export interface CheckRunJson {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string | null;
  check_suite: { id: number } | null;
}

/** A commit status of the head, as `/commits/{sha}/statuses` gives it, newest first. */
export interface StatusJson {
  context: string;
  state: string;
  description: string | null;
  target_url: string | null;
  created_at: string;
  updated_at: string;
}

/** A workflow run of the head, as `/actions/runs?head_sha=` gives it: its name is the check's workflow. */
export interface WorkflowRunJson {
  id: number;
  /** The workflow it runs: a newer run of the same workflow replaces an older one's reports. */
  workflow_id?: number;
  name: string | null;
  check_suite_id: number;
  html_url: string;
}

/** A comment of the PR's conversation, as `/issues/{n}/comments` gives it. */
export interface GateCommentJson {
  body: string;
  html_url: string;
  created_at: string;
  user: { type: string } | null;
}

/** The answer to the review threads query (`THREADS_QUERY`). */
export interface ThreadsJson {
  data: {
    repository: {
      pullRequest: {
        reviews: { totalCount: number };
        reviewThreads: {
          pageInfo?: { hasNextPage: boolean; endCursor: string | null };
          nodes: {
            isResolved: boolean;
            comments: {
              nodes: {
                author: { login: string } | null;
                body: string;
                createdAt: string;
                url: string;
              }[];
            };
          }[];
        };
      } | null;
    } | null;
  } | null;
}

/** The review threads of a PR and how many reviews were posted on it, by GraphQL (REST has no threads). */
export const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviews { totalCount }
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { isResolved comments(first: 1) { nodes { author { login } body createdAt url } } }
      }
    }
  }
}`;

function checkRunStatus(run: CheckRunJson): AcceptanceCheck['status'] {
  if (run.status !== 'completed') return 'pending';
  if (run.conclusion === 'success' || run.conclusion === 'neutral') return 'success';
  if (run.conclusion === 'skipped') return 'skipped';
  return 'failure';
}

function commitStatus(state: string): AcceptanceCheck['status'] {
  if (state === 'success') return 'success';
  if (state === 'pending') return 'pending';
  return 'failure';
}

function duration(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/**
 * Every check of the head: each job of a workflow and each commit status, the last run of each name
 * only (a check reruns on every edit of the PR), the gate's status apart (it is the gate).
 */
export function headChecksOf(
  runs: CheckRunJson[],
  statuses: StatusJson[],
  workflows: WorkflowRunJson[],
  commitUrl: string,
): AcceptanceCheck[] {
  const latest = new Map<string, CheckRunJson>();
  for (const run of runs) {
    const known = latest.get(run.name);
    if (!known || run.id > known.id) latest.set(run.name, run);
  }
  const fromRuns = [...latest.values()].map((run) => ({
    name: run.name,
    workflow:
      workflows.find((workflow) => workflow.check_suite_id === run.check_suite?.id)?.name ?? null,
    status: checkRunStatus(run),
    durationMs: duration(run.started_at, run.completed_at),
    url: run.html_url ?? commitUrl,
  }));
  const seen = new Set<string>();
  const fromStatuses: AcceptanceCheck[] = [];
  for (const status of statuses) {
    if (status.context === GATE_CONTEXT || seen.has(status.context)) continue;
    seen.add(status.context);
    fromStatuses.push({
      name: status.context,
      workflow: null,
      status: commitStatus(status.state),
      durationMs: null,
      url: status.target_url ?? commitUrl,
    });
  }
  return [...fromRuns, ...fromStatuses];
}

const GATE_TITLE = /^### Gate de la factory : (✅ vert|❌ rouge) \(`([0-9a-f]{7,40})`\)/m;
const RULE_STATUS: Record<string, AcceptanceGateRule['status']> = {
  '✅': 'ok',
  '❌': 'nok',
  '⚠️': 'info',
  '➖': 'info',
};

/**
 * The rules of a gate comment, in the exact format `factory-gate.py` writes: a title with the verdict
 * and the head, then the table « Règle | | Détail » (a `|` in a detail is written `/`).
 */
export function gateRulesOf(
  body: string,
): { head: string; verdict: 'ok' | 'nok'; rules: AcceptanceGateRule[] } | null {
  const title = GATE_TITLE.exec(body);
  if (!title) return null;
  const lines = body.split('\n');
  const start = lines.findIndex((line) => /^\|\s*Règle\s*\|/.test(line));
  const rules: AcceptanceGateRule[] = [];
  for (const line of start < 0 ? [] : lines.slice(start + 2)) {
    if (!line.startsWith('|')) break;
    const [rule = '', mark = '', ...detail] = line
      .slice(1, line.endsWith('|') ? -1 : undefined)
      .split('|');
    rules.push({
      rule: rule.trim(),
      status: RULE_STATUS[mark.trim()] ?? 'info',
      detail: detail.join('|').trim(),
    });
  }
  return { head: title[2]!, verdict: title[1]!.startsWith('✅') ? 'ok' : 'nok', rules };
}

function gateStatus(state: string): AcceptanceStatus {
  if (state === 'success') return 'ok';
  if (state === 'pending') return 'pending';
  return 'nok';
}

/**
 * The gate's verdict on the PR: its status on the head, with the rules of its last comment. Out of
 * the factory the gate posts a status and no comment: its description is then the only rule. A gate
 * comment written by a person is not the gate's.
 */
export function gateOf(
  status: StatusJson | null,
  comment: GateCommentJson | null,
  head: string,
  commitUrl: string,
): AcceptanceGate | null {
  const parsed = comment && comment.user?.type === 'Bot' ? gateRulesOf(comment.body) : null;
  if (parsed && comment)
    return {
      status: status ? gateStatus(status.state) : parsed.verdict,
      head: parsed.head,
      at: comment.created_at,
      url: comment.html_url,
      rules: parsed.rules,
    };
  if (!status) return null;
  return {
    status: gateStatus(status.state),
    head: head.slice(0, 7),
    at: status.updated_at,
    url: status.target_url ?? commitUrl,
    rules: status.description ? [{ rule: 'PR', status: 'info', detail: status.description }] : [],
  };
}

/**
 * A thread's title: its first bold words (Greptile's title), else its first line without markup. Shown
 * as text, never as HTML; tags go, and so does any angle bracket a broken tag would leave.
 */
function titleOf(body: string): string {
  const bold = /\*\*(.+?)\*\*/.exec(body)?.[1];
  if (bold) return bold.replace(/[<>]/g, '').trim();
  const line = body
    .split('\n')
    .map((each) => {
      // Tags removed until none is left (a broken tag can hide another), then any stray bracket.
      let text = each;
      for (let previous = ''; previous !== text;) {
        previous = text;
        text = text.replace(/<[^<>]*>/g, '');
      }
      return text.replace(/[<>*_`#]/g, '').trim();
    })
    .find(Boolean);
  return (line ?? '').slice(0, 200);
}

/** The review threads of the PR, each with its first comment, and the number of reviews posted. */
export function threadsOf(answer: ThreadsJson): {
  threads: AcceptanceThread[];
  reviewRounds: number;
} {
  const pr = answer.data?.repository?.pullRequest;
  if (!pr) return { threads: [], reviewRounds: 0 };
  const threads = pr.reviewThreads.nodes.flatMap((thread) => {
    const first = thread.comments.nodes[0];
    if (!first) return [];
    return [
      {
        author: first.author?.login ?? 'ghost',
        severity: /<img\b[^>]*\balt="(P\d)"/i.exec(first.body)?.[1] ?? null,
        title: titleOf(first.body),
        resolved: thread.isResolved,
        at: first.createdAt,
        url: first.url,
      },
    ];
  });
  return { threads, reviewRounds: pr.reviews.totalCount };
}
