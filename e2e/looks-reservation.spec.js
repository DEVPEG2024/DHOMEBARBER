// Réservation depuis un look (photo des réalisations d'un barber, 21 oct. 2026) : le lien du
// profil (`/booking?barber=…&services=…&from=gallery&look=<clé>`) ouvre directement l'écran
// Créneau de ce barber, le look rangé en vignette en haut. Plus d'écran court « Votre prestation ».
import { test, expect } from './support/test.js';
import { BARBERS, CLIENT, LOOKS, PRESTATIONS, cleLook } from './support/donnees.js';
import { jour } from './support/temps.js';
import { attendreSansDebordement, echapper, libelleJour } from './support/outils.js';

/** Jour choisi dans les parcours : jeudi (J+2), aucun rendez-vous de Kevin ce jour-là. */
const JOUR_RESA = jour(2);
/** Look de Kevin : Coloration 45 € 60 min + Coupe 25 € 30 min + Barbe 15 € 20 min = 85 €, 1 h 50. */
const LOOK = LOOKS.kevinComplet;
const CLE = cleLook(LOOK);

/** Lien envoyé par la visionneuse du profil (même construction que `bookingLinkFor`). */
function lienLook({ ids = LOOK.service_ids, cle = CLE, barber = BARBERS.kevin.id } = {}) {
  const params = new URLSearchParams({ barber, services: ids.join(','), from: 'gallery' });
  if (cle) params.set('look', cle);
  return `/booking?${params.toString()}`;
}

const vignette = (page) => page.getByRole('region', { name: 'Votre look' });
const tuileBarber = (page, nom) => page.getByRole('group', { name: 'Choix du barber' }).getByRole('button', { name: nom });

/** Bouton d'un jour de la bande, une fois ses places calculées. */
const boutonJour = (page, cle) => page.getByRole('region', { name: 'Choix du jour' })
  .getByRole('button', { name: new RegExp(`^${echapper(libelleJour(cle))} : \\d+ créneaux? libres?$`) });

/** Heures de l'après-midi proposées pour le jour affiché (« 12:00 », « 15:00 »…). */
const heuresApresMidi = (page) => page.getByRole('group', { name: 'Après-midi' }).getByRole('button')
  .evaluateAll((boutons) => boutons.map((b) => b.textContent.trim()));

const creations = (api) => api.requetesVers('POST', '/entities/Appointment');

test.describe('Réservation depuis un look', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(CLIENT);
  });

  test('lien du look : écran Créneau directement, vignette du look, Kevin présélectionné', async ({ page }) => {
    await page.goto(lienLook());

    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Votre prestation' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Choisissez votre prestation' })).toHaveCount(0);

    // Vignette : photo du look en portrait (jamais ronde), titre, total calculé sur le catalogue
    await expect(vignette(page)).toContainText('Dégradé, barbe et couleur');
    await expect(vignette(page)).toContainText('3 prestations · 1 h 50 · 85 €');
    const photo = vignette(page).locator('img');
    await expect(photo).toHaveAttribute('src', LOOK.url);
    const cadre = await photo.boundingBox();
    expect(cadre.height, 'photo en portrait').toBeGreaterThan(cadre.width);
    const arrondi = await photo.evaluate((img) => parseFloat(getComputedStyle(img.parentElement).borderTopLeftRadius));
    expect(arrondi, 'photo jamais ronde').toBeLessThan(cadre.width / 3);
    // La carte habituelle des prestations n'est pas là
    await expect(page.getByText('Coloration + Coupe + Barbe', { exact: true })).toHaveCount(0);

    // Barber du look choisi d'office, signalé « Ce look » (prime sur « Habituel »)
    await expect(tuileBarber(page, /Kevin Ce look$/)).toHaveAttribute('aria-pressed', 'true');
    await expect(tuileBarber(page, /Habituel$/)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Votre réservation' })).toContainText('1 h 50 · 85 €');

    // Changer de barber reste possible ; le look reste affiché
    await tuileBarber(page, /^D Dom$/).click();
    await expect(tuileBarber(page, /^D Dom$/)).toHaveAttribute('aria-pressed', 'true');
    await expect(tuileBarber(page, /Kevin Ce look$/)).toHaveAttribute('aria-pressed', 'false');
    await expect(vignette(page)).toContainText('3 prestations · 1 h 50 · 85 €');
  });

  test('seules les heures assez longues pour tout le look sont proposées', async ({ page }) => {
    // Kevin a un rendez-vous aujourd'hui de 14:00 à 14:45 (il est 10 h) : 13:00 tient pour une Coupe
    await page.goto(`/booking?barber=${BARBERS.kevin.id}&services=${PRESTATIONS.coupe.id}`);
    await boutonJour(page, jour(0)).click();
    await expect(page.getByRole('heading', { name: new RegExp(`^${echapper(libelleJour(jour(0)))}$`, 'i') })).toBeVisible();
    const pourUneCoupe = await heuresApresMidi(page);
    expect(pourUneCoupe).toEqual(expect.arrayContaining(['12:00', '12:30', '13:00', '13:30', '15:00']));
    await expect(page.getByText(/assez longs pour tout le look/)).toHaveCount(0);

    // Le look dure 1 h 50 : 12:30 à 13:30 finiraient pendant le rendez-vous de 14:00
    await page.goto(lienLook());
    await expect(vignette(page)).toBeVisible();
    await boutonJour(page, jour(0)).click();
    await expect(page.getByRole('heading', { name: new RegExp(`^${echapper(libelleJour(jour(0)))}$`, 'i') })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Après-midi' }).getByRole('button', { name: '15:00', exact: true })).toBeVisible();
    const pourLeLook = await heuresApresMidi(page);
    expect(pourLeLook).toContain('12:00');
    expect(pourLeLook).not.toContain('12:30');
    expect(pourLeLook).not.toContain('13:00');
    expect(pourLeLook).not.toContain('13:30');
    await expect(page.getByText('Seuls les créneaux assez longs pour tout le look (1 h 50) sont proposés.', { exact: true })).toBeVisible();
  });

  test('parcours du look jusqu\'à la confirmation : récapitulatif, produits, corps envoyé', async ({ page, api }) => {
    await page.goto(lienLook());
    await boutonJour(page, JOUR_RESA).click();
    await page.getByRole('group', { name: 'Après-midi' }).getByRole('button', { name: '15:00', exact: true }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await expect(page.getByRole('heading', { name: 'Vérifiez et confirmez' })).toBeVisible();
    await expect(vignette(page), 'écran Créneau parti').toHaveCount(0);
    // Ligne du look dans le récapitulatif : photo, titre, prestations dans l'ordre du look
    await expect(page.getByText('Votre look', { exact: true })).toBeVisible();
    await expect(page.getByText('Dégradé, barbe et couleur', { exact: true })).toBeVisible();
    await expect(page.getByText('Coloration + Coupe + Barbe', { exact: true })).toBeVisible();
    await expect(page.getByText('Fin vers 16:50')).toBeVisible();
    // Les produits de la boutique sont proposés à la confirmation, comme pour toute réservation
    await expect(page.getByRole('button', { name: 'Ajouter un produit de la boutique' })).toBeVisible();
    await expect(page.getByText('85 €', { exact: true }).last()).toBeVisible();

    await page.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();
    await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();

    expect(creations(api)).toHaveLength(1);
    const corps = creations(api)[0].corps;
    expect(corps).toMatchObject({
      client_email: CLIENT.email,
      employee_id: BARBERS.kevin.id,
      date: JOUR_RESA,
      start_time: '15:00',
      end_time: '16:50',
      total_duration: 110,
      total_price: 85,
      status: 'confirmed',
    });
    // Prestations dans l'ordre du look (celui du lien), pas dans celui du catalogue
    expect(corps.services).toEqual([
      { service_id: PRESTATIONS.couleur.id, name: 'Coloration', duration: 60, price: 45 },
      { service_id: PRESTATIONS.coupe.id, name: 'Coupe', duration: 30, price: 25 },
      { service_id: PRESTATIONS.barbe.id, name: 'Barbe', duration: 20, price: 15 },
    ]);
  });

  test('look ajusté (Barbe et Coupe décochées, Soin ajouté) : la vignette dit ce qui est réservé', async ({ page, api }) => {
    const ajuste = lienLook({ ids: [PRESTATIONS.couleur.id, PRESTATIONS.soin.id] });
    // Avec une légende : le titre du barber, puis les prestations réellement retenues
    await page.goto(ajuste);
    await expect(vignette(page)).toContainText('Dégradé, barbe et couleur');
    await expect(vignette(page)).toContainText('Coloration + Soin du visage');
    await expect(vignette(page)).toContainText('2 prestations · 1 h 30 · 70 €');

    // Sans légende : le titre suit la sélection, jamais les prestations d'origine du look
    const kevin = api.tables.Employee.find((e) => e.id === BARBERS.kevin.id);
    kevin.gallery = kevin.gallery.map((p) => (p.url === LOOK.url ? { ...p, caption: '' } : p));
    await page.goto(ajuste);
    await expect(vignette(page)).toContainText('Coloration + Soin du visage');
    await expect(vignette(page)).not.toContainText('Coupe');
    await expect(vignette(page)).toContainText('2 prestations · 1 h 30 · 70 €');
  });

  test('« Modifier le look » à la confirmation avec une note : on demande avant de la perdre', async ({ page }) => {
    await page.goto(lienLook());
    await boutonJour(page, JOUR_RESA).click();
    await page.getByRole('group', { name: 'Après-midi' }).getByRole('button', { name: '15:00', exact: true }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByRole('heading', { name: 'Vérifiez et confirmez' })).toBeVisible();

    await page.getByRole('button', { name: /Ajouter une note/ }).click();
    await page.getByRole('textbox').fill('Pas trop court derrière');
    await page.getByRole('button', { name: 'Modifier le look' }).click();
    const question = page.getByRole('alertdialog', { name: 'Revenir au look ?' });
    await expect(question).toContainText('Ne seront pas gardés : votre note.');

    // « Rester ici » : rien ne bouge, la note est toujours là
    await question.getByRole('button', { name: 'Rester ici' }).click();
    await expect(question).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Vérifiez et confirmez' })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveValue('Pas trop court derrière');

    // « Revenir au look » : le profil de Kevin, visionneuse ouverte sur ce look
    await page.getByRole('button', { name: 'Modifier le look' }).click();
    await page.getByRole('alertdialog', { name: 'Revenir au look ?' }).getByRole('button', { name: 'Revenir au look' }).click();
    await expect(page).toHaveURL((url) => url.pathname === `/barber/${BARBERS.kevin.id}` && url.searchParams.get('look') === CLE);
  });

  test('« Modifier » sans état de navigation : le profil de Kevin, visionneuse sur ce look', async ({ page }) => {
    const versLeLook = (url) => url.pathname === `/barber/${BARBERS.kevin.id}`
      && url.searchParams.get('look') === CLE
      && url.searchParams.get('services') === LOOK.service_ids.join(',');

    await page.goto(lienLook());
    await vignette(page).getByRole('button', { name: 'Modifier le look' }).click();
    await expect(page).toHaveURL(versLeLook);

    // Le bouton retour de l'en-tête fait de même depuis l'écran Créneau
    await page.goto(lienLook());
    await expect(vignette(page)).toBeVisible();
    await page.getByRole('button', { name: 'Étape précédente' }).click();
    await expect(page).toHaveURL(versLeLook);

    // À la confirmation, « Modifier » de la ligne du look aussi ; barber et date ramènent au créneau
    await page.goto(lienLook());
    await boutonJour(page, JOUR_RESA).click();
    await page.getByRole('group', { name: 'Après-midi' }).getByRole('button', { name: '15:00', exact: true }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Changer de date ou d\'heure' }).click();
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByRole('heading', { name: 'Vérifiez et confirmez' })).toBeVisible();
    await expect(vignette(page), 'écran Créneau parti').toHaveCount(0);
    await page.getByRole('button', { name: 'Modifier le look' }).click();
    await expect(page).toHaveURL(versLeLook);
  });

  test('« Modifier » arrivé du profil (état fromLook) : simple retour arrière', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav').getByRole('link', { name: 'Accueil', exact: true })).toBeVisible();
    // Même effet que `navigate(lien, { state: { fromLook: true } })` de la visionneuse
    await page.evaluate((lien) => {
      const idx = (window.history.state && window.history.state.idx) || 0;
      window.history.pushState({ usr: { fromLook: true }, key: 'e2elook', idx: idx + 1 }, '', lien);
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    }, lienLook());
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(vignette(page)).toBeVisible();

    await vignette(page).getByRole('button', { name: 'Modifier le look' }).click();
    // Retour à la page d'avant (ici l'accueil), pas une nouvelle page du profil
    await expect(page).toHaveURL((url) => url.pathname === '/' && url.search === '');
  });

  test('ancien lien de la galerie sans look (une prestation) : écran Créneau, carte habituelle', async ({ page }) => {
    await page.goto(`/booking?barber=${BARBERS.kevin.id}&services=${PRESTATIONS.coupe.id}&from=gallery`);

    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Votre prestation' })).toHaveCount(0);
    // Le catalogue (affiché le temps de lire les prestations) a disparu
    await expect(page.getByRole('button', { name: /^Choisir :/ })).toHaveCount(0);
    await expect(vignette(page)).toHaveCount(0);
    await expect(page.getByText('Coupe', { exact: true })).toBeVisible();
    await expect(tuileBarber(page, /Kevin Habituel$/)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Ce look', { exact: true })).toHaveCount(0);
  });

  test('look inconnu (photo retirée) : carte habituelle, rien ne casse', async ({ page }) => {
    await page.goto(lienLook({ cle: 'ffffffff-0000-4000-8000-000000000999' }));

    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(page.getByText('Coloration + Coupe + Barbe', { exact: true })).toBeVisible();
    await expect(vignette(page)).toHaveCount(0);
    await expect(tuileBarber(page, /Kevin Habituel$/)).toHaveAttribute('aria-pressed', 'true');
  });

  test('prestation du look retirée du catalogue : étape Prestation avec le bandeau', async ({ page, api }) => {
    const i = api.tables.Service.findIndex((s) => s.id === PRESTATIONS.barbe.id);
    api.tables.Service.splice(i, 1);
    await page.goto(lienLook());

    await expect(page.getByRole('heading', { name: 'Choisissez votre prestation' })).toBeVisible();
    await expect(page.getByRole('status').filter({
      hasText: 'Une prestation de votre rendez-vous n\'est plus proposée : vérifiez votre sélection.',
    })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajouter Coloration à ma sélection' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Ajouter Coupe à ma sélection' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toHaveCount(0);

    // Sélection gardée telle quelle : le reste du look se réserve, la vignette suit la sélection réelle
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
    await expect(vignette(page)).toContainText('2 prestations · 1 h 30 · 70 €');
  });

  test.describe('à 320 px', () => {
    test.use({ viewport: { width: 320, height: 640 } });

    test('vignette entière et aucun débordement horizontal, jusqu\'à la confirmation', async ({ page }) => {
      await page.goto(lienLook());
      await expect(vignette(page)).toContainText('3 prestations · 1 h 50 · 85 €');
      await attendreSansDebordement(page, 'l\'écran Créneau d\'un look à 320 px');
      // Mesure une fois l'écran arrivé (il glisse depuis la droite)
      const modifier = vignette(page).getByRole('button', { name: 'Modifier le look' });
      await expect.poll(async () => {
        const b = await modifier.boundingBox();
        return b.x + b.width;
      }, { message: '« Modifier » dans l\'écran' }).toBeLessThanOrEqual(320 - 16);
      // Titre et ligne du total ni coupés ni tronqués
      for (const texte of ['Dégradé, barbe et couleur', '3 prestations · 1 h 50 · 85 €']) {
        const el = vignette(page).getByText(texte, { exact: true });
        expect(await el.evaluate((n) => n.scrollWidth > n.clientWidth || n.scrollHeight > n.clientHeight + 1), `« ${texte} » coupé`).toBe(false);
      }

      await boutonJour(page, JOUR_RESA).click();
      await page.getByRole('group', { name: 'Après-midi' }).getByRole('button', { name: '15:00', exact: true }).click();
      await page.getByRole('button', { name: 'Continuer' }).click();
      await expect(page.getByRole('heading', { name: 'Vérifiez et confirmez' })).toBeVisible();
      await attendreSansDebordement(page, 'la confirmation d\'un look à 320 px');
    });
  });
});
