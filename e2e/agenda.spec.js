// Agenda de l'équipe (/admin/agenda) : colonnes par barber, fiche d'un rendez-vous, vue Semaine.
import { test, expect } from './support/test.js';
import { ADMIN, BARBERS } from './support/donnees.js';
import { jour, joursDeLaSemaine } from './support/temps.js';

/**
 * Colonne d'un barber dans la vue Jour. `data-drop-column` est l'attribut que l'agenda utilise lui-même
 * pour le glisser-déposer (repère stable, pas une classe de style).
 */
const colonne = (page, barber) => page.locator(`[data-drop-column="${barber.id}"]`);

test.describe('Agenda de l\'équipe', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('vue Jour : chaque rendez-vous est dans la colonne de son barber', async ({ page }) => {
    await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);

    await expect(colonne(page, BARBERS.dom)).toContainText('Jules Martin');
    await expect(colonne(page, BARBERS.kevin)).toContainText('Nina Roche');
    await expect(colonne(page, BARBERS.romain)).toContainText('Camille Test');
    await expect(colonne(page, BARBERS.dom)).not.toContainText('Nina Roche');
    await expect(colonne(page, BARBERS.kevin)).not.toContainText('Jules Martin');
    // Le rendez-vous passé du client (il y a deux semaines) n'est pas sur ce jour
    await expect(page.getByRole('button', { name: /11:00 Camille Test/ })).toHaveCount(0);
  });

  test('un tap sur un rendez-vous ouvre sa fiche', async ({ page }) => {
    await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
    await colonne(page, BARBERS.kevin).getByRole('button', { name: /Nina Roche/ }).click();

    const fiche = page.getByRole('dialog', { name: 'Détails du rendez-vous' });
    await expect(fiche).toBeVisible();
    await expect(fiche).toContainText('Nina Roche');
    await expect(fiche).toContainText('Coupe + Barbe');
    await expect(fiche).toContainText('14:00');
  });

  test('vue Semaine : les sept jours de la semaine sont demandés en une fois et affichés', async ({ page, api }) => {
    await page.goto(`/admin/agenda?view=week&date=${jour(0)}`);
    const semaine = joursDeLaSemaine(jour(0));

    // Une colonne par jour (lundi → dimanche), les rendez-vous du jour dans la colonne de mardi
    for (const cle of semaine) {
      await expect(page.locator(`[data-drop-column="${cle}"]`)).toHaveCount(1);
    }
    await expect(page.locator(`[data-drop-column="${jour(0)}"]`)).toContainText('Jules Martin');
    await expect(page.locator(`[data-drop-column="${jour(0)}"]`)).toContainText('Nina Roche');
    // Filtre `date` envoyé au serveur : exactement les sept jours de la semaine, triés par heure
    await expect.poll(() => api.requetesVers('GET', '/entities/Appointment')
      .some((r) => JSON.stringify(r.q) === JSON.stringify({ date: semaine }) && r.query.sort === 'start_time'))
      .toBe(true);
  });
});
