import { describe, expect, it } from 'vitest';
import { GestureError, postGesture } from './gestures.ts';
import type { GestureDeps } from './gestures.ts';
import type { DeclaredGesture, LoggerPort } from './ports.ts';

const silent: LoggerPort = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

/** What each test workflow declares: the factory a comment, the test workflow an issue, another nothing. */
const DECLARED: Record<string, DeclaredGesture[]> = {
  factory: [{ name: 'unblock', kind: 'comment', repo: null }],
  essai: [{ name: 'signaler', kind: 'issue', repo: 'workflow-essai' }],
  vide: [],
};

function setup() {
  const calls: { kind: string; args: unknown[] }[] = [];
  const audit: string[] = [];
  const deps: GestureDeps = {
    gestures: { declared: (workflow) => DECLARED[workflow] ?? null },
    github: {
      comment: (repo, number, body) => {
        calls.push({ kind: 'comment', args: [repo, number, body] });
        return Promise.resolve({
          id: 4242,
          url: `https://github.com/code-my-life/${repo}/issues/${number}#c`,
        });
      },
      openIssue: (repo, title, body) => {
        calls.push({ kind: 'issue', args: [repo, title, body] });
        return Promise.resolve({
          number: 7,
          url: `https://github.com/code-my-life/${repo}/issues/7`,
        });
      },
      reactions: () => Promise.resolve([]),
    },
    canWrite: () => true,
    issueOf: (_workflow, item) => (item === 't_1a9f0049' ? 'cv-site#49' : null),
    store: { audit: (actor, action, detail) => audit.push(`${actor} ${action} ${detail}`) },
    log: silent,
    now: () => Date.parse('2026-11-12T18:00:00Z'),
  };
  return { deps, calls, audit };
}

describe('gestes déclarés (#61)', () => {
  it('un geste non déclaré par le workflow est refusé sans rien poster', async () => {
    const { deps, calls } = setup();
    const refused = (request: Parameters<typeof postGesture>[1]) =>
      postGesture(deps, request, 'cddev').then(
        () => null,
        (error: unknown) => error,
      );

    const undeclared = await refused({
      workflow: 'factory',
      gesture: 'relancer',
      item: 't_1a9f0049',
      note: '',
    });
    expect(undeclared).toBeInstanceOf(GestureError);
    expect(undeclared).toMatchObject({ status: 409, code: 'gesture_not_declared' });

    const none = await refused({
      workflow: 'vide',
      gesture: 'unblock',
      item: 't_1a9f0049',
      note: '',
    });
    expect(none).toMatchObject({ status: 409, code: 'gesture_not_declared' });

    const unknown = await refused({
      workflow: 'nope',
      gesture: 'unblock',
      item: 't_1a9f0049',
      note: '',
    });
    expect(unknown).toMatchObject({ status: 404, code: 'unknown_workflow' });

    expect(calls).toEqual([]);
  });

  it('un geste déclaré en commentaire poste /<clé> <geste> <note> sur l’issue de l’élément', async () => {
    const { deps, calls, audit } = setup();

    const sent = await postGesture(
      deps,
      { workflow: 'factory', gesture: 'unblock', item: 't_1a9f0049', note: 'PostgreSQL' },
      'cddev',
    );

    expect(calls).toEqual([
      { kind: 'comment', args: ['cv-site', 49, '/factory unblock PostgreSQL'] },
    ]);
    expect(sent).toEqual({
      kind: 'comment',
      state: 'sent',
      url: 'https://github.com/code-my-life/cv-site/issues/49#c',
      commentId: 4242,
      issueKey: 'cv-site#49',
    });
    expect(audit).toHaveLength(1);

    // An item without an issue cannot receive a comment.
    const orphan = await postGesture(
      deps,
      { workflow: 'factory', gesture: 'unblock', item: 't_sansissue', note: '' },
      'cddev',
    ).catch((error: unknown) => error);
    expect(orphan).toMatchObject({ status: 409, code: 'no_issue' });
    expect(calls).toHaveLength(1);
  });

  it('un geste déclaré en issue ouvre une issue dans le dépôt déclaré', async () => {
    const { deps, calls } = setup();

    const sent = await postGesture(
      deps,
      {
        workflow: 'essai',
        gesture: 'signaler',
        title: 'Le rendu saute',
        body: 'Vu sur la vidéo 3.',
      },
      'cddev',
    );

    expect(calls).toEqual([
      { kind: 'issue', args: ['workflow-essai', 'Le rendu saute', 'Vu sur la vidéo 3.'] },
    ]);
    expect(sent).toEqual({
      kind: 'issue',
      state: 'sent',
      url: 'https://github.com/code-my-life/workflow-essai/issues/7',
      commentId: null,
      issueKey: 'workflow-essai#7',
    });
  });
});
