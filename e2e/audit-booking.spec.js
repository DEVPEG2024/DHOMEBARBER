// Audit de la réservation du 24 oct. 2026 (agent A, parcours /booking) : un test par défaut corrigé.
// Chacun échoue avec le code d'avant la correction.
import { test, expect } from './support/test.js';
import { BARBERS, CLIENT, PRESTATIONS } from './support/donnees.js';
import { jour } from './support/temps.js';
import { echapper, libelleJour, toast } from './support/outils.js';

/** Bouton d'un jour de la bande, quel que soit l'état de ses places (« jeudi 29 octobre : … »). */
const boutonJour = (page, cle) => page.getByRole('region', { name: 'Choix du jour' })
  .getByRole('button', { name: new RegExp(`^${echapper(libelleJour(cle))} : `) });
/** Bouton d'une heure du jour affiché (nom exact : « 15:00 », ou « 15:00 avec Dom » en « peu importe »). */
const heure = (page, nom) => page.locator('section[aria-labelledby="day-slots-title"]').getByRole('button', { name: nom, exact: true });
/** Jour choisi dans la bande. */
const jourChoisi = (page) => page.getByRole('region', { name: 'Choix du jour' }).locator('[data-day][aria-pressed="true"]');
/** Rangée qui défile de la bande de jours. */
const rangeeJours = (page) => page.getByRole('region', { name: 'Choix du jour' }).locator('[data-day]').first().locator('..');
const scrollLeft = (loc) => loc.evaluate(el => el.scrollLeft);
const confirmer = (page) => page.getByRole('button', { name: 'Confirmer le rendez-vous' });
const creations = (api) => api.requetesVers('POST', '/entities/Appointment');

/** Coupe, jeudi (J+2) à 15:00 avec Kevin, jusqu'à l'écran de confirmation. */
async function jusquaConfirmation(page, url = `/booking?services=${PRESTATIONS.coupe.id}`) {
  await page.goto(url);
  await boutonJour(page, jour(2)).click();
  await heure(page, '15:00').click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: 'Vérifiez et confirmez' })).toBeVisible();
}

test.beforeEach(async ({ connecter }) => {
  await connecter(CLIENT);
});

test.describe('sur ordinateur (1366 px, souris)', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test('bande de jours : la molette la fait défiler et mène à un jour de la fin du mois', async ({ page }) => {
    await page.goto(`/booking?services=${PRESTATIONS.coupe.id}`);
    const rangee = rangeeJours(page);
    await expect(rangee).toBeVisible();
    await rangee.hover();
    // La page vient de défiler (survol) : la molette lui reste 350 ms, comme pour un client qui lit
    await page.clock.runFor(500);
    // Avant : la molette faisait défiler la page, jamais la bande (barre de défilement masquée)
    await expect.poll(async () => { await page.mouse.wheel(0, 400); return scrollLeft(rangee); }, { timeout: 5000 })
      .toBeGreaterThan(600);
    // Un jour à plus de trois semaines, atteint à la souris seule, se choisit d'un clic
    const loin = boutonJour(page, jour(24));
    await expect.poll(async () => {
      if (await loin.isVisible() && await loin.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const p = el.parentElement.getBoundingClientRect();
        return r.left >= p.left && r.right <= p.right;
      })) return true;
      await page.mouse.wheel(0, 300);
      return false;
    }, { timeout: 8000 }).toBe(true);
    await loin.click();
    await expect(page.getByRole('heading', { name: new RegExp(`^${echapper(libelleJour(jour(24)))}$`, 'i') })).toBeVisible();
  });

  test('bande de jours : glisser à la souris la fait défiler sans choisir le jour sous le pointeur', async ({ page }) => {
    await page.goto(`/booking?services=${PRESTATIONS.coupe.id}`);
    const rangee = rangeeJours(page);
    await expect(jourChoisi(page)).toHaveCount(1);
    const choisiAvant = await jourChoisi(page).getAttribute('data-day');
    const box = await rangee.boundingBox();
    await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => scrollLeft(rangee)).toBeGreaterThan(300);
    // Le relâchement n'est pas un clic sur le jour qui se trouvait sous la souris
    await expect(jourChoisi(page)).toHaveAttribute('data-day', choisiAvant);
  });

  test('bande de jours : flèches du clavier d\'un jour à l\'autre, Entrée pour le choisir', async ({ page }) => {
    await page.goto(`/booking?services=${PRESTATIONS.coupe.id}`);
    const choisi = jourChoisi(page);
    await expect(choisi).toHaveAttribute('data-day', jour(0));
    await choisi.focus();
    for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowRight');
    await expect(boutonJour(page, jour(12))).toBeFocused();
    await expect(boutonJour(page, jour(12))).toBeInViewport();
    await page.keyboard.press('ArrowLeft');
    await expect(boutonJour(page, jour(11))).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: new RegExp(`^${echapper(libelleJour(jour(11)))}$`, 'i') })).toBeVisible();
  });

  test('produits de la confirmation : la molette fait défiler la rangée jusqu\'au dernier', async ({ page, api }) => {
    for (const [id, name, category] of [['prd-poudre', 'Poudre texture', 'coiffant'], ['prd-creme', 'Crème curly', 'soin'], ['prd-sel', 'Sel de mer', 'coiffant']]) {
      api.tables.Product.push({
        ...api.tables.Product[0], id, name, category, ref: id.toUpperCase(),
      });
    }
    await jusquaConfirmation(page);
    await page.getByRole('button', { name: 'Ajouter un produit de la boutique' }).click();
    const dernier = page.getByRole('button', { name: /^Ajouter .* au rendez-vous$/ }).last();
    await expect(dernier).toBeVisible();
    const rangee = dernier.locator('xpath=ancestor::div[contains(@class,"overflow-x-auto")][1]');
    expect(await rangee.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await rangee.hover();
    await page.clock.runFor(500);
    await expect.poll(async () => { await page.mouse.wheel(0, 300); return scrollLeft(rangee); }, { timeout: 5000 }).toBeGreaterThan(0);
    await expect.poll(async () => {
      const ok = await dernier.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const p = el.closest('.overflow-x-auto').getBoundingClientRect();
        return r.right <= p.right + 1;
      });
      if (!ok) await page.mouse.wheel(0, 300);
      return ok;
    }, { timeout: 5000 }).toBe(true);
  });
});

test.describe('prochaines disponibilités (carrousel partagé SnapCarousel)', () => {
  test.describe('à 1366 px, souris', () => {
    test.use({ viewport: { width: 1366, height: 900 } });

    test('flèches, molette et glisser font avancer les cartes, sans choisir celle sous le pointeur', async ({ page }) => {
      await page.goto(`/booking?services=${PRESTATIONS.coupe.id}`);
      const carrousel = page.getByRole('region', { name: 'Créneaux proposés' });
      await expect(carrousel.getByRole('button')).toHaveCount(6);
      const suivant = page.getByRole('button', { name: 'Disponibilités suivantes' });
      const precedent = page.getByRole('button', { name: 'Disponibilités précédentes' });
      await expect(precedent).toBeDisabled();
      // Avant : ni glisser ni molette, seuls les petits points menaient aux cartes suivantes
      await suivant.click();
      await expect.poll(() => scrollLeft(carrousel)).toBeGreaterThan(100);
      await expect(precedent).toBeEnabled();
      await precedent.click();
      await expect.poll(() => scrollLeft(carrousel)).toBe(0);

      // Molette : une carte par cran
      await carrousel.hover();
      await page.clock.runFor(500);
      await expect.poll(async () => { await page.mouse.wheel(0, 120); return scrollLeft(carrousel); }, { timeout: 5000 })
        .toBeGreaterThan(100);
      await precedent.click();
      await expect.poll(() => scrollLeft(carrousel)).toBe(0);

      // Glisser : la rangée suit la souris, le relâchement ne choisit pas l'heure sous le pointeur
      const box = await carrousel.boundingBox();
      await page.mouse.move(box.x + box.width - 40, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 12 });
      await page.mouse.up();
      await expect.poll(() => scrollLeft(carrousel)).toBeGreaterThan(100);
      await expect(carrousel.getByRole('button', { pressed: true })).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Votre réservation' })).toContainText('Choisissez une heure');
      // Un clic simple choisit toujours la carte
      await carrousel.getByRole('button').nth(3).click();
      await expect(carrousel.getByRole('button').nth(3)).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test('à 390 px : pas de flèches, le carrousel et ses points restent', async ({ page }) => {
    await page.goto(`/booking?services=${PRESTATIONS.coupe.id}`);
    const carrousel = page.getByRole('region', { name: 'Créneaux proposés' });
    await expect(carrousel.getByRole('button')).toHaveCount(6);
    // Flèches réservées à la souris sur écran large : masquées (hors de l'arbre d'accessibilité)
    await expect(page.getByRole('button', { name: /^Disponibilités (précédentes|suivantes)$/ })).toHaveCount(0);
    await expect(page.locator('[aria-label="Disponibilités suivantes"]')).toBeHidden();
    await carrousel.getByRole('button').first().click();
    await expect(carrousel.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  });
});

test('aucune place en deux semaines en « Peu importe » : pas de flèches promises, la bande de jours', async ({ page, api }) => {
  for (const b of Object.values(BARBERS)) {
    api.tables.TimeOff.push({ id: `conge-${b.id}`, employee_id: b.id, start_date: jour(-1), end_date: jour(20), status: 'approved' });
  }
  await page.goto(`/booking?services=${PRESTATIONS.coupe.id}`);
  await page.getByRole('group', { name: 'Choix du barber' }).getByRole('button', { name: 'Peu importe' }).click();
  await expect(page.getByText('Aucune place dans les deux prochaines semaines.')).toBeVisible();
  await expect(page.getByText('Faites glisser les jours ci-dessus pour voir les semaines suivantes.')).toBeVisible();
  await expect(page.getByText(/flèches/)).toHaveCount(0);
});

test('hors connexion à la confirmation : message tout de suite, rien d\'envoyé, heure gardée, puis réservation', async ({ page, context, api }) => {
  await jusquaConfirmation(page);
  await context.setOffline(true);
  await confirmer(page).click();
  // Avant : envoi mis en pause par React Query, « Confirmation… » sans fin, retour grisé, aucun mot
  await expect(toast(page, 'Pas de connexion internet : le rendez-vous n\'a pas été envoyé')).toBeVisible();
  await expect(confirmer(page)).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Étape précédente' })).toBeEnabled();
  await expect(page.getByText(`${libelleJour(jour(2))} · 15:00`, { exact: false })).toBeVisible();
  // Pas de « réponse perdue » : la requête n'est jamais partie
  await expect(toast(page, 'Connexion perdue')).toHaveCount(0);
  expect(creations(api)).toHaveLength(0);

  await context.setOffline(false);
  await confirmer(page).click();
  await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
  expect(creations(api)).toHaveLength(1);
  expect(creations(api)[0].corps).toMatchObject({ date: jour(2), start_time: '15:00' });
});

test('retour du navigateur : la confirmation revient au créneau, puis aux prestations, sans rien perdre', async ({ page }) => {
  await page.goto('/');
  await page.goto('/booking');
  await page.getByRole('button', { name: 'Choisir : Coupe', exact: true }).click();
  await boutonJour(page, jour(2)).click();
  await heure(page, '15:00').click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: 'Vérifiez et confirmez' })).toBeVisible();

  // Avant : le retour quittait la réservation (accueil), la sélection était perdue
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
  await expect(page).toHaveURL(/\/booking$/);
  await expect(heure(page, '15:00')).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Choisissez votre prestation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter Coupe à ma sélection' })).toHaveAttribute('aria-pressed', 'true');
  // Encore un retour : la page d'avant
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === '/');
});

test('« Étape précédente » jusqu\'au début : le retour du navigateur quitte ensuite la page du premier coup', async ({ page }) => {
  await page.goto('/');
  await page.goto('/booking');
  await page.getByRole('button', { name: 'Choisir : Coupe', exact: true }).click();
  await boutonJour(page, jour(2)).click();
  await heure(page, '15:00').click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: 'Vérifiez et confirmez' })).toBeVisible();
  await page.getByRole('button', { name: 'Étape précédente' }).click();
  await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
  await page.getByRole('button', { name: 'Étape précédente' }).click();
  await expect(page.getByRole('heading', { name: 'Choisissez votre prestation' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === '/');
});

test('« Réserver » de la barre du bas pendant un déplacement : le déplacement reste un déplacement', async ({ page, api }) => {
  await page.goto(`/booking?barber=${BARBERS.kevin.id}&services=${PRESTATIONS.coupeBarbe.id}&reschedule=apt-lointain-kevin`);
  await boutonJour(page, jour(13)).click();
  await heure(page, '10:00').click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('Déplacement de votre rendez-vous du')).toBeVisible();
  // Juste sous « Confirmer » : touché par erreur, il mène à /booking sans paramètre
  await page.locator('nav').getByRole('link', { name: 'Réserver' }).click();
  await expect(page).toHaveURL(/\/booking$/);
  // Avant : bandeau disparu, nouveau RDV créé sans `reschedule_of`, l'ancien restait prévu
  await expect(page.getByText('Déplacement de votre rendez-vous du')).toBeVisible();
  await confirmer(page).click();
  await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
  expect(creations(api)[0].corps).toMatchObject({ reschedule_of: 'apt-lointain-kevin', date: jour(13), start_time: '10:00' });
});

test('prestation retirée pendant la réservation (refus 400) : retour aux prestations avec le bandeau, plus de boucle', async ({ page, api }) => {
  await jusquaConfirmation(page);
  api.tables.Service = api.tables.Service.filter(s => s.id !== PRESTATIONS.coupe.id);
  api.surcharger('POST', '/entities/Appointment', () => ({ status: 400, json: { error: 'Prestation inconnue ou indisponible' } }));
  await confirmer(page).click();
  await expect(toast(page, 'Prestation inconnue ou indisponible')).toBeVisible();
  // Avant : on restait sur la confirmation, le même refus revenait à chaque « Confirmer »
  await expect(page.getByRole('heading', { name: 'Choisissez votre prestation' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Une prestation de votre rendez-vous n\'est plus proposée' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choisir : Coupe', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Votre réservation' })).toHaveCount(0);
});

test('déplacement sans rien changer : l\'heure actuelle n\'est pas proposée ; avec une prestation en plus, si', async ({ page }) => {
  // RDV à déplacer : dans six jours à 15:00 avec Kevin, Coupe + Barbe
  await page.goto(`/booking?barber=${BARBERS.kevin.id}&services=${PRESTATIONS.coupeBarbe.id}&reschedule=apt-lointain-kevin`);
  await boutonJour(page, jour(6)).click();
  await expect(heure(page, '14:30')).toBeVisible();
  // Avant : 15:00 était proposée comme libre (l'ancien RDV ne bloque pas les créneaux)
  await expect(heure(page, '15:00')).toHaveCount(0);
  // « Peu importe » : à 15:00, un autre barber libre est proposé, jamais Kevin
  await page.getByRole('group', { name: 'Choix du barber' }).getByRole('button', { name: 'Peu importe' }).click();
  await boutonJour(page, jour(6)).click();
  await expect(heure(page, '15:00 avec Dom')).toBeVisible();
  await expect(heure(page, '15:00 avec Kevin')).toHaveCount(0);

  // Barbe en plus : compléter son rendez-vous à la même heure reste possible
  await page.getByRole('group', { name: 'Choix du barber' }).getByRole('button', { name: /Kevin/ }).click();
  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter Barbe à ma sélection' }).click();
  await page.getByRole('button', { name: 'Continuer', disabled: false }).click();
  await boutonJour(page, jour(6)).click();
  await expect(heure(page, '15:00')).toBeVisible();
});

test('refus du serveur à la confirmation : mesuré (statut et code), sans message ni identifiant', async ({ page, api }) => {
  api.surcharger('POST', '/entities/Appointment', () => ({ status: 409, json: { error: 'Ce créneau vient d\'être réservé, choisissez-en un autre.', code: 'slot_taken' } }));
  await jusquaConfirmation(page);
  await confirmer(page).click();
  await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
  // Envoi groupé de la mesure d'audience : toutes les 15 s
  await page.clock.runFor(16_000);
  const evenement = async () => api.requetesVers('POST', '/analytics/collect')
    .flatMap(r => (Array.isArray(r.corps?.events) ? r.corps.events : []))
    .find(e => e.name === 'booking_error');
  await expect.poll(evenement, { timeout: 8000 }).toBeTruthy();
  const e = await evenement();
  expect(e).toMatchObject({ type: 'action', props: { status: 409, code: 'slot_taken', reschedule: false } });
  expect(JSON.stringify(e)).not.toMatch(/réservé|@|emp-|srv-/);
});
