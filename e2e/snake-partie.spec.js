// Snake du Gang : écran de jeu `/snake` (menu, partie, fin), d'après la planche validée le 2 nov. 2026
// (contrat docs/fonctions/snake-du-gang-contrat.md, section 6). Routes simulées par `FauxSnakeRest`
// (e2e/support/mockApi.js), qui rejoue chaque partie avec le vrai moteur : un virage mal noté par
// l'app, un score faux ou une partie trop rapide répondraient 422.
//
// Les parties jusqu'à la mort tournent sur une horloge arrêtée (`page.clock.pauseAt`) avancée par
// petits pas : le serpent de départ (5 cases) se mord en trois virages, haut, gauche, bas.
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { ADMIN, CLIENT } from './support/donnees.js';
import { attendreSansDebordement } from './support/outils.js';
import { ofSeason } from '../src/lib/snake/format.js';
import { createGame, play, COLS, ROWS, xOf, yOf, SNAKE_RULES } from '../src/lib/snake/engine.js';

const jeu = (page) => page.locator('[data-snake-game]');
const menu = (page) => page.locator('[data-snake-menu]');
const terrain = (page) => page.getByRole('group', { name: /^Terrain du jeu/ });
// Noms exacts : le nom d'une touche commence par son texte affiché (« 5 GO (lancer) », « Rejouer »)
const touche = (page, nom) => page.getByRole('group', { name: 'Touches' }).getByRole('button', { name: nom, exact: true });
const PENDING = 'dhb-snake-pending';
/** File des fins pas encore envoyées, lue dans le stockage de la page. */
const fileEnAttente = (page) => page.evaluate((cle) => JSON.parse(localStorage.getItem(cle) || '[]'), PENDING);
const annonce = (page) => jeu(page).locator('[aria-live="polite"]');
const zoneGlisse = (page) => page.locator('[data-swipe-pad]');
const fleche = (page, dir) => zoneGlisse(page).locator(`[data-swipe-dir="${dir}"]`);

/** Glisse de (dx, dy) depuis le centre de `boite` (souris : même geste que le doigt). */
async function glisserDepuis(page, boite, dx, dy) {
  const x = boite.x + boite.width / 2;
  const y = boite.y + boite.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: Math.max(3, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 10)) });
  await page.mouse.up();
}
const FIN = /^\/snake\/games\/[^/]+\/finish$/;

/** Mois de la saison simulée, tel que l'app l'écrit (« de novembre », « d'août »). */
const saison = (api) => ofSeason(api.snakeRest.season);

/** Avance l'horloge arrêtée par pas de 20 ms jusqu'à ce que `condition()` soit vraie. */
async function avancer(page, condition, message) {
  for (let i = 0; i < 300; i += 1) {
    if (await condition()) return;
    await page.clock.runFor(20);
  }
  throw new Error(`Horloge avancée de 6 s sans résultat : ${message}`);
}

const pasJoues = async (page) => Number(await jeu(page).getAttribute('data-tick'));
const statut = (page) => jeu(page).getAttribute('data-statut');

/** Écran PRÊT ? avec le ticket du serveur (ou la graine locale) déjà là. */
async function partiePrete(page, ticket = 'classee') {
  await expect(jeu(page)).toHaveAttribute('data-statut', 'ready');
  await expect(terrain(page).getByText('PRÊT ?')).toBeVisible();
  await expect(jeu(page)).toHaveAttribute('data-ticket', ticket);
}

/** Arrête l'horloge (la partie n'avance plus que par `runFor`). */
async function arreterHorloge(page) {
  const maintenant = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(maintenant + 500);
}

/**
 * Lance la partie au clavier et la perd en trois virages (haut, gauche, bas), jusqu'à l'écran de
 * fin. `touches` : les trois touches du clavier (2 4 8, flèches, ZQSD ou WASD).
 */
async function jouerJusquALaMort(page, [haut, gauche, bas] = ['2', '4', '8'], { reprendre = true } = {}) {
  await page.keyboard.press('5');
  await page.keyboard.press(haut);
  await page.keyboard.press(gauche);
  await expect(jeu(page)).toHaveAttribute('data-statut', 'play');
  await avancer(page, async () => (await pasJoues(page)) >= 2, 'deux pas');
  await page.keyboard.press(bas);
  await avancer(page, async () => (await statut(page)) !== 'play', 'serpent mordu');
  expect(await statut(page)).toBe('dying');
  // Clignotement (~1 s) puis l'écran de fin ; l'horloge repart (relectures de React Query, écran
  // de fin qui accepte les clics après 400 ms)
  await page.clock.runFor(1100);
  await expect(page.getByRole('heading', { name: 'PERDU' })).toBeVisible();
  if (reprendre) await page.clock.resume();
}

/** Distance sur le terrain sans murs (on ressort de l'autre côté). */
function distance(a, b) {
  const dx = Math.abs(xOf(a) - xOf(b));
  const dy = Math.abs(yOf(a) - yOf(b));
  return Math.min(dx, COLS - dx) + Math.min(dy, ROWS - dy);
}

/**
 * Pilote glouton, joué d'avance avec le vrai moteur sur la graine du ticket : file droit vers le
 * point (ou la bestiole), sans jamais se mordre, jusqu'à la première bestiole attrapée.
 * Rend les virages `[pas, direction]`, le pas d'apparition de la bestiole et l'état final.
 */
function pilote(seed, level) {
  const s = createGame({ seed, level });
  const virages = [];
  let bestioleAu = null;
  while (!s.over && s.bonuses < 1 && s.tick < 600) {
    const tete = s.snake[0];
    const cible = s.bonus
      ? (distance(tete, s.bonus.cell) <= distance(tete, s.bonus.cell + 1) ? s.bonus.cell : s.bonus.cell + 1)
      : s.food;
    let choix = null;
    for (const d of [s.dir, (s.dir + 1) % 4, (s.dir + 3) % 4]) {
      const essai = structuredClone(s);
      if (play(essai, d, null).died) continue;
      const note = distance(essai.snake[0], cible) + (d === s.dir ? 0 : 0.1);
      if (!choix || note < choix.note) choix = { d, note };
    }
    const d = choix ? choix.d : s.dir;
    if (d !== s.dir) virages.push([s.tick, d]);
    play(s, d, null);
    if (s.bonus && bestioleAu === null) bestioleAu = s.tick;
  }
  return { virages, bestioleAu, fin: s };
}

const TOUCHE_DE = ['2', '6', '8', '4'];

test.describe('Snake du Gang : menu du téléphone', () => {
  test('record, place du mois et sélection par 2, 8 et 5', async ({ page, api, connecter, journal }) => {
    await connecter(CLIENT);
    await page.goto('/snake');
    await expect(page.getByRole('heading', { level: 1, name: 'Snake du Gang' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retour aux jeux' }).first()).toHaveAttribute('href', '/jeux');
    // Sous le téléphone : « Ton record 312 · 6e de novembre » (client simulé : 6e sur 9)
    await expect(menu(page).getByText(/^Ton record/)).toHaveText(`Ton record 312 · 6e ${saison(api)}`);
    await expect(menu(page).getByText('2 et 8 pour choisir, 5 pour valider. Ou touche une ligne.')).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Menu du jeu' });
    const choisie = nav.locator('[aria-current="true"]');
    await expect(choisie).toHaveText(/Nouvelle partie/);
    await expect(nav.getByRole('link', { name: /Vitesse : niveau 5/ })).toHaveAttribute('href', '/snake/reglages');
    await expect(nav.getByRole('link', { name: /Classement/ })).toHaveAttribute('href', '/snake/classement');
    await expect(nav.getByRole('link', { name: /Comment jouer/ })).toHaveAttribute('href', '/snake/regles');
    // Touches 4 et 6 inutiles dans le menu
    await expect(touche(page, 'Gauche (4)')).toBeDisabled();

    // 8 au pavé, 8 au clavier, puis 2 : « Vitesse »
    await touche(page, 'Bas (8)').click();
    await expect(choisie).toHaveText(/Vitesse : niveau 5/);
    await page.keyboard.press('8');
    await expect(choisie).toHaveText(/Classement/);
    await page.keyboard.press('ArrowUp');
    await touche(page, 'Haut (2)').click();
    await expect(choisie).toHaveText(/Nouvelle partie/);
    // 5 = OK : la partie s'ouvre (PRÊT ?), avec son ticket
    await touche(page, '5 OK (valider)').click();
    await partiePrete(page);
    expect(api.requetesVers('POST', '/snake/games')).toHaveLength(1);
    // Le ticket porte la version des règles du moteur (409 `update_required` si le serveur en a une autre)
    expect(api.requetesVers('POST', '/snake/games')[0].corps).toEqual({ level: 5, rules: SNAKE_RULES });
    expect(journal.console, 'Erreurs dans la console').toEqual([]);
  });

  test('record pas chargé : un texte discret, le jeu reste jouable', async ({ page, api, connecter }) => {
    api.surcharger('GET', '/snake/me', () => ({ status: 500, json: { error: 'Panne' } }));
    await connecter(CLIENT);
    await page.goto('/snake');
    await expect(menu(page).getByText('Ton record n’a pas pu être chargé.')).toBeVisible();
    await page.getByRole('button', { name: 'Nouvelle partie' }).click();
    await partiePrete(page);
    await expect(jeu(page).getByText('Niveau 5', { exact: true })).toBeVisible();
  });
});

test.describe('Snake du Gang : partie', () => {
  test('`?jouer=1` : PRÊT ?, virages au glisser (zone GLISSE et écran vert), pause, reprise, Menu termine la partie', async ({ page, api, connecter, journal }) => {
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    // Paramètre retiré de l'adresse (remplacée : le retour ne rouvre pas la partie)
    await expect(page).toHaveURL(/\/snake$/);
    await expect(page.getByText('Record 312 · niveau 5')).toBeVisible();
    // Terrain de 22 × 16 cases de 14 px à 390 px
    const cadre = await terrain(page).boundingBox();
    expect([cadre.width, cadre.height]).toEqual([308, 224]);
    // Glisser par défaut : zone GLISSE sous l'écran vert, et seulement Menu, 5 et Rejouer en touches
    await expect(jeu(page).locator('[data-commandes="glisser"]')).toBeVisible();
    await expect(zoneGlisse(page)).toBeVisible();
    await expect(page.getByRole('group', { name: 'Touches' }).getByRole('button')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Haut (2)' })).toHaveCount(0);
    await expect(page.getByText('Flèches du clavier ou glisse à la souris. Espace : pause.')).toBeVisible();

    await touche(page, '5 GO (lancer)').click();
    await expect(jeu(page)).toHaveAttribute('data-statut', 'play');
    await expect(terrain(page).getByText('PRÊT ?')).toBeHidden();
    // Glisser vers le haut dans la zone GLISSE
    await glisserDepuis(page, await zoneGlisse(page).boundingBox(), 0, -40);
    const apres = await pasJoues(page);
    await expect.poll(() => pasJoues(page)).toBeGreaterThan(apres);
    // Glisser vers la droite sur l'écran vert
    await glisserDepuis(page, cadre, 60, 0);
    const avantPause = await pasJoues(page);
    await expect.poll(() => pasJoues(page)).toBeGreaterThan(avantPause);

    await touche(page, '5 PAUSE').click();
    await expect(jeu(page)).toHaveAttribute('data-statut', 'pause');
    await expect(terrain(page).getByText('PAUSE')).toBeVisible();
    await expect(annonce(page)).toHaveText('Pause.');
    const enPause = await pasJoues(page);
    await page.clock.runFor(1000);
    expect(await pasJoues(page)).toBe(enPause);
    await touche(page, '5 GO (reprendre)').click();
    await expect(terrain(page).getByText('PAUSE')).toBeHidden();
    await expect.poll(() => pasJoues(page)).toBeGreaterThan(enPause);

    // Menu : la partie part en `quit`, acceptée par le faux serveur (virages bien notés)
    await touche(page, 'Menu').click();
    await expect(menu(page)).toBeVisible();
    await expect.poll(() => api.snakeRest.fins.length).toBe(1);
    const fin = api.snakeRest.fins[0];
    expect(fin.end).toBe('quit');
    expect(fin.ticks).toBeGreaterThan(2);
    expect(fin.moves.filter((_, i) => i % 2 === 1)).toEqual([0, 1]);
    const ticket = [...api.snakeRest.tickets.values()][0];
    expect(ticket.refus).toBeNull();
    expect(ticket.fin).not.toBeNull();
    expect(journal.console, 'Erreurs dans la console').toEqual([]);
  });

  test('perdue : fin acceptée par le serveur, écran de fin, partage, Rejouer sans attente', async ({ page, api, connecter, journal }) => {
    api.snakeRest.toleranceMs = Infinity;
    await page.addInitScript(() => {
      window.__partages = [];
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__partages.push(d); } });
    });
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    await arreterHorloge(page);
    await jouerJusquALaMort(page);

    // Gestes notés au bon pas : haut au pas 0, gauche au pas 1, bas au pas 2, mordu au 3e pas
    await expect.poll(() => api.snakeRest.fins.length).toBe(1);
    const fin = api.snakeRest.fins[0];
    expect(fin).toMatchObject({ moves: [0, 0, 1, 3, 2, 2], ticks: 3, end: 'bite' });
    const ticket = [...api.snakeRest.tickets.values()][0];
    expect(ticket.refus).toBeNull();
    expect(ticket.fin.score).toBe(fin.score);
    await expect(annonce(page)).toHaveText(`Perdu. Score final : ${fin.score}.`);

    // Écran de fin : score, record, bouchées, niveau ; place du mois et écart au record
    const ecran = page.getByRole('region', { name: 'Écran du téléphone' });
    await expect(ecran).toContainText(`SCORE${String(fin.score).padStart(4, '0')}`);
    await expect(ecran).toContainText('RECORD0312');
    await expect(ecran).toContainText('NIVEAU 5');
    await expect(page.getByText(`Tu restes 6e ${saison(api)}`)).toBeVisible();
    await expect(page.getByText(`Encore ${312 - fin.score + 1} points pour battre ton record.`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Classement' })).toHaveAttribute('href', '/snake/classement');

    await page.getByRole('button', { name: 'Partager' }).click();
    await expect.poll(() => page.evaluate(() => window.__partages.length)).toBe(1);
    const partage = await page.evaluate(() => window.__partages[0]);
    expect(partage.text).toBe(`J'ai fait ${fin.score} point${fin.score > 1 ? 's' : ''} au Snake du Gang. Viens me battre : https://dhomebarber.fr/snake`);

    // Ticket suivant déjà demandé à la mort : Rejouer repart tout de suite, classée
    expect(api.requetesVers('POST', '/snake/games')).toHaveLength(2);
    await page.getByRole('button', { name: 'Rejouer' }).click();
    await partiePrete(page);
    expect(api.requetesVers('POST', '/snake/games')).toHaveLength(2);
    expect(journal.console, 'Erreurs dans la console').toEqual([]);
  });

  test('bouchées et bestiole : barre d\'état, score rejoué à l\'identique par le serveur', async ({ page, api, connecter }) => {
    api.snakeRest.toleranceMs = Infinity;
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    const { seed, level } = [...api.snakeRest.tickets.values()][0];
    const { virages, bestioleAu, fin } = pilote(seed, level);
    expect(fin.bonuses, 'le pilote doit attraper une bestiole').toBe(1);
    const parPas = new Map(virages);
    const barre = jeu(page).locator('span', { hasText: /^BONUS \d+$/ });

    await arreterHorloge(page);
    await page.keyboard.press('5');
    for (let t = 0; t < fin.tick; t += 1) {
      if (parPas.has(t)) await page.keyboard.press(TOUCHE_DE[parPas.get(t)]);
      await avancer(page, async () => (await pasJoues(page)) >= t + 1, `pas ${t + 1}`);
      // Bestiole apparue : « BONUS 24 » puis le compte à rebours
      if (t + 1 === bestioleAu) await expect(barre).toHaveText('BONUS 24');
      if (t + 1 === bestioleAu + 1) await expect(barre).toHaveText('BONUS 23');
    }
    await expect(barre).toBeHidden();
    await expect(jeu(page).getByText(`Score : ${String(fin.score).padStart(4, '0')}`)).toBeAttached();

    // Partie quittée : le serveur la rejoue et trouve le même score
    await touche(page, 'Menu').click();
    await expect.poll(() => api.snakeRest.fins.length).toBe(1);
    expect(api.snakeRest.fins[0]).toMatchObject({ end: 'quit', ticks: fin.tick, score: fin.score });
    const ticket = [...api.snakeRest.tickets.values()][0];
    expect(ticket.refus).toBeNull();
    expect(ticket.fin).toMatchObject({ score: fin.score, eaten: fin.eaten, bonuses: 1 });
  });

  test('hors connexion au lancement : partie locale non classée, rien envoyé à la fin', async ({ page, api, connecter }) => {
    api.surcharger('POST', '/snake/games', () => RESEAU_COUPE);
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page, 'locale');
    await expect(page.getByRole('status').filter({ hasText: 'Hors connexion : partie non classée' })).toBeVisible();
    await arreterHorloge(page);
    await jouerJusquALaMort(page, ['w', 'a', 's']);
    await expect(page.getByText('Partie non classée')).toBeVisible();
    await expect(page.getByText('Tu jouais hors connexion : ce score n’est pas enregistré.')).toBeVisible();
    expect(api.requetesVers('POST', FIN)).toHaveLength(0);
  });

  test('ticket encore en route après 1,5 s : la partie part en local, « Serveur trop lent »', async ({ page, api, connecter }) => {
    // Réponse du ticket retenue tant que le test ne la libère pas
    let liberer;
    const retenue = new Promise((r) => { liberer = r; });
    api.surcharger('POST', '/snake/games', async () => { await retenue; return undefined; });
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await expect(jeu(page)).toHaveAttribute('data-ticket', 'attente');
    await arreterHorloge(page);
    await page.keyboard.press('5');
    await expect(terrain(page).getByText('Un instant…')).toBeVisible();
    await page.clock.runFor(1600);
    await expect(jeu(page)).toHaveAttribute('data-statut', 'play');
    await expect(jeu(page)).toHaveAttribute('data-ticket', 'locale');
    // Réseau présent, serveur lent : jamais « Hors connexion »
    await expect(page.getByText('Serveur trop lent : partie non classée')).toBeVisible();
    await expect(page.getByText('Hors connexion : partie non classée')).toHaveCount(0);
    liberer();
  });

  test('envoi de la fin raté : « Score pas encore envoyé », puis Réessayer avec les mêmes données', async ({ page, api, connecter }) => {
    api.snakeRest.toleranceMs = Infinity;
    let essais = 0;
    api.surcharger('POST', FIN, () => {
      essais += 1;
      return essais === 1 ? RESEAU_COUPE : undefined;
    });
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    await arreterHorloge(page);
    await jouerJusquALaMort(page, ['ArrowUp', 'ArrowLeft', 'ArrowDown']);
    await expect(page.getByText('Score pas encore envoyé')).toBeVisible();
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByText(`Tu restes 6e ${saison(api)}`)).toBeVisible();
    const envois = api.requetesVers('POST', FIN);
    expect(envois).toHaveLength(2);
    expect(envois[1].chemin).toBe(envois[0].chemin);
    expect(envois[1].corps).toEqual(envois[0].corps);
  });

  test('serveur muet 10 s après la fin : Réessayer proposé, la réponse arrivée ensuite compte', async ({ page, api, connecter }) => {
    api.snakeRest.toleranceMs = Infinity;
    let liberer;
    const retenue = new Promise((r) => { liberer = r; });
    let essais = 0;
    api.surcharger('POST', FIN, async () => {
      essais += 1;
      if (essais === 1) await retenue;
      return undefined;
    });
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    await arreterHorloge(page);
    await jouerJusquALaMort(page);
    await expect(page.getByText('Envoi du score…')).toBeVisible();
    await page.clock.runFor(10_500);
    await expect(page.getByText('Score pas encore envoyé')).toBeVisible();
    // La première demande aboutit enfin : la place s'affiche sans rien renvoyer
    liberer();
    await expect(page.getByText(`Tu restes 6e ${saison(api)}`)).toBeVisible();
    expect(essais).toBe(1);
  });

  test('score refusé par le serveur (422) : « Score non enregistré »', async ({ page, api, connecter }) => {
    api.surcharger('POST', FIN, () => ({ status: 422, json: { error: 'Score non enregistré', code: 'replay_mismatch' } }));
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    await arreterHorloge(page);
    await jouerJusquALaMort(page, ['z', 'q', 's']);
    await expect(page.getByText('Score non enregistré')).toBeVisible();
    await expect(page.getByText('Le serveur n’a pas pu vérifier cette partie.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
  });

  test('pas encore au classement : l\'interrupteur « Apparaître au classement » y inscrit le joueur', async ({ page, api, connecter }) => {
    api.snakeRest.toleranceMs = Infinity;
    api.snakeRest.definirEtat(CLIENT.id, { opt_in: false });
    await connecter(CLIENT);
    await page.goto('/snake');
    // Pas volontaire : record sans place
    await expect(menu(page).getByText(/^Ton record/)).toHaveText('Ton record 312');
    await page.keyboard.press('5');
    await partiePrete(page);
    await arreterHorloge(page);
    await jouerJusquALaMort(page);
    const inter = page.getByRole('switch', { name: 'Apparaître au classement' });
    await expect(inter).toHaveAttribute('aria-checked', 'false');
    await inter.click();
    await expect(page.getByText(`Tu es 6e ${saison(api)}`)).toBeVisible();
    expect(api.requetesVers('PATCH', '/snake/settings')[0].corps).toEqual({ opt_in: true });
  });

  test('retour en haut pendant une partie : fin en `quit`, retour au menu', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    await page.goto('/snake');
    // Admin sans partie : l'invite à jouer à la place du record
    await expect(menu(page).getByText('Pas encore de record : lance ta première partie !')).toBeVisible();
    await page.getByRole('button', { name: 'Nouvelle partie' }).click();
    await partiePrete(page);
    await page.keyboard.press('Enter');
    await expect.poll(() => pasJoues(page)).toBeGreaterThan(1);
    await page.getByRole('button', { name: 'Retour au menu du jeu' }).click();
    await expect(menu(page)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retour aux jeux' }).first()).toBeVisible();
    await expect.poll(() => api.snakeRest.fins.length).toBe(1);
    expect(api.snakeRest.fins[0].end).toBe('quit');
    expect(api.snakeRest.fins[0].ticks).toBeGreaterThan(1);
    expect([...api.snakeRest.tickets.values()][0].fin).not.toBeNull();
  });

  test('PRÊT ? quitté sans jouer : rien envoyé', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    await touche(page, 'Menu').click();
    await expect(menu(page)).toBeVisible();
    expect(api.requetesVers('POST', FIN)).toHaveLength(0);
  });
});

test.describe('Snake du Gang : 320 px', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('menu, partie et fin sans défilement horizontal, cases de 10 px', async ({ page, api, connecter }) => {
    api.snakeRest.toleranceMs = Infinity;
    await connecter(CLIENT);
    await page.goto('/snake');
    await expect(menu(page)).toBeVisible();
    await attendreSansDebordement(page, 'le menu du Snake');
    await page.getByRole('button', { name: 'Nouvelle partie' }).click();
    await partiePrete(page);
    await attendreSansDebordement(page, 'la partie du Snake');
    const cadre = await terrain(page).boundingBox();
    expect([cadre.width, cadre.height]).toEqual([220, 160]);
    await arreterHorloge(page);
    await jouerJusquALaMort(page);
    await attendreSansDebordement(page, 'la fin de partie du Snake');
  });
});

test.describe('Snake du Gang : score jamais perdu (file de l\'appareil)', () => {
  test('fin ratée sur le réseau : gardée sur l\'appareil, renvoyée à la partie suivante', async ({ page, api, connecter }) => {
    api.snakeRest.toleranceMs = Infinity;
    let essais = 0;
    api.surcharger('POST', FIN, () => {
      essais += 1;
      return essais === 1 ? RESEAU_COUPE : undefined;
    });
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    await arreterHorloge(page);
    await jouerJusquALaMort(page);
    await expect(page.getByText('Score pas encore envoyé')).toBeVisible();
    await expect(page.getByText('Pas de connexion : on le renverra dès que possible.')).toBeVisible();
    // Gardée sur l'appareil, sans rien de personnel
    const file = await fileEnAttente(page);
    expect(file).toHaveLength(1);
    expect(Object.keys(file[0]).sort()).toEqual(['at', 'end', 'id', 'moves', 'score', 'ticks']);
    expect(file[0]).toMatchObject({ end: 'bite', ticks: 3, moves: [0, 0, 1, 3, 2, 2] });

    // Partie suivante : la file repart toute seule et le serveur accepte la fin
    await page.getByRole('button', { name: 'Rejouer' }).click();
    await partiePrete(page);
    await expect.poll(() => fileEnAttente(page)).toEqual([]);
    expect(essais).toBe(2);
    const premier = [...api.snakeRest.tickets.values()][0];
    expect(premier.refus).toBeNull();
    expect(premier.fin).not.toBeNull();
  });

  test('réseau revenu (`online`) : la fin en file part et l\'écran de fin affiche la place', async ({ page, api, connecter }) => {
    api.snakeRest.toleranceMs = Infinity;
    let essais = 0;
    api.surcharger('POST', FIN, () => {
      essais += 1;
      return essais === 1 ? RESEAU_COUPE : undefined;
    });
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    await arreterHorloge(page);
    await jouerJusquALaMort(page);
    await expect(page.getByText('Score pas encore envoyé')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByText(`Tu restes 6e ${saison(api)}`)).toBeVisible();
    await expect.poll(() => fileEnAttente(page)).toEqual([]);
  });

  test('page rechargée en pleine partie : la fin `quit` part à la réouverture', async ({ page, api, connecter }) => {
    api.snakeRest.toleranceMs = Infinity;
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    await page.keyboard.press('Enter');
    await expect.poll(() => pasJoues(page)).toBeGreaterThan(1);
    expect(api.requetesVers('POST', FIN)).toHaveLength(0);
    await page.reload();
    await expect(menu(page)).toBeVisible();
    await expect.poll(() => api.snakeRest.fins.length).toBe(1);
    expect(api.snakeRest.fins[0].end).toBe('quit');
    expect(api.snakeRest.fins[0].ticks).toBeGreaterThan(1);
    expect([...api.snakeRest.tickets.values()][0].fin).not.toBeNull();
    await expect.poll(() => fileEnAttente(page)).toEqual([]);
  });

  test('à l\'ouverture : refus définitif retiré, fin de plus de 6 h jetée sans envoi', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/snake');
    await expect(menu(page)).toBeVisible();
    await page.evaluate((cle) => {
      const base = { moves: [], ticks: 3, end: 'quit', score: 0 };
      localStorage.setItem(cle, JSON.stringify([
        { ...base, id: '00000000-0000-4000-8000-0000000000aa', at: Date.now() },
        { ...base, id: '00000000-0000-4000-8000-0000000000bb', at: Date.now() - 7 * 3600_000 },
      ]));
    }, PENDING);
    await page.reload();
    await expect(menu(page)).toBeVisible();
    // Ticket inconnu du serveur : 404, retiré ; la fin trop vieille ne part même pas
    await expect.poll(() => fileEnAttente(page)).toEqual([]);
    const envois = api.requetesVers('POST', FIN);
    expect(envois).toHaveLength(1);
    expect(envois[0].chemin).toContain('0000000000aa');
  });
});

test.describe('Snake du Gang : ticket et raisons exactes', () => {
  test('ticket de plus de 5 h 30 sur PRÊT ? : jeté et redemandé au lancement', async ({ page, api, connecter }) => {
    api.snakeRest.toleranceMs = Infinity;
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    expect(api.requetesVers('POST', '/snake/games')).toHaveLength(1);
    await page.clock.fastForward(5.5 * 3600_000 + 60_000);
    await page.keyboard.press('5');
    await expect(jeu(page)).toHaveAttribute('data-statut', 'play');
    await expect(jeu(page)).toHaveAttribute('data-ticket', 'classee');
    expect(api.requetesVers('POST', '/snake/games')).toHaveLength(2);
    await expect.poll(() => pasJoues(page)).toBeGreaterThan(0);
    await touche(page, 'Menu').click();
    await expect.poll(() => api.requetesVers('POST', FIN).length).toBe(1);
    // La partie jouée est celle du second ticket
    const [, second] = [...api.snakeRest.tickets.keys()];
    expect(api.requetesVers('POST', FIN)[0].chemin).toBe(`/snake/games/${second}/finish`);
  });

  test('échec réseau à l\'arrivée : le lancement redemande un ticket et la partie est classée', async ({ page, api, connecter }) => {
    let demandes = 0;
    api.surcharger('POST', '/snake/games', () => {
      demandes += 1;
      return demandes === 1 ? RESEAU_COUPE : undefined;
    });
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page, 'locale');
    await expect(page.getByText('Hors connexion : partie non classée')).toBeVisible();
    await page.keyboard.press('5');
    await expect(jeu(page)).toHaveAttribute('data-statut', 'play');
    await expect(jeu(page)).toHaveAttribute('data-ticket', 'classee');
    await expect(page.getByText('Hors connexion : partie non classée')).toHaveCount(0);
    expect(demandes).toBe(2);
  });

  test('réseau revenu sur PRÊT ? : un ticket est redemandé avant même le lancement', async ({ page, api, connecter }) => {
    let demandes = 0;
    api.surcharger('POST', '/snake/games', () => {
      demandes += 1;
      return demandes === 1 ? RESEAU_COUPE : undefined;
    });
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page, 'locale');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await partiePrete(page, 'classee');
    expect(demandes).toBe(2);
  });

  const RAISONS = [
    { cas: '429 (trop de parties)', reponse: () => ({ status: 429, json: { error: 'Trop de parties', code: 'rate_limited' } }), texte: 'Trop de parties d’affilée : partie non classée' },
    { cas: '409 (app trop ancienne)', regles: 2, texte: 'Mets l’app à jour pour être classé : partie non classée' },
    { cas: '500 (panne)', reponse: () => ({ status: 500, json: { error: 'Panne' } }), texte: 'Serveur indisponible : partie non classée' },
  ];
  for (const { cas, reponse, regles, texte } of RAISONS) {
    test(`ticket refusé, ${cas} : « ${texte} »`, async ({ page, api, connecter }) => {
      if (reponse) api.surcharger('POST', '/snake/games', reponse);
      if (regles) api.snakeRest.regles = regles;
      await connecter(CLIENT);
      await page.goto('/snake?jouer=1');
      await partiePrete(page, 'locale');
      await expect(page.getByRole('status').filter({ hasText: texte })).toBeVisible();
      await expect(page.getByText('Hors connexion')).toHaveCount(0);
      const avant = api.requetesVers('POST', '/snake/games').length;
      await page.keyboard.press('5');
      await expect(jeu(page)).toHaveAttribute('data-statut', 'play');
      // 429 et 409 : pas de nouvel essai au lancement (il échouerait pareil)
      if (cas.startsWith('429') || cas.startsWith('409')) expect(api.requetesVers('POST', '/snake/games')).toHaveLength(avant);
    });
  }

  test('fin en panne du serveur (500) : renvoyée plus tard, jamais « Vérifie ta connexion »', async ({ page, api, connecter }) => {
    api.snakeRest.toleranceMs = Infinity;
    api.surcharger('POST', FIN, () => ({ status: 500, json: { error: 'Panne' } }));
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    await arreterHorloge(page);
    await jouerJusquALaMort(page);
    await expect(page.getByText('Le serveur ne répond pas : on le renverra dès que possible.')).toBeVisible();
    await expect(page.getByText(/Vérifie ta connexion/)).toHaveCount(0);
    expect(await fileEnAttente(page)).toHaveLength(1);
  });

  test('ticket périmé à la fin (410) : « Partie trop ancienne : score non enregistré »', async ({ page, api, connecter }) => {
    api.snakeRest.toleranceMs = Infinity;
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    [...api.snakeRest.tickets.values()][0].cree -= 7 * 3600_000;
    await arreterHorloge(page);
    await jouerJusquALaMort(page);
    await expect(page.getByText('Partie trop ancienne : score non enregistré')).toBeVisible();
    expect(await fileEnAttente(page)).toEqual([]);
  });
});

test.describe('Snake du Gang : gestes, focus, survol', () => {
  test('glisser court : toucher = lancer ou reprendre, jamais pause ; de 8 à 13 px rien ; 14 px = virage', async ({ page, api, connecter }) => {
    api.snakeRest.toleranceMs = Infinity;
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    await arreterHorloge(page);
    const cadre = await terrain(page).boundingBox();
    const zone = await zoneGlisse(page).boundingBox();
    // Toucher sur PRÊT ? (4 px) : la partie part
    await glisserDepuis(page, zone, 0, 4);
    await expect(jeu(page)).toHaveAttribute('data-statut', 'play');
    // 10 px vers le bas : ni virage (un virage en bas aurait ensuite bloqué celui en haut) ni pause
    await glisserDepuis(page, cadre, 0, 10);
    expect(await statut(page)).toBe('play');
    // Toucher pendant la partie : rien, la pause passe par la touche
    await glisserDepuis(page, zone, 0, 4);
    await glisserDepuis(page, cadre, 0, 4);
    expect(await statut(page)).toBe('play');
    await page.keyboard.press('5');
    await expect(jeu(page)).toHaveAttribute('data-statut', 'pause');
    // Toucher en pause : reprise
    await glisserDepuis(page, zone, 0, 4);
    await expect(jeu(page)).toHaveAttribute('data-statut', 'play');
    // 15 px vers le haut dans la zone GLISSE : virage, sa flèche s'allume un instant
    await glisserDepuis(page, zone, 0, -15);
    expect(await statut(page)).toBe('play');
    await expect(fleche(page, 0)).toHaveAttribute('data-on', '');
    await expect(fleche(page, 1)).not.toHaveAttribute('data-on', '');
    await page.clock.runFor(200);
    await expect(fleche(page, 0)).not.toHaveAttribute('data-on', '');
    await avancer(page, async () => (await pasJoues(page)) >= 2, 'deux pas');
    await page.clock.resume();
    await touche(page, 'Menu').click();
    await expect.poll(() => api.snakeRest.fins.length).toBe(1);
    expect(api.snakeRest.fins[0].moves.filter((_, i) => i % 2 === 1)).toEqual([0]);
    expect([...api.snakeRest.tickets.values()][0].refus).toBeNull();
  });

  test('option « Touches 2 4 6 8 » : pavé complet, virages aux touches et au glisser', async ({ page, api, connecter }) => {
    api.snakeRest.toleranceMs = Infinity;
    await page.addInitScript(() => {
      try { localStorage.setItem('dhb-snake-prefs', JSON.stringify({ touches: true })); } catch { /* stockage indisponible */ }
    });
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    await expect(jeu(page).locator('[data-commandes="touches"]')).toBeVisible();
    await expect(zoneGlisse(page)).toHaveCount(0);
    for (const nom of ['Menu', 'Haut (2)', 'Rejouer', 'Gauche (4)', '5 GO (lancer)', 'Droite (6)', 'Bas (8)']) {
      await expect(touche(page, nom)).toBeVisible();
    }
    await arreterHorloge(page);
    await touche(page, '5 GO (lancer)').click();
    await expect(jeu(page)).toHaveAttribute('data-statut', 'play');
    await touche(page, 'Haut (2)').click();
    await avancer(page, async () => (await pasJoues(page)) >= 1, 'un pas');
    // Le glisser marche aussi
    await glisserDepuis(page, await terrain(page).boundingBox(), -40, 0);
    await avancer(page, async () => (await pasJoues(page)) >= 2, 'deux pas');
    await page.clock.resume();
    await touche(page, 'Menu').click();
    await expect.poll(() => api.snakeRest.fins.length).toBe(1);
    expect(api.snakeRest.fins[0].moves.filter((_, i) => i % 2 === 1)).toEqual([0, 3]);
    expect([...api.snakeRest.tickets.values()][0].refus).toBeNull();
  });

  test('clic souris sur le pavé : pas de focus, Espace reste lancer / pause ; au clavier, focus visible', async ({ page, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    const go = touche(page, '5 GO (lancer)');
    await go.click();
    await expect(jeu(page)).toHaveAttribute('data-statut', 'play');
    await expect(touche(page, '5 PAUSE')).not.toBeFocused();
    await page.keyboard.press('Space');
    await expect(jeu(page)).toHaveAttribute('data-statut', 'pause');
    await page.keyboard.press('Space');
    await expect(jeu(page)).toHaveAttribute('data-statut', 'play');
    // Rejouer au pavé (souris) : nouvelle partie, et Espace la lance
    await touche(page, 'Rejouer').click();
    await partiePrete(page);
    await expect(touche(page, 'Rejouer')).not.toBeFocused();
    await page.keyboard.press('Space');
    await expect(jeu(page)).toHaveAttribute('data-statut', 'play');
    // Au clavier : Tab jusqu'à une touche, focus visible
    await page.keyboard.press('Escape');
    await expect(jeu(page)).toHaveAttribute('data-statut', 'pause');
    const menuTouche = touche(page, 'Menu');
    for (let i = 0; i < 12 && !(await menuTouche.evaluate((el) => el === document.activeElement)); i += 1) await page.keyboard.press('Tab');
    await expect(menuTouche).toBeFocused();
    expect(await menuTouche.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
  });

  test('fenêtre qui perd le focus (ordinateur) : pause', async ({ page, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    await page.keyboard.press('5');
    await expect(jeu(page)).toHaveAttribute('data-statut', 'play');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(jeu(page)).toHaveAttribute('data-statut', 'pause');
    await expect(terrain(page).getByText('PAUSE')).toBeVisible();
  });

  test('Rejouer sur PRÊT ? : le ticket déjà pris est gardé', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/snake?jouer=1');
    await partiePrete(page);
    await touche(page, 'Rejouer').click();
    await partiePrete(page);
    expect(api.requetesVers('POST', '/snake/games')).toHaveLength(1);
  });

  test('écran de fin : les clics des 400 premières ms sont ignorés', async ({ page, api, connecter }) => {
    api.snakeRest.toleranceMs = Infinity;
    api.snakeRest.definirEtat(CLIENT.id, { opt_in: false });
    await connecter(CLIENT);
    await page.goto('/snake');
    await expect(menu(page).getByText(/^Ton record/)).toHaveText('Ton record 312');
    await page.keyboard.press('5');
    await partiePrete(page);
    await arreterHorloge(page);
    await jouerJusquALaMort(page, undefined, { reprendre: false });
    const inter = page.getByRole('switch', { name: 'Apparaître au classement' });
    await expect(inter).toBeVisible();
    // Doigt posé pendant le clignotement, levé sur l'interrupteur puis sur Rejouer : rien
    for (const cible of [inter, page.getByRole('button', { name: 'Rejouer' })]) {
      const b = await cible.boundingBox();
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    }
    await expect(inter).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('heading', { name: 'PERDU' })).toBeVisible();
    expect(api.requetesVers('PATCH', '/snake/settings')).toHaveLength(0);
    // Après 400 ms, l'écran répond
    await page.clock.runFor(400);
    await expect(page.locator('[data-snake-fin="prete"]')).toBeAttached();
    await page.clock.resume();
    await inter.click();
    await expect.poll(() => api.requetesVers('PATCH', '/snake/settings').length).toBe(1);
  });

  test('noms accessibles = texte affiché, survol plus clair sur ordinateur', async ({ page, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/snake');
    await expect(menu(page)).toBeVisible();
    const fond = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
    // Menu : « Jeux », « 5 OK (valider) »
    await expect(page.getByRole('group', { name: 'Touches' }).getByRole('link', { name: 'Jeux', exact: true })).toHaveAttribute('href', '/jeux');
    const bas = touche(page, 'Bas (8)');
    expect(await fond(bas)).toBe('rgb(38, 43, 51)');
    await bas.hover();
    await expect.poll(() => fond(bas)).toBe('rgb(43, 49, 58)');
    const ok = touche(page, '5 OK (valider)');
    await ok.hover();
    await expect.poll(() => fond(ok)).toBe('rgb(46, 158, 102)');
    await ok.click();
    await partiePrete(page);
    // Partie : « Menu », « 5 GO (lancer) », « Rejouer » (les virages se font en glissant)
    for (const nom of ['Menu', '5 GO (lancer)', 'Rejouer']) {
      await expect(touche(page, nom)).toBeVisible();
    }
  });
});
