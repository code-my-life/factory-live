/**
 * The value factory-live writes itself (#72): the group of the tiles of its Health page (`buildHealth`), the source
 * of an agent's session among a run's transcripts (`preparedTranscripts`), and the source of the timeline lines of
 * the factory; values of the contract between its server and its web app. It is written here only: everything else
 * reads this constant. A provisional exemption of the CI rule (`apps/server/src/runtimeName.test.ts`): story 4 of the
 * epic renames these values and removes it.
 */
export const FACTORY_RUNTIME = 'hermes' as const;
export type FactoryRuntime = typeof FACTORY_RUNTIME;
