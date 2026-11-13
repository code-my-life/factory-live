import { Text } from '@factory-live/contracts';
import type { Text as ScreenText } from '@factory-live/contracts';
import type { CoreIntervention } from '@factory-live/contracts/workflow-core';
import type { CoreInterventionState, DeclaredGesture } from '../../application/ports.ts';

/**
 * An intervention of workflow-core (#37, #59) in factory-live's units: a coded text becomes a code of
 * factory-live's catalogue (checked by its schema), a quote stays as written, the gesture `unblock` becomes
 * the action Débloquer, only when the workflow declares it (#61): a workflow that declares no gesture shows no
 * gesture button. Another gesture has no button of its own on this screen yet.
 */

type CoreText = CoreIntervention['title'];

function text(value: CoreText): ScreenText {
  if ('quote' in value) return String(value.quote);
  const code = String(value.code);
  // `params` may be left out by the core for a code without parameters; the catalogue wants `{}`.
  const coded = Text.safeParse({ code, params: value.params ?? {} });
  // A code factory-live does not know is shown as itself rather than lost.
  return coded.success ? coded.data : code;
}

/**
 * The names of a workflow's gestures that are comments: Débloquer posts a comment on the card's issue, so an
 * `unblock` declared as another kind of gesture does not show its form (#61).
 */
export function commentGestures(gestures: readonly DeclaredGesture[]): ReadonlySet<string> {
  return new Set(
    gestures.filter((gesture) => gesture.kind === 'comment').map((gesture) => gesture.name),
  );
}

export function coreInterventionState(
  item: CoreIntervention,
  declared: ReadonlySet<string>,
): CoreInterventionState {
  const actions: CoreInterventionState['actions'] = [];
  for (const action of item.actions) {
    if (action.kind === 'gesture') {
      if (action.gesture === 'unblock' && declared.has('unblock'))
        actions.push({ kind: 'unblock' });
      continue;
    }
    const { label, command, url } = action as { label: CoreText; command?: string; url?: string };
    if (action.kind === 'copy')
      actions.push({ kind: 'copy', label: text(label), command: String(command) });
    else actions.push({ kind: 'link', label: text(label), url: String(url) });
  }
  return {
    id: item.id,
    kind: item.kind,
    cardId: item.item,
    eventId: item.event,
    openedAt: Math.floor(Date.parse(item.opened_at) / 1000),
    profile: item.agent,
    severity: item.severity,
    push: item.push,
    title: text(item.title),
    question: text(item.question),
    actions,
  };
}
