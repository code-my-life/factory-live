import { describe, expect, it } from 'vitest';
import { ActivityEvent } from './activity.ts';
import { Message, Text, msg } from './messages.ts';

describe('Message', () => {
  it('porte un code et ses paramètres, vérifiés selon le code', () => {
    expect(msg('health.probe.last', { seconds: 8 })).toEqual({
      code: 'health.probe.last',
      params: { seconds: 8 },
    });
    expect(msg('health.probe')).toEqual({ code: 'health.probe', params: {} });
    expect(Message.safeParse({ code: 'health.probe.last', params: { seconds: 8 } }).success).toBe(
      true,
    );
    expect(Message.safeParse({ code: 'health.probe.last', params: {} }).success).toBe(false);
    expect(Message.safeParse({ code: 'code.inconnu', params: {} }).success).toBe(false);
  });

  it('refuse à la compilation un code inconnu ou des paramètres manquants', () => {
    // @ts-expect-error paramètres requis
    expect(() => msg('health.probe.last')).not.toThrow();
    // @ts-expect-error code absent du catalogue
    expect(() => msg('health.inconnu')).not.toThrow();
  });
});

describe('Text', () => {
  it('accepte un texte venu d’ailleurs, tel quel, ou un texte fabriqué par factory-live', () => {
    expect(Text.parse('Quelle base de données ?')).toBe('Quelle base de données ?');
    expect(Text.parse(msg('timeline.comment', { author: 'coder' }))).toEqual({
      code: 'timeline.comment',
      params: { author: 'coder' },
    });
  });

  it('garde lisibles les lignes d’activité enregistrées avant les codes (texte français brut)', () => {
    const before = {
      id: 'a1',
      at: '2026-10-28T18:00:00.000Z',
      kind: 'skill',
      profile: 'coder',
      issueKey: null,
      cardId: null,
      label: 'Skill chargée',
      detail: 'factory-brief',
      status: 'ok',
      durationMs: null,
      model: null,
    };
    expect(ActivityEvent.parse(before).label).toBe('Skill chargée');
    expect(
      ActivityEvent.parse({ ...before, label: msg('activity.skill', { action: 'loaded' }) }).label,
    ).toEqual({ code: 'activity.skill', params: { action: 'loaded' } });
  });
});
