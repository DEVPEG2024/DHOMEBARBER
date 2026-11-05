// Carte Gang niveau Icône, « La Lame » (5 nov. 2026) : acier de Damas, rasoirs en cimier, photo en noir
// et blanc ; une fois par ouverture de l'app, deux lames tranchent l'écran sans jamais bloquer un toucher.
import { test, expect } from './support/test.js';
import { CLIENT } from './support/donnees.js';
import { jour } from './support/temps.js';
import { debordementHorizontal } from './support/outils.js';

const PHOTO = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';

const carte = (tier = 'icone', extra = {}) => ({
  tier, tier_label: tier === 'icone' ? 'Icône' : 'Or', edition: null, public_edition: null, name: 'Yanis K.', photo_url: null,
  serial: 142, pos: 'CLA', score: 94, stats: { FID: 99, REG: 94, PON: 96, STY: 92, GNG: 88, FRA: 97 },
  visits: 27, first_visit: jour(-1200), last_visit: jour(-9), days_since_last: 9, barber: 'Kevin', favorite: 'Coupe Homme', next: null,
  badges: [{ key: 'premiere_coupe', emoji: '🎉', label: 'Première coupe', description: 'Ta toute première visite au salon', unlocked: true, progress: null }],
  ...extra,
});

function installer(api, card) {
  api.surcharger('GET', '/gang-card/me', () => ({
    json: { card, seen_tier: card.tier, level_up: false, leaderboard_opt_in: false, tiers: [], seen_badges: [], new_badges: [], upcoming: null },
  }));
}

const RASOIRS = '[data-gang-rasoirs]';
const ACIER = '[data-gang-acier]';
const RIDEAU = '[data-gang-rideau]';

test.describe('Carte Icône : le dessin', () => {
  test.beforeEach(async ({ page, connecter }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await connecter(CLIENT);
  });

  test('acier, rasoirs, police de la carte, et aucune arrivée quand les animations sont réduites', async ({ page, api }) => {
    installer(api, carte());
    await page.goto('/gang-card');
    const groupe = page.getByRole('group', { name: 'Carte Icône de Yanis K.' });
    await expect(groupe).toBeVisible();
    await expect(page.locator(RASOIRS)).toHaveCount(1);
    await expect(groupe.locator(ACIER)).toHaveCount(2); // recto et verso
    await expect(page.locator(RIDEAU)).toHaveCount(0);
    const nom = groupe.getByText('YANIS K.', { exact: true });
    await expect(nom).toHaveCSS('font-family', /Bodoni Moda/);
    // Le fond est bien l'image d'acier, servie par le build
    const fond = await groupe.locator(`${ACIER} > div`).first().evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(fond).toContain('acier-damas');
    const url = fond.match(/url\("([^"]+)"\)/)?.[1];
    expect((await page.request.get(url)).status()).toBe(200);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
  });

  test('la photo du client passe en noir et blanc, fondue dans l\'acier', async ({ page, api }) => {
    installer(api, carte('icone', { photo_url: PHOTO }));
    await page.goto('/gang-card');
    const photo = page.getByRole('group', { name: 'Carte Icône de Yanis K.' }).locator(`img[src="${PHOTO}"]`);
    await expect(photo).toHaveCSS('filter', /grayscale\(1\)/);
  });

  test('les étoiles déclenchent le coup de lame sans retourner la carte ; le verso reste lisible', async ({ page, api }) => {
    installer(api, carte());
    await page.goto('/gang-card');
    const groupe = page.getByRole('group', { name: 'Carte Icône de Yanis K.' });
    await groupe.getByRole('button', { name: /surprise/ }).click();
    const retourner = groupe.locator('.gang-flip');
    await expect(retourner).toHaveAttribute('aria-pressed', 'false');
    await retourner.dispatchEvent('click');
    await expect(retourner).toHaveAttribute('aria-pressed', 'true');
    await expect(groupe.getByText('Visites au salon')).toBeAttached();
    await expect(groupe.getByRole('img', { name: /Écussons/ })).toBeAttached();
  });

  for (const largeur of [320, 390, 430]) {
    test(`le cimier de rasoirs ne crée aucun défilement à ${largeur} px, ni sur le Profil`, async ({ page, api }) => {
      await page.setViewportSize({ width: largeur, height: 800 });
      installer(api, carte());
      await page.goto('/gang-card');
      await expect(page.locator(RASOIRS)).toHaveCount(1);
      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
      await page.goto('/profile');
      await expect(page.locator(RASOIRS)).toHaveCount(1);
      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    });
  }

  test('les autres niveaux n\'ont ni acier ni rasoirs', async ({ page, api }) => {
    installer(api, carte('or'));
    await page.goto('/gang-card');
    await expect(page.getByRole('group', { name: 'Carte Or de Yanis K.' })).toBeVisible();
    await expect(page.locator(RASOIRS)).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Carte Or de Yanis K.' }).locator(ACIER)).toHaveCount(0);
  });
});

test.describe('Carte Icône : les lames à l\'arrivée', () => {
  test.beforeEach(async ({ page, connecter }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await connecter(CLIENT);
  });

  test('le rideau couvre la page sans bloquer un toucher, une seule fois par ouverture', async ({ page, api }) => {
    installer(api, carte());
    await page.goto('/gang-card');
    const rideau = page.locator(RIDEAU);
    await expect(rideau).toHaveCount(1);
    const infos = await rideau.evaluate((el) => {
      const pris = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return {
        dansBody: el.parentElement === document.body,
        toucher: getComputedStyle(el).pointerEvents,
        position: getComputedStyle(el).position,
        attrape: !!pris?.closest('[data-gang-rideau]'),
        fenetre: el.hasAttribute('data-app-overlay'),
      };
    });
    expect(infos).toEqual({ dansBody: true, toucher: 'none', position: 'fixed', attrape: false, fenetre: true });

    // Fin de l'arrivée : plus de rideau, les rasoirs restent
    await page.clock.runFor(4000);
    await expect(rideau).toHaveCount(0);
    await expect(page.locator(RASOIRS)).toHaveCount(1);

    // Une autre page de la même ouverture : la carte arrive simplement
    await page.locator('a[href="/profile"]').first().dispatchEvent('click');
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.locator(RASOIRS)).toHaveCount(1);
    await expect(rideau).toHaveCount(0);
  });

  test('la révélation d\'un nouveau niveau reste au-dessus du rideau de la page', async ({ page, api }) => {
    api.surcharger('GET', '/gang-card/me', () => ({
      json: { card: carte(), seen_tier: 'tots', level_up: true, leaderboard_opt_in: false, tiers: [], seen_badges: [], new_badges: [], upcoming: null },
    }));
    api.surcharger('POST', '/gang-card/seen', () => ({ json: { ok: true } }));
    await page.goto('/gang-card');
    const revelation = page.locator('[data-gang-overlay]').first();
    await expect(revelation).toBeVisible();
    const hauteur = (el) => Number(getComputedStyle(el).zIndex);
    const zRevelation = await revelation.evaluate(hauteur);
    if (await page.locator(RIDEAU).count()) {
      expect(await page.locator(RIDEAU).evaluate(hauteur)).toBeLessThan(zRevelation);
    }
    // La carte de la révélation n'a jamais d'arrivée à elle (un seul rideau, celui de la page)
    await expect(page.locator(RIDEAU)).toHaveCount(await page.locator(RIDEAU).count());
    expect(await page.locator(RIDEAU).count()).toBeLessThanOrEqual(1);
  });
});
