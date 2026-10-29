import { msg } from '@factory-live/contracts';
import type { Intervention } from '@factory-live/contracts';
import { describe, expect, it, vi } from 'vitest';
import { notifyOpened } from './notify.ts';
import type { NotifyDeps } from './notify.ts';
import type { PushMessage } from './ports.ts';

const NOW = Date.parse('2026-10-28T18:00:00Z');

function intervention(patch: Partial<Intervention> = {}): Intervention {
  return {
    id: 'needs_input:t_1:10',
    kind: 'needs_input',
    severity: 'critical',
    title: 'Quelle base de données ?',
    issueKey: 'cv-site#49',
    cardId: 't_1',
    profile: 'coordinator',
    question: 'Quelle base de données ?\nPostgreSQL ou SQLite ?',
    openedAt: new Date(NOW - 60_000).toISOString(),
    push: true,
    actions: [{ kind: 'unblock' }],
    unblock: null,
    diagnosis: null,
    resolvedAt: null,
    followUp: null,
    ...patch,
  };
}

function deps() {
  const sent: PushMessage[] = [];
  const claimed = new Set<string>();
  const value = {
    store: {
      claimNotification: (id: string) => (claimed.has(id) ? false : (claimed.add(id), true)),
    },
    notifier: {
      notify: vi.fn((message: PushMessage) => {
        sent.push(message);
        return Promise.resolve({ sent: 1, removed: 0, failed: 0 });
      }),
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    now: () => NOW,
  } as unknown as NotifyDeps;
  return { value, sent };
}

describe('notifyOpened', () => {
  it('envoie l’issue à part et le texte tel qu’il est : le service worker l’écrit dans sa langue', async () => {
    const { value, sent } = deps();
    const fallback = intervention({
      id: 'capability:t_2:11',
      title: msg('intervention.title.capability'),
      question: msg('intervention.question.capability'),
    });
    await notifyOpened(value, [intervention(), fallback], [intervention(), fallback]);
    expect(sent).toEqual([
      {
        where: 'cv-site#49',
        title: 'Quelle base de données ?',
        body: 'Quelle base de données ? PostgreSQL ou SQLite ?',
        url: '/interventions/needs_input%3At_1%3A10',
        tag: 'needs_input:t_1:10',
        badge: 2,
      },
      {
        where: 'cv-site#49',
        title: msg('intervention.title.capability'),
        body: msg('intervention.question.capability'),
        url: '/interventions/capability%3At_2%3A11',
        tag: 'capability:t_2:11',
        badge: 2,
      },
    ]);
  });

  it('coupe un texte d’agent trop long, une seule notification par intervention', async () => {
    const { value, sent } = deps();
    const long = intervention({ title: 'x'.repeat(200), question: 'y'.repeat(400) });
    await notifyOpened(value, [long], [long]);
    await notifyOpened(value, [long], [long]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.title).toHaveLength(90);
    expect(sent[0]?.body).toHaveLength(180);
  });

  it('ne notifie ni ce qui n’attend pas Clément, ni ce qui est trop ancien', async () => {
    const { value, sent } = deps();
    await notifyOpened(
      value,
      [
        intervention({ id: 'pr_approval:t_3:1', kind: 'pr_approval', push: false }),
        intervention({ id: 'old', openedAt: new Date(NOW - 7 * 3_600_000).toISOString() }),
      ],
      [],
    );
    expect(sent).toEqual([]);
  });
});
