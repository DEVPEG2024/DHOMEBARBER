// La Coupe du Gang : règlement v2 (31 oct. 2026, contrat docs/fonctions/coupe-du-gang-regles-v2-contrat.md,
// sections 6, 8 et 9) dans l'écran de jeu. En ligne avec le faux serveur de jeu (`api.coupe.regles = 2`
// avant le coup d'envoi : `start` porte `rules: 2, gw: 5`, puis les messages du protocole v3 poussés
// par le test) : les 5 pastilles de buts, le bandeau d'un événement, une faute et les
// avertissements, un penalty et son compte, un but à 2, le but en or et la fin `golden_goal` ; un
// adversaire sans `rules` (app publiée) garde l'écran d'aujourd'hui. Hors ligne contre le salon :
// 5 pastilles avec `features.coupeRulesV2`, l'écran d'aujourd'hui (premier à 3) sans. Le volet
// « Règles du match » de l'accueil. 320 et 390 px sans défilement horizontal, aucune erreur dans
// la console.
import { test, expect } from './support/test.js';
import { ADMIN, CLIENT } from './support/donnees.js';
import { CODE_MATCH } from './support/fauxCoupe.js';
import { attendreSansDebordement } from './support/outils.js';

const jeu = (page) => page.getByRole('dialog', { name: 'La Coupe du Gang' });
const bande = (page) => page.getByRole('group', { name: 'Buts et avertissements' });
const bandeau = (page) => page.locator('.cdg-banner');

/**
 * Bandeaux (un à la fois, ~1,4 s) notés dans l'ordre de leur apparition par un observateur posé
 * avant le chargement : titre et lignes (les derniers : deux événements à la même heure se fondent
 * dans le même bandeau), place (`pos`), sorte, et combien il y en a eu à l'écran en même temps au
 * plus (`ensemble`, toujours 1). Une machine lente ne fait donc jamais rater un bandeau reparti.
 */
async function noterBandeaux(page) {
  await page.addInitScript(() => {
    window.__bandeaux = [];
    const notes = new WeakMap();
    new MutationObserver(() => {
      const tous = document.querySelectorAll('.cdg-banner');
      for (const b of tous) {
        let n = notes.get(b);
        if (!n) {
          n = { sorte: b.dataset.kind, pos: b.dataset.pos, textes: [], ensemble: 0 };
          notes.set(b, n);
          window.__bandeaux.push(n);
        }
        n.textes = [...b.children].map((c) => c.textContent);
        n.ensemble = Math.max(n.ensemble, tous.length);
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}
const bandeauxVus = (page) => page.evaluate(() => window.__bandeaux);
/** Attend qu'un bandeau soit passé : `textes` = [titre, lignes…], seul à l'écran. */
const attendreBandeau = (page, textes, autres = {}) => expect.poll(() => bandeauxVus(page))
  .toContainEqual(expect.objectContaining({ textes, ensemble: 1, ...autres }));

/** Pastilles de buts d'un joueur (« Toi : 2 buts sur 5 »). */
const buts = (page, texte) => bande(page).getByRole('img', { name: texte });

/** Fin d'un match gagné par ce téléphone (side 0) au but en or, points classés. */
const FIN_BUT_EN_OR = {
  t: 'end', winner: 0, sc: [4, 3], forfeit: false, cancelled: false, reason: 'golden_goal',
  points: { ranked: true, reason: null, delta: [3, -1], total: 45, rank: 6, rank_before: 8 },
};

/** Admin sur l'écran d'essai : « Créer un match », Kevin arrive (side 0), règlement v2 ou non. */
async function matchEnLigne(page, api, connecter, { regles = 2 } = {}) {
  await noterBandeaux(page);
  await connecter(ADMIN);
  await page.goto('/coupe-test');
  await page.getByRole('button', { name: /^Créer un match/ }).click();
  await expect(page.getByText(CODE_MATCH)).toBeVisible();
  if (regles) api.coupe.regles = regles;
  api.coupe.rejoint();
  await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
  const cnx = api.coupe.derniere();
  api.coupe.etat(cnx, { ph: 'live', sc: [0, 0] });
  await expect(jeu(page)).toHaveAttribute('data-play', '1');
  return cnx;
}

/** Heure du faux serveur pour cette connexion (ms) : base des événements envoyés. */
const heure = (api, cnx) => api.coupe.heure(cnx);

test.describe('La Coupe du Gang : règlement v2 en ligne', () => {
  test('5 pastilles de buts par joueur, 3 avertissements, jauge du prochain événement ; le score remplit les pastilles', async ({ page, api, connecter, journal }) => {
    const cnx = await matchEnLigne(page, api, connecter);
    await expect(bande(page)).toBeVisible();
    await expect(bande(page).locator('.cdg-v2-pip')).toHaveCount(10);
    await expect(bande(page).locator('.cdg-v2-dot')).toHaveCount(6);
    await expect(buts(page, 'Toi : 0 but sur 5')).toBeVisible();
    await expect(buts(page, 'Kevin : 0 but sur 5')).toBeVisible();

    // Prochain événement dans 15 s sur 30 : la jauge à moitié
    api.coupe.etat(cnx, { ph: 'live', sc: [2, 1], ne: [15, 30], w: [0, 0], cp: [0, 0], pk: [0, 0] });
    await expect(buts(page, 'Toi : 2 buts sur 5')).toBeVisible();
    await expect(buts(page, 'Kevin : 1 but sur 5')).toBeVisible();
    await expect(bande(page).locator('.cdg-v2-pip.cdg-on.cdg-me')).toHaveCount(2);
    await expect(bande(page).locator('.cdg-v2-pip.cdg-on.cdg-rival')).toHaveCount(1);
    await expect(page.getByText('Prochain événement')).toBeVisible();
    await expect.poll(() => page.locator('.cdg-v2-fill').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a))
      .toBeGreaterThan(0.3);
    expect(journal.console).toEqual([]);
  });

  test('un événement annoncé : son nom en bandeau, lu par les lecteurs d\'écran, et dans la bande', async ({ page, api, connecter }) => {
    const cnx = await matchEnLigne(page, api, connecter);
    const s = heure(api, cnx);
    const e = { k: 'storm', id: 1, an: s, at: s + 1000, until: s + 6000, sd: 7, b: [[180, 200, s + 1500]] };
    cnx.envoyer({ t: 'ev', e });
    const zone = page.locator('.cdg-banner-zone');
    await expect(zone).toHaveAttribute('aria-live', 'polite');
    await expect(zone).toHaveAttribute('aria-atomic', 'true');
    // Jamais dans le canvas : un élément de la page, au milieu du terrain
    await attendreBandeau(page, ['Orage', 'Passe dans un éclair : but à 2'], { sorte: 'event', pos: 'mid' });
    // Événement en cours : son nom à la place de « Prochain événement », au-dessus du temps qui lui reste
    await expect(bande(page).getByText('Orage', { exact: true })).toBeVisible();
    await expect(bande(page).getByText('Prochain événement')).toHaveCount(0);
    // Un seul bandeau, retiré au bout de ~1,4 s
    await expect(bandeau(page)).toHaveCount(0, { timeout: 4000 });
  });

  test('deux événements annoncés à la même heure (orage et arrosage) : un seul bandeau « Orage + Arrosage »', async ({ page, api, connecter }) => {
    const cnx = await matchEnLigne(page, api, connecter);
    const s = heure(api, cnx);
    const temps = { an: s, at: s + 1000, until: s + 6000 };
    cnx.envoyer({ t: 'ev', e: { k: 'storm', id: 4, ...temps, sd: 3, b: [[120, 260, s + 1800]] } });
    cnx.envoyer({ t: 'ev', e: { k: 'water', id: 5, ...temps, sd: 4, s: [[90, 400, 0, 1.2, 120, 0], [270, 240, 3.1, 1.2, 120, 1]] } });
    await attendreBandeau(page, ['Orage + Arrosage', 'Ballon électrique dans l’eau : court‑circuit'], { sorte: 'event', pos: 'mid' });
    // Le bandeau reparti, aucun autre derrière lui (le second, en plein jeu, cachait le ballon)
    await expect(bandeau(page)).toHaveCount(0, { timeout: 5000 });
    expect((await bandeauxVus(page)).map((b) => b.textes[0])).toEqual(['Orage + Arrosage']);
    // Les deux en cours : leurs deux noms au-dessus de la jauge
    await expect(bande(page).getByText('Orage + Arrosage', { exact: true })).toBeVisible();
  });

  test('deux événements à des heures différentes : deux bandeaux, l\'un après l\'autre, jamais l\'un sur l\'autre', async ({ page, api, connecter }) => {
    const cnx = await matchEnLigne(page, api, connecter);
    const s = heure(api, cnx);
    cnx.envoyer({ t: 'ev', e: { k: 'foam', id: 6, an: s, at: s + 1000, until: s + 7000, sd: 2, l: [[120, 300, 40, 25, 0.3], [220, 360, 35, 22, 1.1]] } });
    cnx.envoyer({ t: 'ev', e: { k: 'smoke', id: 7, an: s + 200, at: s + 1200, until: s + 11000, sd: 5, x0: -20, y0: 300, x: 140, y: 280, w: [20, -5] } });
    await expect.poll(async () => (await bandeauxVus(page)).map((b) => b.textes[0]), { timeout: 8000 }).toEqual(['Mousse à raser', 'Fumigène']);
    expect((await bandeauxVus(page)).every((b) => b.ensemble === 1)).toBe(true);
  });

  test('faute et avertissements : AVERTISSEMENT 1/3, pastille d\'or ; camper : FAUTE, penalty, compte 3, 2, 1, arrêt', async ({ page, api, connecter }) => {
    const cnx = await matchEnLigne(page, api, connecter);
    // Ballon gardé 5 s par Kevin (side 1) : avertissement, le ballon change de camp
    cnx.envoyer({ t: 'foul', side: 1, k: 'keep', w: 1, pen: false });
    api.coupe.etat(cnx, { ph: 'ready', w: [0, 1] });
    await attendreBandeau(page, ['Avertissement 1/3', 'Kevin a gardé le ballon 5 s'], { sorte: 'warn' });
    await expect(bande(page).getByRole('img', { name: 'Avertissements, Kevin : 1 sur 3' })).toBeVisible();
    await expect(bande(page).getByRole('img', { name: 'Avertissements, Toi : 0 sur 3' })).toBeVisible();
    await expect(bandeau(page)).toHaveCount(0, { timeout: 4000 });

    // Kevin campe devant son but : penalty pour toi, ballon posé, chacun se place
    cnx.envoyer({ t: 'foul', side: 1, k: 'camp', w: 1, pen: true });
    api.coupe.etat(cnx, { ph: 'pen', md: ['pen', 0, 3], w: [0, 1] });
    // Un seul bandeau pour la faute et son penalty, en bas (le tir part vers la cage du haut)
    await attendreBandeau(page, ['Faute', 'Kevin campait devant son but', 'Penalty pour toi'], { sorte: 'foul', pos: 'low' });
    await expect(bande(page).locator('.cdg-v2-pen')).toHaveText('Penalty3');
    // Le compte est dans la pastille ; la ligne dit seulement qui tire
    await expect(bande(page).getByText('À toi de tirer', { exact: true })).toBeVisible();
    // Astuce du penalty, une fois, après le bandeau de la faute, en bas du terrain (le tir part vers
    // la cage du haut : rien sur le gardien)
    const astuce = page.getByRole('status').filter({ hasText: 'Tire avant 3 s' });
    await expect(astuce).toBeVisible();
    await expect(astuce).toHaveAttribute('data-pos', 'bottom');
    await expect(bandeau(page)).toHaveCount(0);

    // Le tir : 1,4 s restantes → 2
    api.coupe.etat(cnx, { ph: 'live', md: ['pen', 0, 1.4], w: [0, 1] });
    await expect(bande(page).locator('.cdg-v2-pen')).toHaveText('Penalty2');
    await expect(bande(page).getByText('À toi de tirer', { exact: true })).toBeVisible();
    // Arrêté par Kevin
    cnx.envoyer({ t: 'pen_end', r: 'saved' });
    api.coupe.etat(cnx, { ph: 'ready', w: [0, 1], md: undefined });
    await attendreBandeau(page, ['Arrêté !', 'Kevin a arrêté ton tir'], { sorte: 'saved' });
    // Le penalty n'a pas eu de bandeau à lui (déjà dit dans celui de la faute)
    expect((await bandeauxVus(page)).filter((b) => b.sorte === 'penalty')).toEqual([]);
    await expect(bande(page).locator('.cdg-v2-pen')).toHaveCount(0);
  });

  test('but électrique : +2, bandeau BUT ÉLECTRIQUE, pastilles remplies d\'un coup', async ({ page, api, connecter }) => {
    const cnx = await matchEnLigne(page, api, connecter);
    api.coupe.etat(cnx, { ph: 'live', sc: [1, 1] });
    await expect(buts(page, 'Toi : 1 but sur 5')).toBeVisible();
    cnx.envoyer({ t: 'goal', by: 0, sc: [3, 1], v: 2, fx: 2 });
    // Au-dessus de la bannière « BUT ! » du dessin, jamais dessous
    await attendreBandeau(page, ['But électrique', '+2 pour toi'], { sorte: 'elec', pos: 'high' });
    await expect(buts(page, 'Toi : 3 buts sur 5')).toBeVisible();
    await expect(page.getByText('Score : Toi 3 – 1 Kevin')).toBeAttached();
  });

  test('but en or : bandeau, son temps dans la pastille, « Le prochain but gagne », puis « Victoire au but en or »', async ({ page, api, connecter }) => {
    const cnx = await matchEnLigne(page, api, connecter);
    api.coupe.etat(cnx, { ph: 'live', sc: [3, 3] });
    cnx.envoyer({ t: 'gold' });
    api.coupe.etat(cnx, { ph: 'count', md: ['gold', 120], sc: [3, 3] });
    await attendreBandeau(page, ['But en or', 'Le prochain but gagne'], { sorte: 'gold', pos: 'high' });
    await expect(bande(page).locator('.cdg-v2-gold')).toHaveText('But en or2:00');
    await expect(bande(page).getByText('Le prochain but gagne', { exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Tu peux monter chez l’adversaire' })).toBeVisible();

    cnx.envoyer({ t: 'goal', by: 0, sc: [4, 3], v: 1, fx: 0 });
    cnx.envoyer(FIN_BUT_EN_OR);
    await expect(page.getByRole('heading', { name: 'Victoire au but en or' })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Égalité au bout des 5 minutes : le premier but a tout décidé.')).toBeVisible();
    await expect(page.getByText('4 – 3', { exact: true })).toBeVisible();
    // Plus de bande ni de bandeau sur l'écran de fin
    await expect(bande(page)).toHaveCount(0);
    await expect(bandeau(page)).toHaveCount(0);
  });

  test('adversaire sur une app publiée (sans `rules`) : l\'écran d\'aujourd\'hui, rien du règlement v2', async ({ page, api, connecter }) => {
    const cnx = await matchEnLigne(page, api, connecter, { regles: null });
    api.coupe.etat(cnx, { ph: 'live', sc: [1, 0] });
    await expect(page.getByText('Score : Toi 1 – 0 Kevin')).toBeAttached();
    await expect(bande(page)).toHaveCount(0);
    await expect(page.locator('.cdg-banner-zone')).toHaveCount(0);
    await expect(page.getByText('Prochain événement')).toHaveCount(0);
    // Le ballon gardé 5 s garde son astuce d'aujourd'hui
    api.coupe.etat(cnx, { ph: 'ready' });
    await expect(page.getByRole('status').filter({ hasText: 'Ballon gardé 5 s : il change de camp' })).toBeVisible();
  });

  test('joueur du haut (side 1) : ses avertissements sont les siens, ceux de Kevin à droite', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    api.coupe.regles = 2;
    await page.goto('/coupe-test');
    await page.getByLabel('Rejoindre un match').fill(CODE_MATCH);
    await page.getByRole('button', { name: 'Rejoindre', exact: true }).click();
    await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
    const cnx = api.coupe.derniere();
    // Repère du serveur : joueur 0 = Kevin, joueur 1 = toi
    api.coupe.etat(cnx, { ph: 'live', sc: [1, 2], w: [0, 2] });
    await expect(bande(page)).toBeVisible();
    await expect(bande(page).getByRole('img', { name: 'Avertissements, Toi : 2 sur 3' })).toBeVisible();
    await expect(bande(page).getByRole('img', { name: 'Avertissements, Kevin : 0 sur 3' })).toBeVisible();
    await expect(buts(page, 'Toi : 2 buts sur 5')).toBeVisible();
  });

  for (const [largeur, hauteur] of [[390, 844], [320, 640]]) {
    test(`à ${largeur} px, le terrain ne bouge jamais : avant, pendant et après un événement, un penalty et le but en or`, async ({ page, api, connecter }) => {
      await page.setViewportSize({ width: largeur, height: hauteur });
      const cnx = await matchEnLigne(page, api, connecter);
      // Place du canvas et du stade, hauteur de la bande, au dixième de pixel
      const place = () => page.evaluate(() => {
        const r = (sel) => {
          const b = document.querySelector(sel)?.getBoundingClientRect();
          return b ? [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 10) / 10) : null;
        };
        return { canvas: r('.cdg-canvas'), stade: r('.cdg-pic'), bande: r('.cdg-v2')?.[3] ?? null };
      });
      const s = heure(api, cnx);
      const etapes = [
        ['jeu', () => api.coupe.etat(cnx, { ph: 'live', sc: [1, 0], ne: [15, 30] }), () => expect(page.getByText('Prochain événement')).toBeVisible()],
        ['événement', () => cnx.envoyer({ t: 'ev', e: { k: 'storm', id: 1, an: s, at: s + 1000, until: s + 60000, sd: 7, b: [[180, 200, s + 1500]] } }),
          () => expect(bande(page).getByText('Orage', { exact: true })).toBeVisible()],
        ['penalty', () => {
          cnx.envoyer({ t: 'ev_end', id: 1 });
          cnx.envoyer({ t: 'foul', side: 1, k: 'camp', w: 0, pen: true });
          api.coupe.etat(cnx, { ph: 'pen', md: ['pen', 0, 3], sc: [1, 0] });
        }, () => expect(bande(page).locator('.cdg-v2-pen')).toBeVisible()],
        ['tir', () => api.coupe.etat(cnx, { ph: 'live', md: ['pen', 0, 1.5], sc: [1, 0] }), () => expect(bande(page).locator('.cdg-v2-pen')).toHaveText('Penalty2')],
        ['après le penalty', () => {
          cnx.envoyer({ t: 'pen_end', r: 'missed' });
          api.coupe.etat(cnx, { ph: 'ready', md: undefined, sc: [1, 0], ne: [20, 30] });
        }, () => expect(bande(page).locator('.cdg-v2-pen')).toHaveCount(0)],
        ['but en or', () => {
          cnx.envoyer({ t: 'gold' });
          api.coupe.etat(cnx, { ph: 'count', md: ['gold', 120], sc: [1, 1], ne: undefined });
        }, () => expect(bande(page).locator('.cdg-v2-gold')).toBeVisible()],
        ['but en or en jeu', () => api.coupe.etat(cnx, { ph: 'live', md: ['gold', 95], sc: [1, 1] }), () => expect(bande(page).locator('.cdg-v2-gold')).toHaveText('But en or1:35')],
      ];
      const vues = [];
      for (const [nom, agir, attendre] of etapes) {
        agir();
        await attendre();
        vues.push({ nom, ...(await place()) });
      }
      const [ref] = vues;
      expect(ref.bande).toBeGreaterThan(40);
      for (const v of vues) expect({ nom: v.nom, canvas: v.canvas, stade: v.stade, bande: v.bande }).toEqual({ nom: v.nom, canvas: ref.canvas, stade: ref.stade, bande: ref.bande });
    });
  }

  for (const largeur of [320, 390]) {
    test(`écran de match v2 à ${largeur} px : bande et bandeaux sans défilement horizontal`, async ({ page, api, connecter, journal }) => {
      await page.setViewportSize({ width: largeur, height: largeur === 320 ? 640 : 844 });
      const cnx = await matchEnLigne(page, api, connecter);
      api.coupe.etat(cnx, { ph: 'live', sc: [4, 3], w: [2, 1], ne: [10, 30] });
      cnx.envoyer({ t: 'foul', side: 1, k: 'block', w: 1, pen: true });
      api.coupe.etat(cnx, { ph: 'pen', md: ['pen', 0, 3], sc: [4, 3], w: [2, 1] });
      await expect(bandeau(page)).toBeVisible();
      await attendreBandeau(page, ['Faute', 'Kevin bloquait le ballon', 'Penalty pour toi'], { sorte: 'foul' });
      await attendreSansDebordement(page, `l'écran de match à ${largeur} px`);
      // Rien ne dépasse de la bande ni du bandeau
      const deborde = await page.evaluate(() => {
        const out = [];
        const w = document.documentElement.clientWidth;
        for (const el of document.querySelectorAll('.cdg-v2, .cdg-v2 *, .cdg-banner, .cdg-banner *')) {
          const r = el.getBoundingClientRect();
          if (r.width && (r.left < -0.5 || r.right > w + 0.5)) out.push(`${el.className} ${Math.round(r.left)}→${Math.round(r.right)}`);
        }
        return out;
      });
      expect(deborde).toEqual([]);
      // Deuxième rangée : la jauge (ici un événement au nom long) ne passe jamais sur les avertissements
      api.coupe.etat(cnx, { ph: 'live', md: undefined, sc: [4, 3], w: [2, 1], ne: [10, 30] });
      const t = heure(api, cnx);
      cnx.envoyer({ t: 'ev', e: { k: 'goals', id: 9, an: t, at: t + 1000, until: t + 60000, sd: 1, g: [[[0, 0], [8000, 0]], [[0, 0], [8000, 0]]] } });
      await expect(bande(page).getByText('Buts qui bougent', { exact: true })).toBeAttached();
      const chevauche = await page.evaluate(() => {
        const [a, b] = [...document.querySelectorAll('.cdg-v2-low .cdg-v2-warn')].map((el) => el.getBoundingClientRect());
        const g = document.querySelector('.cdg-v2-low .cdg-v2-gauge').getBoundingClientRect();
        const libelle = document.querySelector('.cdg-v2-gauge-label').getBoundingClientRect();
        return { gauche: Math.round(a.right - g.left), droite: Math.round(g.right - b.left), libelle: Math.round(libelle.right - g.right) };
      });
      expect(chevauche.gauche).toBeLessThanOrEqual(0);
      expect(chevauche.droite).toBeLessThanOrEqual(0);
      expect(chevauche.libelle).toBeLessThanOrEqual(0);
      expect(journal.console).toEqual([]);
    });
  }
});

test.describe('La Coupe du Gang : règlement v2 hors ligne', () => {
  test('contre le salon avec le drapeau : premier à 5 buts, 5 pastilles par joueur', async ({ page, connecter, journal }) => {
    await connecter(ADMIN);
    await page.goto('/coupe-test');
    await expect(page.getByText('le premier à 5 buts gagne', { exact: false })).toBeVisible();
    await page.getByRole('radio', { name: 'Apprenti' }).click();
    await page.getByRole('button', { name: 'Jouer contre le salon' }).click();
    await expect(page.getByText('Contre le salon · Apprenti')).toBeAttached();
    await expect(bande(page)).toBeVisible({ timeout: 8000 });
    await expect(bande(page).locator('.cdg-v2-pip')).toHaveCount(10);
    await expect(buts(page, 'Toi : 0 but sur 5')).toBeVisible();
    await expect(buts(page, 'Apprenti : 0 but sur 5')).toBeVisible();
    expect(journal.console).toEqual([]);
  });

  test('sans le drapeau (COUPE_RULES_V2=off) : premier à 3 buts, l\'écran d\'aujourd\'hui', async ({ page, api, connecter }) => {
    api.donnees.parametresPublics.features.coupeRulesV2 = false;
    await connecter(ADMIN);
    await page.goto('/coupe-test');
    await expect(page.getByText('le premier à 3 buts gagne', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Jouer contre le salon' }).click();
    await expect(jeu(page)).toHaveAttribute('data-play', '1', { timeout: 8000 });
    await expect(page.getByText('Contre le salon · Barber')).toBeVisible();
    await expect(bande(page)).toHaveCount(0);
    await expect(page.getByText('Prochain événement')).toHaveCount(0);
  });

  test('lien direct vers une partie, règlement pas encore lu : la partie attend le drapeau puis joue en v2', async ({ page, connecter }) => {
    await connecter(ADMIN);
    await page.goto('/coupe-test?mode=local');
    await expect(page.getByText('À deux sur ce téléphone', { exact: true })).toBeAttached();
    await expect(bande(page)).toBeVisible({ timeout: 8000 });
    await expect(buts(page, 'Bas : 0 but sur 5')).toBeVisible();
    await expect(buts(page, 'Haut : 0 but sur 5')).toBeVisible();
  });

  for (const [drapeau, texte] of [[true, 'Premier à 5 buts'], [false, 'Premier à 3 buts']]) {
    test(`avant-match ${drapeau ? 'avec' : 'sans'} le drapeau : « ${texte} » sur l'affiche`, async ({ page, api, connecter }) => {
      api.donnees.parametresPublics.features.coupeRulesV2 = drapeau;
      await connecter(ADMIN);
      await page.goto('/coupe-test');
      await expect(page.getByText(`le premier à ${drapeau ? 5 : 3} buts gagne`, { exact: false })).toBeVisible();
      // Horloge arrêtée : l'affiche reste le temps de la lire
      const t0 = await page.evaluate(() => Date.now());
      await page.clock.pauseAt(t0 + 500);
      await page.getByRole('button', { name: /^À deux sur ce téléphone/ }).click();
      await page.clock.runFor(200);
      await expect(page.locator('.cdg-vs-rules')).toContainText(texte);
    });
  }
});

test.describe('La Coupe du Gang : règles du match sur l\'accueil', () => {
  test('« Règles du match » ouvre un volet fermé par sa croix (jamais par un tap à côté)', async ({ page, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(page.getByRole('heading', { level: 1, name: 'La Coupe du Gang' })).toBeVisible();
    await page.getByRole('button', { name: 'Règles du match' }).click();
    const volet = page.getByRole('dialog', { name: 'Règles du match' });
    await expect(volet).toBeVisible();
    await expect(volet.getByText('Premier à 5 buts')).toBeVisible();
    for (const titre of ['Balle en feu', 'Balle électrique', 'Fautes et penalty', 'Événements au hasard', 'But en or']) {
      await expect(volet.getByRole('heading', { name: titre })).toBeVisible();
    }
    // Un tap à côté ne ferme pas
    await page.mouse.click(10, 10);
    await expect(volet).toBeVisible();
    await volet.getByRole('button', { name: 'Fermer' }).click();
    await expect(volet).toHaveCount(0);
    // À deux : premier à 5 buts aussi
    await page.getByRole('radio', { name: /À deux/ }).click();
    await expect(page.getByText('Premier à 5 buts', { exact: true })).toBeVisible();
  });

  test('sans le drapeau : ni « Règles du match », ni « 5 buts »', async ({ page, api, connecter }) => {
    api.donnees.parametresPublics.features.coupeRulesV2 = false;
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(page.getByRole('heading', { level: 1, name: 'La Coupe du Gang' })).toBeVisible();
    await page.getByRole('radio', { name: /À deux/ }).click();
    await expect(page.getByText('Premier à 3 buts', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Règles du match' })).toHaveCount(0);
  });

  for (const largeur of [320, 390]) {
    test(`volet des règles à ${largeur} px sans défilement horizontal`, async ({ page, connecter, journal }) => {
      await page.setViewportSize({ width: largeur, height: 700 });
      await connecter(CLIENT);
      await page.goto('/coupe');
      await page.getByRole('button', { name: 'Règles du match' }).click();
      await expect(page.getByRole('dialog', { name: 'Règles du match' })).toBeVisible();
      await attendreSansDebordement(page, `le volet des règles à ${largeur} px`);
      expect(journal.console).toEqual([]);
    });
  }
});
