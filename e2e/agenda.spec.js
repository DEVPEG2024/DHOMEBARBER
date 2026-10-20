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

  // Last Minute (20 oct. 2026) : tous les clients sont prévenus automatiquement 3 h avant par le
  // serveur (jobs/lastMinuteAutoPush.js) ; l'agenda ne prévient tout de suite que dans ces 3 h.
  // Horloge figée à 10 h ; Dom est libre à 10:30 et à 16:00.
  async function ouvrirLastMinute(page, debut) {
    await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
    await page.getByRole('button', { name: 'Last Minute', exact: true }).click();
    const fenetre = page.getByRole('dialog');
    await fenetre.locator('#lm-barber').selectOption(BARBERS.dom.id);
    await expect(fenetre.locator('#lm-start')).toBeEnabled();
    await fenetre.locator('#lm-start').selectOption(debut);
    return fenetre;
  }

  test('Last Minute à plus de 3 h : créneau bloqué sans notification, annonce automatique indiquée', async ({ page, api }) => {
    const fenetre = await ouvrirLastMinute(page, '16:00');
    await expect(fenetre.getByRole('status').filter({ hasText: 'prévenus automatiquement' })).toContainText('aujourd\'hui à 13:00');
    await fenetre.getByRole('button', { name: 'Bloquer le créneau', exact: true }).click();
    await expect(page.getByText('Créneau bloqué · tous les clients seront prévenus automatiquement aujourd\'hui à 13:00')).toBeVisible();
    expect(api.requetesVers('POST', '/entities/Appointment').at(-1).corps)
      .toMatchObject({ status: 'last_minute', employee_id: BARBERS.dom.id, date: jour(0), start_time: '16:00' });
    expect(api.requetesVers('POST', '/last-minute'), 'aucune notification immédiate').toHaveLength(0);
  });

  test('Last Minute à plus de 3 h, « Prévenir aussi tout de suite » : notification immédiate en plus', async ({ page, api }) => {
    api.surcharger('POST', '/last-minute', () => ({ json: { sent: 4, failed: 0, total: 5, skippedNative: 0 } }));
    const fenetre = await ouvrirLastMinute(page, '16:00');
    await fenetre.getByLabel('Prévenir aussi les clients tout de suite').check();
    await fenetre.getByRole('button', { name: 'Bloquer et prévenir les clients' }).click();
    await expect(page.getByText('Notification envoyée à 4 appareils · Créneau bloqué')).toBeVisible();
    expect(api.requetesVers('POST', '/last-minute')).toHaveLength(1);
  });

  test('Last Minute dans moins de 3 h : les clients sont prévenus tout de suite', async ({ page, api }) => {
    api.surcharger('POST', '/last-minute', () => ({ json: { sent: 4, failed: 0, total: 5, skippedNative: 0 } }));
    const fenetre = await ouvrirLastMinute(page, '10:30');
    await expect(fenetre.getByText('Le créneau commence dans moins de 3 h : tous les clients sont prévenus tout de suite.')).toBeVisible();
    await expect(fenetre.getByLabel('Prévenir aussi les clients tout de suite')).toHaveCount(0);
    await fenetre.getByRole('button', { name: 'Bloquer et prévenir les clients' }).click();
    await expect(page.getByText('Notification envoyée à 4 appareils · Créneau bloqué')).toBeVisible();
    expect(api.requetesVers('POST', '/last-minute').at(-1).corps)
      .toMatchObject({ employee_id: BARBERS.dom.id, date: jour(0), start_time: '10:30' });
  });
});
