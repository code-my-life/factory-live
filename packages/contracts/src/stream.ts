import { z } from 'zod';
import { ActivityEvent } from './activity.ts';
import { AgentActivity } from './agents.ts';
import { FactoryState, ServiceHealth } from './health.ts';
import { Intervention } from './interventions.ts';
import { IssueSummary } from './issues.ts';
import { SideCard, Snapshot, StationView } from './snapshot.ts';

/**
 * Événements du flux SSE `/api/stream`. Le premier est toujours un `snapshot` entier ; ensuite chaque
 * tranche n'est renvoyée que si elle a changé. Le nom de l'événement SSE est `type`, son `id` un numéro
 * croissant qui permet la reprise (`Last-Event-ID`) sans tout renvoyer.
 */
export const StreamEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), snapshot: Snapshot }),
  z.object({ type: z.literal('agents'), agents: z.array(AgentActivity) }),
  z.object({ type: z.literal('activity'), events: z.array(ActivityEvent) }),
  z.object({
    type: z.literal('board'),
    stations: z.array(StationView),
    issues: z.array(IssueSummary),
    sideCards: z.array(SideCard),
    interventions: z.array(Intervention),
  }),
  z.object({ type: z.literal('health'), factory: FactoryState, health: z.array(ServiceHealth) }),
]);
export type StreamEvent = z.infer<typeof StreamEvent>;
export type StreamEventType = StreamEvent['type'];
