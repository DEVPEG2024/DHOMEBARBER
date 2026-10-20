// Mes rendez-vous (/appointments) : RDV à venir, délai d'annulation de 24 h.
import { test, expect } from './support/test.js';
import { CLIENT, SALON_TELEPHONE } from './support/donnees.js';
import { jour } from './support/temps.js';
import { libelleJour } from './support/outils.js';

/**
 * Carte d'un rendez-vous, repérée par ses heures (« 15:00 — 15:45 ») : le plus petit bloc qui
 * contient à la fois ces heures et l'étiquette « Barber » (les blocs englobants arrivent avant
 * lui dans l'ordre du document, d'où `last()`).
 */
const carteRdv = (page, heures) => page.locator('div')
  .filter({ has: page.getByText(heures, { exact: true }) })
  .filter({ has: page.getByText('Barber', { exact: true }) })
  .last();

test.describe('Mes rendez-vous', () => {
  test.beforeEach(async ({ connecter, page }) => {
    await connecter(CLIENT);
    await page.goto('/appointments');
    await expect(page.getByRole('heading', { name: 'Rendez-vous' })).toBeVisible();
  });

  test('un rendez-vous à venir s\'affiche, déplaçable et annulable hors du délai', async ({ page }) => {
    const carte = carteRdv(page, '15:00 — 15:45');
    await expect(carte).toBeVisible();
    await expect(carte).toContainText(libelleJour(jour(6)));
    await expect(carte).toContainText('Kevin');
    await expect(carte).toContainText('Coupe + Barbe');
    await expect(carte).toContainText('Confirmé');
    await expect(carte.getByRole('button', { name: 'Déplacer' })).toBeVisible();
    await expect(carte.getByRole('button', { name: 'Annuler' })).toBeVisible();
    await expect(carte).toContainText('Déplaçable ou annulable en ligne jusqu\'au');
    // Le rendez-vous passé n'est pas dans « À venir »
    await expect(page.getByText('11:00 — 11:30', { exact: true })).toHaveCount(0);
  });

  test('dans le délai de 24 h : pas de bouton Annuler, le téléphone du salon à la place', async ({ page }) => {
    const carte = carteRdv(page, '17:00 — 17:20');
    await expect(carte).toBeVisible();
    await expect(carte).toContainText('Romain');
    await expect(carte.getByRole('button', { name: 'Annuler' })).toHaveCount(0);
    await expect(carte.getByRole('button', { name: 'Déplacer' })).toHaveCount(0);
    await expect(carte).toContainText('Ce rendez-vous est dans moins de 24 h : il ne peut plus être déplacé ni annulé en ligne');
    await expect(carte.getByRole('link', { name: 'appelez le salon' })).toHaveAttribute('href', /^tel:(\+33|0)666083605$/);
    await expect(carte).toContainText(`au ${SALON_TELEPHONE}`);
  });
});
