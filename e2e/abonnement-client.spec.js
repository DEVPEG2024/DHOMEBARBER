// Abonnements au mois, écrans du client (contrat : docs/fonctions/abonnements-contrat.md) : catalogue,
// /abonnement (formule, premier RDV, 4 RDV proposés, récapitulatif, succès, reprise), /gift-cards,
// /appointments et déplacement sur /booking. Faux serveur : `api.abonnements`
// (e2e/support/fauxAbonnements.js).
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { ADMIN, BARBERS, CLIENT, PRESTATIONS, rendezVous } from './support/donnees.js';
import { PRESTATIONS_ABONNEMENT } from './support/fauxAbonnements.js';
import { jour } from './support/temps.js';
import { attendreSansDebordement, echapper, libelleJour, toast } from './support/outils.js';

const FORMULE = PRESTATIONS_ABONNEMENT.classiques;
const AUTRE = { full_name: 'Jules Martin', email: 'jules.martin@exemple.fr', phone: '0622334455' };

/** Premier RDV des parcours : jeudi (J+2) à 17:00 ; les suivants, chaque semaine à la même heure. */
const J1 = jour(2);
const J2 = jour(9);
const J3 = jour(16);
const J4 = jour(23);

/** Les paramètres publics (drapeaux) : tombés en panne le temps d'un test. */
const PARAMETRES = '/api/apps/public/prod/public-settings/by-id/prod';
/** Le bouton de la barre reste inactif 600 ms après l'arrivée sur une étape : on attend d'en être sorti. */
const apresLaGarde = (page) => page.waitForTimeout(800);
/** Coupe les paramètres publics ; `retablir()` rend le serveur. */
function pannePublique(api) {
  let panne = true;
  api.surcharger('GET', PARAMETRES, () => (panne ? { status: 503, json: { error: 'Service indisponible' } } : undefined));
  return { retablir: () => { panne = false; } };
}

const ajouterFormules = (api) => {
  api.tables.Service.push(...Object.values(PRESTATIONS_ABONNEMENT).map((p) => ({ ...p, category_id: null, created_at: '2026-01-15T10:00:00.000Z' })));
};

const boutonJour = (page, cle) => page.getByRole('region', { name: 'Choix du jour' })
  .getByRole('button', { name: new RegExp(`^${echapper(libelleJour(cle))} : \\d+ créneaux? libres?$`) });
/** Un jour loin dans la bande : amené à l'écran (ses places se lisent au fil du défilement), puis touché. */
async function choisirJour(page, cle) {
  await page.locator(`[data-day="${cle}"]`).scrollIntoViewIfNeeded();
  await boutonJour(page, cle).click();
}
const boutonHeure = (page, nom, moment = 'Après-midi') => page.getByRole('group', { name: moment }).getByRole('button', { name: nom, exact: true });
const barbers = (page) => page.getByRole('group', { name: 'Choix du barber' });
/** Barre du bas portant ce texte (la barre de l'étape précédente peut être encore en train de sortir). */
const barre = (page, texte) => page.getByRole('region', { name: 'Votre réservation' }).filter({ hasText: texte });
const ligne = (page, n) => page.getByRole('listitem').filter({ has: page.getByRole('button', { name: new RegExp(`le rendez-vous ${n}$`) }) });
const envois = (api) => api.requetesVers('POST', '/subscriptions');

/**
 * Abonnement déjà pris : `jours` compte depuis le jour figé des tests (`jour(0)`), quel que soit le
 * jour que le faux serveur appelle « aujourd'hui ».
 */
function abonnement(api, { jours = 2, ...reste }) {
  const ecart = Math.round((Date.parse(jour(0)) - Date.parse(api.abonnements.aujourdhui())) / 86_400_000);
  return api.abonnements.creer({ client: CLIENT, prestation: FORMULE, barber: BARBERS.kevin, heure: '17:00', jours: jours + ecart, ...reste });
}

/** RDV d'un autre client (occupe le créneau). */
const rdvAutre = (id, date, debut, prestations = [PRESTATIONS.coupe]) => rendezVous({ id, client: AUTRE, barber: BARBERS.kevin, prestations, date, debut });

/** De la formule jusqu'à l'écran des 4 RDV, premier RDV jeudi 17:00 avec Kevin (barber habituel). */
async function jusquaLignes(page, service = FORMULE) {
  await page.goto(`/abonnement?service=${service.id}`);
  await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toBeVisible();
  await expect(barbers(page).getByRole('button', { name: /Kevin Habituel$/ })).toHaveAttribute('aria-pressed', 'true');
  await boutonJour(page, J1).click();
  await boutonHeure(page, '17:00').click();
  await page.getByRole('button', { name: 'Proposer les 3 suivants' }).click();
  await expect(page.getByRole('heading', { name: 'Vos 4 rendez-vous' })).toBeVisible();
}

/** Jusqu'au récapitulatif. */
async function jusquaRecap(page, service = FORMULE) {
  await jusquaLignes(page, service);
  await expect(ligne(page, 4)).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: 'Votre abonnement' })).toBeVisible();
}

test.describe('Abonnements : drapeau faux', () => {
  test.beforeEach(async ({ api, connecter }) => {
    ajouterFormules(api);
    api.donnees.parametresPublics.features.subscriptions = false;
    await connecter(CLIENT);
  });

  test('le catalogue et la réservation restent strictement comme avant', async ({ page, api }) => {
    await page.goto('/services');
    await expect(page.getByText('Formules mensuelles : demandez les détails au salon.')).toBeVisible();
    await expect(page.getByText('4 rendez-vous réservés d\'un coup, réglés au salon.')).toHaveCount(0);
    await expect(page.getByText(/€ la coupe/)).toHaveCount(0);

    // « Réserver » : la réservation d'une seule visite, comme aujourd'hui
    await page.getByRole('button', { name: `Réserver : ${FORMULE.name}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/booking\\?services=${FORMULE.id}$`));
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(barre(page, '30 min · 100 €')).toBeVisible();
    expect(api.requetesVers('GET', /^\/subscriptions/)).toHaveLength(0);
  });

  test('/abonnement ramène au catalogue, et rien n\'est lu sur les cartes ni les rendez-vous', async ({ page, api }) => {
    await page.goto(`/abonnement?service=${FORMULE.id}`);
    await expect(page).toHaveURL(/\/services$/);
    await expect(page.getByRole('heading', { name: 'Nos prestations' })).toBeVisible();

    await page.goto('/gift-cards');
    await expect(page.getByRole('heading', { name: 'Pas encore de carte' })).toBeVisible();
    await page.goto('/appointments');
    await expect(page.getByRole('heading', { name: 'Rendez-vous' })).toBeVisible();
    expect(api.requetesVers('GET', /^\/subscriptions/)).toHaveLength(0);
  });
});

test.describe('Abonnements : catalogue', () => {
  test.beforeEach(async ({ api, connecter }) => {
    ajouterFormules(api);
    await connecter(CLIENT);
  });

  test('une formule affiche le prix de la coupe et mène à /abonnement, jamais au panier', async ({ page }) => {
    await page.goto('/services');
    await expect(page.getByText('4 rendez-vous réservés d\'un coup, réglés au salon.')).toBeVisible();
    await expect(page.getByText('Formules mensuelles : demandez les détails au salon.')).toHaveCount(0);
    const rangee = page.getByRole('listitem').filter({ hasText: FORMULE.name });
    await expect(rangee).toContainText('25 € la coupe');
    await expect(rangee).toContainText('100 €');
    // Formule qui comprend plus que des coupes : le même libellé que sur /abonnement
    await expect(page.getByRole('listitem').filter({ hasText: PRESTATIONS_ABONNEMENT.degrade.name })).toContainText('35 € la visite');
    await rangee.getByRole('button', { name: `Réserver : ${FORMULE.name}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/abonnement\\?service=${FORMULE.id}$`));
    await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toBeVisible();
  });

  test('à l\'étape 1 de la réservation aussi, et avec une sélection déjà commencée', async ({ page }) => {
    await page.goto('/booking');
    // Une coupe dans la sélection : les lignes passent en « Ajouter », jamais une formule
    await page.getByRole('button', { name: /^Coupe\b/ }).first().click();
    await page.getByRole('button', { name: 'Ajouter une autre prestation' }).click();
    const rangee = page.getByRole('listitem').filter({ hasText: FORMULE.name });
    await expect(rangee.getByRole('button', { name: `Choisir : ${FORMULE.name}`, exact: true })).toBeVisible();
    await expect(rangee.getByRole('button', { name: /^Ajouter/ })).toHaveCount(0);
    await rangee.getByRole('button', { name: `Choisir : ${FORMULE.name}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/abonnement\\?service=${FORMULE.id}$`));
  });

  test('la fiche d\'une formule : « Choisir mes 4 RDV » seulement', async ({ page }) => {
    await page.goto('/services');
    await page.getByRole('listitem').filter({ hasText: FORMULE.name }).getByRole('button', { name: new RegExp(`^${echapper(FORMULE.name)}`) }).click();
    const fiche = page.getByRole('dialog');
    await expect(fiche.getByText('25 € la coupe')).toBeVisible();
    await expect(fiche.getByRole('button', { name: /sélection|autre prestation/ })).toHaveCount(0);
    await fiche.getByRole('button', { name: /Choisir mes 4 RDV/ }).click();
    await expect(page).toHaveURL(new RegExp(`/abonnement\\?service=${FORMULE.id}$`));
  });

  test('/booking?services=<formule> : redirection vers /abonnement, le barber du lien gardé', async ({ page }) => {
    await page.goto(`/booking?barber=${BARBERS.dom.id}&services=${FORMULE.id}`);
    await expect(page).toHaveURL(new RegExp(`/abonnement\\?service=${FORMULE.id}&barber=${BARBERS.dom.id}$`));
    await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toBeVisible();
    await expect(barbers(page).getByRole('button', { name: /Dom$/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('« Les plus demandées » : une formule y mène aussi à /abonnement', async ({ page, api }) => {
    api.donnees.parametresPublics.popular_services = [FORMULE.id, PRESTATIONS.coupe.id];
    await page.goto('/services');
    const bloc = page.getByRole('region', { name: 'Les plus demandées' });
    await expect(bloc.getByText('25 € la coupe')).toBeVisible();
    await bloc.getByRole('button', { name: `Réserver : ${FORMULE.name}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/abonnement\\?service=${FORMULE.id}$`));
  });

  test('badge « Nouveau » à 390 px : le libellé de la formule reste entier', async ({ page, api }) => {
    api.tables.Service.find((p) => p.id === FORMULE.id).created_at = `${jour(-2)}T09:00:00.000Z`;
    await page.goto('/services');
    const rangee = page.getByRole('listitem').filter({ hasText: FORMULE.name });
    await expect(rangee.getByText('Nouveau')).toBeVisible();
    const libelle = rangee.getByText('25 € la coupe · 30 min par visite');
    await expect(libelle).toBeVisible();
    expect(await libelle.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test('une prestation ordinaire reste sur la réservation', async ({ page }) => {
    await page.goto(`/booking?services=${PRESTATIONS.coupe.id}`);
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(page).toHaveURL(/\/booking\?services=/);
  });
});

test.describe('Abonnements : le parcours', () => {
  test.beforeEach(async ({ api, connecter }) => {
    ajouterFormules(api);
    await connecter(CLIENT);
  });

  test('parcours complet jusqu\'au succès, avec le bon corps envoyé au serveur', async ({ page, api }) => {
    // Choix de la formule (planche 1)
    await page.goto('/abonnement');
    await expect(page.getByRole('heading', { name: 'Abonnements', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Comment ça marche' })).toBeVisible();
    await expect(page.getByText('Vous réglez l\'abonnement au salon.')).toBeVisible();
    const choix = page.getByRole('group', { name: 'Choix de la formule' });
    await expect(choix.getByRole('button')).toHaveCount(4);
    await expect(choix.getByRole('button', { name: /4 coupes classiques/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(choix.getByRole('button', { name: /4 coupes classiques/ })).toContainText('25 € la coupe · 30 min par visite');
    await expect(choix.getByRole('button', { name: /dégradé barbe/ })).toContainText('35 € la visite · 45 min par visite');
    await page.getByRole('button', { name: 'Choisir mes 4 RDV' }).click();

    // Barber et premier RDV (planche 2)
    await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toBeVisible();
    await expect(page.getByText('4 coupes classiques · 100 €')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Rendez-vous 1 sur 4' })).toBeVisible();
    await expect(barbers(page).getByRole('button', { name: 'Peu importe' })).toHaveCount(0);
    await expect(barbers(page).getByRole('button', { name: /Kevin Habituel$/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Proposer les 3 suivants' })).toBeDisabled();
    await boutonJour(page, J1).click();
    await boutonHeure(page, '17:00').click();
    await expect(barre(page, new RegExp(`${echapper(libelleJour(J1))} à 17:00 avec Kevin`, 'i'))).toBeVisible();
    await page.getByRole('button', { name: 'Proposer les 3 suivants' }).click();

    // Les 4 RDV proposés (planche 3)
    await expect(page.getByRole('heading', { name: 'Vos 4 rendez-vous' })).toBeVisible();
    await expect(page.getByText('4 coupes classiques · avec Kevin')).toBeVisible();
    await expect(page.getByText('Nous avons cherché le même jour et la même heure')).toBeVisible();
    for (const [n, cle] of [[1, J1], [2, J2], [3, J3], [4, J4]]) {
      await expect(ligne(page, n)).toContainText(new RegExp(echapper(libelleJour(cle)), 'i'));
      await expect(ligne(page, n)).toContainText('17:00 · Kevin');
    }
    await expect(page.getByText('Vos 4 rendez-vous doivent tenir dans les 5 semaines')).toBeVisible();
    await page.getByRole('button', { name: 'Continuer' }).click();

    // Récapitulatif (planche 4)
    await expect(page.getByRole('heading', { name: 'Votre abonnement' })).toBeVisible();
    await expect(page.getByText('avec Kevin · 30 min par visite')).toBeVisible();
    await expect(page.getByText('À régler au salon')).toBeVisible();
    await expect(page.getByText('100 €', { exact: true })).toBeVisible();
    await expect(page.getByText('Réglez au plus tard à votre premier rendez-vous. Vos créneaux sont réservés dès maintenant.')).toBeVisible();
    await expect(page.getByText('Une fois réglé, vos 4 coupes sont créditées sur votre carte. Elles restent valables 1 an.')).toBeVisible();
    await expect(page.getByText(/Un RDV annulé garde sa coupe sur la carte\. Moins de 24 h avant un RDV, appelez le salon au/)).toBeVisible();
    await expect(page.getByRole('link', { name: '06 66 08 36 05' })).toBeVisible();
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();

    // Succès (planche 5)
    await expect(page.getByRole('heading', { name: 'Vos 4 RDV sont réservés' })).toBeVisible();
    await expect(page.getByText('Il reste à régler l\'abonnement au salon.')).toBeVisible();
    await expect(page.getByText('4 rendez-vous réservés')).toBeVisible();
    await expect(page.getByText('Régler 100 € au salon')).toBeVisible();
    await expect(page.getByText(new RegExp(`Au plus tard ${echapper(libelleJour(J1))}\\.`, 'i'))).toBeVisible();
    await expect(page.getByText('4 coupes créditées sur votre carte')).toBeVisible();
    const liste = page.getByRole('region', { name: 'Dans Mes rendez-vous' });
    await expect(liste.getByRole('listitem')).toHaveCount(4);
    await expect(liste.getByRole('listitem').nth(1)).toContainText('Coupe 2 sur 4 · Kevin');
    await expect(liste.getByRole('listitem').nth(0)).toContainText('À régler');
    await expect(liste.getByRole('listitem').nth(1)).not.toContainText('À régler');
    await expect(liste.getByRole('button', { name: 'Ajouter au calendrier' })).toHaveCount(4);

    // Corps envoyé au serveur
    expect(envois(api)).toHaveLength(1);
    const corps = envois(api)[0].corps;
    expect(corps.service_id).toBe(FORMULE.id);
    expect(corps.request_key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(corps.slots).toEqual([J1, J2, J3, J4].map((date) => ({ employee_id: BARBERS.kevin.id, date, start_time: '17:00' })));

    await page.getByRole('button', { name: 'Voir mes rendez-vous' }).click();
    await expect(page).toHaveURL(/\/appointments$/);
    await expect(page.getByText('Coupe 1 sur 4')).toBeVisible();
  });

  test('ajout au calendrier d\'un RDV : lien signé, titre « Coupe 1 sur 4 »', async ({ page }) => {
    await jusquaRecap(page);
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    const premier = page.getByRole('region', { name: 'Dans Mes rendez-vous' }).getByRole('listitem').first();
    await premier.getByRole('button', { name: 'Ajouter au calendrier' }).click();
    const [ouverture] = await Promise.all([
      page.context().waitForEvent('page'),
      premier.getByRole('button', { name: 'Google Agenda' }).click(),
    ]);
    expect(decodeURIComponent(ouverture.url()).replace(/\+/g, ' ')).toContain('Coupe 1 sur 4');
    expect(ouverture.url()).not.toContain('100');
    await ouverture.close();
  });

  test('créneau pris une semaine : 17:30 proposé, la ligne le dit', async ({ page, api }) => {
    // 16:30–17:30 occupé : l'heure libre la plus proche de 17:00 est 17:30
    api.tables.Appointment.push(rdvAutre('pris-1', J3, '16:30', [PRESTATIONS.couleur]));
    await jusquaLignes(page);
    await expect(ligne(page, 3)).toContainText('17:30 · Kevin');
    await expect(ligne(page, 3)).toContainText('17:00 est déjà pris ce jour-là : 17:30 proposé.');
    await expect(ligne(page, 2)).not.toContainText('déjà pris');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    await expect(page.getByRole('heading', { name: 'Vos 4 RDV sont réservés' })).toBeVisible();
    expect(envois(api)[0].corps.slots[2]).toEqual({ employee_id: BARBERS.kevin.id, date: J3, start_time: '17:30' });
  });

  test('jour sans place : le jour libre le plus proche est proposé', async ({ page, api }) => {
    api.tables.TimeOff.push({ id: 'conge-1', employee_id: BARBERS.kevin.id, start_date: J2, end_date: J2, status: 'approved' });
    await jusquaLignes(page);
    const proposé = jour(10);
    await expect(ligne(page, 2)).toContainText(new RegExp(echapper(libelleJour(proposé)), 'i'));
    await expect(ligne(page, 2)).toContainText(new RegExp(`Plus de place ${echapper(libelleJour(J2))} : ${echapper(libelleJour(proposé))} proposé\\.`));
    await expect(page.getByRole('button', { name: 'Continuer' })).toBeEnabled();
  });

  test('rien de possible autour du jour : ligne à choisir, « Continuer » inactif', async ({ page, api }) => {
    api.tables.TimeOff.push({ id: 'conge-2', employee_id: BARBERS.kevin.id, start_date: jour(6), end_date: jour(12), status: 'approved' });
    await jusquaLignes(page);
    await expect(ligne(page, 2)).toContainText('Heure à choisir');
    await expect(ligne(page, 2)).toContainText(new RegExp(`Plus de place ${echapper(libelleJour(J2))} : choisissez un autre créneau\\.`));
    await apresLaGarde(page);
    await expect(page.getByRole('button', { name: 'Continuer' })).toBeDisabled();
    await expect(page.getByRole('img', { name: '3 rendez-vous sur 4 choisis' })).toBeVisible();

    // Un autre barber ce jour-là : la ligne est remplie, « Continuer » s'active
    await page.getByRole('button', { name: 'Choisir le rendez-vous 2' }).click();
    await expect(page.getByRole('heading', { name: 'Changer le rendez-vous 2' })).toBeVisible();
    await barbers(page).getByRole('button', { name: /Romain$/ }).click();
    await boutonHeure(page, '11:00', 'Matin').click();
    await page.getByRole('button', { name: 'Garder ce créneau' }).click();
    await expect(page.getByRole('heading', { name: 'Vos 4 rendez-vous' })).toBeVisible();
    await expect(ligne(page, 2)).toContainText('11:00 · Romain');
    await expect(page.getByText('4 coupes classiques', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    await expect(page.getByRole('heading', { name: 'Vos 4 RDV sont réservés' })).toBeVisible();
    expect(envois(api)[0].corps.slots[1]).toEqual({ employee_id: BARBERS.romain.id, date: J2, start_time: '11:00' });
  });

  test('« Changer » refusé par l\'écart de 3 jours, puis accepté', async ({ page, api }) => {
    await jusquaLignes(page);
    await page.getByRole('button', { name: 'Changer le rendez-vous 2' }).click();
    await expect(page.getByRole('heading', { name: 'Changer le rendez-vous 2' })).toBeVisible();
    await expect(barre(page, '17:00 avec Kevin')).toBeVisible();

    // Lendemain du premier RDV : refusé avant tout envoi, même une heure choisie
    await boutonJour(page, jour(3)).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Laissez au moins 3 jours entre deux rendez-vous.' })).toBeVisible();
    await boutonHeure(page, '17:00').click();
    await expect(page.getByRole('button', { name: 'Garder ce créneau' })).toBeDisabled();

    // Trois jours après le premier : accepté
    await boutonJour(page, jour(5)).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Laissez au moins' })).toHaveCount(0);
    await boutonHeure(page, '15:30').click();
    await page.getByRole('button', { name: 'Garder ce créneau' }).click();
    await expect(page.getByRole('heading', { name: 'Vos 4 rendez-vous' })).toBeVisible();
    await expect(ligne(page, 2)).toContainText(new RegExp(echapper(libelleJour(jour(5))), 'i'));
    await expect(ligne(page, 2)).toContainText('15:30 · Kevin');
    expect(envois(api)).toHaveLength(0);
  });

  test('« Changer » au-delà des 5 semaines : refusé', async ({ page }) => {
    await jusquaLignes(page);
    await page.getByRole('button', { name: 'Changer le rendez-vous 4' }).click();
    await choisirJour(page, jour(45));
    await expect(page.getByRole('alert').filter({ hasText: 'Vos 4 rendez-vous doivent tenir dans les 5 semaines qui suivent le premier.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Garder ce créneau' })).toBeDisabled();
  });

  test('« Changer » garde l\'ordre chronologique : la ligne déplacée change de numéro', async ({ page }) => {
    await jusquaLignes(page);
    await page.getByRole('button', { name: 'Changer le rendez-vous 2' }).click();
    await choisirJour(page, jour(28));
    await boutonHeure(page, '15:00').click();
    await page.getByRole('button', { name: 'Garder ce créneau' }).click();
    await expect(ligne(page, 4)).toContainText(new RegExp(echapper(libelleJour(jour(28))), 'i'));
    await expect(ligne(page, 2)).toContainText(new RegExp(echapper(libelleJour(J3)), 'i'));
  });

  test('slot_unavailable à l\'envoi : retour à l\'étape 2, créneaux relus, ligne signalée', async ({ page, api }) => {
    await jusquaRecap(page);
    // Pris par un autre client pendant que le récapitulatif était ouvert
    api.tables.Appointment.push(rdvAutre('pris-2', J2, '17:00'));
    const lectures = api.requetesVers('GET', '/entities/Appointment').length;
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();

    await expect(page.getByRole('heading', { name: 'Vos 4 rendez-vous' })).toBeVisible();
    await expect(toast(page, 'Ce créneau vient d\'être réservé, choisissez-en un autre.')).toBeVisible();
    await expect(ligne(page, 2)).toContainText('Ce créneau vient d\'être réservé, choisissez-en un autre.');
    await expect(ligne(page, 2)).toContainText('Heure à choisir');
    await expect(ligne(page, 1)).toContainText('17:00 · Kevin');
    await apresLaGarde(page);
    await expect(page.getByRole('button', { name: 'Continuer' })).toBeDisabled();
    await expect.poll(() => api.requetesVers('GET', '/entities/Appointment').length).toBeGreaterThan(lectures);

    // L'heure prise n'est plus proposée ; une autre, et l'envoi passe
    await page.getByRole('button', { name: 'Choisir le rendez-vous 2' }).click();
    await expect(boutonHeure(page, '17:30')).toBeVisible();
    await expect(boutonHeure(page, '17:00')).toHaveCount(0);
    await boutonHeure(page, '17:30').click();
    await page.getByRole('button', { name: 'Garder ce créneau' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    await expect(page.getByRole('heading', { name: 'Vos 4 RDV sont réservés' })).toBeVisible();
    expect(envois(api)[1].corps.slots[1].start_time).toBe('17:30');
  });

  test('refus 400 d\'un créneau (passé, horaires, fermeture) : étape 2, le message du serveur sur la ligne', async ({ page, api }) => {
    const MESSAGE = 'Ce créneau est déjà passé.';
    let refuse = true;
    api.surcharger('POST', '/subscriptions', () => {
      if (!refuse) return undefined;
      refuse = false;
      return { status: 400, json: { error: MESSAGE, code: 'slot_unavailable', slot: 1, date: J2, start_time: '17:00' } };
    });
    await jusquaRecap(page);
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    await expect(page.getByRole('heading', { name: 'Vos 4 rendez-vous' })).toBeVisible();
    await expect(toast(page, MESSAGE)).toBeVisible();
    await expect(ligne(page, 2)).toContainText(MESSAGE);
    await expect(ligne(page, 2)).toContainText('Heure à choisir');
    await expect(ligne(page, 3)).toContainText('17:00 · Kevin');
  });

  for (const [titre, reponse] of [
    ['slot_unavailable sans `slot`', { status: 400, json: { error: 'Le salon ferme à cette heure-là.', code: 'slot_unavailable' } }],
    ['slots_too_far', { status: 400, json: { error: 'Le salon ferme à cette heure-là.', code: 'slots_too_far' } }],
  ]) {
    test(`refus sans ligne visée (${titre}) : étape 2, le message en tête, l'envoi peut repartir`, async ({ page, api }) => {
      let refuse = true;
      api.surcharger('POST', '/subscriptions', () => {
        if (!refuse) return undefined;
        refuse = false;
        return reponse;
      });
      await jusquaRecap(page);
      await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
      await expect(page.getByRole('heading', { name: 'Vos 4 rendez-vous' })).toBeVisible();
      await expect(page.getByRole('alert').filter({ hasText: 'Le salon ferme à cette heure-là.' })).toBeVisible();
      await page.getByRole('button', { name: 'Continuer' }).click();
      await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
      await expect(page.getByRole('heading', { name: 'Vos 4 RDV sont réservés' })).toBeVisible();
    });
  }

  test('renvoi après une coupure réseau : même clé d\'essai, un seul abonnement', async ({ page, api }) => {
    await jusquaRecap(page);
    // Réponse perdue : le serveur a bien créé l'abonnement, le téléphone ne le sait pas
    let coupe = true;
    api.surcharger('POST', '/subscriptions', (req) => {
      if (!coupe) return undefined;
      coupe = false;
      api.abonnements.traiter(req);
      return RESEAU_COUPE;
    });
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    await expect(toast(page, 'Connexion perdue : vos rendez-vous ont peut-être été enregistrés.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Votre abonnement' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Connexion perdue pendant l\'envoi' })).toBeVisible();

    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    await expect(page.getByRole('heading', { name: 'Vos 4 RDV sont réservés' })).toBeVisible();
    const [a, b] = envois(api);
    expect(envois(api)).toHaveLength(2);
    expect(b.corps.request_key).toBe(a.corps.request_key);
    expect(api.abonnements.lignes).toHaveLength(1);
  });

  test('too_many_upcoming : le message du serveur et le lien vers Mes rendez-vous', async ({ page, api }) => {
    api.tables.Appointment.push(rendezVous({ id: 'en-plus', client: CLIENT, barber: BARBERS.dom, prestations: [PRESTATIONS.coupe], date: jour(4), debut: '10:00' }));
    await jusquaRecap(page);
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    const alerte = page.getByRole('alert').filter({ hasText: 'vous en avez déjà 3 à venir (6 au plus)' });
    await expect(alerte).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Votre abonnement' })).toBeVisible();
    await alerte.getByRole('link', { name: 'Voir mes rendez-vous' }).click();
    await expect(page).toHaveURL(/\/appointments$/);
  });

  test('pending_exists à l\'envoi (pris ailleurs entre-temps) : le message du serveur et le lien vers Mes rendez-vous', async ({ page, api }) => {
    await jusquaRecap(page);
    abonnement(api, { barber: BARBERS.dom, jours: 30, heure: '10:00' });
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    const alerte = page.getByRole('alert').filter({ hasText: 'Vous avez déjà un abonnement à régler au salon' });
    await expect(alerte).toBeVisible();
    await expect(alerte.getByRole('link', { name: 'Voir mes rendez-vous' })).toHaveAttribute('href', '/appointments');
    expect(api.abonnements.lignes).toHaveLength(1);
  });

  test('abonnement à régler : prévenu dès l\'ouverture, le parcours ne va pas plus loin', async ({ page, api }) => {
    abonnement(api, { barber: BARBERS.dom, jours: 30, heure: '10:00' });
    await page.goto('/abonnement');
    const alerte = page.getByRole('alert').filter({ hasText: 'Vous avez déjà un abonnement à régler au salon' });
    await expect(alerte).toBeVisible();
    await expect(alerte.getByRole('link', { name: 'Voir mes rendez-vous' })).toHaveAttribute('href', '/appointments');
    await expect(page.getByRole('button', { name: 'Choisir mes 4 RDV' })).toBeDisabled();

    await page.goto(`/abonnement?service=${FORMULE.id}`);
    await expect(alerte).toBeVisible();
    await boutonJour(page, J1).click();
    await boutonHeure(page, '17:00').click();
    await expect(page.getByRole('button', { name: 'Proposer les 3 suivants' })).toBeDisabled();
    expect(envois(api)).toHaveLength(0);
  });

  test('abonnements illisibles à l\'ouverture : le parcours continue, le serveur a le dernier mot', async ({ page, api }) => {
    api.surcharger('GET', '/subscriptions/mine', () => RESEAU_COUPE);
    await jusquaRecap(page);
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    await expect(page.getByRole('heading', { name: 'Vos 4 RDV sont réservés' })).toBeVisible();
  });

  test('double clic sur « Continuer » : le récapitulatif s\'affiche, rien ne part', async ({ page, api }) => {
    await jusquaLignes(page);
    await expect(ligne(page, 4)).toBeVisible();
    await page.getByRole('button', { name: 'Continuer' }).dblclick();
    await expect(page.getByRole('heading', { name: 'Votre abonnement' })).toBeVisible();
    const reserver = page.getByRole('button', { name: 'Réserver mes 4 RDV' });
    await expect(reserver).toBeEnabled();
    expect(envois(api)).toHaveLength(0);
    await expect(page.getByRole('heading', { name: 'Vos 4 RDV sont réservés' })).toHaveCount(0);
    // Passée la garde, le bouton envoie, une seule fois
    await reserver.click();
    await expect(page.getByRole('heading', { name: 'Vos 4 RDV sont réservés' })).toBeVisible();
    expect(envois(api)).toHaveLength(1);
  });

  test('double clic sur « Proposer les 3 suivants » : les 4 RDV restent à l\'écran', async ({ page, api }) => {
    await page.goto(`/abonnement?service=${FORMULE.id}`);
    await boutonJour(page, J1).click();
    await boutonHeure(page, '17:00').click();
    await page.getByRole('button', { name: 'Proposer les 3 suivants' }).dblclick();
    await expect(ligne(page, 4)).toBeVisible();
    await apresLaGarde(page);
    await expect(page.getByRole('heading', { name: 'Vos 4 rendez-vous' })).toBeVisible();
    expect(envois(api)).toHaveLength(0);
  });

  test('un clic juste à l\'arrivée sur le récapitulatif ne tombe pas sur la barre du bas, le bouton ne pulse pas', async ({ page, api }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await jusquaLignes(page);
    await expect(ligne(page, 4)).toBeVisible();
    await page.getByRole('button', { name: 'Continuer' }).click();
    const reserver = page.getByRole('button', { name: 'Réserver mes 4 RDV' });
    await reserver.click({ force: true });
    await expect(page).toHaveURL(new RegExp(`/abonnement\\?service=${FORMULE.id}$`));
    await expect(page.getByRole('heading', { name: 'Votre abonnement' })).toBeVisible();
    expect(envois(api)).toHaveLength(0);
    await expect(page.locator('.pulse-cta')).toHaveCount(0);
    await expect(reserver).toBeEnabled();
    await expect(page.locator('.pulse-cta')).toHaveCount(0);
  });

  test('après le succès : « Voir mes rendez-vous » puis retour, jamais un écran vide', async ({ page }) => {
    await jusquaRecap(page);
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    await expect(page.getByRole('heading', { name: 'Vos 4 RDV sont réservés' })).toBeVisible();
    await page.getByRole('button', { name: 'Voir mes rendez-vous' }).click();
    await expect(page).toHaveURL(/\/appointments$/);
    await page.goBack();

    // Retour sur le parcours, recommencé à la première étape ; toucher une heure n'y change rien
    await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toBeVisible();
    await boutonJour(page, J1).click();
    await boutonHeure(page, '18:00', 'Soir').click();
    await expect(barre(page, /à 18:00 avec Kevin/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retour' })).toBeVisible();
    // L'abonnement qui vient d'être pris est à régler : dit tout de suite
    await expect(page.getByRole('alert').filter({ hasText: 'Vous avez déjà un abonnement à régler au salon' })).toBeVisible();
  });

  test('écran de succès rechargé : Mes rendez-vous, jamais un écran vide', async ({ page }) => {
    await jusquaRecap(page);
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    await expect(page.getByRole('heading', { name: 'Vos 4 RDV sont réservés' })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/appointments$/);
    await expect(page.getByText('Coupe 1 sur 4')).toBeVisible();
  });

  for (const [titre, aller] of [
    ['à l\'étape 2', jusquaLignes],
    ['au récapitulatif', jusquaRecap],
  ]) {
    test(`rechargement ${titre} : la première étape, et l'heure touchée n'y fait pas sauter`, async ({ page, api }) => {
      await aller(page);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toBeVisible();
      await boutonJour(page, J1).click();
      await boutonHeure(page, '17:00').click();
      await expect(barre(page, /à 17:00 avec Kevin/)).toBeVisible();
      await apresLaGarde(page);
      await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toBeVisible();
      await page.getByRole('button', { name: 'Proposer les 3 suivants' }).click();
      await expect(ligne(page, 4)).toContainText('17:00 · Kevin');
      expect(envois(api)).toHaveLength(0);
    });
  }

  test('page quittée pendant l\'envoi réussi : un simple message, jamais ramené sur le parcours', async ({ page, api }) => {
    let liberer;
    const attente = new Promise((resolve) => { liberer = resolve; });
    api.surcharger('POST', '/subscriptions', async () => { await attente; });
    await jusquaRecap(page);
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    await expect(page.getByRole('button', { name: 'Réservation…' })).toBeVisible();
    await page.getByRole('link', { name: 'Profil' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    liberer();
    await expect(toast(page, 'Vos 4 RDV sont réservés')).toBeVisible();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toHaveCount(0);
    expect(api.abonnements.lignes).toHaveLength(1);
    await toast(page, 'Vos 4 RDV sont réservés').getByRole('button', { name: 'Voir' }).click();
    await expect(page).toHaveURL(/\/appointments$/);
  });

  test('page quittée pendant un envoi refusé : le message du serveur, jamais ramené sur le parcours', async ({ page, api }) => {
    let liberer;
    const attente = new Promise((resolve) => { liberer = resolve; });
    api.surcharger('POST', '/subscriptions', async () => {
      await attente;
      return { status: 409, json: { error: 'Ce créneau vient d\'être réservé, choisissez-en un autre.', code: 'slot_unavailable', slot: 1, date: J2, start_time: '17:00' } };
    });
    await jusquaRecap(page);
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    await page.getByRole('link', { name: 'Profil' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    liberer();
    await expect(toast(page, 'Ce créneau vient d\'être réservé')).toBeVisible();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test('retour du navigateur : une étape en arrière, rien de perdu', async ({ page }) => {
    await jusquaRecap(page);
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Vos 4 rendez-vous' })).toBeVisible();
    await expect(ligne(page, 4)).toContainText('17:00 · Kevin');
    // Écran « Changer » : le retour le referme sans rien changer
    await page.getByRole('button', { name: 'Changer le rendez-vous 3' }).click();
    await expect(page.getByRole('heading', { name: 'Changer le rendez-vous 3' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Vos 4 rendez-vous' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toBeVisible();
    await expect(barre(page, /à 17:00 avec Kevin/)).toBeVisible();
    // Bouton retour de l'écran : pareil
    await page.getByRole('button', { name: 'Proposer les 3 suivants' }).click();
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toBeVisible();
  });

  test('retour depuis l\'écran de succès : Mes rendez-vous, jamais un second envoi', async ({ page, api }) => {
    await jusquaRecap(page);
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    await expect(page.getByRole('heading', { name: 'Vos 4 RDV sont réservés' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/appointments$/);
    expect(envois(api)).toHaveLength(1);
  });

  test('« Modifier » du récapitulatif : autre formule, créneaux à choisir de nouveau', async ({ page, api }) => {
    await jusquaRecap(page);
    await page.getByRole('button', { name: 'Modifier la formule' }).click();
    const choix = page.getByRole('group', { name: 'Choix de la formule' });
    await expect(choix.getByRole('button', { name: /4 coupes classiques/ })).toHaveAttribute('aria-pressed', 'true');
    await choix.getByRole('button', { name: /4 coupes premium/ }).click();
    await page.getByRole('button', { name: 'Choisir mes 4 RDV' }).click();
    await expect(page.getByText('4 coupes premium · 120 €')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Proposer les 3 suivants' })).toBeDisabled();
    await boutonHeure(page, '14:00').click();
    await page.getByRole('button', { name: 'Proposer les 3 suivants' }).click();
    await expect(ligne(page, 4)).toContainText('14:00 · Kevin');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    await expect(page.getByRole('heading', { name: 'Vos 4 RDV sont réservés' })).toBeVisible();
    expect(envois(api)[0].corps.service_id).toBe(PRESTATIONS_ABONNEMENT.premium.id);
  });

  test('formule inconnue dans l\'adresse : le choix de la formule, avec un mot', async ({ page }) => {
    await page.goto('/abonnement?service=srv-retiree');
    await expect(page.getByText('Cet abonnement n\'est plus proposé : choisissez-en un autre.')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Choix de la formule' }).getByRole('button')).toHaveCount(4);
  });

  test('aucune formule au catalogue : on le dit', async ({ page, api }) => {
    api.tables.Service.splice(0, api.tables.Service.length, ...api.tables.Service.filter((s) => !/^4 coupes/.test(s.name)));
    await page.goto('/abonnement');
    await expect(page.getByText('Aucun abonnement n\'est proposé pour le moment.')).toBeVisible();
  });

  test('formules impossibles à lire : l\'écran d\'erreur, jamais « aucun abonnement »', async ({ page, api }) => {
    let coupe = true;
    api.surcharger('GET', '/subscriptions/plans', () => (coupe ? RESEAU_COUPE : undefined));
    await page.goto('/abonnement');
    const erreur = page.getByRole('alert').filter({ hasText: 'Pas de connexion internet' });
    await expect(erreur).toBeVisible();
    await expect(page.getByText('Aucun abonnement n\'est proposé pour le moment.')).toHaveCount(0);
    coupe = false;
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByRole('group', { name: 'Choix de la formule' })).toBeVisible();
  });

  test('lignes des semaines suivantes impossibles à lire : l\'écran d\'erreur, puis la proposition', async ({ page, api }) => {
    await page.goto(`/abonnement?service=${FORMULE.id}`);
    await boutonJour(page, J1).click();
    let coupe = true;
    api.surcharger('GET', '/entities/Appointment', (req) => {
      const dates = req.q?.date;
      return coupe && Array.isArray(dates) && dates.includes(J3) ? RESEAU_COUPE : undefined;
    });
    await boutonHeure(page, '17:00').click();
    await page.getByRole('button', { name: 'Proposer les 3 suivants' }).click();
    const erreur = page.getByRole('alert').filter({ hasText: 'Pas de connexion internet' });
    await expect(erreur).toBeVisible({ timeout: 15_000 });
    coupe = false;
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(ligne(page, 3)).toContainText('17:00 · Kevin');
  });

  test('compte de l\'équipe : jusqu\'au récapitulatif, le bouton n\'envoie rien', async ({ page, api, connecter }) => {
    // Session du client ouverte par beforeEach : on la remplace par l'admin
    await page.addInitScript(() => { sessionStorage.removeItem('e2e-session-posee'); });
    await connecter(ADMIN);
    await page.goto(`/abonnement?service=${FORMULE.id}`);
    await expect(page.getByText('Les comptes de l\'équipe réservent depuis l\'agenda.')).toBeVisible();
    await expect(page.getByText('Choisissez votre barber pour voir ses créneaux.')).toBeVisible();
    await barbers(page).getByRole('button', { name: /Kevin$/ }).click();
    await boutonJour(page, J1).click();
    await boutonHeure(page, '17:00').click();
    await page.getByRole('button', { name: 'Proposer les 3 suivants' }).click();
    await expect(ligne(page, 4)).toBeVisible();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByRole('heading', { name: 'Votre abonnement' })).toBeVisible();
    await expect(page.getByText('Les comptes de l\'équipe réservent depuis l\'agenda.')).toBeVisible();
    await apresLaGarde(page);
    const reserver = page.getByRole('button', { name: 'Réserver mes 4 RDV' });
    await expect(reserver).toBeDisabled();
    await reserver.click({ force: true });
    await expect(page.getByRole('heading', { name: 'Votre abonnement' })).toBeVisible();
    expect(envois(api)).toHaveLength(0);
  });

  test('envoi refusé par le serveur (staff_account) : son message, tel quel, sur le récapitulatif', async ({ page, api }) => {
    const MESSAGE = 'Un compte de l\'équipe ne prend pas d\'abonnement : passez par l\'agenda.';
    api.surcharger('POST', '/subscriptions', () => ({ status: 403, json: { error: MESSAGE, code: 'staff_account' } }));
    await jusquaRecap(page);
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    await expect(page.getByRole('alert').filter({ hasText: MESSAGE })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Votre abonnement' })).toBeVisible();
    expect(envois(api)).toHaveLength(1);
  });
});

test.describe('Abonnements : drapeau en panne', () => {
  test.beforeEach(async ({ api, connecter }) => {
    ajouterFormules(api);
    await connecter(CLIENT);
  });

  const ECRAN = { timeout: 20_000 };

  test('/abonnement : l\'écran d\'erreur, jamais le catalogue, puis le retour du serveur', async ({ page, api }) => {
    const panne = pannePublique(api);
    await page.goto(`/abonnement?service=${FORMULE.id}`);
    const erreur = page.getByRole('alert').filter({ hasText: 'Impossible de charger les abonnements' });
    await expect(erreur).toBeVisible(ECRAN);
    await expect(page).toHaveURL(/\/abonnement\?/);
    panne.retablir();
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toBeVisible();
  });

  test('/abonnement : une fois relu, drapeau faux : retour au catalogue', async ({ page, api }) => {
    const panne = pannePublique(api);
    await page.goto('/abonnement');
    const erreur = page.getByRole('alert').filter({ hasText: 'Impossible de charger les abonnements' });
    await expect(erreur).toBeVisible(ECRAN);
    api.donnees.parametresPublics.features.subscriptions = false;
    panne.retablir();
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page).toHaveURL(/\/services$/);
  });

  test('/booking?services=<formule> : jamais une seule visite à 100 €, puis la redirection', async ({ page, api }) => {
    const panne = pannePublique(api);
    await page.goto(`/booking?services=${FORMULE.id}`);
    const erreur = page.getByRole('alert').filter({ hasText: 'Impossible de charger les abonnements' });
    await expect(erreur).toBeVisible(ECRAN);
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toHaveCount(0);
    await expect(page.getByText('100 €')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Confirmer le rendez-vous' })).toHaveCount(0);
    expect(api.requetesVers('POST', '/entities/Appointment')).toHaveLength(0);
    panne.retablir();
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page).toHaveURL(new RegExp(`/abonnement\\?service=${FORMULE.id}$`));
    await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toBeVisible();
  });

  test('/booking?services=<formule> : relu, drapeau faux : la réservation d\'avant', async ({ page, api }) => {
    const panne = pannePublique(api);
    await page.goto(`/booking?services=${FORMULE.id}`);
    const erreur = page.getByRole('alert').filter({ hasText: 'Impossible de charger les abonnements' });
    await expect(erreur).toBeVisible(ECRAN);
    api.donnees.parametresPublics.features.subscriptions = false;
    panne.retablir();
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(barre(page, '30 min · 100 €')).toBeVisible();
  });

  test('formule choisie dans le catalogue pendant la panne : même écran, puis /abonnement', async ({ page, api }) => {
    const panne = pannePublique(api);
    await page.goto('/booking');
    await expect(page.getByRole('heading', { name: 'Choisissez votre prestation' })).toBeVisible();
    await page.getByRole('button', { name: `Choisir : ${FORMULE.name}`, exact: true }).click();
    const erreur = page.getByRole('alert').filter({ hasText: 'Impossible de charger les abonnements' });
    await expect(erreur).toBeVisible(ECRAN);
    await expect(page.getByText('100 €')).toHaveCount(0);
    panne.retablir();
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page).toHaveURL(new RegExp(`/abonnement\\?service=${FORMULE.id}$`));
  });

  test('drapeau lu, formules illisibles : jamais une seule visite à 100 €', async ({ page, api }) => {
    let coupe = true;
    api.surcharger('GET', '/subscriptions/plans', () => (coupe ? { status: 503, json: { error: 'Service indisponible' } } : undefined));
    await page.goto(`/booking?services=${FORMULE.id}`);
    const erreur = page.getByRole('alert').filter({ hasText: 'Impossible de charger les abonnements' });
    await expect(erreur).toBeVisible(ECRAN);
    await expect(page.getByText('100 €')).toHaveCount(0);
    coupe = false;
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page).toHaveURL(new RegExp(`/abonnement\\?service=${FORMULE.id}$`));
  });

  test('une prestation ordinaire n\'est pas bloquée par la panne', async ({ page, api }) => {
    pannePublique(api);
    await page.goto(`/booking?services=${PRESTATIONS.coupe.id}`);
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(barre(page, '30 min · 25 €')).toBeVisible();
  });

  test('aucune carte, drapeau illisible : l\'écran d\'erreur, jamais « Pas encore de carte »', async ({ page, api }) => {
    const panne = pannePublique(api);
    await page.goto('/gift-cards');
    const erreur = page.getByRole('alert').filter({ hasText: 'Impossible de charger vos abonnements' });
    await expect(erreur).toBeVisible(ECRAN);
    await expect(page.getByRole('heading', { name: 'Pas encore de carte' })).toHaveCount(0);
    panne.retablir();
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByRole('heading', { name: 'Pas encore de carte' })).toBeVisible();
  });
});

test.describe('Abonnements : la carte', () => {
  test.beforeEach(async ({ api, connecter }) => {
    ajouterFormules(api);
    await connecter(CLIENT);
  });

  test('carte d\'abonnement : coupes, barre, QR, solde, prochain RDV', async ({ page, api }) => {
    const vue = abonnement(api, { statut: 'active' });
    const carte = api.tables.GiftCard.find((c) => String(c.id) === String(vue.card.id));
    carte.remaining_balance = 75;
    await page.goto('/gift-cards');
    await expect(page.getByRole('heading', { name: 'Ma carte d\'abonnement' })).toBeVisible();
    await expect(page.getByText('Abonnement', { exact: true })).toBeVisible();
    await expect(page.getByText('Carte Cadeau', { exact: true })).toHaveCount(0);
    await expect(page.getByText('3 coupes', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: '3 coupes sur 4' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'QR code de la carte' }).locator('svg')).toBeVisible();
    await expect(page.getByText('4 coupes classiques', { exact: true })).toBeVisible();
    await expect(page.getByText('75 €', { exact: true })).toBeVisible();
    await expect(page.getByText('25 € par coupe')).toBeVisible();
    await expect(page.getByText(carte.code, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Prochain RDV')).toBeVisible();
    await expect(page.getByText(new RegExp(`${echapper(libelleJour(J1))} · 17:00 · Kevin`, 'i'))).toBeVisible();
    // Aucune coupe à reprogrammer, et la carte n'est pas rangée deux fois
    await expect(page.getByRole('link', { name: 'Reprendre un RDV' })).toHaveCount(0);
    await expect(page.getByText(/^Actives/)).toHaveCount(0);
    await expect(page.getByText('Offrez une carte cadeau à un proche !')).toHaveCount(0);
  });

  test('une carte cadeau ordinaire reste comme avant, à côté de l\'abonnement', async ({ page, api }) => {
    abonnement(api, { statut: 'active' });
    api.tables.GiftCard.push({
      id: 'carte-ordinaire', code: 'DHB-CADO-TEST', amount: 50, remaining_balance: 50, status: 'validated', sender_email: CLIENT.email,
      sender_name: CLIENT.full_name, recipient_name: 'Léa', valid_until: jour(200), created_at: '2026-01-15T10:00:00.000Z',
    });
    await page.goto('/gift-cards');
    await expect(page.getByText('Actives (1)')).toBeVisible();
    await page.getByText('Léa', { exact: true }).click();
    await expect(page.getByText('Carte Cadeau', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Partager' })).toBeVisible();
  });

  test('abonnement à régler : montant et RDV, sans QR', async ({ page, api }) => {
    abonnement(api, {});
    await page.goto('/gift-cards');
    await expect(page.getByText('À régler au salon')).toBeVisible();
    await expect(page.getByText('100 €', { exact: true })).toBeVisible();
    await expect(page.getByText('4 coupes classiques', { exact: true })).toBeVisible();
    await expect(page.getByText(new RegExp(`Coupe 1 sur 4 · ${echapper(libelleJour(J1))} · 17:00 · Kevin`, 'i'))).toBeVisible();
    await expect(page.getByRole('img', { name: 'QR code de la carte' })).toHaveCount(0);
    await expect(page.locator('svg[height="112"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Pas encore de carte' })).toHaveCount(0);
  });

  test('abonnements impossibles à lire, aucune carte : l\'écran d\'erreur, jamais « Pas encore de carte »', async ({ page, api }) => {
    let coupe = true;
    api.surcharger('GET', '/subscriptions/mine', () => (coupe ? RESEAU_COUPE : undefined));
    await page.goto('/gift-cards');
    const erreur = page.getByRole('alert').filter({ hasText: 'Pas de connexion internet' });
    await expect(erreur).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Pas encore de carte' })).toHaveCount(0);
    coupe = false;
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByRole('heading', { name: 'Pas encore de carte' })).toBeVisible();
  });

  test('carte épuisée : dans l\'historique, au nom de la formule', async ({ page, api }) => {
    const vue = abonnement(api, { statut: 'active' });
    const carte = api.tables.GiftCard.find((c) => String(c.id) === String(vue.card.id));
    carte.remaining_balance = 0;
    carte.status = 'used';
    await page.goto('/gift-cards');
    await expect(page.getByText('Historique (1)')).toBeVisible();
    await page.getByText('4 coupes classiques', { exact: true }).click();
    await expect(page.getByText('0 coupe', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: '0 coupe sur 4' })).toBeVisible();
  });
});

test.describe('Abonnements : reprendre un abonnement depuis les cartes', () => {
  test.beforeEach(async ({ api, connecter }) => {
    ajouterFormules(api);
    await connecter(CLIENT);
  });

  const carteDe = (api, vue) => api.tables.GiftCard.find((c) => String(c.id) === String(vue.card.id));
  const lien = (page) => page.getByRole('link', { name: 'Reprendre un abonnement' });

  test('plus qu\'une coupe : le bouton est là, il mène à la même formule', async ({ page, api }) => {
    const vue = abonnement(api, { statut: 'active' });
    carteDe(api, vue).remaining_balance = 25;
    await page.goto('/gift-cards');
    await expect(page.getByText('Plus qu\'une coupe sur votre abonnement')).toBeVisible();
    await expect(lien(page)).toHaveAttribute('href', `/abonnement?service=${FORMULE.id}`);
    expect((await lien(page).boundingBox()).height).toBeGreaterThanOrEqual(44);
  });

  test('abonnement terminé : le bouton aussi, la carte dans l\'historique', async ({ page, api }) => {
    const vue = abonnement(api, { statut: 'active' });
    Object.assign(carteDe(api, vue), { remaining_balance: 0, status: 'used' });
    await page.goto('/gift-cards');
    await expect(page.getByText('Votre abonnement est terminé')).toBeVisible();
    await expect(page.getByText('Historique (1)')).toBeVisible();
    await lien(page).click();
    await expect(page).toHaveURL(new RegExp(`/abonnement\\?service=${FORMULE.id}$`));
    await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toBeVisible();
  });

  test('deux coupes ou plus, ou un abonnement à régler : pas de bouton', async ({ page, api }) => {
    const vue = abonnement(api, { statut: 'active' });
    carteDe(api, vue).remaining_balance = 50;
    await page.goto('/gift-cards');
    await expect(page.getByText('2 coupes', { exact: true })).toBeVisible();
    await expect(lien(page)).toHaveCount(0);

    carteDe(api, vue).remaining_balance = 25;
    abonnement(api, { barber: BARBERS.dom, jours: 30, heure: '10:00' });
    await page.goto('/gift-cards');
    await expect(page.getByText('À régler au salon')).toBeVisible();
    await expect(lien(page)).toHaveCount(0);
  });
});

test.describe('Abonnements : reprendre un RDV', () => {
  test.beforeEach(async ({ api, connecter }) => {
    ajouterFormules(api);
    await connecter(CLIENT);
  });

  for (const [titre, statut] of [['absence', 'no_show'], ['annulation', 'cancelled']]) {
    test(`après une ${titre} : la coupe reste, un RDV à reprendre, retour à la carte`, async ({ page, api }) => {
      const vue = abonnement(api, { statut: 'active' });
      const rdv = api.tables.Appointment.find((a) => a.subscription_id === vue.id && a.subscription_visit === 1);
      rdv.status = statut;
      await page.goto('/gift-cards');
      await expect(page.getByText('4 coupes', { exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Reprendre un RDV' }).click();
      await expect(page).toHaveURL(new RegExp(`/abonnement\\?reprendre=${vue.id}$`));

      await expect(page.getByRole('heading', { name: 'Reprendre un RDV' })).toBeVisible();
      await expect(page.getByText('4 coupes classiques · 30 min')).toBeVisible();
      await expect(barbers(page).getByRole('button', { name: /Kevin/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Réserver ce RDV' })).toBeDisabled();
      await boutonJour(page, jour(5)).click();
      await boutonHeure(page, '15:00').click();
      await page.getByRole('button', { name: 'Réserver ce RDV' }).click();

      await expect(page.getByRole('heading', { name: 'Votre RDV est réservé' })).toBeVisible();
      await expect(page.getByText(/Coupe 1 sur 4 · Kevin/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ajouter au calendrier' })).toBeVisible();
      const envoi = api.requetesVers('POST', `/subscriptions/${vue.id}/rebook`);
      expect(envoi).toHaveLength(1);
      expect(envoi[0].corps).toEqual({ employee_id: BARBERS.kevin.id, date: jour(5), start_time: '15:00' });

      await page.getByRole('button', { name: 'Retour à ma carte' }).click();
      await expect(page).toHaveURL(/\/gift-cards$/);
      await expect(page.getByRole('heading', { name: 'Ma carte d\'abonnement' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Reprendre un RDV' })).toHaveCount(0);
    });
  }

  test('abonnement à régler dont un RDV est annulé : reprise possible aussi', async ({ page, api }) => {
    const vue = abonnement(api, {});
    api.tables.Appointment.find((a) => a.subscription_id === vue.id && a.subscription_visit === 2).status = 'cancelled';
    await page.goto('/gift-cards');
    await expect(page.getByText('À régler au salon')).toBeVisible();
    await page.getByRole('link', { name: 'Reprendre un RDV' }).click();
    await expect(page.getByRole('heading', { name: 'Reprendre un RDV' })).toBeVisible();
  });

  test('créneau pris à l\'envoi : message, l\'heure est retirée, les créneaux relus', async ({ page, api }) => {
    const vue = abonnement(api, { statut: 'active' });
    api.tables.Appointment.find((a) => a.subscription_id === vue.id && a.subscription_visit === 1).status = 'cancelled';
    await page.goto(`/abonnement?reprendre=${vue.id}`);
    await boutonJour(page, jour(5)).click();
    await boutonHeure(page, '15:00').click();
    api.tables.Appointment.push(rdvAutre('pris-3', jour(5), '15:00'));
    await page.getByRole('button', { name: 'Réserver ce RDV' }).click();
    await expect(toast(page, 'Ce créneau vient d\'être réservé, choisissez-en un autre.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réserver ce RDV' })).toBeDisabled();
    await expect(boutonHeure(page, '15:30')).toBeVisible();
    await expect(boutonHeure(page, '15:00')).toHaveCount(0);
  });

  test('coupure réseau : l\'heure reste choisie, le renvoi ne crée rien de plus', async ({ page, api }) => {
    const vue = abonnement(api, { statut: 'active' });
    api.tables.Appointment.find((a) => a.subscription_id === vue.id && a.subscription_visit === 1).status = 'cancelled';
    let coupe = true;
    api.surcharger('POST', `/subscriptions/${vue.id}/rebook`, (req) => {
      if (!coupe) return undefined;
      coupe = false;
      api.abonnements.traiter(req);
      return RESEAU_COUPE;
    });
    await page.goto(`/abonnement?reprendre=${vue.id}`);
    await boutonJour(page, jour(5)).click();
    await boutonHeure(page, '15:00').click();
    await page.getByRole('button', { name: 'Réserver ce RDV' }).click();
    await expect(toast(page, 'Connexion perdue : votre rendez-vous a peut-être été enregistré.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réserver ce RDV' })).toBeEnabled();
    await page.getByRole('button', { name: 'Réserver ce RDV' }).click();
    await expect(page.getByRole('heading', { name: 'Votre RDV est réservé' })).toBeVisible();
    expect(api.tables.Appointment.filter((a) => a.subscription_id === vue.id && a.status !== 'cancelled')).toHaveLength(4);
  });

  test('tout est déjà réservé, ou abonnement d\'un autre : on le dit', async ({ page, api }) => {
    const vue = abonnement(api, { statut: 'active' });
    await page.goto(`/abonnement?reprendre=${vue.id}`);
    await expect(page.getByText('Tous vos rendez-vous sont déjà réservés')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Voir mes rendez-vous' })).toHaveAttribute('href', '/appointments');
    await expect(page.getByRole('link', { name: 'Reprendre un abonnement' })).toHaveCount(0);
    await page.goto('/abonnement?reprendre=abo-inconnu');
    await expect(page.getByText('Abonnement introuvable')).toBeVisible();
    await page.getByRole('link', { name: 'Voir mes cartes' }).click();
    await expect(page).toHaveURL(/\/gift-cards$/);
  });

  test('abonnement annulé : « Cet abonnement est fermé »', async ({ page, api }) => {
    const vue = abonnement(api, {});
    api.abonnements.lignes.find((l) => l.id === vue.id).status = 'cancelled';
    await page.goto(`/abonnement?reprendre=${vue.id}`);
    await expect(page.getByText('Cet abonnement est fermé')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réserver ce RDV' })).toHaveCount(0);
  });

  test('abonnement terminé : il le dit et propose d\'en reprendre un', async ({ page, api }) => {
    const vue = abonnement(api, { statut: 'active' });
    Object.assign(api.tables.GiftCard.find((c) => String(c.id) === String(vue.card.id)), { remaining_balance: 0, status: 'used' });
    await page.goto(`/abonnement?reprendre=${vue.id}`);
    await expect(page.getByText('Cet abonnement est terminé')).toBeVisible();
    await page.getByRole('link', { name: 'Reprendre un abonnement' }).click();
    await expect(page).toHaveURL(new RegExp(`/abonnement\\?service=${FORMULE.id}$`));
    await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toBeVisible();
  });

  test('validité dépassée : il le dit', async ({ page, api }) => {
    const vue = abonnement(api, { statut: 'active' });
    api.tables.GiftCard.find((c) => String(c.id) === String(vue.card.id)).valid_until = jour(-1);
    await page.goto(`/abonnement?reprendre=${vue.id}`);
    await expect(page.getByText('Vos coupes ne sont plus valables')).toBeVisible();
    await expect(page.getByText(new RegExp(`jusqu'au ${echapper(libelleJour(jour(-1)))}`))).toBeVisible();
  });

  test('page quittée pendant l\'envoi : un simple message', async ({ page, api }) => {
    const vue = abonnement(api, { statut: 'active' });
    api.tables.Appointment.find((a) => a.subscription_id === vue.id && a.subscription_visit === 1).status = 'cancelled';
    let liberer;
    const attente = new Promise((resolve) => { liberer = resolve; });
    api.surcharger('POST', `/subscriptions/${vue.id}/rebook`, async () => { await attente; });
    await page.goto(`/abonnement?reprendre=${vue.id}`);
    await boutonJour(page, jour(5)).click();
    await boutonHeure(page, '15:00').click();
    await page.getByRole('button', { name: 'Réserver ce RDV' }).click();
    await page.getByRole('link', { name: 'Profil' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    liberer();
    await expect(toast(page, 'Votre RDV est réservé.')).toBeVisible();
    await expect(page).toHaveURL(/\/profile$/);
  });
});

test.describe('Abonnements : « Comme la dernière fois » de l\'accueil', () => {
  test.beforeEach(async ({ api, connecter }) => {
    ajouterFormules(api);
    // Rien d'autre sur le compte que cet abonnement : ses RDV sont passés, ou annulés
    api.tables.Appointment = api.tables.Appointment.filter((r) => !['apt-proche-romain', 'apt-lointain-kevin', 'apt-passe-kevin'].includes(r.id));
    await connecter(CLIENT);
  });

  /** Abonnement dont seule la première coupe a eu lieu, il y a une semaine. */
  const passe = (api, reste = {}) => {
    const vue = abonnement(api, { jours: -7, statut: 'active', ...reste });
    for (const a of api.tables.Appointment) {
      if (a.subscription_id === vue.id && a.subscription_visit > 1) a.status = 'cancelled';
    }
    return vue;
  };
  const carte = (page) => page.locator('div.glass').filter({ hasText: 'Comme la dernière fois' });

  test('reprendre un RDV sur l\'abonnement, jamais un nouvel abonnement ni son prix', async ({ page, api }) => {
    const vue = passe(api);
    await page.goto('/');
    await expect(carte(page)).toContainText('Coupe 1 sur 4 · avec Kevin');
    await expect(carte(page)).not.toContainText('100 €');
    await expect(carte(page)).not.toContainText('4 coupes classiques');
    await carte(page).getByRole('link', { name: /Reprendre un RDV/ }).click();
    await expect(page).toHaveURL(new RegExp(`/abonnement\\?reprendre=${vue.id}$`));
    await expect(page.getByRole('heading', { name: 'Reprendre un RDV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réserver ce RDV' })).toBeVisible();
  });

  test('plus aucune coupe : le parcours le dit et propose d\'en reprendre un', async ({ page, api }) => {
    const vue = passe(api);
    Object.assign(api.tables.GiftCard.find((c) => String(c.id) === String(vue.card.id)), { remaining_balance: 0, status: 'used' });
    await page.goto('/');
    await carte(page).getByRole('link', { name: /Reprendre un RDV/ }).click();
    await expect(page.getByText('Cet abonnement est terminé')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reprendre un abonnement' })).toBeVisible();
  });

  test('drapeau faux : pas de prix, le lien d\'avant', async ({ page, api }) => {
    passe(api);
    api.donnees.parametresPublics.features.subscriptions = false;
    await page.goto('/');
    await expect(carte(page)).toContainText('Coupe 1 sur 4 · avec Kevin');
    await expect(carte(page)).not.toContainText('100 €');
    await expect(carte(page).getByRole('link', { name: /Réserver à nouveau/ })).toHaveAttribute('href', /\/booking\?/);
  });
});

test.describe('Abonnements : Mes rendez-vous et déplacement', () => {
  test.beforeEach(async ({ api, connecter }) => {
    ajouterFormules(api);
    await connecter(CLIENT);
  });

  test('« Coupe 2 sur 4 » à la place de la formule, jamais son prix', async ({ page, api }) => {
    abonnement(api, { jours: 8 });
    await page.goto('/appointments');
    await expect(page.getByText('Coupe 1 sur 4')).toBeVisible();
    await expect(page.getByText('Coupe 2 sur 4')).toBeVisible();
    await expect(page.getByText('4 coupes classiques')).toHaveCount(0);
    await expect(page.getByText('100€')).toHaveCount(0);
    await expect(page.getByText('25€')).toHaveCount(0);
    // Abonnement pas encore réglé : « À régler » sur son prochain RDV seulement
    await expect(page.getByText('À régler', { exact: true })).toHaveCount(1);
    // RDV ordinaire : rien ne change
    await expect(page.getByText('Coupe + Barbe')).toBeVisible();
  });

  test('annuler : la coupe reste, l\'action du message reprend un RDV', async ({ page, api }) => {
    const vue = abonnement(api, { jours: 8, statut: 'active' });
    await page.goto('/appointments');
    const carte = page.locator('div').filter({ has: page.getByText('Coupe 1 sur 4', { exact: true }) }).filter({ has: page.getByText('Barber', { exact: true }) }).last();
    await carte.getByRole('button', { name: 'Annuler' }).click();
    const fenetre = page.getByRole('dialog');
    await expect(fenetre.getByText('Coupe 1 sur 4')).toBeVisible();
    await expect(fenetre.getByText('25€')).toHaveCount(0);
    await fenetre.getByRole('button', { name: 'Non merci, je veux annuler' }).click();
    await expect(fenetre.getByText('La coupe reste sur votre abonnement.')).toBeVisible();
    await fenetre.getByRole('button', { name: 'Oui, annuler' }).click();
    await expect(toast(page, 'Rendez-vous annulé : la coupe reste sur votre abonnement')).toBeVisible();
    await toast(page, 'la coupe reste').getByRole('button', { name: 'Reprendre un RDV' }).click();
    await expect(page).toHaveURL(new RegExp(`/abonnement\\?reprendre=${vue.id}$`));
  });

  test('annuler le dernier RDV d\'un abonnement à régler : aucune promesse sur la coupe, il est fermé', async ({ page, api }) => {
    const vue = abonnement(api, { jours: 8 });
    for (const a of api.tables.Appointment) {
      if (a.subscription_id === vue.id && a.subscription_visit > 1) a.status = 'cancelled';
    }
    await page.goto('/appointments');
    const carte = page.locator('div').filter({ has: page.getByText('Coupe 1 sur 4', { exact: true }) }).filter({ has: page.getByText('Barber', { exact: true }) }).last();
    await carte.getByRole('button', { name: 'Annuler' }).click();
    const fenetre = page.getByRole('dialog');
    await fenetre.getByRole('button', { name: 'Non merci, je veux annuler' }).click();
    await expect(fenetre.getByText('il sera fermé, rien n\'est dû')).toBeVisible();
    await expect(fenetre.getByText('La coupe reste')).toHaveCount(0);
    await fenetre.getByRole('button', { name: 'Oui, annuler' }).click();
    await expect(toast(page, 'il est fermé. Rien n\'est dû.')).toBeVisible();
    await expect(toast(page, 'la coupe reste')).toHaveCount(0);
  });

  test('déplacer : reste sur /booking, sans changer de prestation, sans le prix de la formule', async ({ page, api }) => {
    const vue = abonnement(api, { jours: 8, statut: 'active' });
    const rdv = vue.appointments[1];
    await page.goto(`/booking?barber=${BARBERS.kevin.id}&services=${FORMULE.id}&reschedule=${rdv.id}`);
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(page).toHaveURL(/\/booking\?/);
    await expect(page.getByText('Coupe 2 sur 4')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Modifier', exact: true })).toHaveCount(0);
    await expect(page.getByText('100 €')).toHaveCount(0);
    await expect(barre(page, '30 min')).toBeVisible();
    await expect(barre(page, '€')).toHaveCount(0);

    await boutonJour(page, jour(11)).click();
    await boutonHeure(page, '15:00').click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByRole('heading', { name: 'Vérifiez et confirmez' })).toBeVisible();
    await expect(page.getByText('Coupe 2 sur 4')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Modifier les prestations' })).toHaveCount(0);
    await expect(page.getByText('Aucun supplément : ce rendez-vous reste sur votre abonnement.')).toBeVisible();
    await expect(page.getByText('100 €')).toHaveCount(0);
    await expect(page.getByText('Total', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();
    await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
    const corps = api.requetesVers('POST', '/entities/Appointment')[0].corps;
    expect(corps).toMatchObject({ reschedule_of: rdv.id, total_price: 25, date: jour(11), start_time: '15:00' });
    expect(corps.services[0].price).toBe(25);

    // L'ancien RDV est annulé puis relu : l'écran de succès reste là, ajout au calendrier compris (il
    // sautait à la liste, « ne peut plus être déplacé », dès cette relecture)
    await expect.poll(() => api.tables.Appointment.find((a) => a.id === rdv.id).status).toBe('cancelled');
    await page.waitForTimeout(2000);
    await expect(toast(page, 'Ce rendez-vous ne peut plus être déplacé.')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Google Agenda' })).toBeVisible();
    await expect(page).toHaveURL(/\/booking\?/);
  });

  test('retour et « Ne pas déplacer » : Mes rendez-vous, jamais le catalogue ni un nouvel abonnement', async ({ page, api }) => {
    const vue = abonnement(api, { jours: 8, statut: 'active' });
    const lien = `/booking?barber=${BARBERS.kevin.id}&services=${FORMULE.id}&reschedule=${vue.appointments[1].id}`;
    await page.goto(lien);
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(page.getByText('Déplacement de votre rendez-vous')).toBeVisible();
    await page.getByRole('button', { name: 'Ne pas déplacer' }).click();
    await expect(page).toHaveURL(/\/appointments$/);

    await page.goto(lien);
    await expect(page.getByText('Déplacement de votre rendez-vous')).toBeVisible();
    await page.getByRole('button', { name: 'Étape précédente' }).click();
    await expect(page).toHaveURL(/\/appointments$/);
    await expect(page.getByRole('heading', { name: 'Choisissez votre prestation' })).toHaveCount(0);
  });

  test('RDV à déplacer illisible, formule dans le lien : ni nouvel abonnement, ni prix, retour à la liste', async ({ page, api }) => {
    const vue = abonnement(api, { jours: 8, statut: 'active' });
    api.surcharger('GET', '/entities/Appointment', (req) => (req.q?.client_email ? RESEAU_COUPE : undefined));
    await page.goto(`/booking?barber=${BARBERS.kevin.id}&services=${FORMULE.id}&reschedule=${vue.appointments[1].id}`);
    const bandeau = page.getByRole('status').filter({ hasText: 'Impossible de vérifier le rendez-vous à déplacer' });
    await expect(bandeau).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('100 €')).toHaveCount(0);
    await bandeau.getByRole('button', { name: 'Retour à mes rendez-vous' }).click();
    await expect(page).toHaveURL(/\/appointments$/);
    expect(api.abonnements.lignes).toHaveLength(1);
  });

  test('drapeau faux, ancien RDV en cours de lecture : le prix et « Modifier » d\'avant', async ({ page, api }) => {
    api.donnees.parametresPublics.features.subscriptions = false;
    const rdv = rendezVous({ id: 'ancien-formule', client: CLIENT, barber: BARBERS.kevin, prestations: [FORMULE], date: jour(8), debut: '15:00' });
    api.tables.Appointment.push(rdv);
    let liberer;
    const attente = new Promise((resolve) => { liberer = resolve; });
    api.surcharger('GET', '/entities/Appointment', async (req) => { if (req.q?.client_email) await attente; });
    await page.goto(`/booking?barber=${BARBERS.kevin.id}&services=${FORMULE.id}&reschedule=${rdv.id}`);
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(barre(page, '30 min · 100 €')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Modifier', exact: true })).toBeVisible();
    liberer();
    await expect(page.getByText('Déplacement de votre rendez-vous')).toBeVisible();
    await expect(barre(page, '30 min · 100 €')).toBeVisible();
  });

  test('formule retirée du catalogue : jamais une autre prestation, le salon s\'en occupe', async ({ page, api }) => {
    const vue = abonnement(api, { jours: 8, statut: 'active' });
    api.tables.Service.splice(api.tables.Service.findIndex((s) => s.id === FORMULE.id), 1);
    await page.goto(`/booking?barber=${BARBERS.kevin.id}&services=${FORMULE.id}&reschedule=${vue.appointments[1].id}`);
    await expect(page.getByRole('heading', { name: 'Déplacer ce rendez-vous' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'ne peut pas être déplacé en ligne' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Choisir :/ })).toHaveCount(0);
  });

  test('drapeau faux, RDV d\'abonnement déjà pris : toujours « Coupe 2 sur 4 », jamais le prix de la formule', async ({ page, api }) => {
    const vue = abonnement(api, { jours: 8, statut: 'active' });
    api.donnees.parametresPublics.features.subscriptions = false;
    await page.goto('/appointments');
    await expect(page.getByText('Coupe 2 sur 4')).toBeVisible();
    await page.goto(`/booking?barber=${BARBERS.kevin.id}&services=${FORMULE.id}&reschedule=${vue.appointments[1].id}`);
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(page.getByText('Coupe 2 sur 4')).toBeVisible();
    await expect(page.getByText('100 €')).toHaveCount(0);
  });

  test('déplacement en un geste vers un créneau proposé : le prix de la visite, pas celui de la formule', async ({ page, api }) => {
    const vue = abonnement(api, { jours: 8, statut: 'active' });
    await page.goto('/appointments');
    const carte = page.locator('div').filter({ has: page.getByText('Coupe 1 sur 4', { exact: true }) }).filter({ has: page.getByText('Barber', { exact: true }) }).last();
    await carte.getByRole('button', { name: 'Déplacer' }).click();
    const fenetre = page.getByRole('dialog');
    await fenetre.getByRole('button', { name: /^\d\d:\d\d/ }).first().click();
    await fenetre.getByRole('button', { name: /^Déplacer au / }).click();
    await expect(toast(page, 'Rendez-vous déplacé au')).toBeVisible();
    const corps = api.requetesVers('POST', '/entities/Appointment')[0].corps;
    expect(corps.reschedule_of).toBe(vue.appointments[0].id);
    expect(corps.total_price).toBe(25);
    expect(corps.services[0].price).toBe(25);
  });

  test('lien de déplacement d\'une formule qui ne se déplace plus : retour à la liste, avec un mot', async ({ page }) => {
    await page.goto(`/booking?services=${FORMULE.id}&reschedule=apt-inconnu`);
    await expect(toast(page, 'Ce rendez-vous ne peut plus être déplacé.')).toBeVisible();
    await expect(page).toHaveURL(/\/appointments$/);
  });

  test('déplacer depuis la liste : le lien de la fenêtre reste sur /booking', async ({ page, api }) => {
    abonnement(api, { jours: 8, statut: 'active' });
    await page.goto('/appointments');
    const carte = page.locator('div').filter({ has: page.getByText('Coupe 1 sur 4', { exact: true }) }).filter({ has: page.getByText('Barber', { exact: true }) }).last();
    await carte.getByRole('button', { name: 'Déplacer' }).click();
    const fenetre = page.getByRole('dialog');
    await expect(fenetre.getByText('Coupe 1 sur 4')).toBeVisible();
    await fenetre.getByRole('button', { name: 'Choisir une autre date' }).click();
    await expect(page).toHaveURL(/\/booking\?.*reschedule=/);
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(page.getByText('100 €')).toHaveCount(0);
  });
});

test.describe('Abonnements : mise en page', () => {
  test.beforeEach(async ({ api, connecter }) => {
    ajouterFormules(api);
    await connecter(CLIENT);
  });

  for (const largeur of [320, 390]) {
    test(`aucun défilement horizontal à ${largeur} px, de la formule au succès`, async ({ page, api }) => {
      await page.setViewportSize({ width: largeur, height: 720 });
      await page.goto('/services');
      await expect(page.getByText('25 € la coupe · 30 min par visite').first()).toBeVisible();
      await attendreSansDebordement(page, `catalogue ${largeur}`);

      await page.goto('/abonnement');
      await expect(page.getByRole('heading', { name: 'Comment ça marche' })).toBeVisible();
      await attendreSansDebordement(page, `formules ${largeur}`);
      await expect(page.getByRole('button', { name: 'Choisir mes 4 RDV' })).toBeInViewport();

      await jusquaLignes(page);
      await expect(ligne(page, 4)).toBeVisible();
      await attendreSansDebordement(page, `4 RDV ${largeur}`);
      await page.getByRole('button', { name: 'Changer le rendez-vous 2' }).click();
      await expect(page.getByRole('heading', { name: 'Changer le rendez-vous 2' })).toBeVisible();
      await attendreSansDebordement(page, `changer ${largeur}`);
      await page.goBack();

      await page.getByRole('button', { name: 'Continuer' }).click();
      await expect(page.getByRole('heading', { name: 'Votre abonnement' })).toBeVisible();
      await attendreSansDebordement(page, `récapitulatif ${largeur}`);
      await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
      await expect(page.getByRole('heading', { name: 'Vos 4 RDV sont réservés' })).toBeVisible();
      await attendreSansDebordement(page, `succès ${largeur}`);
      await page.getByRole('region', { name: 'Dans Mes rendez-vous' }).getByRole('button', { name: 'Ajouter au calendrier' }).first().click();
      await attendreSansDebordement(page, `calendrier ${largeur}`);

      // Abonnement réservé, à régler : la carte, puis Mes rendez-vous
      await page.goto('/gift-cards');
      await expect(page.getByText('À régler au salon')).toBeVisible();
      await attendreSansDebordement(page, `à régler ${largeur}`);
      await page.goto('/appointments');
      await expect(page.getByText('Coupe 1 sur 4')).toBeVisible();
      await attendreSansDebordement(page, `rendez-vous ${largeur}`);
      expect(api.abonnements.lignes).toHaveLength(1);
    });

    test(`la carte tient à ${largeur} px : coupes, QR et textes dans le cadre, zones de 44 px`, async ({ page, api }) => {
      await page.setViewportSize({ width: largeur, height: 720 });
      const vue = abonnement(api, { prestation: PRESTATIONS_ABONNEMENT.barbe, statut: 'active' });
      api.tables.Appointment.find((a) => a.subscription_id === vue.id && a.subscription_visit === 4).status = 'cancelled';
      await page.goto('/gift-cards');
      await expect(page.getByRole('img', { name: 'QR code de la carte' })).toBeVisible();
      await attendreSansDebordement(page, `carte ${largeur}`);
      const lien = page.getByRole('link', { name: 'Reprendre un RDV' });
      expect((await lien.boundingBox()).height).toBeGreaterThanOrEqual(44);

      // Rien ne sort du recto ni du verso (ratio fixe) : le texte le plus bas reste dans le cadre
      const debord = await page.evaluate(() => [...document.querySelectorAll('[style*="aspect-ratio"]')].map((cadre) => {
        const boite = cadre.getBoundingClientRect();
        return [...cadre.querySelectorAll('p, svg')].some((el) => {
          const r = el.getBoundingClientRect();
          return r.bottom > boite.bottom + 0.5 || r.right > boite.right + 0.5;
        });
      }));
      expect(debord).toEqual(debord.map(() => false));
    });
  }

  test('zones touchables des écrans du parcours : 44 px au moins', async ({ page }) => {
    await jusquaLignes(page);
    await expect(ligne(page, 4)).toBeVisible();
    for (const nom of ['Changer le rendez-vous 1', 'Retour']) {
      expect((await page.getByRole('button', { name: nom }).boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: 'Continuer' }).click();
    expect((await page.getByRole('button', { name: 'Modifier la formule' }).boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    const bouton = page.getByRole('button', { name: 'Ajouter au calendrier' }).first();
    expect((await bouton.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await bouton.click();
    expect((await page.getByRole('button', { name: 'Google Agenda' }).first().boundingBox()).height).toBeGreaterThanOrEqual(44);
  });

  test('1366 px : le parcours se fait à la souris, la bande de jours défile à la molette', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 800 });
    await page.goto('/abonnement');
    await page.getByRole('group', { name: 'Choix de la formule' }).getByRole('button', { name: /4 coupes classiques/ }).click();
    await page.getByRole('button', { name: 'Choisir mes 4 RDV' }).click();
    await expect(page.getByRole('heading', { name: 'Votre premier RDV' })).toBeVisible();
    await attendreSansDebordement(page, 'premier RDV 1366');

    const region = page.getByRole('region', { name: 'Choix du jour' });
    const bande = region.locator('[data-day]').first().locator('..');
    await bande.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => bande.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

    await boutonJour(page, J1).click();
    await boutonHeure(page, '17:00').click();
    await page.getByRole('button', { name: 'Proposer les 3 suivants' }).click();
    await page.getByRole('button', { name: 'Changer le rendez-vous 3' }).click();
    await boutonHeure(page, '16:00').click();
    await page.getByRole('button', { name: 'Garder ce créneau' }).click();
    await expect(ligne(page, 3)).toContainText('16:00 · Kevin');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Réserver mes 4 RDV' }).click();
    await expect(page.getByRole('heading', { name: 'Vos 4 RDV sont réservés' })).toBeVisible();
    await attendreSansDebordement(page, 'succès 1366');
  });
});
