import { describe, expect, it } from 'vitest';
import { notificationOptions, parsePush, safeUrl } from './notification.ts';

describe('parsePush', () => {
  it('lit le push du serveur : titre, texte, intervention à ouvrir, étiquette, pastille', () => {
    const message = parsePush(
      JSON.stringify({
        title: 'cv-site#49 : Décision attendue',
        body: 'PostgreSQL ou SQLite ?',
        url: '/interventions/iv-49',
        tag: 'iv-49',
        badge: 2,
      }),
    );
    expect(message).toEqual({
      title: 'cv-site#49 : Décision attendue',
      body: 'PostgreSQL ou SQLite ?',
      url: '/interventions/iv-49',
      tag: 'iv-49',
      badge: 2,
    });
    expect(notificationOptions(message)).toMatchObject({
      body: 'PostgreSQL ou SQLite ?',
      tag: 'iv-49',
      data: { url: '/interventions/iv-49' },
      icon: '/icons/icon-192.png',
    });
  });

  it('montre quand même quelque chose d’un push vide ou illisible', () => {
    expect(parsePush(null)).toMatchObject({ title: 'factory-live', url: '/interventions' });
    expect(parsePush('pas du JSON')).toMatchObject({ body: 'pas du JSON', badge: null });
    expect(notificationOptions(parsePush(null))).not.toHaveProperty('tag');
  });

  it('ne fait jamais quitter l’app : seule une page de factory-live s’ouvre', () => {
    expect(safeUrl('/interventions/iv-1')).toBe('/interventions/iv-1');
    expect(safeUrl('https://evil.example')).toBe('/interventions');
    expect(safeUrl('//evil.example/x')).toBe('/interventions');
    expect(parsePush(JSON.stringify({ title: 'x', badge: -3 })).badge).toBeNull();
  });
});
