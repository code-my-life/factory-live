/** Longest tail kept whole at the end of a value cut in the middle. */
const TAIL_MAX = 12;
/** Characters kept when the name has no usable last segment. */
const FALLBACK_TAIL = 8;

/**
 * Splits an identifier (model, branch, card, version) for a cut in the middle: the head gives way
 * to an ellipsis when the room is short, the tail stays whole. The tail is made of the last
 * segments (cut before each `-` or `/`) that fit in 12 characters; with no such segment, the last
 * 8 characters. A value that fits is still written whole (the head only gives way when the room
 * is short); `null` when the tail covers the whole value, so there is no head to give way.
 */
export function splitMiddle(value: string): { head: string; tail: string } | null {
  const parts = value.split(/(?=[-/])/);
  let tail = '';
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const part = parts[index] as string;
    if ((part + tail).length > TAIL_MAX) break;
    tail = part + tail;
  }
  if (!tail) tail = value.slice(-FALLBACK_TAIL);
  const head = value.slice(0, value.length - tail.length);
  return head ? { head, tail } : null;
}
