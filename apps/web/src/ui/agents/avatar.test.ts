import { describe, expect, it } from 'vitest';
import { agentAvatarUri, agentColor, agentPattern } from './avatar.ts';

const AGENTS = [
  'coordinator',
  'coordinator-claude',
  'coder',
  'coder-claude',
  'coder-opencode',
  'gate',
  'gate-claude',
  'scribe',
  'release',
  'tool-setup',
];

describe('avatars des agents', () => {
  it('donne à chaque agent de la factory une couleur et un motif qui ne sont qu’à lui', () => {
    expect(new Set(AGENTS.map(agentColor)).size).toBe(AGENTS.length);
    expect(new Set(AGENTS.map((agent) => JSON.stringify(agentPattern(agent)))).size).toBe(
      AGENTS.length,
    );
    expect(new Set(AGENTS.map(agentAvatarUri)).size).toBe(AGENTS.length);
  });

  it('est stable d’un affichage à l’autre', () => {
    expect(agentAvatarUri('coder')).toBe(agentAvatarUri('coder'));
    expect(agentPattern('profil-inconnu')).toEqual(agentPattern('profil-inconnu'));
  });

  it('dessine un motif symétrique, ni presque vide ni presque plein', () => {
    for (const agent of [...AGENTS, 'default', 'un-agent-futur']) {
      const rows = agentPattern(agent);
      expect(rows).toHaveLength(5);
      for (const row of rows) expect(row).toEqual([...row].reverse());
      const filled = rows.flat().filter(Boolean).length;
      expect(filled).toBeGreaterThanOrEqual(8);
      expect(filled).toBeLessThanOrEqual(17);
    }
  });

  it('produit une image SVG en data URI, sans ressource externe', () => {
    const uri = agentAvatarUri('gate');
    expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(decodeURIComponent(uri)).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });
});
