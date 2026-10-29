import { describe, expect, it } from 'vitest';
import { aRun, anEvent } from './fixtures.test-helpers.ts';
import { message } from './messages.ts';
import { timelineOf } from './timeline.ts';
import type { Comment } from './timeline.ts';

const CARD = 't_d6702099';
const assignees = new Map([[CARD, 'gate']]);

function aComment(patch: Partial<Comment> = {}): Comment {
  return { id: 1, taskId: CARD, author: 'default', body: 'texte', createdAt: 1_000, ...patch };
}

describe('timelineOf', () => {
  it('décrit les événements du kanban par des codes, avec le profil du run', () => {
    const items = timelineOf(
      [CARD],
      [
        anEvent({
          id: 1,
          taskId: CARD,
          kind: 'created',
          payload: { assignee: 'coder' },
          createdAt: 100,
        }),
        anEvent({ id: 2, taskId: CARD, kind: 'claimed', runId: 108, createdAt: 110 }),
        anEvent({
          id: 3,
          taskId: CARD,
          kind: 'review_requested',
          runId: 108,
          payload: { reviewer: 'gate', summary: 'PR #52 prête' },
          createdAt: 200,
        }),
        anEvent({
          id: 4,
          taskId: CARD,
          kind: 'completed',
          runId: 111,
          payload: { summary: 'Approuvé' },
          createdAt: 300,
        }),
      ],
      [],
      [
        aRun({ id: 108, taskId: CARD, profile: 'coder' }),
        aRun({ id: 111, taskId: CARD, profile: 'gate' }),
      ],
      assignees,
    );
    expect(items.map((item) => [item.label, item.profile, item.tone])).toEqual([
      [message('timeline.created'), 'gate', 'neutral'],
      [message('timeline.claimed'), 'coder', 'neutral'],
      [message('timeline.reviewRequested', { reviewer: 'gate' }), 'coder', 'attention'],
      [message('timeline.completed'), 'gate', 'done'],
    ]);
    expect(items[0]?.detail).toEqual(message('timeline.created.for', { assignee: 'coder' }));
    expect(items[2]?.detail).toBe('PR #52 prête');
  });

  it('écarte les battements de cœur et les événements de structure', () => {
    const items = timelineOf(
      [CARD],
      [
        anEvent({ taskId: CARD, kind: 'heartbeat' }),
        anEvent({ taskId: CARD, kind: 'spawned' }),
        anEvent({ taskId: CARD, kind: 'linked' }),
      ],
      [],
      [],
      assignees,
    );
    expect(items).toEqual([]);
  });

  it('nomme le type de blocage et garde la raison', () => {
    const [item] = timelineOf(
      [CARD],
      [
        anEvent({
          taskId: CARD,
          kind: 'blocked',
          payload: { kind: 'needs_input', reason: 'Quelle base ?' },
        }),
      ],
      [],
      [],
      assignees,
    );
    expect(item).toMatchObject({
      label: message('timeline.blocked', { kind: 'needs_input' }),
      detail: 'Quelle base ?',
      tone: 'danger',
    });
  });

  it('fusionne les relances retenues répétées à chaque tick, jusqu’au prochain fait', () => {
    const guarded = (id: number) =>
      anEvent({
        id,
        taskId: CARD,
        kind: 'respawn_guarded',
        payload: { reason: 'active_pr' },
        createdAt: id,
      });
    const items = timelineOf(
      [CARD],
      [
        guarded(1),
        anEvent({ id: 2, taskId: CARD, kind: 'heartbeat', createdAt: 2 }),
        guarded(3),
        guarded(4),
        anEvent({ id: 5, taskId: CARD, kind: 'unblocked', createdAt: 5 }),
        guarded(6),
      ],
      [],
      [],
      assignees,
    );
    expect(items.map((item) => [item.label, item.repeats])).toEqual([
      [message('timeline.respawnGuarded'), 3],
      [message('timeline.unblocked'), undefined],
      [message('timeline.respawnGuarded'), undefined],
    ]);
    expect(items[0]?.detail).toEqual(message('timeline.respawnGuarded.activePr'));
  });

  it('mêle les commentaires dans l’ordre du temps et masque les secrets', () => {
    const items = timelineOf(
      [CARD],
      [
        anEvent({ id: 1, taskId: CARD, kind: 'created', createdAt: 100 }),
        anEvent({ id: 2, taskId: CARD, kind: 'unblocked', createdAt: 300 }),
      ],
      [
        aComment({
          id: 9,
          createdAt: 200,
          author: 'coder',
          body: `jeton ghp_${'a'.repeat(36)} collé par erreur`,
        }),
      ],
      [],
      assignees,
    );
    expect(items.map((item) => item.id)).toEqual(['event:1', 'comment:9', 'event:2']);
    expect(items[1]).toMatchObject({
      source: 'comment',
      label: message('timeline.comment', { author: 'coder' }),
      detail: 'jeton [secret masqué] collé par erreur',
    });
  });

  it('ne prend que les cartes demandées et garde un type inconnu tel quel', () => {
    const items = timelineOf(
      [CARD],
      [
        anEvent({ taskId: 't_other000', kind: 'created' }),
        anEvent({ taskId: CARD, kind: 'nouveau_type' }),
      ],
      [aComment({ taskId: 't_other000' })],
      [],
      assignees,
    );
    expect(items.map((item) => item.label)).toEqual(['nouveau_type']);
  });

  it.each([
    ['promoted', {}, message('timeline.promoted'), message('timeline.promoted.detail')],
    [
      'status',
      { status: 'ready', requested_status: 'ready' },
      message('timeline.status', { status: 'ready' }),
      null,
    ],
    [
      'assigned',
      { assignee: 'coder', from: 'gate' },
      message('timeline.assigned', { assignee: 'coder' }),
      message('timeline.assigned.from', { from: 'gate' }),
    ],
    ['assigned', {}, message('timeline.assigned', { assignee: null }), null],
    ['edited', { fields: ['title', 'body'] }, message('timeline.edited'), 'title, body'],
    [
      'attached',
      { by: 'coordinator', filename: 'brief.md', size: 1200 },
      message('timeline.attached'),
      'brief.md',
    ],
    [
      'scheduled',
      { reason: 'Opérateur : verdict reçu' },
      message('timeline.scheduled'),
      'Opérateur : verdict reçu',
    ],
    [
      'review_requested',
      { summary: 'prêt' },
      message('timeline.reviewRequested', { reviewer: null }),
      'prêt',
    ],
    [
      'review_reopened',
      { implementer: 'coder', status: 'review' },
      message('timeline.reviewReopened'),
      null,
    ],
    [
      'changes_requested',
      { reviewer: 'gate', reason: 'Restaurer le fichier' },
      message('timeline.changesRequested', { reviewer: 'gate' }),
      'Restaurer le fichier',
    ],
    [
      'pr_acceptance',
      { ok: true, pr_url: 'https://github.com/code-my-life/claude-cockpit/pull/63' },
      message('timeline.prChecks.passed'),
      'https://github.com/code-my-life/claude-cockpit/pull/63',
    ],
    [
      'pr_acceptance',
      { ok: false, classification: 'failure' },
      message('timeline.prChecks.failed'),
      'failure',
    ],
    ['archived', {}, message('timeline.archived'), null],
    ['blocked', { reason: 'Arrêt' }, message('timeline.blocked', { kind: null }), 'Arrêt'],
    ['blocked', { kind: 'inconnu' }, message('timeline.blocked', { kind: null }), null],
    [
      'block_loop_detected',
      { kind: 'needs_input', recurrences: 2 },
      message('timeline.blockLoop'),
      null,
    ],
    ['respawn_guarded', { reason: 'autre' }, message('timeline.respawnGuarded'), 'autre'],
    [
      'dependency_wait',
      { reason: 'parent_not_done', parent: 't_04382be9' },
      message('timeline.dependencyWait'),
      't_04382be9',
    ],
    [
      'reclaimed',
      { manual: true, reason: null },
      message('timeline.reclaimed'),
      message('timeline.reclaimed.manual'),
    ],
    [
      'reclaimed',
      { manual: false, reason: 'heartbeat périmé' },
      message('timeline.reclaimed'),
      'heartbeat périmé',
    ],
    [
      'crashed',
      { exit_kind: 'nonzero_exit', exit_code: 1 },
      message('timeline.crashed'),
      'nonzero_exit, code 1',
    ],
    ['crashed', {}, message('timeline.crashed'), null],
    [
      'timed_out',
      { error: 'durée maximale atteinte', failures: 1 },
      message('timeline.timedOut'),
      'durée maximale atteinte',
    ],
    ['rate_limited', { exit_code: 75 }, message('timeline.rateLimited'), null],
    ['protocol_violation', { exit_code: 0 }, message('timeline.protocolViolation'), null],
    [
      'protocol_violation',
      {
        exit_code: 0,
        // La fin de la sortie du run 189 de factory-live#2, telle qu'Hermès l'a notée.
        worker_output:
          'o finish ⚠️ Kanban worker tried to exit without a terminal board call (kanban_complete/kanban_request_review/kanban_block) \u2014 nudging to finish',
      },
      message('timeline.protocolViolation'),
      message('timeline.protocolViolation.nudged'),
    ],
    [
      'spawn_failed',
      { error: 'workspace absent' },
      message('timeline.spawnFailed'),
      'workspace absent',
    ],
    [
      'gave_up',
      { failures: 3, error: 'trois échecs' },
      message('timeline.gaveUp', { failures: 3 }),
      'trois échecs',
    ],
    ['gave_up', {}, message('timeline.gaveUp', { failures: null }), null],
    ['terminal_worker_reaped', { pid: 1 }, message('timeline.workerReaped'), null],
    [
      'model_override_set',
      { model: 'claude-opus-5-5', provider: 'anthropic' },
      message('timeline.modelOverride', { model: 'claude-opus-5-5' }),
      'anthropic',
    ],
    [
      'reasoning_effort_set',
      { reasoning_effort: 'high' },
      message('timeline.reasoningEffort', { effort: 'high' }),
      null,
    ],
  ])('décrit %s', (kind, payload, label, detail) => {
    const [item] = timelineOf(
      [CARD],
      [anEvent({ taskId: CARD, kind, payload })],
      [],
      [],
      assignees,
    );
    expect(item).toMatchObject({ label, detail });
  });

  it('coupe un détail trop long', () => {
    const [item] = timelineOf(
      [CARD],
      [anEvent({ taskId: CARD, kind: 'scheduled', payload: { reason: 'x'.repeat(400) } })],
      [],
      [],
      assignees,
    );
    expect(item?.detail).toHaveLength(280);
  });
});
