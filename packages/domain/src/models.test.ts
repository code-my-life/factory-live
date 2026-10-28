import { describe, expect, it } from 'vitest';
import { effectiveModel } from './models.ts';
import type { ModelEvidence } from './models.ts';

const none: ModelEvidence = { live: null, session: [], override: null, config: null };

describe('effectiveModel', () => {
  it('préfère le dernier appel observé', () => {
    expect(
      effectiveModel({
        ...none,
        live: { model: 'agnes-2.5-flash', provider: 'freellmapi' },
        session: [{ model: 'dots3', provider: 'freellmapi', lastSeen: 9 }],
        config: { model: 'auto', provider: 'freellmapi' },
      }),
    ).toEqual({ model: 'agnes-2.5-flash', provider: 'freellmapi', source: 'live' });
  });

  it('sinon la ligne d’usage la plus récente (un fallback en ajoute une)', () => {
    expect(
      effectiveModel({
        ...none,
        session: [
          { model: 'agnes-2.5-flash', provider: 'freellmapi', lastSeen: 100 },
          { model: 'nemotron-3-ultra', provider: 'nvidia', lastSeen: 300 },
          { model: 'dots3', provider: 'freellmapi', lastSeen: 200 },
        ],
      }),
    ).toEqual({ model: 'nemotron-3-ultra', provider: 'nvidia', source: 'session' });
  });

  it('sinon l’override de la carte, avec le fournisseur du profil s’il n’est pas donné', () => {
    expect(
      effectiveModel({
        ...none,
        override: { model: 'claude-opus-5-5', provider: null },
        config: { model: 'auto', provider: 'freellmapi' },
      }),
    ).toEqual({
      model: 'claude-opus-5-5',
      provider: 'freellmapi',
      source: 'override',
    });
    expect(effectiveModel({ ...none, override: { model: 'x', provider: null } })?.provider).toBe(
      '?',
    );
  });

  it('sinon la config du profil, et rien sans aucune source', () => {
    expect(effectiveModel({ ...none, config: { model: 'auto', provider: 'freellmapi' } })).toEqual({
      model: 'auto',
      provider: 'freellmapi',
      source: 'config',
    });
    expect(effectiveModel(none)).toBeNull();
  });
});
