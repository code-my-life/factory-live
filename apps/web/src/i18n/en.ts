import type { BlockKind } from '@factory-live/contracts';
import { formatters } from '../ui/format.ts';
import type { Messages, ServerMessages } from './fr.ts';

/** Le dictionnaire anglais : la forme du français, entière (vérifiée à la compilation). */
const f = formatters('en');

const cardStatus: Messages['cardStatus'] = {
  triage: 'Triage',
  todo: 'To do',
  scheduled: 'Scheduled',
  ready: 'Ready',
  running: 'Running',
  blocked: 'Blocked',
  review: 'In review',
  done: 'Done',
  archived: 'Archived',
};

const blockKind = {
  needs_input: 'decision needed',
  capability: 'missing tool or access',
  transient: 'transient failure',
  dependency: 'dependency',
} satisfies Record<BlockKind, string>;

const SKILL_ACTIONS: Readonly<Record<string, string>> = {
  loaded: 'Skill loaded',
  created: 'Skill created',
  edited: 'Skill edited',
  patched: 'Skill edited',
  installed: 'Skill installed',
};

const attempt = (current: number | null, total: number | null) =>
  current !== null && total !== null ? ` (attempt ${current} of ${total})` : '';

const statusLabel = (status: string) =>
  (cardStatus as Readonly<Record<string, string>>)[status] ?? status;

const runOutcome: Messages['runOutcome'] = {
  completed: 'completed',
  review_requested: 'review requested',
  changes_requested: 'changes requested',
  blocked: 'blocked',
  crashed: 'crashed',
  gave_up: 'gave up',
  timed_out: 'timed out',
  rate_limited: 'provider limit',
  reclaimed: 'reclaimed',
  spawn_failed: 'failed to start',
  scheduled: 'scheduled',
  discarded: 'discarded',
};

const outcomeLabel = (outcome: string) => runOutcome[outcome] ?? outcome;

/** A delay in seconds, written like the other durations: "30s", "10m", "7m". */
const secs = (seconds: number) => f.duration(seconds * 1000);

const gaveUp = (failures: number | null) =>
  failures === null
    ? 'Gave up after several failures'
    : `Gave up after ${failures} ${f.plural(failures, 'failure', 'failures')}`;

const server: ServerMessages = {
  'activity.tool.unknown': () => 'tool',
  'activity.action.llm': () => 'Calling the model',
  'activity.llm.tokens': ({ input, output }) =>
    `${f.integer(input)} tokens in, ${f.integer(output)} out`,
  'activity.llm.rateLimited': ({ model, attempt: current, attempts }) =>
    `429 on ${model}${attempt(current, attempts)}`,
  'activity.llm.error': ({ status, model, attempt: current, attempts }) =>
    `Error${status ? ` ${status}` : ''} on ${model}${attempt(current, attempts)}`,
  'activity.skill': ({ action }) => SKILL_ACTIONS[action] ?? `Skill: ${action}`,
  'activity.session.end': ({ outcome }) =>
    outcome === 'failed'
      ? 'Session failed'
      : outcome === 'interrupted'
        ? 'Session interrupted'
        : 'Session ended',
  'activity.kanban.claimed': ({ profile }) => `The dispatcher starts ${profile}`,
  'activity.worker.spawned': () => 'Worker started',
  'activity.worker.exited': () => 'Worker stopped',
  'activity.worker.stale': () => 'Card taken back from a silent worker',
  'activity.subagent.start': () => 'Subagent started',
  'activity.subagent.stop': () => 'Subagent finished',

  'timeline.created': () => 'Card created',
  'timeline.created.for': ({ assignee }) => `for ${assignee}`,
  'timeline.claimed': () => 'Card claimed',
  'timeline.promoted': () => 'Card ready',
  'timeline.promoted.detail': () => 'its dependencies are done',
  'timeline.status': ({ status }) => `Status: ${statusLabel(status)}`,
  'timeline.assigned': ({ assignee }) => `Reassigned to ${assignee ?? '?'}`,
  'timeline.assigned.from': ({ from }) => `previously: ${from}`,
  'timeline.edited': () => 'Card edited',
  'timeline.attached': () => 'Attachment',
  'timeline.scheduled': () => 'Card scheduled',
  'timeline.reviewRequested': ({ reviewer }) => `Review requested from ${reviewer ?? 'the gate'}`,
  'timeline.reviewReopened': () => 'Review reopened',
  'timeline.changesRequested': ({ reviewer }) => `Changes requested by ${reviewer ?? 'the gate'}`,
  'timeline.prChecks.passed': () => 'PR checks passed',
  'timeline.prChecks.failed': () => 'PR checks failed',
  'timeline.completed': () => 'Card completed',
  'timeline.archived': () => 'Card archived',
  'timeline.blocked': ({ kind }) => (kind ? `Card blocked: ${blockKind[kind]}` : 'Card blocked'),
  'timeline.unblocked': () => 'Card unblocked',
  'timeline.blockLoop': () => 'Block loop: card moved to triage',
  'timeline.respawnGuarded': () => 'Restart held back',
  'timeline.respawnGuarded.activePr': () =>
    'A PR cited less than 24 h ago is waiting for a relay (active_pr guard)',
  'timeline.dependencyWait': () => 'Waiting for the parent card',
  'timeline.reclaimed': () => 'Card taken back from the worker',
  'timeline.reclaimed.manual': () => 'by hand',
  'timeline.crashed': () => 'Worker crashed',
  'timeline.timedOut': () => 'Worker timed out',
  'timeline.rateLimited': () => 'Worker stopped by a provider limit',
  'timeline.protocolViolation': () => 'Worker exited without completing or blocking the card',
  'timeline.protocolViolation.nudged': () =>
    'Hermès had nudged it to hand the card back: it exited anyway',
  'timeline.spawnFailed': () => 'Worker failed to start',
  'timeline.gaveUp': ({ failures }) => gaveUp(failures),
  'timeline.workerReaped': () => 'Leftover worker stopped',
  'timeline.modelOverride': ({ model }) => `Model overridden: ${model ?? '?'}`,
  'timeline.reasoningEffort': ({ effort }) => `Reasoning effort: ${effort ?? '?'}`,
  'timeline.comment': ({ author }) => `Comment from ${author}`,

  'intervention.title.prReady': () => 'PR ready to approve',
  'intervention.title.mainRed': () => 'Main is red after the merge',
  'intervention.title.gaveUp': ({ failures }) => gaveUp(failures),
  'intervention.title.needsInput': () => 'Decision needed',
  'intervention.title.capability': () => 'Missing tool or access',
  'intervention.title.transient': () => 'Transient failure',
  'intervention.title.blocked': () => 'Card blocked',
  'intervention.title.triageLoop': () => 'Blocked twice for the same reason: card moved to triage',
  'intervention.title.held': ({ minutes }) => `Card ready but held for ${minutes} min`,
  'intervention.question.prReady': () =>
    'The gate approved the PR: your approval on GitHub triggers the merge.',
  'intervention.question.gaveUp': () => 'The dispatcher’s circuit breaker stopped the card.',
  'intervention.question.needsInput': () => 'The agent is waiting for your decision.',
  'intervention.question.capability': () => 'The agent is missing a tool or an access.',
  'intervention.question.transient': () => 'Transient failure of the lane.',
  'intervention.question.blocked': () => 'Card blocked with no reason given.',
  'intervention.question.triageLoop': () =>
    '`/factory unblock` doesn’t apply to a card in triage. Take it out from the Hermès dashboard (drag it to Ready), never with specify or decompose: a specifier could rewrite the brief.',
  'intervention.question.held': () =>
    'The dispatcher is holding the card back: a comment less than 24 h old cites a PR URL, with no relay since. That’s Hermès’s `active_pr` guard against duplicate PRs. The card isn’t blocked, so `/factory unblock` doesn’t apply: it has to be relayed.',
  'intervention.action.openIssue': ({ issueKey }) => `Open issue ${issueKey}`,
  'intervention.action.showCard': () => 'Show the card in the CLI',
  'intervention.action.approvePr': () => 'Approve the PR on GitHub',
  'intervention.action.prWorkflows': () => 'View the PR and its workflows',
  'intervention.action.reassignCoder': () => 'Reassign to coder (native Hermès)',
  'intervention.action.dashboard': () => 'Open the Hermès dashboard',
  'intervention.action.relay': ({ owner }) => `Restart through a relay (scribe, then ${owner})`,

  'diagnosis.summary.guardHookTimeout': ({ plugin, seconds }) =>
    `${plugin ? `${plugin}’s check` : 'A check'} exceeds the Hermès hook timeout (${secs(seconds)})`,
  'diagnosis.summary.guardHookHung': ({ plugin }) =>
    `${plugin ?? 'A guard'} no longer answers: Hermès refuses the agent’s tools`,
  'diagnosis.summary.guardHookRaised': ({ plugin }) =>
    `${plugin ?? 'A guard'} crashes on every call: Hermès refuses the tool`,
  'diagnosis.summary.pluginLoadFailed': ({ plugin }) =>
    `The ${plugin} plugin fails to load: its checks no longer run`,
  'diagnosis.summary.stoppedAfterRefusals': () => 'The agent stopped after its tools were refused',
  'diagnosis.summary.stoppedWithoutKanbanCall': ({ count }) =>
    count > 1
      ? `The model stops without handing the card back (${count} times)`
      : 'The model stopped without handing the card back',
  'diagnosis.summary.protocolBreaker': ({ count }) =>
    `Hermès stopped the card after ${count} exits without a kanban call`,
  'diagnosis.summary.iterationBudget': ({ max }) => `The agent used up its ${max} turns`,
  'diagnosis.summary.runtimeLimit': ({ seconds }) =>
    `The run exceeded its maximum duration (${secs(seconds)})`,
  'diagnosis.summary.toolDeadline': ({ tool, seconds }) =>
    `The ${tool} tool hit the Hermès ceiling (${secs(seconds)})`,
  'diagnosis.summary.commandTimeout': ({ seconds }) =>
    `A command exceeded the terminal timeout (${secs(seconds)})`,
  'diagnosis.summary.guardRefusal': ({ plugin }) => `${plugin} refuses the agent’s action`,
  'diagnosis.summary.refusalLoop': ({ plugin, count }) =>
    `The agent hit the same ${plugin} refusal ${count} times`,
  'diagnosis.summary.providerQuota': ({ provider }) =>
    `${provider ?? 'Its provider'} quota reached: the card is waiting`,
  'diagnosis.summary.providerTerminal': ({ provider }) =>
    `${provider ?? 'The provider'} rejects the agent’s key or model`,
  'diagnosis.summary.providerUnavailable': ({ mode, seconds }) =>
    mode === 'stalled'
      ? `The model stopped answering: turn cut after ${seconds === null ? 'too long' : secs(seconds)} without progress`
      : 'Every provider in the agent’s chain is failing',
  'diagnosis.summary.prAcceptanceMissing': () =>
    'Hermès refuses to accept the PR: its contract is incomplete',
  'diagnosis.summary.spawnFailed': () => 'Hermès cannot start the agent',
  'diagnosis.summary.prAcceptanceInfra': () => 'Hermès could not check the PR on GitHub',
  'diagnosis.summary.heldActivePr': ({ minutes }) =>
    `Card ready but held back for ${minutes}m (active_pr guard)`,
  'diagnosis.summary.triageLoop': () => 'Two identical blocks: the card moved to triage',
  'diagnosis.summary.question': () => 'The agent is waiting for your decision',
  'diagnosis.summary.unexplained': () => 'Block with no known cause',
  'diagnosis.why.guardHookTimeout': ({ plugin, trigger, seconds }) =>
    `${plugin ?? 'A guard'} runs its checks in a pre_tool_call hook${trigger ? `, on every ${trigger}` : ''}. Hermès cuts that hook after ${secs(seconds)}, refuses the tool, then refuses every tool of the agent for 60s: it can neither commit nor hand the card back. The cut checks keep running and slow down the next one.`,
  'diagnosis.why.guardHookHung': ({ plugin, workers }) =>
    `${plugin ?? 'The guard'} no longer returns${workers ? `: ${workers} abandoned ${f.plural(workers, 'call is', 'calls are')} still running` : ''}. Hermès refuses every tool of the agent until one of those calls finishes.`,
  'diagnosis.why.guardHookRaised': ({ plugin }) =>
    `The pre_tool_call hook of ${plugin ?? 'the guard'} raises an exception on every call. A guard that crashes decides nothing: Hermès refuses the tool to be safe.`,
  'diagnosis.why.pluginLoadFailed': ({ plugin }) =>
    `Hermès could not load ${plugin} when the agent started: its checks and notifications do not run.`,
  'diagnosis.why.stoppedAfterRefusals': () =>
    'Its last calls were refused, including the ones that hand the card back (kanban_complete, kanban_request_review): the agent exited without finishing or blocking the card.',
  'diagnosis.why.stoppedWithoutKanbanCall': ({ nudges }) =>
    `The model ended its turn without calling kanban_complete, kanban_request_review or kanban_block${nudges ? `, despite ${nudges} ${f.plural(nudges, 'nudge', 'nudges')} from Hermès` : ''}. None of its tools was refused: the cause is the model, not the factory.`,
  'diagnosis.why.protocolBreaker': ({ count }) =>
    `After ${count} exits in a row without a kanban call, the Hermès breaker blocks the card, with no kind and no question.`,
  'diagnosis.why.iterationBudget': ({ used, max }) =>
    `The run used ${used} of ${max} turns without finishing: Hermès stopped it.`,
  'diagnosis.why.runtimeLimit': ({ seconds, limit }) =>
    `The run lasted ${secs(seconds)} for a limit of ${secs(limit)}: Hermès stopped it.`,
  'diagnosis.why.toolDeadline': ({ tool, seconds }) =>
    `Hermès caps every tool call, hooks included, at ${secs(seconds)}: the ${tool} call was cut.`,
  'diagnosis.why.commandTimeout': ({ seconds }) =>
    `A terminal command ran past ${secs(seconds)} and was stopped.`,
  'diagnosis.why.guardRefusal': ({ plugin }) =>
    `${plugin} is a factory guard: it refuses whatever breaks its rules, and the agent must fix things before trying again. This is the normal flow.`,
  'diagnosis.why.refusalLoop': ({ plugin, count }) =>
    `The agent got the same ${plugin} refusal ${count} times without changing its approach: it is going in circles.`,
  'diagnosis.why.providerQuota': ({ provider }) =>
    `${provider ?? 'The provider'} answers 429: Hermès puts the card on hold, then restarts it on its own.`,
  'diagnosis.why.providerTerminal': ({ provider }) =>
    `${provider ?? 'The provider'} rejects the configured key or model: restarting is useless until that is fixed.`,
  'diagnosis.why.providerUnavailable': ({ mode, seconds }) =>
    mode === 'stalled'
      ? `The provider sent nothing for ${seconds === null ? 'too long' : secs(seconds)}: the Hermès watchdog cut the turn and the worker stopped. Restarting may be enough; if it happens again, switch models.`
      : 'Every provider in the fallback chain failed one after the other: Hermès stopped the turn instead of retrying forever.',
  'diagnosis.why.prAcceptanceMissing': ({ checks }) =>
    checks
      ? 'Before accepting kanban_complete, the kanban core checks the PR’s required checks. The repository declares none: it needs required checks on the protected branch, or a local contract for a card without CI.'
      : 'Before accepting kanban_complete, the kanban core checks that the declared PR matches the card’s contract. Part of it is missing: see the exact quote.',
  'diagnosis.why.spawnFailed': () =>
    'The worker failed to start before the agent did any work: see the exact Hermès error.',
  'diagnosis.why.prAcceptanceInfra': () =>
    'The PR check of the kanban core could not query GitHub (gh too old, or authentication).',
  'diagnosis.why.heldActivePr': () =>
    'Hermès holds back a card that cited a PR less than 24 h ago, to avoid duplicate PRs. It needs a relay: scribe, then the original agent.',
  'diagnosis.why.triageLoop': () =>
    'Two blocks of the same kind in a row: Hermès moves the card to triage, where "Unblock" no longer applies.',
  'diagnosis.why.question': () =>
    'The agent asks a question and no technical cause shows in its last calls: it is waiting for your answer.',
  'diagnosis.why.unexplained': () =>
    'No rule recognizes this block. Here are the latest raw signals, and what the agent wrote.',
  'diagnosis.step.setValue': ({ key, value, profile }) => `Set ${key} to ${value} for ${profile}`,
  'diagnosis.step.reportInRepo': ({ path }) =>
    `Copy the value into ${path} in the factory repository, or the next ./install.sh erases it`,
  'diagnosis.step.verifyValue': ({ key }) => `Check the value of ${key} in service`,
  'diagnosis.step.unblockWithTemplate': () => 'Unblock with the prefilled answer below',
  'diagnosis.step.answer': () => 'Answer the agent’s question, below',
  'diagnosis.step.fixPlugin': ({ plugin }) => `Fix ${plugin} in the factory repository`,
  'diagnosis.step.reinstall': () => 'Run ./install.sh when no card is running',
  'diagnosis.step.chooseModel': () => 'Give the card another model: a claude:… label on the issue',
  'diagnosis.step.giveCommand': () =>
    'In your answer, give the agent the exact command that complies with the guard',
  'diagnosis.step.wait': ({ minutes }) =>
    `Nothing to do: the card restarts on its own within ${minutes}m`,
  'diagnosis.step.checkProvider': ({ provider }) =>
    `Check the key and model of ${provider ?? 'its provider'}`,
  'diagnosis.step.relay': ({ owner }) => `Restart through a relay: scribe, then ${owner}`,
  'diagnosis.step.leaveTriage': () => 'Take the card out of triage from the Hermès dashboard',
  'diagnosis.step.updateGh': () =>
    'Check gh: a recent version in ~/.local/bin and the App authentication (factory RUNBOOK)',
  'diagnosis.step.configureChecks': () =>
    'Declare the required checks of the repository’s protected branch, then restart the gate',
  'diagnosis.step.fixWorkspace': () =>
    'Recreate the card, or set the board’s default working directory (default_workdir)',
  'diagnosis.step.raiseLimit': ({ key, profile }) =>
    `Raise ${key} for ${profile}, or split the card`,
  'diagnosis.evidence.toolRefusals': ({ count, tools }) =>
    `${count} ${f.plural(count, 'tool refused', 'tools refused')} (${tools})`,
  'diagnosis.evidence.hookTimedOut': ({ callback, seconds }) =>
    `${callback} hook cut after ${secs(seconds)}`,
  'diagnosis.evidence.trigger': ({ tool }) => `first call cut: ${tool}`,
  'diagnosis.evidence.settingMissing': ({ key, seconds }) =>
    `${key} missing from the config: ${secs(seconds)} by default`,
  'diagnosis.evidence.settingValue': ({ key, value }) => `${key}: ${value}`,
  'diagnosis.evidence.settingChanged': ({ key, value }) => `${key} set to ${value}`,
  'diagnosis.evidence.toolDeadlineCap': ({ seconds }) =>
    `Hermès tool ceiling: ${secs(seconds)}, hook included`,
  'diagnosis.evidence.pluginHook': ({ plugin, callback, hook }) =>
    `${plugin} hooks ${callback} on ${hook}`,
  'diagnosis.evidence.workerExited': () => 'worker exited without a kanban call',
  'diagnosis.evidence.stopNudges': ({ count }) =>
    `${count} Hermès ${f.plural(count, 'nudge', 'nudges')} to hand the card back`,
  'diagnosis.evidence.guardMessage': ({ plugin, count }) =>
    `${plugin} refusal${count > 1 ? ` (${count} times)` : ''}`,
  'diagnosis.evidence.commitPassed': ({ seconds }) =>
    `commit check finished in ${secs(seconds)}, within the new timeout`,
  'diagnosis.evidence.breaker': ({ count }) => `breaker after ${count} exits without a kanban call`,
  'diagnosis.evidence.apiErrors': ({ count, provider }) =>
    `${count} API ${f.plural(count, 'error', 'errors')}${provider ? ` at ${provider}` : ''}`,
  'diagnosis.evidence.kanbanErrors': ({ count, tool }) =>
    `${count} ${tool} ${f.plural(count, 'call', 'calls')} failed`,
  'diagnosis.evidence.prAcceptance': ({ classification, count }) =>
    `Hermès PR check: ${classification}${count > 1 ? ` (${count} times)` : ''}`,
  'diagnosis.evidence.spawnError': () => 'worker start error',
  'diagnosis.evidence.workerOutput': () => 'last worker output',
  'diagnosis.evidence.budget': ({ used, max }) => `${used} of ${max} turns`,
  'diagnosis.evidence.lastSignals': ({ count }) =>
    `${count} latest ${f.plural(count, 'signal', 'signals')}`,
  'diagnosis.run.modelStopped': () => 'stopped without a kanban call (the model)',
  'diagnosis.run.refusedThenStopped': ({ count }) =>
    `${count} ${f.plural(count, 'tool refused', 'tools refused')}, then exited without a kanban call`,
  'diagnosis.run.blockedAfterRefusals': ({ count }) =>
    `blocked after ${count} ${f.plural(count, 'tool refused', 'tools refused')}`,
  'diagnosis.run.breaker': () => 'stopped by the Hermès breaker',
  'diagnosis.run.timedOut': () => 'stopped by a Hermès limit',
  'diagnosis.run.quota': () => 'put on hold by the provider',
  'diagnosis.run.refusalLoop': ({ count }) => `same refusal ${count} times`,
  'diagnosis.run.providerUnavailable': () => 'stopped: provider unavailable',
  'diagnosis.run.spawnFailed': () => 'failed to start',
  'diagnosis.run.prAcceptance': () => 'PR rejected by the Hermès check',
  'diagnosis.run.question': () => 'blocked on a question for you',
  'diagnosis.run.unexplained': ({ outcome }) => `${outcomeLabel(outcome)}, no known cause`,
  'diagnosis.unblock.hookTimeoutFixed': ({ plugin, seconds, value, branch, committed, evidence }) =>
    [
      `The block did not come from your work: ${plugin ?? 'a guard'} exceeded the ${secs(seconds)} Hermès hook timeout, hence the refused tools. That timeout is now ${secs(value)}.`,
      `Do not redo the implementation: it is in your worktree${branch ? `, on ${branch}` : ''}${committed ? '' : ', uncommitted'}${evidence ? `, and your ${evidence} evidence ${f.plural(evidence, 'file is', 'files are')} in evidence/` : ''}. Read the diff, then finish the flow: git add file by file, then git commit in a separate command (the check takes several minutes: wait for its answer without restarting it), push, draft PR, then kanban_request_review.`,
      'If a tool gets stuck again, call kanban_block with the exact error message instead of ending the run without a kanban call.',
    ].join('\n\n'),
  'diagnosis.unblock.causeFixed': ({ branch }) =>
    `The cause of the block is fixed on the factory side. Pick up where you left off${branch ? `, on ${branch}` : ''}, without redoing what is done, and finish with kanban_request_review, or with kanban_block and the exact message if it still gets stuck.`,
  'diagnosis.unblock.refusalLoop': ({ plugin, refusal }) =>
    `You keep getting the same ${plugin} refusal: "${refusal}". Do exactly what it asks before trying again, without working around it. If you cannot see how, call kanban_block quoting that refusal.`,
  'diagnosis.unblock.finishWithKanbanCall': () =>
    'Pick the card up where you left off, and always end your run with a kanban call: kanban_request_review if the work is ready, kanban_block with the exact reason otherwise. Never stop on a plain message.',

  'health.gateway': () => 'Hermès gateway',
  'health.gateway.running': ({ seconds }) => `Running, probe received ${f.ago(seconds)}`,
  'health.gateway.silent': ({ seconds }) => `Silent for ${f.span(seconds)}`,
  'health.gateway.never': () => 'No word from the probe since factory-live started',
  'health.dispatcher': () => 'Kanban dispatcher',
  'health.dispatcher.noTick': () => 'No tick received (gateway webhooks not wired?)',
  'health.dispatcher.paused': ({ seconds }) => `Paused, last tick ${f.ago(seconds)}`,
  'health.dispatcher.lastTick': ({ seconds }) => `Last tick ${f.ago(seconds)}`,
  'health.webhook': () => 'GitHub webhook listener',
  'health.notReported': () => 'Not reported by the probe yet',
  'health.provider': ({ provider }) => `${provider} provider`,
  'health.nvidia': () => 'NVIDIA API',
  'health.provider.lastOk': ({ seconds }) => `Last successful call ${f.ago(seconds)}`,
  'health.provider.none': () => 'No successful call observed',
  'health.claude': () => 'Claude Code (subscription)',
  'health.claude.none': () => 'No Claude lane observed',
  'health.claude.lastSession': ({ seconds }) => `Last session ${f.ago(seconds)}`,
  'health.github': () => 'GitHub API',
  'health.github.notYet': () => 'Not queried yet',
  'health.github.ok': () => 'GitHub access valid',
  'health.github.token': () => 'Fallback fine-grained token',
  'health.github.app.user': ({ slug, login }) => `App ${slug}, signed in as ${login}`,
  'health.github.app.fallback': ({ slug }) => `App ${slug}, unblocking with the fallback token`,
  'health.github.app.loginNeeded': ({ slug }) => `App ${slug}, GitHub sign-in needed to unblock`,
  'health.github.noAccess': () => 'No GitHub access: create and install the factory-live App',
  'health.github.loginToWrite': () => 'Sign in to GitHub in factory-live to write in your name',
  'health.github.unauthorized': () => 'Access denied (401): reconnect or reinstall the GitHub App',
  'health.github.forbidden': () => 'Access denied or quota exhausted (403)',
  'health.github.error': ({ status, issue }) =>
    status === null ? `Network error on ${issue}` : `Error ${status} on ${issue}`,
  'health.github.noToken': () =>
    'No token in ~/.config/factory-live/github-token: read-only kanban',
  'health.githubDeliveries': () => 'GitHub webhooks (as GitHub sees them)',
  'health.githubDeliveries.last': ({ status, seconds }) =>
    `Last delivery: HTTP ${status} ${f.ago(seconds)}`,
  'health.probe': () => 'factory-live-probe',
  'health.probe.last': ({ seconds }) => `Last report ${f.ago(seconds)}`,
  'health.probe.none': () => 'No report received (probe not deployed yet?)',
  'health.sources': () => 'factory-live sources',
  'health.sources.detail': ({ kanban, cards, kanbanError, sessionsError }) => {
    const read =
      kanban === 'pending'
        ? 'kanban.db not read yet'
        : kanban === 'read'
          ? `kanban.db read (${cards} ${f.plural(cards, 'card', 'cards')})`
          : `kanban.db unreadable: ${kanbanError ?? '?'}`;
    return `${read}; ${sessionsError ?? 'sessions readable on demand'}`;
  },
  'health.metric.running': () => 'In progress',
  'health.metric.perAgent': () => 'Per agent',
  'health.metric.rateLimited': () => '429s in 10 min',
  'health.metric.quota': () => 'Remaining quota',
  'health.metric.hooksPerMinute': () => 'Webhooks per minute',
  'health.metric.lastHook': () => 'Last webhook',
  'health.value.ofTotal': ({ value, total }) =>
    `${f.integer(value)} of ${total === null ? '?' : f.integer(total)}`,
  'health.value.atMost': ({ max }) => `at most ${max}`,
  'health.value.none': () => 'none',
  'health.value.ago': ({ seconds }) => f.ago(seconds),
  'health.guards': () => 'Guard timeouts',
  'health.guards.ok': () => 'Every guard finishes within its hook timeout',
  'health.guards.risk': ({ count }) =>
    count > 1
      ? `${count} guards can exceed their hook timeout`
      : 'One guard can exceed its hook timeout',
  'health.guards.riskItem': ({ profile, plugin }) => `${plugin} on ${profile}`,
  'health.guards.limits': ({ longest, limit }) =>
    `commands up to ${secs(longest)}, hook cut at ${secs(limit)}`,

  'github.labeled': ({ label, actor }) => `Label ${label} added by ${actor}`,
  'github.prOpened': ({ pr, draft }) => `PR #${pr} opened${draft ? ' as a draft' : ''}`,
  'github.diffstat': ({ additions, deletions, files }) =>
    `+${additions} −${deletions}, ${files} ${f.plural(files, 'file', 'files')}`,
  'github.reviewRequested': ({ pr, reviewer, autoMerge }) =>
    `PR #${pr}: review requested from @${reviewer}${autoMerge === true ? ', auto-merge on' : autoMerge === false ? ', no auto-merge' : ''}`,
  'github.merged': () => 'Merged into main, workflows green',
  'github.answerPosted': ({ issueKey }) => `Answer posted on ${issueKey}`,
  'github.answerAcknowledged': () => 'The bot acknowledged the answer',
  'unblock.sent': () => 'Answer sent from factory-live',

  'transcript.hermes': ({ profile, session }) =>
    `Hermès session of ${profile}${session ? ` (${session})` : ''}`,
  'transcript.claudeCode': ({ costUsd }) =>
    `Claude Code lane${costUsd === null ? '' : ` (${f.usd(costUsd)})`}`,
  'agent.role.default': () => 'Hermès agent',
  'usage.claudeNote': () =>
    'The Claude subscription balance has no reliable source: factory-live only shows a limit when a Claude Code transcript reports one.',
  'push.test.title': () => 'factory-live: test',
  'push.test.body': () => 'Notifications work on this device.',
};

export const en: Messages = {
  station: {
    intake: 'Intake',
    brief: 'Brief',
    implementation: 'Implementation',
    gate: 'Gate',
    release: 'Release',
    done: 'Done',
    stopped: 'Stopped',
    side: 'Side track',
  },
  stationHint: {
    intake: 'Issue labeled factory, card created',
    brief: 'The coordinator writes the brief and the card graph',
    implementation: 'Failing test, fix, evidence, draft PR',
    gate: 'Independent check, green CI required',
    release: 'Your approval, merge, tag, main CI',
    done: 'Merged, main workflows green',
    stopped: 'Stopped or PR closed',
    side: 'Triage, watch, onboarding',
  },
  agentState: {
    idle: 'Idle',
    queued: 'Queued',
    thinking: 'Thinking',
    tool: 'Tool',
    cli: 'CLI lane',
    blocked: 'Blocked',
  },
  issueStatus: {
    active: 'In progress',
    queued: 'Queued',
    waiting_human: 'Waiting for you',
    blocked: 'Blocked',
    done: 'Done',
    stopped: 'Stopped',
  },
  intervention: {
    needs_input: 'Decision needed',
    capability: 'Missing tool or access',
    transient: 'Transient failure',
    gave_up: 'Gave up',
    triage_loop: 'Block loop',
    held_active_pr: 'Card held',
    pr_approval: 'PR to approve',
    main_red: 'Main is red',
    service_down: 'Service down',
  },
  interventionAction: {
    needs_input: 'Reply',
    capability: 'Reply',
    transient: 'Unblock',
    gave_up: 'Unblock',
    triage_loop: 'See the procedure',
    held_active_pr: 'See the commands',
    pr_approval: 'Approve the PR',
    main_red: 'See the runs',
    service_down: 'See health',
  },
  cardKind: {
    brief: 'Brief',
    impl: 'Implementation',
    release: 'Release',
    diagnostic: 'Diagnostic',
    watch: 'Watch',
    onboarding: 'Onboarding',
    other: 'Other',
  },
  cardStatus,
  runOutcome,
  runRole: {
    coordinator: 'coordination',
    implementer: 'implementation',
    reviewer: 'review',
    release: 'release',
    other: 'other',
  },
  modelSource: {
    live: 'seen on the latest call',
    session: 'recorded in the session',
    override: 'overridden on the card',
    config: 'agent configuration',
  },
  healthStatus: {
    ok: 'OK',
    degraded: 'Degraded',
    down: 'Down',
    unknown: 'Unknown',
  },

  common: {
    labelValue: (label, value) => `${label}: ${value}`,
    colon: ': ',
    free: 'free',
    unknown: '?',
    lane: 'lane',
    issueCount: (count) => `${count} ${f.plural(count, 'issue', 'issues')}`,
    cardCount: (count) => `${count} ${f.plural(count, 'card', 'cards')}`,
    waitingForSlot: (max) =>
      `Waiting for a slot: at most ${max} ${f.plural(max, 'card', 'cards')} in progress`,
  },

  nav: {
    line: 'Factory line',
    lineShort: 'Line',
    issues: 'Issues',
    interventions: 'Interventions',
    agents: 'Agents',
    health: 'Health',
    costs: 'Costs and quotas',
    history: 'History and stats',
    settings: 'Settings',
    more: 'More',
    main: 'Main navigation',
    tabs: 'Navigation',
  },

  shell: {
    home: 'factory-live, back to the factory line',
    offline: 'Offline',
    lastState: 'last update',
    unreachable: 'factory-live unreachable',
    connecting: 'Connecting…',
    paused: (reason) => (reason ? `Paused: ${reason}` : 'Paused'),
    live: 'Live',
    silent: 'Factory silent',
    running: (running, max) => `${running} of ${max} ${f.plural(max, 'card', 'cards')} running`,
    demo: 'Demo',
    replayDemo: 'Replay the demo scenario',
    interventionsWaiting: (count) => `Interventions: ${count} waiting`,
    servicesToWatch: (count) => `${count} ${f.plural(count, 'service', 'services')} to watch`,
    board: 'board',
  },

  motion: {
    reduced: 'Animations reduced by the system',
    resume: 'Resume animations',
    pause: 'Pause animations',
  },

  notFound: {
    title: 'Page not found',
    text: 'This address doesn’t match any view.',
    back: 'Back to the factory line',
  },

  line: {
    title: 'Factory line',
    openIssues: (count) => `${count} ${f.plural(count, 'issue', 'issues')} in progress`,
    lastEvent: 'last event',
    blockersWaiting: (count) =>
      `${count} ${f.plural(count, 'blocker', 'blockers')} waiting for you`,
    blockerItem: (where, title) => `${where ?? 'card'}: ${title}`,
    seeInterventions: 'View interventions',
    label: 'Factory line: the stages of an issue, from intake to merge',
    stepIssues: (count) => `: ${count} ${f.plural(count, 'issue', 'issues')}`,
    issuesAt: (station) => `Issues at the ${station} stage`,
    crewOf: (station) => `Agents at the ${station} stage`,
    now: 'Right now',
    allAgents: 'All agents',
    noAgent: 'No agent at work: the line is waiting for an issue labeled factory.',
  },

  activity: {
    title: 'Activity',
    filterLabel: 'Filter activity',
    filters: { all: 'All', tools: 'Tools', models: 'Models', kanban: 'Kanban', github: 'GitHub' },
    empty: 'Nothing for this filter yet.',
    label: 'Factory activity',
    running: 'running',
    kind: {
      tool: 'Tool',
      llm: 'Model',
      kanban: 'Kanban',
      github: 'GitHub',
      skill: 'Skill',
      guard: 'Guard',
      system: 'System',
    },
    source: {
      kanban: 'Kanban',
      hermes: 'Hermès',
      github: 'GitHub',
      comment: 'Comment',
      'factory-live': 'factory-live',
    },
    refused: 'Refused',
    failed: (kind) => `${kind} failed`,
    repeats: (count) => ` (${count} times)`,
  },

  model: {
    description: (lane, model, provider, source) =>
      `${lane ? `${lane}: ` : ''}${model}${provider ? ` via ${provider}` : ''}${source ? `, ${source}` : ''}`,
  },

  issues: {
    title: 'Issues',
    filterLabel: 'Filter issues',
    filters: { open: 'Open', finished: 'Finished', all: 'All' },
    interventions: (count) => ` ${f.plural(count, 'intervention', 'interventions')}`,
    updated: 'updated',
  },

  issue: {
    notFound: 'Issue not found',
    backToList: 'Back to the issue list',
    breadcrumb: 'Breadcrumb',
    stage: (station) => `Stage: ${station}`,
    onGitHub: 'Issue on GitHub',
    facts: {
      harness: 'Harness',
      harnessPending: 'chosen at the brief',
      claudeModel: 'Claude model',
      noClaudeModel: 'none (no claude label)',
      pr: 'PR',
      prUnknownState: '(state unknown: GitHub not connected yet)',
      prNotOpened: 'not opened yet',
      duration: 'Duration',
      tokens: 'Tokens',
      cost: 'Estimated cost',
      noCost: 'none (free models)',
    },
    bannerDescription: 'Your answer or action is needed for the card to move again.',
    reply: 'Reply',
    seeDiagnosis: 'See the diagnosis',
    cardCause: 'Why it is blocked',
    cardsTitle: 'Issue cards',
    cardsHint: 'Pick a card to see its runs.',
    forcedSkills: 'Forced skills:',
    unassigned: 'unassigned',
    tabsLabel: 'Issue details',
    tabs: {
      activity: 'Activity',
      transcript: 'Transcript',
      pr: 'PR and CI',
      costs: 'Costs',
      evidence: 'Evidence',
    },
    activityOf: (key) => `Activity of ${key}`,
    noRun: 'No run yet.',
    runs: {
      notYet: 'This card hasn’t run yet.',
      of: (cardId) => `Runs of card ${cardId}`,
      running: 'running',
      transcriptOf: (runId) => `Transcript of run #${runId}`,
      run: 'Run',
      agent: 'Agent',
      model: 'Model',
      outcome: 'Outcome',
      duration: 'Duration',
      transcript: 'Transcript',
    },
    costs: {
      label: 'Usage per run',
      run: 'Run',
      agent: 'Agent',
      model: 'Model',
      tokens: 'Tokens',
      cost: 'Cost',
    },
    evidence: (cardId) =>
      `Evidence files of the selected card (${cardId ?? 'none'}), as they are in evidence/ of its worktree.`,
    evidenceEmpty: 'No file in evidence/ for this card.',
    evidenceFile: (size, time) => `${size}, ${time}`,
    bytes: (bytes) =>
      bytes < 1024
        ? `${bytes} B`
        : bytes < 1024 * 1024
          ? `${f.integer(Math.round(bytes / 1024))} KB`
          : `${f.integer(Math.round(bytes / (1024 * 1024)))} MB`,
    graph: 'Graph of the issue’s cards',
    cardsOf: (title) => `Cards: ${title}`,
    releaseTitle: 'Merge, tag and watch main',
    testsPassed: (passed, total) => `${passed} of ${total} tests passed`,
    tests: (passed, total) => `${passed}/${total} tests`,
    files: (count) => `${count} ${f.plural(count, 'file', 'files')}`,
  },

  pr: {
    checks: [
      { name: 'Tests', detail: 'Windows, macOS, Ubuntu × Node 22 and 24' },
      { name: 'E2E', detail: 'Electron, card scenarios' },
      { name: 'GitHub Pages', detail: 'Showcase site' },
    ],
    spottedBefore: 'PR ',
    spottedAfter:
      ' spotted by the factory; its state, reviews and CI will show once GitHub is connected (Settings, GitHub).',
    none: 'No PR yet: it opens as a draft at the end of implementation.',
    state: { draft: 'Draft', merged: 'Merged', closed: 'Closed', open: 'Open' },
    ciLabel: 'CI',
    ci: { pending: 'pending', success: 'passing', failure: 'failing' },
    changes: 'Changes',
    review: 'Review',
    reviewDecision: {
      approved: 'Approved',
      changes_requested: 'Changes requested',
      review_required: 'Waiting for your approval',
      none: 'Not requested yet',
    },
    autoMerge: 'Auto-merge',
    autoMergeOn: 'Enabled: the merge goes through as soon as you approve',
    autoMergeOff: 'No (private repository or draft PR)',
    workflows: 'PR workflows',
    approve: 'Approve on GitHub',
    open: 'Open the PR on GitHub',
  },

  transcript: {
    role: {
      user: 'Prompt',
      assistant: 'Answer',
      reasoning: 'Reasoning',
      tool_call: 'Tool call',
      tool_result: 'Result',
      system: 'Session',
    },
    source: {
      hermes: 'Hermès session',
      'claude-code': 'Claude Code',
      opencode: 'OpenCode',
      terminal: 'Terminal',
    },
    showAll: (characters) => `Show all (${characters} characters)`,
    notKept:
      'Transcript not kept for this run: Hermès purges the sessions of finished cards after 30 days.',
    sourceLabel: 'Transcript source',
    rawLog: (runId) => `Raw log of run ${runId}`,
    redaction: 'Secrets (tokens, keys, passwords) are masked before display.',
  },

  interventions: {
    title: 'Interventions',
    intro:
      'What’s waiting for your decision. A bell marks what sends you a push notification; the rest shows here and on the line.',
    listLabel: 'Waiting interventions',
    empty: 'Nothing is waiting for your decision.',
    push: 'Push notification',
    opened: 'opened',
    progress: {
      sent: 'Answer sent',
      acknowledged: 'Answer acknowledged',
      resumed: 'Answer applied',
      rejected: 'Answer rejected',
    },
    all: 'All interventions',
    resolved: 'This intervention is resolved.',
    severity: { critical: 'Blocking', warning: 'To handle', info: 'FYI' },
    pushSent: '· push notification sent',
    openedAt: (time) => `opened at ${time}`,
    question: 'Agent’s question',
    steps: {
      sent: {
        label: 'Answer posted on the issue',
        hint: '/factory unblock comment in your name',
      },
      acknowledged: {
        label: 'Acknowledged by the bot',
        hint: '+1 reaction, active_pr relay if needed',
      },
      resumed: {
        label: 'Card moving again',
        hint: 'the dispatcher restarts it as soon as a slot frees up',
      },
    },
    copied: 'Copied',
    copy: 'Copy command',
    tracking: 'Tracking your answer',
    viewComment: 'View the comment on GitHub',
    emptyAnswer: 'Write your answer: it’s posted as is on the issue.',
    sendFailed: 'Couldn’t send it, try again.',
    answer: 'Your answer',
    placeholder: 'For example: option 2, filter chips above the grid.',
    caption: (issueKey) =>
      `Posted on ${issueKey ?? ''} as a “/factory unblock” comment, exactly as if you replied from the issue. It unblocks every blocked card of the issue.`,
    unblock: 'Unblock',
    prefilled: 'Answer prefilled from the diagnosis: read it and edit it if needed before sending.',
    unblockAnyway: 'Unblock anyway',
    confirmAnyway: 'Confirm unblock',
    cancel: 'Cancel',
    anywayWarning: (triage) =>
      `The cause is still there: the agent will hit the same failure again.${triage ? ' If it blocks again for the same reason, the card moves to triage, where "Unblock" no longer applies.' : ''}`,
    causeFixed: (time) => `Cause fixed at ${time}: you can unblock.`,
    rejected: {
      label: 'Answer rejected by the bot',
      hint: 'The bot reacted "confused": no blocked card left on the issue, or command not recognized.',
    },
    recent: 'Recently unblocked',
    resolvedElsewhere:
      'Unblocked outside the app (Telegram or terminal): nothing to send from here.',
    resolvedLabel: 'Unblocked',
    resolvedAt: (time) => `unblocked at ${time}`,
    runAfter: 'Next run',
  },

  diagnosis: {
    label: 'Block diagnosis',
    why: 'Why',
    who: 'Who acts',
    enough: 'Is unblocking enough?',
    todo: 'What to do',
    evidence: 'Evidence',
    evidenceCount: (count) => `${count} ${f.plural(count, 'fact', 'facts')}`,
    runs: 'Runs of the episode',
    work: 'Card work',
    others: 'Other findings',
    agentText: 'What the agent wrote',
    actor: {
      you_factory: 'You, on the factory side',
      you_answer: 'You, with an answer',
      agent: 'The agent',
      wait: 'Nobody: wait',
    },
    confidence: { certain: 'certain', likely: 'likely' },
    cause: {
      present: 'Cause still there',
      fixed: (time) => `Cause fixed at ${time}`,
      verified: 'verified',
      notDurable: 'not in the factory repository yet',
      durable: 'copied into the repository',
      unknown: 'Cause state unknown',
      none: 'Nothing to fix on the factory side',
    },
    advice: {
      now: 'Yes: unblock with the prefilled answer.',
      after_fix: 'No: fix the cause first, or the card will hit the same failure again.',
      answer: 'Yes: your answer is what the agent is waiting for.',
      wait: 'No need: the card restarts on its own.',
      not_unblockable: 'No: this card cannot be unblocked from the app, use the commands.',
    },
    nextTriage: 'If it blocks again for the same reason, it moves to triage.',
    setting: {
      observed: 'at the incident',
      current: 'in service',
      effective: 'effective',
      repo: 'repository',
      unset: (value) => `missing (${value} by default)`,
      none: 'missing',
    },
    source: {
      kanban: 'Kanban',
      transcript: 'Session',
      webhook: 'Webhook',
      agent_log: 'Hermès log',
      config: 'Config',
      plugin: 'Plugin',
      workspace: 'Worktree',
    },
    between: (from, to) => `from ${from} to ${to}`,
    primaryCause: 'main cause',
    otherFinding: 'other finding',
    run: (id) => `Run #${id}`,
    branch: 'Branch',
    noBranch: 'unknown',
    commits: { none: 'no commit', some: 'commits made', unknown: 'commits unknown' },
    commitsRefused: (count) => `${count} refused`,
    pushed: { yes: 'pushed', no: 'not pushed', unknown: 'push unknown' },
    pr: 'PR',
    noPr: 'no PR',
    editedFiles: (count) => `${count} ${f.plural(count, 'file', 'files')} edited by the agent`,
    evidenceFiles: (count) => `${count} evidence ${f.plural(count, 'file', 'files')}`,
    missingSources: (sources) =>
      `Unreadable sources: ${sources}. Some conclusions are only likely.`,
    sourceName: {
      transcript: 'sessions',
      agentLog: 'Hermès log',
      config: 'agent config',
      workspace: 'worktree',
    },
    copyCommand: 'Copy',
    copied: 'Copied',
  },

  agents: {
    title: 'Agents',
    intro: (count) => `The factory’s ${count} agents, with the configuration actually in service.`,
    drifting: (count) =>
      count > 1
        ? ` ${count} agents differ from the hermes-software-factory repository.`
        : ` ${count} agent differs from the hermes-software-factory repository.`,
    on: 'on',
    since: 'for',
    chain: 'Model chain',
    chainTitle: 'Models, in fallback order',
    effort: (effort) => `Reasoning effort: ${effort}`,
    drift: 'Configuration drift',
    driftTitle: 'Live config differs from the factory repository',
    driftRepo: (repo) => ` (repository: ${repo})`,
    driftRepoLabel: 'repository',
    field: {
      model: 'model',
      baseUrl: 'provider URL',
      fallbacks: 'fallbacks',
      effort: 'effort',
      toolsets: 'toolsets',
      plugins: 'plugins',
      outboundHooks: 'outbound webhooks',
    },
    unset: {
      model: 'none',
      baseUrl: 'none',
      fallbacks: 'none',
      effort: 'default',
      toolsets: 'none',
      plugins: 'none',
      outboundHooks: 'none',
    },
    tools: 'Tools, skills and plugins',
    skills: 'Skills',
    plugins: 'Plugins and guard refusals (7 days)',
    refusals: (name, count) => `${name} · ${count} ${f.plural(count, 'refusal', 'refusals')}`,
    timeouts: (count) => `${count} hook ${f.plural(count, 'timeout', 'timeouts')}`,
    risk: (longest, limit) => `can run commands of ${longest}, hook cut at ${limit}`,
    limits: 'Hermès limits',
    limit: {
      hook_callback_timeout: 'Plugin hook',
      tool_deadline: 'Tool call, hook included',
      terminal_timeout: 'Terminal command',
      max_turns: 'Turns per run',
    },
    limitValue: (value, isDefault) => (isDefault ? `${value} (default)` : value),
    turns: (count) => `${count} ${f.plural(count, 'turn', 'turns')}`,
    unlimited: 'no limit',
    toolsets: (mcp) => (mcp ? 'Toolsets and MCP' : 'Toolsets'),
    runs: 'Runs',
    gatePass: 'Gate pass rate',
    notApplicable: 'n/a',
    medianDuration: 'Median duration',
    cost: 'Estimated cost',
  },

  health: {
    title: 'Health',
    allGood: 'All services are responding.',
    toWatch: (count, services) =>
      `${count} ${f.plural(count, 'service', 'services')} to watch: ${services}.`,
    probeNote:
      'The gateway probe reports every 30 s; the rest comes from what the agents observe while they work.',
    checked: 'Checked',
    groups: {
      hermes: { label: 'Hermès', hint: 'Gateway, dispatcher, pause, dashboard' },
      models: { label: 'Models', hint: 'Providers the agents call' },
      tools: { label: 'Tools', hint: 'MCPs and APIs the agents use' },
      intake: { label: 'Intake', hint: 'What brings issues into the factory' },
      'factory-live': { label: 'factory-live', hint: 'This tool’s sources' },
    },
  },

  costs: {
    title: 'Costs and quotas',
    intro: 'Tokens, calls and limits per model and provider, measured on every agent call.',
    demoNote: 'Sample figures from the demo.',
    period: 'Period',
    periods: { 1: '24h', 7: '7 days', 30: '30 days' },
    tokens: 'Tokens',
    calls: 'Model calls',
    rateLimited: '429 responses',
    cost: 'Estimated cost (Claude subscription)',
    tokensPerDay: 'Tokens per day',
    tokensValue: (tokens) => `${tokens} tokens`,
    rateLimitedPerDay: '429 responses per day',
    rateLimitedValue: (count, formatted) =>
      `${formatted} ${f.plural(count, 'response', 'responses')} (429)`,
    byModel: 'By model',
    columns: {
      model: 'Model',
      calls: 'Calls',
      input: 'Input',
      output: 'Output',
      rateLimited: '429',
      errors: 'Errors',
      cost: 'Cost',
    },
    byAgent: 'Tokens per agent',
  },

  history: {
    title: 'History and stats',
    intro: (days) => `The last ${days} days. factory-live keeps what Hermès purges after 30 days.`,
    issuesDone: 'Finished issues',
    leadTime: 'Median lead time, label → merge',
    blocks: 'Blocks',
    responseTime: 'Your median response time',
    stationTime: 'Median time per station',
    gateTitle: 'Gate passed on the first try',
    gate: { harness: 'Harness', model: 'Model', runs: 'Runs', rate: 'Rate' },
    agentModel: 'agent’s model',
    tooFew: 'too few',
    recentTitle: 'Latest finished issues',
    recent: {
      issue: 'Issue',
      outcome: 'Outcome',
      leadTime: 'Lead time',
      version: 'Version',
      finishedAt: 'Finished on',
    },
    outcome: { merged: 'Merged', stopped: 'Stopped', closed: 'Closed' },
    noTag: 'no tag',
  },

  settings: {
    title: 'Settings',
    theme: 'Theme',
    themes: { dark: 'Dark', light: 'Light', system: 'System' },
    language: 'Language',
    githubReturn: {
      installed: 'GitHub App installed: factory-live now reads your repositories with it.',
      connected: 'Connected to GitHub: your answers will be posted in your name.',
    },
    install: 'Install the app',
    installIntro: 'factory-live is a PWA: you install it from the browser, no app store needed.',
    installOpen: (local, tailnet) =>
      `Open ${local} on this PC, ${tailnet} on your other devices on the tailnet, then:`,
    installOpenLocal: (local) => `Open ${local} on this PC, then:`,
    installSteps: {
      computer: {
        device: 'Computer',
        text: ': in Chrome or Edge, Install app.',
      },
      android: {
        device: 'Android',
        text: ': in Chrome, menu, Install app. Notifications work right in the browser.',
      },
      ios: {
        device: 'iPhone or iPad',
        text: ': in Safari, Share, Add to Home Screen, then open the app to turn on notifications (iOS 16.4 or later).',
      },
    },
    sources: 'Sources',
    dataSource: (demo) => (demo ? 'demo data' : 'live data'),
    /** When the server is unreachable, instead of showing a made-up version. */
    unknownServerVersion: 'server version unknown',
    /** In demo: the package version, not the server version. */
    demoVersion: 'demo',
  },

  push: {
    title: 'Notifications on this device',
    intro: (kinds) =>
      `A push goes out only when a blocker is waiting for you: ${kinds}. PRs to approve and health stay visible here, without notifications. Telegram keeps going alongside.`,
    enabled: 'Enabled on this device',
    demoEnabled: ' (demo: nothing is sent)',
    disabled: 'Not enabled on this device yet',
    enable: 'Turn on notifications',
    test: 'Send a test',
    disable: 'Turn off',
    previewApp: 'factory-live · now',
    previewTap: 'Tap to reply.',
    installFirst:
      'On iPhone and iPad, notifications go through the installed app: in Safari, Share, Add to Home Screen, then open factory-live from the Home Screen and come back here.',
    unsupported: 'This browser doesn’t receive Web Push notifications.',
    denied:
      'Notifications are blocked for factory-live: allow them again in the device settings, then come back here.',
    reading: 'Reading the subscription…',
    testSent: 'Test sent: the notification arrives in a few seconds.',
    disabledDone: 'Notifications turned off on this device.',
    enabledDone: 'Notifications turned on for this device.',
  },

  github: {
    title: 'GitHub',
    intro:
      'factory-live reads issues, PRs and CI with its own GitHub App, and posts “/factory unblock” in your name when you unblock a card.',
    demo: ' Demo: nothing is sent to GitHub.',
    reading: 'Reading GitHub access…',
    app: 'App',
    noAppToken: 'Not created yet: factory-live reads GitHub with the fallback token',
    noApp: 'Not created yet: factory-live doesn’t read GitHub yet',
    create: 'Create the App on GitHub',
    createHelp:
      'GitHub creates it in one click in code-my-life, private and without webhooks. Come back here to install it.',
    installedOn: ', installed on ',
    viewOnGitHub: 'View on GitHub',
    created: ' created, ',
    notInstalled: 'not installed yet',
    installToCheck: 'installation to check',
    install: 'Install on the repositories',
    installHelp:
      'Choose “All repositories”: the factory’s next repositories will be covered without redoing anything.',
    account: 'Your account',
    signedInAs: 'Signed in as',
    tokenHelp: (expiresIn) =>
      `Your answers are posted in your name. The token renews itself, next expiry in ${expiresIn}.`,
    logout: 'Sign out',
    notSignedIn: 'Not signed in: sign in to unblock from the app',
    login: 'Sign in to GitHub',
    loginHelp:
      'From this PC or your phone or tablet alike: GitHub brings you back here. Only the cddev account is accepted.',
  },

  charts: {
    showTable: 'Show the table',
    asTable: (title) => `${title}, as a table`,
    day: 'Day',
    value: 'Value',
  },

  errors: {
    action: {
      unblock: 'Unblock refused',
      unblockUnknown: 'Intervention not found',
      logout: 'Sign-out refused',
      pushDenied: 'Notifications blocked: allow them for factory-live in the device settings',
      pushNotAllowed: 'Notifications not allowed yet',
      pushKey: 'Notifications unavailable on the server',
      pushSubscribe: 'Subscription refused by factory-live',
      pushUnsubscribe: 'Unsubscription refused by factory-live',
      pushTest: 'Test refused by factory-live',
    },
    http: (what, status) => `${what} (HTTP ${status})`,
    api: {
      invalid_request: 'Invalid request',
      not_found: 'Not found',
      internal: 'factory-live internal error',
      intervention_unknown: 'Unknown or already resolved intervention',
      cause_present: 'The cause of the block is still there: confirm "Unblock anyway" to override',
      unblock_not_available:
        'This intervention can’t be unblocked from the app: use the suggested commands',
      github_login_required: 'Sign in to GitHub in factory-live (Settings) to unblock from the app',
      github_refused: 'GitHub refused the comment: try again, or reply on the issue',
      push_unavailable: 'Notifications unavailable',
      write_login_refused: 'This Tailscale login isn’t allowed to write',
      write_local_only: 'Writing is limited to this PC and your Tailscale login',
      origin_refused: 'Origin refused',
      csrf_missing: 'Missing x-factory-live header',
      rate_limited: 'Too many requests, try again in a minute',
      host_refused: 'Unknown address for factory-live: open the app at its usual address',
    },
  },

  notification: {
    fallbackBody: 'A blocker is waiting for you.',
  },

  blockKind,
  server,
};
