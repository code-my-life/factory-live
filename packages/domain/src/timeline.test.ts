import { describe, expect, it } from 'vitest';
import { aRun, anEvent } from './fixtures.test-helpers.ts';
import { timelineOf } from './timeline.ts';
import type { Comment } from './timeline.ts';

const CARD = 't_d6702099';
const assignees = new Map([[CARD, 'gate']]);

function aComment(patch: Partial<Comment> = {}): Comment {
  return { id: 1, taskId: CARD, author: 'default', body: 'texte', createdAt: 1_000, ...patch };
}

describe('timelineOf', () => {
  it('décrit les événements du kanban en français, avec le profil du run', () => {
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
      ['Carte créée', 'gate', 'neutral'],
      ['Carte prise', 'coder', 'neutral'],
      ['Revue demandée à gate', 'coder', 'attention'],
      ['Carte terminée', 'gate', 'done'],
    ]);
    expect(items[0]?.detail).toBe('pour coder');
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
      label: 'Carte bloquée : décision attendue',
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
    expect(items.map((item) => item.label)).toEqual([
      'Relance retenue (3 fois)',
      'Carte débloquée',
      'Relance retenue',
    ]);
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
      label: 'Commentaire de coder',
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
    ['promoted', {}, 'Carte prête', 'ses dépendances sont terminées'],
    ['status', { status: 'ready', requested_status: 'ready' }, 'Statut : ready', null],
    ['assigned', { assignee: 'coder', from: 'gate' }, 'Réassignée à coder', 'avant : gate'],
    ['edited', { fields: ['title', 'body'] }, 'Carte modifiée', 'title, body'],
    [
      'attached',
      { by: 'coordinator', filename: 'brief.md', size: 1200 },
      'Pièce jointe',
      'brief.md',
    ],
    [
      'scheduled',
      { reason: 'Opérateur : verdict reçu' },
      'Carte planifiée',
      'Opérateur : verdict reçu',
    ],
    ['review_requested', { summary: 'prêt' }, 'Revue demandée à la gate', 'prêt'],
    ['review_reopened', { implementer: 'coder', status: 'review' }, 'Revue rouverte', null],
    [
      'changes_requested',
      { reviewer: 'gate', reason: 'Restaurer le fichier' },
      'Changements demandés par gate',
      'Restaurer le fichier',
    ],
    [
      'pr_acceptance',
      { ok: true, pr_url: 'https://github.com/code-my-life/claude-cockpit/pull/63' },
      'Contrôles de la PR au vert',
      'https://github.com/code-my-life/claude-cockpit/pull/63',
    ],
    [
      'pr_acceptance',
      { ok: false, classification: 'failure' },
      'Contrôles de la PR en échec',
      'failure',
    ],
    ['archived', {}, 'Carte archivée', null],
    ['blocked', { reason: 'Arrêt' }, 'Carte bloquée', 'Arrêt'],
    [
      'block_loop_detected',
      { kind: 'needs_input', recurrences: 2 },
      'Boucle de blocage : carte passée en triage',
      null,
    ],
    ['respawn_guarded', { reason: 'autre' }, 'Relance retenue', 'autre'],
    [
      'dependency_wait',
      { reason: 'parent_not_done', parent: 't_04382be9' },
      'En attente de la carte parente',
      't_04382be9',
    ],
    ['reclaimed', { manual: true, reason: null }, 'Carte reprise au worker', 'à la main'],
    [
      'reclaimed',
      { manual: false, reason: 'heartbeat périmé' },
      'Carte reprise au worker',
      'heartbeat périmé',
    ],
    [
      'crashed',
      { exit_kind: 'nonzero_exit', exit_code: 1 },
      'Worker planté',
      'nonzero_exit, code 1',
    ],
    ['crashed', {}, 'Worker planté', null],
    [
      'timed_out',
      { error: 'durée maximale atteinte', failures: 1 },
      'Délai du worker dépassé',
      'durée maximale atteinte',
    ],
    ['rate_limited', { exit_code: 75 }, 'Worker arrêté par une limite du fournisseur', null],
    [
      'protocol_violation',
      { exit_code: 0 },
      'Worker sorti sans terminer ni bloquer la carte',
      null,
    ],
    [
      'spawn_failed',
      { error: 'workspace absent' },
      'Lancement du worker en échec',
      'workspace absent',
    ],
    ['gave_up', { failures: 3, error: 'trois échecs' }, 'Abandon après 3 échecs', 'trois échecs'],
    ['gave_up', {}, 'Abandon après plusieurs échecs', null],
    ['terminal_worker_reaped', { pid: 1 }, 'Worker résiduel arrêté', null],
    [
      'model_override_set',
      { model: 'claude-opus-5-5', provider: 'anthropic' },
      'Modèle forcé : claude-opus-5-5',
      'anthropic',
    ],
    ['reasoning_effort_set', { reasoning_effort: 'high' }, 'Effort de raisonnement : high', null],
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
