// The texts the e2e read on screen, taken where the app takes them: the French dictionary (the language of
// the tests), and the value factory-live writes itself for the agent runtime (#72). No spec writes them again.
import { FACTORY_RUNTIME } from '../packages/contracts/src/runtime.ts';
import { fr } from '../apps/web/src/i18n/fr.ts';

export { FACTORY_RUNTIME, fr };

/** The label of the agent's session among a run's transcripts. */
export const AGENT_SESSION: string = fr.transcript.source[FACTORY_RUNTIME];

/** A pattern that finds `text` as it is, its special characters escaped. */
export const literally = (text: string): RegExp =>
  new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
