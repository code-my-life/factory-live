import { describe, expect, it } from 'vitest';
import { splitMiddle } from './middle.ts';

describe('splitMiddle', () => {
  it('garde entiers les derniers segments, 12 caractères au plus', () => {
    expect(
      splitMiddle('Qwen3.5-9B-The-Defiant-Fable-Uncnr-Heretic-plusIQ-TOOLS-NEO-MAX-MTP-Q8_0'),
    ).toEqual({
      head: 'Qwen3.5-9B-The-Defiant-Fable-Uncnr-Heretic-plusIQ-TOOLS-NEO-MAX',
      tail: '-MTP-Q8_0',
    });
    expect(splitMiddle('nvidia/nemotron-3-ultra-550b-a55b')).toEqual({
      head: 'nvidia/nemotron-3-ultra',
      tail: '-550b-a55b',
    });
  });

  it('coupe aussi une branche', () => {
    expect(splitMiddle('fix/54-studio-thousands-separator')).toEqual({
      head: 'fix/54-studio-thousands',
      tail: '-separator',
    });
  });

  it('garde les 8 derniers caractères quand aucun segment ne tient', () => {
    expect(splitMiddle('abcdefghijklmnopqrstuvwxyz')).toEqual({
      head: 'abcdefghijklmnopqr',
      tail: 'stuvwxyz',
    });
  });

  it('coupe aussi une valeur courte : sa tête cède la place seulement si elle manque', () => {
    expect(splitMiddle('claude-opus-5-5')).toEqual({ head: 'claude', tail: '-opus-5-5' });
    expect(splitMiddle('claude-sonnet-5-5')).toEqual({ head: 'claude', tail: '-sonnet-5-5' });
    expect(splitMiddle('gpt-oss-20b-MXFP4')).toEqual({ head: 'gpt-oss', tail: '-20b-MXFP4' });
  });

  it('ne coupe pas une valeur dont la fin couvre tout', () => {
    expect(splitMiddle('#90')).toBeNull();
    expect(splitMiddle('opus')).toBeNull();
    expect(splitMiddle('abcdefgh')).toBeNull();
  });
});
