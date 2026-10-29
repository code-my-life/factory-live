import { aTask } from '../fixtures.test-helpers.ts';
import { logFactOf, parseLogLine } from './hermesText.ts';
import { INCIDENTS } from './incidents.test-helpers.ts';
import type { IncidentName } from './incidents.test-helpers.ts';
import type { DiagnosisInput, LogFact, PluginHook, ProfileFacts } from './types.ts';

/** Les hooks des plugins de la factory, tels que leurs `register()` les branchent. */
export const FACTORY_HOOKS: readonly PluginHook[] = [
  {
    plugin: 'coder-guard',
    hook: 'pre_tool_call',
    callback: 'pre_tool',
    source: 'ctx.register_hook("pre_tool_call", pre_tool)',
  },
  {
    plugin: 'coder-guard',
    hook: 'post_tool_call',
    callback: 'post_tool',
    source: 'ctx.register_hook("post_tool_call", post_tool)',
  },
  {
    plugin: 'coder-guard',
    hook: 'pre_llm_call',
    callback: 'inject',
    source: 'ctx.register_hook("pre_llm_call", inject)',
  },
  {
    plugin: 'comment-guard',
    hook: 'pre_tool_call',
    callback: 'guard',
    source: 'ctx.register_hook("pre_tool_call", guard)',
  },
  {
    plugin: 'gate-readonly',
    hook: 'pre_tool_call',
    callback: 'guard',
    source: 'ctx.register_hook("pre_tool_call", guard)',
  },
  {
    plugin: 'merge-guard',
    hook: 'pre_tool_call',
    callback: 'guard',
    source: 'ctx.register_hook("pre_tool_call", guard)',
  },
];

/** La config de coder avant la correction du 2026-10-29 : pas de délai de hook, 30 s par défaut. */
export function coderProfile(patch: Partial<ProfileFacts> = {}): ProfileFacts {
  return {
    profile: 'coder',
    hookTimeout: null,
    toolDeadline: null,
    terminalTimeout: 900,
    maxTurns: 400,
    changedAt: Date.parse('2026-10-29T01:21:22Z') / 1000,
    repoHookTimeout: null,
    plugins: ['coder-guard', 'comment-guard', 'factory-notify'],
    hooks: FACTORY_HOOKS,
    ...patch,
  };
}

/** Les lignes du journal d'un cas, datées dans leur fuseau (heure locale d'Hermès). */
export function logsOf(lines: readonly string[], tzOffset: string): LogFact[] {
  return lines.flatMap((line) => {
    const parsed = parseLogLine(line);
    const fact = parsed ? logFactOf(parsed) : null;
    if (!parsed || !fact) return [];
    const stamp = `${parsed.wallClock.replace(' ', 'T')}.${String(parsed.millis).padStart(3, '0')}${tzOffset}`;
    return [{ ...fact, at: Date.parse(stamp) / 1000 }];
  });
}

/** L'entrée du diagnostic pour un cas réel, à l'instant de son événement ; `patch` pour en faire varier les faits. */
export function incidentInput(
  name: IncidentName,
  patch: Partial<DiagnosisInput> = {},
): DiagnosisInput {
  const incident = INCIDENTS[name];
  return {
    now: incident.now,
    board: 'factory',
    task: aTask(incident.task),
    runs: incident.runs,
    events: incident.events,
    anchor: incident.events.find((event) => event.id === incident.anchorId) ?? null,
    sessions: incident.sessions,
    logs: logsOf(incident.logLines, incident.tzOffset),
    profile: null,
    evidence: null,
    branch: null,
    prUrl: null,
    ...patch,
  };
}
