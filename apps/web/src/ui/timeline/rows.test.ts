import { msg } from '@factory-live/contracts';
import type { ActivityEvent, TimelineEntry } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { i18nOf } from '../../i18n/i18n.ts';
import { fromActivity, fromTimelineEntry } from './rows.ts';

const event: ActivityEvent = {
  id: 'a1',
  at: '2026-10-28T18:00:00.000Z',
  kind: 'llm',
  profile: 'coder',
  issueKey: 'cv-site#49',
  cardId: 't_1',
  label: msg('activity.llm.rateLimited', { model: 'agnes-2.5-flash', attempt: 2, attempts: 3 }),
  detail: 'Too Many Requests',
  status: 'error',
  durationMs: null,
  model: 'agnes-2.5-flash',
};

const entry: TimelineEntry = {
  id: 'event:1',
  at: '2026-10-28T18:00:00.000Z',
  source: 'kanban',
  profile: 'coder',
  cardId: 't_1',
  label: msg('timeline.respawnGuarded'),
  detail: msg('timeline.respawnGuarded.activePr'),
  tone: 'attention',
  repeats: 3,
};

describe('lignes de timeline', () => {
  it('écrivent le fil en direct dans la langue choisie, le message d’erreur tel quel', () => {
    expect(fromActivity(event, i18nOf('fr'))).toMatchObject({
      title: '429 sur agnes-2.5-flash (essai 2 sur 3)',
      detail: 'Too Many Requests',
      iconLabel: 'Modèle en échec',
    });
    expect(fromActivity(event, i18nOf('en'))).toMatchObject({
      title: '429 on agnes-2.5-flash (attempt 2 of 3)',
      detail: 'Too Many Requests',
      iconLabel: 'Model failed',
    });
  });

  it('écrivent la timeline d’une issue, avec le nombre de répétitions', () => {
    expect(fromTimelineEntry(entry, i18nOf('fr'))).toMatchObject({
      title: 'Relance retenue (3 fois)',
      detail: 'Une PR citée il y a moins de 24 h attend un relais (garde active_pr)',
      iconLabel: 'Kanban',
    });
    expect(fromTimelineEntry({ ...entry, repeats: undefined }, i18nOf('en'))).toMatchObject({
      title: 'Restart held back',
      detail: 'A PR cited less than 24 h ago is waiting for a relay (active_pr guard)',
    });
  });

  it('montrent tel quel ce qu’une ancienne ligne enregistrée en français portait', () => {
    expect(
      fromActivity({ ...event, label: 'Skill chargée', detail: null }, i18nOf('en')),
    ).toMatchObject({ title: 'Skill chargée', detail: null });
  });
});
