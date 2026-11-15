/**
 * The value factory-live writes itself for the agent runtime that runs the factory: the group of the tiles of its
 * Health page (`buildHealth`), the source of an agent's session among a run's transcripts (`preparedTranscripts`),
 * and the source of the timeline lines of the factory; values of the contract between its server and its web app,
 * named after their role, never after the runtime (code-my-life/factory-live#109).
 */
export const FACTORY_RUNTIME = 'runtime' as const;
export type FactoryRuntime = typeof FACTORY_RUNTIME;
