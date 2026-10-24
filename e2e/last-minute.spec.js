// Last Minute sur l'accueil (20 oct. 2026) : les créneaux libérés par le salon depuis l'agenda, du
// jour seulement, en cartes orange compactes (une carte, ou un carrousel à partir de deux) ;
// « Réserver » ouvre la réservation avec le barber, le jour et l'heure ; le créneau pris quitte
// aussitôt l'accueil.
import { test, expect } from './support/test.js';
import { BARBERS, CLIENT, PRESTATIONS, rendezVous } from './support/donnees.js';
import { jour } from './support/temps.js';
import { attendreSansDebordement } from './support/outils.js';

/** Créneau Last Minute publié depuis l'agenda : ligne sans client, statut `last_minute`. */
const lastMinute = (id, barber, date, debut, finCreneau) => rendezVous({
  id, barber, prestations: [], date, debut, statut: 'last_minute', end_time: finCreneau, total_duration: 30,
});

/**
 * Lecture des créneaux Last Minute faite par l'accueil : les lignes d'un seul jour, sans filtre de
 * statut (depuis le 24 oct. 2026, pour voir un RDV ou une pause posés par-dessus un créneau).
 */
const estLectureLastMinute = (r) => Array.isArray(r.q?.date) && r.q.date.length === 1 && Object.keys(r.q).length === 1;
const lecturesLastMinute = (api) => api.requetesVers('GET', '/entities/Appointment').filter(estLectureLastMinute);

const boutonsReserverCreneau = (page) => page.getByRole('link', { name: /^Réserver ce créneau/ });

/** Accueil affiché, sections comprises (« Horaires » est dans la même liste que le Last Minute). */
async function accueilPret(page) {
  await expect(page.getByRole('link', { name: 'Réserver maintenant' })).toBeVisible();
  await expect(page.getByText('Horaires', { exact: true })).toBeVisible();
}

test.describe('Last Minute sur l\'accueil', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(CLIENT);
  });

  test('aucun créneau libre : rien sur l\'accueil', async ({ page, api }) => {
    // Un créneau déjà pris par un client et un autre qui commence dans 5 min ne s'affichent pas
    api.tables.Appointment.push(
      { ...lastMinute('lm-pris', BARBERS.dom, jour(0), '15:00', '15:30'), client_email: 'jules.martin@exemple.fr', client_name: 'Jules Martin' },
      lastMinute('lm-trop-tot', BARBERS.kevin, jour(0), '10:05', '10:30'),
    );
    await page.goto('/');
    await accueilPret(page);
    await expect.poll(() => lecturesLastMinute(api).length).toBeGreaterThan(0);
    await expect(boutonsReserverCreneau(page)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Créneaux Last Minute' })).toHaveCount(0);
  });

  test('créneau de demain : rien sur l\'accueil aujourd\'hui (le jour même seulement)', async ({ page, api }) => {
    api.tables.Appointment.push(lastMinute('lm-demain', BARBERS.romain, jour(1), '10:00', '10:30'));
    await page.goto('/');
    await accueilPret(page);
    await expect.poll(() => lecturesLastMinute(api).length).toBeGreaterThan(0);
    // L'accueil ne demande plus que le jour même
    expect(lecturesLastMinute(api).every((r) => JSON.stringify(r.q?.date) === JSON.stringify([jour(0)]))).toBe(true);
    await expect(boutonsReserverCreneau(page)).toHaveCount(0);
  });

  test('un créneau : carte compacte, réservation pré-remplie, créneau retiré de l\'accueil', async ({ page, api }) => {
    // Sans le RDV du client de 17 h ce jour-là (la confirmation demanderait « un rendez-vous en plus »)
    api.tables.Appointment = api.tables.Appointment.filter((r) => r.id !== 'apt-proche-romain');
    api.tables.Appointment.push(lastMinute('lm-kevin', BARBERS.kevin, jour(0), '15:30', '16:00'));
    // Le vrai serveur reprend la ligne Last Minute (même id) au lieu d'en créer une autre
    api.surcharger('POST', '/entities/Appointment', (req) => {
      const lm = api.tables.Appointment.find((r) => r.id === 'lm-kevin' && r.status === 'last_minute');
      if (!lm || req.corps?.start_time !== '15:30') return undefined;
      Object.assign(lm, req.corps, { status: 'confirmed', internal_notes: '[last_minute]' });
      return { status: 201, json: { ...lm, blocks_client: true } };
    });

    await page.goto('/');
    await accueilPret(page);
    const carte = page.getByRole('article', { name: 'Créneau Last Minute aujourd\'hui à 15:30 avec Kevin' });
    await expect(carte).toBeVisible();
    await expect(carte).toContainText('dans 5 h 30');
    await expect(carte).toContainText('15:30 – 16:00');
    // Carte compacte (demande du propriétaire) : ~125 px de haut, plus de 270 px avant
    const hauteur = (await carte.boundingBox()).height;
    expect(hauteur, `hauteur de la carte : ${hauteur} px`).toBeLessThanOrEqual(140);
    // Une seule carte : pas de carrousel
    await expect(page.getByRole('region', { name: 'Créneaux Last Minute' })).toHaveCount(0);

    await carte.getByRole('link', { name: 'Réserver ce créneau, aujourd\'hui à 15:30 avec Kevin' }).click();
    await expect(page).toHaveURL(new RegExp(`/booking\\?barber=${BARBERS.kevin.id}&date=${jour(0)}&time=15%3A30$`));

    // Étape Prestation : le créneau est rappelé
    await expect(page.getByRole('heading', { name: 'Choisissez votre prestation' })).toBeVisible();
    await expect(page.getByText('Last Minute avec Kevin, aujourd\'hui à 15:30.')).toBeVisible();
    await page.getByRole('button', { name: 'Choisir : Coupe', exact: true }).click();

    // Écran Créneau : Kevin, aujourd'hui et 15:30 déjà choisis
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    // Nom du bouton : initiale (pas de photo), prénom, « Habituel » (dernière visite chez Kevin)
    await expect(page.getByRole('group', { name: 'Choix du barber' }).getByRole('button', { name: /\bKevin\b/ }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: 'Après-midi' }).getByRole('button', { name: '15:30', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();
    await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
    expect(api.requetesVers('POST', '/entities/Appointment')[0].corps).toMatchObject({
      employee_id: BARBERS.kevin.id, date: jour(0), start_time: '15:30', end_time: '16:00',
      services: [{ service_id: PRESTATIONS.coupe.id, name: 'Coupe', duration: 30, price: 25 }],
    });
    await expect(page).toHaveURL(/\/appointments$/, { timeout: 10_000 });

    // Retour à l'accueil sans recharger l'app : la liste des Last Minute répond lentement, la carte
    // du créneau pris ne doit pas réapparaître le temps de la relire
    let relecturesServies = 0;
    api.surcharger('GET', '/entities/Appointment', async (req) => {
      if (!estLectureLastMinute(req)) return undefined;
      await new Promise((r) => { setTimeout(r, 2500); });
      relecturesServies += 1;
      return undefined;
    });
    const lecturesAvant = lecturesLastMinute(api).length;
    await page.locator('nav').getByRole('link', { name: 'Accueil', exact: true }).click();
    await accueilPret(page);
    // Contrôle immédiat (sans attente) : la relecture n'a pas encore répondu
    expect(await boutonsReserverCreneau(page).count()).toBe(0);
    await expect.poll(() => lecturesLastMinute(api).length).toBeGreaterThan(lecturesAvant);
    await expect.poll(() => relecturesServies).toBeGreaterThan(0);
    await expect(boutonsReserverCreneau(page)).toHaveCount(0);
  });

  test.describe('à 320 px', () => {
    test.use({ viewport: { width: 320, height: 640 } });

    test('un créneau : « Last Minute » et « dans 5 h 30 » en entier sur la carte pleine largeur', async ({ page, api }) => {
      api.tables.Appointment.push(lastMinute('lm-kevin', BARBERS.kevin, jour(0), '15:30', '16:00'));
      await page.goto('/');
      await accueilPret(page);
      const carte = page.getByRole('article', { name: 'Créneau Last Minute aujourd\'hui à 15:30 avec Kevin' });
      await expect(carte).toContainText('dans 5 h 30');
      const libelle = carte.getByText('Last Minute', { exact: true });
      await expect(libelle).toBeVisible();
      expect(await libelle.evaluate((el) => el.scrollWidth > el.clientWidth), '« Last Minute » coupé').toBe(false);
    });

    test('plusieurs créneaux : carrousel du jour, du plus proche au plus lointain, sans débordement', async ({ page, api }) => {
      api.tables.Appointment.push(
        lastMinute('lm-kevin', BARBERS.kevin, jour(0), '15:30', '16:00'),
        lastMinute('lm-romain', BARBERS.romain, jour(1), '10:00', '10:30'),
        lastMinute('lm-dom', BARBERS.dom, jour(0), '12:00', '12:30'),
      );
      await page.goto('/');
      await accueilPret(page);

      const carrousel = page.getByRole('region', { name: 'Créneaux Last Minute' });
      await expect(carrousel).toBeVisible();
      // Le créneau de demain (Romain) n'apparaît pas : le jour même seulement
      await expect(page.getByText('2 créneaux Last Minute', { exact: true })).toBeVisible();
      await expect(carrousel.getByRole('article')).toHaveCount(2);
      const noms = await carrousel.getByRole('article').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
      expect(noms).toEqual([
        'Créneau Last Minute aujourd\'hui à 12:00 avec Dom',
        'Créneau Last Minute aujourd\'hui à 15:30 avec Kevin',
      ]);
      // Cartes compactes, et les deux boutons tiennent sur une ligne à 320 px
      for (const carte of await carrousel.getByRole('article').all()) {
        expect((await carte.boundingBox()).height).toBeLessThanOrEqual(140);
        // Compte à rebours toujours précédé de « dans » (sans lui, « 5 h 30 » se lit comme une durée),
        // libellé de la carte réduit à l'éclair (l'en-tête dit « 2 créneaux Last Minute »), rien de coupé
        await expect(carte).toContainText(/dans \d/);
        await expect(carte.getByText('Last Minute', { exact: true })).toBeHidden();
        // Les deux rangées de contenu (photo / heure / pastille, puis boutons) tiennent dans la carte ;
        // le halo décoratif, en position absolue, déborde exprès sous le cadre qui le masque
        const debordements = await carte.locator(':scope > div > div.flex').evaluateAll((rangees) => rangees
          .map((r) => r.scrollWidth - r.clientWidth).filter((d) => d > 1));
        expect(debordements, 'rangée de la carte qui déborde').toEqual([]);
        const reserver = await carte.getByRole('link', { name: /^Réserver ce créneau/ }).boundingBox();
        const envoyer = await carte.getByRole('button', { name: /^Envoyer à un ami/ }).boundingBox();
        expect(Math.abs(reserver.y - envoyer.y), 'boutons sur la même ligne').toBeLessThan(2);
        expect(envoyer.height).toBeGreaterThanOrEqual(40);
      }
      await attendreSansDebordement(page, 'l\'accueil avec le carrousel Last Minute');
    });
  });
});
