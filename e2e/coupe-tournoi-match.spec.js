// La Coupe du Gang : un match de tournoi dans l'écran de jeu (docs/fonctions/coupe-tournois-contrat.md,
// sections 4 à 6 ; planche des tournois, écrans 6 et 7). Ouvert comme « Jouer mon match » de la page
// du tournoi (`/coupe?tmatch=<match>&tournoi=<tournoi>`), avec le faux serveur de jeu
// (e2e/support/fauxCoupe.js, `tjoin`) : `tjoin` après `hello`, salle d'attente sans code ni lien avec
// le compte à rebours du forfait, le tour sur l'affiche et dans la barre du haut, la séance de tirs
// au but (bandeau, pastilles, score du match inchangé, bande de hauteur fixe), la fin sans revanche
// ni partage avec « Retour au tableau », les refus `t_*` et `update_required` (`t_closed` neutre :
// échéance passée, forfait, décision de l'admin ; `t_not_ready` réessayé tout seul 30 s au plus,
// aussi après un redémarrage du serveur), la reprise après une coupure (avec ou sans lien de salle),
// l'abandon, le forfait pendant les tirs au but, l'adversaire de la salle d'attente (`tour.opp`
// d'abord, puis le tableau déjà lu) ; 320 et 390 px sans défilement horizontal.
import { test, expect } from './support/test.js';
import { CLIENT } from './support/donnees.js';
import { CODE_MATCH, ID_MATCH_TOURNOI, ID_TOURNOI, LIEN_TOURNOI } from './support/fauxCoupe.js';
import { attendreSansDebordement } from './support/outils.js';
import { shootoutPips, shotLabel, tournamentOpponent } from '../src/components/coupe/game/tournament.js';

const ADRESSE = `/coupe?tmatch=${ID_MATCH_TOURNOI}&tournoi=${ID_TOURNOI}`;
const TABLEAU = `/coupe/tournoi/${ID_TOURNOI}`;
const jeu = (page) => page.getByRole('dialog', { name: 'La Coupe du Gang' });
const attente = (page) => page.getByRole('heading', { name: /^En attente de/ });
const bandeTirs = (page) => page.getByRole('group', { name: 'Tirs au but' });
const bandeV2 = (page) => page.getByRole('group', { name: 'Buts et avertissements' });
const TERMINE = 'Ce match est terminé : le résultat est sur le tableau';
const PAS_PRET = 'Ton match n\'est pas encore prêt';

/** Fin d'un quart de finale gagné par ce téléphone (side 0) aux tirs au but, points classés. */
const FIN_TIRS = {
  t: 'end', winner: 0, sc: [3, 3], so: [4, 3], forfeit: false, cancelled: false, reason: 'shootout', tour: true,
  points: { ranked: true, reason: null, delta: [3, -1], total: 45, rank: 6, rank_before: 8 },
};

/**
 * Tableau du tournoi (page du constructeur « App pages ») : réponse de la forme du contrat (3.4),
 * pour que « Retour au tableau » arrive sur une page qui se charge.
 */
async function tableauSimule(page) {
  await page.route(`**/coupe/tournaments/${ID_TOURNOI}`, (route) => route.fulfill({
    json: {
      id: ID_TOURNOI, name: 'Coupe de Novembre', starts_at: new Date().toISOString(), size: 8, status: 'running',
      cancel_reason: null, drawn_at: new Date().toISOString(), finished_at: null, server_now: new Date().toISOString(),
      checkin_from: new Date().toISOString(), players: [],
      me: { registered: true, waiting: false, checked_in: true, status: 'in', match: null },
      rounds: [], champion: null, runner_up: null, thirds: [],
    },
  }));
}

/** Bandeaux notés à leur apparition (ils ne durent que ~1,6 s), comme e2e/coupe-regles-v2.spec.js. */
async function noterBandeaux(page) {
  await page.addInitScript(() => {
    window.__bandeaux = [];
    const notes = new WeakMap();
    new MutationObserver(() => {
      for (const b of document.querySelectorAll('.cdg-banner')) {
        let n = notes.get(b);
        if (!n) {
          n = { sorte: b.dataset.kind, pos: b.dataset.pos, textes: [] };
          notes.set(b, n);
          window.__bandeaux.push(n);
        }
        n.textes = [...b.children].map((c) => c.textContent);
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}
const bandeauxVus = (page) => page.evaluate(() => window.__bandeaux);
const attendreBandeau = (page, textes, autres = {}) => expect.poll(() => bandeauxVus(page))
  .toContainEqual(expect.objectContaining({ textes, ...autres }));

/** Client sur « Jouer mon match » : connexion, `tjoin`, salle d'attente. */
async function ouvrirMatch(page, api, connecter) {
  await connecter(CLIENT);
  await page.goto(ADRESSE);
  await expect(attente(page)).toBeVisible();
  return api.coupe.derniere();
}

/**
 * Match repris après une coupure : plus de « Reconnexion… » et la nouvelle socket envoie la position
 * du joueur (`in`, jamais pendant une reprise). L'astuce « Connexion rétablie » ne dure que 2,4 s :
 * sur une machine chargée, elle peut partir avant d'être vue.
 */
async function repris(page, api) {
  await expect.poll(() => api.coupe.derniere().messages.some((m) => m.t === 'in'), { timeout: 10_000 }).toBe(true);
  await expect(page.getByText('Reconnexion…')).toHaveCount(0);
}

/** L'adversaire arrive : le match commence (règlement v2, comme tout match de tournoi), en jeu. */
async function lancerMatch(page, api, cnx, valeurs = { sc: [0, 0] }) {
  api.coupe.regles = 2;
  api.coupe.rejoint(cnx);
  await expect(page.locator('.cdg-hud-tour')).toBeVisible();
  api.coupe.etat(cnx, { ph: 'live', ...valeurs });
  await expect(jeu(page)).toHaveAttribute('data-play', '1');
}

test.describe('La Coupe du Gang : match de tournoi', () => {
  test('« Jouer mon match » : `tjoin` après `hello`, salle d\'attente sans code ni lien, compte à rebours du forfait', async ({ page, api, connecter, journal }) => {
    const cnx = await ouvrirMatch(page, api, connecter);
    // `auth` (protocole v3), puis la demande de salle : `tjoin` avec l'id du match
    expect(cnx.messages[0]).toMatchObject({ t: 'auth', v: 3 });
    expect(cnx.messages.filter((m) => m.t !== 'ping')[1]).toEqual({ t: 'tjoin', m: ID_MATCH_TOURNOI });
    expect(api.coupe.messages('create')).toEqual([]);
    expect(api.coupe.messages('join')).toEqual([]);

    // L'adversaire : `tour.opp` du serveur
    await expect(attente(page)).toHaveText('En attente de Kevin');
    await expect(page.locator('.cdg-tw-band')).toHaveText('Quart de finale');
    await expect(page.getByText('Coupe de Novembre')).toBeVisible();
    // Échéance du forfait dans 1:42 (heure du serveur), le compte à rebours tourne
    const horloge = page.getByRole('timer');
    await expect(horloge).toHaveText(/^Sans Kevin dans 1:4[0-2], tu gagnes par forfait\.$/);
    await expect(horloge).not.toHaveText(/1:42/, { timeout: 4000 });
    await expect(page.getByText('Premier à 5 · égalité après le but en or : tirs au but')).toBeVisible();
    // Ni le code de la salle ni le lien à partager
    await expect(page.getByText(CODE_MATCH, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Envoyer le défi' })).toHaveCount(0);
    // Rien ne se dessine pendant l'attente
    await expect(jeu(page)).not.toHaveAttribute('data-play', /.*/);
    expect(journal.console).toEqual([]);
  });

  test('« Retour au tableau » depuis la salle d\'attente : `leave`, puis la page du tournoi', async ({ page, api, connecter }) => {
    await tableauSimule(page);
    await ouvrirMatch(page, api, connecter);
    await page.getByRole('button', { name: 'Retour au tableau' }).last().click();
    await expect(page).toHaveURL(new RegExp(`${TABLEAU}$`));
    await expect.poll(() => api.coupe.messages('leave').length).toBe(1);
    await expect(jeu(page)).toHaveCount(0);
  });

  test('l\'adversaire arrive : affiche avec le tour et le tournoi, puis « Quart de finale » en haut pendant le match', async ({ page, api, connecter }) => {
    await page.addInitScript(() => {
      window.__affiches = [];
      new MutationObserver(() => {
        const el = document.querySelector('.cdg-intro');
        if (el && !window.__affiches.includes(el.textContent)) window.__affiches.push(el.textContent);
      }).observe(document, { subtree: true, childList: true, characterData: true });
    });
    api.coupe.avantMatchCd = 4.5;
    const cnx = await ouvrirMatch(page, api, connecter);
    api.coupe.regles = 2;
    api.coupe.rejoint(cnx);
    await expect(jeu(page)).toHaveAttribute('data-play', '1');
    const affiches = await page.evaluate(() => window.__affiches);
    expect(affiches.some((t) => t.includes('Quart de finale') && t.includes('Coupe de Novembre') && t.includes('tirs au but')), JSON.stringify(affiches)).toBe(true);
    expect(affiches.some((t) => t.includes('Match en ligne')), JSON.stringify(affiches)).toBe(false);
    // `start` du serveur : le nom de l'adversaire, le tour dans la barre du haut (à la place de « En ligne »)
    await expect(page.locator('.cdg-hud-tour')).toHaveText('Quart de finale');
    await expect(page.getByText('En ligne', { exact: true })).toHaveCount(0);
    await expect(bandeV2(page)).toBeVisible();
    api.coupe.etat(cnx, { ph: 'live', sc: [1, 0] });
    await expect(page.getByText('Score : Toi 1 – 0 Kevin')).toBeAttached();
  });

  test('adversaire déjà dans la salle : pas d\'attente, le match commence tout de suite (côté imposé par le tableau)', async ({ page, api, connecter }) => {
    api.coupe.tournoi.adversairePresent = true;
    api.coupe.tournoi.you = 1;
    api.coupe.regles = 2;
    await connecter(CLIENT);
    await page.goto(ADRESSE);
    await expect(page.locator('.cdg-hud-tour')).toHaveText('Quart de finale');
    const cnx = api.coupe.derniere();
    api.coupe.etat(cnx, { ph: 'live', sc: [2, 0] });
    // Repère local : ce téléphone joue en bas, le score du serveur [Kevin, moi] est retourné
    await expect(page.getByText('Score : Toi 0 – 2 Kevin')).toBeAttached();
    expect(api.coupe.messages('tjoin')).toEqual([{ t: 'tjoin', m: ID_MATCH_TOURNOI }]);
  });

  test('tirs au but : bandeau, pastilles des tirs, « À toi de tirer » puis « Garde ta ligne », score du match inchangé, terrain immobile', async ({ page, api, connecter }) => {
    await noterBandeaux(page);
    const cnx = await ouvrirMatch(page, api, connecter);
    await lancerMatch(page, api, cnx, { sc: [3, 3], md: ['gold', 4] });
    await expect(bandeV2(page)).toBeVisible();
    // Hauteurs du terrain pendant toute la séance
    await page.evaluate(() => {
      const stage = document.querySelector('.cdg-stage');
      window.__terrain = [Math.round(stage.getBoundingClientRect().height)];
      new ResizeObserver(() => window.__terrain.push(Math.round(stage.getBoundingClientRect().height))).observe(stage);
    });

    // But en or fini sans but (`gold`, rien de neuf), puis la séance : ce téléphone tire en premier
    cnx.envoyer({ t: 'gold' });
    api.coupe.tirsAuBut(cnx, 0);
    api.coupe.etat(cnx, { ph: 'pen', md: ['pen', 0, 3], sc: [3, 3] });
    await attendreBandeau(page, ['Tirs au but', '3 tirs chacun', 'Tu tires en premier'], { sorte: 'shootout', pos: 'low' });
    await expect(bandeTirs(page)).toBeVisible();
    await expect(bandeV2(page)).toHaveCount(0);
    await expect(bandeTirs(page).locator('.cdg-v2-chip')).toHaveText('Tirs au but');
    await expect(bandeTirs(page).getByText('À toi de tirer · 3 s', { exact: true })).toBeVisible();
    // 3 tirs chacun : le mien en cours, les autres à venir
    const mesTirs = bandeTirs(page).getByRole('img', { name: /^Toi :/ });
    const sesTirs = bandeTirs(page).getByRole('img', { name: /^Kevin :/ });
    await expect(mesTirs.locator('.cdg-so-pip')).toHaveCount(3);
    expect(await mesTirs.locator('.cdg-so-pip').evaluateAll((l) => l.map((e) => e.dataset.k))).toEqual(['next', 'todo', 'todo']);
    expect(await sesTirs.locator('.cdg-so-pip').evaluateAll((l) => l.map((e) => e.dataset.k))).toEqual(['todo', 'todo', 'todo']);

    // Mon tir : but. Phase `goal` sans message `goal`, et le score du match ne bouge pas
    api.coupe.etat(cnx, { ph: 'live', md: ['pen', 0, 1.4], sc: [3, 3] });
    await expect(bandeTirs(page).getByText('À toi de tirer · 2 s', { exact: true })).toBeVisible();
    cnx.envoyer({ t: 'pen_end', r: 'goal' });
    api.coupe.etat(cnx, { ph: 'goal', md: undefined, sc: [3, 3], so: [[1], []] });
    await attendreBandeau(page, ['But !', 'Tir réussi'], { sorte: 'so-goal' });
    await expect(mesTirs).toHaveAccessibleName('Toi : 1 but sur 1 tir');
    expect(await mesTirs.locator('.cdg-so-pip').evaluateAll((l) => l.map((e) => e.dataset.k))).toEqual(['goal', 'todo', 'todo']);
    await expect(page.getByText('Score : Toi 3 – 3 Kevin')).toBeAttached();
    await expect(page.getByText('Tirs au but : Toi 1, Kevin 0')).toBeAttached();

    // Son tir : je garde ma ligne, il rate
    api.coupe.etat(cnx, { ph: 'pen', md: ['pen', 1, 3], sc: [3, 3], so: [[1], []] });
    await attendreBandeau(page, ['Garde ta ligne', 'Tir 1 sur 3'], { sorte: 'penalty', pos: 'high' });
    await expect(bandeTirs(page).getByText('Garde ta ligne · 3 s', { exact: true })).toBeVisible();
    expect(await sesTirs.locator('.cdg-so-pip').evaluateAll((l) => l.map((e) => e.dataset.k))).toEqual(['next', 'todo', 'todo']);
    cnx.envoyer({ t: 'pen_end', r: 'saved' });
    api.coupe.etat(cnx, { ph: 'ready', md: undefined, sc: [3, 3], so: [[1], [0]] });
    await attendreBandeau(page, ['Arrêté !', 'Bien gardé !'], { sorte: 'saved' });
    await expect(sesTirs).toHaveAccessibleName('Kevin : 0 but sur 1 tir');
    expect(await sesTirs.locator('.cdg-so-pip').evaluateAll((l) => l.map((e) => e.dataset.k))).toEqual(['miss', 'todo', 'todo']);
    await expect(bandeTirs(page).locator('.cdg-so-n')).toHaveText(['1', '0']);

    // Mort subite : un tir chacun, la bande garde 4 tours au plus
    api.coupe.etat(cnx, { ph: 'pen', md: ['pen', 0, 3], sc: [3, 3], so: [[1, 1, 0], [0, 1, 1]] });
    await expect(mesTirs.locator('.cdg-so-pip')).toHaveCount(4);
    await attendreBandeau(page, ['À toi de tirer', 'Mort subite'], { sorte: 'penalty', pos: 'low' });
    // Toujours le score de l'égalité, et le terrain n'a jamais changé de taille
    await expect(page.getByText('Score : Toi 3 – 3 Kevin')).toBeAttached();
    const hauteurs = await page.evaluate(() => window.__terrain);
    expect(new Set(hauteurs).size, JSON.stringify(hauteurs)).toBe(1);
    // Jamais un « Penalty », un « +1 » ni un second « But en or » pendant la séance
    expect((await bandeauxVus(page)).filter((b) => ['Penalty', 'But en or'].includes(b.textes[0]) || b.sorte === 'fire' || b.sorte === 'elec')).toEqual([]);
  });

  test('tirs au but, Kevin tire en premier et marque : un seul « But ! », score du match inchangé ; son tir suivant tout de suite après un arrêt', async ({ page, api, connecter }) => {
    await noterBandeaux(page);
    const cnx = await ouvrirMatch(page, api, connecter);
    await lancerMatch(page, api, cnx, { sc: [2, 2] });
    api.coupe.tirsAuBut(cnx, 1);
    api.coupe.etat(cnx, { ph: 'pen', md: ['pen', 1, 3], sc: [2, 2] });
    await attendreBandeau(page, ['Tirs au but', '3 tirs chacun', 'Kevin tire en premier'], { sorte: 'shootout', pos: 'high' });
    api.coupe.etat(cnx, { ph: 'live', md: ['pen', 1, 2], sc: [2, 2] });
    cnx.envoyer({ t: 'pen_end', r: 'goal' });
    api.coupe.etat(cnx, { ph: 'goal', md: undefined, sc: [2, 2], so: [[], [1]] });
    await attendreBandeau(page, ['But !', 'Kevin marque'], { sorte: 'so-goal' });
    await expect(bandeTirs(page).getByRole('img', { name: 'Kevin : 1 but sur 1 tir' })).toBeVisible();
    await expect(page.getByText('Score : Toi 2 – 2 Kevin')).toBeAttached();
    // Mon tir (phase `pen` après le but), arrêté : le sien suit tout de suite
    api.coupe.etat(cnx, { ph: 'pen', md: ['pen', 0, 3], sc: [2, 2], so: [[], [1]] });
    await attendreBandeau(page, ['À toi de tirer', 'Tir 1 sur 3'], { sorte: 'penalty', pos: 'low' });
    api.coupe.etat(cnx, { ph: 'live', md: ['pen', 0, 2], sc: [2, 2], so: [[], [1]] });
    cnx.envoyer({ t: 'pen_end', r: 'saved' });
    api.coupe.etat(cnx, { ph: 'pen', md: ['pen', 1, 2.8], sc: [2, 2], so: [[0], [1]] });
    await attendreBandeau(page, ['Arrêté !', 'Kevin a arrêté ton tir'], { sorte: 'saved' });
    await attendreBandeau(page, ['Garde ta ligne', 'Tir 2 sur 3'], { sorte: 'penalty', pos: 'high' });
    await expect(bandeTirs(page).getByRole('img', { name: 'Toi : 0 but sur 1 tir' })).toBeVisible();
    expect((await bandeauxVus(page)).filter((b) => b.sorte === 'so-goal')).toHaveLength(1);
    await expect(page.getByText('Score : Toi 2 – 2 Kevin')).toBeAttached();
  });

  test('coupure pendant la séance : reprise (`start {resume}` sans `shootout`), les tirs reviennent des états', async ({ page, api, connecter }) => {
    const cnx = await ouvrirMatch(page, api, connecter);
    await lancerMatch(page, api, cnx, { sc: [1, 1] });
    api.coupe.tirsAuBut(cnx, 0);
    api.coupe.etat(cnx, { ph: 'pen', md: ['pen', 1, 3], sc: [1, 1], so: [[1, 0], [1]] });
    await expect(bandeTirs(page).getByRole('img', { name: 'Toi : 1 but sur 2 tirs' })).toBeVisible();
    api.coupe.couper(cnx);
    await expect.poll(() => api.coupe.messages('resume').length).toBe(1);
    await repris(page, api);
    // Le tir en cours repart (3 s) : la bande des tirs est là, avec les tirs déjà joués
    await expect(bandeTirs(page).getByRole('img', { name: 'Toi : 1 but sur 2 tirs' })).toBeVisible();
    await expect(bandeTirs(page).getByRole('img', { name: 'Kevin : 1 but sur 1 tir' })).toBeVisible();
    await expect(bandeV2(page)).toHaveCount(0);
    await expect(page.getByText('Score : Toi 1 – 1 Kevin')).toBeAttached();
    expect(api.coupe.messages('leave')).toEqual([]);
  });

  test('joueur du haut (side 1) : ses tirs et ceux de Kevin chacun de son côté', async ({ page, api, connecter }) => {
    api.coupe.tournoi.you = 1;
    const cnx = await ouvrirMatch(page, api, connecter);
    await lancerMatch(page, api, cnx, { sc: [1, 1] });
    // Repère du serveur : Kevin (côté 0) a marqué ses deux tirs, ce téléphone (côté 1) en a raté un
    api.coupe.tirsAuBut(cnx, 0);
    api.coupe.etat(cnx, { ph: 'ready', md: undefined, sc: [1, 1], so: [[1, 1], [0]] });
    await expect(bandeTirs(page).getByRole('img', { name: 'Toi : 0 but sur 1 tir' })).toBeVisible();
    await expect(bandeTirs(page).getByRole('img', { name: 'Kevin : 2 buts sur 2 tirs' })).toBeVisible();
  });

  test('fin aux tirs au but : sans revanche ni partage, score des tirs, « Retour au tableau » ramène au tableau', async ({ page, api, connecter }) => {
    await tableauSimule(page);
    const cnx = await ouvrirMatch(page, api, connecter);
    await lancerMatch(page, api, cnx, { sc: [3, 3] });
    api.coupe.tirsAuBut(cnx, 0);
    // Dernier tir arrêté : `pen_end`, état `over` (tirs complets), puis `end`
    cnx.envoyer({ t: 'pen_end', r: 'saved' });
    api.coupe.etat(cnx, { ph: 'over', md: undefined, sc: [3, 3], so: [[1, 1, 1, 1], [1, 1, 1, 0]] });
    cnx.envoyer(FIN_TIRS);
    await expect(page.getByRole('heading', { name: 'Victoire aux tirs au but' })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Quart de finale · contre Kevin')).toBeVisible();
    await expect(page.getByText('3 – 3', { exact: true })).toBeVisible();
    await expect(page.getByText('Tirs au but : 4 – 3')).toBeVisible();
    await expect(page.getByText('Égalité après le but en or : la séance de tirs au but a tout décidé.')).toBeVisible();
    await expect(page.getByText(/^Qualifié/)).toBeVisible();
    // Les points comptent comme tout match
    await expect(page.getByText('+3', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Revanche/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Partager en story' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retour', exact: true })).toHaveCount(0);
    // Signaler et Bloquer restent (App Store 1.2)
    await expect(page.getByRole('button', { name: 'Signaler' })).toBeVisible();
    await page.getByRole('button', { name: 'Retour au tableau' }).click();
    await expect(page).toHaveURL(new RegExp(`${TABLEAU}$`));
    await expect.poll(() => api.coupe.messages('leave').length).toBe(1);
    expect(api.coupe.messages('rematch')).toEqual([]);
  });

  test('finale perdue au but en or : « Finaliste », et une revanche refusée par le serveur ne casse rien', async ({ page, api, connecter }) => {
    api.coupe.tournoi.tour = 'Finale';
    const cnx = await ouvrirMatch(page, api, connecter);
    await lancerMatch(page, api, cnx, { sc: [4, 4] });
    cnx.envoyer({ t: 'end', winner: 1, sc: [4, 5], forfeit: false, cancelled: false, reason: 'golden_goal', tour: true, points: { ranked: true, reason: null, delta: [-1, 3], total: 41, rank: 9, rank_before: 8 } });
    await expect(page.getByRole('heading', { name: 'Défaite au but en or' })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Finale · contre Kevin')).toBeVisible();
    await expect(page.getByText('Finaliste : bravo pour le parcours.')).toBeVisible();
    await expect(page.getByText(/^Tirs au but/)).toHaveCount(0);
    cnx.envoyer({ t: 'error', code: 'rematch_off' });
    await expect(page.getByRole('button', { name: 'Retour au tableau' })).toBeVisible();
  });

  test('abandon en plein match : forfait (jamais « annulé »), éliminé, sans revanche', async ({ page, api, connecter }) => {
    const cnx = await ouvrirMatch(page, api, connecter);
    await lancerMatch(page, api, cnx, { sc: [0, 1] });
    await page.getByRole('button', { name: 'Quitter le match' }).click();
    await expect(page.getByText('Abandonner te fait perdre ce match par forfait : Kevin passe au tour suivant.')).toBeVisible();
    await page.getByRole('button', { name: 'Abandonner' }).click();
    await expect(page.getByRole('heading', { name: 'Défaite par forfait' })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Tu as abandonné le match.', { exact: true })).toBeVisible();
    await expect(page.getByText('Éliminé du tournoi : merci d’avoir joué.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Revanche/ })).toHaveCount(0);
    expect(api.coupe.messages('leave')).toEqual([{ t: 'leave' }]);
    expect(cnx.messages.some((m) => m.t === 'leave')).toBe(true);
  });

  test('coupure en plein match : reprise par le lien de la salle (`resume`)', async ({ page, api, connecter }) => {
    const cnx = await ouvrirMatch(page, api, connecter);
    await lancerMatch(page, api, cnx, { sc: [2, 1] });
    api.coupe.retenirReprise = true;
    api.coupe.couper(cnx);
    await expect(page.getByText('Reconnexion…')).toBeVisible();
    await expect.poll(() => api.coupe.messages('resume')[0]).toEqual({ t: 'resume', link: LIEN_TOURNOI });
    api.coupe.libererReprise();
    await repris(page, api);
    await expect(page.getByText('Score : Toi 2 – 1 Kevin')).toBeAttached();
    await expect(page.locator('.cdg-hud-tour')).toHaveText('Quart de finale');
    expect(api.coupe.messages('leave')).toEqual([]);
  });

  test('coupure en plein match, salle sans lien : reprise par un nouveau `tjoin`', async ({ page, api, connecter }) => {
    api.coupe.tournoi.avecLien = false;
    const cnx = await ouvrirMatch(page, api, connecter);
    await lancerMatch(page, api, cnx, { sc: [0, 2] });
    api.coupe.couper(cnx);
    await expect.poll(() => api.coupe.messages('tjoin').length).toBe(2);
    await repris(page, api);
    await expect(page.getByText('Score : Toi 0 – 2 Kevin')).toBeAttached();
    expect(api.coupe.messages('resume')).toEqual([]);
  });

  test('salle d\'attente coupée : un nouveau `tjoin`, la même attente, puis le match', async ({ page, api, connecter }) => {
    const cnx = await ouvrirMatch(page, api, connecter);
    api.coupe.couper(cnx);
    await expect.poll(() => api.coupe.messages('tjoin').length).toBe(2);
    const reprise = api.coupe.derniere();
    expect(reprise).not.toBe(cnx);
    await expect(attente(page)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Coup d’envoi à son arrivée' })).toBeVisible();
    expect(api.coupe.messages('join')).toEqual([]);
    expect(api.coupe.messages('resume')).toEqual([]);
    await lancerMatch(page, api, reprise);
  });

  test('page cachée dans la salle d\'attente : la connexion reste ouverte (présence gardée)', async ({ page, api, connecter }) => {
    const cnx = await ouvrirMatch(page, api, connecter);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    expect(cnx.ferme).toBe(false);
    expect(api.coupe.connexions.length).toBe(1);
  });

  test('aucun défi reçu par-dessus la salle d\'attente d\'un tournoi', async ({ page, api, connecter }) => {
    const cnx = await ouvrirMatch(page, api, connecter);
    cnx.envoyer({ t: 'invite', link: 'n0uv3aud3f1x', from: { name: 'Lucas M.', role: 'user' }, expires_in: 120 });
    await page.waitForTimeout(400);
    await expect(page.getByText(/te défie/)).toHaveCount(0);
    await expect(attente(page)).toBeVisible();
  });

  // Le serveur ferme le match à l'échéance (forfait), mais aussi quand l'admin donne la victoire à
  // l'autre ou annule le tournoi : jamais « tu passes par forfait », le tableau dit le résultat
  test('temps écoulé dans la salle d\'attente, puis salle fermée par le serveur : texte neutre, retour au tableau', async ({ page, api, connecter }) => {
    await tableauSimule(page);
    api.coupe.tournoi.forfaitDans = 1500;
    const cnx = await ouvrirMatch(page, api, connecter);
    await expect(page.getByRole('timer')).toHaveText('Temps écoulé : le résultat arrive.', { timeout: 5000 });
    api.coupe.fermerTournoi(cnx, 't_closed');
    await expect(page.getByRole('alert')).toHaveText(TERMINE);
    await expect(page.getByText(/forfait/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Retour au tableau' }).click();
    await expect(page).toHaveURL(new RegExp(`${TABLEAU}$`));
  });

  test('match fermé par l\'admin avant l\'échéance (victoire donnée à l\'autre, tournoi annulé) : le même texte neutre', async ({ page, api, connecter }) => {
    const cnx = await ouvrirMatch(page, api, connecter);
    api.coupe.fermerTournoi(cnx, 't_closed');
    await expect(page.getByRole('alert')).toHaveText(TERMINE);
    await expect(page.getByText(/forfait/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retour au tableau' })).toBeVisible();
  });

  test('échéance du forfait déjà passée à l\'ouverture : `tjoin` → `t_closed`, texte neutre sans « Réessayer »', async ({ page, api, connecter }) => {
    await tableauSimule(page);
    api.coupe.tournoi.forfaitDans = 0;
    await connecter(CLIENT);
    await page.goto(ADRESSE);
    await expect(page.getByRole('alert')).toHaveText(TERMINE);
    expect(api.coupe.messages('tjoin')).toEqual([{ t: 'tjoin', m: ID_MATCH_TOURNOI }]);
    await expect(attente(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Retour au tableau' }).click();
    await expect(page).toHaveURL(new RegExp(`${TABLEAU}$`));
  });

  test('salle d\'attente coupée, retour après l\'échéance : `tjoin` → `t_closed`, texte neutre', async ({ page, api, connecter }) => {
    api.coupe.tournoi.forfaitDans = 1500;
    const cnx = await ouvrirMatch(page, api, connecter);
    await expect(page.getByRole('timer')).toHaveText('Temps écoulé : le résultat arrive.', { timeout: 5000 });
    api.coupe.couper(cnx);
    await expect.poll(() => api.coupe.messages('tjoin').length).toBe(2);
    await expect(page.getByRole('alert')).toHaveText(TERMINE);
    await expect(page.getByText(/forfait/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
  });

  test('`t_not_ready` : « Ton match n\'est pas encore prêt », `tjoin` relancé tout seul toutes les 3 s sur la même connexion, puis la salle d\'attente', async ({ page, api, connecter }) => {
    api.coupe.tournoi.refus = 't_not_ready';
    api.coupe.tournoi.refusFois = 2;
    await connecter(CLIENT);
    await page.goto(ADRESSE);
    await expect(page.getByRole('alert')).toHaveText(PAS_PRET);
    await expect(page.getByRole('status').filter({ hasText: 'Nouvel essai automatique' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retour au tableau' })).toBeVisible();
    expect(api.coupe.messages('tjoin')).toHaveLength(1);
    // 3 s plus tard : un nouveau `tjoin`, encore refusé
    await page.clock.runFor(3100);
    await expect.poll(() => api.coupe.messages('tjoin').length).toBe(2);
    await expect(page.getByRole('alert')).toHaveText(PAS_PRET);
    // Encore 3 s : le match est prêt, la salle d'attente s'ouvre
    await page.clock.runFor(3100);
    await expect(attente(page)).toHaveText('En attente de Kevin');
    expect(api.coupe.messages('tjoin')).toHaveLength(3);
    // Toujours la même connexion : un seul `auth`
    expect(api.coupe.messages('auth')).toHaveLength(1);
    expect(api.coupe.connexions).toHaveLength(1);
    await expect(page.getByText(PAS_PRET)).toHaveCount(0);
  });

  test('`t_not_ready` qui dure : essais automatiques 30 s au plus, puis « Réessayer » (une seule demande, jamais une nouvelle série)', async ({ page, api, connecter }) => {
    api.coupe.tournoi.refus = 't_not_ready';
    await connecter(CLIENT);
    await page.goto(ADRESSE);
    await expect(page.getByRole('alert')).toHaveText(PAS_PRET);
    const essai = page.getByRole('button', { name: 'Réessayer' });
    for (let i = 0; i < 14 && !(await essai.count()); i += 1) {
      const avant = api.coupe.messages('tjoin').length;
      await page.clock.runFor(3100);
      await expect.poll(async () => api.coupe.messages('tjoin').length > avant || (await essai.count()) > 0).toBe(true);
    }
    await expect(essai).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText(PAS_PRET);
    await expect(page.getByRole('status').filter({ hasText: 'Nouvel essai automatique' })).toHaveCount(0);
    // 30 s : un premier `tjoin` et 9 ou 10 essais automatiques, pas plus
    const essais = api.coupe.messages('tjoin').length;
    expect(essais).toBeGreaterThanOrEqual(9);
    expect(essais).toBeLessThanOrEqual(11);
    // Plus rien ne part tout seul
    await page.clock.runFor(10_000);
    await page.waitForTimeout(300);
    expect(api.coupe.messages('tjoin')).toHaveLength(essais);
    // « Réessayer », toujours pas prêt : l'erreur tout de suite, sans nouvelle série
    await essai.click();
    await expect.poll(() => api.coupe.messages('tjoin').length).toBe(essais + 1);
    await expect(essai).toBeVisible();
    await page.clock.runFor(6200);
    await page.waitForTimeout(300);
    expect(api.coupe.messages('tjoin')).toHaveLength(essais + 1);
    // Le match est prêt : « Réessayer » ouvre la salle d'attente
    api.coupe.tournoi.refus = null;
    await essai.click();
    await expect(attente(page)).toHaveText('En attente de Kevin');
  });

  test('serveur redémarré en plein match : reprise, `t_not_ready`, nouvel essai tout seul, puis la salle d\'attente (le match repart de zéro)', async ({ page, api, connecter }) => {
    const cnx = await ouvrirMatch(page, api, connecter);
    await lancerMatch(page, api, cnx, { sc: [2, 1] });
    api.coupe.tournoi.refus = 't_not_ready';
    api.coupe.tournoi.refusFois = 1;
    api.coupe.redemarrer(cnx);
    // `resume {link}` (salle perdue : `no_room`), puis `tjoin`, pas encore prêt
    await expect.poll(() => api.coupe.messages('resume').length).toBe(1);
    await expect(page.getByRole('alert')).toHaveText(PAS_PRET);
    expect(api.coupe.messages('tjoin')).toHaveLength(2);
    await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
    await page.clock.runFor(3100);
    await expect(attente(page)).toHaveText('En attente de Kevin');
    expect(api.coupe.messages('tjoin')).toHaveLength(3);
    // Le match recommence : 0 – 0
    await lancerMatch(page, api, api.coupe.derniere());
    await expect(page.getByText('Score : Toi 0 – 0 Kevin')).toBeAttached();
    expect(api.coupe.messages('leave')).toEqual([]);
  });

  test('forfait de l\'adversaire pendant les tirs au but : « Victoire par forfait », jamais « aux tirs au but »', async ({ page, api, connecter }) => {
    const cnx = await ouvrirMatch(page, api, connecter);
    await lancerMatch(page, api, cnx, { sc: [3, 3] });
    api.coupe.tirsAuBut(cnx, 0);
    api.coupe.etat(cnx, { ph: 'pen', md: ['pen', 1, 3], sc: [3, 3], so: [[1], []] });
    await expect(bandeTirs(page)).toBeVisible();
    // Kevin parti pendant la séance : `end` porte `so` ET `forfeit`
    cnx.envoyer({ ...FIN_TIRS, so: [1, 0], forfeit: true, reason: 'forfeit' });
    await expect(page.getByRole('heading', { name: 'Victoire par forfait' })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Kevin a quitté le match pendant les tirs au but.', { exact: true })).toBeVisible();
    await expect(page.getByText(/aux tirs au but/i)).toHaveCount(0);
    await expect(page.getByText(/^Tirs au but :/)).toHaveCount(0);
    await expect(page.getByText(/^Qualifié/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retour au tableau' })).toBeVisible();
  });

  test('abandon pendant les tirs au but : « Défaite par forfait », jamais « aux tirs au but »', async ({ page, api, connecter }) => {
    const cnx = await ouvrirMatch(page, api, connecter);
    await lancerMatch(page, api, cnx, { sc: [2, 2] });
    api.coupe.tirsAuBut(cnx, 1);
    api.coupe.etat(cnx, { ph: 'pen', md: ['pen', 0, 3], sc: [2, 2], so: [[1], [1]] });
    await expect(bandeTirs(page)).toBeVisible();
    await page.getByRole('button', { name: 'Quitter le match' }).click();
    await page.getByRole('button', { name: 'Abandonner' }).click();
    await expect(page.getByRole('heading', { name: 'Défaite par forfait' })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Tu as abandonné le match pendant les tirs au but.', { exact: true })).toBeVisible();
    await expect(page.getByText(/aux tirs au but/i)).toHaveCount(0);
    await expect(page.getByText(/^Tirs au but :/)).toHaveCount(0);
    await expect(page.getByText('Éliminé du tournoi : merci d’avoir joué.')).toBeVisible();
    // La fin du serveur portait bien les tirs (par côté du serveur : Kevin 1, moi 1) et le forfait
    expect(cnx.envoyes.find((m) => m.t === 'end')).toMatchObject({ forfeit: true, tour: true, so: [1, 1], winner: 1 });
  });

  test('adversaire de la salle d\'attente : serveur sans `tour.opp` (plus ancien), rien de lu par la page : « ton adversaire »', async ({ page, api, connecter }) => {
    api.coupe.tournoi.opp = null;
    await ouvrirMatch(page, api, connecter);
    await expect(attente(page)).toHaveText('En attente de ton adversaire');
    await expect(page.getByRole('timer')).toHaveText(/^Sans ton adversaire dans 1:4\d, tu gagnes par forfait\.$/);
  });

  for (const [oppServeur, attendu] of [[null, 'Dom'], ['Kevin', 'Kevin']]) {
    test(`« Jouer mon match » du tableau, \`tour.opp\` ${oppServeur ? 'du serveur' : 'absent'} : « En attente de ${attendu} »`, async ({ page, api, connecter }) => {
      // Le tableau déjà lu (cache de la page) donne Dom ; le serveur de jeu, s'il le dit, passe avant
      const t = api.tournois.creer({ etat: 'tableau', moi: CLIENT });
      const mien = api.tournois.match(t.id, CLIENT);
      api.coupe.tournoi.match = mien.id;
      api.coupe.tournoi.opp = oppServeur;
      await connecter(CLIENT);
      await page.goto(`/coupe/tournoi/${t.id}`);
      await page.getByRole('article', { name: 'Ton match : Quart 4' }).getByRole('button', { name: 'Jouer mon match' }).click();
      await expect(attente(page)).toHaveText(`En attente de ${attendu}`);
      await expect(page.getByRole('timer')).toContainText(`Sans ${attendu} dans`);
      expect(api.coupe.messages('tjoin')).toEqual([{ t: 'tjoin', m: mien.id }]);
    });
  }

  for (const [code, texte, reessayer] of [
    ['t_not_found', 'Ce match n\'est plus disponible', false],
    ['t_not_player', 'Tu ne joues pas ce match : regarde le tableau', false],
    ['t_closed', 'Ce match est terminé : le résultat est sur le tableau', false],
    ['server_error', 'Erreur du serveur de jeu', true],
    ['room_expired', 'Temps écoulé : regarde le tableau pour la suite', false],
    ['rate_limited', 'Trop d\'essais : attends quelques minutes avant de recommencer', false],
  ]) {
    test(`refus \`${code}\` : « ${texte} », retour au tableau`, async ({ page, api, connecter }) => {
      await tableauSimule(page);
      api.coupe.tournoi.refus = code;
      await connecter(CLIENT);
      await page.goto(ADRESSE);
      await expect(page.getByRole('alert')).toHaveText(texte);
      await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(reessayer ? 1 : 0);
      if (reessayer) {
        // Le tableau a avancé : le match est prêt, on réessaie
        api.coupe.tournoi.refus = null;
        await page.getByRole('button', { name: 'Réessayer' }).click();
        await expect(attente(page)).toBeVisible();
        expect(api.coupe.messages('tjoin')).toHaveLength(2);
        return;
      }
      await page.getByRole('button', { name: 'Retour au tableau' }).click();
      await expect(page).toHaveURL(new RegExp(`${TABLEAU}$`));
    });
  }

  test('match d\'un autre tableau (id inconnu du serveur) : « Ce match n\'est plus disponible »', async ({ page, api, connecter }) => {
    api.coupe.tournoi.match = '00000000-0000-4000-8000-000000000000';
    await connecter(CLIENT);
    await page.goto(ADRESSE);
    await expect(page.getByRole('alert')).toHaveText('Ce match n\'est plus disponible');
  });

  test('serveur de jeu d\'avant le protocole v3 : « Mets l\'app à jour pour jouer en ligne », comme aujourd\'hui', async ({ page, api, connecter }) => {
    api.coupe.versions = [2];
    await connecter(CLIENT);
    await page.goto(ADRESSE);
    await expect(page.getByRole('alert')).toHaveText('Mets l\'app à jour pour jouer en ligne');
    // Repli en v2 une seule fois, puis `tjoin` refusé (v ≥ 3 exigée)
    expect(api.coupe.messages('auth').map((m) => m.v)).toEqual([3, 2]);
    await expect(page.getByRole('button', { name: 'Retour au tableau' })).toBeVisible();
  });
});

test.describe('La Coupe du Gang : match de tournoi, petits écrans', () => {
  for (const largeur of [320, 390]) {
    test(`${largeur} px : salle d'attente, tirs au but et fin sans défilement horizontal, bande des tirs lisible`, async ({ page, api, connecter }) => {
      await page.setViewportSize({ width: largeur, height: largeur === 320 ? 568 : 844 });
      const cnx = await ouvrirMatch(page, api, connecter);
      await attendreSansDebordement(page, 'la salle d\'attente du tournoi');
      await lancerMatch(page, api, cnx, { sc: [3, 3] });
      api.coupe.tirsAuBut(cnx, 1);
      api.coupe.etat(cnx, { ph: 'pen', md: ['pen', 1, 3], sc: [3, 3], so: [[1, 0, 1], [1, 1, 0]] });
      await expect(bandeTirs(page)).toBeVisible();
      await expect(bandeTirs(page).getByText('Garde ta ligne · 3 s', { exact: true })).toBeVisible();
      // Rien de coupé dans la bande : « Tirs au but », la ligne du tireur, les noms
      const coupes = await bandeTirs(page).locator('.cdg-v2-chip > span, .cdg-v2-line, .cdg-so-name').evaluateAll(
        (l) => l.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
      );
      expect(coupes).toEqual([]);
      await expect(bandeTirs(page)).toHaveCSS('height', '47px');
      await attendreSansDebordement(page, 'les tirs au but');
      cnx.envoyer({ ...FIN_TIRS, winner: 1, so: [3, 4], points: { ...FIN_TIRS.points, delta: [-1, 3] } });
      await expect(page.getByRole('heading', { name: 'Défaite aux tirs au but' })).toBeVisible({ timeout: 8000 });
      await expect(page.getByRole('button', { name: 'Retour au tableau' })).toBeVisible();
      await attendreSansDebordement(page, 'la fin du match de tournoi');
    });
  }
});

test.describe('La Coupe du Gang : match de tournoi, aides de l\'écran', () => {
  test('adversaire de la salle d\'attente : celui de la page, sinon le tournoi déjà lu (`me.match`, puis `rounds`)', () => {
    const cache = (donnees) => ({ getQueriesData: () => donnees.map((d, i) => [['coupe', 'tournaments', i], d]) });
    const action = { t: 'tournament', matchId: 'm-1', tournamentId: 't-1' };
    expect(tournamentOpponent(cache([]), { ...action, opponent: { name: 'Romain', role: 'barber' } })).toEqual({ name: 'Romain', role: 'barber' });
    const parMoi = { id: 't-1', me: { match: { id: 'm-1', side: 1, p: [{ name: 'Lucas M.', role: 'user' }, { name: 'Moi', role: 'user', me: true }] } } };
    expect(tournamentOpponent(cache([{ items: [] }, parMoi]), action)).toEqual({ name: 'Lucas M.', role: 'user' });
    const parTableau = { id: 't-1', me: { match: null }, rounds: [{ round: 1, matches: [{ id: 'm-1', p: [{ name: 'Moi', me: true }, { name: 'Kevin', role: 'barber', me: false }] }] }] };
    expect(tournamentOpponent(cache([parTableau]), action)).toEqual({ name: 'Kevin', role: 'barber' });
    expect(tournamentOpponent(cache([parTableau]), { ...action, matchId: 'm-2' })).toBe(null);
    expect(tournamentOpponent({ getQueriesData: () => { throw new Error('cache'); } }, action)).toBe(null);
  });

  test('pastilles des tirs au but : 3 tours, tir en cours, mort subite sur les 4 derniers tours', () => {
    expect(shootoutPips([[], []], 0)).toEqual([['next', 'todo', 'todo'], ['todo', 'todo', 'todo']]);
    expect(shootoutPips([[1], [0]], null)).toEqual([['goal', 'todo', 'todo'], ['miss', 'todo', 'todo']]);
    expect(shootoutPips([[1, 1, 0], [0, 1, 1]], 0)).toEqual([['goal', 'goal', 'miss', 'next'], ['miss', 'goal', 'goal', 'todo']]);
    expect(shootoutPips([[1, 1, 0, 1, 0], [0, 1, 1, 1]], 1)).toEqual([['goal', 'miss', 'goal', 'miss'], ['goal', 'goal', 'goal', 'next']]);
    expect(shotLabel([[1], []], 1)).toBe('Tir 1 sur 3');
    expect(shotLabel([[1, 0, 1], [1, 1, 0]], 0)).toBe('Mort subite');
  });
});
