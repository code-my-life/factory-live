import type { AgentActivity } from '@factory-live/contracts';
import { describe, expect, it } from 'vitest';
import { actionModel, parseModelLinks } from './modelText.ts';

describe('parseModelLinks', () => {
  it('lit les modèles d’un écart de configuration, tels que le serveur les écrit', () => {
    expect(parseModelLinks('auto (freellmapi)')).toEqual([
      { model: 'auto', provider: 'freellmapi' },
    ]);
    expect(
      parseModelLinks(
        'dots3-note-preview (freellmapi), nvidia/nemotron-3-super-120b-a12b (nvidia)',
      ),
    ).toEqual([
      { model: 'dots3-note-preview', provider: 'freellmapi' },
      { model: 'nvidia/nemotron-3-super-120b-a12b', provider: 'nvidia' },
    ]);
  });

  it('laisse le texte tel quel quand ce n’est pas une liste de modèles', () => {
    expect(parseModelLinks('high')).toBeNull();
    expect(parseModelLinks('terminal, file')).toBeNull();
    expect(parseModelLinks('')).toBeNull();
  });
});

describe('actionModel', () => {
  const agent = (patch: Partial<AgentActivity>) =>
    ({
      model: { model: 'agnes-2.5-flash', provider: 'freellmapi', source: 'live' },
      action: { kind: 'llm', label: 'Appel au modèle', detail: 'agnes-2.5-flash', startedAt: '' },
      ...patch,
    }) as AgentActivity;

  it('reconnaît un appel au modèle dont le détail n’est que le nom du modèle', () => {
    expect(actionModel(agent({}))).toEqual({
      model: 'agnes-2.5-flash',
      provider: 'freellmapi',
      source: 'live',
    });
  });

  it('garde un détail qui dit autre chose, ou une autre action', () => {
    expect(
      actionModel(
        agent({
          action: { kind: 'llm', label: 'x', detail: 'auto, routé vers agnes', startedAt: '' },
        }),
      ),
    ).toBeNull();
    expect(
      actionModel(
        agent({ action: { kind: 'tool', label: 'x', detail: 'agnes-2.5-flash', startedAt: '' } }),
      ),
    ).toBeNull();
    expect(actionModel(agent({ action: null }))).toBeNull();
  });
});
