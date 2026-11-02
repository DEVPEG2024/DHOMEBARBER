// Snake du Gang : pages autour du jeu (contrat docs/fonctions/snake-du-gang-contrat.md, sections 0,
// 2, 5 et 7 ; planche du 2 nov. 2026) : carte de la page « Jeux », carte « Jeux » de l'accueil et
// entrée du fil, Vitesse et options (/snake/reglages), Classement (/snake/classement), Comment
// jouer (/snake/regles), jeu fermé. Routes simulées par `FauxSnakeRest` (`api.snakeRest`) : le
// client de test a 312 de record, 248 ce mois, 6e sur 9, volontaire.
// L'écran de partie (/snake) a sa propre spec (snake-partie.spec.js) : ici on ne vérifie que les
// liens qui y mènent, sans l'ouvrir.
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { ADMIN, CLIENT } from './support/donnees.js';
import { saisonCoupe } from './support/mockApi.js';
import { MAINTENANT, cleDuJourParis, instantParis } from './support/temps.js';
import { attendreSansDebordement, toast } from './support/outils.js';
import { BONUS_EVERY, BONUS_STEPS, bonusPoints } from '../src/lib/snake/engine.js';

const { season: SAISON, season_ends_at: FIN_SAISON } = saisonCoupe();
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « novembre » : mois de la saison simulée ; « décembre » : le suivant. */
const MOIS_SAISON = MOIS[Number(SAISON.slice(5, 7)) - 1];
const MOIS_SUIVANT = MOIS[Number(SAISON.slice(5, 7)) % 12];
/** Jours avant la fin de la saison, comme l'app les compte (arrondi au-dessus). */
const JOURS_RESTANTS = Math.max(0, Math.ceil((new Date(FIN_SAISON).getTime() - MAINTENANT.getTime()) / 86_400_000));
/** Pastille « Nouveau » jusqu'au 2 déc. 2026 inclus (jour de Paris). */
const NOUVEAU_ATTENDU = cleDuJourParis(MAINTENANT) <= '2026-12-02';
const ACCROCHE = 'Le Snake des vieux téléphones : mange, grandis, attrape les bestioles, ne te mords pas la queue.';
const TEXTE_EXCLU = 'Le salon t’a retiré du classement. Contacte-le si tu penses que c’est une erreur.';

const carteSnake = (page) => page.getByRole('article', { name: 'Snake du Gang' });
const appelsSnake = (api) => api.requetes.filter((r) => /^\/snake(\/|$)/.test(r.chemin));
const niveau = (page, n) => page.getByRole('button', { name: `Niveau ${n}`, exact: true });
const interrupteur = (page, nom) => page.getByRole('switch', { name: nom });
const listeClassement = (page) => page.getByRole('list', { name: `Meilleurs scores de ${MOIS_SAISON}` });
const prefsDeLaPage = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('dhb-snake-prefs') || 'null'));

/** Éléments d'un bloc qui dépassent l'écran à droite (coupés par `overflow-x-clip`, donc invisibles). */
function elementsQuiDepassent(page, selecteur = 'main *') {
  return page.evaluate((sel) => {
    const largeur = document.documentElement.clientWidth;
    return [...document.querySelectorAll(sel)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > largeur + 0.5;
      })
      .map((el) => `${el.tagName.toLowerCase()} « ${(el.textContent || '').trim().slice(0, 30)} » (${Math.round(el.getBoundingClientRect().right)} px)`);
  }, selecteur);
}

/** Lien qui reçoit un toucher au centre d'un élément (le lien « Jouer » étendu sur la carte). */
async function lienSousLeDoigt(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cible = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const lien = cible && cible.closest('a');
    return lien ? lien.getAttribute('href') : (cible ? cible.tagName.toLowerCase() : null);
  });
}

test.describe('Snake du Gang : page « Jeux » et accueil', () => {
  test('carte du Snake sous la Coupe : record, accroche, un seul lien « Jouer » vers /snake', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/jeux');
    const snake = carteSnake(page);
    await expect(snake.getByRole('heading', { level: 2, name: 'Snake du Gang' })).toBeVisible();
    await expect(snake.getByText(ACCROCHE)).toBeVisible();
    await expect(snake.getByText('Ton record')).toBeVisible();
    await expect(snake.getByText('312', { exact: true })).toBeVisible();
    await expect(snake.getByText('Nouveau', { exact: true })).toHaveCount(NOUVEAU_ATTENDU ? 1 : 0);

    // Sous la carte de la Coupe
    const coupe = page.getByRole('article', { name: 'La Coupe du Gang' });
    await expect(coupe).toBeVisible();
    expect((await snake.boundingBox()).y).toBeGreaterThan((await coupe.boundingBox()).y);

    // Un seul lien, qui couvre toute la carte (le mini-écran mène aussi au jeu)
    await expect(snake.getByRole('link')).toHaveCount(1);
    const jouer = snake.getByRole('link', { name: 'Jouer au Snake du Gang' });
    await expect(jouer).toHaveAttribute('href', '/snake');
    await expect(jouer).toContainText('Jouer');
    expect(await lienSousLeDoigt(page, snake.getByRole('heading', { name: 'Snake du Gang' }))).toBe('/snake');
    expect(await lienSousLeDoigt(page, snake.getByText('Ton record'))).toBe('/snake');
    expect(api.requetesVers('GET', '/snake/me')).not.toHaveLength(0);
  });

  test('pastille « Nouveau » jusqu\'au 2 décembre 2026 inclus, heure de Paris', async ({ page, connecter }) => {
    await connecter(CLIENT);
    await page.clock.setSystemTime(instantParis('2026-12-02', '23:30'));
    await page.goto('/jeux');
    await expect(carteSnake(page).getByText('Nouveau', { exact: true })).toBeVisible();
    await page.clock.setSystemTime(instantParis('2026-12-03', '00:05'));
    await page.reload();
    await expect(carteSnake(page).getByRole('heading', { name: 'Snake du Gang' })).toBeVisible();
    await expect(carteSnake(page).getByText('Nouveau', { exact: true })).toHaveCount(0);
  });

  test('sans record ou sur une panne : ni record ni erreur sur la carte, « Jouer » reste', async ({ page, api, connecter }) => {
    api.snakeRest.definirEtat(CLIENT.id, { record: null, season_best: null, games: 0 });
    await connecter(CLIENT);
    await page.goto('/jeux');
    await expect.poll(() => api.requetesVers('GET', '/snake/me').length).toBeGreaterThan(0);
    await expect(carteSnake(page).getByRole('link', { name: 'Jouer au Snake du Gang' })).toBeVisible();
    await expect(carteSnake(page).getByText('Ton record')).toHaveCount(0);

    // Panne de `GET /snake/me` : la carte ne dit rien de plus
    api.surcharger('GET', '/snake/me', () => ({ status: 503, json: { error: 'Indisponible' } }));
    await page.reload();
    await expect.poll(() => api.requetesVers('GET', '/snake/me').length).toBeGreaterThan(1);
    await expect(carteSnake(page).getByRole('link', { name: 'Jouer au Snake du Gang' })).toBeVisible();
    await expect(carteSnake(page).getByText('Ton record')).toHaveCount(0);
    await expect(carteSnake(page).getByRole('alert')).toHaveCount(0);
    await expect(carteSnake(page).getByText(/Indisponible|Réessayer|connexion/)).toHaveCount(0);
  });

  test('accueil et fil : les deux jeux dans la carte « Jeux » et l\'entrée du fil', async ({ page, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/');
    const section = page.getByRole('region', { name: 'Jeux' });
    const carte = section.getByRole('link', { name: 'Jeux : La Coupe du Gang, Snake du Gang' });
    await expect(carte).toHaveAttribute('href', '/jeux');
    await expect(carte.getByRole('listitem')).toHaveText(['La Coupe du Gang', 'Snake du Gang']);
    // Le pictogramme du serpent est dessiné (pas la manette de repli)
    await expect(carte.getByRole('listitem').nth(1).locator('svg path')).toHaveCount(1);

    await page.goto('/feed');
    const entree = page.getByRole('link', { name: /^Jeux/ });
    await expect(entree).toContainText('La Coupe du Gang');
    await expect(entree).toContainText('Snake du Gang');
    await expect(entree).toHaveAttribute('href', '/jeux');
  });

  test('jeu fermé (`features.snake` faux) : ni carte ni nom, et /snake renvoie à l\'accueil', async ({ page, api, connecter }) => {
    api.donnees.parametresPublics.features.snake = false;
    await connecter(CLIENT);
    await page.goto('/jeux');
    await expect(page.getByRole('article', { name: 'La Coupe du Gang' })).toBeVisible();
    await expect(carteSnake(page)).toHaveCount(0);
    await expect(page.getByText('Snake du Gang')).toHaveCount(0);

    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Jeux' }).getByRole('link', { name: 'Jeux : La Coupe du Gang', exact: true })).toBeVisible();
    await expect(page.getByText('Snake du Gang')).toHaveCount(0);

    for (const chemin of ['/snake', '/snake/classement', '/snake/reglages', '/snake/regles']) {
      await page.goto(chemin);
      await expect(page).toHaveURL(/\/$/);
    }
    expect(appelsSnake(api)).toEqual([]);
  });
});

test.describe('Snake du Gang : vitesse et options', () => {
  test('niveau : écran vert, barres, gardé après rechargement ; « Jouer » ouvre la partie', async ({ page, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/snake/reglages');
    await expect(page.getByRole('heading', { level: 1, name: 'Vitesse et options' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retour au menu du jeu' })).toHaveAttribute('href', '/snake');
    const ecran = page.getByTestId('snake-niveau');

    // Niveau 5 par défaut : allure classique, 5 points par bouchée
    await expect(niveau(page, 5)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { pressed: true })).toHaveCount(1);
    await expect(ecran).toHaveText('5');
    await expect(page.getByText('CLASSIQUE', { exact: true })).toBeVisible();
    await expect(page.getByText('5 PTS / BOUCHÉE')).toBeVisible();

    await niveau(page, 8).click();
    await expect(niveau(page, 8)).toHaveAttribute('aria-pressed', 'true');
    await expect(niveau(page, 5)).toHaveAttribute('aria-pressed', 'false');
    await expect(ecran).toHaveText('8');
    await expect(page.getByText('RAPIDE', { exact: true })).toBeVisible();
    await expect(page.getByText('8 PTS / BOUCHÉE')).toBeVisible();

    await niveau(page, 2).click();
    await expect(page.getByText('TRANQUILLE', { exact: true })).toBeVisible();
    await expect(page.getByText('2 PTS / BOUCHÉE')).toBeVisible();
    expect(await prefsDeLaPage(page)).toMatchObject({ level: 2 });

    await page.reload();
    await expect(niveau(page, 2)).toHaveAttribute('aria-pressed', 'true');
    await expect(ecran).toHaveText('2');
    await expect(page.getByText('Plus c’est rapide, plus chaque bouchée rapporte. Pas de murs : le serpent ressort de l’autre côté de l’écran.')).toBeVisible();

    const jouer = page.getByRole('link', { name: 'Jouer', exact: true });
    await expect(jouer).toHaveAttribute('href', '/snake?jouer=1');
    // Boutons de 44 px de haut au moins
    for (const loc of [jouer, niveau(page, 1), interrupteur(page, 'Bips du jeu')]) {
      expect((await loc.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
  });

  test('bips et vibrations : sur l\'appareil, gardés après rechargement, rien d\'envoyé au serveur', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/snake/reglages');
    const bips = interrupteur(page, 'Bips du jeu');
    const vibrations = interrupteur(page, 'Vibrations');
    await expect(bips).toHaveAttribute('aria-checked', 'true');
    await expect(vibrations).toHaveAttribute('aria-checked', 'true');

    await bips.click();
    await expect(bips).toHaveAttribute('aria-checked', 'false');
    await vibrations.click();
    await expect(vibrations).toHaveAttribute('aria-checked', 'false');
    expect(await prefsDeLaPage(page)).toMatchObject({ bips: false, vibrations: false });

    await page.reload();
    await expect(bips).toHaveAttribute('aria-checked', 'false');
    await expect(vibrations).toHaveAttribute('aria-checked', 'false');
    await bips.click();
    await expect(bips).toHaveAttribute('aria-checked', 'true');
    expect(await prefsDeLaPage(page)).toMatchObject({ bips: true, vibrations: false });
    expect(api.requetesVers('PATCH', '/snake/settings')).toEqual([]);
  });

  test('figurer au classement : envoyé au serveur dans les deux sens', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/snake/reglages');
    const classement = interrupteur(page, 'Figurer au classement');
    await expect(classement).toHaveAttribute('aria-checked', 'true');
    await expect(classement).toBeEnabled();
    await expect(page.getByText('Prénom et initiale seulement.')).toBeVisible();

    await classement.click();
    await expect(classement).toHaveAttribute('aria-checked', 'false');
    await expect.poll(() => api.requetesVers('PATCH', '/snake/settings').map((r) => r.corps)).toEqual([{ opt_in: false }]);
    await expect.poll(() => api.snakeRest.etats[CLIENT.id].opt_in).toBe(false);

    await expect(classement).toBeEnabled();
    await classement.click();
    await expect(classement).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => api.snakeRest.etats[CLIENT.id].opt_in).toBe(true);
    await page.reload();
    await expect(classement).toHaveAttribute('aria-checked', 'true');
  });

  test('figurer au classement : envoi raté, l\'interrupteur revient et un message le dit', async ({ page, api, connecter }) => {
    // Réseau coupé après l'arrivée sur la page : l'envoi et la relecture échouent tous les deux
    // (l'interrupteur revient par l'annulation de la mise à jour optimiste, pas par la relecture)
    let panne = false;
    api.surcharger('PATCH', '/snake/settings', () => RESEAU_COUPE);
    api.surcharger('GET', '/snake/me', () => (panne ? RESEAU_COUPE : undefined));
    await connecter(CLIENT);
    await page.goto('/snake/reglages');
    const classement = interrupteur(page, 'Figurer au classement');
    await expect(classement).toHaveAttribute('aria-checked', 'true');
    panne = true;
    await classement.click();
    await expect(toast(page, 'Pas de connexion internet')).toBeVisible();
    await expect(classement).toHaveAttribute('aria-checked', 'true');
    await expect(classement).toBeEnabled();
    expect(api.snakeRest.etats[CLIENT.id].opt_in).toBe(true);
  });

  test('admin : il joue, mais l\'interrupteur du classement est grisé avec la raison', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    await page.goto('/snake/reglages');
    const classement = interrupteur(page, 'Figurer au classement');
    await expect(page.getByText('Le salon ne figure pas au classement.')).toBeVisible();
    await expect(classement).toBeDisabled();
    await expect(classement).toHaveAttribute('aria-checked', 'false');
    // Les réglages de l'appareil restent libres
    await expect(interrupteur(page, 'Bips du jeu')).toBeEnabled();
    expect(api.requetesVers('PATCH', '/snake/settings')).toEqual([]);
  });

  test('compte retiré du classement par le salon : grisé avec le texte du salon', async ({ page, api, connecter }) => {
    api.snakeRest.exclus.add(CLIENT.id);
    await connecter(CLIENT);
    await page.goto('/snake/reglages');
    await expect(page.getByText(TEXTE_EXCLU)).toBeVisible();
    await expect(interrupteur(page, 'Figurer au classement')).toBeDisabled();
  });
});

test.describe('Snake du Gang : classement', () => {
  test('mois, joueurs, lignes numérotées, « Toi », 1re place en or, « Battre mon record »', async ({ page, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/snake/classement');
    await expect(page.getByRole('heading', { level: 1, name: 'Classement' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retour au menu du jeu' })).toHaveAttribute('href', '/snake');
    await expect(page.getByRole('heading', { level: 2, name: MOIS_SAISON.toUpperCase() })).toBeVisible();
    await expect(page.getByText('Saison d’un mois · 9 joueurs')).toBeVisible();
    await expect(page.getByText(`Fin dans ${JOURS_RESTANTS} ${JOURS_RESTANTS > 1 ? 'jours' : 'jour'}`)).toBeAttached();

    const lignes = listeClassement(page).getByRole('listitem');
    await expect(lignes).toHaveCount(9);
    await expect(lignes.first()).toContainText('Yanis B.');
    await expect(lignes.first()).toContainText('Niveau 7');
    await expect(lignes.first()).toContainText('486');
    // 1re place : pastille et score en or
    const orDe = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await orDe(lignes.first().locator('span').first())).toBe('rgb(235, 193, 94)');
    expect(await orDe(lignes.nth(1).locator('span').first())).not.toBe('rgb(235, 193, 94)');
    // Ta ligne : 6e, « Toi », ton meilleur score du mois
    const moi = lignes.nth(5);
    await expect(moi).toContainText('Camille T.');
    await expect(moi.getByText('Toi', { exact: true })).toBeVisible();
    await expect(moi).toContainText('248');
    await expect(lignes.filter({ hasText: 'Toi' })).toHaveCount(1);
    // Un barber est marqué comme tel
    await expect(lignes.filter({ hasText: 'Kevin' })).toContainText('Barber · Niveau 6');

    await expect(page.getByText(`Ton meilleur score du mois compte. Nouvelle saison le 1er ${MOIS_SUIVANT}. Aucun lot, juste la gloire.`)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Apparaître au classement' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Battre mon record' })).toHaveAttribute('href', '/snake?jouer=1');
  });

  test('pas volontaire : carte « Apparaître au classement », puis ta ligne une fois inscrit', async ({ page, api, connecter }) => {
    api.snakeRest.definirEtat(CLIENT.id, { opt_in: false });
    await connecter(CLIENT);
    await page.goto('/snake/classement');
    const carte = page.getByRole('region', { name: 'Apparaître au classement' });
    await expect(carte).toBeVisible();
    await expect(carte).toContainText('Tes 248 points du mois s’afficheront ici.');
    await expect(listeClassement(page).getByRole('listitem')).toHaveCount(8);
    await expect(listeClassement(page).getByText('Toi', { exact: true })).toHaveCount(0);

    const bouton = carte.getByRole('switch', { name: 'Apparaître au classement' });
    await expect(bouton).toHaveAttribute('aria-checked', 'false');
    await bouton.click();
    await expect.poll(() => api.requetesVers('PATCH', '/snake/settings').map((r) => r.corps)).toEqual([{ opt_in: true }]);
    await expect(carte).toHaveCount(0);
    await expect(listeClassement(page).getByRole('listitem')).toHaveCount(9);
    await expect(listeClassement(page).getByRole('listitem').nth(5)).toContainText('Toi');
  });

  test('admin : aucune invitation, la raison sous la liste, jamais « Toi »', async ({ page, connecter }) => {
    await connecter(ADMIN);
    await page.goto('/snake/classement');
    // Les 8 joueurs simulés et le client de test ; l'admin n'y figure pas
    await expect(listeClassement(page).getByRole('listitem')).toHaveCount(9);
    await expect(listeClassement(page).getByText('Toi', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Le salon ne figure pas au classement.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Apparaître au classement' })).toHaveCount(0);
    // L'admin n'a pas encore joué : « Jouer »
    await expect(page.getByRole('link', { name: 'Jouer', exact: true })).toHaveAttribute('href', '/snake?jouer=1');
  });

  test('volontaire hors des 50 premiers : ta place sous la liste', async ({ page, api, connecter }) => {
    api.snakeRest.joueurs = Array.from({ length: 60 }, (_, i) => ({
      cle: `snake-x-${i}`, nom: `Joueur ${String.fromCharCode(65 + (i % 26))}.`, role: 'user', score: 900 - i, level: 6,
      at: new Date(MAINTENANT.getTime() - (i + 1) * 60_000).toISOString(),
    }));
    await connecter(CLIENT);
    await page.goto('/snake/classement');
    await expect(listeClassement(page).getByRole('listitem')).toHaveCount(50);
    await expect(listeClassement(page).getByText('Toi', { exact: true })).toHaveCount(0);
    const place = page.getByRole('region', { name: 'Ta place' });
    await expect(place).toContainText('61');
    await expect(place).toContainText('248');
    await expect(place.getByText('Toi', { exact: true })).toBeVisible();
    await expect(page.getByText('Saison d’un mois · 61 joueurs')).toBeVisible();
  });

  test('liste vide : un texte d\'invitation ; sans partie, « Jouer »', async ({ page, api, connecter }) => {
    api.snakeRest.joueurs = [];
    api.snakeRest.definirEtat(CLIENT.id, { record: null, season_best: null, games: 0 });
    await connecter(CLIENT);
    await page.goto('/snake/classement');
    await expect(page.getByText('Personne n’a encore joué ce mois-ci. Lance une partie et prends la première place.')).toBeVisible();
    await expect(page.getByText('Saison d’un mois · 0 joueur')).toBeVisible();
    await expect(page.getByText('Joue une partie ce mois-ci pour entrer au classement.')).toBeVisible();
    await expect(page.getByRole('list', { name: /Meilleurs scores/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Jouer', exact: true })).toHaveAttribute('href', '/snake?jouer=1');
  });

  test('échec du chargement : message et « Réessayer », jamais une liste vide', async ({ page, api, connecter }) => {
    let panne = true;
    api.surcharger('GET', '/snake/leaderboard', () => (panne ? RESEAU_COUPE : undefined));
    await connecter(CLIENT);
    await page.goto('/snake/classement');
    const alerte = page.getByRole('alert').filter({ hasText: 'Pas de connexion internet' });
    await expect(alerte).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Personne n’a encore joué')).toHaveCount(0);
    // On peut toujours jouer
    await expect(page.getByRole('link', { name: 'Battre mon record' })).toBeVisible();
    panne = false;
    await alerte.getByRole('button', { name: 'Réessayer' }).click();
    await expect(listeClassement(page).getByRole('listitem')).toHaveCount(9);
    await expect(alerte).toHaveCount(0);
  });

  test('serveur qui coupe le jeu (404 `disabled`) : « Le Snake fait une pause », sans « Réessayer »', async ({ page, api, connecter }) => {
    api.surcharger('GET', '/snake/leaderboard', () => ({ status: 404, json: { error: 'Le Snake du Gang est fermé pour le moment', code: 'disabled' } }));
    await connecter(CLIENT);
    await page.goto('/snake/classement');
    const alerte = page.getByRole('alert');
    await expect(alerte).toContainText('Le Snake fait une pause', { timeout: 15_000 });
    await expect(alerte.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
  });
});

test.describe('Snake du Gang : comment jouer', () => {
  test('les règles, les bestioles, les chiffres du moteur, « J\'ai compris »', async ({ page, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/snake/regles');
    await expect(page.getByRole('heading', { level: 1, name: 'Comment jouer' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retour au menu du jeu' })).toHaveAttribute('href', '/snake');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Le serpent avance tout seul',
      'Mange les points',
      'Attrape les bestioles',
      'Ne te mords pas la queue',
      'Les commandes',
    ]);
    await expect(page.getByRole('list', { name: 'Les bestioles' }).getByRole('listitem')).toHaveText(['Souris', 'Araignée', 'Poisson', 'Scarabée']);
    await expect(page.getByText(`Toutes les ${BONUS_EVERY} bouchées, une bestiole apparaît`)).toBeVisible();
    await expect(page.getByText(`au niveau 5, de ${bonusPoints(5, 1)} à ${bonusPoints(5, BONUS_STEPS)} points`)).toBeVisible();
    await expect(page.getByText('Il n’y a pas de murs : quand tu sors d’un côté de l’écran, tu reviens par l’autre.')).toBeVisible();
    await expect(page.getByText('(niveaux 1 à 9)')).toBeVisible();
    await expect(page.getByText(/touche 2 \(haut\), 4 \(gauche\), 6 \(droite\), 8 \(bas\)\. 5 met en pause\./)).toBeVisible();
    await expect(page.getByText('Nouvelle saison chaque 1er du mois.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'J’ai compris' })).toHaveAttribute('href', '/snake');
    // Jamais de marque de téléphone
    expect(await page.locator('body').innerText()).not.toMatch(/nokia|3310/i);
  });

  test('les points d\'une bestiole suivent le niveau choisi sur l\'appareil', async ({ page, connecter }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('dhb-snake-prefs', JSON.stringify({ level: 9, bips: true, vibrations: true })); } catch { /* stockage indisponible */ }
    });
    await connecter(CLIENT);
    await page.goto('/snake/regles');
    await expect(page.getByText(`au niveau 9, de ${bonusPoints(9, 1)} à ${bonusPoints(9, BONUS_STEPS)} points`)).toBeVisible();
  });
});

for (const largeur of [320, 390, 430]) {
  test.describe(`Snake du Gang : écran de ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 740 } });

    test(`pas de défilement horizontal à ${largeur} px, aucune erreur dans la console`, async ({ page, connecter, journal }) => {
      await connecter(CLIENT);
      await page.goto('/jeux');
      await expect(carteSnake(page).getByText('312', { exact: true })).toBeVisible();
      await attendreSansDebordement(page, 'la page des jeux');
      expect(await elementsQuiDepassent(page, 'article[aria-labelledby="jeu-snake"] *')).toEqual([]);

      await page.goto('/');
      await expect(page.getByRole('region', { name: 'Jeux' })).toBeVisible();
      await attendreSansDebordement(page, 'l\'accueil');
      expect(await elementsQuiDepassent(page, 'section[aria-label="Jeux"] *')).toEqual([]);

      await page.goto('/feed');
      await expect(page.getByRole('link', { name: /^Jeux/ })).toContainText('Snake du Gang');
      await attendreSansDebordement(page, 'le fil');

      await page.goto('/snake/reglages');
      await expect(niveau(page, 9)).toBeVisible();
      await attendreSansDebordement(page, 'vitesse et options');
      expect(await elementsQuiDepassent(page)).toEqual([]);

      await page.goto('/snake/classement');
      await expect(listeClassement(page).getByRole('listitem')).toHaveCount(9);
      await attendreSansDebordement(page, 'le classement');
      expect(await elementsQuiDepassent(page)).toEqual([]);

      await page.goto('/snake/regles');
      await expect(page.getByRole('link', { name: 'J’ai compris' })).toBeVisible();
      await attendreSansDebordement(page, 'comment jouer');
      expect(await elementsQuiDepassent(page)).toEqual([]);

      expect(journal.console, 'Erreurs dans la console').toEqual([]);
    });
  });
}

/**
 * Polices réelles pour les captures (les tests reçoivent une réponse vide de Google Fonts) :
 * `CAPTURE_POLICES=<dossier>` contenant `fonts.css` (feuille de Google Fonts) et ses fichiers,
 * nommés d'après leur adresse (`s_inter_v20_xxx.woff2` pour `https://fonts.gstatic.com/s/inter/v20/xxx.woff2`).
 */
async function policesLocales(page) {
  const dossier = process.env.CAPTURE_POLICES;
  if (!dossier) return;
  const { readFileSync } = await import('node:fs');
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: readFileSync(`${dossier}/fonts.css`, 'utf8') }));
  await page.route('https://fonts.gstatic.com/**', (route) => {
    const nom = new URL(route.request().url()).pathname.slice(1).replace(/\//g, '_');
    route.fulfill({ contentType: 'font/woff2', body: readFileSync(`${dossier}/${nom}`) });
  });
}

// Captures pour la revue de la planche (CAPTURE_SNAKE=<dossier>) : une par page à 390 px
test('captures des pages à 390 px (CAPTURE_SNAKE)', async ({ page, api, connecter }) => {
  test.skip(!process.env.CAPTURE_SNAKE, 'captures seulement sur demande');
  const dossier = process.env.CAPTURE_SNAKE;
  await policesLocales(page);
  await connecter(CLIENT);
  // Page des jeux entière (écran haut : la barre du bas ne cache pas la carte du Snake)
  await page.setViewportSize({ width: 390, height: 1500 });
  await page.goto('/jeux');
  await expect(carteSnake(page).getByText('312', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${dossier}/snake-jeux-390.png` });
  await carteSnake(page).screenshot({ path: `${dossier}/snake-carte-390.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [chemin, nom, pret] of [
    ['/snake/reglages', 'reglages', (p) => expect(niveau(p, 9)).toBeVisible()],
    ['/snake/classement', 'classement', (p) => expect(listeClassement(p).getByRole('listitem')).toHaveCount(9)],
    ['/snake/regles', 'regles', (p) => expect(p.getByRole('link', { name: 'J’ai compris' })).toBeVisible()],
  ]) {
    await page.goto(chemin);
    await pret(page);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${dossier}/snake-${nom}-390.png`, fullPage: true });
  }
  // Pas volontaire : la carte d'invitation au-dessus de la liste
  api.snakeRest.definirEtat(CLIENT.id, { opt_in: false });
  await page.goto('/snake/classement');
  await expect(page.getByRole('region', { name: 'Apparaître au classement' })).toBeVisible();
  await page.screenshot({ path: `${dossier}/snake-classement-invitation-390.png` });
  api.snakeRest.definirEtat(CLIENT.id, { opt_in: true });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Jeux' })).toBeVisible();
  await page.getByRole('region', { name: 'Jeux' }).screenshot({ path: `${dossier}/snake-accueil-390.png` });
  await page.goto('/feed');
  await page.getByRole('link', { name: /^Jeux/ }).screenshot({ path: `${dossier}/snake-fil-390.png` });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/jeux');
  await expect(carteSnake(page).getByText('312', { exact: true })).toBeVisible();
  await carteSnake(page).screenshot({ path: `${dossier}/snake-carte-320.png` });
  await page.goto('/');
  await page.getByRole('region', { name: 'Jeux' }).screenshot({ path: `${dossier}/snake-accueil-320.png` });
  await page.goto('/feed');
  await page.getByRole('link', { name: /^Jeux/ }).screenshot({ path: `${dossier}/snake-fil-320.png` });
  await page.goto('/snake/reglages');
  await expect(niveau(page, 9)).toBeVisible();
  await page.screenshot({ path: `${dossier}/snake-reglages-320.png` });
});
