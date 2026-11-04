// Écran du salon de La Coupe du Gang (`/ecran`, planche validée, écrans 14 et 15 ; contrat
// docs/fonctions/coupe-spectateurs-contrat.md, section 4.2) : sans clé, clé du lien rangée puis
// retirée de l'adresse, clé coupée, mode libre, mode tournoi, match en grand (fin, 8 s sur le score
// final, le suivant), match ordinaire en grand, relectures (15 s, 5 s en tournoi), panne réseau,
// écran fermé, aucune photo, muet, écran gardé allumé, de 960 × 540 à 3840 × 2160 et tablette en
// portrait sans défilement. Décisions de la section 6 du contrat : clé gardée sur un 4401 seul (A1),
// une seule socket pour tout l'écran (A2), bande du score à l'échelle de l'écran et textes à 16 px de
// scène au moins (A4), noms et score avant `wstart` (A5), télé non comptée (A12), écran refusé
// (`full`) : nouvel essai 30 s plus tard. Faux serveurs : `api.ecran` (e2e/support/fauxEcran.js) pour
// `GET /coupe/screen`, `api.coupe` (e2e/support/fauxCoupe.js) pour la vue en direct du match en grand
// (/ws/coupe, `auth {screen}`, `watch`, `wend`).
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { media } from './support/donnees.js';
import {
  CLE_COUPEE, CLE_ECRAN, MATCHS_ECRAN, SALLE_ECRAN, TOURNOI_ECRAN, tourEcran,
} from './support/fauxEcran.js';

const CLE_STOCKAGE = 'dhb-ecran-cle';
const scene = (page) => page.getByRole('main', { name: 'Écran du salon : La Coupe du Gang' });
const carte = (page, nom) => scene(page).getByRole('region', { name: nom });
const grand = (page) => carte(page, 'Match en direct');
/** Bande du score de la vue en direct (WatchStage) : joueur du haut à gauche, joueur du bas à droite. */
const bande = (page) => grand(page).getByRole('group', { name: 'Score du match' });
const ligneTableau = (page, mid) => scene(page).locator(`[data-match="${mid}"]`);

/** Ouvre l'écran avec la clé dans le lien (comme le lien donné par l'admin). */
async function ouvrir(page, cle = CLE_ECRAN) {
  await page.goto(`/ecran#cle=${cle}`);
}

/** Lectures de `/coupe/screen` reçues jusqu'ici. */
const lectures = (api) => api.ecran.lectures().length;
/**
 * L'écran regarde vraiment ce match (`wstart` reçu) : la bande montre les noms de la ligne `live` dès
 * le début (décision A5), son texte ne le prouve plus.
 */
const enDirect = (api, id) => expect.poll(() => api.coupe.regardent(id).length, { timeout: 10_000 }).toBeGreaterThan(0);
/** Authentifications d'écran reçues par le serveur de jeu. */
const authsEcran = (api) => api.coupe.messages('auth').filter((m) => m.screen).length;

/**
 * Noms de la bande du score : texte et coupe (plus large ou plus haut que leur place : deux lignes au
 * plus, jamais d'ellipse).
 */
const nomsBande = (page) => bande(page).locator('.cdgw-name').evaluateAll((els) => els.map((e) => ({
  texte: e.textContent,
  coupe: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1,
})));

test.describe('Écran du salon : clé', () => {
  test('sans clé : comment l’obtenir, aucune lecture', async ({ page, api }) => {
    await page.goto('/ecran');
    await expect(scene(page).getByRole('heading', { name: 'Écran du salon' })).toBeVisible();
    await expect(scene(page)).toContainText('Ouvre le lien de l’écran donné dans Admin → La Coupe du Gang.');
    await page.waitForTimeout(300);
    expect(lectures(api)).toBe(0);
  });

  test('clé du lien : envoyée en X-Screen-Key sans compte, rangée sur l’appareil, retirée de l’adresse', async ({ page, api }) => {
    const entetes = [];
    page.on('request', (r) => {
      if (r.url().includes('/coupe/screen')) entetes.push(r.headers());
    });
    api.ecran.ecrans[0].last_seen_at = null;
    await ouvrir(page);
    await expect(carte(page, 'Classement de la saison')).toBeVisible();
    // Retirée de l'adresse (ni historique ni écran), rangée sur l'appareil
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
    expect(new URL(page.url()).pathname).toBe('/ecran');
    expect(await page.evaluate((k) => localStorage.getItem(k), CLE_STOCKAGE)).toBe(CLE_ECRAN);
    // Envoyée seulement en en-tête, jamais de jeton de session
    const get = entetes.find((h) => h['x-screen-key']);
    expect(get['x-screen-key']).toBe(CLE_ECRAN);
    expect(get.authorization).toBeUndefined();
    // Le serveur note l'écran vu (liste de l'admin)
    expect(api.ecran.ecrans[0].last_seen_at).not.toBeNull();

    // Rechargement sans le lien : la clé de l'appareil suffit
    const avant = lectures(api);
    await page.goto('/ecran');
    await expect(carte(page, 'Classement de la saison')).toBeVisible();
    expect(lectures(api)).toBeGreaterThan(avant);
  });

  test('clé coupée : « Écran coupé par le salon », clé oubliée, plus aucune lecture, jamais la connexion', async ({ page, api }) => {
    await ouvrir(page, CLE_COUPEE);
    await expect(scene(page).getByRole('heading', { name: 'Écran coupé par le salon' })).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), CLE_STOCKAGE)).toBeNull();
    expect(new URL(page.url()).pathname).toBe('/ecran');

    // Coupé pendant qu'il s'affiche : à la lecture suivante
    await ouvrir(page, CLE_ECRAN);
    await expect(carte(page, 'Classement de la saison')).toBeVisible();
    api.ecran.couper(CLE_ECRAN);
    await page.clock.fastForward(15_000);
    await expect(scene(page).getByRole('heading', { name: 'Écran coupé par le salon' })).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), CLE_STOCKAGE)).toBeNull();
    const n = lectures(api);
    await page.clock.fastForward(60_000);
    await page.waitForTimeout(200);
    expect(lectures(api)).toBe(n);
    expect(new URL(page.url()).pathname).toBe('/ecran');
  });

  test('regarder fermé (COUPE_SPECTATEURS=off) : écran fermé, la clé reste', async ({ page, api }) => {
    api.donnees.parametresPublics.features.coupeSpectators = false;
    await ouvrir(page);
    await expect(scene(page).getByRole('heading', { name: 'Écran fermé pour le moment' })).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), CLE_STOCKAGE)).toBe(CLE_ECRAN);
    // Rouvert : il revient seul (relu chaque minute)
    api.donnees.parametresPublics.features.coupeSpectators = true;
    await page.clock.fastForward(60_000);
    await expect(carte(page, 'Classement de la saison')).toBeVisible();
  });
});

test.describe('Écran du salon : mode libre (écran 15)', () => {
  test('classement, prochain tournoi, dispo, derniers matchs, record du Snake', async ({ page, api }) => {
    await ouvrir(page);
    const classement = carte(page, 'Classement de la saison');
    await expect(classement.getByRole('listitem')).toHaveCount(8);
    await expect(classement.getByRole('listitem').first()).toContainText('Lucas M.');
    await expect(classement.getByRole('listitem').first()).toContainText('252');
    await expect(classement.getByRole('listitem').nth(3)).toContainText('D\'Home Barber');
    await expect(classement.getByRole('listitem').nth(3).getByRole('img', { name: 'Le salon' })).toBeVisible();
    await expect(classement).toContainText('Seuls les joueurs qui ont choisi d’apparaître au classement.');

    const tournoi = carte(page, 'Coupe de Novembre');
    await expect(tournoi).toContainText('Prochain tournoi');
    await expect(tournoi).toContainText('· 19:00');
    await expect(tournoi).toContainText('J − 17');
    await expect(tournoi).toContainText('11 / 16 inscrits');
    await expect(tournoi.locator('[data-qr-url]')).toHaveAttribute('data-qr-url', api.ecran.etat.next_tournament.url);

    const dispo = carte(page, 'Dispo pour un match');
    await expect(dispo.getByRole('listitem').filter({ hasText: 'Kevin' })).toContainText('Dispo');
    await expect(dispo.getByRole('listitem').filter({ hasText: 'Dom' })).toContainText('Pas dispo');
    await expect(dispo).not.toContainText('rendez-vous');

    const derniers = carte(page, 'Derniers matchs');
    await expect(derniers).toContainText('Kevin – Lucas M.');
    await expect(derniers).toContainText('5 – 3');
    await expect(derniers).toContainText('14 matchs joués aujourd’hui');

    const snake = carte(page, 'Snake du Gang · record du mois');
    await expect(snake).toContainText('Théo L.');
    await expect(snake).toContainText(/1\s240/);

    // Relu toutes les 15 s hors tournoi (pas à 5 s)
    const n = lectures(api);
    await page.clock.fastForward(5_500);
    await page.waitForTimeout(200);
    expect(lectures(api)).toBe(n);
    api.ecran.etat.played_today = 15;
    await page.clock.fastForward(10_000);
    await expect(derniers).toContainText('15 matchs joués aujourd’hui');
  });

  test('sans tournoi annoncé : QR vers la Coupe ; sans record du Snake : rien', async ({ page, api }) => {
    api.ecran.etat.next_tournament = null;
    api.ecran.etat.snake = null;
    await ouvrir(page);
    const coupe = carte(page, 'Joue au salon');
    await expect(coupe.locator('[data-qr-url]')).toHaveAttribute('data-qr-url', 'https://dhomebarber.fr/coupe');
    await expect(carte(page, 'Snake du Gang · record du mois')).toHaveCount(0);
  });

  test('un match ordinaire regardable passe en grand, puis retour au mode libre 8 s après sa fin', async ({ page, api }) => {
    api.ecran.matchOrdinaire();
    await ouvrir(page);
    // Vue en direct par le serveur de jeu, avec la clé de l'écran (jamais un jeton de compte)
    await expect(bande(page)).toContainText('Sarah K.');
    await expect(bande(page)).toContainText('Kevin');
    await expect(bande(page)).toContainText('0 – 1');
    await enDirect(api, SALLE_ECRAN);
    const auth = api.coupe.messages('auth').at(-1);
    expect(auth).toMatchObject({ screen: CLE_ECRAN, v: 3 });
    expect(auth.token).toBeUndefined();
    expect(api.coupe.messages('watch').at(-1)).toMatchObject({ w: SALLE_ECRAN });
    await expect(carte(page, 'Sur ton téléphone').locator('[data-qr-url]'))
      .toHaveAttribute('data-qr-url', `https://dhomebarber.fr/coupe/regarder?w=${SALLE_ECRAN}`);
    await expect(carte(page, 'Coupe de Novembre')).toHaveCount(0);

    api.ecran.finirDirect(SALLE_ECRAN);
    const fin = grand(page).getByRole('status').filter({ hasText: 'Fin du match' });
    await expect(fin).toContainText('Sarah K. gagne');
    await expect(fin).toContainText('1 – 0');
    await page.clock.fastForward(5_000);
    await expect(fin).toBeVisible();
    await page.clock.fastForward(4_000);
    await expect(grand(page)).toHaveCount(0);
    await expect(carte(page, 'Coupe de Novembre')).toBeVisible();
  });
});

test.describe('Écran du salon : mode tournoi (écran 14)', () => {
  test('tableau, match en cours en grand, aussi en direct, prochain match, QR du match', async ({ page, api }) => {
    api.ecran.modeTournoi();
    await ouvrir(page);
    await expect(scene(page).getByRole('heading', { level: 1, name: 'Coupe de Novembre' })).toBeVisible();
    await expect(scene(page)).toContainText('En direct · quarts');

    // Tableau : tour en cours et suivant
    await expect(carte(page, 'Quarts de finale')).toBeVisible();
    await expect(ligneTableau(page, MATCHS_ECRAN.q1)).toHaveAttribute('data-etat', 'live');
    await expect(ligneTableau(page, MATCHS_ECRAN.q1)).toContainText('Lucas M. – Dom');
    await expect(ligneTableau(page, MATCHS_ECRAN.q1)).toContainText('3 – 2');
    await expect(ligneTableau(page, MATCHS_ECRAN.q2)).toHaveAttribute('data-etat', 'done');
    await expect(ligneTableau(page, MATCHS_ECRAN.q2)).toContainText('5 – 3');
    await expect(ligneTableau(page, MATCHS_ECRAN.q3)).toContainText('à suivre');
    await expect(ligneTableau(page, MATCHS_ECRAN.q4)).toContainText('1 – 1');
    await expect(ligneTableau(page, MATCHS_ECRAN.d1)).toContainText('Inès B.');
    await expect(ligneTableau(page, MATCHS_ECRAN.d1)).toContainText('contre Lucas M. ou Dom');
    await expect(ligneTableau(page, MATCHS_ECRAN.d2)).toContainText('Kevin ou Yanis K. – D\'Home Barber ou Romain');

    // Match en grand : le commencé le plus tôt (Quart 1), joueur du haut à gauche ; sa ligne marquée
    await expect(grand(page)).toHaveAttribute('data-grand', MATCHS_ECRAN.q1);
    await expect(bande(page)).toContainText('Score : Dom 2, Lucas M. 3');
    await enDirect(api, MATCHS_ECRAN.q1);
    await expect(ligneTableau(page, MATCHS_ECRAN.q1)).toHaveAttribute('aria-current', 'true');
    expect(api.coupe.messages('watch').at(-1)).toMatchObject({ m: MATCHS_ECRAN.q1 });
    await expect(carte(page, 'Aussi en direct')).toContainText('D\'Home Barber – Romain');
    await expect(carte(page, 'Aussi en direct')).toContainText('1 – 1');
    // Nommé par `tour.title` (« Quart 4 »), jamais par le nom du tour (« Quart de finale »)
    await expect(carte(page, 'Aussi en direct')).toContainText('Quart 4');
    await expect(carte(page, 'Aussi en direct')).not.toContainText('Quart de finale');
    await expect(carte(page, 'Prochain match')).toContainText('Kevin – Yanis K.');
    const qrMatch = carte(page, 'Sur ton téléphone');
    await expect(qrMatch.locator('[data-qr-url]'))
      .toHaveAttribute('data-qr-url', `https://dhomebarber.fr/coupe/regarder?m=${MATCHS_ECRAN.q1}&tournoi=${TOURNOI_ECRAN}`);
    await expect(qrMatch).toContainText('34 spectateurs en ce moment');

    // Relu toutes les 5 s pendant un tournoi
    const n = lectures(api);
    await page.clock.fastForward(5_000);
    await expect.poll(() => lectures(api)).toBeGreaterThan(n);
  });

  test('fin du match en grand : 8 s sur le score final, puis le suivant, puis tout le tableau', async ({ page, api }) => {
    api.ecran.modeTournoi();
    await ouvrir(page);
    await expect(grand(page)).toHaveAttribute('data-grand', MATCHS_ECRAN.q1);
    // L'écran regarde vraiment le match (`wstart` reçu) avant qu'il finisse
    await expect(bande(page)).toContainText('Score : Dom 2, Lucas M. 3');
    await enDirect(api, MATCHS_ECRAN.q1);

    // Un match qui commence ensuite ne prend pas la place du match en grand. Relecture tout de suite
    // (retour du réseau) plutôt qu'un saut d'horloge de 5 s : la vue en direct prendrait le saut pour
    // une connexion muette et se reconnecterait
    api.ecran.ajouterDirect({
      kind: 'tour', id: MATCHS_ECRAN.q3, names: ['Kevin', 'Yanis K.'], roles: ['barber', 'user'], sc: [0, 0],
      tour: tourEcran('Quart 3'),
    });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(carte(page, 'Aussi en direct')).toContainText('Kevin – Yanis K.');
    await expect(grand(page)).toHaveAttribute('data-grand', MATCHS_ECRAN.q1);

    // Quart 1 fini (`wend` du serveur de jeu) : score final 8 s, puis le match en cours commencé le
    // plus tôt (Quart 4)
    const q1 = api.ecran.etat.tournament.rounds[0].matches[0];
    Object.assign(q1, { status: 'done', sc: [3, 2], winner: 0 });
    api.ecran.finirDirect(MATCHS_ECRAN.q1);
    const fin = grand(page).getByRole('status').filter({ hasText: 'Fin du match' });
    await expect(fin).toContainText('Lucas M. gagne');
    await expect(fin).toContainText('3 – 2');
    // Match de tournoi nommé par `tour.title` (« Quart 1 »), jamais par le nom du tour
    await expect(fin).toContainText('Quart 1 · Fin du match');
    await page.clock.fastForward(5_000);
    await expect(fin).toBeVisible();
    await expect(grand(page)).toHaveAttribute('data-grand', MATCHS_ECRAN.q1);
    await page.clock.fastForward(4_000);
    await expect(grand(page)).toHaveAttribute('data-grand', MATCHS_ECRAN.q4);
    await expect(bande(page)).toContainText('Score : Romain 1, D\'Home Barber 1');
    await expect(carte(page, 'Sur ton téléphone').locator('[data-qr-url]'))
      .toHaveAttribute('data-qr-url', `https://dhomebarber.fr/coupe/regarder?m=${MATCHS_ECRAN.q4}&tournoi=${TOURNOI_ECRAN}`);

    // Plus aucun match du tournoi en direct : tout le tableau, QR du tournoi
    api.ecran.finirDirect(MATCHS_ECRAN.q4);
    api.ecran.finirDirect(MATCHS_ECRAN.q3);
    await expect(grand(page).getByRole('status').filter({ hasText: 'Fin du match' })).toBeVisible();
    await page.clock.fastForward(5_000);
    await page.clock.fastForward(4_000);
    await expect(grand(page)).toHaveCount(0);
    const tableau = carte(page, 'Tableau');
    await expect(tableau).toContainText('Quarts de finale');
    await expect(tableau).toContainText('Demi-finales');
    await expect(tableau).toContainText('Finale');
    await expect(carte(page, 'Sur ton téléphone').locator('[data-qr-url]'))
      .toHaveAttribute('data-qr-url', `https://dhomebarber.fr/coupe/tournoi/${TOURNOI_ECRAN}`);
  });

  test('vue en direct qui perd le match sans sa fin : « Fin du direct » avec le dernier score, sans vainqueur', async ({ page, api }) => {
    api.ecran.modeTournoi();
    await ouvrir(page);
    await expect(bande(page)).toContainText('Score : Dom 2, Lucas M. 3');
    await enDirect(api, MATCHS_ECRAN.q1);
    // Fini pendant une coupure : plus aucun état, la vue se reconnecte et ne retrouve plus le match
    api.coupe.directs.get(MATCHS_ECRAN.q1).fini = true;
    const fin = grand(page).getByRole('status').filter({ hasText: 'Fin du direct' });
    await expect(fin).toContainText('Dom – Lucas M.', { timeout: 15_000 });
    await expect(fin).toContainText('2 – 3');
    await expect(fin).not.toContainText('gagne');
  });

  test('présence ouverte, tableau pas encore tiré : l’heure du début', async ({ page, api }) => {
    api.ecran.modeTournoi({ avantTirage: true });
    await ouvrir(page);
    await expect(scene(page).getByRole('heading', { level: 1, name: 'Coupe de Novembre' })).toBeVisible();
    await expect(carte(page, 'Avant le tirage')).toContainText('Dans 12 min');
    await expect(carte(page, 'Avant le tirage')).toContainText('Je suis là');
  });
});

test.describe('Écran du salon : réseau, photos, son, écran allumé', () => {
  test('panne réseau : dernières données gardées et bandeau, puis retour', async ({ page, api }) => {
    let coupe = false;
    api.surcharger('GET', '/coupe/screen', () => (coupe ? RESEAU_COUPE : undefined));
    await ouvrir(page);
    await expect(carte(page, 'Classement de la saison')).toBeVisible();
    coupe = true;
    await page.clock.fastForward(15_000);
    await expect(scene(page).getByRole('status').filter({ hasText: 'Connexion perdue, on réessaie…' })).toBeVisible();
    await expect(carte(page, 'Classement de la saison')).toContainText('Lucas M.');
    coupe = false;
    await page.clock.fastForward(15_000);
    await expect(scene(page).getByText('Connexion perdue, on réessaie…')).toHaveCount(0);

    // Sans rien d'affiché : écran d'attente
    coupe = true;
    await page.reload();
    await expect(scene(page).getByRole('heading', { name: 'Connexion perdue' })).toBeVisible();
  });

  test('aucune photo, même si le serveur en envoyait : pions aux initiales seulement', async ({ page, api }) => {
    api.ecran.modeTournoi();
    api.ecran.etat.leaderboard[0].avatar_url = media(5);
    api.ecran.etat.leaderboard[0].photo_url = media(6);
    api.ecran.etat.barbers[0].photo_url = media(7);
    api.ecran.etat.live[0].photos = [media(8), media(9)];
    api.ecran.etat.tournament = null;
    api.coupe.wstartEnPlus = { photos: [media(10), media(11)] };
    await ouvrir(page);
    await expect(carte(page, 'Classement de la saison')).toBeVisible();
    await expect(bande(page)).toContainText('Lucas M.');
    await enDirect(api, MATCHS_ECRAN.q1);
    const sources = await page.locator('img').evaluateAll((imgs) => imgs.map((i) => i.currentSrc || i.src));
    expect(sources.filter((s) => s.includes('/api/media/'))).toEqual([]);
    expect(api.requetes.filter((r) => r.chemin.startsWith('/api/media/'))).toEqual([]);
    // Les styles non plus (aucune image de fond venue de l'API)
    const fonds = await page.evaluate(() => [...document.querySelectorAll('*')].map((e) => getComputedStyle(e).backgroundImage).filter((b) => b.includes('/api/media/')));
    expect(fonds).toEqual([]);
  });

  test('muet : un toucher ne lance jamais la musique de l’app, le match en grand sans aucun son', async ({ page, api }) => {
    api.ecran.matchOrdinaire();
    await page.addInitScript(() => {
      try { localStorage.removeItem('dhb-music-off'); } catch { /* rien */ }
      window.__lectures = 0;
      window.__sons = 0;
      HTMLMediaElement.prototype.play = function play() { window.__lectures += 1; return Promise.resolve(); };
      const Vrai = window.AudioContext;
      if (Vrai) {
        window.AudioContext = function AudioContext(...args) { window.__sons += 1; return new Vrai(...args); };
        window.webkitAudioContext = window.AudioContext;
      }
    });
    await ouvrir(page);
    await expect(carte(page, 'Classement de la saison')).toBeVisible();
    await expect(bande(page)).toContainText('Sarah K.');
    await enDirect(api, SALLE_ECRAN);
    await scene(page).click();
    // Coins de l'écran, dont celui du bouton musique des pages client (recouvert par l'écran)
    const vue = page.viewportSize();
    await page.mouse.click(5, 5);
    await page.mouse.click(vue.width - 20, 20);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__lectures)).toBe(0);
    expect(await page.evaluate(() => window.__sons)).toBe(0);
    expect(await page.locator('audio, video').count()).toBe(0);
  });

  test('écran gardé allumé (Wake Lock), redemandé au retour visible', async ({ page }) => {
    await page.addInitScript(() => {
      window.__verrous = 0;
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: { request: async () => { window.__verrous += 1; return { released: false, release: async () => {} }; } },
      });
    });
    await ouvrir(page);
    await expect(carte(page, 'Classement de la saison')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__verrous)).toBeGreaterThanOrEqual(1);
  });

  test('rechargée toutes les 6 h (nouveau déploiement), la clé de l’appareil reste', async ({ page, api }) => {
    await ouvrir(page);
    await expect(carte(page, 'Classement de la saison')).toBeVisible();
    const chargements = [];
    page.on('load', () => chargements.push(Date.now()));
    await page.clock.fastForward('05:59:00');
    await page.waitForTimeout(200);
    expect(chargements).toEqual([]);
    await page.clock.fastForward('00:02:00');
    await expect.poll(() => chargements.length).toBeGreaterThanOrEqual(1);
    await expect(carte(page, 'Classement de la saison')).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), CLE_STOCKAGE)).toBe(CLE_ECRAN);
    expect(api.ecran.lectures().length).toBeGreaterThan(1);
  });
});

test.describe('Écran du salon : vue en direct (décisions de la contre-expertise)', () => {
  test('une seule socket pour tout l’écran : deux matchs de suite sur la même connexion (A2)', async ({ page, api }) => {
    api.ecran.modeTournoi();
    await ouvrir(page);
    await expect(bande(page)).toContainText('Score : Dom 2, Lucas M. 3');
    await enDirect(api, MATCHS_ECRAN.q1);
    const q1 = api.ecran.etat.tournament.rounds[0].matches[0];
    Object.assign(q1, { status: 'done', sc: [3, 2], winner: 0 });
    api.ecran.finirDirect(MATCHS_ECRAN.q1);
    await expect(grand(page).getByRole('status').filter({ hasText: 'Fin du match' })).toBeVisible();
    // 8 s sur le score final en temps réel (un saut d'horloge ferait croire à une socket muette)
    await expect(grand(page)).toHaveAttribute('data-grand', MATCHS_ECRAN.q4, { timeout: 15_000 });
    await expect(bande(page)).toContainText('Score : Romain 1, D\'Home Barber 1');
    await enDirect(api, MATCHS_ECRAN.q4);
    // Même socket : `watch` du match suivant, jamais une nouvelle connexion par match
    const sockets = api.ecran.socketsEcran(CLE_ECRAN);
    expect(sockets).toHaveLength(1);
    expect(sockets[0].messages.filter((m) => m.t === 'watch').map((m) => m.m)).toEqual([MATCHS_ECRAN.q1, MATCHS_ECRAN.q4]);
    expect(sockets[0].ferme).toBe(false);
  });

  test('socket de l’écran fermée en 4401 sans « screen_revoked » : la clé reste, la vue revient seule (A1)', async ({ page, api }) => {
    api.ecran.modeTournoi();
    await ouvrir(page);
    await enDirect(api, MATCHS_ECRAN.q1);
    const avant = authsEcran(api);
    api.ecran.fermerSocketsEcran(CLE_ECRAN, 4401);
    // Nouvelle connexion avec la même clé, le même match regardé
    await expect.poll(() => authsEcran(api), { timeout: 10_000 }).toBeGreaterThan(avant);
    await expect.poll(() => api.ecran.socketsEcran(CLE_ECRAN).at(-1).messages.some((m) => m.t === 'watch' && m.m === MATCHS_ECRAN.q1))
      .toBe(true);
    await enDirect(api, MATCHS_ECRAN.q1);
    await expect(grand(page)).toHaveAttribute('data-grand', MATCHS_ECRAN.q1);
    await expect(bande(page)).toContainText('Score : Dom 2, Lucas M. 3');
    await expect(scene(page).getByRole('heading', { name: 'Écran coupé par le salon' })).toHaveCount(0);
    expect(await page.evaluate((k) => localStorage.getItem(k), CLE_STOCKAGE)).toBe(CLE_ECRAN);
    // Les lectures continuent avec la clé
    const n = lectures(api);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => lectures(api)).toBeGreaterThan(n);
    expect(api.ecran.lectures().at(-1).chemin).toBe('/coupe/screen');
  });

  test('écran coupé pendant un match (« screen_revoked ») : relu tout de suite, « Écran coupé », clé oubliée', async ({ page, api }) => {
    // Mode libre : relu toutes les 15 s ; la socket fait relire tout de suite
    api.ecran.matchOrdinaire();
    await ouvrir(page);
    await enDirect(api, SALLE_ECRAN);
    const n = lectures(api);
    api.ecran.couper(CLE_ECRAN);
    await expect(scene(page).getByRole('heading', { name: 'Écran coupé par le salon' })).toBeVisible({ timeout: 5_000 });
    expect(lectures(api)).toBeGreaterThan(n);
    expect(await page.evaluate((k) => localStorage.getItem(k), CLE_STOCKAGE)).toBeNull();
  });

  test('avant `wstart` : noms, rôles et score de la ligne `live`, jamais « Joueur » ni « 0 – 0 » (A5)', async ({ page, api }) => {
    api.ecran.modeTournoi();
    // Serveur de jeu lent à répondre : la bande vient de la ligne `live` de l'écran
    api.coupe.delaiAuth = 4_000;
    await ouvrir(page);
    await expect(bande(page)).toContainText('Score : Dom 2, Lucas M. 3');
    await expect(bande(page)).not.toContainText('Joueur');
    await expect(bande(page)).not.toContainText('Premier à');
    expect(api.coupe.messages('watch')).toEqual([]);
    // Pions aux initiales dès le début, jamais « ? »
    await expect(bande(page).locator('.cdgw-pawn')).toHaveText(['D', 'LM']);
  });

  test('écran refusé (trop de spectateurs) : le match reste en grand, nouvel essai 30 s plus tard', async ({ page, api }) => {
    api.ecran.matchOrdinaire();
    api.coupe.refusRegarder = 'watch_full';
    api.coupe.refusRegarderFois = 1;
    await ouvrir(page);
    await expect.poll(() => api.coupe.messages('watch').length).toBe(1);
    // Jamais abandonné en silence : noms et score de `live`
    await expect(grand(page)).toHaveAttribute('data-grand', SALLE_ECRAN);
    await expect(bande(page)).toContainText('Score : Kevin 0, Sarah K. 1');
    await page.waitForTimeout(500);
    await expect(grand(page)).toHaveAttribute('data-grand', SALLE_ECRAN);
    await expect(carte(page, 'Coupe de Novembre')).toHaveCount(0);
    await page.clock.fastForward(25_000);
    await page.waitForTimeout(300);
    expect(api.coupe.messages('watch')).toHaveLength(1);
    await page.clock.fastForward(6_000);
    await expect.poll(() => api.coupe.messages('watch').length).toBe(2);
    // Cette fois regardé : un but arrive par la vue en direct
    await expect.poll(() => api.coupe.regardent(SALLE_ECRAN).length).toBe(1);
    api.coupe.relayer(SALLE_ECRAN, { t: 'goal', by: 1, sc: [1, 1], v: 1, fx: 0 });
    await expect(bande(page)).toContainText('Score : Kevin 1, Sarah K. 1');
  });

  test('la télé ne se compte pas parmi les spectateurs (A12)', async ({ page, api }) => {
    // Un seul « spectateur » : l'écran du salon lui-même
    api.ecran.matchOrdinaire({ watchers: 1 });
    await ouvrir(page);
    const qr = carte(page, 'Sur ton téléphone');
    await expect(qr).toContainText('Sois le premier à regarder');
    // 35 dont l'écran : 34
    api.ecran.etat.live[0].watchers = 35;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(qr).toContainText('34 spectateurs en ce moment');
    // Aucun écran ne regarde : tous comptés
    api.ecran.etat.live[0].screen = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(qr).toContainText('35 spectateurs en ce moment');
  });

  for (const mode of ['libre', 'tournoi']) {
    test(`textes à 16 px de scène au moins, mode ${mode}, 1280 × 720 et 1920 × 1080 (A4)`, async ({ page, api }) => {
      if (mode === 'tournoi') api.ecran.modeTournoi();
      for (const [w, h] of [[1280, 720], [1920, 1080]]) {
        await page.setViewportSize({ width: w, height: h });
        await ouvrir(page);
        await expect(mode === 'libre' ? carte(page, 'Classement de la saison') : bande(page)).toBeVisible();
        await page.evaluate(() => document.fonts?.ready);
        const petits = await page.evaluate(() => {
          const main = document.querySelector('[data-ecran-scene]');
          const k = main.getBoundingClientRect().width / main.offsetWidth;
          const out = [];
          for (const el of main.querySelectorAll('*')) {
            // Pions aux initiales (décor) et textes pour lecteur d'écran : hors mesure
            if (el.closest('[aria-hidden="true"], .sr-only')) continue;
            const texte = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
            if (!texte || !el.offsetWidth) continue;
            // Échelle locale lue sur un bloc assez large (un mot court arrondit `offsetWidth`)
            let bloc = el;
            while (bloc.parentElement && bloc.offsetWidth < 120) bloc = bloc.parentElement;
            const r = bloc.getBoundingClientRect();
            // px de la scène : taille à l'écran divisée par l'échelle de l'écran
            const px = (parseFloat(getComputedStyle(el).fontSize) * (r.width / bloc.offsetWidth)) / k;
            if (px < 15.9) out.push({ texte: texte.slice(0, 40), px: Math.round(px * 10) / 10 });
          }
          return out;
        });
        expect(petits, `${w} × ${h}`).toEqual([]);
      }
    });
  }

  test('bande du score à l’échelle de l’écran : à 3840 × 2160, celle de 1280 × 720 trois fois plus grande (A4)', async ({ page, api }) => {
    api.ecran.modeTournoi();
    const mesurer = () => page.evaluate(() => {
      const bloc = document.querySelector('[data-grand]').getBoundingClientRect();
      const bandeau = document.querySelector('[data-grand] .cdgw-band').getBoundingClientRect();
      const taille = (sel) => parseFloat(getComputedStyle(document.querySelector(`[data-grand] ${sel}`)).fontSize);
      return { bloc: bloc.height, part: bandeau.height / bloc.height, nom: taille('.cdgw-name'), score: taille('.cdgw-score') };
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await ouvrir(page);
    await expect(bande(page)).toContainText('Score : Dom 2, Lucas M. 3');
    await page.evaluate(() => document.fonts?.ready);
    const petit = await mesurer();
    await page.setViewportSize({ width: 3840, height: 2160 });
    await expect.poll(async () => (await mesurer()).bloc).toBeGreaterThan(petit.bloc * 2.9);
    const grandEcran = await mesurer();
    expect(Math.abs(grandEcran.part - petit.part) / petit.part, 'part du bloc prise par la bande').toBeLessThan(0.08);
    expect(grandEcran.nom / petit.nom).toBeCloseTo(3, 1);
    expect(grandEcran.score / petit.score).toBeCloseTo(3, 1);
    expect(await nomsBande(page)).toEqual([{ texte: 'Dom', coupe: false }, { texte: 'Lucas M.', coupe: false }]);
  });
});

test.describe('Écran du salon : tailles', () => {
  const tailles = [
    { nom: 'petite télé 960 × 540', w: 960, h: 540, scene: 'paysage' },
    { nom: 'télé 1280 × 720', w: 1280, h: 720, scene: 'paysage' },
    { nom: 'télé 1366 × 768', w: 1366, h: 768, scene: 'paysage' },
    { nom: 'tablette en paysage 1180 × 820', w: 1180, h: 820, scene: 'paysage' },
    { nom: 'télé 1920 × 1080', w: 1920, h: 1080, scene: 'paysage' },
    { nom: 'télé 4K 3840 × 2160', w: 3840, h: 2160, scene: 'paysage' },
    { nom: 'tablette en portrait 810 × 1080', w: 810, h: 1080, scene: 'portrait' },
  ];
  // Noms de la bande du score, entiers à toutes les tailles (deux lignes au plus, jamais d'ellipse)
  const nomsAttendus = { 'libre avec un match': ['D\'Home Barber', 'Lucas M.'], tournoi: ['Dom', 'Lucas M.'] };
  for (const t of tailles) {
    for (const mode of ['libre', 'libre avec un match', 'tournoi']) {
      test(`${t.nom}, mode ${mode} : scène entière à l’écran, rien ne déborde, aucun défilement, noms entiers`, async ({ page, api }) => {
        if (mode === 'tournoi') api.ecran.modeTournoi();
        if (mode === 'libre avec un match') api.ecran.matchOrdinaire({ names: ['Lucas M.', 'D\'Home Barber'], roles: ['user', 'salon'] });
        await page.setViewportSize({ width: t.w, height: t.h });
        await ouvrir(page);
        await expect(scene(page)).toHaveAttribute('data-ecran-scene', t.scene);
        await expect(mode === 'libre' ? carte(page, 'Classement de la saison') : bande(page)).toBeVisible();
        await page.evaluate(() => document.fonts?.ready);

        const mesures = await page.evaluate(() => {
          const doc = document.documentElement;
          const main = document.querySelector('[data-ecran-scene]').getBoundingClientRect();
          // Toute carte reste dans la scène et dans sa colonne (jamais coupée par elle), et son contenu
          // tient dans la carte
          const hors = (r, b) => r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1;
          const sorties = [...document.querySelectorAll('[data-ecran-scene] section')]
            .map((s) => {
              const r = s.getBoundingClientRect();
              return {
                nom: s.getAttribute('aria-label') || s.querySelector('h2,h1')?.textContent || '?',
                dehors: hors(r, main) || hors(r, s.parentElement.getBoundingClientRect()),
                coupe: s.scrollHeight > s.clientHeight + 1 || s.scrollWidth > s.clientWidth + 1,
              };
            })
            .filter((s) => s.dehors || s.coupe);
          return {
            defile: Math.max(doc.scrollHeight - window.innerHeight, doc.scrollWidth - window.innerWidth),
            main: { left: main.left, top: main.top, right: main.right, bottom: main.bottom },
            sorties,
          };
        });
        expect(mesures.defile).toBeLessThanOrEqual(0);
        expect(mesures.main.left).toBeGreaterThanOrEqual(-1);
        expect(mesures.main.top).toBeGreaterThanOrEqual(-1);
        expect(mesures.main.right).toBeLessThanOrEqual(t.w + 1);
        expect(mesures.main.bottom).toBeLessThanOrEqual(t.h + 1);
        expect(mesures.sorties).toEqual([]);

        // Match en grand jamais sous la mise à l'échelle de l'écran : le stade (placé d'après la taille
        // à l'écran) et le terrain dessiné (d'après la mise en page) resteraient l'un sur l'autre
        if (mode !== 'libre') {
          const ecart = await page.evaluate(() => {
            const vue = document.querySelector('[data-ecran-scene] [data-variant="screen"]');
            const r = vue.getBoundingClientRect();
            return Math.max(Math.abs(r.width - vue.offsetWidth), Math.abs(r.height - vue.offsetHeight));
          });
          expect(ecart, 'Match en grand mis à l’échelle : stade et terrain dessiné décalés').toBeLessThanOrEqual(1);
          await expect(bande(page)).toContainText(nomsAttendus[mode][1]);
          const noms = await nomsBande(page);
          expect(noms.map((n) => n.texte)).toEqual(nomsAttendus[mode]);
          expect(noms.filter((n) => n.coupe), `noms coupés à ${t.w} × ${t.h}`).toEqual([]);
        }
      });
    }
  }
});
