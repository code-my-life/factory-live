import { parseWorkflowSheet } from '@factory-live/contracts';
import type { CardView, RunView, TimelineEntry } from '@factory-live/contracts';
import type { GenericItem, GenericWorkflow } from '../features/workflows/model.ts';

/**
 * The demo's generic workflow (#64, #65): `essai`, a made-up workflow the core would declare besides
 * the code line and the studio. Three stations of three kinds, five items (one blocked, one with a
 * very long title), and one declared data of each generic type (text, link, table, status). Titles,
 * comments and declared values imitate what comes from the workflow and the core: written as is.
 */

const MINUTE = 60_000;
const at = (now: number, minutesAgo: number) => new Date(now - minutesAgo * MINUTE).toISOString();

/** The workflow's sheet, as the core would serve it, judged. */
export const ESSAI_SHEET = parseWorkflowSheet({
  item: { type: 'essai', label: 'Essai' },
  stations: [
    {
      key: 'preparation',
      label: 'Préparation',
      icon: 'package',
      kind: 'script',
      col: 0,
      row: 0,
    },
    { key: 'redaction', label: 'Rédaction', icon: 'pencil', kind: 'ai', col: 1, row: 0 },
    {
      key: 'validation',
      label: 'Validation',
      icon: 'check-circle',
      kind: 'owner',
      col: 2,
      row: 0,
    },
  ],
  edges: [
    { from: 'preparation', to: 'redaction', kind: 'line' },
    { from: 'redaction', to: 'validation', kind: 'line' },
    {
      from: 'validation',
      to: 'redaction',
      kind: 'return',
      id: 'refaire:redaction',
      label: 'Refaire la note',
    },
  ],
  models: [],
});

const LONG_TITLE =
  'Comparer les trois jeux de données d’essai du trimestre, rapprocher les écarts de plus de cinq pour cent, ' +
  'documenter chaque source et proposer une méthode de consolidation reproductible pour la prochaine série';

function run(
  now: number,
  id: number,
  profile: string,
  startedMinutesAgo: number,
  endedMinutesAgo: number | null,
  outcome: string | null,
  summary: string | null = null,
): RunView {
  return {
    id,
    profile,
    role: 'other',
    status: endedMinutesAgo === null ? 'running' : 'done',
    outcome,
    startedAt: at(now, startedMinutesAgo),
    endedAt: endedMinutesAgo === null ? null : at(now, endedMinutesAgo),
    model:
      profile === 'redacteur'
        ? { model: 'agnes-2.5-flash', provider: 'freellmapi', source: 'live' }
        : null,
    laneModel: null,
    summary,
    tokens: null,
    costUsd: null,
    verdict: null,
  };
}

function card(
  id: string,
  title: string,
  status: CardView['status'],
  assignee: string | null,
  station: string,
  runs: RunView[],
  blockReason: string | null = null,
): CardView {
  return {
    id,
    title,
    // The code line's kind of card; a generic workflow's cards have none of their own yet.
    kind: 'impl',
    status,
    assignee,
    station: station as CardView['station'],
    blockKind: status === 'blocked' ? 'needs_input' : null,
    blockReason,
    parents: [],
    skills: [],
    runs,
    changedFiles: [],
    testsPassed: null,
    testsTotal: null,
    evidence: [],
  };
}

function entry(
  now: number,
  id: string,
  minutesAgo: number,
  label: string,
  tone: TimelineEntry['tone'],
  cardId: string,
  profile: string | null = null,
  source: TimelineEntry['source'] = 'kanban',
  detail: string | null = null,
): TimelineEntry {
  return { id, at: at(now, minutesAgo), source, profile, cardId, label, detail, tone };
}

/** A run's transcript, as the core publishes it in declared data of subject `run` (#36): the agent's
 * session as a table, the Claude Code sessions, the card's log. */
function transcript(now: number, startedMinutesAgo: number, blocked: boolean) {
  const clock = (minutes: number) =>
    new Date(now - minutes * MINUTE).toLocaleTimeString('fr-FR', { hour12: false });
  const s = startedMinutesAgo;
  return [
    {
      name: 'agent-session',
      label: 'Session de l’agent',
      values: [
        {
          type: 'table' as const,
          label: 'Session de l’agent',
          columns: ['Heure', 'Rôle', 'Texte', 'Outil', 'Modèle', 'Statut'],
          rows: [
            [clock(s), 'user', 'work kanban task t_e0002b', null, null, null],
            [
              clock(s - 1),
              'assistant',
              'Je lis les extraits préparés.',
              null,
              'agnes-2.5-flash',
              null,
            ],
            [clock(s - 1), 'tool_call', 'cat extraits/*.csv', 'terminal', null, null],
            [clock(s - 2), 'tool_result', '4 fichiers, 4 742 lignes', 'terminal', null, 'ok'],
            [
              clock(s - 20),
              'assistant',
              blocked
                ? 'Le seuil de tolérance n’est pas fixé : je demande une décision.'
                : 'Synthèse rédigée.',
              null,
              'agnes-2.5-flash',
              null,
            ],
            ...(blocked
              ? [
                  [
                    clock(s - 24),
                    'tool_call',
                    'kanban_block needs_input',
                    'kanban',
                    null,
                    'blocked',
                  ],
                ]
              : []),
          ],
        },
      ],
    },
    {
      name: 'claude-sessions',
      label: 'Sessions de Claude Code',
      values: [
        {
          type: 'table' as const,
          label: 'Comparaison des sources',
          columns: ['Heure', 'Rôle', 'Texte', 'Outil', 'Modèle', 'Statut'],
          rows: [
            [
              clock(s - 3),
              'user',
              'Compare les quatre sources et liste les écarts.',
              null,
              null,
              null,
            ],
            [clock(s - 4), 'tool_call', 'python3 ecarts.py', 'Bash', null, null],
            [clock(s - 6), 'tool_result', '2 écarts au-delà de 5 %', 'Bash', null, 'ok'],
            [clock(s - 7), 'assistant', 'Deux sources dépassent 5 %.', null, 'claude-sonnet', null],
          ],
        },
      ],
    },
    {
      name: 'card-log',
      label: 'Journal de la carte',
      values: [
        {
          type: 'text' as const,
          label: 'Terminal',
          text:
            `[${clock(s)}] worker démarré pour t_e0002b\n` +
            `[${clock(s - 2)}] extraits lus : 4 fichiers\n` +
            (blocked
              ? `[${clock(s - 24)}] carte bloquée : needs_input`
              : `[${clock(s - 24)}] carte terminée`),
        },
      ],
    },
  ];
}

/** The five items of `essai`, at `now`. */
export function essaiItems(now: number): GenericItem[] {
  return [
    {
      id: 'e_0001',
      runData: { 41: transcript(now, 12, false) },
      title: 'Préparer le jeu de données d’essai',
      station: 'preparation',
      status: 'active',
      since: at(now, 12),
      cards: [
        card('t_e0001a', 'préparation : jeu de données', 'running', 'preparateur', 'preparation', [
          run(now, 41, 'preparateur', 12, null, null),
        ]),
      ],
      timeline: [
        entry(now, 'k1', 14, 'created', 'neutral', 't_e0001a'),
        entry(now, 'k2', 12, 'claimed', 'neutral', 't_e0001a', 'preparateur'),
      ],
      data: [
        {
          name: 'source',
          label: 'Source',
          values: [
            {
              type: 'link',
              label: 'Jeu de données',
              url: 'https://github.com/code-my-life/workflow-essai/tree/main/donnees/2026-t4',
            },
          ],
        },
      ],
    },
    {
      id: 'e_0002',
      runData: { 37: transcript(now, 140, false), 38: transcript(now, 120, true) },
      title: 'Rédiger la note de synthèse',
      station: 'redaction',
      status: 'blocked',
      since: at(now, 95),
      cards: [
        card('t_e0002a', 'préparation : extraits', 'done', 'preparateur', 'preparation', [
          run(now, 37, 'preparateur', 140, 128, 'completed', 'Extraits prêts : 3 fichiers.'),
        ]),
        card(
          't_e0002b',
          'rédaction : note de synthèse',
          'blocked',
          'redacteur',
          'redaction',
          [run(now, 38, 'redacteur', 120, 96, 'blocked', 'Il manque le seuil de tolérance.')],
          'Quel seuil de tolérance retenir pour les écarts : 2 % ou 5 % ?',
        ),
      ],
      timeline: [
        entry(now, 'k3', 140, 'claimed', 'neutral', 't_e0002a', 'preparateur'),
        entry(now, 'k4', 128, 'completed', 'success', 't_e0002a', 'preparateur'),
        entry(now, 'k5', 120, 'claimed', 'neutral', 't_e0002b', 'redacteur'),
        entry(
          now,
          'k6',
          96,
          'blocked',
          'danger',
          't_e0002b',
          'redacteur',
          'kanban',
          'Quel seuil de tolérance retenir pour les écarts : 2 % ou 5 % ?',
        ),
        entry(
          now,
          'c1',
          90,
          'Le seuil dépend du lot : voir la table des écarts.',
          'neutral',
          't_e0002b',
          'redacteur',
          'comment',
        ),
      ],
      data: [
        {
          name: 'controle',
          label: 'Contrôle des sources',
          values: [
            {
              type: 'status',
              label: 'État',
              status: 'warning',
              text: 'Deux écarts au-delà de 5 %',
            },
          ],
        },
        {
          name: 'ecarts',
          label: 'Écarts relevés',
          values: [
            {
              type: 'table',
              label: 'Écarts',
              columns: ['Source', 'Valeur attendue', 'Valeur lue', 'Écart', 'Retenu'],
              rows: [
                ['registre-nord', 1240, 1198, '3,4 %', true],
                ['registre-sud', 980, 1047, '6,8 %', false],
                ['saisie-manuelle', 312, 331, '6,1 %', false],
                ['import-partenaire', 2210, 2204, '0,3 %', true],
              ],
            },
          ],
        },
        {
          name: 'brouillon',
          label: 'Brouillon',
          values: [
            {
              type: 'text',
              label: 'Note',
              text:
                'Synthèse provisoire\n\nLes quatre sources concordent à 5 % près, sauf registre-sud et ' +
                'saisie-manuelle.\nÀ trancher : le seuil de tolérance avant de conclure.',
            },
          ],
        },
        {
          name: 'source',
          label: 'Source',
          values: [
            {
              type: 'link',
              label: 'Jeu de données',
              url: 'https://github.com/code-my-life/workflow-essai/tree/main/donnees/2026-t4',
            },
          ],
        },
      ],
    },
    {
      id: 'e_0003',
      runData: {},
      title: LONG_TITLE,
      station: 'redaction',
      status: 'queued',
      since: at(now, 30),
      cards: [card('t_e0003a', 'rédaction : comparaison', 'ready', 'redacteur', 'redaction', [])],
      timeline: [entry(now, 'k7', 30, 'created', 'neutral', 't_e0003a')],
      data: [],
    },
    {
      id: 'e_0004',
      runData: { 35: transcript(now, 75, false) },
      title: 'Relire le compte rendu de la série 12',
      station: 'validation',
      status: 'waiting_human',
      since: at(now, 48),
      cards: [
        card('t_e0004a', 'rédaction : compte rendu', 'done', 'redacteur', 'redaction', [
          run(now, 35, 'redacteur', 75, 50, 'completed', 'Compte rendu rédigé.'),
        ]),
        card('t_e0004b', 'validation : compte rendu', 'review', null, 'validation', []),
      ],
      timeline: [
        entry(now, 'k8', 75, 'claimed', 'neutral', 't_e0004a', 'redacteur'),
        entry(now, 'k9', 50, 'completed', 'success', 't_e0004a', 'redacteur'),
        entry(now, 'k10', 48, 'created', 'neutral', 't_e0004b'),
      ],
      data: [
        {
          name: 'controle',
          label: 'Contrôle des sources',
          values: [
            { type: 'status', label: 'État', status: 'ok', text: 'Toutes les sources lues' },
          ],
        },
        {
          name: 'compte-rendu',
          label: 'Compte rendu',
          values: [
            {
              type: 'link',
              label: 'Ouvrir le compte rendu',
              url: 'https://github.com/code-my-life/workflow-essai/blob/main/comptes-rendus/serie-12.md',
            },
          ],
        },
      ],
    },
    {
      id: 'e_0005',
      runData: { 30: transcript(now, 330, false) },
      title: 'Archiver le lot précédent',
      station: 'validation',
      status: 'done',
      since: at(now, 300),
      cards: [
        card('t_e0005a', 'préparation : archive', 'done', 'preparateur', 'preparation', [
          run(now, 30, 'preparateur', 330, 310, 'completed', 'Lot archivé.'),
        ]),
      ],
      timeline: [entry(now, 'k11', 310, 'completed', 'success', 't_e0005a', 'preparateur')],
      data: [
        {
          name: 'controle',
          label: 'Contrôle des sources',
          values: [{ type: 'status', label: 'État', status: 'ok', text: 'Archive vérifiée' }],
        },
      ],
    },
  ];
}

/** The demo's generic workflows, at `now`: `essai`, answering. */
export function demoWorkflows(now: number): GenericWorkflow[] {
  return [{ key: 'essai', sheet: ESSAI_SHEET, items: essaiItems(now), unreachableSince: null }];
}
