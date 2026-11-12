import type { CoreAgent, CoreFact } from '@factory-live/contracts/workflow-core';
import type { CoreActivityFact, CoreAgentState } from '../../application/ports.ts';

/**
 * The live state of the code line as workflow-core serves it (#66), in factory-live's units: times from
 * ISO 8601 to ms epoch, a missing provider as « ? », as the Hermes reader shows an unknown one.
 */

const ms = (at: string): number => Date.parse(at);

/** The provider of a delegated command line's model, as the Hermes reader names it. */
const laneProvider = (label: string): string => (/claude/i.test(label) ? 'anthropic' : 'opencode');

export function coreAgentState(agent: CoreAgent): CoreAgentState {
  return {
    profile: agent.agent,
    cardId: agent.item,
    runId: agent.run,
    state: agent.state,
    action: agent.action
      ? {
          kind: agent.action.kind,
          label: agent.action.label,
          detail: agent.action.detail,
          startedAt: ms(agent.action.started_at),
        }
      : null,
    model: agent.model
      ? {
          model: agent.model.name,
          provider: agent.model.provider ?? '?',
          source: agent.model.source,
        }
      : null,
    laneModel:
      agent.lane_model === null
        ? null
        : { model: agent.lane_model, provider: laneProvider(agent.action?.label ?? '') },
    lastHeartbeatAt: agent.heartbeat_at === null ? null : ms(agent.heartbeat_at),
  };
}

export function coreActivityFact(fact: CoreFact): CoreActivityFact {
  return {
    id: fact.id,
    at: ms(fact.at),
    kind: fact.kind,
    profile: fact.agent,
    cardId: fact.item,
    text: fact.text,
    status: fact.status,
  };
}
