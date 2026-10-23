// Encaissement « CB + Espèces » (23 oct. 2026, demande du salon) : un client paie une partie en
// espèces et le reste par carte. Fiche RDV de l'agenda → « CB + Espèces », part en espèces saisie,
// part CB calculée ; le tableau de bord range chaque part dans sa case. Nina Roche : Coupe + Barbe
// (35 €) aujourd'hui à 14 h chez Kevin.
import { test, expect } from './support/test.js';
import { ADMIN, BARBERS, RDV } from './support/donnees.js';
import { jour } from './support/temps.js';
import { toast, debordementHorizontal } from './support/outils.js';

const ficheDeNina = async (page) => {
  await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
  await page.locator(`[data-drop-column="${BARBERS.kevin.id}"]`).getByRole('button', { name: /Nina Roche/ }).click();
  const fiche = page.getByRole('dialog', { name: 'Détails du rendez-vous' });
  await expect(fiche).toBeVisible();
  return fiche;
};

test.describe('Encaissement CB + Espèces', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('15 € en espèces sur 35 € : 20 € en CB, enregistré puis affiché dans le récapitulatif', async ({ page, api }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    const fiche = await ficheDeNina(page);
    await fiche.getByRole('button', { name: 'CB + Espèces' }).click();
    // Rien de saisi : pas de validation possible
    await expect(fiche.getByRole('button', { name: 'Valider la prestation' })).toHaveCount(0);
    await expect(fiche.getByText('À répartir : 35 € (prestations). Le pourboire garde son propre moyen de paiement.')).toBeVisible();

    const especes = fiche.getByLabel('Part payée en espèces');
    // Toute la somme en espèces : refusé, « Espèces » suffit
    await especes.fill('35');
    await expect(fiche.getByText('La part en espèces doit rester sous 35 € : sinon choisissez « Espèces ».')).toBeVisible();
    await expect(fiche.getByRole('button', { name: 'Valider la prestation' })).toHaveCount(0);
    // « Moitié » : 17,50 € de chaque côté
    await fiche.getByRole('button', { name: 'Moitié' }).click();
    await expect(especes).toHaveValue('17,5');
    await expect(fiche.getByText('17,50 €', { exact: true })).toBeVisible();

    await especes.fill('15');
    await expect(fiche.getByText('20 €', { exact: true })).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
    await fiche.getByRole('button', { name: 'Valider la prestation' }).click();
    await expect(toast(page, 'Prestation validée !')).toBeVisible();
    expect(api.requetesVers('PUT', `/entities/Appointment/${RDV.kevinNina().id}`).at(-1).corps).toMatchObject({
      payment_method: 'mixte', cash_amount: 15, status: 'completed', payment_status: 'paid', tip: 0,
    });

    // Fiche rouverte : récapitulatif « CB + Espèces » avec les deux parts
    await page.keyboard.press('Escape');
    const relue = await ficheDeNina(page);
    await expect(relue.getByText('Payé en espèces 15 €')).toBeVisible();
    await expect(relue.getByText('CB 20 €')).toBeVisible();
    await expect(relue.getByText('CB + Espèces', { exact: true })).toBeVisible();
  });

  test('« Corriger l\'encaissement » : retour à « CB » sans part en espèces envoyée', async ({ page, api }) => {
    const nina = api.tables.Appointment.find((a) => a.id === RDV.kevinNina().id);
    Object.assign(nina, { status: 'completed', payment_method: 'mixte', cash_amount: 15, payment_status: 'paid', grand_total: 35 });
    const fiche = await ficheDeNina(page);
    await fiche.getByRole('button', { name: 'Corriger l\'encaissement' }).click();
    await expect(fiche.getByLabel('Part payée en espèces')).toHaveValue('15');
    await fiche.getByRole('button', { name: 'CB', exact: true }).last().click();
    await expect(fiche.getByLabel('Part payée en espèces')).toHaveCount(0);
    await fiche.getByRole('button', { name: 'Enregistrer la correction' }).click();
    await expect(toast(page, 'Encaissement corrigé')).toBeVisible();
    const corps = api.requetesVers('PUT', `/entities/Appointment/${nina.id}`).at(-1).corps;
    expect(corps.payment_method).toBe('cb');
    expect(corps).not.toHaveProperty('cash_amount');
  });

  test('serveur d\'avant (sans features.splitPayment) : pas de « CB + Espèces »', async ({ page, api }) => {
    delete api.donnees.parametresPublics.features.splitPayment;
    const fiche = await ficheDeNina(page);
    await expect(fiche.getByRole('button', { name: 'Carte cadeau' })).toBeVisible();
    await expect(fiche.getByRole('button', { name: 'CB + Espèces' })).toHaveCount(0);
  });

  test('tableau de bord : la part espèces compte en Espèces, le reste en CB', async ({ page, api }) => {
    const nina = api.tables.Appointment.find((a) => a.id === RDV.kevinNina().id);
    Object.assign(nina, { status: 'completed', payment_method: 'mixte', cash_amount: 15, payment_status: 'paid', grand_total: 35 });
    await page.goto('/admin');
    await expect(page.getByText('CB aujourd\'hui', { exact: true }).locator('..')).toContainText('20€');
    await expect(page.getByText('Espèces aujourd\'hui', { exact: true }).locator('..')).toContainText('15€');
  });
});
