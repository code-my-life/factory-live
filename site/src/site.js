// Le site de factory-live : onglets (écrans, étapes d'installation), glissière du schéma, entrées en
// scène. Sans script, tout reste lisible : chaque panneau s'affiche et rien n'est caché.
(() => {
  const root = document.documentElement;

  /** Onglets ARIA : clic, flèches, Début et Fin ; le panneau choisi seul visible. */
  function setupTabs(tablist) {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const select = (tab, focus) => {
      for (const other of tabs) {
        const selected = other === tab;
        other.setAttribute('aria-selected', String(selected));
        other.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(other.getAttribute('aria-controls') ?? '');
        if (panel) panel.hidden = !selected;
      }
      if (focus) tab.focus();
    };
    tablist.addEventListener('click', (event) => {
      const tab = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
      if (tab) select(tab, false);
    });
    tablist.addEventListener('keydown', (event) => {
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      const steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      let target = null;
      if (event.key in steps) target = tabs[(index + steps[event.key] + tabs.length) % tabs.length];
      if (event.key === 'Home') target = tabs[0];
      if (event.key === 'End') target = tabs[tabs.length - 1];
      if (!target) return;
      event.preventDefault();
      select(target, true);
    });
    select(tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') ?? tabs[0], false);
  }

  for (const tablist of document.querySelectorAll('[role="tablist"]')) setupTabs(tablist);

  /** Le menu du téléphone se referme quand on choisit une section. */
  const menu = document.querySelector('.nav-menu');
  if (menu instanceof HTMLDetailsElement) {
    menu.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('a')) menu.open = false;
    });
  }

  /**
   * La démo s'ouvre dans la langue de la page : l'app lit `factory-live:locale` (sa langue choisie
   * dans Réglages) avant celle du navigateur. Sans script ou sans stockage, elle suit le navigateur.
   */
  const remember = (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || !/(^|\/)demo\/(#|$)/.test(link.getAttribute('href') ?? '')) return;
    try {
      localStorage.setItem('factory-live:locale', root.lang === 'fr' ? 'fr' : 'en');
    } catch {
      // Stockage indisponible (navigation privée, aperçu) : la démo suit la langue du navigateur.
    }
  };
  document.addEventListener('click', remember);
  document.addEventListener('auxclick', remember);

  /** La glissière de « Comment ça marche » : une étape, son texte, son chemin dans le schéma. */
  const how = document.querySelector('.how');
  const range = how?.querySelector('.stage-range');
  if (how && range instanceof HTMLInputElement) {
    const stages = [...how.querySelectorAll('.stage')];
    const names = [...how.querySelectorAll('.stage-name')];
    const labels = (range.dataset.labels ?? '').split('|');
    const show = (position) => {
      const stage = stages[position - 1]?.getAttribute('data-stage');
      if (!stage) return;
      how.dataset.stage = stage;
      range.value = String(position);
      range.setAttribute('aria-valuetext', labels[position - 1] ?? stage);
      stages.forEach((item, index) => {
        item.hidden = index !== position - 1;
      });
      names.forEach((name, index) =>
        name.setAttribute('aria-pressed', String(index === position - 1)),
      );
      for (const element of how.querySelectorAll('[data-on]')) {
        const on = (element.getAttribute('data-on') ?? '').split(' ');
        element.toggleAttribute('data-active', on.includes(stage));
      }
      for (const element of how.querySelectorAll('[data-for]')) {
        element.toggleAttribute('data-active', element.getAttribute('data-for') === stage);
      }
      for (const node of how.querySelectorAll('.node')) {
        node.toggleAttribute('data-active', Boolean(node.querySelector('.chip[data-active]')));
        // La voie qui part de l'arrêt s'anime quand l'étape passe par elle.
        node.toggleAttribute('data-flow', Boolean(node.querySelector('.segment[data-active]')));
      }
    };
    range.addEventListener('input', () => show(Number(range.value)));
    for (const name of names) {
      name.addEventListener('click', () => show(Number(name.getAttribute('data-to'))));
    }
    show(Number(range.value) || 1);
  }

  /** Entrées en scène : seulement si le mouvement est permis ; le contenu reste visible sans script. */
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!still && 'IntersectionObserver' in window) {
    const items = [...document.querySelectorAll('[data-reveal]')];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      },
      // Un peu avant que l'élément n'entre à l'écran : il a fini d'arriver quand on le lit.
      { rootMargin: '0px 0px 15% 0px' },
    );
    for (const item of items) {
      const siblings = item.parentElement ? [...item.parentElement.children] : [];
      const rank = siblings.filter((sibling) => sibling.hasAttribute('data-reveal')).indexOf(item);
      item.style.transitionDelay = `${Math.min(rank, 5) * 70}ms`;
      observer.observe(item);
    }
    root.classList.add('reveal-ready');
  }
})();
