// Looks d'un barber sur son profil (/barber/:id, 21 oct. 2026) : section « Les looks de Kevin »,
// filtres, look vedette, visionneuse « story » où le client ajuste le look, adresse partagée avec
// la réservation (`?look=<clé>&services=…`). L'écran de réservation lui-même est vérifié ailleurs :
// ici, seule l'adresse d'arrivée compte.
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { CLIENT, LOOKS, PRESTATIONS, cleLook } from './support/donnees.js';
import { attendreSansDebordement } from './support/outils.js';

const PROFIL_KEVIN = '/barber/emp-kevin';
const CLE_COMPLET = cleLook(LOOKS.kevinComplet);
const CLE_DEGRADE = cleLook(LOOKS.kevinDegrade);
const CLE_SANS = cleLook(LOOKS.kevinSansPrestation);

const section = (page, prenom = 'Kevin') => page.getByRole('region', { name: `Les looks de ${prenom}` });
const vedette = (page) => section(page).getByRole('article', { name: /^Look vedette : / });
const vignettes = (page) => section(page).getByRole('list', { name: 'Autres looks' }).getByRole('listitem');
const visionneuse = (page) => page.getByRole('dialog', { name: 'Les looks de Kevin' });
const prestationsDuLook = (page) => visionneuse(page).getByRole('group', { name: 'Prestations du look' });
const enPlus = (page) => visionneuse(page).getByRole('group', { name: 'En plus' });
const total = (page) => visionneuse(page).getByRole('status');
const ligne = (page, nom) => prestationsDuLook(page).getByRole('button', { name: new RegExp(`^${nom} `) });

/** Paramètres de l'adresse en cours (les virgules y sont encodées en %2C). */
const parametres = (page) => Object.fromEntries(new URL(page.url()).searchParams);

/** Ouvre la visionneuse en touchant le look vedette (hors du bouton « Réserver ce look »). */
async function ouvrirVedette(page) {
  await vedette(page).getByRole('button', { name: /^Voir le look/ }).click();
  await expect(visionneuse(page)).toBeVisible();
}

test.describe('Looks du barber sur son profil', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(CLIENT);
  });

  test('section « Les looks de Kevin » : nombre de looks, filtres et leur compte', async ({ page }) => {
    await page.goto(PROFIL_KEVIN);
    const looks = section(page);
    await expect(looks.getByRole('heading', { name: 'Les looks de Kevin' })).toBeVisible();
    await expect(looks.getByText('4 looks · touchez une photo pour l\'ajuster')).toBeVisible();

    const filtres = looks.getByRole('group', { name: 'Filtrer les looks' });
    await expect(filtres.getByRole('button')).toHaveText(['Tous 4', 'Coupes 2', 'Barbe 1', 'Couleur 1', 'Enfants 1']);
    await expect(filtres.getByRole('button', { name: 'Tous 4' })).toHaveAttribute('aria-pressed', 'true');

    // Tous : le look complet en vedette, puis les trois autres photos (dont celle sans prestation)
    await expect(vedette(page)).toHaveAccessibleName(/^Look vedette : Dégradé, barbe et couleur, 85 €/);
    await expect(vignettes(page)).toHaveCount(3);
    await expect(vignettes(page).getByRole('button', { name: 'Réalisation de Kevin', exact: true })).toBeVisible();

    // Enfants : le look enfant seul, en vedette (pas de badge « Look complet » pour une prestation)
    await filtres.getByRole('button', { name: 'Enfants 1' }).click();
    await expect(filtres.getByRole('button', { name: 'Enfants 1' })).toHaveAttribute('aria-pressed', 'true');
    await expect(vedette(page)).toHaveAccessibleName('Look vedette : Étoile pour les petits, 18 €, 30 min, 1 prestation');
    await expect(vedette(page).getByText(/Look complet/i)).toHaveCount(0);
    await expect(vignettes(page)).toHaveCount(0);

    // Coupes : le look complet et « Dégradé à blanc » ; jamais la photo sans prestation
    await filtres.getByRole('button', { name: 'Coupes 2' }).click();
    await expect(vedette(page)).toHaveAccessibleName(/^Look vedette : Dégradé, barbe et couleur/);
    await expect(vignettes(page)).toHaveCount(1);
    await expect(vignettes(page).first()).toContainText('Dégradé à blanc');
    await expect(looks.getByRole('button', { name: 'Réalisation de Kevin', exact: true })).toHaveCount(0);
  });

  test('look vedette : badge, prestations et total justes, « Réserver ce look » va droit aux créneaux', async ({ page }) => {
    await page.goto(PROFIL_KEVIN);
    const carte = vedette(page);
    await expect(carte.getByText(/^Look complet · 3 prestations$/i)).toBeVisible();
    await expect(carte.getByRole('heading', { name: 'Dégradé, barbe et couleur' })).toBeVisible();
    await expect(carte.getByRole('list', { name: 'Prestations du look' }).getByRole('listitem'))
      .toHaveText(['Coloration', 'Coupe', 'Barbe']);
    // Coloration 45 + Coupe 25 + Barbe 15 ; 60 + 30 + 20 min
    await expect(carte.getByText('85 €', { exact: true })).toBeVisible();
    await expect(carte.getByText('1 h 50', { exact: true })).toBeVisible();

    await carte.getByRole('button', { name: 'Réserver ce look' }).click();
    await page.waitForURL(/\/booking\?/);
    expect(new URL(page.url()).pathname).toBe('/booking');
    expect(parametres(page)).toEqual({
      barber: 'emp-kevin',
      services: 'srv-couleur,srv-coupe,srv-barbe',
      from: 'gallery',
      look: CLE_COMPLET,
    });

    // Retour : la visionneuse s'ouvre sur ce look, le look entier coché
    await page.goBack();
    await expect(visionneuse(page)).toBeVisible();
    expect(parametres(page)).toEqual({ look: CLE_COMPLET, services: 'srv-couleur,srv-coupe,srv-barbe' });
    await expect(total(page)).toHaveText('85 € · 1 h 50 · 3 prestations');
  });

  test('visionneuse : décocher, dernière prestation gardée, complément, puis créneaux et retour à l\'identique', async ({ page }) => {
    await page.goto(PROFIL_KEVIN);
    await ouvrirVedette(page);
    expect(new URL(page.url()).pathname).toBe(PROFIL_KEVIN);
    expect(parametres(page)).toEqual({ look: CLE_COMPLET });

    const dialogue = visionneuse(page);
    await expect(dialogue.getByRole('heading', { name: 'Dégradé, barbe et couleur' })).toBeVisible();
    await expect(dialogue.getByText('Look 1 / 4 · glissez pour le suivant')).toBeVisible();
    for (const nom of ['Coloration', 'Coupe', 'Barbe']) {
      await expect(ligne(page, nom)).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(ligne(page, 'Coloration')).toContainText('45 € · 1 h');
    await expect(total(page)).toHaveText('85 € · 1 h 50 · 3 prestations');

    // Décocher : le total baisse
    await ligne(page, 'Barbe').click();
    await expect(ligne(page, 'Barbe')).toHaveAttribute('aria-pressed', 'false');
    await expect(total(page)).toHaveText('70 € · 1 h 30 · 2 prestations');
    await ligne(page, 'Coupe').click();
    await expect(total(page)).toHaveText('45 € · 1 h · 1 prestation');

    // La dernière prestation du look ne se décoche pas
    await expect(ligne(page, 'Coloration')).toBeDisabled();
    await expect(ligne(page, 'Coloration')).toHaveAttribute('aria-pressed', 'true');
    await expect(dialogue.getByText('Gardez au moins une prestation')).toBeVisible();
    await expect(ligne(page, 'Coloration')).toHaveAccessibleDescription('Gardez au moins une prestation');

    // Complément « En plus » : ajouté coché, compté dans le total
    const soin = enPlus(page).getByRole('button', { name: 'Soin du visage · 25 €' });
    await expect(soin).toHaveAttribute('aria-pressed', 'false');
    await soin.click();
    await expect(soin).toHaveAttribute('aria-pressed', 'true');
    await expect(total(page)).toHaveText('70 € · 1 h 30 · 2 prestations');
    // Le complément ne compte pas : la coloration reste la seule prestation du look, toujours gardée ;
    // une autre prestation du look recochée, elle peut de nouveau se retirer
    await expect(ligne(page, 'Coloration')).toBeDisabled();
    await ligne(page, 'Coupe').click();
    await expect(ligne(page, 'Coloration')).toBeEnabled();
    await expect(total(page)).toHaveText('95 € · 2 h · 3 prestations');
    await ligne(page, 'Coupe').click();
    await expect(total(page)).toHaveText('70 € · 1 h 30 · 2 prestations');

    // Créneaux de Kevin avec la sélection ajustée
    await dialogue.getByRole('button', { name: 'Choisir mon créneau avec Kevin' }).click();
    await page.waitForURL(/\/booking\?/);
    expect(new URL(page.url()).pathname).toBe('/booking');
    expect(parametres(page)).toEqual({
      barber: 'emp-kevin',
      services: `${PRESTATIONS.couleur.id},${PRESTATIONS.soin.id}`,
      from: 'gallery',
      look: CLE_COMPLET,
    });

    // Retour navigateur : la visionneuse rouverte sur ce look, avec la même sélection
    await page.goBack();
    await expect(visionneuse(page)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(PROFIL_KEVIN);
    expect(parametres(page)).toEqual({ look: CLE_COMPLET, services: 'srv-couleur,srv-soin' });
    await expect(ligne(page, 'Coloration')).toHaveAttribute('aria-pressed', 'true');
    await expect(ligne(page, 'Coupe')).toHaveAttribute('aria-pressed', 'false');
    await expect(ligne(page, 'Barbe')).toHaveAttribute('aria-pressed', 'false');
    await expect(enPlus(page).getByRole('button', { name: 'Soin du visage · 25 €' })).toHaveAttribute('aria-pressed', 'true');
    await expect(total(page)).toHaveText('70 € · 1 h 30 · 2 prestations');
  });

  test('look « Dégradé à blanc » rangé à l\'ancienne (service_id seul) : relié à Coupe 25 €', async ({ page }) => {
    await page.goto(PROFIL_KEVIN);
    const tuile = vignettes(page).getByRole('button', { name: /^Dégradé à blanc/ });
    await expect(tuile).toHaveAccessibleName('Dégradé à blanc, 25 €, 30 min, 1 prestation');
    await expect(tuile).toContainText('25 €');
    await expect(tuile).toContainText('30 min · 1 prestation');

    await tuile.click();
    await expect(visionneuse(page)).toBeVisible();
    expect(parametres(page)).toEqual({ look: CLE_DEGRADE });
    await expect(visionneuse(page).getByRole('heading', { name: 'Dégradé à blanc' })).toBeVisible();
    // Une seule prestation : rien à décocher ; compléments de la coupe proposés
    await expect(prestationsDuLook(page)).toContainText('Coupe');
    await expect(prestationsDuLook(page)).toContainText('25 € · 30 min');
    await expect(prestationsDuLook(page).getByRole('button')).toHaveCount(0);
    await expect(enPlus(page).getByRole('button')).toHaveText(['Barbe · 15 €', 'Soin du visage · 25 €']);
    await expect(total(page)).toHaveText('25 € · 30 min · 1 prestation');
    await enPlus(page).getByRole('button', { name: 'Barbe · 15 €' }).click();
    await expect(total(page)).toHaveText('40 € · 50 min · 2 prestations');
  });

  test('photo sans prestation : « Réserver avec Kevin » ouvre la réservation avec Kevin seul', async ({ page }) => {
    await page.goto(PROFIL_KEVIN);
    await vignettes(page).getByRole('button', { name: 'Réalisation de Kevin', exact: true }).click();
    await expect(visionneuse(page)).toBeVisible();
    expect(parametres(page)).toEqual({ look: CLE_SANS });
    await expect(visionneuse(page).getByRole('heading', { name: 'Réalisation de Kevin' })).toBeVisible();
    await expect(prestationsDuLook(page)).toHaveCount(0);
    await expect(visionneuse(page).getByText('€')).toHaveCount(0);

    await visionneuse(page).getByRole('button', { name: 'Réserver avec Kevin' }).click();
    await page.waitForURL(/\/booking/);
    expect(new URL(page.url()).pathname).toBe('/booking');
    expect(parametres(page)).toEqual({ barber: 'emp-kevin' });
  });

  test('suivant / précédent : flèches, clavier et glissé en boucle, sélection remise à zéro ; Échap et croix', async ({ page }) => {
    await page.goto(PROFIL_KEVIN);
    await ouvrirVedette(page);
    const dialogue = visionneuse(page);
    const position = (n) => dialogue.getByText(`Look ${n} / 4 · glissez pour le suivant`);

    // Une sélection modifiée, puis un autre look : en revenant, le look entier est recoché
    await ligne(page, 'Barbe').click();
    await expect(total(page)).toHaveText('70 € · 1 h 30 · 2 prestations');

    await dialogue.getByRole('button', { name: 'Look suivant' }).click();
    await expect(position(2)).toBeVisible();
    await expect(dialogue.getByRole('heading', { name: 'Dégradé à blanc' })).toBeVisible();
    expect(parametres(page)).toEqual({ look: CLE_DEGRADE });

    // ← au clavier : précédent ; le barber ne change pas (le profil écoute aussi les flèches)
    await page.keyboard.press('ArrowLeft');
    await expect(position(1)).toBeVisible();
    await expect(ligne(page, 'Barbe')).toHaveAttribute('aria-pressed', 'true');
    await expect(total(page)).toHaveText('85 € · 1 h 50 · 3 prestations');
    expect(new URL(page.url()).pathname).toBe(PROFIL_KEVIN);

    // En boucle : avant le premier, le dernier
    await dialogue.getByRole('button', { name: 'Look précédent' }).click();
    await expect(position(4)).toBeVisible();
    await expect(dialogue.getByRole('heading', { name: 'Réalisation de Kevin' })).toBeVisible();

    // Glissé vers la gauche : look suivant (retour au premier)
    const photo = dialogue.getByRole('img', { name: 'Réalisation de Kevin' });
    const cadre = await photo.boundingBox();
    const y = cadre.y + cadre.height / 2;
    await page.mouse.move(cadre.x + cadre.width * 0.75, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1) await page.mouse.move(cadre.x + cadre.width * 0.75 - i * 25, y);
    await page.mouse.up();
    await expect(position(1)).toBeVisible();
    expect(parametres(page)).toEqual({ look: CLE_COMPLET });

    // → au clavier : suivant
    await page.keyboard.press('ArrowRight');
    await expect(position(2)).toBeVisible();

    // Échap ferme et retire les paramètres de l'adresse
    await page.keyboard.press('Escape');
    await expect(dialogue).toHaveCount(0);
    expect(page.url()).toMatch(/\/barber\/emp-kevin$/);

    // La croix aussi
    await ouvrirVedette(page);
    await dialogue.getByRole('button', { name: 'Fermer' }).click();
    await expect(dialogue).toHaveCount(0);
    expect(page.url()).toMatch(/\/barber\/emp-kevin$/);
  });

  test('adresse : clé inconnue ou d\'un autre barber retirée, sélection étrangère au look ignorée', async ({ page }) => {
    // Clé inconnue : rien ne s'ouvre, paramètres retirés
    await page.goto(`${PROFIL_KEVIN}?look=inconnue&services=srv-coupe`);
    await expect(section(page)).toBeVisible();
    await expect(page).toHaveURL(/\/barber\/emp-kevin$/);
    await expect(visionneuse(page)).toHaveCount(0);

    // Look de Kevin sur le profil de Romain : ignoré
    await page.goto(`/barber/emp-romain?look=${CLE_COMPLET}`);
    await expect(section(page, 'Romain')).toBeVisible();
    await expect(page).toHaveURL(/\/barber\/emp-romain$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Sélection sans prestation du look (rasage hors look, soin seul) : le look entier
    await page.goto(`${PROFIL_KEVIN}?look=${CLE_COMPLET}&services=srv-rasage,srv-soin`);
    await expect(total(page)).toHaveText('85 € · 1 h 50 · 3 prestations');

    // Sélection valable : reprise telle quelle
    await page.goto(`${PROFIL_KEVIN}?look=${CLE_COMPLET}&services=srv-coupe,srv-soin`);
    await expect(total(page)).toHaveText('50 € · 1 h · 2 prestations');
    await expect(ligne(page, 'Coloration')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Dom, sans réalisation : aucune section de looks', async ({ page }) => {
    await page.goto('/barber/emp-dom');
    await expect(page.getByRole('button', { name: 'Prendre rendez-vous avec Dom' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Les looks de/ })).toHaveCount(0);
  });

  test('catalogue hors connexion : photos sans aucun prix, LoadError compact, Réessayer', async ({ page, api }) => {
    let horsLigne = true;
    api.surcharger('GET', '/entities/Service', () => (horsLigne ? RESEAU_COUPE : undefined));
    await page.goto(PROFIL_KEVIN);

    const looks = section(page);
    const erreur = looks.getByRole('alert');
    await expect(erreur).toContainText('Pas de connexion internet', { timeout: 15_000 });
    // Les photos et leurs légendes restent, jamais « 0 € »
    await expect(vedette(page).getByRole('heading', { name: 'Dégradé, barbe et couleur' })).toBeVisible();
    await expect(vignettes(page)).toHaveCount(3);
    await expect(looks).not.toContainText('€');
    await expect(looks.getByRole('button', { name: 'Réserver ce look' })).toHaveCount(0);

    // La visionneuse le dit aussi, sans prix
    await ouvrirVedette(page);
    await expect(visionneuse(page).getByRole('alert')).toContainText('Pas de connexion internet');
    await expect(visionneuse(page)).not.toContainText('€');
    await visionneuse(page).getByRole('button', { name: 'Fermer' }).click();

    horsLigne = false;
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(erreur).toHaveCount(0);
    await expect(vedette(page).getByText('85 €', { exact: true })).toBeVisible();
  });

  test('320 px : section et visionneuse sans défilement horizontal, boutons entiers', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(PROFIL_KEVIN);
    await expect(vedette(page).getByText('85 €', { exact: true })).toBeVisible();
    await attendreSansDebordement(page, 'les looks de Kevin à 320 px');
    const reserver = await vedette(page).getByRole('button', { name: 'Réserver ce look' }).boundingBox();
    expect(reserver.x + reserver.width).toBeLessThanOrEqual(320);

    await ouvrirVedette(page);
    await attendreSansDebordement(page, 'la visionneuse à 320 px');
    const choisir = visionneuse(page).getByRole('button', { name: 'Choisir mon créneau avec Kevin' });
    await choisir.scrollIntoViewIfNeeded();
    await expect(choisir).toBeInViewport({ ratio: 1 });
    const cadre = await choisir.boundingBox();
    expect(cadre.x).toBeGreaterThanOrEqual(0);
    expect(cadre.x + cadre.width).toBeLessThanOrEqual(320);
  });
});
