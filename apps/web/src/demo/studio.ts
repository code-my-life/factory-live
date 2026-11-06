import {
  type ModelRef,
  StudioFile,
  type StudioItemDetail,
  type StudioStep,
  type StudioWord,
} from '@factory-live/contracts';
import vitrine from './vitrine-factory-live.json';

/**
 * The studio's demo: eight videos at the stations of the studio's sheet, as the v1 API of
 * video-factory serves them. Titles, scripts, what a video waits for and why a lane failed imitate
 * what comes from the studio: written as is. `vitrine-factory-live` is the real video: its detail
 * and its 124 aligned words are those factory-live's API serves (`vitrine-factory-live.json`), with
 * its real master, re-encoded (1440 × 2560, H.264), under `public/demo/studio/`; only where it stands
 * differs (back at the review, waiting for the owner). The other videos are made up; the aligned words of
 * `presenter-factory-live` are derived from its script at a fixed pace, not those of a master
 * (video-content has no master for it yet).
 */

/** The real video's master, served with the demo like its other media. */
const VITRINE_MASTER: StudioFile = {
  kind: 'video',
  name: 'master',
  url: `${import.meta.env.BASE_URL}demo/studio/vitrine-factory-live/master.mp4`,
};

/** The real script of `presenter-factory-live` (code-my-life/video-content, commit b1a0e79). */
export const PRESENTER_SCRIPT = `---
id: "presenter-factory-live"
titre: "Mon usine à code, en direct sur mon téléphone"
plateforme: tiktok
duree_visee: 63
---

Mes outils sont codés par une équipe d'agents d'IA, et je les surveille d'ici.
Ça s'appelle factory-live. [capture: ligne]
Chaque idée devient une issue GitHub, et l'issue avance sur une ligne d'usine. [etapes: Issue | Brief | Code | Vérification | Ma revue | En ligne]
Un agent écrit le brief, un autre code, et une barrière vérifie tout avant moi. [zoom]
Je vois qui travaille, sur quoi, et avec quel modèle, en direct. [capture: agents]
Chaque carte garde la transcription complète de l'agent, mot pour mot. [capture: transcription]
Le jour où un agent bloque, je reçois une notification.
Je lis sa question, je réponds depuis mon téléphone, et la carte repart. [code: /factory unblock <ma réponse>]
Pas de terminal, pas de dix onglets ouverts.
Neuf postes, de l'idée à la mise en ligne, et chaque passage se voit. [stat: 9 postes | de l'issue à la mise en ligne]
Mais le cadrage reste humain : c'est là que se joue la qualité. [zoom]
Il me montre aussi la santé de chaque service, et ce que coûte chaque modèle. [capture: sante]
Et si factory-live tombe, l'usine continue sans lui. [etapes: factory-live s'arrête | l'usine continue | il se recale au retour]
Le code est ouvert, et la démo tourne dans ton navigateur.
Lien en bio.
`;

/** A script's spoken text: without its YAML head and its annotations between brackets. */
export function spokenText(script: string): string {
  return script.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/\[[^\]]*\]/g, ' ');
}

/**
 * Words derived from a script for the demo, at a fixed pace on the 30 fps grid: word `i` from
 * `0.5 + 0.3 i` s to 0.3 s later. Not the words of a master.
 */
export function derivedWords(script: string): StudioWord[] {
  return spokenText(script)
    .split(/\s+/)
    .filter((mot) => mot.length > 0)
    .map((mot, index) => {
      const debut = Math.round((0.5 + 0.3 * index) * 100) / 100;
      return { mot, debut, fin: Math.round((debut + 0.3) * 100) / 100, garde: true };
    });
}

/** A demo fingerprint: 64 hexadecimal characters drawn from a name. */
function fingerprint(name: string): string {
  let hash = 2166136261;
  let out = '';
  while (out.length < 64) {
    for (const char of `${name}:${out.length}`)
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    out += (hash >>> 0).toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
}

const step = (name: string, result: string, durationMs: number, outputs: string[]): StudioStep => ({
  name,
  result,
  durationMs,
  outputs: outputs.map((output) => ({ name: output, sha256: fingerprint(output) })),
});

/** The steps of a `vf run` that went through. */
const RUN_OK: StudioStep[] = [
  step('derush', 'ok', 41_200, ['derush.json']),
  step('cut', 'ok', 3_900, ['cut.json']),
  step('voice', 'ok', 18_700, ['voice.wav']),
  step('compose', 'ok', 96_400, ['compose.mp4']),
  step('master', 'ok', 27_800, ['master.mp4']),
  step('qc', 'ok', 2_100, ['qc.json']),
];

const studioPage = (id: string) => `http://localhost:8447/videos/${id}`;
const DRAFT = `---
id: "coulisses-de-la-recette"
titre: "La recette d'une PR, sans lire une ligne de code"
plateforme: tiktok
duree_visee: 62
---

Quand un agent ouvre une PR, je ne lis pas son code.
Je lis sa recette : chaque critère, et le test qui le prouve.
`;

/** The videos of the demo; `minutes` says how long ago each reached its station. */
export const DEMO_VIDEOS: readonly (Omit<StudioItemDetail, 'since'> & { minutes: number })[] = [
  {
    // The real video, back at the review so that its master is one to watch.
    id: vitrine.item.id,
    card: vitrine.item.card,
    title: vitrine.item.title,
    station: 'revue',
    state: 'waiting',
    minutes: 12,
    waits: 'Le master attend ta revue',
    failure: null,
    script: vitrine.item.script,
    steps: vitrine.item.steps,
    files: [
      VITRINE_MASTER,
      ...vitrine.item.files
        .filter((file) => file.kind === 'words')
        .map((file) => StudioFile.parse(file)),
    ],
    links: vitrine.item.links,
  },
  {
    id: 'presenter-factory-live',
    card: 't_5e0c41a2',
    title: 'Mon usine à code, en direct sur mon téléphone',
    station: 'revue',
    state: 'waiting',
    minutes: 42,
    waits: 'Le master attend ta revue',
    failure: null,
    script: PRESENTER_SCRIPT,
    steps: RUN_OK,
    files: [],
    links: { studio: studioPage('presenter-factory-live') },
  },
  {
    id: 'coulisses-de-la-recette',
    card: 't_8a17d3f0',
    title: 'La recette d’une PR, sans lire une ligne de code',
    station: 'approbation',
    state: 'waiting',
    minutes: 95,
    waits: 'Le brouillon attend ton approbation',
    failure: null,
    script: DRAFT,
    steps: [],
    files: [],
    links: { studio: studioPage('coulisses-de-la-recette') },
  },
  {
    id: 'un-agent-bloque',
    card: 't_2b94e6c7',
    title: 'Un agent bloque : je réponds depuis mon téléphone',
    station: 'tournage',
    state: 'waiting',
    minutes: 260,
    waits: 'Les prises attendent d’être tournées et envoyées',
    failure: null,
    script: '',
    steps: [],
    files: [],
    links: {
      studio: studioPage('un-agent-bloque'),
      takes: `${studioPage('un-agent-bloque')}/prises`,
    },
  },
  {
    id: 'la-barriere-avant-moi',
    card: 't_c3d58b19',
    title: 'La barrière qui vérifie tout avant moi',
    station: 'montage',
    state: 'failed',
    minutes: 18,
    waits: null,
    failure: 'montage en échec : compose a dépassé la durée visée (66,4 s pour 65 s au plus)',
    script: '',
    steps: [
      ...RUN_OK.slice(0, 3),
      step('compose', 'échec : durée 66,4 s, au-delà de 65 s', 101_300, []),
    ],
    files: [],
    links: { studio: studioPage('la-barriere-avant-moi') },
  },
  {
    id: 'neuf-postes',
    card: 't_71f0aa5d',
    title: 'Neuf postes, de l’idée à la mise en ligne',
    station: 'publiee',
    state: 'done',
    minutes: 2_880,
    waits: null,
    failure: null,
    script: '',
    steps: [...RUN_OK, step('publish', 'ok', 12_400, ['publication.json'])],
    files: [],
    links: { studio: studioPage('neuf-postes'), publication: 'https://example.com/neuf-postes' },
  },
  {
    id: 'le-cadrage-reste-humain',
    card: 't_4d6e9b30',
    title: 'Le cadrage reste humain',
    station: 'script',
    state: 'running',
    minutes: 6,
    waits: null,
    failure: null,
    script: '',
    steps: [],
    files: [],
    links: { studio: studioPage('le-cadrage-reste-humain') },
  },
  {
    id: 'factory-live-tombe',
    card: 't_e9a2c845',
    title: 'Et si factory-live tombe ?',
    station: 'idee',
    state: 'running',
    minutes: 1_440,
    waits: null,
    failure: null,
    script: '',
    steps: [],
    files: [],
    links: {},
  },
];

/**
 * The words of each video that has some: the real ones of `vitrine-factory-live`, as its master
 * speaks them; derived from the script for `presenter-factory-live`.
 */
export const DEMO_WORDS: Readonly<Record<string, readonly StudioWord[]>> = {
  'vitrine-factory-live': vitrine.words,
  'presenter-factory-live': derivedWords(PRESENTER_SCRIPT),
};

/** The model of the demo's writer: marked as the demo's, never a real model. */
export const DEMO_MODEL: ModelRef = { model: 'modele-de-demo', provider: 'demo', source: 'config' };

/** The studio's agents and the station each serves. */
export const DEMO_AGENTS = [{ agent: 'studio-writer', station: 'script', model: DEMO_MODEL }];
