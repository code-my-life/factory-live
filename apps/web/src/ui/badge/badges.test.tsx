import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider.tsx';
import { ModelBadge } from '../ModelBadge.tsx';
import { AgentBadge } from './AgentBadge.tsx';
import { Badge } from './Badge.tsx';
import { BranchBadge } from './BranchBadge.tsx';
import { CardBadge, KIND_ICON } from './CardBadge.tsx';
import { ChecksBadge } from './ChecksBadge.tsx';
import { hiddenToolset, isMcpToolset, splitNames } from './config.ts';
import { EffortBadge, McpBadge, PluginBadge, ToolsetBadge } from './ConfigBadges.tsx';
import { GithubLabelBadge } from './GithubLabelBadge.tsx';
import { FIXED_HUES, hueOf } from './hues.ts';
import type { Hue } from './hues.ts';
import { IssueBadge } from './IssueBadge.tsx';
import { CHECKS_MARK } from './marks.ts';
import { PullRequestBadge } from './PullRequestBadge.tsx';
import { SourceBadge } from './SourceBadge.tsx';
import { StationBadge } from './StationBadge.tsx';
import { SkillBadge } from './SkillBadge.tsx';
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

  it('ChecksBadge suit le standard : étiquette grise « CI » avec le logo de GitHub Actions', () => {
    // The "CI" label is grey like every other label (no brand paint, no transparent label): the
    // state, in the value, is tinted with the role color, never painted solid.
    const { container } = render(<ChecksBadge checks="success" />);
    const label = container.querySelector('[data-segment="label"]');
    expect(label).not.toHaveAttribute('data-brand');
    expect(label).not.toHaveAttribute('style');
    expect(badgeOf(container)).not.toHaveAttribute('data-solid');
    // The GitHub Actions logo and label text remain present.
    expect(label?.querySelector('svg path')).toHaveAttribute('d', CHECKS_MARK.path);
    expect(screen.getByText('CI')).toBeInTheDocument();
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

  it('teinte la CI de la couleur de son état, avec le logo de GitHub Actions', () => {
    const { container } = render(<ChecksBadge checks="failure" />);
    expect(badgeOf(container)).not.toHaveAttribute('data-solid');
    expect(badgeOf(container)).toHaveAttribute('data-tone', 'danger');
    expect(label(container)?.querySelector('path')).toHaveAttribute('d', CHECKS_MARK.path);
    expect(container.querySelector('[data-segment="value"] svg')).not.toBeNull();
  });

  it('marque une version d’une étiquette', () => {
    const { container } = render(<VersionBadge of="Hermès" version="0.22.2" />);
    expect(label(container)?.querySelector('svg')).not.toBeNull();
  });
});

describe('label background of badges', () => {
  const label = (container: HTMLElement) => container.querySelector('[data-segment="label"]');

  it('every badge keeps a grey label, with no paint of its own (the CI label included)', () => {
    // The label is grey for all: the tint of an element goes on the value and the frame only.
    const { container: issue } = render(<IssueBadge issueKey="cv-site#49" />);
    const { container: version } = render(<VersionBadge of="Hermès" version="0.22.2" />);
    const { container: card } = render(<CardBadge kind="impl" id="t_5e21c0d9" />);
    const { container: checks } = render(<ChecksBadge checks="success" />);
    for (const badge of [issue, version, card, checks]) {
      expect(label(badge)).not.toHaveAttribute('data-brand');
      expect(label(badge)).not.toHaveAttribute('style');
    }
  });
});

describe('standard des badges', () => {
  it('un skill connu prend la teinte indigo du tableau 2 sur sa valeur et son cadre', () => {
    const { container } = render(<SkillBadge name="factory-brief" />);
    const badge = badgeOf(container);
    expect(badge).toHaveAttribute('data-hue', 'indigo');
    expect(badge).not.toHaveAttribute('data-solid');
    expect(badge).toHaveAttribute('title', 'skill : factory-brief');
    // Grey label: the type icon and the type word.
    const label = container.querySelector('[data-segment="label"]');
    expect(label?.querySelector('svg')).not.toBeNull();
    expect(label).toHaveTextContent('skill');
    expect(label).not.toHaveAttribute('data-brand');
    // Value: the element text.
    const value = container.querySelector('[data-segment="value"]');
    expect(value).toHaveTextContent('factory-brief');
    // The hue tints the value background and the frame, with the Primer display tokens.
    const style = badge?.getAttribute('style') ?? '';
    expect(style).toContain('--display-indigo-bgColor-muted');
    expect(style).toContain('--display-indigo-borderColor-muted');
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

  it('nomment le type de chaque élément dans la langue choisie', () => {
    localStorage.setItem('factory-live:locale', 'en');
    const { container } = render(
      <I18nProvider>
        <StationBadge station="gate" />
        <BranchBadge repo="cv-site" name="fix/1" />
        <GithubLabelBadge label={{ name: 'bug', color: 'd73a4a' }} />
        <ModelBadge model={{ model: 'agnes-2.5-flash' }} />
      </I18nProvider>,
    );
    const titles = [...container.querySelectorAll('[data-badge]')].map((badge) =>
      badge.getAttribute('title'),
    );
    expect(titles).toEqual([
      'station: Gate',
      'Branch of cv-site: fix/1',
      'label: bug',
      'agnes-2.5-flash',
    ]);
    expect(screen.getByText('model')).toBeInTheDocument();
  });
});

describe('le tableau 1 de l’inventaire, un badge par ligne', () => {
  const label = (container: HTMLElement) => container.querySelector('[data-segment="label"]');
  const value = (container: HTMLElement) => container.querySelector('[data-segment="value"]');
  /** The hue applied to the value, the frame and the value icon, with Primer's display tokens. */
  const expectHue = (container: HTMLElement, hue: Hue) => {
    const badge = badgeOf(container);
    const style = badge?.getAttribute('style') ?? '';
    expect(badge).toHaveAttribute('data-hue', hue);
    expect(badge).not.toHaveAttribute('data-solid');
    expect(style).toContain(`--fl-hue-bg: var(--display-${hue}-bgColor-muted)`);
    expect(style).toContain(`--fl-hue-border: var(--display-${hue}-borderColor-muted)`);
    expect(style).toContain(`--fl-hue-fg: var(--display-${hue}-fgColor)`);
  };

  it('poste : l’icône de la station, « poste », le nom, la teinte du poste', () => {
    const hues: Record<string, Hue> = {
      intake: 'cyan',
      brief: 'indigo',
      implementation: 'blue',
      gate: 'orange',
      release: 'coral',
      done: 'pine',
      stopped: 'gray',
      side: 'olive',
    };
    for (const [station, hue] of Object.entries(hues)) {
      const { container, unmount } = render(
        <StationBadge station={station as Parameters<typeof StationBadge>[0]['station']} />,
      );
      expect(label(container)?.querySelector('svg')).not.toBeNull();
      expect(label(container)).toHaveTextContent('poste');
      expectHue(container, hue);
      unmount();
    }
    const { container } = render(<StationBadge station="gate" description="Étape : Gate" />);
    expect(badgeOf(container)).toHaveAttribute('title', 'Étape : Gate');
  });

  it('issue, PR et branche prennent la teinte de leur dépôt', () => {
    const repos: Record<string, Hue> = {
      'claude-cockpit': 'coral',
      'cv-site': 'green',
      'factory-live': 'blue',
      'hermes-software-factory': 'purple',
      'liquid-paper': 'teal',
    };
    for (const [repo, hue] of Object.entries(repos)) {
      const { container: issue, unmount: a } = render(<IssueBadge issueKey={`${repo}#90`} />);
      expectHue(issue, hue);
      expect(label(issue)).toHaveTextContent(repo);
      a();
      const { container: pr, unmount: b } = render(
        <PullRequestBadge repo={repo} number={92} url="https://github.com/x/y/pull/92" />,
      );
      expectHue(pr, hue);
      expect(label(pr)).toHaveTextContent(repo);
      b();
      const { container: branch, unmount: c } = render(
        <BranchBadge repo={repo} name="fix/90-v2" />,
      );
      expectHue(branch, hue);
      c();
    }
  });

  it('PR : lien vers GitHub, nommé par son numéro, icône teintée de son état', () => {
    const states = [
      ['open', 'success'],
      ['merged', 'done'],
      ['closed', 'danger'],
      ['draft', null],
    ] as const;
    for (const [state, tone] of states) {
      const { container, unmount } = render(
        <PullRequestBadge
          repo="cv-site"
          number={56}
          url="https://github.com/code-my-life/cv-site/pull/56"
          state={state}
        />,
      );
      expect(screen.getByRole('link', { name: '#56' })).toHaveAttribute(
        'href',
        'https://github.com/code-my-life/cv-site/pull/56',
      );
      expect(label(container)?.getAttribute('data-icon-tone')).toBe(tone);
      expect(value(container)).toHaveTextContent('#56');
      unmount();
    }
    // Unknown state (PR picked up from Hermes runs): open PR icon, no color.
    const { container } = render(
      <PullRequestBadge repo="cv-site" number={56} url="https://github.com/x/y/pull/56" />,
    );
    expect(label(container)).not.toHaveAttribute('data-icon-tone');
    expect(label(container)?.querySelector('svg')).not.toBeNull();
  });

  it('PR et branche d’un dépôt inconnu : le numéro ou le nom seul, sans teinte inventée', () => {
    const { container: pr } = render(
      <PullRequestBadge number={7} url="https://github.com/x/y/pull/7" />,
    );
    expect(pr.querySelectorAll('[data-segment]')).toHaveLength(1);
    expect(badgeOf(pr)).not.toHaveAttribute('data-hue');
    const { container: branch } = render(<BranchBadge name="fix/90-v2" />);
    expect(label(branch)).toHaveTextContent('branche');
    expect(badgeOf(branch)).not.toHaveAttribute('data-hue');
    expect(badgeOf(branch)).toHaveAttribute('title', 'branche : fix/90-v2');
  });

  it('carte : la teinte de son type, gris quand il est inconnu', () => {
    const kinds = {
      brief: 'indigo',
      impl: 'blue',
      release: 'coral',
      diagnostic: 'pink',
      watch: 'lemon',
      onboarding: 'teal',
      other: 'gray',
    } as const;
    for (const [kind, hue] of Object.entries(kinds)) {
      const { container, unmount } = render(
        <CardBadge kind={kind as keyof typeof kinds} id="t_b5e2ef77" />,
      );
      expectHue(container, hue);
      unmount();
    }
    const { container } = render(<CardBadge id="t_b5e2ef77" />);
    expectHue(container, 'gray');
  });

  it('version : la teinte de son produit, étiquette `versions` et non `tag`', () => {
    const { container: hermes } = render(<VersionBadge of="Hermès" version="0.22.2" />);
    expectHue(hermes, 'purple');
    const { container: live } = render(<VersionBadge of="factory-live" version="0.2.0" />);
    expectHue(live, 'blue');
    const { container: bare } = render(<VersionBadge version="0.2.0" />);
    expect(bare.querySelectorAll('[data-segment]')).toHaveLength(1);
    expect(badgeOf(bare)).not.toHaveAttribute('data-hue');
  });

  it('agent : son avatar, « agent », la teinte de son avatar', () => {
    const { container } = render(<AgentBadge profile="coder-claude" />);
    expect(label(container)).toHaveTextContent('agent');
    expect(label(container)?.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('data:image/svg+xml'),
    );
    expect(value(container)).toHaveTextContent('coder-claude');
    expectHue(container, 'plum');
    expect(badgeOf(container)).toHaveAttribute('title', 'agent : coder-claude');
  });

  it('modèle : la teinte de son fournisseur, la lane et l’API Claude en coral', () => {
    const cases: [string, string, Hue, boolean?][] = [
      ['claude-opus-5-5', 'anthropic', 'coral'],
      ['opus', 'claude-code', 'coral', true],
      ['nvidia/nemotron-3-ultra-550b-a55b', 'nvidia', 'lime'],
      ['x/y', 'opencode', 'gray', true],
      ['auto', 'freellmapi', 'teal'],
      ['Qwen3.5-9B', 'llamacpp', 'brown'],
      ['mix', 'moa', 'plum'],
    ];
    for (const [model, provider, hue, lane] of cases) {
      const { container, unmount } = render(
        <ModelBadge model={{ model, provider }} lane={!!lane} />,
      );
      expectHue(container, hue);
      expect(badgeOf(container)).toHaveAttribute('data-code');
      unmount();
    }
  });

  it('modèle sans fournisseur : `sparkle-fill`, « modèle », teinte tirée de son nom', () => {
    const { container } = render(<ModelBadge model={{ model: 'agnes-2.5-flash' }} />);
    expect(label(container)).toHaveTextContent('modèle');
    expect(label(container)?.querySelector('svg')).not.toBeNull();
    expectHue(container, hueOf('model', 'agnes-2.5-flash'));
    expect(badgeOf(container)?.getAttribute('data-hue')).not.toBe('red');
  });

  it('effort, skill, toolset, serveur MCP, plugin : l’étiquette du type et la teinte de l’élément', () => {
    const rows: [ReactElement, string, string, Hue][] = [
      [<EffortBadge level="high" />, 'effort', 'high', 'indigo'],
      [<EffortBadge level="max" />, 'effort', 'max', 'plum'],
      [<SkillBadge name="factory-author-proof" />, 'skill', 'factory-author-proof', 'green'],
      [<ToolsetBadge name="terminal" />, 'toolset', 'terminal', 'gray'],
      [<ToolsetBadge name="session_search" />, 'toolset', 'session_search', 'olive'],
      [<McpBadge name="graphify" />, 'MCP', 'graphify', 'pink'],
      [<PluginBadge name="coder-guard" />, 'plugin', 'coder-guard', 'orange'],
      [<PluginBadge name="merge-guard" />, 'plugin', 'merge-guard', 'auburn'],
    ];
    for (const [element, word, text, hue] of rows) {
      const { container, unmount } = render(element);
      expect(label(container)?.querySelector('svg')).not.toBeNull();
      expect(label(container)).toHaveTextContent(word);
      expect(value(container)).toHaveTextContent(text);
      expectHue(container, hue);
      unmount();
    }
    const { container } = render(
      <EffortBadge level="high" description="Effort de raisonnement : high" />,
    );
    expect(badgeOf(container)).toHaveAttribute('title', 'Effort de raisonnement : high');
  });

  it('un toolset `mcp-<serveur>` se reconnaît, une liste d’écart se découpe', () => {
    expect(isMcpToolset('mcp-graphify')).toBe(true);
    expect(isMcpToolset('terminal')).toBe(false);
    expect(splitNames('terminal, file, kanban')).toEqual(['terminal', 'file', 'kanban']);
  });

  it('un toolset `mcp-<serveur>` ne se masque que si son serveur est déclaré', () => {
    expect(hiddenToolset('mcp-graphify', ['graphify'])).toBe(true);
    expect(hiddenToolset('mcp-graphify', [])).toBe(false);
    expect(hiddenToolset('mcp-graphify', ['other'])).toBe(false);
    expect(hiddenToolset('terminal', ['graphify'])).toBe(false);
  });

  it('source : l’icône de la source, « source », son nom, la teinte de la source', () => {
    const rows = [
      ['kanban', 'Kanban', 'olive'],
      ['hermes', 'Hermès', 'purple'],
      ['github', 'GitHub', 'gray'],
      ['comment', 'Commentaire', 'lemon'],
      ['factory-live', 'factory-live', 'blue'],
    ] as const;
    for (const [kind, name, hue] of rows) {
      const { container, unmount } = render(<SourceBadge kind={kind} name={name} />);
      expect(label(container)?.querySelector('svg')).not.toBeNull();
      expect(label(container)).toHaveTextContent('source');
      expect(value(container)).toHaveTextContent(name);
      expectHue(container, hue);
      unmount();
    }
  });

  it('élément inconnu : toujours la même teinte, jamais le rouge ni une teinte déjà prise', () => {
    const taken = new Set(Object.values(FIXED_HUES.skill));
    for (const name of ['nouvelle-skill', 'autre-skill', 'factory-futur']) {
      const { container, unmount } = render(<SkillBadge name={name} />);
      const hue = badgeOf(container)?.getAttribute('data-hue') as Hue;
      expect(hue).toBe(hueOf('skill', name));
      expect(hue).not.toBe('red');
      expect(taken.has(hue)).toBe(false);
      unmount();
      const again = render(<SkillBadge name={name} />);
      expect(badgeOf(again.container)).toHaveAttribute('data-hue', hue);
      again.unmount();
    }
  });

  it('étiquette GitHub : « étiquette », `tag`, sa couleur à 18 % sur la valeur et 45 % sur le cadre', () => {
    const { container } = render(<GithubLabelBadge label={{ name: 'bug', color: 'd73a4a' }} />);
    expect(label(container)).toHaveTextContent('étiquette');
    expect(label(container)?.querySelector('svg')).not.toBeNull();
    expect(value(container)).toHaveTextContent('bug');
    const badge = badgeOf(container);
    const style = badge?.getAttribute('style') ?? '';
    expect(badge).not.toHaveAttribute('data-hue');
    expect(badge).toHaveAttribute('data-tint');
    expect(style).toContain('#d73a4a 18%');
    expect(style).toContain('#d73a4a 45%');
    expect(badge).toHaveAttribute('title', 'étiquette : bug');
  });

  it('badge CI : étiquette grise, valeur teintée de l’état, sans valeur pleine', () => {
    const states = [
      ['pending', 'attention'],
      ['success', 'success'],
      ['failure', 'danger'],
    ] as const;
    for (const [checks, tone] of states) {
      const { container, unmount } = render(<ChecksBadge checks={checks} />);
      expect(badgeOf(container)).toHaveAttribute('data-tone', tone);
      expect(badgeOf(container)).not.toHaveAttribute('data-solid');
      expect(badgeOf(container)).not.toHaveAttribute('data-hue');
      expect(label(container)).toHaveTextContent('CI');
      unmount();
    }
  });

  it('tableau : la teinte du tableau, en police de code', () => {
    const { container } = render(
      <Badge label="board" value="factory" hue={hueOf('board', 'factory')} code />,
    );
    expectHue(container, 'brown');
  });
});

describe('un badge tient sur une ligne', () => {
  const QWEN = 'Qwen3.5-9B-The-Defiant-Fable-Uncnr-Heretic-plusIQ-TOOLS-NEO-MAX-MTP-Q8_0';
  const NEMOTRON = 'nvidia/nemotron-3-ultra-550b-a55b';
  const split = (container: HTMLElement) =>
    container.querySelector('[data-segment="value"] [data-split]');

  it('coupe au milieu un nom de modèle trop long, ses derniers segments entiers', () => {
    const { container } = render(<ModelBadge model={{ model: QWEN, provider: 'llamacpp' }} />);
    const parts = split(container);
    expect(parts).not.toBeNull();
    // The full name (hidden), the head that gives way, the tail that stays.
    const [full, head, tail] = [...(parts?.children ?? [])];
    expect(full).toHaveTextContent(QWEN);
    expect(full).toHaveClass('fl-visually-hidden');
    expect(head).toHaveTextContent(
      'Qwen3.5-9B-The-Defiant-Fable-Uncnr-Heretic-plusIQ-TOOLS-NEO-MAX',
    );
    expect(tail).toHaveTextContent('-MTP-Q8_0');
    expect(badgeOf(container)).toHaveAttribute('data-overflow', 'truncate');
    expect(badgeOf(container)?.getAttribute('title')).toContain(QWEN);
  });

  it('marque la tête et la fin d’une valeur coupée, pour les cibler', () => {
    const { container } = render(
      <ModelBadge model={{ model: 'claude-opus-5-5', provider: 'anthropic' }} />,
    );
    expect(container.querySelector('[data-part="head"]')).toHaveTextContent(/^claude$/);
    expect(container.querySelector('[data-part="tail"]')).toHaveTextContent(/^-opus-5-5$/);
  });

  it('coupe nvidia/nemotron-3-ultra-550b-a55b en gardant -550b-a55b', () => {
    const { container } = render(<ModelBadge model={{ model: NEMOTRON, provider: 'nvidia' }} />);
    const parts = split(container);
    expect(parts?.children[1]).toHaveTextContent('nvidia/nemotron-3-ultra');
    expect(parts?.children[2]).toHaveTextContent('-550b-a55b');
  });

  it('écrit une valeur courte d’un seul tenant, et une valeur qui n’est pas un identifiant à la fin', () => {
    const { container } = render(<ModelBadge model={{ model: 'opus', provider: 'claude-code' }} />);
    expect(split(container)).toBeNull();
    const text = render(<Badge value={`${QWEN} sans police de code`} />);
    expect(split(text.container)).toBeNull();
  });

  it('garde la largeur de l’étiquette : elle ne dépend pas de la valeur', () => {
    const { container } = render(<ModelBadge model={{ model: QWEN, provider: 'llamacpp' }} />);
    expect(container.querySelector('[data-segment="label"]')).toHaveTextContent('llama.cpp');
  });
});
