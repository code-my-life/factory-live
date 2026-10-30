/** Longest tail kept whole at the end of a value cut in the middle. */
const TAIL_MAX = 12;
/** Below this length a value is never cut in the middle: it is written as one piece. */
const SPLIT_MIN = 17;
/** Characters kept when the name has no usable last segment. */
const FALLBACK_TAIL = 8;

/**
 * Splits an identifier (model, branch, card, version) for a cut in the middle: the head gives way
 * to an ellipsis when the room is short, the tail stays whole. The tail is made of the last
 * segments (cut before each `-` or `/`) that fit in 12 characters; with no such segment, the last
 * 8 characters. `null` when the value is short enough to be written as one piece.
 */
export function splitMiddle(value: string): { head: string; tail: string } | null {
  if (value.length < SPLIT_MIN) return null;
  const parts = value.split(/(?=[-/])/);
  let tail = '';
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const part = parts[index] as string;
    if ((part + tail).length > TAIL_MAX) break;
    tail = part + tail;
  }
  if (!tail) tail = value.slice(-FALLBACK_TAIL);
  return { head: value.slice(0, value.length - tail.length), tail };
}
