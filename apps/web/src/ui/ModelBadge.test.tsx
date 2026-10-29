import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { modelEditor, providerMark } from './badge/marks.ts';
import type { BrandMark } from './badge/marks.ts';
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

  it('dit le modèle observé sur le dernier appel en infobulle et au lecteur d’écran, valeur neutre', () => {
    const { container } = render(
      <ModelBadge model={{ model: 'mix', provider: 'moa', source: 'live' }} />,
    );
    const badge = badgeOf(container);
    expect(badge).toHaveAttribute('data-tone', 'neutral');
    expect(badge).toHaveAttribute('title', 'mix via MoA, observé sur le dernier appel');
    expect(screen.getByText('mix via MoA, observé sur le dernier appel')).toHaveClass(
      'fl-visually-hidden',
    );
  });

  it('nomme la lane CLI en étiquette, valeur neutre : un seul code couleur, celui de l’outil', () => {
    const { container } = render(
      <ModelBadge
        model={{ model: 'claude-opus-5-5', provider: 'anthropic', source: 'live' }}
        lane
      />,
    );
    expect(screen.getByText('lane')).toBeInTheDocument();
    expect(screen.queryByText('Claude')).toBeNull();
    const badge = badgeOf(container);
    expect(badge).toHaveAttribute('data-tone', 'neutral');
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

describe('ModelBadge, icônes et couleurs', () => {
  const segment = (container: HTMLElement, name: 'label' | 'value') =>
    container.querySelector(`[data-segment="${name}"]`);
  const logo = (mark: BrandMark | null) => mark?.path ?? 'aucun';

  it('peint l’étiquette d’un fournisseur de marque, sans répéter son logo sur un modèle maison', () => {
    const { container } = render(
      <ModelBadge
        model={{ model: 'nvidia/nemotron-3-super-120b-a12b', provider: 'nvidia', source: 'live' }}
      />,
    );
    expect(segment(container, 'label')).toHaveAttribute('data-brand', 'NVIDIA');
    expect(segment(container, 'label')?.querySelector('path')).toHaveAttribute(
      'd',
      logo(providerMark('nvidia') as BrandMark),
    );
    expect(segment(container, 'value')?.querySelector('svg')).toBeNull();
  });

  it('marque une passerelle d’une octicon et pose le logo de l’éditeur sur le modèle', () => {
    const { container } = render(
      <ModelBadge
        model={{
          model: 'nvidia/nemotron-3-super-120b-a12b',
          provider: 'freellmapi',
          source: 'config',
        }}
      />,
    );
    expect(segment(container, 'label')).not.toHaveAttribute('data-brand');
    expect(segment(container, 'label')?.querySelector('svg path')).not.toHaveAttribute(
      'd',
      logo(modelEditor('nemotron')),
    );
    expect(segment(container, 'value')?.querySelector('path')).toHaveAttribute(
      'd',
      logo(modelEditor('nemotron')),
    );
  });

  it('peint la lane aux couleurs de son CLI (Claude Code)', () => {
    const { container } = render(
      <ModelBadge
        model={{ model: 'claude-opus-5-5', provider: 'anthropic', source: 'live' }}
        lane
      />,
    );
    expect(segment(container, 'label')).toHaveAttribute('data-brand', 'Claude');
    expect(segment(container, 'value')?.querySelector('svg')).toBeNull();
  });

  it('pose le logo de l’éditeur même sans fournisseur connu (fil d’activité, transcription)', () => {
    const { container } = render(<ModelBadge model={{ model: 'Qwen3.5-9B-Q4_K_M' }} />);
    expect(segment(container, 'value')?.querySelector('path')).toHaveAttribute(
      'd',
      logo(modelEditor('qwen')),
    );
  });
});

describe('ModelBadge en anglais', () => {
  afterEach(() => localStorage.clear());

  it('dit d’où vient le modèle dans la langue choisie', () => {
    localStorage.setItem('factory-live:locale', 'en');
    const { container } = render(
      <I18nProvider>
        <ModelBadge
          model={{ model: 'claude-opus-5-5', provider: 'anthropic', source: 'live' }}
          lane
        />
      </I18nProvider>,
    );
    expect(badgeOf(container)).toHaveAttribute(
      'title',
      'lane: claude-opus-5-5 via Claude, seen on the latest call',
    );
  });

  it('dit en anglais qu’un modèle est observé en direct, sans teinter sa valeur', () => {
    localStorage.setItem('factory-live:locale', 'en');
    const { container } = render(
      <I18nProvider>
        <ModelBadge model={{ model: 'mix', provider: 'moa', source: 'live' }} />
      </I18nProvider>,
    );
    expect(badgeOf(container)).toHaveAttribute('data-tone', 'neutral');
    expect(badgeOf(container)).toHaveAttribute('title', 'mix via MoA, seen on the latest call');
  });
});
