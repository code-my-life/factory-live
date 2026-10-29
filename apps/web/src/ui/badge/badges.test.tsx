import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider.tsx';
import { CardBadge, KIND_ICON } from './CardBadge.tsx';
import { ChecksBadge } from './ChecksBadge.tsx';
import { IssueBadge } from './IssueBadge.tsx';
import { CHECKS_MARK } from './marks.ts';
import { VersionBadge } from './VersionBadge.tsx';

const badgeOf = (container: HTMLElement) => container.querySelector('[data-badge]');

describe('IssueBadge', () => {
  it('écrit le dépôt puis le numéro ; c’est le dépôt qui se tronque, le numéro reste entier', () => {
    const { container } = render(<IssueBadge issueKey="claude-cockpit#71" />);
    expect(screen.getByText('claude-cockpit')).toBeInTheDocument();
    expect(screen.getByText('#71')).toBeInTheDocument();
    const badge = badgeOf(container);
    expect(badge).toHaveAttribute('title', 'claude-cockpit#71');
    expect(badge).toHaveAttribute('data-yields', 'label');
    expect(badge).toHaveAttribute('data-code');
  });

  it('mène à la page de l’issue, nommé par sa clé', () => {
    render(
      <MemoryRouter>
        <IssueBadge issueKey="cv-site#49" link />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'cv-site#49' })).toHaveAttribute(
      'href',
      '/issues/cv-site/49',
    );
  });
});

describe('CardBadge', () => {
  it('écrit le type de la carte puis son identifiant', () => {
    const { container } = render(<CardBadge kind="impl" id="t_5e21c0d9" />);
    expect(screen.getByText('impl')).toBeInTheDocument();
    expect(screen.getByText('t_5e21c0d9')).toBeInTheDocument();
    expect(badgeOf(container)).toHaveAttribute('title', 'impl : t_5e21c0d9');
  });

  it('se réduit à l’identifiant quand le type n’est pas connu', () => {
    const { container } = render(<CardBadge id="t_c41e8a07" />);
    expect(badgeOf(container)?.querySelectorAll('[data-segment]')).toHaveLength(1);
  });
});

describe('ChecksBadge', () => {
  it('dit l’état de la CI en mots, à sa couleur', () => {
    const { container, rerender } = render(<ChecksBadge checks="success" />);
    expect(badgeOf(container)).toHaveAttribute('title', 'CI : réussie');
    expect(badgeOf(container)).toHaveAttribute('data-tone', 'success');
    rerender(<ChecksBadge checks="failure" />);
    expect(badgeOf(container)).toHaveAttribute('title', 'CI : en échec');
    expect(badgeOf(container)).toHaveAttribute('data-tone', 'danger');
    rerender(<ChecksBadge checks="pending" />);
    expect(badgeOf(container)).toHaveAttribute('title', 'CI : en cours');
    expect(badgeOf(container)).toHaveAttribute('data-tone', 'attention');
  });

  it('ne montre rien quand la PR n’a pas de workflow', () => {
    const { container } = render(<ChecksBadge checks="none" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('VersionBadge', () => {
  it('écrit la version en police de code, précédée de ce qu’elle versionne', () => {
    const { container } = render(<VersionBadge of="Hermès" version="0.22.2" />);
    expect(screen.getByText('Hermès')).toBeInTheDocument();
    expect(badgeOf(container)).toHaveAttribute('title', 'Hermès : 0.22.2');
    expect(badgeOf(container)).toHaveAttribute('data-code');
  });

  it('se réduit à la version dans une colonne déjà titrée', () => {
    const { container } = render(<VersionBadge version="v0.12.0" />);
    expect(badgeOf(container)?.querySelectorAll('[data-segment]')).toHaveLength(1);
    expect(badgeOf(container)).toHaveAttribute('title', 'v0.12.0');
  });
});

describe('icônes et couleurs des badges de concept', () => {
  const label = (container: HTMLElement) => container.querySelector('[data-segment="label"]');

  it('marque une issue de l’icône de GitHub, à la couleur de son état quand on le connaît', () => {
    const { container, rerender } = render(<IssueBadge issueKey="cv-site#49" state="open" />);
    expect(label(container)?.querySelector('svg')).not.toBeNull();
    expect(label(container)).toHaveAttribute('data-icon-tone', 'success');
    rerender(<IssueBadge issueKey="cv-site#49" state="closed" />);
    expect(label(container)).toHaveAttribute('data-icon-tone', 'done');
    rerender(<IssueBadge issueKey="cv-site#49" />);
    expect(label(container)).not.toHaveAttribute('data-icon-tone');
  });

  it('marque une carte de l’icône de son type, la même que l’étape du graphe', () => {
    expect(KIND_ICON.impl).toBeDefined();
    const { container } = render(<CardBadge kind="impl" id="t_5e21c0d9" />);
    expect(label(container)?.querySelector('svg')).not.toBeNull();
  });

  it('peint la CI en couleur franche, avec le logo de GitHub Actions', () => {
    const { container } = render(<ChecksBadge checks="failure" />);
    expect(badgeOf(container)).toHaveAttribute('data-solid');
    expect(label(container)?.querySelector('path')).toHaveAttribute('d', CHECKS_MARK.path);
    expect(container.querySelector('[data-segment="value"] svg')).not.toBeNull();
  });

  it('marque une version d’une étiquette', () => {
    const { container } = render(<VersionBadge of="Hermès" version="0.22.2" />);
    expect(label(container)?.querySelector('svg')).not.toBeNull();
  });
});

describe('badges en anglais', () => {
  afterEach(() => localStorage.clear());

  it('écrivent leurs mots et leur infobulle dans la langue choisie', () => {
    localStorage.setItem('factory-live:locale', 'en');
    const { container } = render(
      <I18nProvider>
        <ChecksBadge checks="success" />
        <CardBadge kind="impl" id="t_5e21c0d9" />
      </I18nProvider>,
    );
    const [checks, card] = container.querySelectorAll('[data-badge]');
    expect(checks).toHaveAttribute('title', 'CI: passing');
    expect(screen.getByText('passing')).toBeInTheDocument();
    expect(card).toHaveAttribute('title', 'impl: t_5e21c0d9');
  });
});
