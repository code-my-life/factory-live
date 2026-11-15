import { expect, test } from '@playwright/test';
import { HOOK_FIX_COMMAND } from '../apps/web/src/demo/commands.ts';
import { fr } from './texts.ts';

/** The summary of a guard past the delay of the factory's hooks, as the dictionary writes it. */
const GUARD_PAST_DELAY = fr.server['diagnosis.summary.guardHookTimeout']({
  plugin: 'coder-guard',
  seconds: 30,
});

/*
 * The replica of factory-live#2 (2026-10-29): coder-guard runs past the delay of the factory's hooks at
 * `git commit`. The diagnosis must say the cause, who acts, whether « Débloquer » is enough, and hold the
 * unblocking while the cause is there; the demo fixes the config at 72 s, then puts it back at 84 s.
 */

test('le diagnostic dit pourquoi la carte bloque, qui agit, et retient le déblocage tant que la cause est là', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/interventions/iv-hook');
  const detail = page.getByRole('article');
  await expect(detail.getByRole('heading', { level: 2 })).toHaveText(GUARD_PAST_DELAY);
  const panel = detail.getByRole('region', { name: 'Diagnostic du blocage' });
  await expect(panel.getByText('À toi, côté factory')).toBeVisible();
  await expect(panel.getByText('Cause toujours là')).toBeVisible();
  await expect(panel.getByText(HOOK_FIX_COMMAND)).toBeVisible();
  // Le texte de l'agent reste là, tel quel, sous le diagnostic.
  await expect(detail.getByText(/^Terminal et tous les outils bloqués/)).toBeVisible();

  // La réponse est préremplie ; tant que la cause est là, l'envoi demande une confirmation.
  await expect(page.getByLabel('Ta réponse')).toHaveValue(
    /^Le blocage ne venait pas de ton travail/,
  );
  await expect(page.getByRole('button', { name: 'Débloquer', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Débloquer quand même' }).click();
  await expect(page.getByRole('alert')).toContainText('la carte part en triage');
  await page.getByRole('button', { name: 'Annuler' }).click();

  // La config est corrigée pendant que la page est ouverte : le panneau bascule en direct.
  await page.clock.runFor(75_000);
  await expect(panel.getByText(/^Cause corrigée à/)).toBeVisible();
  await expect(panel.getByText('pas encore dans le dépôt de la factory')).toBeVisible();
  await expect(page.getByText(/tu peux débloquer\.$/)).toBeVisible();
  await page.clock.runFor(12_000);
  await expect(panel.getByText('pas encore dans le dépôt de la factory')).toHaveCount(0);

  // Débloquée, l'intervention reste visible pour suivre le run suivant.
  await page.getByRole('button', { name: 'Débloquer', exact: true }).click();
  await expect(page.getByText('Réponse postée sur l’issue')).toBeVisible();
  await page.clock.runFor(30_000);
  await expect(page.getByText('Run suivant')).toBeVisible();
  await expect(detail.getByText('Débloquée', { exact: true })).toBeVisible();
});

test('la page de l’issue donne la cause, le verdict de chaque run et les vraies preuves', async ({
  page,
}) => {
  await page.goto('/issues/factory-live/2');
  await expect(page.locator('[data-variant="critical"]')).toContainText(GUARD_PAST_DELAY);
  await expect(page.getByText('Pourquoi elle bloque')).toBeVisible();
  for (const verdict of [
    'arrêté sans appel kanban (le modèle)',
    '5 outils refusés, puis sortie sans appel kanban',
    'bloqué après 12 outils refusés',
  ])
    // Fiches sur téléphone, tableau sur bureau : l'une des deux vues est masquée.
    await expect(page.getByText(verdict).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Preuves' }).click();
  await expect(page.getByText('evidence/07-e2e.txt')).toBeVisible();
});

test('une boucle de refus : le même refus 65 fois, la réponse donne la commande exacte', async ({
  page,
}) => {
  await page.goto('/interventions/iv-loop');
  const detail = page.getByRole('article');
  await expect(detail.getByRole('heading', { level: 2 })).toHaveText(
    'L’agent bute 65 fois sur le même refus de coder-guard',
  );
  const panel = detail.getByRole('region', { name: 'Diagnostic du blocage' });
  await expect(panel.getByText('À toi, une réponse')).toBeVisible();
  await expect(
    panel.getByText('Dans ta réponse, donner à l’agent la commande exacte qui respecte la garde'),
  ).toBeVisible();
  // L'agent accuse l'outillage : son texte reste là, tel quel, sous la vraie cause.
  await expect(detail.getByText(/^Test infrastructure too fragile/)).toBeVisible();
  await expect(page.getByLabel('Ta réponse')).toHaveValue(
    /^Tu reçois toujours le même refus de coder-guard : « PR de tests, revue refusée/,
  );
  // Rien à corriger côté factory : « Débloquer » suffit, sans confirmation.
  await expect(page.getByRole('button', { name: 'Débloquer', exact: true })).toBeVisible();
});

test('le disjoncteur d’un modèle faible : la gate sort trois fois sans rendre la carte', async ({
  page,
}) => {
  await page.goto('/interventions/iv-breaker');
  const detail = page.getByRole('article');
  await expect(detail.getByRole('heading', { level: 2 })).toHaveText(
    'Le modèle s’arrête sans rendre la carte (3 fois)',
  );
  const panel = detail.getByRole('region', { name: 'Diagnostic du blocage' });
  await expect(panel.getByText('À toi, côté factory')).toBeVisible();
  await expect(panel.getByText(/^Donner un autre modèle à la carte/)).toBeVisible();
  await page.goto('/issues/cv-site/52');
  await expect(
    page.getByText(fr.server['timeline.protocolViolation.nudged']({})).first(),
  ).toBeVisible();
});

test('une réponse refusée sur une carte déjà repartie : le refus, et plus de formulaire', async ({
  page,
}) => {
  await page.goto('/interventions');
  await expect(page.getByRole('heading', { name: 'Récemment débloquées' })).toBeVisible();
  await page.goto('/interventions/iv-shortcut');
  const detail = page.getByRole('article');
  await expect(detail.getByText('Débloquée', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Réponse refusée par le bot');
  await expect(page.getByText('Option 2 : ⌘J, et Ctrl+J sous Windows.')).toBeVisible();
  // Le champ de réponse, et non la section « Suivi de ta réponse » qui contient les mêmes mots.
  await expect(page.getByLabel('Ta réponse', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Débloquer/ })).toHaveCount(0);
});
