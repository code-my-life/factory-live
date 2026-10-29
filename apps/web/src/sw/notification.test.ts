import { msg } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { i18nOf } from '../i18n/i18n.ts';
import { notificationContent, notificationOptions, parsePush, safeUrl } from './notification.ts';

const fr = i18nOf('fr');
const en = i18nOf('en');

describe('parsePush', () => {
  it('lit le push du serveur : issue, titre, texte, intervention à ouvrir, étiquette, pastille', () => {
    const message = parsePush(
      JSON.stringify({
        where: 'cv-site#49',
        title: 'Quelle base de données ?',
        body: 'PostgreSQL ou SQLite ?',
        url: '/interventions/iv-49',
        tag: 'iv-49',
        badge: 2,
      }),
    );
    expect(message).toEqual({
      where: 'cv-site#49',
      title: 'Quelle base de données ?',
      body: 'PostgreSQL ou SQLite ?',
      url: '/interventions/iv-49',
      tag: 'iv-49',
      badge: 2,
    });
    const { title, body } = notificationContent(message, fr);
    expect(title).toBe('cv-site#49 : Quelle base de données ?');
    expect(notificationOptions(message, body)).toMatchObject({
      body: 'PostgreSQL ou SQLite ?',
      tag: 'iv-49',
      data: { url: '/interventions/iv-49' },
      icon: '/icons/icon-192.png',
    });
  });

  it('écrit un texte de factory-live dans la langue de l’appareil, le texte de l’agent tel quel', () => {
    const message = parsePush(
      JSON.stringify({
        where: 'cv-site#49',
        title: msg('intervention.title.capability'),
        body: msg('intervention.question.capability'),
        url: '/interventions/iv-49',
        tag: 'iv-49',
        badge: 1,
      }),
    );
    expect(notificationContent(message, fr)).toEqual({
      title: 'cv-site#49 : Outil ou accès manquant',
      body: 'Un outil ou un accès manque à l’agent.',
    });
    expect(notificationContent(message, en)).toEqual({
      title: 'cv-site#49: Missing tool or access',
      body: 'The agent is missing a tool or an access.',
    });
    const test = parsePush(
      JSON.stringify({
        where: null,
        title: msg('push.test.title'),
        body: msg('push.test.body'),
        url: '/settings',
        tag: 'test',
        badge: 0,
      }),
    );
    expect(notificationContent(test, en)).toEqual({
      title: 'factory-live: test',
      body: 'Notifications work on this device.',
    });
  });

  it('lit encore l’ancienne forme, au titre déjà écrit', () => {
    const message = parsePush(
      JSON.stringify({ title: 'cv-site#49 : Décision attendue', body: 'Touche pour répondre.' }),
    );
    expect(notificationContent(message, en)).toEqual({
      title: 'cv-site#49 : Décision attendue',
      body: 'Touche pour répondre.',
    });
  });

  it('montre quand même quelque chose d’un push vide ou illisible, dans la langue de l’appareil', () => {
    expect(parsePush(null)).toMatchObject({ title: null, url: '/interventions' });
    expect(notificationContent(parsePush(null), fr)).toEqual({
      title: 'factory-live',
      body: 'Un blocage t’attend.',
    });
    expect(notificationContent(parsePush(null), en).body).toBe('A blocker is waiting for you.');
    expect(parsePush('pas du JSON')).toMatchObject({ body: 'pas du JSON', badge: null });
    expect(notificationOptions(parsePush(null), '')).not.toHaveProperty('tag');
    expect(parsePush(JSON.stringify({ title: { code: 42 } })).title).toBeNull();
  });

  it('coupe un titre et un texte trop longs pour une notification', () => {
    const { title, body } = notificationContent(
      parsePush(
        JSON.stringify({ where: 'cv-site#49', title: 'x'.repeat(200), body: 'y'.repeat(400) }),
      ),
      fr,
    );
    expect(title).toHaveLength(90);
    expect(body).toHaveLength(180);
  });

  it('ne fait jamais quitter l’app : seule une page de factory-live s’ouvre', () => {
    expect(safeUrl('/interventions/iv-1')).toBe('/interventions/iv-1');
    expect(safeUrl('https://evil.example')).toBe('/interventions');
    expect(safeUrl('//evil.example/x')).toBe('/interventions');
    expect(parsePush(JSON.stringify({ title: 'x', badge: -3 })).badge).toBeNull();
  });
});
