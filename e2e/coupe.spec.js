// La Coupe du Gang : l'écran de jeu (src/components/coupe/CoupeGame.jsx) sur l'écran d'essai
// /coupe-test et sur l'accueil de la Coupe (/coupe). Qui y accède, aucun WebSocket ni dessin avant
// une partie, protocole v2 avec le faux serveur de jeu (e2e/support/fauxCoupe.js) : salle d'attente,
// défi reçu, défi à un barber, match, but, fin avec les points (place avant → après), temps écoulé,
// match trop court, revanche refusée, story du score, Signaler, Bloquer, abandon, erreurs ; départs
// et coupures (retour du navigateur, page cachée, socket muette, salle d'attente reprise, défi reçu
// jeu ouvert) ; musique du salon, clavier, son ; puis les modes sans réseau : contre le salon (un but
// à la souris, partie rejouée image par image et simulée à l'identique ici) et à deux sur un téléphone.
import { test, expect } from './support/test.js';
import { ADMIN, CLIENT, MOT_DE_PASSE, media } from './support/donnees.js';
import { CODE_MATCH, LIEN_MATCH, LIEN_DEFI, LIEN_INVITE, CLE_KEVIN } from './support/fauxCoupe.js';
import { attendreSansDebordement, toast } from './support/outils.js';
import { LocalMatch } from '../src/lib/coupe/localMatch.js';
import { MS, MG, viewOf, screenToWorld } from '../src/lib/coupe/renderer.js';

const titre = (page) => page.getByRole('heading', { name: 'La Coupe du Gang' });
/** Titre de l'accueil de la Coupe (/coupe). */
const titreAccueil = (page) => page.getByRole('heading', { level: 1, name: 'La Coupe du Gang' });
const blocPoints = (page) => page.getByRole('region', { name: /Points de Coupe/ });
/** Fin d'un match classé pour ce téléphone (side 1) : +3, 42 → 45, 8e → 6e. */
const FIN_VICTOIRE = {
  t: 'end', winner: 1, sc: [1, 3], forfeit: false, cancelled: false, reason: null,
  points: { ranked: true, reason: null, delta: [-1, 3], total: 45, rank: 6, rank_before: 8 },
};

/** Compte barber de Kevin (fiche `emp-kevin`), qui a le jeu ouvert. */
const KEVIN = {
  id: 'user-kevin', email: 'kevin.jeu@dhomebarber.fr', full_name: 'Kevin Barber', phone: '',
  role: 'barber', employee_id: 'emp-kevin',
};

/** Page cachée ou revenue au premier plan (autre app, écran verrouillé), comme le navigateur le signale. */
async function cacherPage(page, cachee) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, cachee);
}

/** Client sur l'accueil de la Coupe, match rejoint avec le code (side 1 contre Kevin), en jeu, 1 – 0. */
async function matchDepuisAccueil(page, api, connecter) {
  await connecter(CLIENT);
  await page.goto('/coupe');
  await expect(titreAccueil(page)).toBeVisible();
  await page.getByLabel('J\'ai un code').fill(CODE_MATCH);
  await page.getByRole('button', { name: 'Rejoindre', exact: true }).click();
  await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
  const cnx = api.coupe.derniere();
  api.coupe.etat(cnx, { ph: 'live', sc: [0, 1] });
  await expect(page.getByText('Score : Toi 1 – 0 Kevin')).toBeAttached();
  return cnx;
}
const boutonCreer = (page) => page.getByRole('button', { name: /^Créer un match/ });
const boutonRejoindre = (page) => page.getByRole('button', { name: 'Rejoindre', exact: true });
const jeu = (page) => page.getByRole('dialog', { name: 'La Coupe du Gang' });
const terrain = (page) => page.getByRole('img', { name: /Terrain de foot/ });

/** Admin connecté, match rejoint avec le code : on joue le side 1 contre Kevin (barber). */
async function rejoindreParCode(page, api, connecter) {
  await connecter(ADMIN);
  await page.goto('/coupe-test');
  await page.getByLabel('Rejoindre un match').fill(CODE_MATCH);
  await boutonRejoindre(page).click();
  await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
  return api.coupe.derniere();
}

/** Position du canvas du terrain dans la page. */
const cadreDuTerrain = (page) => terrain(page).evaluate((c) => {
  const r = c.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
});

test.describe('La Coupe du Gang : accès à l\'écran d\'essai', () => {
  test('client simple : renvoyé vers l\'accueil du salon', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe-test');

    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.getByRole('link', { name: 'Réserver maintenant' })).toBeVisible();
    // (l'accueil a sa carte « La Coupe du Gang » : c'est l'écran d'essai qui ne doit pas s'ouvrir)
    await expect(boutonCreer(page)).toHaveCount(0);
    await expect(page.getByText('écran d\'essai', { exact: false })).toHaveCount(0);
    expect(api.coupe.connexions).toEqual([]);
  });

  test('compte testeur : accès à l\'écran', async ({ page, api, connecter }) => {
    api.comptes.find((c) => c.email === CLIENT.email).is_tester = true;
    await connecter(CLIENT);
    await page.goto('/coupe-test');

    await expect(titre(page)).toBeVisible();
    await expect(page).toHaveURL(/\/coupe-test$/);
  });

  test('sans session : connexion demandée, avec retour au jeu', async ({ page }) => {
    await page.goto('/coupe-test');
    await expect(page).toHaveURL((url) => url.pathname === '/login'
      && url.searchParams.get('redirect') === '/coupe-test');
  });
});

test.describe('La Coupe du Gang : en ligne (protocole v2)', () => {
  test('salle d\'attente : rien avant « Créer un match », puis code, lien à partager, et plus rien ne se dessine', async ({ page, api, connecter }) => {
    // Partage du navigateur remplacé (Chromium sans interface n'en a pas) ; images demandées comptées
    await page.addInitScript(() => {
      window.__partages = [];
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (donnees) => { window.__partages.push(donnees); return Promise.resolve(); },
      });
      window.__images = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (fn) => { window.__images += 1; return raf(fn); };
    });
    const sockets = [];
    page.on('websocket', (ws) => sockets.push(ws.url()));
    const jeton = await connecter(ADMIN);
    await page.goto('/coupe-test');

    await expect(titre(page)).toBeVisible();
    await expect(boutonCreer(page)).toBeVisible();
    await expect(boutonRejoindre(page)).toBeDisabled();
    // Accueil : ni terrain dessiné, ni WebSocket de jeu
    await expect(terrain(page)).toHaveCount(0);
    expect(sockets.filter((u) => u.includes('/ws/coupe'))).toEqual([]);
    expect(api.coupe.connexions).toEqual([]);

    await boutonCreer(page).click();
    await expect(page.getByText(CODE_MATCH, { exact: true })).toBeVisible();
    await expect(page.getByText('En attente de l\'autre joueur')).toBeVisible();
    await expect(terrain(page)).toBeVisible();

    // Jeton jamais dans l'adresse : premier message `auth` (v2), puis la création
    expect(api.coupe.connexions).toHaveLength(1);
    const [cnx] = api.coupe.connexions;
    expect(new URL(cnx.url).pathname).toBe('/ws/coupe');
    expect(cnx.url).not.toContain(jeton);
    expect(cnx.messages[0]).toEqual({ t: 'auth', v: 2, token: jeton });
    expect(api.coupe.messages('create')).toEqual([{ t: 'create' }]);

    // Salle d'attente : le terrain est dessiné une fois, aucune image demandée ensuite
    const images = await page.evaluate(() => window.__images);
    await page.getByRole('button', { name: 'Envoyer le défi' }).click();
    await expect.poll(() => page.evaluate(() => window.__partages)).toEqual([{
      title: 'La Coupe du Gang',
      text: `Je te défie à la Coupe du Gang ! Code du match : ${CODE_MATCH}`,
      url: `https://dhomebarber.fr/coupe?defi=${LIEN_MATCH}`,
    }]);
    await expect(page.getByText(/^Code valable encore \d:\d\d$/)).toBeVisible();
    expect(await page.evaluate(() => window.__images)).toBe(images);

    // Annuler : `leave` envoyé, retour à l'accueil
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(titre(page)).toBeVisible();
    await expect.poll(() => api.coupe.messages('leave').length).toBe(1);
  });

  test('rejoindre par code : match, réactions, but, fin avec les points, revanche', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    await page.goto('/coupe-test');

    const champ = page.getByLabel('Rejoindre un match');
    await expect(champ).toHaveAttribute('inputmode', 'numeric');
    // Chiffres seulement
    await champ.fill('4a8');
    await expect(champ).toHaveValue('48');
    await expect(boutonRejoindre(page)).toBeDisabled();
    await champ.fill(CODE_MATCH);
    await boutonRejoindre(page).click();

    // Match : diagnostic de l'écran d'essai, trois réactions
    await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
    await expect(page.getByText(/^Ping \d+ ms · recalages 0 · refusées 0$/)).toBeVisible();
    await expect(page.getByRole('group', { name: 'Réactions' }).getByRole('button')).toHaveCount(3);
    expect(api.coupe.messages('join')).toEqual([{ t: 'join', code: CODE_MATCH }]);

    // Position du joueur dans le repère du serveur (side 1 = moitié du haut), datée par `at`
    await expect.poll(() => api.coupe.messages('in').length).toBeGreaterThan(0);
    const [position] = api.coupe.messages('in');
    expect(position.y).toBeLessThan(320);
    expect(Number.isFinite(position.at)).toBe(true);

    // Réaction : une par seconde
    await page.getByRole('button', { name: 'Réagir : En feu' }).click();
    await expect.poll(() => api.coupe.messages('react')).toEqual([{ t: 'react', r: 1 }]);
    await expect(page.getByRole('button', { name: 'Réagir : Bravo' })).toBeDisabled();

    // But pour ce téléphone (side 1), puis fin : points personnels (contrat, section 7) de la saison
    // (+3, 42 → 45, 8e → 6e) ; `delta` reste par côté (l'adversaire perd 1 point)
    const cnx = api.coupe.derniere();
    api.coupe.etat(cnx, { ph: 'live' });
    cnx.envoyer({ t: 'goal', by: 1, sc: [0, 1] });
    await expect(page.getByText('Score : Toi 1 – 0 Kevin')).toBeAttached();
    cnx.envoyer({
      t: 'end', winner: 1, sc: [1, 3], forfeit: false, cancelled: false, reason: null,
      points: { ranked: true, reason: null, delta: [-1, 3], total: 45, rank: 6, rank_before: 8 },
    });
    await expect(page.getByRole('heading', { name: 'Victoire' })).toBeVisible();
    await expect(page.getByText('3 – 1', { exact: true })).toBeVisible();
    await expect(page.getByText('+3', { exact: true })).toBeVisible();
    await expect(page.getByLabel('42 points avant, 45 après')).toBeVisible();
    await expect(page.getByLabel('8e place avant le match, 6e après')).toBeVisible();
    await expect(page.getByText(/^Saison d(e |’)\S+$/)).toBeVisible();
    await expect(page.getByText('−1 point', { exact: true })).toBeVisible();
    // Maquette « Fin du match » : Revanche, puis « Partager en story » et « Retour » côte à côte
    await expect(page.getByRole('button', { name: 'Partager en story' })).toBeVisible();

    // Revanche demandée au serveur, puis retour
    await page.getByRole('button', { name: /^Revanche/ }).click();
    await expect.poll(() => api.coupe.messages('rematch').length).toBe(1);
    await expect(page.getByText('En attente de Kevin')).toBeVisible();
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(titre(page)).toBeVisible();
    await expect(page.getByText('Dernier match : Victoire 3 – 1 · +3 points (total 45).')).toBeVisible();
  });

  test('défi reçu : qui défie, compte à rebours, accepter sur la même connexion', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    await page.goto(`/coupe-test?defi=${LIEN_DEFI}`);

    await expect(page.getByRole('heading', { name: 'Lucas M. te défie' })).toBeVisible();
    await expect(page.getByRole('timer')).toHaveText(/^(2:00|1:5\d)$/);
    await expect(page.getByText('+3 points')).toBeVisible();
    expect(api.coupe.messages('peek')).toEqual([{ t: 'peek', link: LIEN_DEFI }]);
    expect(api.coupe.messages('join')).toEqual([]);

    await page.getByRole('button', { name: 'Accepter' }).click();
    await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
    expect(api.coupe.messages('join')).toEqual([{ t: 'join', link: LIEN_DEFI }]);
    expect(api.coupe.connexions).toHaveLength(1);
  });

  test('défi reçu : « Pas maintenant » prévient le défiant', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    await page.goto(`/coupe-test?defi=${LIEN_DEFI}`);

    await expect(page.getByRole('heading', { name: 'Lucas M. te défie' })).toBeVisible();
    await page.getByRole('button', { name: 'Pas maintenant', exact: true }).click();
    await expect(titre(page)).toBeVisible();
    await expect(page).toHaveURL(/\/coupe-test$/);
    await expect.poll(() => api.coupe.messages('decline')).toEqual([{ t: 'decline', link: LIEN_DEFI }]);
    expect(api.coupe.messages('join')).toEqual([]);
  });

  test('défi reçu : expiré au bout de 2 minutes, ou inconnu', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    await page.goto(`/coupe-test?defi=${LIEN_DEFI}`);
    await expect(page.getByRole('heading', { name: 'Lucas M. te défie' })).toBeVisible();
    await page.clock.fastForward(121_000);
    await expect(page.getByRole('alert')).toHaveText('Ce défi a expiré');
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(titre(page)).toBeVisible();

    await page.goto('/coupe-test?defi=zzzzzzzzzzzz');
    await expect(page.getByRole('alert')).toHaveText('Ce défi n\'existe plus : il a expiré ou quelqu\'un l\'a déjà pris');
    expect(api.coupe.messages('join')).toEqual([]);
  });

  test('défier un barber : attente de sa réponse, puis refus ; barber plus dispo', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    await page.goto('/coupe-test?challenge=emp-kevin');

    await expect(page.getByRole('heading', { name: 'Kevin' })).toBeVisible();
    await expect(page.getByText('En attente de Kevin')).toBeVisible();
    expect(api.coupe.messages('challenge')).toEqual([{ t: 'challenge', employee_id: 'emp-kevin' }]);
    api.coupe.derniere().envoyer({ t: 'declined', link: LIEN_MATCH });
    await expect(page.getByRole('alert')).toHaveText('Kevin ne peut pas jouer maintenant');
    await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(titre(page)).toBeVisible();

    api.coupe.barberIndispo = true;
    await page.goto('/coupe-test?challenge=emp-kevin');
    await expect(page.getByRole('alert')).toHaveText('Ce barber n\'est plus dispo pour un match');
  });

  test('fin du match : Signaler puis Bloquer l\'adversaire', async ({ page, api, connecter }) => {
    const cnx = await rejoindreParCode(page, api, connecter);
    cnx.envoyer({ t: 'end', winner: 0, sc: [3, 0], forfeit: false, cancelled: false, points: null });
    await expect(page.getByRole('heading', { name: 'Défaite' })).toBeVisible();
    // `points: null` : le serveur n'a pas confirmé les points à temps (ils arrivent ensuite)
    await expect(page.getByText('Points pas encore confirmés : regarde ton classement dans un instant.')).toBeVisible();

    // Signaler : motif obligatoire, précisions facultatives
    await page.getByRole('button', { name: 'Signaler', exact: true }).click();
    const signaler = page.getByRole('dialog', { name: 'Signaler Kevin' });
    await expect(signaler).toBeVisible();
    const envoyer = signaler.getByRole('button', { name: 'Envoyer le signalement' });
    await expect(envoyer).toBeDisabled();
    await signaler.getByRole('radio', { name: 'Triche' }).check();
    await signaler.getByLabel('Précisions (facultatif)').fill('Il marque à travers mon joueur');
    await envoyer.click();
    await expect(signaler.getByText('Merci : l\'équipe du salon va regarder.')).toBeVisible();
    expect(api.requetesVers('POST', '/coupe/report').map((r) => r.corps)).toEqual([{
      key_hash: CLE_KEVIN, room_code: CODE_MATCH, reason: 'cheating', details: 'Il marque à travers mon joueur',
    }]);
    await signaler.getByRole('button', { name: 'Fermer' }).last().click();
    await expect(signaler).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Signalé', exact: true })).toBeDisabled();

    // Bloquer, après confirmation : plus de revanche
    await page.getByRole('button', { name: 'Bloquer', exact: true }).click();
    const bloquer = page.getByRole('dialog', { name: 'Bloquer Kevin ?' });
    await expect(bloquer.getByText('Vous ne pourrez plus vous défier ni jouer ensemble à la Coupe du Gang.')).toBeVisible();
    await bloquer.getByRole('button', { name: 'Bloquer', exact: true }).click();
    await expect(bloquer).toHaveCount(0);
    expect(api.requetesVers('POST', '/coupe/block').map((r) => r.corps)).toEqual([{ key_hash: CLE_KEVIN }]);
    await expect(page.getByRole('button', { name: 'Bloqué', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Revanche/ })).toBeDisabled();
    await expect(page.getByText('Joueur bloqué')).toBeVisible();
  });

  test('coupure en plein match : reprise automatique avec le lien du match', async ({ page, api, connecter }) => {
    const cnx = await rejoindreParCode(page, api, connecter);
    api.coupe.etat(cnx, { ph: 'live', sc: [0, 1] });
    api.coupe.retenirReprise = true;
    api.coupe.couper(cnx);

    await expect(page.getByText('Connexion perdue')).toBeVisible();
    await expect(page.getByText('Reconnexion…')).toBeVisible();
    await expect.poll(() => api.coupe.messages('resume')[0]).toEqual({ t: 'resume', link: LIEN_MATCH });
    const reprise = api.coupe.derniere();
    expect(reprise).not.toBe(cnx);
    expect(reprise.messages[0]).toMatchObject({ t: 'auth', v: 2 });

    api.coupe.libererReprise();
    await expect(page.getByText('Connexion rétablie')).toBeVisible();
    // `start` de reprise : le match continue avec le score du serveur
    await expect(page.getByText('Score : Toi 1 – 0 Kevin')).toBeAttached();
    await expect(page.getByText('Reconnexion…')).toHaveCount(0);
    await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
    // Une coupure n'est pas un abandon
    expect(api.coupe.messages('leave')).toEqual([]);
  });

  test('adversaire déconnecté : pause affichée, puis le match reprend', async ({ page, api, connecter }) => {
    const cnx = await rejoindreParCode(page, api, connecter);
    api.coupe.etat(cnx, { ph: 'live' });
    cnx.envoyer({ t: 'pause', away: 0, left: 8 });
    await expect(page.getByText(/^Kevin s'est déconnecté : [5-8] s$/)).toBeVisible();
    api.coupe.etat(cnx, { ph: 'live' });
    await expect(page.getByText(/s'est déconnecté/)).toHaveCount(0);
  });

  test('abandon : confirmation, `leave` (forfait), écran de fin envoyé par le serveur, puis retour', async ({ page, api, connecter }) => {
    await rejoindreParCode(page, api, connecter);

    await page.getByRole('button', { name: 'Quitter le match' }).click();
    const confirmer = page.getByRole('dialog', { name: 'Abandonner le match ?' });
    await expect(confirmer.getByText(/^Abandonner compte comme une défaite/)).toBeVisible();
    await expect(confirmer).toContainText('Avant 20 s de jeu, le match est annulé.');
    await confirmer.getByRole('button', { name: 'Continuer', exact: true }).click();
    await expect(confirmer).toHaveCount(0);
    expect(api.coupe.messages('leave')).toEqual([]);

    await page.getByRole('button', { name: 'Quitter le match' }).click();
    await page.getByRole('dialog', { name: 'Abandonner le match ?' }).getByRole('button', { name: 'Abandonner' }).click();
    await expect.poll(() => api.coupe.messages('leave').length).toBe(1);
    // Le serveur envoie la fin du match (points compris) avant de détacher ce téléphone
    await expect(page.getByRole('heading', { name: 'Défaite' })).toBeVisible();
    await expect(page.getByText('Tu as abandonné : défaite par forfait.')).toBeVisible();
    await expect(page.getByLabel('42 points avant, 41 après')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Revanche/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Revanche/ })).toContainText('Tu as quitté le match');
    await expect(page.getByRole('button', { name: 'Partager en story' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(titre(page)).toBeVisible();
    await expect(page.getByText('Dernier match : abandon (défaite par forfait).')).toBeVisible();
    expect(api.coupe.messages('leave')).toHaveLength(1);
  });

  test('abandon sans fin du match du serveur : écran de fin fait par l\'app (annulé avant 20 s de jeu)', async ({ page, api, connecter }) => {
    api.coupe.finAbandon = null;
    const cnx = await rejoindreParCode(page, api, connecter);
    api.coupe.etat(cnx, { ph: 'live' });
    await page.getByRole('button', { name: 'Quitter le match' }).click();
    await page.getByRole('dialog', { name: 'Abandonner le match ?' }).getByRole('button', { name: 'Abandonner' }).click();
    await expect(page.getByText('Fin du match…')).toBeVisible();
    // Rien du serveur pendant 3,5 s : l'app conclut seule (quelques secondes de jeu seulement)
    await expect(page.getByRole('heading', { name: 'Match annulé' })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Moins de 20 s de jeu avant l’abandon : le match ne compte pas.')).toBeVisible();
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(page.getByText('Dernier match : abandon avant 20 s de jeu (annulé).')).toBeVisible();
  });

  test('reprise avec une vérification lente du jeton : rien du match avant `hello`, aucune socket refusée', async ({ page, api, connecter }) => {
    // 40 ms de lecture du compte : le banc du 29 oct. 2026 n'obtenait aucune reprise (fermetures 1008)
    api.coupe.delaiAuth = 40;
    const cnx = await rejoindreParCode(page, api, connecter);
    api.coupe.etat(cnx, { ph: 'live', sc: [0, 1] });
    await page.getByRole('button', { name: 'Réagir : Bravo' }).click();
    api.coupe.couper(cnx);
    await expect.poll(() => api.coupe.messages('resume').length).toBe(1);
    await expect(page.getByText('Connexion rétablie')).toBeVisible();
    expect(api.coupe.fermetures1008).toBe(0);
    // Sur la nouvelle connexion : `auth`, puis la reprise ; les positions seulement après le retour
    const reprise = api.coupe.derniere();
    await expect.poll(() => reprise.messages.filter((m) => m.t === 'in').length).toBeGreaterThan(0);
    const types = reprise.messages.map((m) => m.t);
    expect(types[0]).toBe('auth');
    expect(types.indexOf('resume')).toBeGreaterThan(0);
    expect(types.indexOf('in')).toBeGreaterThan(types.indexOf('resume'));
  });

  test('frappe refusée par le serveur (`acc` en retard sur `ack`) : comptée, le ballon du serveur repris', async ({ page, api, connecter }) => {
    api.coupe.refuserFrappes = true;
    const cnx = await rejoindreParCode(page, api, connecter);
    // Ballon lancé droit sur ce joueur (côté 1 : en haut chez le serveur, en bas sur ce téléphone)
    api.coupe.etat(cnx, { ph: 'live', b: [180, 160, 0, -500] });
    await expect.poll(() => api.coupe.messages('hit').length).toBeGreaterThan(0);
    await expect(page.getByText(/^Ping (\d+|…) ms · recalages \d+ · refusées [1-9]\d*$/)).toBeVisible();
    api.coupe.etat(cnx, { ph: 'live', b: [180, 320, 0, 0] });
  });

  test('accès refusé par le serveur de jeu : message, sans « Réessayer »', async ({ page, api, connecter }) => {
    api.coupe.refuser = true;
    await connecter(ADMIN);
    await page.goto('/coupe-test');
    await boutonCreer(page).click();

    await expect(page.getByRole('alert')).toHaveText('Le jeu en ligne n\'est pas ouvert à ton compte');
    await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(titre(page)).toBeVisible();
  });

  test('serveur de jeu injoignable : message et « Réessayer »', async ({ page, api, connecter }) => {
    api.coupe.injoignable = true;
    await connecter(ADMIN);
    await page.goto('/coupe-test');
    await boutonCreer(page).click();

    await expect(page.getByRole('alert')).toHaveText('Connexion impossible au serveur de jeu');
    api.coupe.injoignable = false;
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByText(CODE_MATCH, { exact: true })).toBeVisible();
  });
});

test.describe('La Coupe du Gang : fins de match et refus du serveur', () => {
  test('temps de jeu : bandeau « 30 s », puis match nul au temps écoulé', async ({ page, api, connecter }) => {
    const cnx = await rejoindreParCode(page, api, connecter);
    api.coupe.etat(cnx, { ph: 'live', sc: [1, 1] });
    cnx.envoyer({ t: 'time_left', s: 30 });
    await expect(page.getByText(/^(30|29|28) s$/)).toBeVisible();

    cnx.envoyer({
      t: 'end', winner: null, sc: [1, 1], forfeit: false, cancelled: false, reason: 'time_limit_draw',
      points: { ranked: false, reason: 'time_limit_draw', delta: [0, 0], total: 42, rank: 8, rank_before: 8 },
    });
    await expect(page.getByRole('heading', { name: 'Match nul' })).toBeVisible();
    await expect(page.getByText('Temps écoulé : 5 minutes de jeu sans vainqueur.')).toBeVisible();
    await expect(page.getByText('Match nul : pas de points.')).toBeVisible();
    await expect(page.getByText(/^\d+ s$/)).toHaveCount(0);
  });

  test('temps écoulé avec un meneur : « Victoire au temps », points comptés', async ({ page, api, connecter }) => {
    const cnx = await rejoindreParCode(page, api, connecter);
    api.coupe.etat(cnx, { ph: 'live', sc: [1, 2] });
    cnx.envoyer({ ...FIN_VICTOIRE, sc: [1, 2], reason: 'time_limit' });
    await expect(page.getByRole('heading', { name: 'Victoire au temps' })).toBeVisible();
    await expect(page.getByText('Temps écoulé : 5 minutes de jeu, celui qui mène gagne.')).toBeVisible();
    await expect(page.getByLabel('42 points avant, 45 après')).toBeVisible();
  });

  test('match trop court : amical, et l\'astuce du début ne reste pas sur l\'écran de fin', async ({ page, api, connecter }) => {
    const cnx = await rejoindreParCode(page, api, connecter);
    await expect(page.getByText('Ton joueur suit ton doigt, juste au-dessus')).toBeVisible();
    cnx.envoyer({
      t: 'end', winner: 1, sc: [0, 3], forfeit: false, cancelled: false, reason: 'too_short',
      points: { ranked: false, reason: 'too_short', delta: [0, 0], total: 42, rank: 8, rank_before: 8 },
    });
    await expect(page.getByRole('heading', { name: 'Victoire' })).toBeVisible();
    await expect(page.getByText('Match trop court pour compter des points (moins de 10 s de jeu)', { exact: true })).toBeVisible();
    await expect(page.getByText('Ton joueur suit ton doigt, juste au-dessus')).toHaveCount(0);
  });

  test('deux comptes du salon : ils ne peuvent pas s\'affronter (`salon_vs_salon`)', async ({ page, api, connecter }) => {
    api.coupe.refusJoin = 'salon_vs_salon';
    await connecter(ADMIN);
    await page.goto('/coupe-test');
    await page.getByLabel('Rejoindre un match').fill(CODE_MATCH);
    await boutonRejoindre(page).click();
    await expect(page.getByRole('alert')).toHaveText('Deux comptes du salon ne peuvent pas s’affronter : ils jouent tous les deux sous « D’Home Barber »');
    await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
  });

  test('revanche refusée : trop de matchs d\'affilée, puis l\'adversaire part', async ({ page, api, connecter }) => {
    const cnx = await rejoindreParCode(page, api, connecter);
    cnx.envoyer(FIN_VICTOIRE);
    const revanche = page.getByRole('button', { name: /^Revanche/ });
    await revanche.click();
    await expect.poll(() => api.coupe.messages('rematch').length).toBe(1);
    await expect(revanche).toContainText('En attente de Kevin');

    cnx.envoyer({ t: 'error', code: 'rate_limited' });
    await expect(revanche).toBeDisabled();
    await expect(revanche).toContainText('Trop de matchs d\'affilée : fais une pause');

    cnx.envoyer({ t: 'opp_left' });
    await expect(revanche).toContainText('Kevin est parti');
    await expect(revanche).toBeDisabled();
    // L'écran de fin reste (points, Retour)
    await expect(page.getByLabel('8e place avant le match, 6e après')).toBeVisible();
  });

  test('refus du serveur de jeu : déjà un match en cours, trop d\'essais, plus d\'activité', async ({ page, api, connecter }) => {
    api.coupe.refusCreation = 'already_playing';
    await connecter(ADMIN);
    await page.goto('/coupe-test');
    await boutonCreer(page).click();
    await expect(page.getByRole('alert')).toHaveText('Tu as déjà un match en cours');
    await page.getByRole('button', { name: 'Retour' }).click();

    api.coupe.refusCreation = 'rate_limited';
    await boutonCreer(page).click();
    await expect(page.getByRole('alert')).toHaveText('Trop d\'essais : attends quelques minutes avant de recommencer');
    await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Retour' }).click();

    // Écran « Défi reçu » laissé ouvert : le serveur ferme une socket sans salle (`idle`, 4408)
    await page.goto(`/coupe-test?defi=${LIEN_DEFI}`);
    await expect(page.getByRole('heading', { name: 'Lucas M. te défie' })).toBeVisible();
    const cnx = api.coupe.derniere();
    cnx.envoyer({ t: 'error', code: 'idle' });
    api.coupe.couper(cnx, 4408);
    await expect(page.getByRole('alert')).toHaveText('Plus d\'activité depuis 5 minutes');
  });

  test('Partager en story : image 1080 × 1920 du score, préparée dès l\'écran de fin', async ({ page, api, connecter }) => {
    await page.addInitScript(() => {
      window.__stories = [];
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (donnees) => { window.__stories.push(donnees); return Promise.resolve(); },
      });
    });
    const cnx = await rejoindreParCode(page, api, connecter);
    cnx.envoyer(FIN_VICTOIRE);
    await expect(page.getByRole('heading', { name: 'Victoire' })).toBeVisible();
    await page.getByRole('button', { name: 'Partager en story' }).click();
    await expect(toast(page, 'Score partagé')).toBeVisible();
    const image = await page.evaluate(async () => {
      const donnees = window.__stories[0];
      const fichier = donnees.files[0];
      const bmp = await createImageBitmap(fichier);
      return { titre: donnees.title, nom: fichier.name, type: fichier.type, largeur: bmp.width, hauteur: bmp.height };
    });
    expect(image).toEqual({ titre: 'La Coupe du Gang', nom: 'coupe-du-gang.jpg', type: 'image/jpeg', largeur: 1080, hauteur: 1920 });
  });

  test('Partager en story sans partage du navigateur : l\'image à enregistrer, dans une fenêtre', async ({ page, api, connecter }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    });
    const cnx = await rejoindreParCode(page, api, connecter);
    cnx.envoyer(FIN_VICTOIRE);
    await page.getByRole('button', { name: 'Partager en story' }).click();
    const fenetre = page.getByRole('dialog', { name: 'Ton score en image' });
    const image = fenetre.getByRole('img', { name: 'Score du match au format story' });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((img) => [img.naturalWidth, img.naturalHeight])).toEqual([1080, 1920]);
    await expect(fenetre.getByRole('link', { name: 'Télécharger l’image' })).toHaveAttribute('download', 'coupe-du-gang-dhomebarber.jpg');
    await fenetre.getByRole('button', { name: 'Fermer' }).click();
    await expect(fenetre).toHaveCount(0);
  });

  test('clavier ouvert dans « Signaler » : la fenêtre rétrécie n\'affiche pas « Tourne ton téléphone »', async ({ page, api, connecter }) => {
    const cnx = await rejoindreParCode(page, api, connecter);
    cnx.envoyer({ t: 'end', winner: 0, sc: [3, 0], forfeit: false, cancelled: false, points: null });
    await page.getByRole('button', { name: 'Signaler', exact: true }).click();
    const champ = page.getByLabel('Précisions (facultatif)');
    await champ.focus();
    // Clavier de l'iPad ouvert : la fenêtre passe en 375 × 360 (plus large que haute)
    await page.setViewportSize({ width: 375, height: 360 });
    await expect(champ).toBeFocused();
    await expect(page.getByText('Tourne ton téléphone')).toHaveCount(0);
    // Sans saisie, la même fenêtre est bien un téléphone tourné
    await champ.blur();
    await expect(page.getByText('Tourne ton téléphone')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('Tourne ton téléphone')).toHaveCount(0);
  });

  test('son du jeu débloqué au relâcher du doigt et au clic (WebKit), pas seulement au toucher', async ({ page, connecter }) => {
    await page.addInitScript(() => {
      window.__sons = { contextes: 0, reprises: 0 };
      // Comme WebKit sans geste : la relance est demandée mais le contexte reste suspendu
      class FauxContexteAudio {
        constructor() { window.__sons.contextes += 1; this.state = 'suspended'; }
        resume() { window.__sons.reprises += 1; return Promise.resolve(); }
        suspend() { return Promise.resolve(); }
        close() { return Promise.resolve(); }
      }
      window.AudioContext = FauxContexteAudio;
      window.webkitAudioContext = FauxContexteAudio;
    });
    await connecter(ADMIN);
    await page.goto('/coupe-test?mode=local');
    await expect(page.getByText('À deux sur ce téléphone', { exact: true })).toBeVisible();
    // Contexte partagé créé dès l'ouverture du jeu (relancé sans geste quand le navigateur le
    // permet), puis relancé à chaque geste
    await expect.poll(() => page.evaluate(() => window.__sons.contextes)).toBe(1);
    const r0 = await page.evaluate(() => window.__sons.reprises);
    await jeu(page).dispatchEvent('click');
    await expect.poll(() => page.evaluate(() => window.__sons.reprises)).toBeGreaterThan(r0);
    const r1 = await page.evaluate(() => window.__sons.reprises);
    await jeu(page).dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 7 });
    await expect.poll(() => page.evaluate(() => window.__sons.reprises)).toBeGreaterThan(r1);
    expect(await page.evaluate(() => window.__sons.contextes)).toBe(1);
  });
});

test.describe('La Coupe du Gang : départs, coupures et reprises', () => {
  test('retour du navigateur en plein match : pas d\'abandon, « Reprendre » dans les 10 s', async ({ page, api, connecter }) => {
    const cnx = await matchDepuisAccueil(page, api, connecter);
    await page.goBack();
    await expect(titreAccueil(page)).toBeVisible();
    // Socket fermée sans `leave` : le serveur met le match en pause, ce n'est pas un forfait
    await expect.poll(() => cnx.ferme).toBe(true);
    expect(api.coupe.messages('leave')).toEqual([]);

    const bandeau = page.getByRole('status').filter({ hasText: 'Match en pause' });
    await expect(bandeau).toContainText('Contre Kevin');
    await bandeau.getByRole('button', { name: 'Reprendre' }).click();
    await expect.poll(() => api.coupe.messages('resume')).toEqual([{ t: 'resume', link: LIEN_MATCH }]);
    await expect(page.getByText('Connexion rétablie')).toBeVisible();
    await expect(page.getByText('Score : Toi 1 – 0 Kevin')).toBeAttached();
    expect(api.coupe.messages('join')).toHaveLength(1);
    expect(api.coupe.messages('leave')).toEqual([]);
  });

  test('revenir après plus de 10 s : le match s\'est arrêté (forfait), sans nouveau match', async ({ page, api, connecter }) => {
    await matchDepuisAccueil(page, api, connecter);
    await page.goBack();
    await expect(titreAccueil(page)).toBeVisible();
    // Le serveur a prononcé le forfait (10 s sans retour)
    api.coupe.expirerAbsences();
    // Avancer dans l'historique rouvre le jeu : il tente la reprise, pas un nouveau `join`
    await page.goForward();
    await expect(page.getByRole('alert')).toHaveText('Le match s\'est arrêté pendant ton absence');
    await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
    expect(api.coupe.messages('resume')).toEqual([{ t: 'resume', link: LIEN_MATCH }]);
    expect(api.coupe.messages('join')).toHaveLength(1);
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(titreAccueil(page)).toBeVisible();
    await expect(page.getByText('Match en pause')).toHaveCount(0);
  });

  test('page cachée en plein match : connexion fermée exprès (pause), reprise au retour', async ({ page, api, connecter }) => {
    const cnx = await matchDepuisAccueil(page, api, connecter);
    await cacherPage(page, true);
    await expect.poll(() => cnx.ferme).toBe(true);
    expect(api.coupe.messages('leave')).toEqual([]);
    expect(api.coupe.connexions).toHaveLength(1);

    await cacherPage(page, false);
    await expect.poll(() => api.coupe.messages('resume')).toEqual([{ t: 'resume', link: LIEN_MATCH }]);
    await expect(page.getByText('Connexion rétablie')).toBeVisible();
    await expect(page.getByText('Score : Toi 1 – 0 Kevin')).toBeAttached();
  });

  test('connexion muette en plein match (plus aucun état) : l\'app la ferme et reprend le match', async ({ page, api, connecter }) => {
    const cnx = await matchDepuisAccueil(page, api, connecter);
    api.coupe.taire(cnx);
    await expect.poll(() => api.coupe.messages('resume'), { timeout: 8000 }).toEqual([{ t: 'resume', link: LIEN_MATCH }]);
    expect(cnx.ferme).toBe(true);
    await expect(page.getByText('Connexion rétablie')).toBeVisible();
    expect(api.coupe.messages('leave')).toEqual([]);
  });

  test('salle d\'attente coupée : la même salle est reprise (même code), puis le match en bas du terrain', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe');
    await page.getByRole('button', { name: /^Défier un ami/ }).click();
    await expect(page.getByText(CODE_MATCH, { exact: true })).toBeVisible();
    api.coupe.couper(api.coupe.derniere());

    await expect.poll(() => api.coupe.messages('resume')).toEqual([{ t: 'resume', link: LIEN_MATCH }]);
    await expect(page.getByText('En attente de l\'autre joueur')).toBeVisible();
    await expect(page.getByText(CODE_MATCH, { exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(api.coupe.messages('create')).toHaveLength(1);

    // L'ami arrive : ce téléphone a créé la salle, il joue le côté 0 (en bas, y > 320)
    api.coupe.rejoint();
    await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
    const reprise = api.coupe.derniere();
    await expect.poll(() => reprise.messages.filter((m) => m.t === 'in').length).toBeGreaterThan(0);
    expect(reprise.messages.find((m) => m.t === 'in').y).toBeGreaterThan(320);
  });

  test('salle d\'attente : lien partagé depuis une autre app, l\'ami arrive pendant ce temps, le match commence au retour', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe');
    await page.getByRole('button', { name: /^Défier un ami/ }).click();
    await expect(page.getByText(CODE_MATCH, { exact: true })).toBeVisible();
    const cnx = api.coupe.derniere();
    await cacherPage(page, true);
    await expect.poll(() => cnx.ferme).toBe(true);
    api.coupe.rejoint(cnx);

    await cacherPage(page, false);
    await expect.poll(() => api.coupe.messages('resume')).toEqual([{ t: 'resume', link: LIEN_MATCH }]);
    await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
    expect(api.coupe.messages('create')).toHaveLength(1);
    expect(api.coupe.messages('leave')).toEqual([]);
  });

  test('défi accepté pendant l\'absence de celui qui défie : « En attente de Lucas M. », puis le match', async ({ page, api, connecter }) => {
    api.coupe.createurAbsent = true;
    await connecter(CLIENT);
    await page.goto(`/coupe?defi=${LIEN_DEFI}`);
    await page.getByRole('button', { name: 'Accepter' }).click();
    await expect(page.getByRole('heading', { name: 'En attente de Lucas M.' })).toBeVisible();
    await expect(page.getByText('Le match commence à son retour')).toBeVisible();
    api.coupe.createurRevient();
    await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
  });

  test('invité qui perd sa connexion pendant l\'attente : il rejoint de nouveau par le lien (pas de `resume`)', async ({ page, api, connecter }) => {
    api.coupe.createurAbsent = true;
    await connecter(CLIENT);
    await page.goto(`/coupe?defi=${LIEN_DEFI}`);
    await page.getByRole('button', { name: 'Accepter' }).click();
    await expect(page.getByRole('heading', { name: 'En attente de Lucas M.' })).toBeVisible();

    // Le serveur retire l'invité dont la socket tombe : `resume` est réservé au créateur
    api.coupe.couper(api.coupe.derniere());
    await expect.poll(() => api.coupe.messages('join')).toEqual([
      { t: 'join', link: LIEN_DEFI },
      { t: 'join', link: LIEN_DEFI },
    ]);
    expect(api.coupe.messages('resume')).toEqual([]);
    await expect(page.getByRole('heading', { name: 'En attente de Lucas M.' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    api.coupe.createurRevient();
    await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
  });

  test('barber avec le jeu ouvert : un défi arrive sur sa salle d\'attente, « Pas maintenant » puis « Accepter »', async ({ page, api, connecter }) => {
    api.comptes.push({ ...KEVIN, motDePasse: MOT_DE_PASSE, birth_date: null, photo_url: null, created_date: '2026-01-15T10:00:00.000Z' });
    await connecter(KEVIN);
    await page.goto('/coupe');
    await page.getByRole('button', { name: /^Défier un ami/ }).click();
    await expect(page.getByText(CODE_MATCH, { exact: true })).toBeVisible();
    const cnx = api.coupe.derniere();
    const defi = { t: 'invite', link: LIEN_INVITE, from: { name: 'Lucas M.', role: 'user' }, expires_in: 120 };

    cnx.envoyer(defi);
    await expect(page.getByRole('heading', { name: 'Lucas M. te défie' })).toBeVisible();
    await expect(page.getByText(/Tu reçois les défis parce que tu es « Dispo pour un match »/)).toBeVisible();
    await page.getByRole('button', { name: 'Pas maintenant', exact: true }).click();
    await expect.poll(() => api.coupe.messages('decline')).toEqual([{ t: 'decline', link: LIEN_INVITE }]);
    await expect(page.getByText(CODE_MATCH, { exact: true })).toBeVisible();

    // Nouveau défi, accepté : sa salle d'attente est quittée, le match commence sur la même connexion
    cnx.envoyer(defi);
    await page.getByRole('button', { name: 'Accepter' }).click();
    await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
    expect(api.coupe.messages('join')).toEqual([{ t: 'join', link: LIEN_INVITE }]);
    expect(api.coupe.connexions).toHaveLength(1);
  });

  test('parcours complet : accueil → match → fin → retour à l\'accueil, points relus', async ({ page, api, connecter }) => {
    const cnx = await matchDepuisAccueil(page, api, connecter);
    const lectures = api.requetesVers('GET', '/coupe/me').length;
    // Le serveur compte le match : 42 → 45 points de saison
    api.coupeRest.etats[CLIENT.id].saison = [45, 17, 6];
    cnx.envoyer(FIN_VICTOIRE);
    await expect(page.getByRole('heading', { name: 'Victoire' })).toBeVisible();
    await expect(page.getByLabel('42 points avant, 45 après')).toBeVisible();
    await page.getByRole('button', { name: 'Retour' }).click();

    await expect(titreAccueil(page)).toBeVisible();
    await expect(blocPoints(page)).toContainText('45');
    expect(api.requetesVers('GET', '/coupe/me').length).toBeGreaterThan(lectures);
    // « Retour » à la fin du match : `leave` (plus de revanche), aucun match à reprendre
    expect(api.coupe.messages('leave')).toHaveLength(1);
    await expect(page.getByText('Match en pause')).toHaveCount(0);
  });

  test('musique du salon en pause pendant le jeu, reprise après', async ({ page, connecter }) => {
    await page.addInitScript(() => {
      // Lecture simulée (aucun son dans le navigateur des tests) ; musique autorisée pour ce test
      HTMLMediaElement.prototype.play = function play() { this.__joue = true; return Promise.resolve(); };
      HTMLMediaElement.prototype.pause = function pause() { this.__joue = false; };
      try { localStorage.removeItem('dhb-music-off'); } catch { /* stockage indisponible */ }
    });
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(titreAccueil(page)).toBeVisible();
    // Premier toucher : la musique du salon démarre (MusicContext)
    await titreAccueil(page).click();
    const musique = page.locator('[data-music-toggle]');
    await expect(musique).toHaveAttribute('aria-label', 'Couper la musique');

    await page.getByRole('button', { name: /^À deux sur ce téléphone/ }).click();
    await expect(page.getByText('À deux sur ce téléphone', { exact: true })).toBeVisible();
    await expect(musique).toHaveAttribute('aria-label', 'Activer la musique');

    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Quitter', exact: true }).click();
    await expect(titreAccueil(page)).toBeVisible();
    await expect(musique).toHaveAttribute('aria-label', 'Couper la musique');
    // Le jeu n'a jamais enregistré « musique coupée »
    expect(await page.evaluate(() => localStorage.getItem('dhb-music-off'))).toBeNull();
  });
});

test.describe('La Coupe du Gang à 1366 px', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test('écran de jeu : salle d\'attente, match et fin, sans défilement horizontal', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe');
    await page.getByRole('button', { name: /^Défier un ami/ }).click();
    await expect(page.getByText(CODE_MATCH, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Envoyer le défi' })).toBeVisible();
    await attendreSansDebordement(page, 'la salle d\'attente');

    api.coupe.rejoint();
    await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Réactions' })).toBeVisible();
    await attendreSansDebordement(page, 'le match');

    // Ce téléphone a créé la salle : il joue le côté 0
    api.coupe.derniere().envoyer({ ...FIN_VICTOIRE, winner: 0, sc: [3, 1], points: { ...FIN_VICTOIRE.points, delta: [3, -1] } });
    await expect(page.getByRole('heading', { name: 'Victoire' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Partager en story' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retour' })).toBeVisible();
    await attendreSansDebordement(page, 'la fin du match');
  });
});

// ─── Sans réseau ────────────────────────────────────────────────────

/** Une image de la boucle du jeu quand l'horloge du navigateur avance de 16 ms en 16 ms. */
const IMAGE_S = 16 / 1000;

/**
 * Partie contre le salon rejouée ici à l'identique (même moteur, même hasard figé, mêmes images de
 * 16 ms) : le joueur part de `depart`, attend `attente` images, puis vise `cible`. Rend l'image
 * du but s'il est pour toi, sinon -1.
 */
function simulerFrappe(depart, cible, attente, alea) {
  let marqueur = -1;
  const m = new LocalMatch({
    mode: 'bot',
    level: 'apprenti',
    rnd: () => alea,
    onEvent: (type, d) => { if (type === 'goal' && marqueur < 0) marqueur = d.scorer; },
  });
  m.start();
  m.setTarget(0, depart.x, depart.y);
  for (let i = 0; i < attente; i++) m.update(IMAGE_S);
  m.setTarget(0, cible.x, cible.y);
  for (let i = 1; i <= 150; i++) {
    m.update(IMAGE_S);
    if (marqueur >= 0) return marqueur === 0 ? i : -1;
  }
  return -1;
}

/** Cherche une frappe gagnante (points de l'écran entiers, comme la souris du test). */
function chercherFrappe(cadre, alea) {
  const vue = viewOf(cadre.width, cadre.height);
  const versEcran = (x, y) => ({
    px: Math.round(cadre.left + vue.ox + (x + MS) * vue.s),
    py: Math.round(cadre.top + vue.oy + (y + MG) * vue.s),
  });
  const versTerrain = (p) => screenToWorld(vue, cadre.left, cadre.top, p.px, p.py);
  // Le ballon attend devant toi (180 ; 435) ; le premier compte à rebours dure 282 images (4,5 s :
  // stade, zoom, puis 3, 2, 1, thème stade du 29 oct. 2026)
  for (let attente = 294; attente <= 364; attente += 1) {
    for (let angle = -60; angle <= 60; angle += 3) {
      for (const recul of [60, 80]) {
        const a = (angle * Math.PI) / 180;
        const dx = Math.sin(a);
        const dy = -Math.cos(a);
        const depart = versEcran(180 - dx * recul, 435.2 - dy * recul);
        const cible = versEcran(180 + dx * 60, Math.max(344, 435.2 + dy * 60));
        const images = simulerFrappe(versTerrain(depart), versTerrain(cible), attente, alea);
        if (images > 0) return { depart, cible, attente, images };
      }
    }
  }
  return null;
}

test.describe('La Coupe du Gang : sans réseau', () => {
  test('contre le salon : un but en déplaçant la souris', async ({ page, api, connecter }) => {
    // Hasard figé : le salon joue toujours pareil, et ce test rejoue la même partie de son côté
    const ALEA = 0.01;
    await page.addInitScript((a) => { Math.random = () => a; }, ALEA);
    await connecter(ADMIN);
    await page.goto('/coupe-test');
    await expect(titre(page)).toBeVisible();
    await page.getByRole('radio', { name: 'Apprenti' }).click();

    // Horloge arrêtée sur une image : la partie avance de 16 ms en 16 ms, comme la simulation
    const maintenant = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(maintenant + 1000);
    const tic = await page.evaluate(() => performance.now());
    if (tic % 16) await page.clock.runFor(16 - (tic % 16));
    await page.getByRole('button', { name: 'Jouer contre le salon' }).click();
    await expect(jeu(page)).toHaveAttribute('data-phase', 'count');
    // Horloge arrêtée au début de l'avant-match : barre du haut posée, encore cachée (stade entier)
    await expect(page.getByText('Contre le salon · Apprenti')).toBeAttached();
    expect(api.coupe.connexions).toEqual([]);

    const plan = chercherFrappe(await cadreDuTerrain(page), ALEA);
    expect(plan, 'la simulation n\'a trouvé aucune frappe gagnante').not.toBeNull();
    // Souris survolant le terrain, sans clic : le joueur la suit. Événement envoyé directement au
    // terrain, pour qu'il soit traité avant l'image suivante (horloge arrêtée)
    const souris = (p) => terrain(page).dispatchEvent('pointermove', {
      pointerType: 'mouse', pointerId: 1, isPrimary: true, clientX: p.px, clientY: p.py, bubbles: true,
    });
    await souris(plan.depart);
    await page.clock.runFor(16 * plan.attente);
    await expect(jeu(page)).toHaveAttribute('data-phase', 'live');
    await souris(plan.cible);
    await page.clock.runFor(16 * (plan.images + 4));
    await expect(page.getByText('Score : Toi 1 – 0 Apprenti')).toBeAttached();
    await expect(jeu(page)).toHaveAttribute('data-phase', 'goal');
  });

  test('à deux sur ce téléphone : chacun sa moitié, le joueur du haut marque', async ({ page, api, connecter }) => {
    // Hasard figé au-dessus de 0,5 : le premier ballon est pour le joueur du haut
    await page.addInitScript(() => { Math.random = () => 0.75; });
    await connecter(ADMIN);
    await page.goto('/coupe-test');
    await page.getByRole('button', { name: /^À deux sur ce téléphone/ }).click();
    await expect(page.getByText('À deux sur ce téléphone', { exact: true })).toBeVisible();
    await expect(page.getByText('Chacun pose le doigt dans sa moitié')).toBeVisible();
    expect(api.coupe.connexions).toEqual([]);

    // Deux doigts (le joueur se place 34 unités devant le doigt, vers le milieu du terrain)
    const cadre = await cadreDuTerrain(page);
    const vue = viewOf(cadre.width, cadre.height);
    const ecran = (x, y) => ({ clientX: cadre.left + vue.ox + (x + MS) * vue.s, clientY: cadre.top + vue.oy + (y + MG) * vue.s });
    const doigt = (type, pointerId, p) => terrain(page).dispatchEvent(type, {
      pointerId, pointerType: 'touch', isPrimary: pointerId === 1, bubbles: true, cancelable: true, ...p,
    });
    await doigt('pointerdown', 1, ecran(30, 600 + 34)); // joueur du bas : tout à gauche, loin du ballon
    await doigt('pointerdown', 2, ecran(180, 150 - 34)); // joueur du haut : au-dessus du ballon
    await expect(jeu(page)).toHaveAttribute('data-phase', 'live', { timeout: 6000 });
    await doigt('pointermove', 2, ecran(180, 300 - 34)); // le joueur du haut fonce vers le bas
    await expect(page.getByText('Score : Joueur du bas 0 – 1 Joueur du haut')).toBeAttached();
    await doigt('pointerup', 2, ecran(180, 300 - 34));
    await doigt('pointerup', 1, ecran(30, 600 + 34));
  });

  test('téléphone en paysage : « Tourne ton téléphone », puis pause et reprise', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    await page.goto('/coupe-test?mode=bot&level=boss');
    await expect(page.getByText('Contre le salon · Boss')).toBeVisible();

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByText('Tourne ton téléphone')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('Tourne ton téléphone')).toHaveCount(0);

    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Pause' })).toBeVisible();
    await page.getByRole('button', { name: 'Reprendre', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Pause' })).toHaveCount(0);
    expect(api.coupe.connexions).toEqual([]);
  });
});

// Thème stade (29 oct. 2026, docs/fonctions/coupe-du-gang-stade.md) : la caméra se lit sur la racine
// du jeu (`data-cam` full / pitch, `data-play` quand joueurs, barre du haut et réactions sont là).
// Les états sont notés au fil de l'eau : l'avant-match ne dure qu'une seconde en mouvement réduit.
async function noterCamera(page) {
  await page.addInitScript(() => {
    window.__camera = [];
    const noter = (v) => { if (window.__camera[window.__camera.length - 1] !== v) window.__camera.push(v); };
    new MutationObserver(() => {
      const r = document.querySelector('.cdg-root');
      if (!r) return;
      const affiche = [...r.querySelectorAll('*')].some((e) => e.childElementCount === 0 && e.textContent === 'VS');
      noter(`${r.dataset.cam || '-'}${r.dataset.play ? '+jeu' : ''}${affiche ? '+affiche' : ''}`);
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-cam', 'data-play'] });
  });
}

// Photos des clients (29 oct. 2026) : pions de l'affiche VS notés au fil de l'eau (l'affiche ne
// dure qu'une seconde en mouvement réduit) ; `[{ photo, texte }]` par pion
async function noterAffiche(page) {
  await page.addInitScript(() => {
    window.__affiche = [];
    new MutationObserver(() => {
      for (const pion of document.querySelectorAll('.cdg-vs .cdg-pawn-in')) {
        const note = { photo: pion.querySelector('img')?.getAttribute('src') || null, texte: pion.textContent };
        if (!window.__affiche.some((n) => n.photo === note.photo && n.texte === note.texte)) window.__affiche.push(note);
      }
    }).observe(document, { subtree: true, childList: true });
  });
}

/** Couleur du terrain dessiné au point (x, y) du terrain (repère de l'écran, unités du moteur). */
async function couleurDuTerrain(page, x, y) {
  const cadre = await cadreDuTerrain(page);
  const vue = viewOf(cadre.width, cadre.height);
  const px = vue.ox + (x + MS) * vue.s;
  const py = vue.oy + (y + MG) * vue.s;
  return terrain(page).evaluate((c, [ex, ey]) => {
    const k = c.width / c.getBoundingClientRect().width;
    return [...c.getContext('2d').getImageData(Math.round(ex * k), Math.round(ey * k), 1, 1).data];
  }, [px, py]);
}
const saturation = ([r, g, b]) => { const mx = Math.max(r, g, b); return mx ? (mx - Math.min(r, g, b)) / mx : 0; };
// Pion de l'adversaire en haut (180 ; 100) : point sous ses initiales, dans le disque de la photo
const SOUS_PION_ADVERSE = [180, 112];

test.describe('La Coupe du Gang : photos des clients', () => {
  test('photo de l\'adversaire client : sur l\'affiche VS et dans son pion sur le terrain', async ({ page, api, connecter }) => {
    api.coupe.photoAdversaire = media(7);
    api.coupe.avantMatchCd = 4.5;
    await noterAffiche(page);
    await connecter(ADMIN);
    await page.goto(`/coupe-test?defi=${LIEN_DEFI}`);
    await page.getByRole('button', { name: 'Accepter' }).click();
    await expect(jeu(page)).toHaveAttribute('data-play', '1');
    // Affiche : le salon (« DHB », jamais de photo) contre Lucas M. en photo
    expect(await page.evaluate(() => window.__affiche)).toEqual([{ photo: null, texte: 'DHB' }, { photo: media(7), texte: '' }]);
    // Terrain : le pion de Lucas M. porte la photo (couleurs vives), plus la pastille grise
    await expect.poll(async () => saturation(await couleurDuTerrain(page, ...SOUS_PION_ADVERSE))).toBeGreaterThan(0.3);
  });

  test('serveur d\'avant les photos (pas de `photos` dans `start`) : initiales, rien ne casse', async ({ page, api, connecter }) => {
    api.coupe.sansPhotos = true;
    api.coupe.photoAdversaire = media(7);
    api.coupe.avantMatchCd = 4.5;
    await noterAffiche(page);
    await connecter(ADMIN);
    await page.goto(`/coupe-test?defi=${LIEN_DEFI}`);
    await page.getByRole('button', { name: 'Accepter' }).click();
    await expect(jeu(page)).toHaveAttribute('data-play', '1');
    expect(await page.evaluate(() => window.__affiche)).toEqual([{ photo: null, texte: 'DHB' }, { photo: null, texte: 'LM' }]);
    expect(saturation(await couleurDuTerrain(page, ...SOUS_PION_ADVERSE))).toBeLessThan(0.2);
  });

  test('barber : jamais de photo ronde, même si le serveur en envoyait une (initiale et ciseaux)', async ({ page, api, connecter }) => {
    api.coupe.photoAdversaire = media(8);
    api.coupe.avantMatchCd = 4.5;
    await noterAffiche(page);
    await rejoindreParCode(page, api, connecter);
    await expect(jeu(page)).toHaveAttribute('data-play', '1');
    expect(await page.evaluate(() => window.__affiche)).toEqual([{ photo: null, texte: 'DHB' }, { photo: null, texte: 'K' }]);
    // Le temps que l'image se serait chargée : toujours la pastille grise
    await page.waitForTimeout(500);
    expect(saturation(await couleurDuTerrain(page, ...SOUS_PION_ADVERSE))).toBeLessThan(0.2);
  });
});

// Musique de tribune : lectures demandées par l'app (`HTMLMediaElement.play`), notées dans la page ;
// `window.__musique` = le lecteur de la musique du jeu
async function noterLectures(page) {
  await page.addInitScript(() => {
    window.__lectures = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function lecture() {
      const src = this.currentSrc || this.src || '';
      window.__lectures.push(src);
      if (/tribune/.test(src)) window.__musique = this;
      return play.call(this);
    };
  });
}

test.describe('La Coupe du Gang : défi à un ami en image', () => {
  test('« Envoyer le défi » : image 1080 × 1350 (nom, code) partagée avec le lien dans le texte', async ({ page, connecter }) => {
    await page.addInitScript(() => {
      window.__partages = [];
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d) => !!d && Array.isArray(d.files) });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (donnees) => { window.__partages.push(donnees); return Promise.resolve(); },
      });
    });
    await connecter(CLIENT);
    await page.goto('/coupe');
    await page.getByRole('button', { name: /^Défier un ami/ }).click();
    await expect(page.getByText(CODE_MATCH, { exact: true })).toBeVisible();
    // Image préparée dès l'ouverture de la salle (300 ms, puis le dessin)
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Envoyer le défi' }).click();
    await expect.poll(() => page.evaluate(() => window.__partages.length)).toBe(1);
    const partage = await page.evaluate(async () => {
      const d = window.__partages[0];
      const f = d.files[0];
      const bmp = await createImageBitmap(f);
      return { titre: d.title, texte: d.text, url: d.url ?? null, nom: f.name, type: f.type, largeur: bmp.width, hauteur: bmp.height };
    });
    expect(partage).toEqual({
      titre: 'La Coupe du Gang',
      texte: `Je te défie à la Coupe du Gang ! Code du match : ${CODE_MATCH}\nhttps://dhomebarber.fr/coupe?defi=${LIEN_MATCH}`,
      url: null,
      nom: 'defi-coupe-du-gang.jpg',
      type: 'image/jpeg',
      largeur: 1080,
      hauteur: 1350,
    });
    if (process.env.CAPTURE_DEFI) {
      const octets = await page.evaluate(async () => Array.from(new Uint8Array(await window.__partages[0].files[0].arrayBuffer())));
      (await import('node:fs')).writeFileSync(process.env.CAPTURE_DEFI, Buffer.from(octets));
    }
  });

  test('appareil qui ne partage pas d\'image : le lien part seul, comme avant', async ({ page, connecter }) => {
    await page.addInitScript(() => {
      window.__partages = [];
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (donnees) => { window.__partages.push(donnees); return Promise.resolve(); },
      });
    });
    await connecter(CLIENT);
    await page.goto('/coupe');
    await page.getByRole('button', { name: /^Défier un ami/ }).click();
    await expect(page.getByText(CODE_MATCH, { exact: true })).toBeVisible();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Envoyer le défi' }).click();
    await expect.poll(() => page.evaluate(() => window.__partages)).toEqual([{
      title: 'La Coupe du Gang',
      text: `Je te défie à la Coupe du Gang ! Code du match : ${CODE_MATCH}`,
      url: `https://dhomebarber.fr/coupe?defi=${LIEN_MATCH}`,
    }]);
  });
});

test.describe('La Coupe du Gang : musique de tribune', () => {
  test('lancée au coup d\'envoi, arrêtée avec le son du jeu, relancée avec lui', async ({ page, api, connecter }) => {
    await noterLectures(page);
    const cnx = await rejoindreParCode(page, api, connecter);
    api.coupe.etat(cnx, { ph: 'live' });
    await expect.poll(() => page.evaluate(() => !!window.__musique && !window.__musique.paused)).toBe(true);
    expect(await page.evaluate(() => window.__musique.loop)).toBe(true);
    await page.getByRole('button', { name: 'Couper le son' }).click();
    await expect.poll(() => page.evaluate(() => window.__musique.paused)).toBe(true);
    await page.getByRole('button', { name: 'Activer le son' }).click();
    await expect.poll(() => page.evaluate(() => window.__musique.paused)).toBe(false);
  });

  test('bruitages et musique ensemble dès le coup d\'envoi, sans toucher l\'écran de jeu (un seul clic : « Rejoindre »)', async ({ page, api, connecter }) => {
    await noterLectures(page);
    // Contextes audio créés par la page (bruitages)
    await page.addInitScript(() => {
      window.__contextes = [];
      const Ctx = window.AudioContext;
      window.AudioContext = class extends Ctx {
        constructor(...args) {
          super(...args);
          window.__contextes.push(this);
        }
      };
    });
    await rejoindreParCode(page, api, connecter);
    await expect.poll(() => page.evaluate(() => window.__contextes.some((c) => c.state === 'running'))).toBe(true);
    await expect.poll(() => page.evaluate(() => !!window.__musique && !window.__musique.paused)).toBe(true);
    // Un seul contexte pour toute la session (partagé par les écrans de jeu)
    expect(await page.evaluate(() => window.__contextes.length)).toBe(1);
  });

  test('coupée par le serveur (COUPE_MUSIC=off) : jamais lancée, le jeu marche', async ({ page, api, connecter }) => {
    api.donnees.parametresPublics.features.coupeMusic = false;
    await noterLectures(page);
    const cnx = await rejoindreParCode(page, api, connecter);
    api.coupe.etat(cnx, { ph: 'live' });
    await expect(jeu(page)).toHaveAttribute('data-play', '1');
    await page.getByRole('button', { name: 'Réagir : En feu' }).click();
    await expect.poll(() => api.coupe.messages('react')).toEqual([{ t: 'react', r: 1 }]);
    expect(await page.evaluate(() => window.__lectures.filter((s) => /tribune/.test(s)))).toEqual([]);
  });
});

test.describe('La Coupe du Gang : thème stade', () => {
  test('avant-match (premier coup d\'envoi en 4,5 s) : stade entier et affiche, puis le terrain avec la barre du haut et les réactions ; le stade revient à la fin', async ({ page, api, connecter }) => {
    await noterCamera(page);
    api.coupe.avantMatchCd = 4.5;
    const cnx = await rejoindreParCode(page, api, connecter);
    // Caméra posée sur le terrain, puis joueurs, ballon, barre du haut et réactions (1 s en mouvement réduit)
    await expect(jeu(page)).toHaveAttribute('data-cam', 'pitch');
    await expect(jeu(page)).toHaveAttribute('data-play', '1');
    const avant = await page.evaluate(() => window.__camera);
    // Le stade entier avec l'affiche des deux joueurs, et rien du jeu, avant le terrain
    const iAffiche = avant.findIndex((v) => v.startsWith('full') && v.includes('+affiche') && !v.includes('+jeu'));
    const iTerrain = avant.findIndex((v) => v.startsWith('pitch+jeu'));
    expect(iAffiche, JSON.stringify(avant)).toBeGreaterThanOrEqual(0);
    expect(iTerrain, JSON.stringify(avant)).toBeGreaterThan(iAffiche);
    // Un seul terrain : celui de l'image du stade, sous le canvas
    await expect(page.locator('.cdg-camera img')).toBeVisible();
    await page.getByRole('button', { name: 'Réagir : En feu' }).click();
    await expect.poll(() => api.coupe.messages('react')).toEqual([{ t: 'react', r: 1 }]);

    // Fin du match : le stade entier revient derrière l'écran de fin, sans le jeu
    api.coupe.etat(cnx, { ph: 'live' });
    cnx.envoyer(FIN_VICTOIRE);
    await expect(page.getByRole('heading', { name: 'Victoire' })).toBeVisible();
    await expect(jeu(page)).toHaveAttribute('data-cam', 'full');
    await expect(jeu(page)).not.toHaveAttribute('data-end', 'defaite');
  });

  test('défaite : le stade passe en gris derrière l\'écran de fin', async ({ page, api, connecter }) => {
    const cnx = await rejoindreParCode(page, api, connecter);
    api.coupe.etat(cnx, { ph: 'live' });
    cnx.envoyer({ ...FIN_VICTOIRE, winner: 0, sc: [3, 1], points: { ranked: true, reason: null, delta: [3, -1], total: 41, rank: 9, rank_before: 8 } });
    await expect(page.getByRole('heading', { name: 'Défaite' })).toBeVisible();
    await expect(jeu(page)).toHaveAttribute('data-end', 'defaite');
    await expect(jeu(page)).toHaveAttribute('data-cam', 'full');
  });

  test('retour de l\'adversaire en plein match (compte à rebours de 3 s) : ni stade entier ni affiche, le jeu reste affiché', async ({ page, api, connecter }) => {
    await noterCamera(page);
    api.coupe.avantMatchCd = 4.5;
    const cnx = await rejoindreParCode(page, api, connecter);
    await expect(jeu(page)).toHaveAttribute('data-play', '1');
    api.coupe.etat(cnx, { ph: 'live' });
    await page.evaluate(() => { window.__camera = []; });
    api.coupe.etat(cnx, { ph: 'pause' });
    cnx.envoyer({ t: 'pause', away: 0, left: 8 });
    await expect(page.getByText(/^Kevin s'est déconnecté : [5-8] s$/)).toBeVisible();
    // Kevin revient : nouveau compte à rebours (3 s, temps qui avance), puis le jeu
    api.coupe.etat(cnx, { ph: 'count' });
    await page.waitForTimeout(1500);
    api.coupe.etat(cnx, { ph: 'live' });
    await expect(page.getByText(/s'est déconnecté/)).toHaveCount(0);
    const trace = await page.evaluate(() => window.__camera);
    expect(trace.filter((v) => v !== 'pitch+jeu'), JSON.stringify(trace)).toEqual([]);
    await expect(jeu(page)).toHaveAttribute('data-cam', 'pitch');
    await expect(jeu(page)).toHaveAttribute('data-play', '1');
  });

  test('match repris depuis l\'accueil : sur le terrain et la barre du haut à portée pendant que le serveur répond', async ({ page, api, connecter }) => {
    await matchDepuisAccueil(page, api, connecter);
    await page.goBack();
    await expect(titreAccueil(page)).toBeVisible();
    api.coupe.retenirReprise = true;
    await page.getByRole('status').filter({ hasText: 'Match en pause' }).getByRole('button', { name: 'Reprendre' }).click();
    await expect.poll(() => api.coupe.reprisesEnAttente.length).toBe(1);
    await expect(jeu(page)).toHaveAttribute('data-cam', 'pitch');
    await expect(jeu(page)).toHaveAttribute('data-play', '1');
    await expect(jeu(page).locator('.cdg-hud')).toBeVisible();
    api.coupe.libererReprise();
    await expect(page.getByText('Connexion rétablie')).toBeVisible();
    await expect(jeu(page)).toHaveAttribute('data-cam', 'pitch');
    await expect(page.getByText('Score : Toi 1 – 0 Kevin')).toBeAttached();
  });

  test('fin du match : le terrain ne bouge pas avant l\'écran de fin (réactions gardées jusque-là)', async ({ page, api, connecter }) => {
    const cnx = await rejoindreParCode(page, api, connecter);
    api.coupe.etat(cnx, { ph: 'live' });
    await expect(jeu(page)).toHaveAttribute('data-play', '1');
    // Hauteurs du terrain tant que l'écran de fin n'est pas ouvert
    await page.evaluate(() => {
      const stage = document.querySelector('.cdg-stage');
      window.__terrain = [Math.round(stage.getBoundingClientRect().height)];
      new ResizeObserver(() => {
        if (!document.querySelector('.cdg-end')) window.__terrain.push(Math.round(stage.getBoundingClientRect().height));
      }).observe(stage);
    });
    cnx.envoyer(FIN_VICTOIRE);
    await expect(page.getByRole('heading', { name: 'Victoire' })).toBeVisible();
    const hauteurs = await page.evaluate(() => window.__terrain);
    expect(new Set(hauteurs).size, JSON.stringify(hauteurs)).toBe(1);
  });

  test('sans durée annoncée (serveur d\'avant le thème stade) : pas d\'avant-match, le terrain tout de suite', async ({ page, api, connecter }) => {
    await noterCamera(page);
    await rejoindreParCode(page, api, connecter);
    await expect(jeu(page)).toHaveAttribute('data-play', '1');
    await expect(jeu(page)).toHaveAttribute('data-cam', 'pitch');
    const trace = await page.evaluate(() => window.__camera);
    expect(trace.some((v) => v.includes('+affiche')), JSON.stringify(trace)).toBe(false);
  });
});
