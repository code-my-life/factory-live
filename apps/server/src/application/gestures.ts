import type { ApiErrorCode } from '@factory-live/contracts';
import type {
  DeclaredGesture,
  GesturesPort,
  GitHubWritePort,
  HistoryPort,
  LoggerPort,
} from './ports.ts';

/**
 * The owner's gestures, generic (#61, ADR 0016): factory-live posts a gesture only when the workflow declares
 * it, as a comment `/<workflow> <gesture> <note>` on the issue of an item, or as an issue opened in the
 * declared repository; always in the name of the connected account (the App's user token, or the fallback
 * token of ADR 0003). No gesture is written in the code: the list comes from the core, or on Hermes' side
 * from the default list of main.ts.
 */

/**
 * On Hermes' side of the switch, the code line declares what it always did: the unblocking, a comment on the
 * issue of a blocked card. On the core's side, the list comes from workflow-core (`gestures` of each workflow).
 */
export const HERMES_SIDE_GESTURES: Readonly<Record<string, readonly DeclaredGesture[]>> = {
  factory: [{ name: 'unblock', kind: 'comment', repo: null }],
};

export const hermesSideGestures: GesturesPort = {
  declared: (workflow) => HERMES_SIDE_GESTURES[workflow] ?? null,
};

export class GestureError extends Error {
  readonly status: 404 | 409 | 502 | 503;
  readonly code: ApiErrorCode;

  constructor(status: 404 | 409 | 502 | 503, code: ApiErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'GestureError';
  }
}

export interface GestureDeps {
  gestures: GesturesPort;
  github: GitHubWritePort | null;
  /** False while the owner is not connected to GitHub (and without a fallback token). */
  canWrite?: () => boolean;
  /** The issue `<repo>#<n>` of an item of a workflow; `null` when it has none. */
  issueOf: (workflow: string, item: string) => string | null;
  store: Pick<HistoryPort, 'audit'>;
  log: LoggerPort;
  now: () => number;
}

export type GestureRequest =
  | { workflow: string; gesture: string; item: string; note: string }
  | { workflow: string; gesture: string; title: string; body: string };

export interface GestureSent {
  kind: 'comment' | 'issue';
  state: 'sent';
  url: string;
  /** The comment posted, followed by the bot's reaction; `null` for an issue. */
  commentId: number | null;
  /** The issue commented, or the issue opened. */
  issueKey: string;
}

/** The comment of a gesture: `/<workflow> <gesture>`, then the note when there is one. */
export function gestureComment(workflow: string, gesture: string, note: string): string {
  return `/${workflow} ${gesture}${note.trim() ? ` ${note.trim()}` : ''}`;
}

export async function postGesture(
  deps: GestureDeps,
  request: GestureRequest,
  actor: string,
): Promise<GestureSent> {
  const declared = deps.gestures.declared(request.workflow);
  if (declared === null)
    throw new GestureError(404, 'unknown_workflow', `Workflow inconnu : ${request.workflow}`);
  const gesture = declared.find((item) => item.name === request.gesture);
  if (!gesture)
    throw new GestureError(
      409,
      'gesture_not_declared',
      `Le workflow ${request.workflow} ne déclare pas le geste ${request.gesture}`,
    );
  const github = deps.github;
  if (!github || (deps.canWrite && !deps.canWrite()))
    throw new GestureError(
      503,
      'github_login_required',
      'Connecte-toi à GitHub dans factory-live (Réglages) pour poster un geste',
    );
  const what = `${request.workflow} ${request.gesture}`;
  try {
    if (gesture.kind === 'issue') {
      if (!('title' in request) || !gesture.repo)
        throw new GestureError(
          409,
          'gesture_not_declared',
          `Geste ${what} : issue sans dépôt ni titre`,
        );
      // The repository may be declared `<owner>/<name>`: the App writes in the owner's repositories by name.
      const repo = gesture.repo.split('/').pop() ?? gesture.repo;
      const opened = await github.openIssue(repo, request.title, request.body);
      const issueKey = `${repo}#${opened.number}`;
      deps.store.audit(actor, 'gesture', `${what} → ${opened.url}`, deps.now());
      return { kind: 'issue', state: 'sent', url: opened.url, commentId: null, issueKey };
    }
    if (!('item' in request))
      throw new GestureError(
        409,
        'gesture_not_declared',
        `Geste ${what} : commentaire sans élément`,
      );
    const issueKey = deps.issueOf(request.workflow, request.item);
    if (!issueKey)
      throw new GestureError(409, 'no_issue', `L'élément ${request.item} n'a pas d'issue`);
    const [repo = '', number = '0'] = issueKey.split('#');
    const comment = await github.comment(
      repo,
      Number(number),
      gestureComment(request.workflow, request.gesture, request.note),
    );
    deps.store.audit(actor, 'gesture', `${what} ${issueKey} → ${comment.url}`, deps.now());
    deps.log.info(
      { component: 'gestures', workflow: request.workflow, issue: issueKey },
      'geste posté',
    );
    return { kind: 'comment', state: 'sent', url: comment.url, commentId: comment.id, issueKey };
  } catch (error) {
    if (error instanceof GestureError) throw error;
    deps.store.audit(actor, 'gesture-failed', `${what} : ${String(error)}`, deps.now());
    deps.log.error({ component: 'gestures', error: String(error) }, 'geste refusé par GitHub');
    throw new GestureError(502, 'github_refused', 'GitHub a refusé le geste : réessaie');
  }
}
