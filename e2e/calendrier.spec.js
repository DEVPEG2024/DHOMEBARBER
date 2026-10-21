// « Ajouter au calendrier » (src/lib/calendarLinks.js, 21 oct. 2026) : Mes rendez-vous et écran de
// succès de la réservation. Le serveur pose `calendar_url` (lien signé du .ics) sur les RDV du
// client : sur iPhone, Safari l'ouvre et montre la fiche « Ajouter » ; ailleurs sur le web, le .ics
// est fabriqué sur l'appareil et téléchargé. Les apps natives ne se jouent pas dans Chromium.
import { test, expect } from './support/test.js';
import { CLIENT } from './support/donnees.js';
import { jour } from './support/temps.js';
import { echapper, libelleJour } from './support/outils.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
/** Lien tel que le serveur le rend (lib/calendarIcs.js) : domaine du salon, sans extension .ics. */
const LIEN = 'https://dhomebarber.fr/agenda/rdv/11111111-1111-4111-8111-111111111111/0123456789abcdef0123456789abcdef';
const ICS_SERVEUR = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:appointment-serveur@dhomebarber.fr\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';

/** Carte d'un rendez-vous de Mes rendez-vous, repérée par ses heures (voir rendez-vous.spec.js). */
const carteRdv = (page, heures) => page.locator('div')
  .filter({ has: page.getByText(heures, { exact: true }) })
  .filter({ has: page.getByText('Barber', { exact: true }) })
  .last();

/** Comme le vrai serveur : le lien signé sur chaque RDV du client. */
function poserLiens(api) {
  for (const rdv of api.tables.Appointment) {
    if (rdv.client_email === CLIENT.email) rdv.calendar_url = LIEN;
  }
}

/** Le .ics du serveur, servi à la place de dhomebarber.fr (réécriture de vercel.json). */
async function servirIcs(page) {
  const ouverts = [];
  await page.route('https://dhomebarber.fr/agenda/**', (route) => {
    ouverts.push(route.request().url());
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="rendez-vous-dhomebarber.ics"' },
      body: ICS_SERVEUR,
    });
  });
  return ouverts;
}

async function ouvrirMenu(page) {
  await page.goto('/appointments');
  const carte = carteRdv(page, '15:00 — 15:45');
  await expect(carte).toBeVisible();
  await carte.getByRole('button', { name: 'Ajouter au calendrier' }).click();
  return carte;
}

test.describe('Ajouter au calendrier', () => {
  test.beforeEach(async ({ connecter, api }) => {
    poserLiens(api);
    await connecter(CLIENT);
  });

  test('ordinateur : Google Agenda pré-rempli et .ics fabriqué sur l\'appareil (heure de Paris, UID du RDV)', async ({ page }) => {
    const ouverts = await servirIcs(page);
    const carte = await ouvrirMenu(page);
    await expect(carte.getByRole('button', { name: 'Google Agenda' })).toBeVisible();

    const telechargement = page.waitForEvent('download');
    await carte.getByRole('button', { name: 'Apple / Outlook' }).click();
    const fichier = await telechargement;
    expect(fichier.suggestedFilename()).toBe('rendez-vous-dhomebarber.ics');
    const contenu = await (await fichier.createReadStream()).toArray().then((morceaux) => Buffer.concat(morceaux).toString('utf8'));
    const jourIcs = jour(6).replace(/-/g, '');
    expect(contenu).toContain('UID:appointment-apt-lointain-kevin@dhomebarber.fr');
    expect(contenu).toContain(`DTSTART;TZID=Europe/Paris:${jourIcs}T150000`);
    expect(contenu).toContain(`DTEND;TZID=Europe/Paris:${jourIcs}T154500`);
    expect(contenu).toContain('Avec Kevin');
    expect(ouverts, 'sur ordinateur, le lien du serveur n\'est pas ouvert').toEqual([]);

    // Le menu se referme après un choix ; Google Agenda dans un nouvel onglet
    await carte.getByRole('button', { name: 'Ajouter au calendrier' }).click();
    const onglet = page.waitForEvent('popup');
    await carte.getByRole('button', { name: 'Google Agenda' }).click();
    const google = new URL((await onglet).url());
    expect(google.origin + google.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(google.searchParams.get('action')).toBe('TEMPLATE');
    expect(google.searchParams.get('dates')).toBe(`${jourIcs}T150000/${jourIcs}T154500`);
    expect(google.searchParams.get('ctz')).toBe('Europe/Paris');
    expect(google.searchParams.get('location')).toContain('3 Rue du Bois Arquet');
  });

  test.describe('sur iPhone (Safari)', () => {
    test.use({ userAgent: IPHONE });

    test('« Apple / Outlook » ouvre le lien signé du serveur (fiche « Ajouter » de Safari)', async ({ page }) => {
      const ouverts = await servirIcs(page);
      const carte = await ouvrirMenu(page);
      await carte.getByRole('button', { name: 'Apple / Outlook' }).click();
      await expect.poll(() => ouverts).toEqual([LIEN]);
      // Le fichier ne remplace pas l'app
      await expect(page).toHaveURL(/\/appointments$/);
      await expect(carte).toBeVisible();
    });

    test('serveur pas encore à jour (pas de calendar_url) : le .ics fabriqué sur l\'appareil', async ({ page, api }) => {
      for (const rdv of api.tables.Appointment) delete rdv.calendar_url;
      const ouverts = await servirIcs(page);
      const carte = await ouvrirMenu(page);
      const telechargement = page.waitForEvent('download');
      await carte.getByRole('button', { name: 'Apple / Outlook' }).click();
      expect((await telechargement).suggestedFilename()).toBe('rendez-vous-dhomebarber.ics');
      expect(ouverts).toEqual([]);
    });

    test('écran de succès de la réservation : le lien du RDV créé', async ({ page, api }) => {
      // Réponse de création comme le vrai serveur : la ligne du client avec son lien
      api.surcharger('POST', '/entities/Appointment', (req) => {
        const ligne = { ...req.corps, id: '22222222-2222-4222-8222-222222222222', created_date: new Date().toISOString(), calendar_url: LIEN, blocks_client: true };
        api.tables.Appointment.push(ligne);
        return { status: 201, json: ligne };
      });
      const ouverts = await servirIcs(page);
      await page.goto('/booking');
      await page.getByRole('button', { name: 'Choisir : Coupe', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
      await page.getByRole('region', { name: 'Choix du jour' })
        .getByRole('button', { name: new RegExp(`^${echapper(libelleJour(jour(2)))} : \\d+ créneaux? libres?$`) }).click();
      await page.getByRole('group', { name: 'Après-midi' }).getByRole('button', { name: '15:00', exact: true }).click();
      await page.getByRole('button', { name: 'Continuer' }).click();
      await page.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();

      await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Google Agenda' })).toBeVisible();
      await page.getByRole('button', { name: 'Apple / Outlook' }).click();
      await expect.poll(() => ouverts).toEqual([LIEN]);
    });
  });
});
