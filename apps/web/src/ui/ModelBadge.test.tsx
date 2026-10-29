import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModelBadge } from './ModelBadge.tsx';

const QWEN = 'Qwen3.5-9B-The-Defiant-Fable-Uncnr-Heretic-plusIQ-TOOLS-NEO-MAX-MTP-Q8_0';
const badgeOf = (container: HTMLElement) => container.querySelector('[data-badge]');

describe('ModelBadge', () => {
  it('écrit le fournisseur en étiquette et le modèle en valeur, nom entier lu et en infobulle', () => {
    const { container } = render(
      <ModelBadge model={{ model: QWEN, provider: 'llamacpp', source: 'config' }} />,
    );
    expect(screen.getByText('llama.cpp')).toBeInTheDocument();
    expect(screen.getByText(QWEN)).toBeInTheDocument();
    const badge = badgeOf(container);
    expect(badge).toHaveAttribute('title', `${QWEN} via llama.cpp, configuration de l’agent`);
    expect(badge).toHaveAttribute('data-code');
    expect(badge).toHaveAttribute('data-tone', 'neutral');
  });

  it('teinte le modèle observé sur le dernier appel', () => {
    const { container } = render(
      <ModelBadge model={{ model: 'mix', provider: 'moa', source: 'live' }} />,
    );
    expect(badgeOf(container)).toHaveAttribute('data-tone', 'accent');
  });

  it('nomme la lane CLI en étiquette, à sa couleur, et garde le fournisseur dans la description', () => {
    const { container } = render(
      <ModelBadge
        model={{ model: 'claude-opus-5-5', provider: 'anthropic', source: 'live' }}
        lane
      />,
    );
    expect(screen.getByText('lane')).toBeInTheDocument();
    expect(screen.queryByText('Claude')).toBeNull();
    const badge = badgeOf(container);
    expect(badge).toHaveAttribute('data-tone', 'done');
    expect(badge).toHaveAttribute(
      'title',
      'lane : claude-opus-5-5 via Claude, observé sur le dernier appel',
    );
  });

  it('se contente du nom quand on ne connaît ni le fournisseur ni la source', () => {
    const { container } = render(<ModelBadge model={{ model: 'agnes-2.5-flash' }} />);
    const badge = badgeOf(container);
    expect(badge?.querySelectorAll('[data-segment]')).toHaveLength(1);
    expect(badge).toHaveAttribute('title', 'agnes-2.5-flash');
  });
});
