// Écran du salon, côté admin (Admin → La Coupe du Gang → « Écran du salon » ; contrat
// docs/fonctions/coupe-spectateurs-contrat.md, sections 2 et 4.2) : liste (nom, vu pour la dernière
// fois, date de création), créer un lien (lien et QR montrés une seule fois, « Copier »), 5 écrans au
// plus, 10 créations par heure, « Couper » confirmé (l'écran affiché s'éteint), mention de ce qui passe
// à l'écran, drapeau éteint (ni section ni lecture), panne réseau, 320 px. Faux serveur : `api.ecran`
// (e2e/support/fauxEcran.js).
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { ADMIN } from './support/donnees.js';
import { attendreSansDebordement, toast } from './support/outils.js';
import { CLE_ECRAN, ECRAN_TELE } from './support/fauxEcran.js';

const section = (page) => page.getByRole('region', { name: 'Écran du salon' });
const liste = (page) => section(page).getByRole('list', { name: 'Écrans' });
const fenetre = (page) => page.getByRole('dialog');
const appelsEcrans = (api) => api.requetes.filter((r) => r.chemin.startsWith('/coupe/admin/screens'));

/** « Créé le 29 oct. » (même année) ou « Créé le 29 déc. 2025 », heure de Paris, comme l'admin. */
function creeLe(iso, maintenant) {
  const jour = (d, annee) => new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', day: 'numeric', month: 'short', ...(annee ? { year: 'numeric' } : {}),
  }).format(d);
  const an = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric' }).format(d);
  const d = new Date(iso);
  return `Créé le ${jour(d, an(d) !== an(maintenant))}`;
}

test.describe('Écran du salon : admin', () => {
  test('liste : nom, vu pour la dernière fois, allumé ; un écran coupé n’y est plus ; ce qui passe à l’écran', async ({ page, connecter }) => {
    await connecter(ADMIN);
    await page.goto('/admin/coupe');
    await expect(section(page).getByRole('heading', { name: 'Écran du salon' })).toBeVisible();
    await expect(section(page)).toContainText(
      'Seuls les matchs de tournoi et les matchs dont les deux joueurs ont allumé « Laisser regarder mes matchs » passent à l’écran.',
    );
    const tele = liste(page).getByRole('listitem').filter({ hasText: 'Télé du salon' });
    await expect(tele).toContainText(/Vu pour la dernière fois aujourd’hui à \d{2}:\d{2}/);
    await expect(tele).toContainText('Allumé');
    await expect(liste(page).getByRole('listitem')).toHaveCount(1);
    await expect(section(page)).not.toContainText('Ancienne tablette');
    // Jamais la clé d'un écran dans la liste
    await expect(section(page)).not.toContainText(CLE_ECRAN);
  });

  test('date de création à côté du nom : deux écrans du même nom se distinguent (A12)', async ({ page, api, connecter }) => {
    // Deux « Écran du salon » : l'ancien (il y a 40 jours) et un nouveau, créé aujourd'hui
    const t0 = api.maintenant();
    api.ecran.ecrans.push({
      id: 'eeeeeeee-0000-4000-8000-000000000003', label: 'Écran du salon', cle: 'EcranAncien_e2e_0123456789abcd',
      created_at: new Date(t0.getTime() - 40 * 86_400_000).toISOString(), last_seen_at: null, revoked_at: null,
    });
    await connecter(ADMIN);
    await page.goto('/admin/coupe');
    const tele = liste(page).getByRole('listitem').filter({ hasText: 'Télé du salon' });
    await expect(tele).toContainText(creeLe(api.ecran.ecrans[0].created_at, t0));
    const ancien = liste(page).getByRole('listitem').filter({ hasText: 'Écran du salon' });
    await expect(ancien).toContainText(creeLe(api.ecran.ecrans[2].created_at, t0));

    await section(page).getByRole('button', { name: 'Nouveau lien' }).click();
    await fenetre(page).getByRole('button', { name: 'Créer le lien' }).click();
    await fenetre(page).getByRole('button', { name: 'Terminé' }).click();
    const ecransDuSalon = liste(page).getByRole('listitem').filter({ hasText: 'Écran du salon' });
    await expect(ecransDuSalon).toHaveCount(2);
    // Le plus récent d'abord (comme le serveur)
    await expect(ecransDuSalon.first()).toContainText('Créé aujourd’hui');
    await expect(ecransDuSalon.nth(1)).toContainText(creeLe(api.ecran.ecrans[2].created_at, t0));
  });

  test('10 créations par heure au plus (429) : message du serveur, rien de créé', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    const compte = api.comptes.find((c) => c.email === ADMIN.email);
    api.ecran.creationsParCompte.set(compte.id, Array.from({ length: 10 }, () => Date.now()));
    await page.goto('/admin/coupe');
    await section(page).getByRole('button', { name: 'Nouveau lien' }).click();
    await fenetre(page).getByLabel('Nom de l’écran').fill('Écran de trop');
    await fenetre(page).getByRole('button', { name: 'Créer le lien' }).click();
    await expect(fenetre(page).getByRole('alert')).toContainText('Trop d’écrans créés d’affilée');
    await expect(fenetre(page).getByRole('heading', { name: 'Nouveau lien d’écran' })).toBeVisible();
    expect(api.ecran.actifs()).toHaveLength(1);
  });

  test('créer un lien : lien et QR montrés une seule fois, « Copier », puis l’écran dans la liste', async ({ page, api, connecter, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await connecter(ADMIN);
    await page.goto('/admin/coupe');
    await section(page).getByRole('button', { name: 'Nouveau lien' }).click();
    await expect(fenetre(page).getByRole('heading', { name: 'Nouveau lien d’écran' })).toBeVisible();
    await fenetre(page).getByLabel('Nom de l’écran').fill('Télé de l’entrée');
    await fenetre(page).getByRole('button', { name: 'Créer le lien' }).click();

    await expect(fenetre(page).getByRole('heading', { name: 'Lien de l’écran créé' })).toBeVisible();
    await expect(fenetre(page)).toContainText('Ce lien n’est montré qu’une fois.');
    const lien = fenetre(page).getByLabel('Lien de « Télé de l’entrée »');
    const url = await lien.inputValue();
    expect(url).toMatch(/^https:\/\/dhomebarber\.fr\/ecran#cle=[A-Za-z0-9_-]{16,}$/);
    await expect(fenetre(page).locator('[data-qr-url]')).toHaveAttribute('data-qr-url', url);
    const creation = api.requetesVers('POST', '/coupe/admin/screens');
    expect(creation.map((r) => r.corps)).toEqual([{ label: 'Télé de l’entrée' }]);

    await fenetre(page).getByRole('button', { name: 'Copier le lien' }).click();
    await expect(toast(page, 'Lien copié')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

    // Fermée par la croix : le lien n'est plus montré nulle part
    await fenetre(page).getByRole('button', { name: 'Close' }).click();
    await expect(fenetre(page)).toHaveCount(0);
    await expect(liste(page).getByRole('listitem').filter({ hasText: 'Télé de l’entrée' })).toContainText('Jamais ouvert');
    await expect(page.getByText(url)).toHaveCount(0);
    await section(page).getByRole('button', { name: 'Nouveau lien' }).click();
    await expect(fenetre(page).getByLabel('Nom de l’écran')).toHaveValue('');
    await expect(fenetre(page).locator('[data-qr-url]')).toHaveCount(0);
  });

  test('nom vide : « Écran du salon » ; 5 écrans au plus (409)', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    await page.goto('/admin/coupe');
    await section(page).getByRole('button', { name: 'Nouveau lien' }).click();
    await fenetre(page).getByRole('button', { name: 'Créer le lien' }).click();
    await expect(fenetre(page).getByLabel('Lien de « Écran du salon »')).toBeVisible();
    expect(api.requetesVers('POST', '/coupe/admin/screens').map((r) => r.corps)).toEqual([{}]);
    await fenetre(page).getByRole('button', { name: 'Terminé' }).click();

    // 2 actifs : trois de plus, puis le 6e refusé
    for (let i = 0; i < 3; i += 1) {
      await section(page).getByRole('button', { name: 'Nouveau lien' }).click();
      await fenetre(page).getByLabel('Nom de l’écran').fill(`Écran ${i + 3}`);
      await fenetre(page).getByRole('button', { name: 'Créer le lien' }).click();
      await expect(fenetre(page).getByRole('heading', { name: 'Lien de l’écran créé' })).toBeVisible();
      await fenetre(page).getByRole('button', { name: 'Terminé' }).click();
    }
    await expect(liste(page).getByRole('listitem')).toHaveCount(5);
    await section(page).getByRole('button', { name: 'Nouveau lien' }).click();
    await fenetre(page).getByLabel('Nom de l’écran').fill('Écran de trop');
    await fenetre(page).getByRole('button', { name: 'Créer le lien' }).click();
    await expect(fenetre(page).getByRole('alert')).toHaveText('5 écrans au plus : coupez-en un dans la liste avant d’en créer un autre.');
    await expect(fenetre(page).getByRole('heading', { name: 'Nouveau lien d’écran' })).toBeVisible();
  });

  test('« Couper » confirmé : l’écran disparaît de la liste et l’écran affiché s’éteint', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    await page.goto('/admin/coupe');
    const tele = liste(page).getByRole('listitem').filter({ hasText: 'Télé du salon' });
    await tele.getByRole('button', { name: 'Couper Télé du salon' }).click();
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation.getByRole('heading', { name: 'Couper « Télé du salon » ?' })).toBeVisible();
    await expect(confirmation).toContainText('L’écran s’éteint tout de suite et son lien ne marchera plus.');
    await confirmation.getByRole('button', { name: 'Annuler' }).click();
    await expect(tele).toBeVisible();
    expect(api.requetesVers('DELETE', /^\/coupe\/admin\/screens\//)).toEqual([]);

    await tele.getByRole('button', { name: 'Couper Télé du salon' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Couper l’écran' }).click();
    await expect(toast(page, '« Télé du salon » est coupé')).toBeVisible();
    await expect(section(page)).toContainText('Aucun écran pour le moment.');
    expect(api.requetesVers('DELETE', `/coupe/admin/screens/${ECRAN_TELE}`)).toHaveLength(1);

    // L'écran du salon (même appareil, autre onglet) passe à « Écran coupé par le salon »
    const ecran = await page.context().newPage();
    await ecran.goto(`/ecran#cle=${CLE_ECRAN}`);
    await expect(ecran.getByRole('heading', { name: 'Écran coupé par le salon' })).toBeVisible();
    await ecran.close();
  });

  test('regarder fermé (`features.coupeSpectators` faux) : ni section ni lecture', async ({ page, api, connecter }) => {
    api.donnees.parametresPublics.features.coupeSpectators = false;
    await connecter(ADMIN);
    await page.goto('/admin/coupe');
    await expect(page.getByRole('heading', { level: 1, name: 'La Coupe du Gang' })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(section(page)).toHaveCount(0);
    expect(appelsEcrans(api)).toEqual([]);
  });

  test('panne réseau : « Pas de connexion internet » avant tout état vide, puis Réessayer', async ({ page, api, connecter }) => {
    let coupe = true;
    api.surcharger('GET', '/coupe/admin/screens', () => (coupe ? RESEAU_COUPE : undefined));
    await connecter(ADMIN);
    await page.goto('/admin/coupe');
    await expect(section(page).getByRole('alert')).toContainText('Pas de connexion internet', { timeout: 15_000 });
    await expect(section(page)).not.toContainText('Aucun écran');
    coupe = false;
    await section(page).getByRole('button', { name: 'Réessayer' }).click();
    await expect(liste(page).getByRole('listitem').filter({ hasText: 'Télé du salon' })).toBeVisible();
  });

  test('320 px : aucun défilement horizontal, fenêtre du lien lisible', async ({ page, connecter }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await connecter(ADMIN);
    await page.goto('/admin/coupe');
    await expect(section(page)).toBeVisible();
    await attendreSansDebordement(page, 'Admin → La Coupe du Gang (écran du salon)');
    await section(page).getByRole('button', { name: 'Nouveau lien' }).click();
    await fenetre(page).getByRole('button', { name: 'Créer le lien' }).click();
    await expect(fenetre(page).getByRole('button', { name: 'Copier le lien' })).toBeInViewport();
    await attendreSansDebordement(page, 'fenêtre du lien de l’écran');
  });
});
