// La Coupe du Gang : les spectateurs côté joueurs et pages existantes (4 nov. 2026, contrat
// docs/fonctions/coupe-spectateurs-contrat.md, sections 1.5, 2 et 4.3).
//  - En jeu (protocole 3, faux serveur de jeu e2e/support/fauxCoupe.js, messages poussés par
//    `envoyer`) : `auth.sp: 1` (protocole 3 seulement, jamais dans le repli en v2) ; la pastille des
//    spectateurs (œil, nombre, « Sur l'écran du salon »), remise à zéro à chaque match et à la reprise
//    après une coupure ; les bulles des réactions (texte de CHEERS, 3 au plus, 1,5 s, en haut à
//    gauche, jamais au centre ni du côté du doigt, jamais sous le chrono des 30 s) ; le terrain ne
//    bouge pas ; rien hors ligne.
//  - Accueil de la Coupe : « En direct » (`GET /coupe/live`, e2e/support/fauxDirect.js) présente,
//    absente, en panne, relue toutes les 15 s page visible, deux cartes puis « Voir les N matchs en
//    direct », match de tournoi nommé par `tour.title` (repli : `tour.label`) ; « Laisser regarder mes matchs »
//    (lecture, écriture, erreur) pour un client, un barber, l'admin, un compte exclu.
//  - Tournois : « Regarder » sur les matchs en cours du tableau (sauf le sien), la mention des
//    spectateurs à l'inscription et pendant la présence.
//  - Drapeau `features.coupeSpectators` faux : rien de tout ça, aucune lecture de `/coupe/live`.
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { ADMIN, CLIENT, MOT_DE_PASSE } from './support/donnees.js';
import { CODE_MATCH } from './support/fauxCoupe.js';
import {
  ID_DIRECT_ORDINAIRE, ID_DIRECT_TOURNOI, ID_DIRECT_TOURNOI_2, ID_TOURNOI_DIRECT, matchOrdinaire, matchTournoi,
} from './support/fauxDirect.js';
import { MAINTENANT } from './support/temps.js';
import { attendreSansDebordement, toast } from './support/outils.js';

const jeu = (page) => page.getByRole('dialog', { name: 'La Coupe du Gang' });
const terrain = (page) => page.getByRole('img', { name: /Terrain de foot/ });
const pastille = (page) => page.locator('.cdg-watch');
const bulles = (page) => page.locator('.cdg-cheer');
const direct = (page) => page.getByRole('region', { name: 'En direct' });
const reglage = (page) => page.getByRole('switch', { name: 'Laisser regarder mes matchs' });
const TEXTE_REGLAGE = 'Sur les téléphones et l’écran du salon. Les matchs de tournoi sont toujours ouverts aux spectateurs.';
const MENTION = 'Les matchs du tournoi sont ouverts aux spectateurs et peuvent passer sur l’écran du salon.';
const titre = (page, nom) => page.getByRole('heading', { level: 1, name: nom });

/** Compte barber de Kevin (fiche `emp-kevin`). */
const KEVIN = {
  id: 'user-kevin', email: 'kevin.jeu@dhomebarber.fr', full_name: 'Kevin Barber', phone: '',
  role: 'barber', employee_id: 'emp-kevin',
};

/** Fin d'un match gagné par ce téléphone (side 1), points classés. */
const FIN = {
  t: 'end', winner: 1, sc: [1, 3], forfeit: false, cancelled: false, reason: null,
  points: { ranked: true, reason: null, delta: [-1, 3], total: 45, rank: 6, rank_before: 8 },
};

/** Page cachée ou revenue au premier plan, comme le navigateur le signale. */
async function cacherPage(page, cachee) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, cachee);
}

/** Client sur l'accueil de la Coupe, match rejoint avec le code (side 1 contre Kevin), en jeu. */
async function matchEnLigne(page, api, connecter, { regles = 1 } = {}) {
  await connecter(CLIENT);
  await page.goto('/coupe');
  await expect(page.getByRole('heading', { name: 'Comment tu joues ?' })).toBeVisible();
  await page.getByRole('tab', { name: /^Un ami/ }).click();
  await page.getByLabel('Ton ami t\'a donné un code').fill(CODE_MATCH);
  if (regles === 2) api.coupe.regles = 2;
  await page.getByRole('button', { name: 'Rejoindre', exact: true }).click();
  await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
  const cnx = api.coupe.derniere();
  api.coupe.etat(cnx, { ph: 'live', sc: [0, 0] });
  await expect(jeu(page)).toHaveAttribute('data-play', '1');
  return cnx;
}

const boite = (loc) => loc.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
});

/**
 * Surveille chaque image (requestAnimationFrame) jusqu'à `finSurveillance` : une bulle des
 * spectateurs sur le chrono des 30 s ou sur une autre bulle (`chevauchements`), et les bulles
 * présentes à la première image du chrono (`auChrono` : texte, haut, sous le chrono).
 */
async function surveillerBulles(page) {
  await page.evaluate(() => {
    const suivi = { chevauchements: [], auChrono: null, fin: false };
    window.__bulles = suivi;
    const touche = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const image = () => {
      if (suivi.fin) return;
      const chrono = document.querySelector('.cdg-clock')?.getBoundingClientRect() || null;
      const liste = [...document.querySelectorAll('.cdg-cheer')].map((el) => ({ texte: el.textContent, r: el.getBoundingClientRect() }));
      if (chrono) {
        if (!suivi.auChrono) {
          suivi.auChrono = liste.map((b) => ({ texte: b.texte, haut: Math.round(b.r.top), dessous: b.r.top >= chrono.bottom }));
        }
        for (const b of liste) if (touche(b.r, chrono)) suivi.chevauchements.push(`${b.texte} sur le chrono`);
      }
      for (let i = 0; i < liste.length; i += 1) {
        for (let j = i + 1; j < liste.length; j += 1) {
          if (touche(liste[i].r, liste[j].r)) suivi.chevauchements.push(`${liste[i].texte} sur ${liste[j].texte}`);
        }
      }
      requestAnimationFrame(image);
    };
    requestAnimationFrame(image);
  });
}

const finSurveillance = (page) => page.evaluate(() => {
  window.__bulles.fin = true;
  return window.__bulles;
});

test.describe('Spectateurs : ce que voient les joueurs en jeu', () => {
  test('pastille : rien sans spectateur, l\'œil et le nombre, « Sur l\'écran du salon », remise à zéro au match suivant ; le terrain ne bouge pas', async ({ page, api, connecter, journal }) => {
    const cnx = await matchEnLigne(page, api, connecter);
    await expect(pastille(page)).toHaveCount(0);
    const avant = await boite(terrain(page));
    const barre = await boite(page.locator('.cdg-hud'));

    cnx.envoyer({ t: 'watchers', n: 3, screen: false });
    await expect(pastille(page)).toHaveText('3 spectateurs');
    await expect(pastille(page)).not.toContainText('écran du salon');

    cnx.envoyer({ t: 'watchers', n: 4, screen: true });
    await expect(pastille(page)).toHaveText('4 spectateurs · Sur l’écran du salon');
    cnx.envoyer({ t: 'watchers', n: 1, screen: false });
    await expect(pastille(page)).toHaveText('1 spectateur');
    // Rien ne bouge : ni le terrain, ni la barre du haut (56 px)
    expect(await boite(terrain(page))).toEqual(avant);
    expect(await boite(page.locator('.cdg-hud'))).toEqual(barre);
    expect(barre.h).toBe(56);

    // Un écran annoncé sans spectateur ne s'affiche pas ; plus personne : la pastille disparaît
    cnx.envoyer({ t: 'watchers', n: 0, screen: true });
    await expect(pastille(page)).toHaveCount(0);
    cnx.envoyer({ t: 'watchers', n: 'beaucoup' });
    await expect(pastille(page)).toHaveCount(0);

    // Fin du match puis revanche : le nouveau match repart sans spectateur (le serveur redira le nombre)
    cnx.envoyer({ t: 'watchers', n: 2, screen: true });
    await expect(pastille(page)).toHaveText('2 spectateurs · Sur l’écran du salon');
    cnx.envoyer(FIN);
    await page.getByRole('button', { name: /^Revanche/ }).click();
    await expect.poll(() => api.coupe.messages('rematch').length).toBe(1);
    // `watchers` reçu après la fin (pas en plein match) : ignoré
    cnx.envoyer({ t: 'watchers', n: 9, screen: false });
    api.coupe.depart(cnx);
    api.coupe.etat(cnx, { ph: 'live', sc: [0, 0] });
    await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
    await expect(pastille(page)).toHaveCount(0);
    cnx.envoyer({ t: 'watchers', n: 5, screen: false });
    await expect(pastille(page)).toHaveText('5 spectateurs');
    expect(journal.console).toEqual([]);
  });

  test('`auth.sp: 1` à chaque connexion en protocole 3, reprise comprise (le joueur voit qu\'il est regardé)', async ({ page, api, connecter }) => {
    const cnx = await matchEnLigne(page, api, connecter);
    const [auth] = api.coupe.messages('auth');
    expect(auth).toEqual({ t: 'auth', v: 3, token: expect.any(String), sp: 1 });
    expect(cnx.messages[0]).toBe(auth);
    // Coupure : la nouvelle connexion le redit
    api.coupe.couper(cnx);
    await expect.poll(() => api.coupe.messages('resume').length).toBe(1);
    await expect(page.getByText('Connexion rétablie')).toBeVisible();
    expect(api.coupe.messages('auth')).toEqual([auth, { t: 'auth', v: 3, token: auth.token, sp: 1 }]);
  });

  test('serveur d\'avant le protocole 3 : le repli en v2 envoie l\'`auth` d\'aujourd\'hui, sans `sp`', async ({ page, api, connecter }) => {
    api.coupe.versions = [2];
    await connecter(CLIENT);
    await page.goto('/coupe');
    await page.getByRole('tab', { name: /^Un ami/ }).click();
    await page.getByLabel('Ton ami t\'a donné un code').fill(CODE_MATCH);
    await page.getByRole('button', { name: 'Rejoindre', exact: true }).click();
    await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
    const [v3, v2] = api.coupe.messages('auth');
    expect(v3).toMatchObject({ t: 'auth', v: 3, sp: 1 });
    // Octet pour octet le message des apps publiées
    expect(v2).toEqual({ t: 'auth', v: 2, token: v3.token });
    expect(api.coupe.messages('auth')).toHaveLength(2);
    expect(api.coupe.derniere().version).toBe(2);
  });

  test('reprise après une coupure : le nombre repart de zéro (tous partis pendant la coupure), le serveur le redonne s\'il en reste', async ({ page, api, connecter }) => {
    const cnx = await matchEnLigne(page, api, connecter);
    cnx.envoyer({ t: 'watchers', n: 1, screen: true });
    await expect(pastille(page)).toHaveText('1 spectateur · Sur l’écran du salon');

    // Coupure : le serveur ne renvoie pas `watchers` après son `start` (plus personne ne regarde)
    api.coupe.couper(cnx);
    await expect.poll(() => api.coupe.messages('resume').length).toBe(1);
    await expect(page.getByText('Connexion rétablie')).toBeVisible();
    await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
    await expect(pastille(page)).toHaveCount(0);

    // Deuxième coupure, des spectateurs restés : le compte repart de zéro au `start`, puis le
    // `watchers` qui le suit le redonne
    const reprise = api.coupe.derniere();
    expect(reprise).not.toBe(cnx);
    reprise.envoyer({ t: 'watchers', n: 2, screen: false });
    await expect(pastille(page)).toHaveText('2 spectateurs');
    api.coupe.retenirReprise = true;
    api.coupe.couper(reprise);
    await expect.poll(() => api.coupe.messages('resume').length).toBe(2);
    // Pendant la coupure, le dernier compte reste affiché
    await expect(pastille(page)).toHaveText('2 spectateurs');
    api.coupe.libererReprise();
    await expect(pastille(page)).toHaveCount(0);
    api.coupe.derniere().envoyer({ t: 'watchers', n: 3, screen: false });
    await expect(pastille(page)).toHaveText('3 spectateurs');
  });

  test('chrono des 30 s : une bulle déjà en haut descend sous lui, les suivantes arrivent dessous, jamais l\'une sur l\'autre', async ({ page, api, connecter }) => {
    const cnx = await matchEnLigne(page, api, connecter);
    const chrono = page.locator('.cdg-clock');
    await surveillerBulles(page);

    cnx.envoyer({ t: 'cheer', r: 0 });
    const allez = bulles(page).filter({ hasText: 'Allez !' });
    await expect(allez).toBeVisible();
    const avant = await boite(allez);

    cnx.envoyer({ t: 'time_left', s: 30 });
    await expect(chrono).toBeVisible();
    await expect(chrono).toHaveText(/^(30|29|28) s$/);
    const cadre = await boite(chrono);
    // La bulle du haut était bien sous la place du chrono avant son arrivée
    expect(avant.y).toBeLessThan(cadre.y + cadre.h);
    // Première image du chrono : la bulle est encore là, déjà descendue dessous
    await expect.poll(() => page.evaluate(() => window.__bulles.auChrono)).not.toBeNull();
    const [vue] = (await page.evaluate(() => window.__bulles.auChrono));
    expect(vue).toMatchObject({ texte: 'Allez !', dessous: true });
    expect(vue.haut).toBeGreaterThan(avant.y);

    // Les suivantes, chrono affiché : dessous, chacune sa rangée
    cnx.envoyer({ t: 'cheer', r: 1 });
    cnx.envoyer({ t: 'cheer', r: 2 });
    await expect(bulles(page).filter({ hasText: 'Quel but' })).toBeVisible();
    await expect(bulles(page).filter({ hasText: 'Bravo' })).toBeVisible();
    for (const b of await bulles(page).all()) expect((await boite(b)).y).toBeGreaterThanOrEqual(cadre.y + cadre.h);
    await expect(bulles(page)).toHaveCount(0, { timeout: 3000 });
    cnx.envoyer({ t: 'cheer', r: 3 });
    await expect(bulles(page).filter({ hasText: 'Oh non' })).toBeVisible();
    expect((await boite(bulles(page).first())).y).toBeGreaterThanOrEqual(cadre.y + cadre.h);

    const suivi = await finSurveillance(page);
    expect(suivi.chevauchements).toEqual([]);
  });

  test('salle d\'attente : un compte de spectateurs ou une réaction avant le coup d\'envoi ne s\'affichent pas', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe');
    await page.getByRole('tab', { name: /^Un ami/ }).click();
    await page.getByRole('button', { name: 'Créer un match' }).click();
    await expect(page.getByText(CODE_MATCH)).toBeVisible();
    const cnx = api.coupe.derniere();
    cnx.envoyer({ t: 'watchers', n: 6, screen: true });
    cnx.envoyer({ t: 'cheer', r: 0 });
    api.coupe.rejoint(cnx);
    api.coupe.etat(cnx, { ph: 'live', sc: [0, 0] });
    await expect(jeu(page)).toHaveAttribute('data-play', '1');
    await expect(pastille(page)).toHaveCount(0);
    await expect(bulles(page)).toHaveCount(0);
  });

  test('réactions : le texte de la réaction en bulle, en haut à gauche, 3 au plus, effacée en 1,5 s ; réactions illisibles ignorées', async ({ page, api, connecter }) => {
    const cnx = await matchEnLigne(page, api, connecter);
    const cadre = await boite(terrain(page));

    const t0 = Date.now();
    cnx.envoyer({ t: 'cheer', r: 0 });
    await expect(page.getByText('Allez !', { exact: true })).toBeVisible();
    const b = await boite(bulles(page).first());
    // Jamais au centre du terrain ni du côté du doigt (le bas) : dans le quart en haut à gauche
    expect(b.x + b.w).toBeLessThan(cadre.x + cadre.w / 2);
    expect(b.y + b.h).toBeLessThan(cadre.y + cadre.h / 2);
    expect(b.y).toBeGreaterThanOrEqual(cadre.y);
    // Mouvement réduit (réglage des vérifications) : le texte, sans animation
    expect(await bulles(page).first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none');

    // Trois à la fois au plus : la quatrième est jetée
    cnx.envoyer({ t: 'cheer', r: 1 });
    cnx.envoyer({ t: 'cheer', r: 2 });
    cnx.envoyer({ t: 'cheer', r: 3 });
    await expect(page.getByText('Quel but', { exact: true })).toBeVisible();
    await expect(page.getByText('Bravo', { exact: true })).toBeVisible();
    await expect(bulles(page)).toHaveCount(3);
    await expect(page.getByText('Oh non', { exact: true })).toHaveCount(0);
    // Chacune sa place : jamais l'une sur l'autre
    const places = await bulles(page).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(new Set(places.map((y) => Math.round(y))).size).toBe(3);
    // Le terrain n'a pas bougé
    expect(await boite(terrain(page))).toEqual(cadre);

    // La première s'efface au bout de 1,5 s
    await expect(page.getByText('Allez !', { exact: true })).toHaveCount(0, { timeout: 3000 });
    const duree = Date.now() - t0;
    expect(duree).toBeGreaterThan(1200);
    await expect(bulles(page)).toHaveCount(0, { timeout: 3000 });

    // Place libérée : la suivante passe
    cnx.envoyer({ t: 'cheer', r: 3 });
    await expect(page.getByText('Oh non', { exact: true })).toBeVisible();
    await expect(bulles(page)).toHaveCount(0, { timeout: 3000 });
    // Réactions inconnues ou mal écrites : rien (la réaction lisible envoyée après est seule)
    cnx.envoyer({ t: 'cheer', r: 4 });
    cnx.envoyer({ t: 'cheer', r: '1' });
    cnx.envoyer({ t: 'cheer', r: 1.5 });
    cnx.envoyer({ t: 'cheer' });
    cnx.envoyer({ t: 'cheer', r: 0 });
    await expect(page.getByText('Allez !', { exact: true })).toBeVisible();
    await expect(bulles(page)).toHaveCount(1);
  });

  test('réactions avec les animations : elles montent et s\'effacent en 1,5 s (transform et opacité)', async ({ page, api, connecter }) => {
    const cnx = await matchEnLigne(page, api, connecter);
    // Animations rendues une fois le match lancé (les boutons de l'accueil pulsent sans fin)
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    cnx.envoyer({ t: 'cheer', r: 2 });
    const bulle = bulles(page).first();
    await expect(bulle).toHaveText('Bravo');
    const anim = await bulle.evaluate((el) => {
      const s = getComputedStyle(el);
      return { nom: s.animationName, duree: s.animationDuration };
    });
    expect(anim).toEqual({ nom: 'cdg-cheer-up', duree: '1.5s' });
    // L'animation ne touche qu'à transform et opacity
    const proprietes = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        for (const r of rules) {
          if (r.type === CSSRule.KEYFRAMES_RULE && r.name === 'cdg-cheer-up') {
            return [...new Set([...r.cssRules].flatMap((k) => [...k.style]))].sort();
          }
        }
      }
      return null;
    });
    expect(proprietes).toEqual(['opacity', 'transform']);
  });

  test('règlement v2 : la bande garde sa hauteur, le terrain ne bouge pas avec la pastille et les bulles ; 320 px sans débordement', async ({ page, api, connecter }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const cnx = await matchEnLigne(page, api, connecter, { regles: 2 });
    const bande = page.getByRole('group', { name: 'Buts et avertissements' });
    await expect(bande).toBeVisible();
    const avant = { terrain: await boite(terrain(page)), bande: await boite(page.locator('.cdg-v2')) };

    cnx.envoyer({ t: 'watchers', n: 12, screen: true });
    cnx.envoyer({ t: 'cheer', r: 1 });
    await expect(page.getByText('Quel but', { exact: true })).toBeVisible();
    // À 320 px : le nombre et l'écran du salon écrits, « spectateurs » pour les lecteurs d'écran seulement
    await expect(pastille(page)).toContainText('12');
    await expect(pastille(page)).toContainText('Sur l’écran du salon');
    const p = await boite(pastille(page));
    const quitter = await boite(page.getByRole('button', { name: 'Quitter le match' }));
    const son = await boite(page.getByRole('button', { name: /^(Couper|Activer) le son$/ }));
    expect(p.x).toBeGreaterThanOrEqual(quitter.x + quitter.w);
    expect(p.x + p.w).toBeLessThanOrEqual(son.x);
    expect(await pastille(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);

    expect(await boite(terrain(page))).toEqual(avant.terrain);
    expect(await boite(page.locator('.cdg-v2'))).toEqual(avant.bande);
    expect(avant.bande.h).toBe(47);
    await attendreSansDebordement(page, 'le jeu avec des spectateurs à 320 px');
  });

  test('hors ligne (contre le salon, à deux) : ni pastille ni bulle, aucune connexion au serveur de jeu', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe?mode=bot&level=apprenti');
    await expect(jeu(page)).toBeVisible();
    await expect(page.getByText('Contre le salon · Apprenti')).toBeVisible();
    await expect(pastille(page)).toHaveCount(0);
    await expect(bulles(page)).toHaveCount(0);

    await page.goto('/coupe?mode=local');
    await expect(page.getByText('À deux sur ce téléphone')).toBeVisible();
    await expect(pastille(page)).toHaveCount(0);
    await expect(bulles(page)).toHaveCount(0);
    expect(api.coupe.connexions).toEqual([]);
  });
});

test.describe('Spectateurs : « En direct » sur l\'accueil de la Coupe', () => {
  test('les matchs à regarder sous le tournoi : tournoi d\'abord, noms, score, spectateurs, écran du salon, « Regarder »', async ({ page, api, connecter, journal }) => {
    api.direct.matchs = [matchOrdinaire({ watchers: 2 }), matchTournoi()];
    await connecter(CLIENT);
    await page.goto('/coupe');

    const section = direct(page);
    await expect(section).toBeVisible();
    // Sous les Points, avant « Comment tu joues ? »
    const y = async (loc) => (await loc.boundingBox()).y;
    expect(await y(section)).toBeGreaterThan(await y(page.getByRole('region', { name: /Points de Coupe/ })));
    expect(await y(section)).toBeLessThan(await y(page.getByRole('heading', { name: 'Comment tu joues ?' })));

    const cartes = section.getByRole('article');
    await expect(cartes).toHaveCount(2);
    // Deux matchs : tout est là, rien à déplier
    await expect(section.getByRole('button')).toHaveCount(0);
    const tournoi = cartes.nth(0);
    // `tour.title` du serveur (« Quart 1 »), pas le nom du tour (`label`, « Quart de finale »)
    await expect(tournoi).toHaveAccessibleName('Quart 1 · Coupe de Novembre : Lucas M. contre Dom');
    await expect(tournoi).toContainText('Quart 1 · Coupe de Novembre');
    await expect(tournoi).not.toContainText('Quart de finale');
    await expect(tournoi).toContainText('En direct');
    await expect(tournoi).toContainText('34 spectateurs');
    await expect(tournoi).toContainText('Écran du salon');
    await expect(tournoi).toContainText('Lucas M.3');
    await expect(tournoi).toContainText('Dom2');
    // Pions aux initiales, jamais de photo
    await expect(tournoi.locator('img')).toHaveCount(0);
    await expect(tournoi).toContainText('LM');
    await expect(tournoi.getByRole('img', { name: 'Barber' })).toBeVisible();
    await expect(tournoi.getByRole('link', { name: 'Regarder Lucas M. contre Dom' }))
      .toHaveAttribute('href', `/coupe/regarder?m=${ID_DIRECT_TOURNOI}&tournoi=${ID_TOURNOI_DIRECT}`);

    const ordinaire = cartes.nth(1);
    await expect(ordinaire).toHaveAccessibleName('Match en ligne : D\'Home Barber contre Inès B.');
    await expect(ordinaire).toContainText('2 spectateurs');
    await expect(ordinaire).not.toContainText('Écran du salon');
    await expect(ordinaire).toContainText('DHB');
    await expect(ordinaire.getByRole('img', { name: 'Le salon' })).toBeVisible();
    await expect(ordinaire.getByRole('link', { name: 'Regarder D\'Home Barber contre Inès B.' }))
      .toHaveAttribute('href', `/coupe/regarder?w=${ID_DIRECT_ORDINAIRE}`);
    expect(journal.console).toEqual([]);
  });

  test('serveur d\'avant `tour.title` : le match nommé par le nom du tour', async ({ page, api, connecter }) => {
    api.direct.matchs = [matchTournoi({ tour: { tid: ID_TOURNOI_DIRECT, name: 'Coupe de Novembre', label: 'Quart de finale' } })];
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(direct(page).getByRole('article'))
      .toHaveAccessibleName('Quart de finale · Coupe de Novembre : Lucas M. contre Dom');
  });

  test('plus de deux matchs : deux cartes, puis « Voir les N matchs en direct » qui déplie la suite et la replie ; 320 px', async ({ page, api, connecter }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const avant = (min) => new Date(MAINTENANT.getTime() - min * 60_000).toISOString();
    api.direct.matchs = [
      matchOrdinaire({ id: 'w3y8k2m5p9qb', names: ['Kevin', 'Inès B.'], roles: ['barber', 'user'], started_at: avant(4) }),
      matchOrdinaire(),
      matchTournoi({
        id: ID_DIRECT_TOURNOI_2, names: ['Sofiane R.', 'Romain'], roles: ['user', 'barber'], started_at: avant(3),
        tour: { tid: ID_TOURNOI_DIRECT, name: 'Coupe de Novembre', label: 'Quart de finale', title: 'Quart 2' },
      }),
      matchTournoi(),
    ];
    await connecter(CLIENT);
    await page.goto('/coupe');

    const section = direct(page);
    const cartes = section.getByRole('article');
    const plus = section.getByRole('button', { name: 'Voir les 4 matchs en direct' });
    // Tournoi d'abord : les deux quarts, la suite repliée
    await expect(cartes).toHaveCount(2);
    await expect(cartes.nth(0)).toHaveAccessibleName('Quart 1 · Coupe de Novembre : Lucas M. contre Dom');
    await expect(cartes.nth(1)).toHaveAccessibleName('Quart 2 · Coupe de Novembre : Sofiane R. contre Romain');
    await expect(plus).toHaveAttribute('aria-expanded', 'false');
    const liste = await plus.getAttribute('aria-controls');
    expect(liste).toBeTruthy();
    await expect(section.locator('ul')).toHaveAttribute('id', liste);
    // « 1. Comment tu joues ? » juste sous deux cartes et le bouton : la section n'est pas plus haute
    const titre2 = await boite(section.getByRole('heading', { name: 'En direct' }));
    const c0 = await boite(cartes.nth(0));
    const c1 = await boite(cartes.nth(1));
    const b = await boite(plus);
    const s = await boite(section);
    expect(s.h).toBeLessThanOrEqual(titre2.h + c0.h + c1.h + b.h + 3 * 10 + 2);
    expect((await boite(page.getByRole('heading', { name: 'Comment tu joues ?' }))).y).toBeGreaterThan(b.y + b.h);
    await attendreSansDebordement(page, '« En direct » replié à 320 px');

    await plus.click();
    await expect(cartes).toHaveCount(4);
    const moins = section.getByRole('button', { name: 'Voir moins' });
    await expect(moins).toHaveAttribute('aria-expanded', 'true');
    await expect(cartes.nth(2)).toHaveAccessibleName('Match en ligne : D\'Home Barber contre Inès B.');
    await expect(cartes.nth(3)).toHaveAccessibleName('Match en ligne : Kevin contre Inès B.');
    await expect(cartes.nth(3).getByRole('link', { name: 'Regarder Kevin contre Inès B.' }))
      .toHaveAttribute('href', '/coupe/regarder?w=w3y8k2m5p9qb');
    await attendreSansDebordement(page, '« En direct » déplié à 320 px');

    await moins.click();
    await expect(cartes).toHaveCount(2);
    await expect(plus).toHaveAttribute('aria-expanded', 'false');
    await expect(plus).toBeFocused();
  });

  test('relue toutes les 15 s page visible, jamais page cachée ; disparaît quand le dernier match finit', async ({ page, api, connecter }) => {
    api.direct.matchs = [matchTournoi()];
    await connecter(CLIENT);
    await page.goto('/coupe');
    const carte = direct(page).getByRole('article');
    await expect(carte).toContainText('Lucas M.3');

    api.direct.matchs = [matchTournoi({ sc: [4, 2], watchers: 35 })];
    await page.clock.runFor(15_500);
    await expect(carte).toContainText('Lucas M.4');
    await expect(carte).toContainText('35 spectateurs');

    // Page cachée : plus de relecture
    await cacherPage(page, true);
    const lues = api.direct.lectures;
    await page.clock.runFor(46_000);
    expect(api.direct.lectures).toBe(lues);
    await cacherPage(page, false);

    // Plus de match en direct : la section s'en va, le reste de l'accueil reste
    api.direct.matchs = [];
    await page.clock.runFor(15_500);
    await expect(direct(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Comment tu joues ?' })).toBeVisible();
  });

  test('aucun match en direct : pas de section', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(page.getByRole('heading', { name: 'Comment tu joues ?' })).toBeVisible();
    await expect.poll(() => api.direct.lectures).toBeGreaterThan(0);
    await expect(direct(page)).toHaveCount(0);
    await expect(page.getByText('En direct', { exact: true })).toHaveCount(0);
  });

  test('panne : le bloc d\'erreur dans la section, jamais à la place de l\'accueil ; « Réessayer »', async ({ page, api, connecter }) => {
    api.direct.matchs = [matchTournoi()];
    let panne = true;
    api.surcharger('GET', '/coupe/live', () => (panne ? RESEAU_COUPE : undefined));
    await connecter(CLIENT);
    await page.goto('/coupe');

    const section = direct(page);
    await expect(section.getByRole('alert')).toContainText('Pas de connexion internet');
    await expect(section.getByRole('alert')).toContainText('les matchs en direct');
    // Le reste de l'accueil est là, la Coupe n'est pas « en pause »
    await expect(page.getByRole('region', { name: /Points de Coupe/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Comment tu joues ?' })).toBeVisible();
    await expect(page.getByText('La Coupe fait une pause')).toHaveCount(0);
    await expect(reglage(page)).toBeVisible();

    panne = false;
    await section.getByRole('button', { name: 'Réessayer' }).click();
    await expect(section.getByRole('article')).toHaveCount(1);
    await expect(section.getByRole('alert')).toHaveCount(0);
  });

  test('erreur du serveur : « Impossible de charger les matchs en direct »', async ({ page, api, connecter }) => {
    api.surcharger('GET', '/coupe/live', () => ({ status: 500, json: { error: 'Erreur interne' } }));
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(direct(page).getByRole('alert')).toContainText('Impossible de charger les matchs en direct');
    await expect(page.getByRole('heading', { name: 'Comment tu joues ?' })).toBeVisible();
  });

  test('spectateurs coupés pendant la visite (404 `disabled`) : la section et le réglage s\'en vont, la Coupe reste ouverte', async ({ page, api, connecter }) => {
    api.direct.matchs = [matchTournoi()];
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(direct(page)).toBeVisible();
    await expect(reglage(page)).toBeVisible();

    api.donnees.parametresPublics.features.coupeSpectators = false;
    await page.clock.runFor(15_500);
    await expect(direct(page)).toHaveCount(0);
    await expect(reglage(page)).toHaveCount(0);
    await expect(page.getByText('La Coupe fait une pause')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Comment tu joues ?' })).toBeVisible();
  });

  test('320 px : la section tient sans défilement horizontal', async ({ page, api, connecter }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    api.direct.matchs = [
      matchTournoi({ names: ['Maximilien-Alexandre D.', 'Dom'], tour: { tid: ID_TOURNOI_DIRECT, name: 'Grande Coupe de la Saison', label: 'Demi-finale', title: 'Demie 2' } }),
      matchOrdinaire({ watchers: 50, screen: true }),
    ];
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(direct(page).getByRole('article')).toHaveCount(2);
    await attendreSansDebordement(page, '« En direct » à 320 px');
  });
});

test.describe('Spectateurs : « Laisser regarder mes matchs »', () => {
  test('client : éteint par défaut, le texte du contrat, allumé puis éteint (envoi et relecture)', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(reglage(page)).not.toBeChecked();
    await expect(page.getByText(TEXTE_REGLAGE)).toBeVisible();
    // Dans « Tes réglages », après les autres choix
    await expect(page.getByRole('region', { name: 'Tes réglages' }).getByRole('switch', { name: 'Laisser regarder mes matchs' })).toBeVisible();

    await reglage(page).click();
    await expect(toast(page, 'Tes matchs sont ouverts aux spectateurs')).toBeVisible();
    await expect(reglage(page)).toBeChecked();
    expect(api.requetesVers('PATCH', '/coupe/settings').map((r) => r.corps)).toEqual([{ watch_opt_in: true }]);

    // Relu de /coupe/me
    await page.reload();
    await expect(reglage(page)).toBeChecked();

    await reglage(page).click();
    await expect(toast(page, 'Tes matchs ne sont plus ouverts aux spectateurs, sauf en tournoi')).toBeVisible();
    await expect(reglage(page)).not.toBeChecked();
    expect(api.requetesVers('PATCH', '/coupe/settings').map((r) => r.corps)).toEqual([{ watch_opt_in: true }, { watch_opt_in: false }]);
  });

  test('compte exclu des classements : le classement bloqué, le réglage des spectateurs reste libre', async ({ page, api, connecter }) => {
    api.coupeRest.definirEtat(CLIENT.id, { eligible: true, opt_in: false, saison: [42, 16, 6], total: [97, 37, 14] });
    api.coupeRest.exclus.add(`compte-${CLIENT.id}`);
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(page.getByRole('switch', { name: 'Apparaître dans le classement' })).toBeDisabled();
    await expect(reglage(page)).toBeEnabled();
    await reglage(page).click();
    await expect(reglage(page)).toBeChecked();
    expect(api.requetesVers('PATCH', '/coupe/settings').map((r) => r.corps)).toEqual([{ watch_opt_in: true }]);
  });

  test('admin : le réglage à côté de la ligne « D\'Home Barber »', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    await page.goto('/coupe');
    await expect(page.getByText('La ligne « D\'Home Barber » est toujours au classement.')).toBeVisible();
    await expect(reglage(page)).not.toBeChecked();
    await reglage(page).click();
    await expect(reglage(page)).toBeChecked();
    expect(api.requetesVers('PATCH', '/coupe/settings').map((r) => r.corps)).toEqual([{ watch_opt_in: true }]);
  });

  test('barber : le réglage aussi', async ({ page, api, connecter }) => {
    api.comptes.push({ ...KEVIN, motDePasse: MOT_DE_PASSE, birth_date: null, photo_url: null, created_date: '2026-01-15T10:00:00.000Z' });
    await connecter(KEVIN);
    await page.goto('/coupe');
    await expect(reglage(page)).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Me proposer aux défis' })).toHaveCount(0);
    await reglage(page).click();
    await expect(reglage(page)).toBeChecked();
  });

  test('erreur : le message du serveur, l\'interrupteur revient ; hors connexion : « Pas de connexion »', async ({ page, api, connecter }) => {
    let reponse = { status: 500, json: { error: 'Enregistrement impossible pour le moment' } };
    api.surcharger('PATCH', '/coupe/settings', () => reponse);
    await connecter(CLIENT);
    await page.goto('/coupe');

    await reglage(page).click();
    await expect(toast(page, 'Enregistrement impossible pour le moment')).toBeVisible();
    await expect(reglage(page)).not.toBeChecked();

    reponse = RESEAU_COUPE;
    await reglage(page).click();
    await expect(toast(page, 'Pas de connexion internet : vérifie ton réseau, puis réessaie.')).toBeVisible();
    await expect(reglage(page)).not.toBeChecked();
  });
});

test.describe('Spectateurs : tournois', () => {
  test('tableau : « Regarder » sur chaque match en cours, sauf le sien et ceux qui n\'ont pas commencé', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'tableau', moi: CLIENT });
    const quart1 = api.tournois.direct(t.id, { tour: 1, place: 0 }, { sc: [3, 2], playing: true });
    api.tournois.direct(t.id, CLIENT, { sc: [1, 0], playing: true });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(titre(page, 'Tableau du tournoi')).toBeVisible();

    const carte = page.getByRole('article', { name: 'Quart 1' });
    await expect(carte.getByRole('link', { name: 'Regarder Lucas M. contre Romain' }))
      .toHaveAttribute('href', `/coupe/regarder?m=${quart1.id}&tournoi=${t.id}`);
    // Ton match (en cours) : pas de « Regarder » ; Quart 2 pas commencé : non plus
    await expect(page.getByRole('article', { name: 'Ton match : Quart 4' }).getByRole('link', { name: /^Regarder/ })).toHaveCount(0);
    await expect(page.getByRole('article', { name: 'Quart 2' }).getByRole('link', { name: /^Regarder/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Regarder/ })).toHaveCount(1);

    // Le match finit : plus de « Regarder »
    api.tournois.finir(t.id, { tour: 1, place: 0 });
    await page.clock.runFor(3500);
    await expect(carte).toContainText('Fini');
    await expect(page.getByRole('link', { name: /^Regarder/ })).toHaveCount(0);
  });

  test('inscription et présence : la mention des spectateurs', async ({ page, api, connecter }) => {
    const t = api.tournois.creer({ etat: 'inscriptions' });
    await connecter(CLIENT);
    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(page.getByRole('button', { name: 'S’inscrire' })).toBeVisible();
    await expect(page.getByText(MENTION)).toBeVisible();

    const p = api.tournois.creer({ etat: 'presence', nom: 'Coupe de Décembre' });
    await page.goto(`/coupe/tournoi/${p.id}`);
    await expect(page.getByRole('button', { name: 'S’inscrire' })).toBeVisible();
    await expect(page.getByText(MENTION)).toBeVisible();
  });
});

test.describe('Spectateurs : drapeau éteint', () => {
  test('`features.coupeSpectators` faux : ni « En direct », ni réglage, ni « Regarder », ni mention ; aucune lecture de /coupe/live', async ({ page, api, connecter }) => {
    api.donnees.parametresPublics.features.coupeSpectators = false;
    api.direct.matchs = [matchTournoi()];
    const t = api.tournois.creer({ etat: 'tableau', moi: CLIENT });
    api.tournois.direct(t.id, { tour: 1, place: 0 }, { sc: [3, 2], playing: true });
    const i = api.tournois.creer({ etat: 'inscriptions', nom: 'Coupe de Décembre' });
    await connecter(CLIENT);

    await page.goto('/coupe');
    await expect(page.getByRole('heading', { name: 'Comment tu joues ?' })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Apparaître dans le classement' })).toBeVisible();
    await expect(direct(page)).toHaveCount(0);
    await expect(reglage(page)).toHaveCount(0);

    await page.goto(`/coupe/tournoi/${t.id}`);
    await expect(page.getByRole('article', { name: 'Quart 1' })).toContainText('En direct');
    await expect(page.getByRole('link', { name: /^Regarder/ })).toHaveCount(0);

    await page.goto(`/coupe/tournoi/${i.id}`);
    await expect(page.getByRole('button', { name: 'S’inscrire' })).toBeVisible();
    await expect(page.getByText(MENTION)).toHaveCount(0);

    expect(api.requetesVers('GET', '/coupe/live')).toEqual([]);
  });
});
