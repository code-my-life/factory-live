import { LimitKey } from '@factory-live/contracts';
import type { ProfileLimit } from '@factory-live/contracts';
import type { AgentsResponse } from '@factory-live/contracts/workflow-core';
import type { GuardRisk, ProfileFacts } from '@factory-live/domain';
import type {
  FactoryManifest,
  ProfileConfig,
  ProfilesPort,
  RootSettings,
} from '../../application/ports.ts';

/**
 * The agents of the code line as workflow-core serves them (#93, workflow-core#129), behind the profiles'
 * port on the core's side of the switch: the list, each agent's configuration in service, its skills and
 * the kanban's settings. Without an answer, the last one received stays. Nothing of Hermes is opened: the
 * configuration in the repository is not read here (the drift comes from the core, #60).
 */

type Agent = AgentsResponse['agents'][number];

/** Hermes' settings when the core does not give them, as the Hermes reader takes them. */
const DEFAULT_ROOT: RootSettings = { maxInProgress: 2, maxInProgressPerProfile: 1 };

const positive = (value: number | null | undefined, fallback: number): number =>
  typeof value === 'number' && value > 0 ? value : fallback;

const limit = (agent: Agent, key: string): number | null =>
  agent.limits.find((entry) => entry.key === key)?.value ?? null;

export class CoreProfiles implements ProfilesPort {
  private answer: AgentsResponse | null = null;
  private readAt = 0;

  /** The core's latest answer, read at `at` (ms epoch): it replaces the one held. */
  update(answer: AgentsResponse, at: number = Date.now()): void {
    this.answer = answer;
    this.readAt = at;
  }

  /** The guards at risk the core computed (#96), as they are: no rule applies them here. */
  guardRisks(): { risks: GuardRisk[]; checkedAt: number } | null {
    if (!this.answer) return null;
    return {
      risks: this.answer.guard_risks.map((risk) => ({
        plugin: risk.plugin,
        profiles: [...risk.agents],
        longest: risk.longest_seconds,
        limit: risk.limit_seconds,
      })),
      checkedAt: this.readAt,
    };
  }

  private agent(name: string): Agent | undefined {
    return this.answer?.agents.find((agent) => agent.name === name);
  }

  profiles(): string[] {
    return (this.answer?.agents ?? []).map((agent) => agent.name);
  }

  live(name: string): ProfileConfig | null {
    const agent = this.agent(name);
    if (!agent) return null;
    return {
      model: agent.model ? { model: agent.model.name, provider: agent.model.provider } : null,
      baseUrl: null,
      fallbacks: agent.fallbacks.map((link) => ({ model: link.name, provider: link.provider })),
      effort: agent.effort,
      toolsets: [...agent.toolsets],
      plugins: agent.plugins.map((plugin) => plugin.name),
      mcp: [...agent.mcp],
      outboundHooks: [],
    };
  }

  repo(): ProfileConfig | null {
    return null;
  }

  manifest(): FactoryManifest {
    return {
      owner: null,
      projects: {},
      profiles: Object.fromEntries(
        (this.answer?.agents ?? []).map((agent) => [
          agent.name,
          { skills: [...agent.skills], plugins: agent.plugins.map((plugin) => plugin.name) },
        ]),
      ),
    };
  }

  root(): RootSettings {
    const kanban = this.answer?.kanban;
    return {
      maxInProgress: positive(kanban?.max_in_progress, DEFAULT_ROOT.maxInProgress),
      maxInProgressPerProfile: positive(
        kanban?.max_in_progress_per_profile,
        DEFAULT_ROOT.maxInProgressPerProfile,
      ),
    };
  }

  facts(name: string): ProfileFacts | null {
    const agent = this.agent(name);
    if (!agent) return null;
    const longest = agent.plugins.filter((plugin) => plugin.longest_seconds !== null);
    return {
      profile: name,
      hookTimeout: limit(agent, 'hook_callback_timeout'),
      toolDeadline: limit(agent, 'tool_deadline'),
      terminalTimeout: limit(agent, 'terminal_timeout'),
      maxTurns: limit(agent, 'max_turns'),
      changedAt: null,
      plugins: agent.plugins.map((plugin) => plugin.name),
      hooks: [],
      ...(longest.length > 0
        ? {
            longestCommands: Object.fromEntries(
              longest.map((plugin) => [plugin.name, plugin.longest_seconds as number]),
            ),
          }
        : {}),
    };
  }

  /** Changes when the core's answer for this agent changes: the hub reads its facts again then. */
  factsStamp(name: string): string {
    return JSON.stringify(this.agent(name) ?? null);
  }

  /** The agent's limits with the defaults the core publishes, in the core's order. */
  limits(name: string): ProfileLimit[] | null {
    const agent = this.agent(name);
    if (!agent) return null;
    return agent.limits.flatMap((entry) => {
      const key = LimitKey.safeParse(entry.key);
      if (!key.success) return [];
      return [
        {
          key: key.data,
          value: entry.value,
          defaultValue: entry.default,
          unit: entry.unit === 'turns' ? ('turns' as const) : ('seconds' as const),
        },
      ];
    });
  }

  hookTimeouts(name: string): ReadonlyMap<string, number> | null {
    const agent = this.agent(name);
    return agent
      ? new Map(agent.plugins.map((plugin) => [plugin.name, plugin.hook_timeouts]))
      : null;
  }
}
