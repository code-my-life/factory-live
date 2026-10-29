// La page en français. Les textes sont du HTML : ils peuvent porter <code>, <a> et des entités.
export default {
  lang: 'fr',
  meta: {
    title: 'factory-live : ta factory d’agents Hermès, en direct',
    description:
      'La factory Hermès en temps réel : la ligne d’usine, chaque carte de chaque issue, les agents et leurs modèles, et les interventions auxquelles tu réponds depuis ton smartphone. Une Progressive Web App, installée depuis le navigateur.',
    ogAlt:
      'La ligne d’usine de factory-live : six stations, une boîte par issue, son état et son agent.',
  },
  skip: 'Aller au contenu',
  nav: {
    label: 'Principale',
    see: 'Ce qu’on y voit',
    how: 'Comment ça marche',
    start: 'Installer',
    security: 'Sécurité',
    roadmap: 'Feuille de route',
    menu: 'Menu',
    demo: 'Démo',
    other: 'English',
  },
  hero: {
    title: 'Ta factory d’agents, en direct',
    lede: 'factory-live est une Progressive Web App qui montre quelle issue est à quelle station, quel agent la tient, avec quel modèle, et ce qui attend ta décision.',
    cta: 'Essayer la démo',
    source: 'Le code sur GitHub',
    note: 'Elle s’installe depuis le navigateur sur ordinateur, tablette ou smartphone, sans store. La démo rejoue un après-midi de la factory dans ton navigateur, sans serveur.',
    alt: 'La ligne d’usine de factory-live : six stations de l’intake à terminé, une boîte par issue avec son état et son agent, et deux blocages qui attendent une décision.',
  },
  screens: {
    title: 'Une app, tous tes écrans',
    tabsLabel: 'Écran',
    tabs: [
      {
        id: 'desktop',
        label: 'Ordinateur',
        alt: 'factory-live sur un écran d’ordinateur : la navigation à gauche, la ligne d’usine, ce que fait chaque agent et l’activité en direct.',
      },
      {
        id: 'tablet',
        label: 'Tablette',
        alt: 'factory-live sur une tablette en portrait : la ligne d’usine descend l’écran, les boîtes des issues côte à côte.',
      },
      {
        id: 'phone',
        label: 'Smartphone',
        alt: 'factory-live sur un smartphone : la ligne d’usine descend l’écran, la barre d’onglets en bas.',
      },
    ],
    text: 'factory-live est une Progressive Web App : elle s’installe depuis le navigateur, sans store. Installée, elle a son icône sur l’écran d’accueil, s’ouvre en plein écran, t’envoie une notification push quand un blocage t’attend, et s’ouvre hors ligne sur le dernier état reçu.',
    installs: [
      ['Ordinateur', 'Chrome ou Edge : l’icône d’installation dans la barre d’adresse.'],
      ['Android', 'Chrome : le menu, puis «&nbsp;Installer l’application&nbsp;».'],
      ['iPhone, iPad', 'Safari : Partager, puis «&nbsp;Sur l’écran d’accueil&nbsp;».'],
    ],
    note: 'Sur iPhone et iPad, les notifications push ne marchent qu’une fois l’app installée (iOS&nbsp;16.4 ou plus)&nbsp;; sur Android, dès le navigateur.',
    open: 'Ouvrir la démo',
    install: 'L’installer',
  },
  see: {
    title: 'Ce qu’on y voit',
    open: 'Ouvrir dans la démo',
    tiles: [
      {
        id: 'live',
        title: 'En ce moment',
        text: 'Chaque agent au travail : l’outil lancé, le fichier modifié, le modèle qui a répondu.',
        view: 'ligne',
        alt: 'Ce que fait chaque agent en ce moment : coder-claude modifie un fichier par Claude Code, gate lance les tests, coordinator attend une place.',
      },
      {
        id: 'issue',
        title: 'Une issue, carte par carte',
        text: 'Son graphe de cartes, chaque run avec le modèle réellement servi, la transcription intégrale, la PR et sa CI.',
        view: 'issues',
        alt: 'Les cartes de l’issue claude-cockpit#71 : brief terminé, implémentation en cours dans une lane Claude Code, release en attente, et les runs de la carte choisie.',
      },
      {
        id: 'intervention',
        title: 'Interventions',
        text: 'La question entière de l’agent. Tu réponds dans l’app, factory-live poste <code>/factory unblock</code> sur l’issue pour toi.',
        view: 'interventions',
        alt: 'Une intervention : le coordinateur demande s’il faut joindre une maquette ou valider une mise en page simple, avec la zone de réponse et le bouton Débloquer.',
      },
      {
        id: 'agent',
        title: 'Agents et modèles',
        text: 'La chaîne de modèles de chaque agent dans l’ordre des fallbacks, ses skills et ses plugins, et la dérive par rapport au dépôt.',
        view: 'agents',
        alt: 'Deux agents, coder-claude et coder-opencode : ce que fait chacun, sa chaîne de modèles dans l’ordre des fallbacks, et une configuration différente de celle du dépôt de la factory.',
      },
      {
        id: 'health',
        title: 'Santé',
        text: 'Gateway, dispatcher, fournisseurs de modèles et outils, vérifiés par une sonde toutes les 30&nbsp;secondes.',
        view: 'sante',
        alt: 'La santé de la factory : le gateway Hermès, le dispatcher du kanban, la pause, le dashboard et quatre fournisseurs de modèles, tous joignables.',
      },
      {
        id: 'costs',
        title: 'Coûts et quotas',
        text: 'Appels, jetons et réponses 429 par modèle, et ce que coûteraient les runs Claude.',
        view: 'couts',
        alt: 'Appels, jetons en entrée et en sortie, réponses 429, erreurs et coût de chaque modèle utilisé par la factory sur sept jours.',
      },
      {
        id: 'history',
        title: 'Historique',
        text: 'Issues terminées, délai médian du label au merge, temps par station, passage en gate du premier coup.',
        view: 'historique',
        alt: 'L’historique sur 14 jours : 9 issues terminées, un délai médian de 3 h 32 du label au merge, le temps médian par station et le taux de passage en gate du premier coup.',
      },
    ],
  },
  how: {
    title: 'Comment ça marche',
    intro:
      'Rien n’est écrit pour factory-live. Il écoute ce qu’Hermès Agent envoie déjà et lit ce qu’il garde déjà.',
    stageLabel: 'Étape',
    stages: [
      {
        id: 'listen',
        label: 'Écouter',
        title: 'Hermès poste des webhooks signés',
        text: 'Les webhooks sortants natifs d’Hermès Agent envoient chaque appel d’outil, chaque réponse de modèle et chaque événement du kanban en un POST HTTP signé HMAC-SHA256. L’envoi ne bloque jamais un agent. Une sonde dans le gateway ajoute la santé de la factory toutes les 30&nbsp;secondes.',
      },
      {
        id: 'read',
        label: 'Lire',
        title: 'Le kanban est seulement lu',
        text: '<code>kanban.db</code>, les sessions de chaque agent et les logs des cartes sont ouverts en lecture seule, par des requêtes courtes. factory-live voit un changement en moins de 300&nbsp;ms et s’y recale après un redémarrage.',
      },
      {
        id: 'stream',
        label: 'Diffuser',
        title: 'Un seul flux pour tous les écrans',
        text: 'Le serveur tient l’état en direct et envoie chaque changement par Server-Sent Events à l’app de ton ordinateur et de ton smartphone. Un blocage qui t’attend envoie aussi une notification push sur ton smartphone.',
      },
      {
        id: 'unblock',
        label: 'Débloquer',
        title: 'Ta réponse repart sur l’issue',
        text: 'Tu réponds dans l’app&nbsp;: factory-live poste <code>/factory unblock</code> et ton texte sur l’issue, à ton nom sur GitHub. Le bot de la factory réagit, la carte repart, et la ligne le montre.',
      },
    ],
    schema: {
      label: 'Le chemin des données, d’Hermès Agent jusqu’à tes écrans, et retour par GitHub.',
      nodes: [
        {
          id: 'hermes',
          icon: 'CpuIcon',
          title: 'Hermès Agent',
          sub: 'ta machine',
          items: [
            ['listen unblock', 'Workers, un par carte'],
            ['listen', 'Gateway et dispatcher'],
            ['listen', 'Sonde de santé'],
            ['read', '<code>kanban.db</code>, sessions, logs'],
          ],
        },
        {
          id: 'live',
          icon: 'logo',
          title: 'factory-live',
          sub: 'Docker, 127.0.0.1:8446',
          items: [
            ['listen', 'Ingestion signée'],
            ['read', 'État en direct et historique'],
            ['stream', 'REST et SSE'],
            ['stream', 'Web Push'],
          ],
        },
        {
          id: 'screens',
          icon: 'DeviceMobileIcon',
          title: 'Tes écrans',
          sub: 'sur ton tailnet',
          items: [
            ['stream unblock', 'Smartphone'],
            ['stream', 'Tablette'],
            ['stream', 'Ordinateur'],
          ],
        },
        {
          id: 'github',
          icon: 'MarkGithubIcon',
          title: 'GitHub',
          sub: 'ton compte',
          items: [
            ['unblock', 'Commentaire <code>/factory unblock</code>'],
            ['unblock', 'Réaction du bot'],
            ['', 'PR et CI'],
          ],
        },
      ],
      links: [
        { from: 'hermes', stages: { listen: 'webhooks signés', read: 'lecture seule' } },
        { from: 'live', stages: { stream: 'SSE et Web Push' } },
        { from: 'screens', stages: { unblock: 'ta réponse' } },
      ],
      back: { stage: 'unblock', text: 'Le bot lit le commentaire et la carte repart dans Hermès.' },
    },
    note: 'Si factory-live s’arrête, la factory ne le remarque pas&nbsp;: les envois échouent sans bloquer aucun agent, et factory-live se recale sur les bases à son redémarrage.',
  },
  start: {
    title: 'L’installer à côté de ta factory',
    text: 'factory-live tourne sur la machine d’Hermès Agent, sous Linux ou WSL, avec Docker et Tailscale. Cinq étapes, une dizaine de minutes.',
    guide: 'Le guide complet dans le README',
    tabsLabel: 'Étapes',
    steps: [
      {
        id: 'hermes',
        label: 'Hermès',
        hint: 'Webhooks et sonde',
        rows: [
          {
            title: 'Envoyer les webhooks',
            text: 'Chaque agent déclare factory-live dans ses hooks sortants. L’installateur de la factory les écrit.',
            code: `hooks:
  outbound:
    - name: factory-live
      url: http://127.0.0.1:8446/api/ingest/hermes
      secret_env: FACTORY_LIVE_HOOK_SECRET
      timeout: 2
      events: [pre_tool_call, post_tool_call, post_api_request, …]`,
          },
          {
            title: 'Partager un secret',
            text: 'Un secret aléatoire dans <code>~/.hermes/.env</code>, copié dans <code>~/.config/factory-live/hook-secret</code> en mode 600. Il n’est jamais affiché.',
          },
          {
            title: 'Lancer la sonde',
            text: 'Le plugin <code>factory-live-probe</code> tourne dans le gateway et poste la santé de la factory toutes les 30&nbsp;secondes.',
          },
        ],
      },
      {
        id: 'container',
        label: 'Conteneur',
        hint: 'Docker Compose',
        rows: [
          {
            title: 'Poser tes adresses',
            text: 'Copie <code>docker/.env.example</code> en <code>docker/.env</code>, puis nomme tes origines et le login Tailscale autorisé à écrire.',
            code: `TAILSCALE_LOGINS=<login>@github
PUBLIC_ORIGINS=http://localhost:8446,https://<machine>.<tailnet>.ts.net:8446`,
          },
          {
            title: 'Démarrer le service',
            text: 'Le conteneur lit les bases d’Hermès en lecture seule et écoute sur 127.0.0.1:8446.',
            code: 'docker compose -f docker/compose.yaml up -d --build',
          },
          {
            title: 'Vérifier',
            text: 'Le conteneur se dit <code>healthy</code>, puis <code>http://localhost:8446</code> ouvre l’app.',
            code: 'docker ps --filter name=factory-live',
          },
        ],
      },
      {
        id: 'tailnet',
        label: 'Tailnet',
        hint: 'tailscale serve',
        rows: [
          {
            title: 'Publier sur ton tailnet',
            text: 'Tes autres appareils joignent l’app par Tailscale, en HTTPS, ce qu’exige son installation.',
            code: 'tailscale serve --bg --https=8446 http://127.0.0.1:8446',
          },
          {
            title: 'Le tailnet seulement',
            text: 'Jamais Funnel&nbsp;: factory-live ne répond qu’à tes appareils.',
          },
          {
            title: 'Ton adresse',
            text: 'L’app est alors sur <code>https://&lt;machine&gt;.&lt;tailnet&gt;.ts.net:8446</code>.',
          },
        ],
      },
      {
        id: 'devices',
        label: 'Appareils',
        hint: 'Ordinateur, tablette, smartphone',
        rows: [
          {
            title: 'Ordinateur',
            text: 'Chrome ou Edge, sous Windows, macOS ou Linux : <code>http://localhost:8446</code> sur cette machine, l’adresse du tailnet ailleurs, puis l’icône d’installation de la barre d’adresse. Sur le Mac, Safari marche aussi : Fichier, «&nbsp;Ajouter au Dock&nbsp;».',
          },
          {
            title: 'Android',
            text: 'Chrome : ouvre l’adresse du tailnet, puis le menu, «&nbsp;Installer l’application&nbsp;».',
          },
          {
            title: 'iPhone et iPad',
            text: 'Safari : ouvre l’adresse du tailnet, puis Partager, «&nbsp;Sur l’écran d’accueil&nbsp;», et ouvre factory-live depuis l’écran d’accueil.',
          },
          {
            title: 'Notifications',
            text: 'Dans les réglages de l’app&nbsp;: «&nbsp;Activer les notifications&nbsp;», puis «&nbsp;Envoyer un test&nbsp;». Sur Android, elles marchent aussi dans le navigateur&nbsp;; sur iPhone et iPad, seulement dans l’app installée (iOS&nbsp;16.4 ou plus).',
          },
        ],
      },
      {
        id: 'github',
        label: 'GitHub',
        hint: 'Tes réponses',
        rows: [
          {
            title: 'Créer la GitHub App',
            text: 'Ouvre <code>/api/github/setup</code> et confirme sur GitHub&nbsp;: une app privée, sans webhook, installée sur tes dépôts.',
          },
          {
            title: 'Te connecter',
            text: 'Dans les réglages de l’app, «&nbsp;Se connecter à GitHub&nbsp;»&nbsp;: tes réponses partent alors à ton nom.',
          },
          {
            title: 'D’ici là',
            text: 'Un jeton fine-grained dans <code>~/.config/factory-live/github-token</code> sert de repli.',
          },
        ],
      },
    ],
  },
  security: {
    title: 'En lecture seule, par construction',
    text: 'factory-live regarde la factory sans jamais la piloter. Sa seule écriture est le commentaire que tu demandes.',
    groups: [
      {
        title: 'Lit',
        rows: [
          ['<code>kanban.db</code>, sessions des agents, logs des cartes', 'lecture seule'],
          ['Transcriptions de Claude Code', 'montage en lecture seule'],
          ['Base d’OpenCode et ses jetons', 'jamais ouverte'],
        ],
      },
      {
        title: 'Reçoit',
        rows: [
          ['Webhooks d’Hermès', 'HMAC-SHA256, anti-rejeu'],
          ['Sonde de santé', 'HMAC-SHA256'],
        ],
      },
      {
        title: 'Écrit',
        rows: [
          ['Le commentaire <code>/factory unblock</code>', 'ton compte GitHub'],
          ['Autorisé depuis', 'ce PC, ton login Tailscale'],
          ['Cadence', '30 par minute'],
        ],
      },
      {
        title: 'Exposition',
        rows: [
          ['Port 8446', '127.0.0.1 seulement'],
          ['Autres appareils', 'ton tailnet, jamais Funnel'],
        ],
      },
      {
        title: 'Conteneur',
        rows: [
          ['Utilisateur', '1000:1000'],
          ['Système de fichiers racine', 'lecture seule'],
          ['Capacités', 'aucune'],
        ],
      },
      {
        title: 'Secrets',
        rows: [
          ['Clés de la GitHub App et jetons', 'volume de données, mode 600'],
          ['Web Push', 'VAPID, aucune adresse e-mail envoyée'],
        ],
      },
    ],
  },
  roadmap: {
    title: 'Où ça va',
    text: 'Le plan, dessiné comme une ligne d’usine&nbsp;: ce qui est livré, ce qui vient ensuite.',
    label: 'Feuille de route',
    states: { done: 'Livré', now: 'En cours', next: 'Ensuite', later: 'À l’étude' },
    stops: [
      {
        state: 'done',
        icon: 'BrowserIcon',
        title: 'Maquette',
        text: 'La vraie app sur un scénario de démo, validée avant le moindre écran.',
      },
      {
        state: 'done',
        icon: 'ServerIcon',
        title: 'Serveur',
        text: 'Webhooks signés, kanban en lecture seule, REST et SSE.',
      },
      {
        state: 'done',
        icon: 'DeviceMobileIcon',
        title: 'App installable',
        text: 'Une Progressive Web App pour ordinateur, tablette et smartphone, dernier état hors ligne, notifications push.',
      },
      {
        state: 'done',
        icon: 'BeakerIcon',
        title: 'Tests',
        text: 'De bout en bout sous Chromium et WebKit, captures de référence, accessibilité.',
      },
      {
        state: 'now',
        icon: 'WorkflowIcon',
        title: 'Onboarding',
        text: 'Les issues de factory-live passent par la factory elle-même.',
      },
      {
        state: 'next',
        icon: 'ChecklistIcon',
        title: 'Recette',
        text: 'Installation et notifications sur smartphone et tablette, le flux à travers tailscale serve.',
      },
      {
        state: 'next',
        icon: 'GlobeIcon',
        title: 'Site public',
        text: 'Cette page et sa démo sur GitHub Pages, une fois le dépôt public.',
      },
      {
        state: 'later',
        icon: 'AppsIcon',
        title: 'App native',
        text: 'Un client Swift généré depuis l’OpenAPI, avec APNs.',
      },
    ],
  },
  cta: {
    label: 'Essayer la démo',
    text: 'Essaie la démo&nbsp;: la vraie app rejoue un après-midi de la factory dans ton navigateur. Sans serveur, sans compte.',
    word: 'Voir',
  },
  footer: {
    label: 'Plus',
    columns: [
      {
        title: 'Projet',
        links: [
          ['Démo', 'demo/'],
          ['Code source', 'REPO'],
          ['Issues', 'REPO/issues'],
          ['Licence MIT', 'REPO/blob/main/LICENSE'],
        ],
      },
      {
        title: 'Documentation',
        links: [
          ['Architecture', 'REPO/blob/main/docs/ARCHITECTURE.md'],
          ['Runbook', 'REPO/blob/main/docs/RUNBOOK.md'],
          ['Décisions', 'REPO/tree/main/docs/decisions'],
        ],
      },
      {
        title: 'Construit sur',
        links: [
          ['Hermès Agent', 'https://github.com/NousResearch/hermes-agent'],
          ['Primer', 'https://primer.style'],
          ['Tailscale', 'https://tailscale.com'],
        ],
      },
    ],
    made: 'Fait par Code My Life pour sa propre factory Hermès.',
    rights: '© 2026 Code My Life. Licence MIT.',
    top: 'Revenir en haut',
  },
};
