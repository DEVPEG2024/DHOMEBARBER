// Audit du 24 oct. 2026 (agent C) : Mes rendez-vous, déplacer, annuler, ajout au calendrier.
// Chaque correction a son test, qui échoue avec l'ancien code ; s'y ajoutent les vérifications du
// passage à l'heure d'hiver et des largeurs d'ordinateur (le site, pas seulement les apps).
import { test, expect } from './support/test.js';
import { BARBERS, CLIENT, PRESTATIONS, rendezVous } from './support/donnees.js';
import { ajouterJours, instantParis, jour, jourDeSemaine } from './support/temps.js';
import { attendreSansDebordement, libelleJour, toast } from './support/outils.js';

/** Carte d'un rendez-vous, repérée par ses heures (voir rendez-vous.spec.js). */
const carteRdv = (page, heures) => page.locator('div')
  .filter({ has: page.getByText(heures, { exact: true }) })
  .filter({ has: page.getByText('Barber', { exact: true }) })
  .last();
const fenetre = (page) => page.getByRole('dialog');
/** RDV de Kevin dans six jours (15:00 — 15:45), hors du délai de 24 h. */
const LOINTAIN = '15:00 — 15:45';

async function ouvrir(page, connecter) {
  await connecter(CLIENT);
  await page.goto('/appointments');
  await expect(carteRdv(page, LOINTAIN)).toBeVisible();
}

/** Un créneau proposé est choisi dans la fenêtre « Déplacer » ; renvoie son heure. */
async function choisirCreneau(page) {
  const premier = fenetre(page).getByRole('button', { name: /^\d\d:\d\d/ }).first();
  // Barbers, congés, catalogue puis RDV de trois semaines : plus long qu'un simple affichage
  await expect(premier).toBeVisible({ timeout: 15_000 });
  const heure = (await premier.innerText()).slice(0, 5);
  await premier.click();
  return heure;
}

test.describe('Mes rendez-vous : hors connexion', () => {
  test('annuler sans réseau : rien n\'est envoyé, la fenêtre reste utilisable et se ferme par la croix', async ({ page, context, api, connecter }) => {
    await ouvrir(page, connecter);
    await carteRdv(page, LOINTAIN).getByRole('button', { name: 'Annuler' }).click();
    await fenetre(page).getByRole('button', { name: 'Non merci, je veux annuler' }).click();
    await context.setOffline(true);
    await fenetre(page).getByRole('button', { name: 'Oui, annuler' }).click();

    // Avant : envoi mis en pause par React Query, « Annulation… » sans fin, croix et Échap ignorées
    await expect(toast(page, 'Pas de connexion internet : le rendez-vous n\'a pas été annulé')).toBeVisible();
    await expect(fenetre(page).getByRole('button', { name: 'Oui, annuler' })).toBeEnabled();
    expect(api.requetesVers('PUT', /^\/entities\/Appointment\//)).toHaveLength(0);
    await fenetre(page).getByRole('button', { name: 'Close' }).click();
    await expect(fenetre(page)).toHaveCount(0);

    // Réseau revenu : l'annulation passe normalement
    await context.setOffline(false);
    await carteRdv(page, LOINTAIN).getByRole('button', { name: 'Annuler' }).click();
    await fenetre(page).getByRole('button', { name: 'Non merci, je veux annuler' }).click();
    await fenetre(page).getByRole('button', { name: 'Oui, annuler' }).click();
    await expect(toast(page, 'Rendez-vous annulé')).toBeVisible();
    expect(api.requetesVers('PUT', '/entities/Appointment/apt-lointain-kevin')).toHaveLength(1);
  });

  test('déplacer sans réseau : rien n\'est créé, la fenêtre reste utilisable', async ({ page, context, api, connecter }) => {
    await ouvrir(page, connecter);
    await carteRdv(page, LOINTAIN).getByRole('button', { name: 'Déplacer' }).click();
    await choisirCreneau(page);
    await context.setOffline(true);
    await fenetre(page).getByRole('button', { name: /^Déplacer au / }).click();

    await expect(toast(page, 'Pas de connexion internet : le rendez-vous n\'a pas été déplacé')).toBeVisible();
    await expect(fenetre(page).getByRole('button', { name: /^Déplacer au / })).toBeEnabled();
    expect(api.requetesVers('POST', '/entities/Appointment')).toHaveLength(0);
    await page.keyboard.press('Escape');
    await expect(fenetre(page)).toHaveCount(0);
  });
});

test.describe('Mes rendez-vous : fenêtre « Déplacer »', () => {
  test('« Déplacer » ne parle pas d\'annuler ; « Annuler » propose d\'abord de déplacer', async ({ page, connecter }) => {
    await ouvrir(page, connecter);
    await carteRdv(page, LOINTAIN).getByRole('button', { name: 'Déplacer' }).click();
    await expect(fenetre(page).getByRole('heading', { name: 'Déplacer ce rendez-vous' })).toBeVisible();
    await expect(fenetre(page)).toContainText('Choisissez un autre créneau avec Kevin');
    await expect(fenetre(page)).not.toContainText('Plutôt que d\'annuler');
    await expect(fenetre(page).getByRole('button', { name: 'Annuler plutôt ce rendez-vous' })).toBeVisible();
    await fenetre(page).getByRole('button', { name: 'Close' }).click();

    await carteRdv(page, LOINTAIN).getByRole('button', { name: 'Annuler' }).click();
    await expect(fenetre(page).getByRole('heading', { name: 'Et si on le déplaçait ?' })).toBeVisible();
    await expect(fenetre(page)).toContainText('Plutôt que d\'annuler, choisissez un autre créneau avec Kevin');
    await expect(fenetre(page).getByRole('button', { name: 'Non merci, je veux annuler' })).toBeVisible();
  });

  test('barber parti du salon : ni « avec Kevin » ni créneau, seulement une nouvelle date', async ({ page, api, connecter }) => {
    api.tables.Employee.find((e) => e.id === BARBERS.kevin.id).is_active = false;
    await ouvrir(page, connecter);
    await carteRdv(page, LOINTAIN).getByRole('button', { name: 'Déplacer' }).click();
    await expect(fenetre(page)).toContainText('Kevin ne prend plus de rendez-vous en ligne');
    await expect(fenetre(page)).toContainText('Choisissez une nouvelle date');
    await expect(fenetre(page)).not.toContainText('avec Kevin');
    await expect(fenetre(page).getByRole('button', { name: 'Choisir une autre date' })).toBeVisible();
  });

  test('déplacement en un geste : nouveau RDV avec reschedule_of, ancien annulé, proche gardé par le serveur', async ({ page, api, connecter }) => {
    api.tables.Appointment.push(rendezVous({
      id: 'apt-leo', client: CLIENT, barber: BARBERS.dom, prestations: [PRESTATIONS.enfant],
      date: jour(3), debut: '15:00', guest_name: 'Léo',
    }));
    await ouvrir(page, connecter);
    await carteRdv(page, '15:00 — 15:30').getByRole('button', { name: 'Déplacer' }).click();
    await expect(fenetre(page)).toContainText('Pour Léo');
    const heure = await choisirCreneau(page);
    await fenetre(page).getByRole('button', { name: /^Déplacer au / }).click();

    await expect(toast(page, 'Rendez-vous déplacé au')).toBeVisible();
    const creations = api.requetesVers('POST', '/entities/Appointment');
    expect(creations).toHaveLength(1);
    expect(creations[0].corps).toMatchObject({ reschedule_of: 'apt-leo', employee_id: BARBERS.dom.id, start_time: heure });
    // Sans prénom dans la requête, le serveur fait suivre le proche de l'ancien RDV
    expect('guest_name' in creations[0].corps).toBe(false);
    expect(api.requetesVers('PUT', '/entities/Appointment/apt-leo')[0].corps.status).toBe('cancelled');
  });
});

test.describe('Mes rendez-vous : historique', () => {
  test('RDV déplacé par le client : « Déplacé », jamais « Annulé par vous » ; visite passée : « Terminé »', async ({ page, api, connecter }) => {
    api.tables.Appointment.push(
      rendezVous({
        id: 'apt-deplace', client: CLIENT, barber: BARBERS.kevin, prestations: [PRESTATIONS.coupe],
        date: jour(-2), debut: '16:00', statut: 'cancelled', cancelled_by: 'client',
        cancellation_reason: 'Client : déplacé au mercredi 4 novembre à 10:00',
      }),
      rendezVous({
        id: 'apt-visite', client: CLIENT, barber: BARBERS.dom, prestations: [PRESTATIONS.barbe],
        date: jour(-3), debut: '12:00',
      }),
      rendezVous({
        id: 'apt-annule', client: CLIENT, barber: BARBERS.romain, prestations: [PRESTATIONS.coupe],
        date: jour(-4), debut: '09:00', statut: 'cancelled', cancelled_by: 'client', cancellation_reason: 'Client : Empêchement',
      }),
    );
    await ouvrir(page, connecter);
    await page.getByRole('button', { name: 'Historique' }).click();

    const deplace = carteRdv(page, '16:00 — 16:30');
    await expect(deplace).toContainText('Déplacé');
    await expect(deplace).toContainText('Déplacé par vous au mercredi 4 novembre à 10:00');
    await expect(deplace).not.toContainText('Annulé');
    await expect(deplace).not.toContainText('Motif');

    // Le salon ne passe presque jamais ses RDV en « completed » : une visite passée reste « confirmed »
    const visite = carteRdv(page, '12:00 — 12:20');
    await expect(visite).toContainText('Terminé');
    await expect(visite).not.toContainText('Confirmé');

    // Une vraie annulation garde son libellé et son motif
    const annule = carteRdv(page, '09:00 — 09:30');
    await expect(annule).toContainText('Annulé par vous');
    await expect(annule).toContainText('Motif : Empêchement');
  });

  test('fiches fantômes des Clients : jamais montrées, même après un passage par le Profil', async ({ page, api, connecter }) => {
    // Fiche « Ajouter / Importer » des Clients : RDV annulé sans prestation, ni prix, ni durée
    api.tables.Appointment.push(rendezVous({
      id: 'apt-fantome', client: CLIENT, barber: BARBERS.dom, prestations: [],
      date: jour(-30), debut: '10:00', statut: 'cancelled',
    }));
    await connecter(CLIENT);
    await page.goto('/profile');
    // Le Profil remplit le cache partagé de Mes rendez-vous avec la liste brute du serveur
    await expect.poll(() => api.requetesVers('GET', '/entities/Appointment').length).toBeGreaterThan(0);
    await page.getByRole('link', { name: /Rendez-vous/ }).first().click();
    await expect(page).toHaveURL(/\/appointments$/);
    await page.getByRole('button', { name: 'Historique' }).click();
    await expect(carteRdv(page, '11:00 — 11:30')).toBeVisible();
    await expect(page.getByText('10:00 — 10:00', { exact: true })).toHaveCount(0);
  });
});

test.describe('Mes rendez-vous : délai de 24 h', () => {
  test('paramètres du salon lents : aucun bouton « Déplacer » / « Annuler » sur un RDV de moins de 24 h', async ({ page, api, connecter }) => {
    let liberer;
    const attente = new Promise((r) => { liberer = r; });
    api.surcharger('GET', '/entities/SalonSettings', async () => { await attente; return undefined; });
    await ouvrir(page, connecter);
    const proche = carteRdv(page, '17:00 — 17:20');
    await expect(proche).toBeVisible();
    // Délai pas encore connu : avant, cancelHours valait 0 et les boutons s'affichaient
    await expect(proche.getByRole('button', { name: 'Annuler' })).toHaveCount(0);
    await expect(proche.getByRole('button', { name: 'Déplacer' })).toHaveCount(0);
    liberer();
    await expect(proche).toContainText('Ce rendez-vous est dans moins de 24 h');
    await expect(proche.getByRole('button', { name: 'Annuler' })).toHaveCount(0);
    await expect(carteRdv(page, LOINTAIN).getByRole('button', { name: 'Annuler' })).toBeVisible();
  });

  test('passage à l\'heure d\'hiver : 24 h réelles, comme le serveur, et .ics à l\'heure de Paris', async ({ page, api, connecter }) => {
    // Dernier dimanche d'octobre à venir (heure d'hiver), calculé : jamais une date écrite en dur
    let annee = Number(jour(0).slice(0, 4));
    const dimancheDe = (a) => { const fin = `${a}-10-31`; return ajouterJours(fin, -jourDeSemaine(fin)); };
    if (dimancheDe(annee) < jour(0)) annee += 1;
    const dimanche = dimancheDe(annee);
    const samedi = ajouterJours(dimanche, -1);
    api.tables.Appointment.push(rendezVous({
      id: 'apt-hiver', client: CLIENT, barber: BARBERS.dom, prestations: [PRESTATIONS.coupe], date: dimanche, debut: '10:00',
    }));
    // Samedi 10:30 (heure d'été) : le RDV du dimanche 10:00 (heure d'hiver) est dans 24 h 30
    await page.clock.setSystemTime(instantParis(samedi, '10:30'));
    await connecter(CLIENT);
    await page.goto('/appointments');
    const carte = carteRdv(page, '10:00 — 10:30');
    await expect(carte).toContainText(libelleJour(dimanche));
    await expect(carte.getByRole('button', { name: 'Annuler' })).toBeVisible();
    // 24 h avant dimanche 10:00 (UTC+1) = samedi 11:00 (UTC+2)
    await expect(carte).toContainText(/jusqu'au sam\. \d+ oct\. à 11:00/);

    const telechargement = page.waitForEvent('download');
    await carte.getByRole('button', { name: 'Ajouter au calendrier' }).click();
    await carte.getByRole('button', { name: 'Apple / Outlook' }).click();
    const fichier = await telechargement;
    const contenu = Buffer.concat(await (await fichier.createReadStream()).toArray()).toString('utf8');
    expect(contenu).toContain(`DTSTART;TZID=Europe/Paris:${dimanche.replace(/-/g, '')}T100000`);
    expect(contenu).toContain('TZOFFSETTO:+0100');

    // Samedi 11:30 : dans le délai (23 h 30), le téléphone du salon à la place des boutons
    await page.clock.setSystemTime(instantParis(samedi, '11:30'));
    await page.reload();
    await expect(carte).toContainText('Ce rendez-vous est dans moins de 24 h');
    await expect(carte.getByRole('button', { name: 'Annuler' })).toHaveCount(0);
  });
});

test.describe('Mes rendez-vous : largeurs', () => {
  for (const largeur of [320, 1024, 1366, 1920]) {
    test(`${largeur} px : liste, menu du calendrier et fenêtre « Déplacer » sans défilement horizontal`, async ({ page, connecter }) => {
      await page.setViewportSize({ width: largeur, height: 900 });
      await ouvrir(page, connecter);
      await attendreSansDebordement(page, `Mes rendez-vous (${largeur} px)`);
      const carte = carteRdv(page, LOINTAIN);
      await carte.getByRole('button', { name: 'Ajouter au calendrier' }).click();
      await expect(carte.getByRole('button', { name: 'Google Agenda' })).toBeVisible();
      await expect(carte.getByRole('button', { name: 'Apple / Outlook' })).toBeVisible();
      await carte.getByRole('button', { name: 'Déplacer' }).click();
      await expect(fenetre(page).getByRole('button', { name: /^\d\d:\d\d/ }).first()).toBeVisible();
      // La fenêtre tient dans l'écran
      const boite = await fenetre(page).boundingBox();
      expect(boite.x).toBeGreaterThanOrEqual(0);
      expect(boite.x + boite.width).toBeLessThanOrEqual(largeur);
      await attendreSansDebordement(page, `fenêtre Déplacer (${largeur} px)`);
    });
  }
});
