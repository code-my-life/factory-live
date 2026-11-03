import type { CardView, IssueDetail } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { transcriptRun } from './IssuePage.tsx';

const card = (id: string, runs: number[]) =>
  ({ id, runs: runs.map((run) => ({ id: run })) }) as unknown as CardView;
const IMPL = card('t_impl', [181, 184]);
const RELEASE = card('t_release', [190]);
const DETAIL = { cards: [IMPL, RELEASE] } as unknown as IssueDetail;

describe('transcriptRun', () => {
  it('la transcription suit la carte au travail : un run choisi sur une autre carte ne s’y montre plus', () => {
    // Nothing picked: the last run of the card at work.
    expect(transcriptRun(DETAIL, IMPL, null)).toBe(184);
    // A run picked on this card shows.
    expect(transcriptRun(DETAIL, IMPL, { cardId: 't_impl', runId: 181 })).toBe(181);
    // The issue moved on to its release card: the run picked on the implementation gives way.
    expect(transcriptRun(DETAIL, RELEASE, { cardId: 't_impl', runId: 181 })).toBe(190);
    // No card: the last run of the issue.
    expect(transcriptRun(DETAIL, null, null)).toBe(190);
  });
});
