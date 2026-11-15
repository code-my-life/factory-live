import type { ProfilesPort } from '../../application/ports.ts';

/** No agent at all: the profiles' port before anything is read, for the tests that do not read the core. */
export const noProfiles: ProfilesPort = {
  profiles: () => [],
  live: () => null,
  repo: () => null,
  manifest: () => ({ owner: null, projects: {}, profiles: {} }),
  root: () => ({ maxInProgress: 0, maxInProgressPerProfile: 0 }),
  facts: () => null,
};
