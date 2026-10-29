import { CheckIcon } from '@primer/octicons-react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge.tsx';

const badgeOf = (container: HTMLElement) => container.querySelector('[data-badge]');

describe('Badge', () => {
  it('montre l’étiquette puis la valeur, en vrai texte, et les lit d’un trait', () => {
    const { container } = render(<Badge label="CI" value="réussie" />);
    expect(screen.getByText('CI')).toBeInTheDocument();
    expect(screen.getByText('réussie')).toBeInTheDocument();
    const badge = badgeOf(container);
    expect(badge).toHaveAttribute('title', 'CI : réussie');
    // Les segments visibles sont doublés d'une phrase pour les lecteurs d'écran, lue une seule fois.
    expect(badge).toHaveTextContent('CI : réussie');
    expect(screen.getByText('CI').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('se réduit à sa valeur quand il n’a pas d’étiquette', () => {
    const { container } = render(<Badge value="v0.12.0" code />);
    const badge = badgeOf(container);
    expect(badge?.querySelectorAll('[data-segment]')).toHaveLength(1);
    expect(badge).toHaveAttribute('title', 'v0.12.0');
    expect(badge).toHaveAttribute('data-code');
  });

  it('est neutre par défaut ; la couleur de l’état ne colore que la valeur, le texte le dit', () => {
    const { container, rerender } = render(<Badge label="CI" value="en cours" />);
    expect(badgeOf(container)).toHaveAttribute('data-tone', 'neutral');
    rerender(<Badge label="CI" value="en échec" tone="danger" />);
    expect(badgeOf(container)).toHaveAttribute('data-tone', 'danger');
  });

  it('lit la description quand elle en dit plus que le texte visible', () => {
    const { container } = render(
      <Badge label="llama.cpp" value="Qwen3.5-9B" description="Qwen3.5-9B via llama.cpp" />,
    );
    expect(badgeOf(container)).toHaveAttribute('title', 'Qwen3.5-9B via llama.cpp');
    expect(screen.getByText('Qwen3.5-9B via llama.cpp')).toHaveClass('fl-visually-hidden');
  });

  it('mène à une page quand on lui donne un lien, avec le texte du badge pour nom', () => {
    render(
      <MemoryRouter>
        <Badge label="claude-cockpit" value="#71" description="claude-cockpit#71" to="/issues/x" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'claude-cockpit#71' })).toHaveAttribute(
      'href',
      '/issues/x',
    );
  });

  it('dit quel segment cède la place quand la largeur manque', () => {
    const { container, rerender } = render(<Badge label="dépôt" value="#1" />);
    expect(badgeOf(container)).toHaveAttribute('data-yields', 'value');
    rerender(<Badge label="dépôt" value="#1" yields="label" />);
    expect(badgeOf(container)).toHaveAttribute('data-yields', 'label');
  });

  it('tronque la valeur longue sur une ligne, sauf à la couper (détail) ou sur deux lignes (tableau)', () => {
    const { container, rerender } = render(<Badge value="Qwen3.5-9B" />);
    expect(badgeOf(container)).toHaveAttribute('data-overflow', 'truncate');
    rerender(<Badge value="Qwen3.5-9B" overflow="wrap" />);
    expect(badgeOf(container)).toHaveAttribute('data-overflow', 'wrap');
    rerender(<Badge value="Qwen3.5-9B" overflow="clamp" />);
    expect(badgeOf(container)).toHaveAttribute('data-overflow', 'clamp');
  });

  it('pose une icône décorative devant la valeur', () => {
    const { container } = render(
      <Badge label="CI" value="réussie" tone="success" icon={CheckIcon} />,
    );
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon?.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
