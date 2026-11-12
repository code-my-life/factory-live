import { z } from 'zod';
import type { ActivityFact, ActivityResponse } from './workflow-core/generated/activity.ts';
import type { DeclaredDataResponse } from './workflow-core/generated/declared-data.ts';
import type { Diagnosis } from './workflow-core/generated/diagnosis.ts';
import type { ErrorResponse } from './workflow-core/generated/error.ts';
import type {
  Intervention,
  InterventionsResponse,
} from './workflow-core/generated/interventions.ts';
import type { StreamEvent } from './workflow-core/generated/event.ts';
import type { ItemsResponse } from './workflow-core/generated/items.ts';
import type { AgentLive, LiveResponse } from './workflow-core/generated/live.ts';
import type { MachineCheck, MachineResponse } from './workflow-core/generated/machine.ts';
import type { RunVerdicts } from './workflow-core/generated/run-verdicts.ts';
import type { SheetResponse } from './workflow-core/generated/sheet-response.ts';
import type { UsageResponse } from './workflow-core/generated/usage.ts';
import type { WorkflowsResponse } from './workflow-core/generated/workflows.ts';
import {
  activitySchema,
  declaredDataSchema,
  diagnosisSchema,
  errorSchema,
  eventSchema,
  interventionsSchema,
  itemsSchema,
  liveSchema,
  machineSchema,
  runVerdictsSchema,
  sheetResponseSchema,
  usageSchema,
  workflowsSchema,
} from './workflow-core/generated/schemas.ts';

/**
 * The responses of workflow-core's API (ADR 0018 of factory-live, #57). Their static types are generated
 * from the copies of the core's JSON Schema (`npm run types:core`), and each runtime check is built by
 * `z.fromJSONSchema` from the same copy: no type of a response is written by hand.
 */

export type {
  ActivityFact as CoreFact,
  ActivityResponse,
  AgentLive as CoreAgent,
  DeclaredDataResponse,
  Diagnosis as CoreDiagnosis,
  ErrorResponse,
  Intervention as CoreIntervention,
  InterventionsResponse,
  ItemsResponse,
  LiveResponse,
  MachineCheck as CoreMachineCheck,
  MachineResponse,
  RunVerdicts as RunVerdictsResponse,
  SheetResponse,
  StreamEvent as CoreEvent,
  UsageResponse,
  WorkflowsResponse,
};
export type CoreItem = ItemsResponse['items'][number];
export type CoreSheet = SheetResponse['sheet'];

export interface CoreCheck<T> {
  parse(value: unknown): T;
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: z.ZodError };
}

function check<T>(schema: unknown): CoreCheck<T> {
  const zod = z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]);
  return {
    parse: (value) => zod.parse(value) as T,
    safeParse: (value) => {
      const result = zod.safeParse(value);
      return result.success
        ? { success: true, data: result.data as T }
        : { success: false, error: result.error };
    },
  };
}

export const coreWorkflows = check<WorkflowsResponse>(workflowsSchema);
export const coreSheetResponse = check<SheetResponse>(sheetResponseSchema);
export const coreItems = check<ItemsResponse>(itemsSchema);
export const coreMachine = check<MachineResponse>(machineSchema);
export const coreEvent = check<StreamEvent>(eventSchema);
export const coreError = check<ErrorResponse>(errorSchema);
export const coreLive = check<LiveResponse>(liveSchema);
export const coreActivity = check<ActivityResponse>(activitySchema);
export const coreUsage = check<UsageResponse>(usageSchema);
export const coreDeclaredData = check<DeclaredDataResponse>(declaredDataSchema);
export type CoreDeclaredData = DeclaredDataResponse['data'][number];
export type CoreValue = CoreDeclaredData['values'][number];
export const coreInterventions = check<InterventionsResponse>(interventionsSchema);
export const coreDiagnosis = check<Diagnosis>(diagnosisSchema);
export const coreRunVerdicts = check<RunVerdicts>(runVerdictsSchema);
