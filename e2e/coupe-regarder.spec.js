// La Coupe du Gang : regarder un match sans jouer (docs/fonctions/coupe-spectateurs-contrat.md,
// sections 1 et 4.1 ; planche validée, écran 13). Page `/coupe/regarder?m=<match de tournoi>&tournoi=…`
// ou `?w=<match ordinaire>`, avec le faux serveur de jeu (e2e/support/fauxCoupe.js, socket
// spectateur) : `auth {watch: true}` puis `watch`, en-tête (« Tu regardes · Quart 1 », nom du
// tournoi, spectateurs), bande des scores aux initiales, terrain, bandeaux à la troisième personne
// et à l'heure retardée, « Ensuite : … », réactions (une toutes les 3 s, bulles), pause, fin,
// refus (`no_match` sans sondage, `watch_full`, `disabled`), `not_live` réessayé puis départ,
// drapeau `features.coupeSpectators` faux, coupure du réseau (3 essais puis « Réessayer »),
// 320 px sans défilement horizontal, aucune photo (même si le serveur en envoyait).
// Décisions du chef après la contre-expertise (contrat, section 6) : A1 (4401 seul ≠ écran coupé),
// A2 (socket fermée après la fin ou un refus), A3 (4429 et 4409 : 30 s), A4 (échelle de l'écran),
// A5 (noms et score gardés, repli de l'écran), A6 (tableau lu pendant l'attente, fin pendant
// l'absence), A7 (« Quart 1 · Premier à 5 »), A8 (bouton Son), A12 (bulles espacées), `tl` et `away`.
import { test, expect } from './support/test.js';
import { CLIENT } from './support/donnees.js';
import {
  DIRECT_MATCH, DIRECT_TOURNOI, ID_DIRECT, ID_MATCH_TOURNOI, ID_TOURNOI, PHOTO_LUCAS,
} from './support/fauxCoupe.js';
import { CLE_ECRAN, SALLE_ECRAN } from './support/fauxEcran.js';
import { attendreSansDebordement } from './support/outils.js';

const ADRESSE_TOURNOI = `/coupe/regarder?m=${ID_MATCH_TOURNOI}&tournoi=${ID_TOURNOI}`;
const ADRESSE_MATCH = `/coupe/regarder?w=${ID_DIRECT}`;
const bande = (page) => page.getByRole('group', { name: 'Score du match' });
const terrain = (page) => page.getByRole('img', { name: /^Le match en direct, vu d’en haut/ });
const reaction = (page, nom) => page.getByRole('group', { name: 'Réactions' }).getByRole('button', { name: nom, exact: true });
const bulle = (page, texte) => page.locator('.cdgw-bubble', { hasText: texte });
const ligne = (page) => bande(page).locator('.cdgw-line');
const pastillePerdue = (page) => page.locator('.cdgw-chip[data-lost]');

/** Page cachée (autre app, écran verrouillé) ou revenue : `visibilitychange` comme le navigateur. */
async function cacherPage(page, cachee) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, cachee);
}

/** Bandeaux notés à leur apparition (ils ne durent que ~1,4 s), comme e2e/coupe-regles-v2.spec.js. */
async function noterBandeaux(page) {
  await page.addInitScript(() => {
    window.__bandeaux = [];
    const notes = new WeakMap();
    new MutationObserver(() => {
      for (const b of document.querySelectorAll('.cdg-banner')) {
        let n = notes.get(b);
        if (!n) {
          n = { sorte: b.dataset.kind, textes: [] };
          notes.set(b, n);
          window.__bandeaux.push(n);
        }
        n.textes = [...b.children].map((c) => c.textContent);
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}
const attendreBandeau = (page, textes) => expect.poll(() => page.evaluate(() => window.__bandeaux))
  .toContainEqual(expect.objectContaining({ textes }));

/**
 * Tableau du tournoi (contrat des tournois, 3.4) : le quart regardé en cours, puis Kevin – Yanis K.
 * prêt dans 3 min (« Ensuite : … »). `quart` : champs du quart regardé (changeables ensuite : l'objet
 * rendu est relu à chaque lecture).
 */
function tableau(api, quart = { live: { playing: true, sc: [0, 0] } }) {
  const iso = (ms) => new Date(Date.now() + ms).toISOString();
  const match = (id, slot, p, extra) => ({
    id, round: 1, slot, p, status: 'ready', ready_at: iso(-60_000), forfeit_at: null, sc: null, so: null,
    winner: null, reason: null, live: null, ...extra,
  });
  api.surcharger('GET', `/coupe/tournaments/${ID_TOURNOI}`, () => ({
    json: {
      id: ID_TOURNOI, name: 'Coupe de Novembre', starts_at: iso(-600_000), size: 8, status: 'running',
      cancel_reason: null, drawn_at: iso(-500_000), finished_at: null, server_now: iso(0), checkin_from: iso(-1_500_000),
      players: [], me: { registered: false, waiting: false, checked_in: false, status: null, match: null },
      rounds: [{
        round: 1,
        label: 'Quarts de finale',
        matches: [
          match(ID_MATCH_TOURNOI, 0, [{ name: 'Lucas M.', role: 'user' }, { name: 'Dom', role: 'barber' }], quart),
          match('m-quart-2', 1, [{ name: 'Inès B.', role: 'user' }, { name: 'Sofiane R.', role: 'user' }], { status: 'done', sc: [5, 3], winner: 0 }),
          match('m-quart-3', 2, [{ name: 'Kevin', role: 'barber' }, { name: 'Yanis K.', role: 'user' }], { ready_at: iso(3 * 60_000) }),
        ],
      }],
      champion: null, runner_up: null, thirds: [],
    },
  }));
  return quart;
}

/** Client sur la page d'un match de tournoi en direct : la socket spectateur, une fois le match à l'écran. */
async function regarderTournoi(page, api, connecter, direct = {}) {
  api.coupe.ouvrirDirect({ ...DIRECT_TOURNOI, ...direct });
  await connecter(CLIENT);
  await page.goto(ADRESSE_TOURNOI);
  await expect(bande(page)).toBeVisible();
  return api.coupe.derniere();
}

test.describe('La Coupe du Gang : regarder un match', () => {
  test('match de tournoi en direct : `auth watch`, `watch {m}`, en-tête, bande aux initiales, but à l\'heure retardée, « Ensuite »', async ({ page, api, connecter, journal }) => {
    await noterBandeaux(page);
    tableau(api);
    const cnx = await regarderTournoi(page, api, connecter);

    // Socket spectateur en protocole 3, jeton du compte, puis la demande du match de tournoi
    expect(cnx.messages[0]).toMatchObject({ t: 'auth', v: 3, watch: true });
    expect(typeof cnx.messages[0].token).toBe('string');
    expect(cnx.messages.filter((m) => m.t !== 'ping')[1]).toEqual({ t: 'watch', m: ID_MATCH_TOURNOI });
    // Jamais un message de joueur
    expect(api.coupe.messages('tjoin')).toEqual([]);
    expect(api.coupe.messages('in')).toEqual([]);

    // En-tête : le tour, le tournoi, les spectateurs
    await expect(page.getByText('Tu regardes · Quart 1')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Coupe de Novembre' })).toBeVisible();
    await expect(page.getByRole('img', { name: '34 spectateurs' })).toBeVisible();
    // Bande : le joueur du haut (Dom, blanc) à gauche, celui du bas (Lucas M., rouge) à droite, aux initiales
    await expect(bande(page)).toContainText('Dom');
    await expect(bande(page)).toContainText('Lucas M.');
    await expect(bande(page).locator('.cdgw-pawn[data-side="1"]')).toHaveText('D');
    await expect(bande(page).locator('.cdgw-pawn[data-side="0"]')).toHaveText('LM');
    await expect(bande(page).locator('.cdgw-score')).toHaveText('0 – 0');
    // A7 : le titre du match (`tour.title`) devant la règle ; `label` reste le nom du tour
    await expect(ligne(page)).toHaveText('Quart 1 · Premier à 5');
    await expect(terrain(page)).toBeVisible();
    await expect(page.getByText('Les joueurs voient tes réactions. Aucun message écrit.')).toBeVisible();

    // « Ensuite » : le prochain match prêt du tableau, vers la page du tournoi
    const ensuite = page.getByRole('link', { name: /Ensuite : Kevin – Yanis K\., dans ~3 min/ });
    await expect(ensuite).toBeVisible();
    await expect(ensuite).toHaveAttribute('href', `/coupe/tournoi/${ID_TOURNOI}`);

    // But de Lucas M. (joueur 0) : bandeau à la troisième personne, score de la bande (Dom 0 – 1 Lucas M.)
    api.coupe.relayer(ID_MATCH_TOURNOI, { t: 'goal', by: 0, sc: [1, 0], v: 1, fx: 0 });
    await attendreBandeau(page, ['But !', 'Lucas M. marque']);
    await expect(bande(page).locator('.cdgw-score')).toHaveText('0 – 1');
    await expect(bande(page)).toContainText('Score : Dom 0, Lucas M. 1');

    // Spectateurs : le nombre et l'écran du salon
    api.coupe.spectateurs(ID_MATCH_TOURNOI, 35, true);
    await expect(page.getByRole('img', { name: '35 spectateurs, sur l’écran du salon' })).toBeVisible();
    expect(journal.console).toEqual([]);
  });

  test('match ordinaire : `watch {w}`, règle d\'aujourd\'hui, pion « DHB » du salon, sans tournoi', async ({ page, api, connecter }) => {
    api.coupe.ouvrirDirect(DIRECT_MATCH);
    await connecter(CLIENT);
    await page.goto(ADRESSE_MATCH);
    await expect(bande(page)).toBeVisible();
    expect(api.coupe.messages('watch')).toEqual([{ t: 'watch', w: ID_DIRECT }]);
    await expect(page.getByText('Tu regardes', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'La Coupe du Gang' })).toBeVisible();
    await expect(bande(page).locator('.cdgw-pawn[data-side="1"]')).toHaveText('DHB');
    await expect(bande(page).locator('.cdgw-pawn[data-side="0"]')).toHaveText('K');
    await expect(bande(page)).toContainText('Premier à 3');
    await expect(page.getByRole('img', { name: '3 spectateurs' })).toBeVisible();
    // Ni « Ensuite » ni lecture d'un tournoi
    await expect(page.getByRole('link', { name: /^Ensuite/ })).toHaveCount(0);
    expect(api.requetesVers('GET', /^\/coupe\/tournaments\//)).toEqual([]);
  });

  test('règlement v2 : faute avec penalty, événement, tirs au but, à la troisième personne', async ({ page, api, connecter }) => {
    await noterBandeaux(page);
    await regarderTournoi(page, api, connecter);
    // Dom (joueur 1) campe : penalty pour Lucas M.
    api.coupe.relayer(ID_MATCH_TOURNOI, { t: 'foul', side: 1, k: 'camp', w: 0, pen: true });
    await attendreBandeau(page, ['Faute', 'Dom campait devant son but', 'Penalty pour Lucas M.']);
    api.coupe.etatDirect(ID_MATCH_TOURNOI, { ph: 'pen', md: ['pen', 0, 3] });
    await expect(bande(page)).toContainText('Penalty · Lucas M.');
    api.coupe.etatDirect(ID_MATCH_TOURNOI, { ph: 'live', md: undefined });
    // Événement du terrain annoncé par le serveur (heures du serveur)
    const s = api.coupe.heure(api.coupe.derniere());
    api.coupe.relayer(ID_MATCH_TOURNOI, {
      t: 'ev', e: { k: 'smoke', id: 7, an: s, at: s + 1000, until: s + 6000, sd: 3, x0: 120, y0: 300, x: 200, y: 320, w: [0.4, 0.6] },
    });
    await attendreBandeau(page, ['Fumigène', 'La fumée cache le ballon']);
    // Tirs au but : Lucas M. tire en premier ; la bande compte les tirs
    api.coupe.relayer(ID_MATCH_TOURNOI, { t: 'gold' });
    await attendreBandeau(page, ['But en or', 'Le prochain but gagne']);
    api.coupe.relayer(ID_MATCH_TOURNOI, { t: 'shootout', first: 0 });
    await attendreBandeau(page, ['Tirs au but', '3 tirs chacun', 'Lucas M. tire en premier']);
    api.coupe.etatDirect(ID_MATCH_TOURNOI, { so: [[1], [0]] });
    await expect(bande(page)).toContainText('Tirs au but · 0 – 1');
    // Jamais « Tu » ni « toi » : personne n'est dans ce match
    const textes = (await page.evaluate(() => window.__bandeaux)).flatMap((b) => b.textes).join(' ');
    expect(textes).not.toMatch(/\b(Tu|toi|ton|ta)\b/);
  });

  test('réactions : une toutes les 3 s, bulle tout de suite, celles des autres spectateurs', async ({ page, api, connecter }) => {
    await regarderTournoi(page, api, connecter);
    await reaction(page, 'Allez !').click();
    await expect.poll(() => api.coupe.messages('cheer')).toEqual([{ t: 'cheer', r: 0 }]);
    await expect(bulle(page, 'Allez !')).toBeVisible();
    // Les 4 boutons attendent 3 s
    for (const nom of ['Allez !', 'Quel but', 'Bravo', 'Oh non']) await expect(reaction(page, nom)).toBeDisabled();
    await expect(reaction(page, 'Bravo')).toBeEnabled({ timeout: 5000 });
    await reaction(page, 'Bravo').click();
    await expect.poll(() => api.coupe.messages('cheer').map((m) => m.r)).toEqual([0, 2]);
    // Jamais deux réactions à moins de 3 s (le faux serveur les compterait ignorées)
    expect(api.coupe.cheersIgnores).toBe(0);
    // Réaction d'un autre spectateur : anonyme
    api.coupe.encouragement(ID_MATCH_TOURNOI, 3);
    await expect(bulle(page, 'Oh non')).toBeVisible();
    await expect(bulle(page, 'Oh non')).not.toHaveAttribute('data-mine', /.*/);
  });

  test('pause : « Un joueur s\'est déconnecté », puis le match reprend', async ({ page, api, connecter }) => {
    await regarderTournoi(page, api, connecter);
    api.coupe.relayer(ID_MATCH_TOURNOI, { t: 'pause', away: 1, left: 10 });
    await expect(page.getByText('Un joueur s\'est déconnecté')).toBeVisible();
    await expect(page.getByText(/^Dom a \d+ s pour revenir$/)).toBeVisible();
    await expect(bande(page)).toContainText('Pause');
    api.coupe.etatDirect(ID_MATCH_TOURNOI, { ph: 'live' });
    await expect(page.getByText('Un joueur s\'est déconnecté')).toHaveCount(0);
    await expect(bande(page)).toContainText('Premier à 5');
  });

  test('fin : `wend`, résultat, retour au tableau ou à la Coupe, plus rien n\'est demandé', async ({ page, api, connecter }) => {
    const cnx = await regarderTournoi(page, api, connecter);
    api.coupe.finDirect(ID_MATCH_TOURNOI, { winner: 0, sc: [5, 3] });
    await expect(page.getByRole('heading', { name: 'Lucas M. gagne 5 – 3.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retour au tableau' })).toHaveAttribute('href', `/coupe/tournoi/${ID_TOURNOI}`);
    await expect(page.getByRole('button', { name: 'Retour à la Coupe' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Réactions' })).toHaveCount(0);
    await expect(bande(page).locator('.cdgw-score')).toHaveText('3 – 5');
    // A2 : l'app ferme sa socket après la fin (une place de spectateur rendue), sans reconnexion
    const connexions = api.coupe.connexions.length;
    await expect.poll(() => cnx.fermeeParApp === true).toBe(true);
    await page.waitForTimeout(1500);
    expect(api.coupe.connexions.length).toBe(connexions);
    expect(api.coupe.messages('watch')).toHaveLength(1);
    await page.getByRole('button', { name: 'Retour à la Coupe' }).click();
    await expect(page).toHaveURL(/\/coupe$/);
  });

  test('fin aux tirs au but et par forfait : le vainqueur dit comme il faut', async ({ page, api, connecter }) => {
    await regarderTournoi(page, api, connecter);
    api.coupe.finDirect(ID_MATCH_TOURNOI, { winner: 1, sc: [3, 3], so: [2, 4], reason: 'shootout' });
    await expect(page.getByRole('heading', { name: 'Dom gagne aux tirs au but (4 – 2), 3 – 3 à la fin du match.' })).toBeVisible();
    // Match ordinaire fini par forfait (autre page)
    api.coupe.ouvrirDirect(DIRECT_MATCH);
    await page.goto(ADRESSE_MATCH);
    await expect(bande(page)).toBeVisible();
    api.coupe.finDirect(ID_DIRECT, { winner: 0, sc: [1, 0], forfeit: true, reason: 'forfeit' });
    await expect(page.getByRole('heading', { name: 'Kevin gagne par forfait.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retour au tableau' })).toHaveCount(0);
  });

  test('`no_match` : « Ce match n\'est plus en direct », une seule demande (on ne sonde pas)', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe/regarder?w=zzzzzzzzzzzz');
    await expect(page.getByRole('heading', { name: 'Ce match n’est plus en direct' })).toBeVisible();
    await page.clock.fastForward(6000);
    await page.waitForTimeout(300);
    expect(api.coupe.messages('watch')).toEqual([{ t: 'watch', w: 'zzzzzzzzzzzz' }]);
    // A2 : refus définitif, la socket est fermée par l'app
    await expect.poll(() => api.coupe.connexions.map((c) => c.fermeeParApp === true)).toEqual([true]);
    // Adresse sans match du tout : même écran, sans connexion
    await page.goto('/coupe/regarder');
    await expect(page.getByRole('heading', { name: 'Ce match n’est plus en direct' })).toBeVisible();
  });

  test('`not_live` : « pas encore commencé », nouvel essai toutes les 5 s, puis le match à l\'écran', async ({ page, api, connecter }) => {
    api.coupe.ouvrirDirect({ ...DIRECT_TOURNOI, commence: false });
    await connecter(CLIENT);
    await page.goto(ADRESSE_TOURNOI);
    await expect(page.getByRole('heading', { name: 'Le match n’a pas encore commencé' })).toBeVisible();
    expect(api.coupe.messages('watch')).toHaveLength(1);
    await expect.poll(() => api.coupe.messages('watch').length, { timeout: 8000 }).toBe(2);
    api.coupe.commencerDirect(ID_MATCH_TOURNOI);
    await expect(bande(page)).toBeVisible({ timeout: 8000 });
    expect(api.coupe.messages('watch')).toHaveLength(3);
    await expect(page.getByText('Tu regardes · Quart 1')).toBeVisible();
  });

  test('`not_live` pendant 10 min : « toujours pas commencé » et « Réessayer »', async ({ page, api, connecter }) => {
    api.coupe.ouvrirDirect({ ...DIRECT_TOURNOI, commence: false });
    await connecter(CLIENT);
    await page.goto(ADRESSE_TOURNOI);
    await expect(page.getByRole('heading', { name: 'Le match n’a pas encore commencé' })).toBeVisible();
    await page.clock.fastForward(10 * 60 * 1000);
    await expect(page.getByRole('heading', { name: 'Le match n’a toujours pas commencé' })).toBeVisible({ timeout: 10_000 });
    const avant = api.coupe.messages('watch').length;
    api.coupe.commencerDirect(ID_MATCH_TOURNOI);
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(bande(page)).toBeVisible();
    expect(api.coupe.messages('watch').length).toBe(avant + 1);
  });

  test('complet (`watch_full`), puis « Réessayer » ; `disabled` : regarder fait une pause', async ({ page, api, connecter }) => {
    api.coupe.ouvrirDirect(DIRECT_TOURNOI);
    api.coupe.refusRegarder = 'watch_full';
    api.coupe.refusRegarderFois = 1;
    await connecter(CLIENT);
    await page.goto(ADRESSE_TOURNOI);
    await expect(page.getByRole('heading', { name: 'Trop de spectateurs pour ce match' })).toBeVisible();
    // A2 : socket rendue ; « Réessayer » en ouvre une neuve
    await expect.poll(() => api.coupe.connexions.map((c) => c.fermeeParApp === true)).toEqual([true]);
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(bande(page)).toBeVisible();
    expect(api.coupe.connexions).toHaveLength(2);

    api.coupe.refusRegarder = 'disabled';
    api.coupe.refusRegarderFois = null;
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Regarder les matchs fait une pause' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
  });

  test('drapeau `features.coupeSpectators` faux : « Regarder n\'est pas encore ouvert », aucune connexion', async ({ page, api, connecter }) => {
    api.donnees.parametresPublics.features.coupeSpectators = false;
    api.coupe.ouvrirDirect(DIRECT_TOURNOI);
    await connecter(CLIENT);
    await page.goto(ADRESSE_TOURNOI);
    await expect(page.getByRole('heading', { name: 'Regarder n’est pas encore ouvert' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retour' }).last()).toBeVisible();
    await page.waitForTimeout(500);
    expect(api.coupe.connexions).toHaveLength(0);
  });

  test('coupure du réseau : reprise toute seule, puis 3 essais, « Connexion perdue » et « Réessayer »', async ({ page, api, connecter }) => {
    const cnx = await regarderTournoi(page, api, connecter);
    // Coupure brève : nouvelle socket, nouveau `watch`, le match reste à l'écran
    api.coupe.couper(cnx);
    await expect.poll(() => api.coupe.messages('watch').length, { timeout: 8000 }).toBe(2);
    await expect(bande(page)).toBeVisible();
    await expect(page.getByText('Reconnexion…')).toHaveCount(0);
    expect(api.coupe.derniere()).not.toBe(cnx);

    // Serveur injoignable : 3 essais, puis « Connexion perdue »
    api.coupe.relayer(ID_MATCH_TOURNOI, { t: 'goal', by: 0, sc: [1, 0], v: 1, fx: 0 });
    api.coupe.etatDirect(ID_MATCH_TOURNOI, { ph: 'live' });
    await expect(bande(page).locator('.cdgw-score')).toHaveText('0 – 1');
    const n = api.coupe.connexions.length;
    api.coupe.injoignable = true;
    api.coupe.couper(api.coupe.derniere());
    await expect(page.getByText('Reconnexion…')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Connexion perdue' })).toBeVisible({ timeout: 15_000 });
    expect(api.coupe.connexions.length).toBe(n + 3);
    // A5 : le dernier score reste à l'écran, pastille sur le terrain, plus de réactions
    await expect(bande(page)).toContainText('Lucas M.');
    await expect(bande(page).locator('.cdgw-score')).toHaveText('0 – 1');
    await expect(pastillePerdue(page)).toHaveText('Connexion perdue');
    await expect(page.getByRole('group', { name: 'Réactions' })).toHaveCount(0);
    // « Réessayer » : même match, noms, score et règle gardés pendant la reconnexion
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(pastillePerdue(page)).toHaveText('Connexion perdue, on réessaie…');
    await expect(bande(page)).toContainText('Dom');
    await expect(bande(page).locator('.cdgw-score')).toHaveText('0 – 1');
    await expect(ligne(page)).toHaveText('Quart 1 · Premier à 5');
    await expect(reaction(page, 'Allez !')).toBeDisabled();
    api.coupe.injoignable = false;
    await expect(pastillePerdue(page)).toHaveCount(0, { timeout: 10_000 });
    await expect(reaction(page, 'Allez !')).toBeEnabled();
    await expect(bande(page).locator('.cdgw-score')).toHaveText('0 – 1');
  });

  test('320 px : en direct, à la fin et en attente, sans défilement horizontal', async ({ page, api, connecter }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    tableau(api);
    await regarderTournoi(page, api, connecter);
    await expect(reaction(page, 'Oh non')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Ensuite/ })).toBeVisible();
    await attendreSansDebordement(page, 'le direct à 320 px');
    api.coupe.finDirect(ID_MATCH_TOURNOI, { winner: 1, sc: [3, 5] });
    await expect(page.getByRole('heading', { name: 'Dom gagne 5 – 3.' })).toBeVisible();
    await attendreSansDebordement(page, 'la fin à 320 px');
    await page.setViewportSize({ width: 430, height: 932 });
    await attendreSansDebordement(page, 'la fin à 430 px');
  });

  test('aucune photo : pions aux initiales, même si le serveur envoyait des photos', async ({ page, api, connecter }) => {
    const medias = [];
    page.on('request', (r) => { if (/\/api\/media\//.test(r.url())) medias.push(r.url()); });
    api.coupe.wstartEnPlus = { photos: [PHOTO_LUCAS, PHOTO_LUCAS] };
    await regarderTournoi(page, api, connecter);
    await expect(terrain(page)).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.locator('img[src*="/api/media/"]')).toHaveCount(0);
    expect(medias).toEqual([]);
  });
});

test.describe('La Coupe du Gang : regarder un match, décisions après la contre-expertise', () => {
  test('A1 (compte) : 4401 seul → « Connexion perdue » (session), dernier score gardé, aucune boucle', async ({ page, api, connecter }) => {
    const cnx = await regarderTournoi(page, api, connecter);
    api.coupe.couper(cnx, 4401);
    await expect(page.getByRole('heading', { name: 'Connexion perdue' })).toBeVisible();
    await expect(page.getByText('Ta session n’est pas reconnue. Reconnecte-toi, puis réessaie.')).toBeVisible();
    await expect(bande(page)).toContainText('Lucas M.');
    await page.clock.fastForward(35_000);
    await page.waitForTimeout(300);
    expect(api.coupe.connexions).toHaveLength(1);
  });

  test('A1 (écran) : 4401 seul = coupure (nouvelle connexion) ; seul `screen_revoked` arrête tout', async ({ page, api }) => {
    api.ecran.matchOrdinaire();
    await page.goto(`/ecran#cle=${CLE_ECRAN}`);
    // En direct (`wstart` reçu : la règle s'affiche), pas seulement la ligne `live` de l'écran
    await expect(ligne(page)).toHaveText('Premier à 3');
    expect(api.coupe.messages('watch')).toHaveLength(1);
    const n = api.coupe.connexions.length;
    api.coupe.couper(api.coupe.derniere(), 4401);
    // Nouvelle connexion avec la clé de l'écran, même match demandé
    await expect.poll(() => api.coupe.connexions.length, { timeout: 8000 }).toBe(n + 1);
    expect(api.coupe.derniere().messages[0]).toMatchObject({ t: 'auth', screen: CLE_ECRAN, v: 3 });
    await expect.poll(() => api.coupe.messages('watch').length, { timeout: 8000 }).toBe(2);
    expect(api.coupe.messages('watch').at(-1)).toMatchObject({ w: SALLE_ECRAN });
    await expect(page.getByRole('heading', { name: 'Écran coupé par le salon' })).toHaveCount(0);
    await expect(bande(page)).toContainText('Sarah K.');

    // Écran coupé par l'admin : `screen_revoked` puis 4401, plus aucun essai rapide
    const avant = api.coupe.connexions.length;
    const derniere = api.coupe.derniere();
    api.ecran.couper(CLE_ECRAN);
    expect(derniere.envoyes).toContainEqual({ t: 'error', code: 'screen_revoked' });
    await page.waitForTimeout(3500);
    expect(api.coupe.connexions.length).toBe(avant);
  });

  test('A2 : socket rendue après `no_match`, `watch_full`, `disabled` et la fin ; jamais deux sockets ouvertes', async ({ page, api, connecter }) => {
    api.coupe.ouvrirDirect(DIRECT_TOURNOI);
    api.coupe.refusRegarder = 'disabled';
    api.coupe.refusRegarderFois = 1;
    await connecter(CLIENT);
    await page.goto(ADRESSE_TOURNOI);
    await expect(page.getByRole('heading', { name: 'Regarder les matchs fait une pause' })).toBeVisible();
    await expect.poll(() => api.coupe.connexions[0].fermeeParApp === true).toBe(true);
    // Un autre match (lien du tableau) : une socket neuve, l'ancienne n'est plus là
    api.coupe.ouvrirDirect(DIRECT_MATCH);
    await page.goto(ADRESSE_MATCH);
    await expect(bande(page)).toBeVisible();
    await expect.poll(() => api.coupe.connexions.filter((c) => !c.ferme).length).toBe(1);
  });

  test('A3 : 4429 avant `hello` → 30 s d\'attente sans essai rapide, puis le match', async ({ page, api, connecter }) => {
    api.coupe.ouvrirDirect(DIRECT_TOURNOI);
    api.coupe.limiterAuth = 1;
    await connecter(CLIENT);
    await page.goto(ADRESSE_TOURNOI);
    await expect.poll(() => api.coupe.connexions.length).toBe(1);
    await expect(page.getByRole('heading', { name: 'Connexion au match…' })).toBeVisible();
    await page.waitForTimeout(3500);
    expect(api.coupe.connexions).toHaveLength(1);
    await expect(page.getByRole('heading', { name: 'Connexion perdue' })).toHaveCount(0);
    await page.clock.fastForward(30_000);
    await expect(bande(page)).toBeVisible();
    expect(api.coupe.connexions).toHaveLength(2);
    expect(api.coupe.messages('watch')).toEqual([{ t: 'watch', m: ID_MATCH_TOURNOI }]);
  });

  test('A3 (écran) : remplacé (4409) → nouvel essai 30 s plus tard, sans quitter le match', async ({ page, api }) => {
    api.ecran.matchOrdinaire();
    await page.goto(`/ecran#cle=${CLE_ECRAN}`);
    await expect(ligne(page)).toHaveText('Premier à 3');
    const n = api.coupe.connexions.length;
    api.coupe.remplacer(api.coupe.derniere());
    await page.waitForTimeout(3500);
    expect(api.coupe.connexions.length).toBe(n);
    // Noms et score gardés pendant l'attente, pastille sur le terrain
    await expect(bande(page)).toContainText('Sarah K.');
    await expect(pastillePerdue(page)).toHaveText('Connexion perdue, on réessaie…');
    await page.clock.fastForward(30_000);
    await expect.poll(() => api.coupe.connexions.length, { timeout: 8000 }).toBe(n + 1);
    await expect(pastillePerdue(page)).toHaveCount(0, { timeout: 8000 });
  });

  test('A4 : bande de l\'écran à l\'échelle (16 / 30 / 34 px de scène), « D\'Home Barber » sur deux lignes au plus', async ({ page, api }) => {
    api.ecran.matchOrdinaire({ names: ["D'Home Barber", 'Kevin'], roles: ['salon', 'barber'], sc: [0, 0] });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`/ecran#cle=${CLE_ECRAN}`);
    await expect(bande(page)).toContainText("D'Home Barber");
    for (const [largeur, hauteur] of [[960, 540], [1280, 720], [1366, 768], [1920, 1080]]) {
      await page.setViewportSize({ width: largeur, height: hauteur });
      await expect.poll(() => page.evaluate(() => {
        const root = document.querySelector('.cdgw-root[data-variant="screen"]');
        return Number(root?.style.getPropertyValue('--cdgw-k')) || 0;
      })).toBeCloseTo(Math.min(largeur / 1280, hauteur / 720), 2);
      const mesures = await page.evaluate(() => {
        const root = document.querySelector('.cdgw-root[data-variant="screen"]');
        const k = Number(root.style.getPropertyValue('--cdgw-k'));
        const px = (el, p) => parseFloat(getComputedStyle(el)[p]);
        const nom = [...root.querySelectorAll('.cdgw-name')].find((el) => el.textContent === "D'Home Barber");
        const texte = nom.firstChild;
        // Un mot coupé en deux lignes aurait deux rectangles
        const mots = [];
        for (const m of texte.textContent.matchAll(/\S+/g)) {
          const r = document.createRange();
          r.setStart(texte, m.index);
          r.setEnd(texte, m.index + m[0].length);
          mots.push(r.getClientRects().length);
        }
        const lignes = Math.round(nom.getBoundingClientRect().height / px(nom, 'lineHeight'));
        return {
          k,
          nom: px(nom, 'fontSize') / k,
          pion: root.querySelector('.cdgw-pawn').getBoundingClientRect().width / k,
          score: px(root.querySelector('.cdgw-score'), 'fontSize') / k,
          ligne: px(root.querySelector('.cdgw-line'), 'fontSize') / k,
          lignes,
          cache: nom.scrollHeight > nom.clientHeight + 1 || nom.scrollWidth > nom.clientWidth + 1,
          mots,
        };
      });
      expect(mesures.nom, `${largeur} × ${hauteur}`).toBeCloseTo(16, 1);
      expect(mesures.pion).toBeCloseTo(30, 0);
      expect(mesures.score).toBeCloseTo(34, 1);
      expect(mesures.ligne).toBeGreaterThanOrEqual(16);
      expect(mesures.lignes, `${largeur} × ${hauteur} : lignes du nom`).toBeLessThanOrEqual(2);
      expect(mesures.cache, `${largeur} × ${hauteur} : nom coupé`).toBe(false);
      expect(mesures.mots, `${largeur} × ${hauteur} : mot coupé`).toEqual([1, 1]);
    }
  });

  test('A5 (écran) : noms et score de la ligne `live` avant `wstart`, « Premier à … » caché jusque-là', async ({ page, api }) => {
    api.ecran.matchOrdinaire();
    api.coupe.delaiAuth = 4000;
    await page.goto(`/ecran#cle=${CLE_ECRAN}`);
    await expect(bande(page)).toContainText('Sarah K.');
    await expect(bande(page)).toContainText('Kevin');
    await expect(bande(page).locator('.cdgw-score')).toHaveText('0 – 1');
    expect(api.coupe.messages('watch')).toHaveLength(0);
    await expect(ligne(page)).not.toContainText('Premier à');
    await expect(ligne(page)).toHaveText('Premier à 3', { timeout: 10_000 });
  });

  test('A6 : en attente, tableau lu (en-tête, joueurs) ; fini au tableau → « Ce match est fini », socket rendue', async ({ page, api, connecter }) => {
    api.coupe.ouvrirDirect({ ...DIRECT_TOURNOI, commence: false });
    const quart = tableau(api, { live: null });
    await connecter(CLIENT);
    await page.goto(ADRESSE_TOURNOI);
    await expect(page.getByRole('heading', { name: 'Le match n’a pas encore commencé' })).toBeVisible();
    await expect(page.getByText('Tu regardes · Quart 1')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Coupe de Novembre' })).toBeVisible();
    await expect(page.getByText('Lucas M. contre Dom : le match s’affiche dès le coup d’envoi.')).toBeVisible();
    expect(api.requetesVers('GET', new RegExp(`^/coupe/tournaments/${ID_TOURNOI}$`)).length).toBeGreaterThan(0);

    // Le match se joue et finit sans spectateur (forfait, ou fini avant la reprise) : le tableau le dit
    Object.assign(quart, { status: 'done', sc: [5, 3], winner: 0, reason: 'score' });
    await page.clock.fastForward(16_000);
    await expect(page.getByRole('heading', { name: 'Ce match est fini' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Lucas M. 5 – 3 Dom.', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retour au tableau' })).toHaveAttribute('href', `/coupe/tournoi/${ID_TOURNOI}`);
    await expect.poll(() => api.coupe.connexions.every((c) => c.ferme)).toBe(true);
    const watchs = api.coupe.messages('watch').length;
    await page.clock.fastForward(20_000);
    await page.waitForTimeout(300);
    expect(api.coupe.messages('watch')).toHaveLength(watchs);
  });

  test('A6 : `no_match` à la reprise du même match → « fini pendant ton absence », dernier score vu', async ({ page, api, connecter }) => {
    tableau(api);
    const cnx = await regarderTournoi(page, api, connecter);
    api.coupe.relayer(ID_MATCH_TOURNOI, { t: 'goal', by: 0, sc: [1, 0], v: 1, fx: 0 });
    api.coupe.etatDirect(ID_MATCH_TOURNOI, { ph: 'live' });
    await expect(bande(page).locator('.cdgw-score')).toHaveText('0 – 1');
    // Page cachée : la socket est rendue ; le match finit pendant ce temps
    await cacherPage(page, true);
    await expect.poll(() => cnx.fermeeParApp === true).toBe(true);
    api.coupe.finDirect(ID_MATCH_TOURNOI, { winner: 0, sc: [5, 2] });
    await cacherPage(page, false);
    await expect(page.getByRole('heading', { name: 'Le match s’est fini pendant ton absence' })).toBeVisible();
    await expect(page.getByText('Dernier score vu : Dom 0 – 1 Lucas M.', { exact: true })).toBeVisible();
    // Le nombre de spectateurs d'avant l'absence n'est plus montré
    await expect(page.getByRole('img', { name: /spectateur/ })).toHaveCount(0);
    await expect(ligne(page)).toHaveText('Dernier score vu');
    await expect(page.getByRole('link', { name: 'Retour au tableau' })).toHaveAttribute('href', `/coupe/tournoi/${ID_TOURNOI}`);
    expect(api.coupe.messages('watch')).toHaveLength(2);
    await expect.poll(() => api.coupe.derniere().fermeeParApp === true).toBe(true);
  });

  test('A7 : serveur sans `tour.title` → le nom du tour en repli', async ({ page, api, connecter }) => {
    await regarderTournoi(page, api, connecter, { tour: { tid: ID_TOURNOI, name: 'Coupe de Novembre', label: 'Quart de finale' } });
    await expect(page.getByText('Tu regardes · Quart de finale')).toBeVisible();
    await expect(ligne(page)).toHaveText('Quart de finale · Premier à 5');
  });

  test('A8 : bouton Son de l\'en-tête, réglage du son de la Coupe (`cdg-sound`)', async ({ page, api, connecter }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('e2e-son-pose')) {
        sessionStorage.setItem('e2e-son-pose', '1');
        localStorage.setItem('cdg-sound', 'off');
      }
    });
    await regarderTournoi(page, api, connecter);
    const son = page.getByRole('button', { name: 'Activer le son' });
    await expect(son).toHaveAttribute('aria-pressed', 'false');
    await son.click();
    await expect(page.getByRole('button', { name: 'Couper le son' })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('cdg-sound'))).toBe('on');
    await page.getByRole('button', { name: 'Couper le son' }).click();
    await expect(page.getByRole('button', { name: 'Activer le son' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('cdg-sound'))).toBe('off');
    // Gardé d'une visite à l'autre
    await page.reload();
    await expect(bande(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activer le son' })).toBeVisible();
  });

  test('A12 : bulles des réactions en rangées espacées de 32 px au moins, sans chevauchement (320 × 568)', async ({ page, api, connecter }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await regarderTournoi(page, api, connecter);
    for (const r of [0, 1, 2, 3]) api.coupe.encouragement(ID_MATCH_TOURNOI, r);
    await reaction(page, 'Bravo').click();
    await expect(page.locator('.cdgw-bubble')).toHaveCount(5);
    const boites = await page.locator('.cdgw-bubble').evaluateAll((els) => els.map((el) => {
      const b = el.getBoundingClientRect();
      return { cote: el.dataset.at, haut: b.top, bas: b.bottom, gauche: b.left, droite: b.right };
    }));
    for (const cote of ['left', 'right']) {
      const rangees = boites.filter((b) => b.cote === cote).sort((a, b) => a.haut - b.haut);
      for (let i = 1; i < rangees.length; i += 1) {
        expect(rangees[i].haut - rangees[i - 1].haut, `écart des rangées (${cote})`).toBeGreaterThanOrEqual(32);
        expect(rangees[i].haut, `chevauchement (${cote})`).toBeGreaterThanOrEqual(rangees[i - 1].bas);
      }
    }
    // Deux bulles de côtés opposés ne se touchent pas non plus
    for (const a of boites.filter((b) => b.cote === 'left')) {
      for (const b of boites.filter((x) => x.cote === 'right')) {
        const croise = a.droite > b.gauche && a.bas > b.haut && b.bas > a.haut;
        expect(croise, 'bulles gauche et droite qui se recouvrent').toBe(false);
      }
    }
  });

  test('`wstart.tl` : « Dernières 30 s » dès l\'arrivée ; `wstart.away` : qui est parti et son délai', async ({ page, api, connecter }) => {
    api.coupe.ouvrirDirect(DIRECT_TOURNOI);
    api.coupe.relayer(ID_MATCH_TOURNOI, { t: 'time_left', s: 30 });
    await connecter(CLIENT);
    await page.goto(ADRESSE_TOURNOI);
    await expect(bande(page)).toBeVisible();
    expect(api.coupe.derniere().envoyes.find((m) => m.t === 'wstart').tl).toBeGreaterThan(25);
    await expect(ligne(page)).toHaveText('Dernières 30 s');

    // Arrivée pendant une pause : le nom du joueur parti et ses secondes, pas « reprend à son retour »
    api.coupe.relayer(ID_MATCH_TOURNOI, { t: 'pause', away: 1, left: 10 });
    await page.goto(ADRESSE_TOURNOI);
    await expect(page.getByText(/^Dom a \d+ s pour revenir$/)).toBeVisible();
    expect(api.coupe.derniere().envoyes.find((m) => m.t === 'wstart').away).toMatchObject({ side: 1 });
    await expect(page.getByText('Le match reprend à son retour')).toHaveCount(0);
  });
});
