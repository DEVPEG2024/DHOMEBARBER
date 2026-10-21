// Éditeur des réalisations (Équipe → Réalisations d'un barber) : chaque photo est un « look » de 1 à
// 5 prestations, enregistré à chaque geste (`PUT /entities/Employee/<id>`, galerie relue avant).
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { ADMIN, BARBERS, LOOKS } from './support/donnees.js';
import { attendreSansDebordement, echapper, toast } from './support/outils.js';

const KEVIN = BARBERS.kevin;

async function ouvrirEditeur(page) {
  await page.goto('/admin/team');
  await page.getByRole('button', { name: `Réalisations de ${KEVIN.name}` }).click();
  const fenetre = page.getByRole('dialog', { name: `Réalisations de ${KEVIN.name}` });
  await expect(fenetre).toBeVisible();
  return fenetre;
}

/** Carte d'une photo de l'éditeur (`Photo 1` = la première de la galerie). */
const photo = (fenetre, n) => fenetre.getByRole('group', { name: `Photo ${n}`, exact: true });
/** Puces « Prestations du look » d'une photo (la dernière est le bouton Ajouter / Modifier). */
const puces = (carte) => carte.getByRole('list', { name: 'Prestations du look' }).getByRole('listitem');

/** Galerie envoyée par le dernier `PUT` de la fiche de Kevin. */
const ecritures = (api) => api.requetesVers('PUT', `/entities/Employee/${KEVIN.id}`);
const derniereGalerie = (api) => ecritures(api).at(-1)?.corps?.gallery;
const entree = (galerie, look) => (galerie || []).find((it) => it.url === look.url);

async function ouvrirChoix(page, carte) {
  await carte.getByRole('button', { name: /^(Ajouter une prestation au look|Modifier les prestations du look)$/ }).click();
  const choix = page.getByRole('dialog', { name: 'Prestations du look' });
  await expect(choix).toBeVisible();
  return choix;
}

/** Ligne d'une prestation dans la fenêtre de choix (nom en tête : « Barbe » ≠ « Coupe + Barbe »). */
const ligne = (choix, nom) => choix.getByRole('button', { name: new RegExp(`^${echapper(nom)}\\s*\\d`) });

/** Tous les éléments visibles de `selecteur` tiennent dans la largeur de l'écran. */
async function attendreDansLEcran(page, selecteur, nom) {
  await expect.poll(() => page.evaluate((sel) => {
    const largeur = document.documentElement.clientWidth;
    const fautifs = [];
    for (const racine of document.querySelectorAll(sel)) {
      for (const el of [racine, ...racine.querySelectorAll('*')]) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.left < -0.5 || r.right > largeur + 0.5) fautifs.push(`${el.tagName.toLowerCase()} « ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)} »`);
      }
    }
    return fautifs.slice(0, 5);
  }, selecteur), { message: `Éléments hors de l'écran : ${nom}` }).toEqual([]);
}

test.describe('Éditeur des looks (Équipe → Réalisations)', () => {
  test.beforeEach(async ({ connecter }) => {
    await connecter(ADMIN);
  });

  test('un look de trois prestations : puces dans l\'ordre, prix et total ; ancien format et photo vide', async ({ page }) => {
    const fenetre = await ouvrirEditeur(page);

    const complet = photo(fenetre, 1);
    await expect(complet.getByRole('textbox', { name: 'Titre du look' })).toHaveValue(LOOKS.kevinComplet.caption);
    await expect(puces(complet)).toHaveText([/^Coloration\s*45 €/, /^Coupe\s*25 €/, /^Barbe\s*15 €/, 'Ajouter']);
    await expect(complet).toContainText('3 prestations · 1 h 50 · 85 €');

    // Rangé à l'ancienne (`service_id` seul, apps d'avant les looks) : sa puce Coupe
    const ancien = photo(fenetre, 2);
    await expect(puces(ancien)).toHaveText([/^Coupe\s*25 €/, 'Ajouter']);
    await expect(ancien).toContainText('1 prestation · 30 min · 25 €');

    // Photo sans prestation : texte d'aide, titre vide avec son exemple
    const vide = photo(fenetre, 4);
    await expect(puces(vide)).toHaveText(['Ajouter']);
    await expect(vide).toContainText('Ajoutez les prestations visibles sur la photo : le client pourra réserver ce look en un geste.');
    await expect(vide.getByRole('textbox', { name: 'Titre du look' })).toHaveAttribute('placeholder', 'Ex. Dégradé américain, barbe sculptée');

    // Le rappel sur l'accord des clients photographiés reste
    await expect(fenetre).toContainText('Demandez toujours l\'accord du client avant de publier une photo où il est reconnaissable.');
  });

  test('retirer une prestation : service_ids à jour et service_id = la première, galerie relue avant', async ({ page, api }) => {
    const fenetre = await ouvrirEditeur(page);
    const complet = photo(fenetre, 1);
    await complet.getByRole('button', { name: 'Retirer Coloration du look' }).click();

    await expect.poll(() => entree(derniereGalerie(api), LOOKS.kevinComplet)).toEqual({
      url: LOOKS.kevinComplet.url,
      caption: LOOKS.kevinComplet.caption,
      service_ids: ['srv-coupe', 'srv-barbe'],
      service_id: 'srv-coupe',
    });
    const galerie = derniereGalerie(api);
    // Les autres photos sont réécrites telles quelles (ancien format complété, photo vide sans prestation)
    expect(galerie.map((it) => it.url)).toEqual([LOOKS.kevinComplet, LOOKS.kevinDegrade, LOOKS.kevinEnfant, LOOKS.kevinSansPrestation].map((l) => l.url));
    expect(entree(galerie, LOOKS.kevinDegrade)).toEqual({ url: LOOKS.kevinDegrade.url, caption: LOOKS.kevinDegrade.caption, service_ids: ['srv-coupe'], service_id: 'srv-coupe' });
    expect(entree(galerie, LOOKS.kevinSansPrestation)).toEqual({ url: LOOKS.kevinSansPrestation.url, caption: '' });
    expect(galerie.every((it) => !('key' in it))).toBe(true);
    // Fiche relue juste avant l'écriture (une modification faite ailleurs n'est pas écrasée)
    expect(api.requetesVers('GET', '/entities/Employee').some((r) => r.q?.id === KEVIN.id)).toBe(true);

    await expect(puces(complet)).toHaveText([/^Coupe\s*25 €/, /^Barbe\s*15 €/, 'Ajouter']);
    await expect(complet).toContainText('2 prestations · 50 min · 40 €');
    await expect(toast(page, '« Coloration » retirée du look')).toBeVisible();
  });

  test('ajouter par la recherche, plusieurs ajouts sans refermer ; la croix et Échap ne ferment que la recherche', async ({ page, api }) => {
    const fenetre = await ouvrirEditeur(page);
    const vide = photo(fenetre, 4);
    const choix = await ouvrirChoix(page, vide);

    await choix.getByRole('searchbox', { name: 'Rechercher une prestation' }).fill('barbe');
    await expect(ligne(choix, 'Barbe')).toBeVisible();
    await expect(ligne(choix, 'Coupe + Barbe')).toBeVisible();
    await expect(ligne(choix, 'Coupe')).toHaveCount(0);
    await expect(ligne(choix, 'Coloration')).toHaveCount(0);

    await ligne(choix, 'Barbe').click();
    await expect(ligne(choix, 'Barbe')).toHaveAttribute('aria-pressed', 'true');
    await expect(ligne(choix, 'Barbe')).toContainText('Ajoutée');
    await expect.poll(() => entree(derniereGalerie(api), LOOKS.kevinSansPrestation))
      .toEqual({ url: LOOKS.kevinSansPrestation.url, caption: '', service_ids: ['srv-barbe'], service_id: 'srv-barbe' });

    // Second ajout, fenêtre toujours ouverte
    await ligne(choix, 'Coupe + Barbe').click();
    await expect.poll(() => entree(derniereGalerie(api), LOOKS.kevinSansPrestation)?.service_ids)
      .toEqual(['srv-barbe', 'srv-coupe-barbe']);
    await expect(choix).toContainText('2 prestations · 1 h 05 · 50 €');

    // Un tap sur une prestation ajoutée la retire
    await ligne(choix, 'Coupe + Barbe').click();
    await expect.poll(() => entree(derniereGalerie(api), LOOKS.kevinSansPrestation)?.service_ids).toEqual(['srv-barbe']);
    await expect(ligne(choix, 'Coupe + Barbe')).toHaveAttribute('aria-pressed', 'false');

    // La croix ferme la recherche, pas la fenêtre des réalisations
    await choix.getByRole('button', { name: 'Fermer' }).click();
    await expect(choix).toBeHidden();
    await expect(fenetre).toBeVisible();
    await expect(puces(vide)).toHaveText([/^Barbe\s*15 €/, 'Ajouter']);

    // Échap aussi : seule la fenêtre du dessus se ferme
    const encore = await ouvrirChoix(page, vide);
    await page.keyboard.press('Escape');
    await expect(encore).toBeHidden();
    await expect(fenetre).toBeVisible();
  });

  test('5 prestations au plus par look : les autres sont désactivées', async ({ page, api }) => {
    const fenetre = await ouvrirEditeur(page);
    const complet = photo(fenetre, 1);
    const choix = await ouvrirChoix(page, complet);

    await ligne(choix, 'Contours').click();
    await expect(ligne(choix, 'Contours')).toHaveAttribute('aria-pressed', 'true');
    await expect(choix.getByRole('status')).toHaveCount(0);
    await ligne(choix, 'Soin du visage').click();

    await expect(choix.getByRole('status')).toContainText('5 prestations au plus par look');
    await expect(ligne(choix, "Rasage à l'ancienne")).toBeDisabled();
    await expect(ligne(choix, 'Coupe enfant')).toBeDisabled();
    // Une prestation déjà dans le look reste touchable (pour la retirer)
    await expect(ligne(choix, 'Barbe')).toBeEnabled();
    await expect.poll(() => entree(derniereGalerie(api), LOOKS.kevinComplet)?.service_ids)
      .toEqual(['srv-couleur', 'srv-coupe', 'srv-barbe', 'srv-contours', 'srv-soin']);
    expect(entree(derniereGalerie(api), LOOKS.kevinComplet).service_id).toBe('srv-couleur');

    await choix.getByRole('button', { name: 'Terminé' }).click();
    await expect(choix).toBeHidden();
    await expect(complet.getByRole('button', { name: 'Modifier les prestations du look' })).toBeVisible();
    await expect(complet).toContainText('5 prestations · 2 h 35 · 120 €');
  });

  test('refus du serveur : son message dans le toast, la galerie revient à celle du serveur', async ({ page, api }) => {
    api.surcharger('PUT', `/entities/Employee/${KEVIN.id}`, () => ({ status: 400, json: { error: '5 prestations au plus par photo' } }));
    const fenetre = await ouvrirEditeur(page);
    const complet = photo(fenetre, 1);
    await complet.getByRole('button', { name: 'Retirer Coloration du look' }).click();

    await expect(toast(page, '5 prestations au plus par photo')).toBeVisible();
    await expect(puces(complet)).toHaveText([/^Coloration\s*45 €/, /^Coupe\s*25 €/, /^Barbe\s*15 €/, 'Ajouter']);
    await expect(complet).toContainText('3 prestations · 1 h 50 · 85 €');
  });

  test('titre du look enregistré à la sortie du champ, pas à chaque lettre', async ({ page, api }) => {
    const fenetre = await ouvrirEditeur(page);
    const champ = photo(fenetre, 4).getByRole('textbox', { name: 'Titre du look' });
    await champ.fill('Fondu bas, nuque propre');
    expect(ecritures(api)).toHaveLength(0);

    await champ.press('Tab');
    await expect.poll(() => entree(derniereGalerie(api), LOOKS.kevinSansPrestation))
      .toEqual({ url: LOOKS.kevinSansPrestation.url, caption: 'Fondu bas, nuque propre' });
    expect(ecritures(api)).toHaveLength(1);
    await expect(toast(page, 'Titre du look enregistré')).toBeVisible();
    await expect(champ).toHaveValue('Fondu bas, nuque propre');
  });

  test('prestation retirée du catalogue : puce « Prestation retirée » avec sa croix, hors du total', async ({ page, api }) => {
    api.tables.Service.find((s) => s.id === 'srv-couleur').is_active = false;
    const fenetre = await ouvrirEditeur(page);
    const complet = photo(fenetre, 1);

    await expect(puces(complet)).toHaveText(['Prestation retirée', /^Coupe\s*25 €/, /^Barbe\s*15 €/, 'Ajouter']);
    await expect(complet).toContainText('2 prestations · 50 min · 40 €');
    await expect(complet).toContainText('n\'est plus au catalogue');

    await complet.getByRole('button', { name: 'Retirer la prestation retirée du catalogue' }).click();
    await expect.poll(() => entree(derniereGalerie(api), LOOKS.kevinComplet))
      .toEqual({ url: LOOKS.kevinComplet.url, caption: LOOKS.kevinComplet.caption, service_ids: ['srv-coupe', 'srv-barbe'], service_id: 'srv-coupe' });
    await expect(complet).not.toContainText('n\'est plus au catalogue');
  });

  test('catalogue hors connexion : puces sans prix, « Ajouter » désactivé, message d\'échec', async ({ page, api }) => {
    api.surcharger('GET', '/entities/Service', () => RESEAU_COUPE);
    const fenetre = await ouvrirEditeur(page);

    await expect(fenetre.getByRole('alert')).toContainText('Pas de connexion internet');
    const complet = photo(fenetre, 1);
    await expect(puces(complet)).toHaveText(['Prestation 1', 'Prestation 2', 'Prestation 3', 'Ajouter']);
    await expect(complet).not.toContainText('€');
    await expect(complet.getByRole('button', { name: 'Ajouter une prestation au look' })).toBeDisabled();
  });

  test('320 px : rien ne déborde, ni l\'éditeur ni la recherche', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const fenetre = await ouvrirEditeur(page);
    await expect(photo(fenetre, 1)).toContainText('3 prestations · 1 h 50 · 85 €');
    await attendreSansDebordement(page, 'Équipe → Réalisations (320 px)');
    await attendreDansLEcran(page, '[role="dialog"]', 'éditeur des réalisations à 320 px');
    // Les puces passent à la ligne : la dernière (Ajouter) est sous la première
    const premiere = await puces(photo(fenetre, 1)).first().boundingBox();
    const ajouter = await puces(photo(fenetre, 1)).last().boundingBox();
    expect(ajouter.y).toBeGreaterThan(premiere.y);

    const choix = await ouvrirChoix(page, photo(fenetre, 1));
    await expect(ligne(choix, 'Soin du visage')).toBeVisible();
    await attendreDansLEcran(page, '[role="dialog"]', 'recherche des prestations à 320 px');
    await expect(choix.getByRole('button', { name: 'Terminé' })).toBeInViewport();
  });
});
