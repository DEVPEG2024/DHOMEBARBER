// Audit de l'agenda de l'équipe (24 oct. 2026, agent D) : bugs trouvés et corrigés dans
// l'agenda (/admin/agenda) et « Mon espace » des barbers (/admin/me). Chaque test échouait avant
// la correction. Horloge figée au mardi de référence, 10 h (Paris).
import { test, expect } from './support/test.js';
import { ADMIN, BARBERS, CLIENT, PRESTATIONS, RDV, rendezVous } from './support/donnees.js';
import { jour } from './support/temps.js';
import { toast } from './support/outils.js';

const colonne = (page, barber) => page.locator(`[data-drop-column="${barber.id}"]`);

/**
 * Last Minute automatique encore libre (serveur, lib/lastMinuteAuto.js, depuis le 22 oct. 2026) :
 * chaque demi-heure libre d'un barber dans les 6 h devient un Last Minute de 40 min.
 */
const lastMinuteAuto = (id, barber, date, debut, finCreneau) => rendezVous({
  id, barber, prestations: [], date, debut, statut: 'last_minute', end_time: finCreneau, total_duration: 40,
  client_name: 'Last Minute', client_email: '', internal_notes: 'Créneau libre publié automatiquement',
});

/** Écritures faites sur une ligne. */
const ecritures = (api, methode, id) => api.requetesVers(methode, `/entities/Appointment/${id}`);

async function ouvrirAjoutClient(page) {
  await page.getByRole('button', { name: 'Ajouter un client' }).click();
  const fenetre = page.getByRole('dialog', { name: /Ajouter un client/ });
  await expect(fenetre).toBeVisible();
  return fenetre;
}

test.describe('Agenda : rendez-vous posé sur un Last Minute libre', () => {
  test.beforeEach(async ({ connecter, api }) => {
    await connecter(ADMIN);
    // Kevin est libre à 15:00 : le serveur y a publié un Last Minute automatique
    api.tables.Appointment.push(lastMinuteAuto('lm-kevin-15', BARBERS.kevin, jour(0), '15:00', '15:40'));
  });

  test('« Ajouter un client » à l\'heure d\'un Last Minute : accepté, le Last Minute est retiré', async ({ page, api }) => {
    await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
    await expect(colonne(page, BARBERS.kevin)).toContainText('15:00 Last Minute');
    const fenetre = await ouvrirAjoutClient(page);
    await fenetre.getByRole('button', { name: 'Aucun compte (nom libre)' }).click();
    await fenetre.getByLabel('Nom du client').fill('Paul Appel');
    await fenetre.locator('#walkin-barber').selectOption(BARBERS.kevin.id);
    await fenetre.locator('#walkin-time').fill('15:00');
    await fenetre.getByRole('button', { name: /^Coupe\s*30 min/ }).click();

    // Le Last Minute n'occupe pas le créneau (le serveur l'accepte, index hors last_minute) : ni
    // refus « commence déjà à 15:00 », ni « Chevauche Last Minute », mais l'annonce de son retrait
    await expect(fenetre.getByText(/commence déjà à 15:00/)).toHaveCount(0);
    await expect(fenetre.getByText(/Chevauche/)).toHaveCount(0);
    await expect(fenetre.getByText('Le Last Minute de 15:00 – 15:40 sera retiré de l\'agenda (créneau pris).')).toBeVisible();
    await fenetre.getByRole('button', { name: 'Ajouter le client' }).click();
    await expect(toast(page, 'Paul Appel ajouté à 15:00 avec Kevin')).toBeVisible();

    expect(api.requetesVers('POST', '/entities/Appointment').at(-1).corps)
      .toMatchObject({ client_name: 'Paul Appel', employee_id: BARBERS.kevin.id, date: jour(0), start_time: '15:00', end_time: '15:30' });
    // Last Minute retiré : contrôle « encore libre » d'abord (un client l'a peut-être repris), puis suppression
    await expect.poll(() => ecritures(api, 'DELETE', 'lm-kevin-15').length).toBe(1);
    expect(ecritures(api, 'PUT', 'lm-kevin-15').map((r) => r.corps)).toEqual([{ if_free_last_minute: true }]);
    await expect(colonne(page, BARBERS.kevin)).not.toContainText('15:00 Last Minute');
    await expect(colonne(page, BARBERS.kevin).getByRole('button', { name: /Paul Appel/ })).toBeVisible();
  });

  test('Last Minute repris par un client entre-temps : jamais supprimé', async ({ page, api }) => {
    // Le serveur répond 409 au contrôle « encore libre » (if_free_last_minute)
    api.surcharger('PUT', '/entities/Appointment/lm-kevin-15', (req) => (req.corps?.if_free_last_minute
      ? { status: 409, json: { error: 'Un client vient de réserver ce créneau.' } } : undefined));
    await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
    const fenetre = await ouvrirAjoutClient(page);
    await fenetre.getByRole('button', { name: 'Aucun compte (nom libre)' }).click();
    await fenetre.getByLabel('Nom du client').fill('Paul Appel');
    await fenetre.locator('#walkin-barber').selectOption(BARBERS.kevin.id);
    await fenetre.locator('#walkin-time').fill('15:10');
    await fenetre.getByRole('button', { name: /^Coupe\s*30 min/ }).click();
    await fenetre.getByRole('button', { name: 'Ajouter le client' }).click();
    await expect(toast(page, 'Paul Appel ajouté à 15:10 avec Kevin')).toBeVisible();
    await expect.poll(() => ecritures(api, 'PUT', 'lm-kevin-15').length).toBe(1);
    expect(ecritures(api, 'DELETE', 'lm-kevin-15')).toHaveLength(0);
  });

  test('glisser-déposer à la souris d\'un rendez-vous sur l\'heure du Last Minute : déplacé, Last Minute retiré', async ({ page, api }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
    const carte = colonne(page, BARBERS.kevin).getByRole('button', { name: /Nina Roche/ });
    await carte.scrollIntoViewIfNeeded();
    const boite = await carte.boundingBox();
    // Vue Jour : 80 px par heure, Nina (14:00) descend d'une heure
    await page.mouse.move(boite.x + boite.width / 2, boite.y + 6);
    await page.mouse.down();
    await page.mouse.move(boite.x + boite.width / 2, boite.y + 26, { steps: 4 });
    await page.mouse.move(boite.x + boite.width / 2, boite.y + 86, { steps: 8 });
    await page.mouse.up();

    const fenetre = page.getByRole('dialog', { name: /Déplacer le rendez-vous/ });
    await expect(fenetre).toBeVisible();
    await expect(fenetre).toContainText('15:00 – 15:45');
    await expect(fenetre.getByText(/commence déjà/)).toHaveCount(0);
    await expect(fenetre.getByText('Le Last Minute de 15:00 – 15:40 sera retiré de l\'agenda (créneau pris).')).toBeVisible();
    await fenetre.getByRole('button', { name: 'Déplacer', exact: true }).click();
    await expect(toast(page, 'Rendez-vous déplacé · client prévenu')).toBeVisible();
    expect(ecritures(api, 'PUT', RDV.kevinNina().id).at(-1).corps)
      .toMatchObject({ start_time: '15:00', end_time: '15:45', employee_id: BARBERS.kevin.id, notify_client: true });
    await expect.poll(() => ecritures(api, 'DELETE', 'lm-kevin-15').length).toBe(1);
  });

  test('« Modifier / déplacer » vers l\'heure du Last Minute : enregistré, Last Minute retiré', async ({ page, api }) => {
    await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
    await colonne(page, BARBERS.kevin).getByRole('button', { name: /Nina Roche/ }).click();
    const fiche = page.getByRole('dialog', { name: 'Détails du rendez-vous' });
    await fiche.getByRole('button', { name: 'Modifier / déplacer' }).click();
    const formulaire = page.getByRole('dialog', { name: 'Modifier le rendez-vous' });
    await formulaire.locator('#apt-time').fill('15:00');
    await expect(formulaire.getByText(/commence déjà/)).toHaveCount(0);
    await expect(formulaire.getByText('Le Last Minute de 15:00 – 15:40 sera retiré de l\'agenda (créneau pris).')).toBeVisible();
    await formulaire.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(toast(page, 'Rendez-vous déplacé')).toBeVisible();
    expect(ecritures(api, 'PUT', RDV.kevinNina().id).at(-1).corps).toMatchObject({ start_time: '15:00', end_time: '15:45' });
    await expect.poll(() => ecritures(api, 'DELETE', 'lm-kevin-15').length).toBe(1);
  });
});

/** Last Minute automatique resté libre et passé « non pris » par l'agenda (fin + 15 min). */
const lastMinuteNonPris = (id, barber, date, debut, finCreneau) => ({
  ...lastMinuteAuto(id, barber, date, debut, finCreneau),
  status: 'no_show', cancellation_reason: 'Personne n\'a pris le créneau last minute',
});

test.describe('Agenda : Last Minute non pris et chevauchements', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('Last Minute non pris : masqués par défaut comme les annulés, visibles avec « Annulés »', async ({ page, api }) => {
    // Hier : trois demi-heures restées libres chez Kevin (automatiques non pris), un vrai client à 11:00
    api.tables.Appointment.push(
      lastMinuteNonPris('lm-np-1', BARBERS.kevin, jour(-1), '09:00', '09:40'),
      lastMinuteNonPris('lm-np-2', BARBERS.kevin, jour(-1), '10:00', '10:40'),
      lastMinuteNonPris('lm-np-3', BARBERS.kevin, jour(-1), '12:00', '12:40'),
      rendezVous({ id: 'apt-hier', client: { full_name: 'Hugo Lenoir', email: 'hugo@exemple.fr', phone: '' }, barber: BARBERS.kevin, prestations: [PRESTATIONS.coupe], date: jour(-1), debut: '11:00' }),
    );
    await page.goto(`/admin/agenda?view=day&date=${jour(-1)}`);
    await expect(colonne(page, BARBERS.kevin).getByRole('button', { name: /Hugo Lenoir/ })).toBeVisible();
    await expect(colonne(page, BARBERS.kevin).getByRole('button', { name: /Last Minute/ })).toHaveCount(0);
    const puce = page.getByRole('button', { name: 'Annulés (3)' });
    await puce.click();
    await expect(colonne(page, BARBERS.kevin).getByRole('button', { name: /Last Minute/ })).toHaveCount(3);
  });

  test('vue Mois sur ordinateur : les Last Minute non pris ne repoussent plus les vrais rendez-vous', async ({ page, api }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    api.tables.Appointment.push(
      lastMinuteNonPris('lm-np-1', BARBERS.dom, jour(-1), '09:00', '09:40'),
      lastMinuteNonPris('lm-np-2', BARBERS.kevin, jour(-1), '09:00', '09:40'),
      lastMinuteNonPris('lm-np-3', BARBERS.romain, jour(-1), '09:30', '10:10'),
      rendezVous({ id: 'apt-hier', client: { full_name: 'Hugo Lenoir', email: 'hugo@exemple.fr', phone: '' }, barber: BARBERS.kevin, prestations: [PRESTATIONS.coupe], date: jour(-1), debut: '16:00' }),
    );
    await page.goto(`/admin/agenda?view=month&date=${jour(0)}`);
    // Lignes du jour (tablette et ordinateur) : le vrai rendez-vous, aucune ligne « Last Minute »
    await expect(page.getByRole('button', { name: '16:00 Hugo Lenoir', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^\d{2}:\d{2} Last Minute$/ })).toHaveCount(0);
    await expect(page.getByText(/^\+\d+ autres$/)).toHaveCount(0);
  });

  test('vue Jour : un Last Minute posé sur l\'heure d\'un client ne recouvre plus sa carte', async ({ page, api }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    // Last Minute posé par l'équipe à 14:00 chez Kevin, où Nina a rendez-vous (saisie d'avant la correction)
    api.tables.Appointment.push(lastMinuteAuto('lm-sur-nina', BARBERS.kevin, jour(0), '14:00', '14:30'));
    await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
    const nina = colonne(page, BARBERS.kevin).getByRole('button', { name: /Nina Roche/ });
    const lm = colonne(page, BARBERS.kevin).getByRole('button', { name: /14:00 Last Minute/ });
    await nina.scrollIntoViewIfNeeded();
    const a = await nina.boundingBox();
    const b = await lm.boundingBox();
    // Côte à côte, sans se recouvrir
    expect(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), 'cartes superposées').toBeLessThanOrEqual(0);
    // Le milieu de la carte de Nina ouvre bien la fiche de Nina
    await page.mouse.click(a.x + a.width / 2, a.y + a.height / 2);
    await expect(page.getByRole('dialog', { name: 'Détails du rendez-vous' })).toContainText('Nina Roche');
  });
});

test.describe('Agenda sur ordinateur : clic sur une case vide', () => {
  test.use({ viewport: { width: 1366, height: 900 } });
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('vue Jour : un clic sur une case vide ouvre « Ajouter un client » avec ce barber et cette heure', async ({ page, api }) => {
    await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
    const col = colonne(page, BARBERS.dom);
    await expect(col).toContainText('Jules Martin');
    const boite = await col.boundingBox();
    // 80 px par heure à partir de 07:00 : un clic à 16:10 propose 16:00
    await page.mouse.click(boite.x + boite.width / 2, boite.y + 9 * 80 + 14);
    const fenetre = page.getByRole('dialog', { name: /Ajouter un client/ });
    await expect(fenetre).toBeVisible();
    await expect(fenetre.locator('#walkin-barber')).toHaveValue(BARBERS.dom.id);
    await expect(fenetre.locator('#walkin-date')).toHaveValue(jour(0));
    await expect(fenetre.locator('#walkin-time')).toHaveValue('16:00');
    await fenetre.getByRole('button', { name: 'Aucun compte (nom libre)' }).click();
    await fenetre.getByLabel('Nom du client').fill('Paul Appel');
    await fenetre.getByRole('button', { name: /^Coupe\s*30 min/ }).click();
    await fenetre.getByRole('button', { name: 'Ajouter le client' }).click();
    await expect(toast(page, 'Paul Appel ajouté à 16:00 avec Dom')).toBeVisible();
    expect(api.requetesVers('POST', '/entities/Appointment').at(-1).corps)
      .toMatchObject({ employee_id: BARBERS.dom.id, date: jour(0), start_time: '16:00', status: 'confirmed' });
    // Aucune pause créée par le clic
    expect(api.requetesVers('POST', '/entities/Appointment').filter((r) => r.corps?.status === 'break')).toHaveLength(0);
  });

  test('vue Jour : une pause tracée à la souris par erreur s\'annule depuis la notification', async ({ page, api }) => {
    await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
    const col = colonne(page, BARBERS.romain);
    await expect(col).toContainText('Camille Test');
    const boite = await col.boundingBox();
    const x = boite.x + boite.width / 2;
    await page.mouse.move(x, boite.y + 5 * 80 + 2);
    await page.mouse.down();
    await page.mouse.move(x, boite.y + 5 * 80 + 30, { steps: 4 });
    await page.mouse.move(x, boite.y + 5 * 80 + 42, { steps: 2 });
    await page.mouse.up();
    const note = toast(page, 'Pause ajoutée : 12:00 – 12:30');
    await expect(note).toBeVisible();
    const pause = api.requetesVers('POST', '/entities/Appointment').at(-1);
    expect(pause.corps).toMatchObject({ status: 'break', employee_id: BARBERS.romain.id, start_time: '12:00', end_time: '12:30' });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await note.getByRole('button', { name: 'Annuler' }).click();
    await expect(toast(page, 'Pause supprimée')).toBeVisible();
    expect(api.requetesVers('DELETE', /^\/entities\/Appointment\/appointment-e2e-\d+$/)).toHaveLength(1);
  });
});

test.describe('« Mon espace » d\'un barber', () => {
  const KEVIN = {
    id: 'user-kevin', email: 'kevin.compte@dhomebarber.fr', full_name: 'Kevin Barber', phone: '',
    role: 'barber', employee_id: BARBERS.kevin.id, permissions: ['agenda'],
  };

  test('un rendez-vous annulé dans l\'agenda n\'est plus « Prochain client » au retour', async ({ page, api, connecter }) => {
    api.comptes.push({ ...KEVIN, motDePasse: 'x', birth_date: null, photo_url: null, created_date: '2026-01-15T10:00:00.000Z' });
    await connecter(KEVIN);
    await page.goto('/admin/me');
    await expect(page.getByText('Prochain client')).toBeVisible();
    await expect(page.getByText('Nina Roche').first()).toBeVisible();

    await page.getByRole('link', { name: 'Mon agenda' }).first().click();
    await colonne(page, BARBERS.kevin).getByRole('button', { name: /Nina Roche/ }).click();
    const fiche = page.getByRole('dialog', { name: 'Détails du rendez-vous' });
    await fiche.getByRole('button', { name: 'Annuler', exact: true }).click();
    await fiche.getByRole('button', { name: 'Confirmer l\'annulation' }).click();
    await expect(toast(page, 'Rendez-vous annulé')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/me$/);
    await expect(page.getByText('Pas de client aujourd\'hui')).toBeVisible();
    await expect(page.getByText('Prochain client')).toHaveCount(0);
  });
});

test.describe('Agenda sur téléphone : bouton Last Minute', () => {
  for (const largeur of [320, 390]) {
    test(`à ${largeur} px avec quatre barbers, « Last Minute » est à l'écran sans faire défiler`, async ({ page, api, connecter }) => {
      await connecter(ADMIN);
      // Le salon a quatre barbers (Dom, Kevin, Denis, Romain)
      const romain = api.tables.Employee.find((e) => e.id === BARBERS.romain.id);
      api.tables.Employee.push({ ...structuredClone(romain), id: 'emp-denis', name: 'Denis', title: 'DEN', sort_order: 3 });
      await page.setViewportSize({ width: largeur, height: 760 });
      await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
      const bouton = page.getByRole('button', { name: 'Last Minute', exact: true });
      await expect(page.getByRole('button', { name: /Denis/ }).first()).toBeAttached();
      // Entièrement visible (pas coupé par la rangée des barbers qui défile)
      await expect(bouton).toBeInViewport({ ratio: 1 });
    });
  }
});

test.describe('Agenda : Last Minute pris par un client de passage', () => {
  test('« Valider la prestation » : la fin suit la prestation choisie, pas le créneau publié', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    api.tables.Appointment.push(lastMinuteAuto('lm-kevin-15', BARBERS.kevin, jour(0), '15:00', '15:40'));
    await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
    await colonne(page, BARBERS.kevin).getByRole('button', { name: /15:00 Last Minute/ }).click();
    const fiche = page.getByRole('dialog', { name: 'Détails du rendez-vous' });
    await fiche.getByPlaceholder('Nom du client').fill('Paul Passage');
    await fiche.locator('select').filter({ hasText: 'Ajouter une prestation...' }).selectOption({ label: 'Coupe — 25€ (30 min)' });
    await fiche.getByRole('button', { name: 'CB', exact: true }).last().click();
    await fiche.getByRole('button', { name: 'Valider la prestation' }).click();
    await expect(toast(page, 'Prestation validée !')).toBeVisible();
    expect(ecritures(api, 'PUT', 'lm-kevin-15').at(-1).corps).toMatchObject({
      status: 'completed', payment_method: 'cb', client_name: 'Paul Passage', if_free_last_minute: true,
      total_price: 25, total_duration: 30, end_time: '15:30',
    });
  });
});

test.describe('Agenda : rendez-vous pris par téléphone pour un proche', () => {
  test('« Ajouter un client » avec un compte : « Pour un proche » enregistre le prénom', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    // Recherche de comptes de l'équipe (GET /clients/search, staff)
    api.surcharger('GET', '/clients/search', () => ({
      json: { results: [{ id: CLIENT.id, email: CLIENT.email, full_name: CLIENT.full_name, phone: CLIENT.phone, role: 'user' }] },
    }));
    await page.goto(`/admin/agenda?view=day&date=${jour(0)}`);
    const fenetre = await ouvrirAjoutClient(page);
    await fenetre.getByLabel('Rechercher un compte client').fill('Camille');
    await fenetre.getByRole('button', { name: /Camille Test/ }).click();
    await fenetre.getByLabel('Pour un proche (prénom, facultatif)').fill('06');
    await expect(fenetre.getByRole('alert')).toBeVisible();
    await expect(fenetre.getByRole('button', { name: 'Ajouter le client' })).toBeDisabled();
    await fenetre.getByLabel('Pour un proche (prénom, facultatif)').fill('Léo');
    await fenetre.locator('#walkin-barber').selectOption(BARBERS.kevin.id);
    await fenetre.locator('#walkin-time').fill('16:00');
    await fenetre.getByRole('button', { name: /^Coupe enfant/ }).click();
    await fenetre.getByRole('button', { name: 'Ajouter le client' }).click();
    await expect(toast(page, 'Léo (Camille) ajouté à 16:00 avec Kevin')).toBeVisible();
    expect(api.requetesVers('POST', '/entities/Appointment').at(-1).corps)
      .toMatchObject({ client_email: CLIENT.email, guest_name: 'Léo', employee_id: BARBERS.kevin.id, start_time: '16:00' });
    await expect(colonne(page, BARBERS.kevin).getByRole('button', { name: /Léo \(Camille\)/ })).toBeVisible();
  });
});
