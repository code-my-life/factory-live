import { CheckIcon, ServerIcon } from '@primer/octicons-react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge.tsx';
import { providerMark } from './marks.ts';
import type { BrandMark } from './marks.ts';

const NVIDIA = providerMark('nvidia') as BrandMark;

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

  it('tronque la valeur longue sur une ligne', () => {
    const { container } = render(<Badge value="Qwen3.5-9B" />);
    expect(badgeOf(container)).toHaveAttribute('data-overflow', 'truncate');
  });

  it('pose une icône décorative devant la valeur', () => {
    const { container } = render(
      <Badge label="CI" value="réussie" tone="success" icon={CheckIcon} />,
    );
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('pose une icône sur l’étiquette : une octicon pour un concept, le tracé d’un logo pour une marque', () => {
    const { container, rerender } = render(
      <Badge label="freellmapi" labelIcon={ServerIcon} value="auto" />,
    );
    const label = () => container.querySelector('[data-segment="label"]');
    expect(label()?.querySelector('svg')).not.toBeNull();
    rerender(<Badge label="NVIDIA" labelIcon={NVIDIA} value="nemotron" />);
    expect(label()?.querySelector('svg path')).toHaveAttribute('d', NVIDIA.path);
    expect(label()?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('colore l’icône de l’étiquette selon son état (issue ouverte, fermée)', () => {
    const { container } = render(
      <Badge label="cv-site" labelIcon={ServerIcon} labelIconTone="success" value="#49" />,
    );
    expect(container.querySelector('[data-segment="label"]')).toHaveAttribute(
      'data-icon-tone',
      'success',
    );
  });

  it('peint l’étiquette de la couleur de la marque, texte blanc ou noir selon sa luminance', () => {
    const { container } = render(
      <Badge label="NVIDIA" labelIcon={NVIDIA} brand={NVIDIA} value="nemotron" />,
    );
    const label = container.querySelector('[data-segment="label"]');
    expect(label).toHaveAttribute('data-brand', 'NVIDIA');
    expect(label).toHaveStyle({ backgroundColor: 'rgb(118, 185, 0)', color: 'rgb(0, 0, 0)' });
  });

  it('teinte l’icône de la valeur de la teinte de l’élément, le texte garde sa couleur', () => {
    const { container } = render(
      <Badge label="skill" value="factory-brief" hue="indigo" icon={CheckIcon} />,
    );
    const style = badgeOf(container)?.getAttribute('style') ?? '';
    expect(style).toContain('--fl-hue-fg: var(--display-indigo-fgColor)');
    expect(container.querySelector('[data-segment="value"] svg')).toHaveAttribute(
      'fill',
      'var(--fl-hue-fg)',
    );
    expect(style).not.toContain('color:');
  });

  it('teinte l’étiquette GitHub de sa couleur, sans toucher au texte', () => {
    const { container } = render(<Badge label="étiquette" value="bug" githubColor="d73a4a" />);
    const style = badgeOf(container)?.getAttribute('style') ?? '';
    expect(style).toContain('color-mix(in srgb, #d73a4a 18%, var(--bgColor-default))');
    expect(style).toContain('color-mix(in srgb, #d73a4a 45%, var(--bgColor-default))');
  });

  it('teinte la valeur d’un état de la couleur de son rôle, sans valeur pleine', () => {
    const { container } = render(<Badge label="CI" value="en échec" tone="danger" />);
    expect(badgeOf(container)).not.toHaveAttribute('data-solid');
    expect(badgeOf(container)).toHaveAttribute('data-tone', 'danger');
  });
});
