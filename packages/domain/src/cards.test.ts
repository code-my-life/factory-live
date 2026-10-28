import { describe, expect, it } from 'vitest';
import { cardKindOf, issueKeyOf, issueRefOfTask, runRoleOf } from './cards.ts';
import { aRun, aTask, anEvent } from './fixtures.test-helpers.ts';

describe('issueRefOfTask', () => {
  it('lit l’issue dans le titre, même précédée du type de carte', () => {
    expect(
      issueRefOfTask(aTask({ title: 'impl claude-cockpit#42 : E2E PR 2b - île et lanceur' })),
    ).toEqual({
      repo: 'claude-cockpit',
      number: 42,
    });
    expect(issueRefOfTask(aTask({ title: 'cv-site#47 : Formulaire de contact' }))).toEqual({
      repo: 'cv-site',
      number: 47,
    });
    expect(
      issueRefOfTask(aTask({ title: 'release claude-cockpit#14: team view cards fix' })),
    ).toEqual({
      repo: 'claude-cockpit',
      number: 14,
    });
  });

  it('se rabat sur la clé d’idempotence de l’intake, puis sur l’URL du corps', () => {
    expect(issueRefOfTask(aTask({ title: 'Brief', idempotencyKey: 'gh-cv-site-49' }))).toEqual({
      repo: 'cv-site',
      number: 49,
    });
    expect(
      issueRefOfTask(
        aTask({
          title: 'Diagnostic',
          body: 'url: https://github.com/code-my-life/claude-cockpit/issues/12\n',
        }),
      ),
    ).toEqual({ repo: 'claude-cockpit', number: 12 });
  });

  it('le titre l’emporte sur les autres liens du brief (règle de la factory, claude-cockpit#42)', () => {
    const task = aTask({
      title: 'impl claude-cockpit#42 : E2E PR 2a',
      body: 'Voir aussi https://github.com/code-my-life/claude-cockpit/issues/15',
    });
    expect(issueKeyOf(issueRefOfTask(task))).toBe('claude-cockpit#42');
  });

  it('ne rattache pas une carte de watch', () => {
    expect(
      issueRefOfTask(
        aTask({ title: 'watch 2026-10-20 : 5 PR ouvertes sur code-my-life/claude-cockpit' }),
      ),
    ).toBeNull();
  });
});

describe('cardKindOf', () => {
  it.each([
    ['claude-cockpit#71 : Vue ÉQUIPE', null, 'brief'],
    ['impl claude-cockpit#71 : regrouper', null, 'impl'],
    ['release claude-cockpit#71', null, 'release'],
    ['watch 2026-10-28 : 2 PR ouvertes', null, 'watch'],
    ['Onboarding de factory-live', 'tool-setup', 'onboarding'],
    ['diagnostic cv-site#12 : lenteur', null, 'diagnostic'],
    ['Nettoyage', 'scribe', 'other'],
  ] as const)('%s → %s', (title, assignee, kind) => {
    expect(cardKindOf(aTask({ title, assignee }))).toBe(kind);
  });
});

describe('runRoleOf', () => {
  const impl = aTask({ id: 't_impl', title: 'impl cv-site#47 : validation' });

  it('distingue l’implémenteur du relecteur sur une même carte impl', () => {
    const coder = aRun({ id: 1, taskId: 't_impl', profile: 'coder' });
    const gate = aRun({ id: 2, taskId: 't_impl', profile: 'gate' });
    expect(runRoleOf(coder, impl, [])).toBe('implementer');
    expect(runRoleOf(gate, impl, [])).toBe('reviewer');
  });

  it('reconnaît une revue par l’événement claimed venu de review, quel que soit le profil', () => {
    const run = aRun({ id: 3, taskId: 't_impl', profile: 'coordinator' });
    const claimed = anEvent({
      taskId: 't_impl',
      runId: 3,
      kind: 'claimed',
      payload: { source_status: 'review' },
    });
    expect(runRoleOf(run, impl, [claimed])).toBe('reviewer');
  });

  it('donne le rôle de la carte pour un brief ou une release', () => {
    expect(
      runRoleOf(aRun({ profile: 'coordinator' }), aTask({ title: 'cv-site#47 : x' }), []),
    ).toBe('coordinator');
    expect(
      runRoleOf(aRun({ profile: 'coordinator' }), aTask({ title: 'release cv-site#47' }), []),
    ).toBe('release');
  });
});
