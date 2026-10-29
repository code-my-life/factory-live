import { expect, test } from '@playwright/test';

/*
 * La réplique de factory-live#2 (2026-10-29) : coder-guard dépasse le délai des hooks d'Hermès au
 * `git commit`. Le diagnostic doit dire la cause, qui agit, si « Débloquer » suffit, et retenir le
 * déblocage tant que la cause est là ; la démo corrige la config à 72 s, puis la reporte à 84 s.
 */

test('le diagnostic dit pourquoi la carte bloque, qui agit, et retient le déblocage tant que la cause est là', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/interventions/iv-hook');
  const detail = page.getByRole('article');
  await expect(detail.getByRole('heading', { level: 2 })).toHaveText(
    'Le contrôle de coder-guard dépasse le délai des hooks d’Hermès (30 s)',
  );
  const panel = detail.getByRole('region', { name: 'Diagnostic du blocage' });
  await expect(panel.getByText('À toi, côté factory')).toBeVisible();
  await expect(panel.getByText('Cause toujours là')).toBeVisible();
  await expect(
    panel.getByText('hermes -p coder config set plugins.hook_callback_timeout 600'),
  ).toBeVisible();
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
  await expect(page.locator('[data-variant="critical"]')).toContainText(
    'dépasse le délai des hooks d’Hermès',
  );
  await expect(page.getByText('Pourquoi elle bloque')).toBeVisible();
  for (const verdict of [
    'arrêté sans appel kanban (le modèle)',
    '5 outils refusés, puis sortie sans appel kanban',
    'bloqué après 12 outils refusés',
  ])
    await expect(page.getByText(verdict).first()).toBeVisible();
  await page.getByRole('link', { name: 'Preuves' }).click();
  await expect(page.getByText('evidence/07-e2e.txt')).toBeVisible();
});
