import type {
  AgentLogPort,
  CardFilesPort,
  ProfilesPort,
  SessionsPort,
} from '../../application/ports.ts';

/**
 * On the core's side of the switch (#57), the server opens nothing under Hermes' home nor in the
 * factory's repository (ADR 0015). What workflow-core does not serve (sessions, card files, journals) is
 * absent: these ports answer « nothing », the way the Hermes readers answer for a missing file. The
 * agents' configurations come from the core (`CoreProfiles`, #93); `noProfiles` serves the tests.
 */

export const noProfiles: ProfilesPort = {
  profiles: () => [],
  live: () => null,
  repo: () => null,
  manifest: () => ({ owner: null, projects: {}, profiles: {} }),
  root: () => ({ maxInProgress: 0, maxInProgressPerProfile: 0 }),
  facts: () => null,
  factsStamp: () => '',
};

export const noSessions: SessionsPort = {
  sessionOfRun: () => null,
  modelUsage: () => [],
  usageSince: () => [],
  transcript: () => [],
  runFacts: () => null,
  sessionsActiveAt: () => null,
};

export const noCardFiles: CardFilesPort = {
  cardLog: () => null,
  claudeTranscripts: () => [],
  evidence: () => null,
  evidenceStamp: () => '',
  gateProofs: () => [],
};

export const noAgentLog: AgentLogPort = {
  facts: () => null,
};
