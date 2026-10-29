import type { Context } from 'hono';
import type { GitHubAuthFailure } from '../adapters/github/app.ts';

/*
 * Les pages que le serveur écrit lui-même (création de l'App GitHub, connexion, refus) : pas de PWA
 * pour les écrire, il les écrit dans la langue de Clément. La PWA passe la sienne (`?lang=`), retenue
 * dans un cookie le temps du détour par GitHub ; sinon la langue du navigateur (français s'il est en
 * français, anglais sinon) ; sans aucune indication, le français, langue source.
 */
export type PageLocale = 'fr' | 'en';

const COOKIE = 'factory-live-lang';

function asked(c: Context): PageLocale | null {
  const value = c.req.query('lang');
  return value === 'fr' || value === 'en' ? value : null;
}

export function pageLocale(c: Context): PageLocale {
  const fromPwa = asked(c);
  if (fromPwa) return fromPwa;
  const remembered = new RegExp(`(?:^|;\\s*)${COOKIE}=(fr|en)(?:;|$)`).exec(
    c.req.header('cookie') ?? '',
  )?.[1];
  if (remembered === 'fr' || remembered === 'en') return remembered;
  const browser = c.req.header('accept-language')?.trim().toLowerCase();
  if (!browser) return 'fr';
  return browser.startsWith('fr') ? 'fr' : 'en';
}

/** Le cookie qui retient la langue passée par la PWA, une heure, sur les seules routes GitHub. */
export function localeCookie(c: Context): string | null {
  const locale = asked(c);
  return locale
    ? `${COOKIE}=${locale}; Path=/api/github; Max-Age=3600; SameSite=Lax; HttpOnly`
    : null;
}

interface PageTexts {
  setupTitle: string;
  setupRights: string;
  setupSteps: string;
  setupContinue: string;
  failureTitle: string;
  back: string;
  unavailable: string;
  reserved: string;
  failure: (failure: GitHubAuthFailure) => string;
}

export const PAGE_TEXTS: Readonly<Record<PageLocale, PageTexts>> = {
  fr: {
    setupTitle: 'Créer l’App GitHub de factory-live',
    setupRights:
      'GitHub va créer une App privée pour l’organisation, avec ces droits : issues en écriture (pour « /factory unblock »), PR, CI, contenu et webhooks des dépôts en lecture. Aucun webhook n’est activé.',
    setupSteps:
      'Sur GitHub, garde le nom proposé ou change-le, puis clique « Create GitHub App ». Tu reviendras ici pour l’installer : choisis alors « All repositories ».',
    setupContinue: 'Continuer sur GitHub',
    failureTitle: 'GitHub',
    back: 'Revenir à factory-live',
    unavailable: 'Intégration GitHub indisponible',
    reserved: 'Réservé à ce PC et à ton login Tailscale.',
    failure: (failure) => {
      switch (failure.reason) {
        case 'manifest_unknown':
          return 'Demande de création inconnue ou expirée : relance la création de l’App';
        case 'manifest_refused':
          return `GitHub a refusé la création de l’App (HTTP ${failure.status})`;
        case 'manifest_incomplete':
          return 'Réponse de GitHub incomplète pour la nouvelle App';
        case 'app_missing':
          return 'L’App GitHub n’existe pas encore : crée-la d’abord';
        case 'origin_unknown':
          return 'Origine inconnue pour le retour de connexion';
        case 'login_unknown':
          return 'Connexion inconnue ou expirée : recommence la connexion';
        case 'login_denied':
          return `Connexion refusée sur GitHub : ${failure.detail}`;
        case 'account_refused':
          return `Seul le compte ${failure.login} peut se connecter à factory-live`;
        case 'token_refused':
          return `GitHub a refusé le jeton : ${failure.detail}`;
        case 'account_unreadable':
          return `Compte GitHub illisible (HTTP ${failure.status})`;
        case 'installation_unreadable':
          return `Installation de l’App illisible (HTTP ${failure.status})`;
        case 'installation_token_refused':
          return `Jeton d’installation refusé (HTTP ${failure.status})`;
      }
    },
  },
  en: {
    setupTitle: 'Create the factory-live GitHub App',
    setupRights:
      'GitHub will create a private App for the organization, with these permissions: issues write (for “/factory unblock”), and read access to PRs, CI, contents and repository webhooks. No webhook is enabled.',
    setupSteps:
      'On GitHub, keep the suggested name or change it, then click “Create GitHub App”. You’ll come back here to install it: then choose “All repositories”.',
    setupContinue: 'Continue on GitHub',
    failureTitle: 'GitHub',
    back: 'Back to factory-live',
    unavailable: 'GitHub integration unavailable',
    reserved: 'Restricted to this PC and your Tailscale login.',
    failure: (failure) => {
      switch (failure.reason) {
        case 'manifest_unknown':
          return 'Unknown or expired creation request: start the App creation again';
        case 'manifest_refused':
          return `GitHub refused to create the App (HTTP ${failure.status})`;
        case 'manifest_incomplete':
          return 'Incomplete GitHub response for the new App';
        case 'app_missing':
          return 'The GitHub App doesn’t exist yet: create it first';
        case 'origin_unknown':
          return 'Unknown origin for the sign-in return';
        case 'login_unknown':
          return 'Unknown or expired sign-in: sign in again';
        case 'login_denied':
          return `Sign-in refused on GitHub: ${failure.detail}`;
        case 'account_refused':
          return `Only the ${failure.login} account can sign in to factory-live`;
        case 'token_refused':
          return `GitHub refused the token: ${failure.detail}`;
        case 'account_unreadable':
          return `Unreadable GitHub account (HTTP ${failure.status})`;
        case 'installation_unreadable':
          return `Unreadable App installation (HTTP ${failure.status})`;
        case 'installation_token_refused':
          return `Installation token refused (HTTP ${failure.status})`;
      }
    },
  },
};
