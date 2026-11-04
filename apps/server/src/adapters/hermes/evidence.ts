import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { redactSecrets } from '@factory-live/domain';
import type { GateProof } from '../../application/ports.ts';
import type { HermesPaths } from './paths.ts';

/** A proof's text as the recette shows it (#22): past this size, its start and its end. */
export const GATE_PROOF_BYTES = 64 * 1024;
/** Room kept for the cut mark and for a character split at a cut. */
const HALF = (GATE_PROOF_BYTES - 64) / 2;

function read(fd: number, position: number, length: number): string {
  const buffer = Buffer.alloc(length);
  const count = readSync(fd, buffer, 0, length, position);
  return new TextDecoder().decode(buffer.subarray(0, count));
}

/** A file's text, whole up to 64 KB; past that, its start and its end, where a command says how it ended. */
function cutText(path: string): string | null {
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    return null;
  }
  try {
    const size = fstatSync(fd).size;
    if (size <= GATE_PROOF_BYTES) return read(fd, 0, size);
    return `${read(fd, 0, HALF)}\n…\n${read(fd, size - HALF, HALF)}`;
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

/**
 * The gate's proofs of a card for a head, with their text: only what `HermesPaths.gateProofs` lists
 * (the whitelist), each text cut at 64 KB, its secrets masked.
 */
export function gateProofs(paths: HermesPaths, cardId: string, sha7: string): GateProof[] {
  return paths.gateProofs(cardId, sha7).flatMap(({ order, rule, path }) => {
    const text = cutText(path);
    // A command's output may print a token: masked like the logs and the transcripts.
    return text === null ? [] : [{ order, rule, text: redactSecrets(text) }];
  });
}
