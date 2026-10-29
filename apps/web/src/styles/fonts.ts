import latin from '@fontsource-variable/mona-sans/files/mona-sans-latin-wght-normal.woff2?url';
import latinExtended from '@fontsource-variable/mona-sans/files/mona-sans-latin-ext-wght-normal.woff2?url';

/**
 * Mona Sans, la police de GitHub : la première de la pile de Primer (`--fontStack-system`), que
 * GitHub sert lui-même et que l'app n'avait pas, d'où les polices du système. Embarquée (licence
 * OFL), sans CDN, en police variable : un fichier pour les graisses 200 à 900. Le sous-ensemble
 * latin (40 ko) couvre le français et l'anglais ; le latin étendu (16 ko) ne se charge que pour un
 * caractère qui l'exige. Pas de FOIT : le texte s'affiche aussitôt et prend Mona Sans au chargement.
 */
const FACES = [
  {
    url: latin,
    unicodeRange:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
  {
    url: latinExtended,
    unicodeRange:
      'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  },
];

/** Déclare Mona Sans sous le nom attendu par les jetons de Primer ; chargée à la demande. */
export function declareMonaSans(fonts: FontFaceSet = document.fonts): void {
  if (typeof FontFace === 'undefined') return;
  for (const face of FACES) {
    fonts.add(
      new FontFace('Mona Sans VF', `url(${face.url}) format('woff2')`, {
        weight: '200 900',
        style: 'normal',
        display: 'swap',
        unicodeRange: face.unicodeRange,
      }),
    );
  }
}
