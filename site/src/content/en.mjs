// The English page. Strings are HTML: they may hold <code>, <a> and entities.
export default {
  lang: 'en',
  meta: {
    title: 'factory-live: your Hermes agent factory, live',
    description:
      'A real-time window on a software factory run by Hermes Agent: the factory line, every card of every issue, agents and models, and the interventions you answer from your phone.',
    ogAlt:
      'The factory line of factory-live: six stations, a box for each issue, its state and its agent.',
  },
  skip: 'Skip to content',
  nav: {
    label: 'Main',
    see: 'What you see',
    how: 'How it works',
    start: 'Install',
    security: 'Security',
    roadmap: 'Roadmap',
    menu: 'Menu',
    demo: 'Live demo',
    other: 'Français',
  },
  hero: {
    title: 'Your agent factory, live',
    lede: 'factory-live shows which issue is at which station, which agent holds it, with which model, and what waits for your decision.',
    cta: 'Try the live demo',
    source: 'Source on GitHub',
    note: 'The demo replays an afternoon of the factory in your browser, without a server. The interface is in French.',
    alt: 'The factory line in factory-live: six stations from intake to done, a box for each issue with its state and its agent, and two blockers waiting for a decision.',
  },
  screens: {
    title: 'One app, every screen',
    tabsLabel: 'Screen',
    tabs: [
      {
        id: 'desktop',
        label: 'Desktop',
        alt: 'factory-live on a desktop screen: the navigation on the left, the factory line, what each agent is doing now and the live activity.',
      },
      {
        id: 'ipad',
        label: 'iPad',
        alt: 'factory-live on an iPad in portrait: the factory line runs from top to bottom, with the issue boxes side by side.',
      },
      {
        id: 'iphone',
        label: 'iPhone',
        alt: 'factory-live on an iPhone: the factory line runs down the screen, with the tab bar at the bottom.',
      },
    ],
    text: 'factory-live is a progressive web app. Install it on the iPhone home screen, from Edge or Chrome on Windows, or from Safari on the Mac. Notifications reach your phone only for the blockers that wait for you. Offline, the app opens on the last state it received and says how old it is.',
    open: 'Open the demo',
    install: 'Install it',
  },
  see: {
    title: 'What you see',
    open: 'Open in the demo',
    tiles: [
      {
        id: 'live',
        title: 'Right now',
        text: 'Every agent at work: the tool it runs, the file it edits, the model that answered.',
        view: 'ligne',
        alt: 'What each agent does right now: coder-claude edits a file through Claude Code, gate runs the tests, coordinator waits for a free slot.',
      },
      {
        id: 'issue',
        title: 'An issue, card by card',
        text: 'Its card graph, every run with the model it really used, the full transcript, the pull request and its CI.',
        view: 'issues',
        alt: 'The cards of the issue claude-cockpit#71: brief done, implementation running in a Claude Code lane, release waiting, and the runs of the selected card.',
      },
      {
        id: 'intervention',
        title: 'Interventions',
        text: 'The agent’s whole question. Answer in the app: factory-live posts <code>/factory unblock</code> on the issue for you.',
        view: 'interventions',
        alt: 'An intervention: the coordinator asks whether to attach a mockup or approve a simple layout, with a reply box and an Unblock button.',
      },
      {
        id: 'agent',
        title: 'Agents and models',
        text: 'Each agent’s model chain in fallback order, its skills and plugins, and any drift from the repository.',
        view: 'agents',
        alt: 'Two agents, coder-claude and coder-opencode: what each one is doing, its model chain in fallback order, and a configuration that differs from the factory repository.',
      },
      {
        id: 'health',
        title: 'Health',
        text: 'Gateway, dispatcher, model providers and tools, checked by a probe every 30&nbsp;seconds.',
        view: 'sante',
        alt: 'The health of the factory: the Hermes gateway, the kanban dispatcher, the pause switch, the dashboard and four model providers, all answering.',
      },
      {
        id: 'costs',
        title: 'Costs and quotas',
        text: 'Calls, tokens and 429 responses per model, and what Claude runs would cost.',
        view: 'couts',
        alt: 'Calls, input and output tokens, 429 responses, errors and cost for each model used by the factory over seven days.',
      },
      {
        id: 'history',
        title: 'History',
        text: 'Issues done, median time from label to merge, time per station, first-pass rate at the gate.',
        view: 'historique',
        alt: 'History over 14 days: 9 issues done, a median of 3 h 32 from label to merge, the median time per station and the first-pass rate at the gate.',
      },
    ],
  },
  how: {
    title: 'How it works',
    intro:
      'Nothing is written for factory-live. It listens to what Hermes Agent already sends and reads what it already keeps.',
    stageLabel: 'Stage',
    stages: [
      {
        id: 'listen',
        label: 'Listen',
        title: 'Hermes posts signed webhooks',
        text: 'The native outbound webhooks of Hermes Agent send each tool call, model reply and kanban event as one HTTP POST, signed with HMAC-SHA256. Delivery never blocks an agent. A probe in the gateway adds the health of the factory every 30&nbsp;seconds.',
      },
      {
        id: 'read',
        label: 'Read',
        title: 'The kanban is only read',
        text: '<code>kanban.db</code>, the sessions of each agent and the card logs are opened read-only, with short queries. factory-live sees a change within 300&nbsp;ms, and catches up from them after a restart.',
      },
      {
        id: 'stream',
        label: 'Stream',
        title: 'One stream feeds every screen',
        text: 'The server keeps the live state and sends each change over Server-Sent Events to the app on your desk and in your pocket. A blocker that waits for you also sends a Web Push to the iPhone.',
      },
      {
        id: 'unblock',
        label: 'Unblock',
        title: 'Your answer goes back to the issue',
        text: 'Answer in the app: factory-live posts <code>/factory unblock</code> with your text on the issue, under your GitHub account. The bot of the factory reacts, the card restarts, and the line shows it.',
      },
    ],
    schema: {
      label: 'The path of the data, from Hermes Agent to your screens and back through GitHub.',
      nodes: [
        {
          id: 'hermes',
          icon: 'CpuIcon',
          title: 'Hermes Agent',
          sub: 'your machine',
          items: [
            ['listen unblock', 'Workers, one per card'],
            ['listen', 'Gateway and dispatcher'],
            ['listen', 'Health probe'],
            ['read', '<code>kanban.db</code>, sessions, logs'],
          ],
        },
        {
          id: 'live',
          icon: 'logo',
          title: 'factory-live',
          sub: 'Docker, 127.0.0.1:8446',
          items: [
            ['listen', 'Signed ingestion'],
            ['read', 'Live state and history'],
            ['stream', 'REST and SSE'],
            ['stream', 'Web Push'],
          ],
        },
        {
          id: 'screens',
          icon: 'DeviceMobileIcon',
          title: 'Your screens',
          sub: 'on your tailnet',
          items: [
            ['stream unblock', 'iPhone'],
            ['stream', 'Desktop'],
            ['stream', 'Mac'],
          ],
        },
        {
          id: 'github',
          icon: 'MarkGithubIcon',
          title: 'GitHub',
          sub: 'your account',
          items: [
            ['unblock', '<code>/factory unblock</code> comment'],
            ['unblock', 'Reaction of the bot'],
            ['', 'Pull requests and CI'],
          ],
        },
      ],
      links: [
        { from: 'hermes', stages: { listen: 'signed webhooks', read: 'read-only' } },
        { from: 'live', stages: { stream: 'SSE and Web Push' } },
        { from: 'screens', stages: { unblock: 'your answer' } },
      ],
      back: {
        stage: 'unblock',
        text: 'The bot reads the comment and the card restarts in Hermes.',
      },
    },
    note: 'If factory-live stops, the factory does not notice: deliveries fail without blocking any agent, and factory-live catches up from the databases when it restarts.',
  },
  start: {
    title: 'Install it next to your factory',
    text: 'factory-live runs on the machine that runs Hermes Agent, under Linux or WSL, with Docker and Tailscale. Five steps, about ten minutes.',
    guide: 'Full guide in the README',
    tabsLabel: 'Steps',
    steps: [
      {
        id: 'hermes',
        label: 'Hermes',
        hint: 'Webhooks and probe',
        rows: [
          {
            title: 'Send the webhooks',
            text: 'Each agent lists factory-live in its outbound hooks. The installer of the factory writes them.',
            code: `hooks:
  outbound:
    - name: factory-live
      url: http://127.0.0.1:8446/api/ingest/hermes
      secret_env: FACTORY_LIVE_HOOK_SECRET
      timeout: 2
      events: [pre_tool_call, post_tool_call, post_api_request, …]`,
          },
          {
            title: 'Share one secret',
            text: 'A random secret in <code>~/.hermes/.env</code>, copied to <code>~/.config/factory-live/hook-secret</code> with mode 600. It is never printed.',
          },
          {
            title: 'Start the probe',
            text: 'The <code>factory-live-probe</code> plugin runs in the gateway and posts the health of the factory every 30&nbsp;seconds.',
          },
        ],
      },
      {
        id: 'container',
        label: 'Container',
        hint: 'Docker Compose',
        rows: [
          {
            title: 'Set your addresses',
            text: 'Copy <code>docker/.env.example</code> to <code>docker/.env</code>, then name your origins and the Tailscale login allowed to write.',
            code: `TAILSCALE_LOGINS=you@github
PUBLIC_ORIGINS=http://localhost:8446,https://<machine>.<tailnet>.ts.net:8446`,
          },
          {
            title: 'Start the service',
            text: 'The container reads the Hermes databases read-only and listens on 127.0.0.1:8446.',
            code: 'docker compose -f docker/compose.yaml up -d --build',
          },
          {
            title: 'Check it',
            text: 'The container reports <code>healthy</code>, then <code>http://localhost:8446</code> opens the app.',
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
            title: 'Publish on your tailnet',
            text: 'Your phone and your Mac reach the app through Tailscale, with HTTPS.',
            code: 'tailscale serve --bg --https=8446 http://127.0.0.1:8446',
          },
          {
            title: 'Tailnet only',
            text: 'Never Funnel: factory-live answers your own devices and nothing else.',
          },
          {
            title: 'Your address',
            text: 'The app is then at <code>https://&lt;machine&gt;.&lt;tailnet&gt;.ts.net:8446</code>.',
          },
        ],
      },
      {
        id: 'devices',
        label: 'Devices',
        hint: 'iPhone, PC, Mac',
        rows: [
          {
            title: 'iPhone and iPad',
            text: 'Open the tailnet address in Safari, then Share, Add to Home Screen, and open factory-live from the home screen.',
          },
          {
            title: 'Windows',
            text: '<code>http://localhost:8446</code> in Edge or Chrome, then the install icon in the address bar.',
          },
          {
            title: 'Mac',
            text: 'The tailnet address in Safari, then File, Add to Dock. Chrome works too.',
          },
          {
            title: 'Notifications',
            text: 'In the settings of the app (Réglages): Activer les notifications, then Envoyer un test.',
          },
        ],
      },
      {
        id: 'github',
        label: 'GitHub',
        hint: 'Your answers',
        rows: [
          {
            title: 'Create the GitHub App',
            text: 'Open <code>/api/github/setup</code> and confirm on GitHub: a private app, without webhook, installed on your repositories.',
          },
          {
            title: 'Sign in',
            text: 'In the settings of the app, Se connecter à GitHub: your answers are then posted under your account.',
          },
          {
            title: 'Until then',
            text: 'A fine-grained token in <code>~/.config/factory-live/github-token</code> serves as a fallback.',
          },
        ],
      },
    ],
  },
  security: {
    title: 'Read-only by design',
    text: 'factory-live watches the factory and never drives it. Its one write is the comment you ask for.',
    groups: [
      {
        title: 'Reads',
        rows: [
          ['<code>kanban.db</code>, agent sessions, card logs', 'read-only'],
          ['Claude Code transcripts', 'read-only mount'],
          ['OpenCode database and its tokens', 'never opened'],
        ],
      },
      {
        title: 'Receives',
        rows: [
          ['Hermes webhooks', 'HMAC-SHA256, replay window'],
          ['Health probe', 'HMAC-SHA256'],
        ],
      },
      {
        title: 'Writes',
        rows: [
          ['The <code>/factory unblock</code> comment', 'your GitHub account'],
          ['Allowed from', 'this machine, your Tailscale login'],
          ['Rate', '30 a minute'],
        ],
      },
      {
        title: 'Exposure',
        rows: [
          ['Port 8446', '127.0.0.1 only'],
          ['Other devices', 'your tailnet, never Funnel'],
        ],
      },
      {
        title: 'Container',
        rows: [
          ['User', '1000:1000'],
          ['Root filesystem', 'read-only'],
          ['Capabilities', 'none'],
        ],
      },
      {
        title: 'Secrets',
        rows: [
          ['GitHub App keys and tokens', 'data volume, mode 600'],
          ['Web Push', 'VAPID, no e-mail sent'],
        ],
      },
    ],
  },
  roadmap: {
    title: 'Where it goes',
    text: 'The plan, drawn as a factory line: what shipped, what comes next.',
    label: 'Roadmap',
    states: { done: 'Shipped', now: 'In progress', next: 'Next', later: 'Considered' },
    stops: [
      {
        state: 'done',
        icon: 'BrowserIcon',
        title: 'Mockup',
        text: 'The real app on a demo scenario, approved before any screen was built.',
      },
      {
        state: 'done',
        icon: 'ServerIcon',
        title: 'Server',
        text: 'Signed webhooks, read-only kanban, REST and SSE.',
      },
      {
        state: 'done',
        icon: 'DeviceMobileIcon',
        title: 'Installable app',
        text: 'PWA, offline state, Web Push on the iPhone.',
      },
      {
        state: 'done',
        icon: 'BeakerIcon',
        title: 'Tests',
        text: 'Chromium and WebKit end to end, reference captures, accessibility.',
      },
      {
        state: 'now',
        icon: 'WorkflowIcon',
        title: 'Onboarding',
        text: 'The issues of factory-live go through the factory itself.',
      },
      {
        state: 'next',
        icon: 'ChecklistIcon',
        title: 'Acceptance',
        text: 'Install and notifications on the iPhone, the stream through tailscale serve.',
      },
      {
        state: 'next',
        icon: 'GlobeIcon',
        title: 'Public site',
        text: 'This page and its demo on GitHub Pages, once the repository is public.',
      },
      {
        state: 'later',
        icon: 'AppsIcon',
        title: 'Native app',
        text: 'A Swift client generated from the OpenAPI, with APNs.',
      },
    ],
  },
  cta: {
    label: 'Try the live demo',
    text: 'Try the live demo: the real app replays an afternoon of the factory in your browser. No server, no account.',
    word: 'Watch',
  },
  footer: {
    label: 'More',
    columns: [
      {
        title: 'Project',
        links: [
          ['Live demo', 'demo/'],
          ['Source code', 'REPO'],
          ['Issues', 'REPO/issues'],
          ['MIT licence', 'REPO/blob/main/LICENSE'],
        ],
      },
      {
        title: 'Docs, in French',
        links: [
          ['Architecture', 'REPO/blob/main/docs/ARCHITECTURE.md'],
          ['Runbook', 'REPO/blob/main/docs/RUNBOOK.md'],
          ['Decisions', 'REPO/tree/main/docs/decisions'],
        ],
      },
      {
        title: 'Built on',
        links: [
          ['Hermes Agent', 'https://github.com/NousResearch/hermes-agent'],
          ['Primer', 'https://primer.style'],
          ['Tailscale', 'https://tailscale.com'],
        ],
      },
    ],
    made: 'Made by Code My Life for its own Hermes factory.',
    rights: '© 2026 Code My Life. MIT licence.',
    top: 'Back to top',
  },
};
