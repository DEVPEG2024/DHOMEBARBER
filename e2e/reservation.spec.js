// Réservation (/booking, refonte du 19 oct. 2026) : Prestation → Créneau → Confirmation.
import { test, expect } from './support/test.js';
import { BARBERS, CLIENT, PRESTATIONS } from './support/donnees.js';
import { jour } from './support/temps.js';
import { echapper, libelleJour, toast } from './support/outils.js';

/** Jour choisi dans les parcours : jeudi (J+2), aucun rendez-vous du client ce jour-là. */
const JOUR_RESA = jour(2);

/** Bouton d'un jour de la bande, une fois ses places calculées (« jeudi 22 octobre : 17 créneaux libres »). */
const boutonJour = (page, cle) => page.getByRole('region', { name: 'Choix du jour' })
  .getByRole('button', { name: new RegExp(`^${echapper(libelleJour(cle))} : \\d+ créneaux? libres?$`) });

/** Bouton d'une heure du jour affiché (nom exact : « 15:00 », ou « 15:00 avec Dom » en « peu importe »). */
const boutonHeure = (page, nom) => page.getByRole('group', { name: 'Après-midi' }).getByRole('button', { name: nom, exact: true });

/** Requêtes de création de rendez-vous reçues par le faux serveur. */
const creations = (api) => api.requetesVers('POST', '/entities/Appointment');

test.describe('Réservation', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(CLIENT);
  });

  test('parcours complet : prestation, créneau, confirmation, écran de succès', async ({ page, api }) => {
    await page.goto('/booking');
    await expect(page.getByRole('heading', { name: 'Choisissez votre prestation' })).toBeVisible();
    await page.getByRole('button', { name: 'Choisir : Coupe', exact: true }).click();

    // Écran Créneau : le barber de la dernière visite (Kevin) est proposé d'office
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Choix du barber' }).getByRole('button', { name: /Kevin Habituel$/ }))
      .toHaveAttribute('aria-pressed', 'true');
    await boutonJour(page, JOUR_RESA).click();
    await expect(page.getByRole('heading', { name: new RegExp(`^${echapper(libelleJour(JOUR_RESA))}$`, 'i') })).toBeVisible();
    await boutonHeure(page, '15:00').click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    // Confirmation : récapitulatif puis envoi
    await expect(page.getByRole('heading', { name: 'Vérifiez et confirmez' })).toBeVisible();
    await expect(page.getByText(`${libelleJour(JOUR_RESA)} · 15:00`)).toBeVisible();
    await page.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();

    await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
    await expect(page.getByText('Kevin vous attend au salon.')).toBeVisible();

    // Corps envoyé au serveur
    expect(creations(api)).toHaveLength(1);
    expect(creations(api)[0].corps).toMatchObject({
      client_email: CLIENT.email,
      employee_id: BARBERS.kevin.id,
      employee_name: 'Kevin',
      date: JOUR_RESA,
      start_time: '15:00',
      end_time: '15:30',
      total_duration: 30,
      total_price: 25,
      status: 'confirmed',
      services: [{ service_id: PRESTATIONS.coupe.id, name: 'Coupe', duration: 30, price: 25 }],
    });

    // Puis la liste des rendez-vous (après l'animation de succès)
    await expect(page).toHaveURL(/\/appointments$/, { timeout: 10_000 });
  });

  test('lien direct avec une prestation : ouverture sur l\'écran Créneau', async ({ page }) => {
    await page.goto(`/booking?services=${PRESTATIONS.coupeBarbe.id}`);

    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Créneau' })).toHaveAttribute('aria-current', 'step');
    // Le catalogue (affiché le temps de lire les prestations) a disparu
    await expect(page.getByRole('button', { name: /^Choisir :/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Choisissez votre prestation' })).toHaveCount(0);
    // Prestation du lien rappelée en tête de l'écran et dans la barre du bas
    await expect(page.getByText('Coupe + Barbe', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Votre réservation' }).filter({ hasText: 'Choisissez une heure' }))
      .toContainText('45 min · 35 €');
  });

  test('créneau pris entre-temps (409) : message, retour au choix de l\'heure, pas de succès', async ({ page, api }) => {
    const MESSAGE = 'Ce créneau vient d\'être réservé, choisissez-en un autre.';
    api.surcharger('POST', '/entities/Appointment', () => ({ status: 409, json: { error: MESSAGE } }));

    await page.goto(`/booking?services=${PRESTATIONS.coupe.id}`);
    await boutonJour(page, JOUR_RESA).click();
    await boutonHeure(page, '15:00').click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    const lecturesAvant = api.requetesVers('GET', '/entities/Appointment').length;
    await page.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();

    // Message du serveur (sans point final), retour à l'écran Créneau sans heure choisie
    await expect(toast(page, 'Ce créneau vient d\'être réservé, choisissez-en un autre')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Votre réservation' }).getByText('Choisissez une heure')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continuer' })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toHaveCount(0);
    // Les créneaux sont relus pour ne pas reproposer l'heure refusée
    await expect.poll(() => api.requetesVers('GET', '/entities/Appointment').length).toBeGreaterThan(lecturesAvant);
    await expect(page).toHaveURL(/\/booking/);
  });

  test('« Peu importe » : le rendez-vous part avec le premier barber libre à l\'heure choisie', async ({ page, api }) => {
    await page.goto(`/booking?services=${PRESTATIONS.coupe.id}`);
    const peuImporte = page.getByRole('group', { name: 'Choix du barber' }).getByRole('button', { name: 'Peu importe' });
    await peuImporte.click();
    await expect(peuImporte).toHaveAttribute('aria-pressed', 'true');

    await boutonJour(page, JOUR_RESA).click();
    // En « peu importe », chaque heure porte le prénom du premier barber libre (ordre de l'équipe)
    await boutonHeure(page, '15:00 avec Dom').click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await expect(page.getByText('Premier disponible à cette heure')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();
    await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
    expect(creations(api)[0].corps).toMatchObject({
      employee_id: BARBERS.dom.id, employee_name: 'Dom', date: JOUR_RESA, start_time: '15:00',
    });
  });

  test('prestation retirée du catalogue dans le lien : bandeau et choix des prestations', async ({ page }) => {
    await page.goto(`/booking?services=${PRESTATIONS.coupe.id},srv-retiree`);

    await expect(page.getByRole('heading', { name: 'Choisissez votre prestation' })).toBeVisible();
    await expect(page.getByRole('status').filter({
      hasText: 'Une prestation de votre rendez-vous n\'est plus proposée : vérifiez votre sélection.',
    })).toBeVisible();
    // La prestation encore proposée reste choisie
    await expect(page.getByRole('button', { name: 'Ajouter Coupe à ma sélection' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toHaveCount(0);
  });
});
