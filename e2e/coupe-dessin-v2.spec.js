// La Coupe du Gang : dessin et son du règlement v2 dans le vrai écran de jeu (31 oct. 2026,
// docs/fonctions/coupe-du-gang-regles-v2-contrat.md, section 7 ; src/lib/coupe/effects.js,
// renderer.js, sound.js). La contre-expertise du 31 oct. avait cassé la couverture de la cage
// peinte, levé une erreur dans le dessin de la mousse, du gel et du fumigène, et fait sonner un
// bruitage son coupé ou deux fois : aucun test ne le voyait. Ici, en ligne avec le faux serveur de
// jeu (`api.coupe.regles = 2`, `etat`, `envoyer`, `evenements`) :
//  - les six événements à la fois et des ballons en feu, électrique et en l'air, en mouvement réduit
//    et non réduit : toute erreur de la page fait échouer le test (fixture `page`), et la mousse et
//    la fumée se voient dans le canvas ;
//  - cages qui bougent : une seule cage à chaque bout, lue dans les pixels de l'écran (image du stade
//    et canvas ensemble) ;
//  - son coupé : aucun nœud audio créé, quoi qu'il arrive ; son allumé : un bruitage crée un seul jeu
//    de nœuds (but en or : 6 notes ; annonce de l'orage : 2 bruits).
import { test, expect } from './support/test.js';
import { ADMIN } from './support/donnees.js';
import { CODE_MATCH } from './support/fauxCoupe.js';
import { MS, MG, VW, VH } from '../src/lib/coupe/renderer.js';
import { W, H, GL, GR, makeEvent, rng } from '../src/lib/coupe/engine.js';

const jeu = (page) => page.getByRole('dialog', { name: 'La Coupe du Gang' });
const VUE = { VW, VH, MS, MG };

/** Admin sur l'écran d'essai : « Créer un match », Kevin arrive (side 0), règlement v2, en jeu. */
async function matchEnLigne(page, api, connecter) {
  await connecter(ADMIN);
  await page.goto('/coupe-test');
  await page.getByRole('button', { name: /^Créer un match/ }).click();
  await expect(page.getByText(CODE_MATCH)).toBeVisible();
  api.coupe.regles = 2;
  api.coupe.rejoint();
  await expect(page.getByText('En ligne', { exact: true })).toBeVisible();
  const cnx = api.coupe.derniere();
  api.coupe.etat(cnx, { ph: 'live', sc: [0, 0] });
  await expect(jeu(page)).toHaveAttribute('data-play', '1');
  return cnx;
}

/** Heure du faux serveur (ms) : base des événements envoyés. */
const heure = (api, cnx) => api.coupe.heure(cnx);
/** Attend que l'heure du faux serveur passe `t` (ms). */
const attendreHeure = (api, cnx, t) => expect.poll(() => heure(api, cnx), { timeout: 20_000 }).toBeGreaterThan(t);

/**
 * Part des pixels du canvas, dans le carré de demi-côté `r` (unités du terrain) autour de (x, y),
 * qui passent `teste` ('blanc' : bulle de mousse ; 'rouge' : fumée rouge).
 */
function partDuCanvas(page, x, y, r, teste) {
  return page.locator('.cdg-canvas').evaluate((c, { x, y, r, teste, g }) => {
    const box = c.getBoundingClientRect();
    const k = c.width / box.width;
    const s = Math.min(box.width / g.VW, box.height / g.VH);
    const ox = (box.width - g.VW * s) / 2;
    const oy = (box.height - g.VH * s) / 2;
    const x0 = Math.round((ox + (x - r + g.MS) * s) * k);
    const y0 = Math.round((oy + (y - r + g.MG) * s) * k);
    const n = Math.max(1, Math.round(2 * r * s * k));
    const d = c.getContext('2d').getImageData(x0, y0, n, n).data;
    let oui = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [rr, gg, bb, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      if (teste === 'blanc' ? a > 150 && Math.min(rr, gg, bb) > 185 : a > 80 && rr > 140 && gg < 110 && bb < 110) oui += 1;
    }
    return oui / (d.length / 4);
  }, { x, y, r, teste, g: VUE });
}

/**
 * Luminosité (0 à 255) de l'écran aux points du terrain donnés : la plus forte d'un carré de 3 px,
 * lue dans une capture (image du stade sous le canvas, et canvas : ce que voit le joueur).
 */
async function luminosites(page, points) {
  const box = await page.locator('.cdg-canvas').boundingBox();
  const png = await page.screenshot({ clip: box });
  return page.evaluate(async ({ b64, pts, g, w, h }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const k = img.width / w;
    const s = Math.min(w / g.VW, h / g.VH);
    const ox = (w - g.VW * s) / 2;
    const oy = (h - g.VH * s) / 2;
    return pts.map(([wx, wy]) => {
      const px = Math.round((ox + (wx + g.MS) * s) * k);
      const py = Math.round((oy + (wy + g.MG) * s) * k);
      const d = x.getImageData(px - 1, py - 1, 3, 3).data;
      let best = 0;
      for (let i = 0; i < d.length; i += 4) best = Math.max(best, (d[i] + d[i + 1] + d[i + 2]) / 3);
      return Math.round(best);
    });
  }, { b64: png.toString('base64'), pts: points, g: VUE, w: box.width, h: box.height });
}

/** Compte les nœuds audio créés par la page (oscillateurs et sources), et garde ses contextes. */
async function compterNoeuds(page) {
  await page.addInitScript(() => {
    window.__noeuds = 0;
    window.__contextes = [];
    for (const m of ['createOscillator', 'createBufferSource']) {
      const avant = BaseAudioContext.prototype[m];
      BaseAudioContext.prototype[m] = function compte(...args) {
        window.__noeuds += 1;
        return avant.apply(this, args);
      };
    }
    const Ctx = window.AudioContext;
    window.AudioContext = class extends Ctx {
      constructor(...args) {
        super(...args);
        window.__contextes.push(this);
      }
    };
  });
}
const noeuds = (page) => page.evaluate(() => window.__noeuds);

for (const mouvement of ['no-preference', 'reduce']) {
  test.describe(`La Coupe du Gang : dessin du règlement v2 (mouvement ${mouvement === 'reduce' ? 'réduit' : 'non réduit'})`, () => {
    test.use({ reducedMotion: mouvement });

    test('les six événements à la fois, ballons en feu, électrique et en l\'air : dessinés sans erreur, mousse et fumée visibles', async ({ page, api, connecter, journal }) => {
      test.setTimeout(60_000);
      const cnx = await matchEnLigne(page, api, connecter);
      await expect(jeu(page)).toHaveAttribute('data-stadium', 'on');
      const s = heure(api, cnx);
      const pads = [{ x: W / 2, y: H - 100 }, { x: W / 2, y: 100 }];
      const evs = ['foam', 'gel', 'storm', 'goals', 'water', 'smoke'].map((k, i) => makeEvent(k, i + 1, s, rng(31 + i), pads));
      api.coupe.evenements(cnx, evs);
      const [mousse, , orage, , , fumee] = evs;

      // En jeu : bulles de mousse et fumée rouge dans le canvas (et la mousse ne cache rien d'autre)
      await attendreHeure(api, cnx, mousse.at + 900);
      await expect.poll(() => partDuCanvas(page, mousse.l[0][0], mousse.l[0][1], 14, 'blanc')).toBeGreaterThan(0.25);
      await attendreHeure(api, cnx, fumee.at + 1500);
      await expect.poll(() => partDuCanvas(page, fumee.x, fumee.y, 12, 'rouge')).toBeGreaterThan(0.25);

      // Ballon en feu, électrique, puis en l'air (court-circuit), en mouvement, pendant les événements
      api.coupe.etat(cnx, { b: [110, 470, 260, -420, 1, 0, 0] });
      await page.waitForTimeout(700);
      api.coupe.etat(cnx, { b: [250, 470, -260, -420, 2, 0, 0] });
      await page.waitForTimeout(700);
      api.coupe.etat(cnx, { b: [180, 380, 200, -260, 0, -1, 0.4] });
      await page.waitForTimeout(700);
      api.coupe.etat(cnx, { b: [180, 320, 0, 0, 0, -1, 0] });

      // Tous passés (éclairs compris), retirés : toujours aucune erreur
      await attendreHeure(api, cnx, Math.max(...evs.map((e) => e.until)) + 800);
      expect(orage.b.length).toBeGreaterThan(0);
      expect(journal.page).toEqual([]);
      await expect(jeu(page)).toHaveAttribute('data-play', '1');
    });
  });
}

test.describe('La Coupe du Gang : cages qui bougent', () => {
  test('une seule cage à chaque bout : la cage peinte du stade est recouverte, la cage dessinée glisse', async ({ page, api, connecter }) => {
    const cnx = await matchEnLigne(page, api, connecter);
    await expect(jeu(page)).toHaveAttribute('data-stadium', 'on');
    api.coupe.etat(cnx, { b: [W / 2, H / 2, 0, 0, 0, -1, 0] });
    // Avant : les poteaux et montants de l'image, blancs, à leur place
    const peinte = [[GL, H + 2.2], [GR, H + 2.2], [GL, H + 14], [GR, H + 14], [GL, -2.2], [GR, -2.2], [GL, -14], [GR, -14]];
    for (const v of await luminosites(page, peinte)) expect(v).toBeGreaterThan(140);

    // Cage du bas à +80, cage du haut à −80, tenues de 0,6 s à 7,4 s
    const s = heure(api, cnx);
    const d = 80;
    const e = {
      k: 'goals', id: 1, an: s, at: s + 1000, until: s + 9000, sd: 5,
      g: [[[0, 0], [600, d], [7400, d], [8000, 0]], [[0, 0], [600, -d], [7400, -d], [8000, 0]]],
    };
    api.coupe.evenements(cnx, [e]);
    await attendreHeure(api, cnx, e.at + 1200);
    // Montant gauche et poteau droit de chaque cage déplacée (le montant droit de celle du bas passe
    // sous la pastille du nom, dessinée par-dessus)
    const deplacee = [[GL + d, H + 14], [GR + d, H + 2.2], [GL - d, -14], [GR - d, -2.2]];
    await expect.poll(async () => {
      const [ancienne, nouvelle] = [await luminosites(page, peinte), await luminosites(page, deplacee)];
      // Ancienne place : plus rien de blanc (pelouse, ou l'intérieur du filet déplacé) ; nouvelle
      // place : les poteaux et les montants
      return { ancienneBlanche: ancienne.filter((v) => v > 140).length, nouvelleBlanche: nouvelle.filter((v) => v > 140).length };
    }, { timeout: 8000 }).toEqual({ ancienneBlanche: 0, nouvelleBlanche: deplacee.length });

    // Fini : la cage de l'image, seule, à sa place
    await attendreHeure(api, cnx, e.until + 800);
    for (const v of await luminosites(page, peinte)) expect(v).toBeGreaterThan(140);
  });
});

test.describe('La Coupe du Gang : bruitages du règlement v2', () => {
  test('son coupé : aucun nœud audio, ni pour les événements, ni pour une faute, un but à 2, le but en or ou le feu', async ({ page, api, connecter }) => {
    api.donnees.parametresPublics.features.coupeMusic = false;
    await page.addInitScript(() => {
      try { localStorage.setItem('cdg-sound', 'off'); } catch { /* stockage refusé */ }
    });
    await compterNoeuds(page);
    const cnx = await matchEnLigne(page, api, connecter);
    await expect(page.getByRole('button', { name: 'Activer le son' })).toBeVisible();
    const s = heure(api, cnx);
    api.coupe.evenements(cnx, [
      { k: 'storm', id: 1, an: s, at: s + 1000, until: s + 4500, sd: 3, b: [[100, 300, s + 1300]] },
      { k: 'water', id: 2, an: s, at: s + 1000, until: s + 4500, sd: 4, s: [[260, 420, 0, 1.2, 120, 0]] },
    ]);
    cnx.envoyer({ t: 'foul', side: 1, k: 'keep', w: 1, pen: false });
    api.coupe.etat(cnx, { b: [180, 300, 380, -320, 1, 0, 0] });
    cnx.envoyer({ t: 'goal', by: 0, sc: [2, 0], v: 2, fx: 2 });
    cnx.envoyer({ t: 'gold' });
    await attendreHeure(api, cnx, s + 2500);
    expect(await noeuds(page)).toBe(0);
  });

  test('son allumé : un bruitage, un seul jeu de nœuds (but en or : 6 notes ; annonce de l\'orage : 2 bruits)', async ({ page, api, connecter }) => {
    api.donnees.parametresPublics.features.coupeMusic = false;
    await compterNoeuds(page);
    const cnx = await matchEnLigne(page, api, connecter);
    await expect.poll(() => page.evaluate(() => window.__contextes.some((c) => c.state === 'running'))).toBe(true);
    // Ballon immobile : ni frappe ni rebond ne sonne
    api.coupe.etat(cnx, { b: [W / 2, H / 2, 0, 0, 0, -1, 0] });
    await page.waitForTimeout(600);

    const n0 = await noeuds(page);
    cnx.envoyer({ t: 'gold' });
    await expect.poll(async () => (await noeuds(page)) - n0).toBe(6);
    await page.waitForTimeout(600);
    expect((await noeuds(page)) - n0).toBe(6);

    const n1 = await noeuds(page);
    const s = heure(api, cnx);
    // Éclair loin dans le temps : seule l'annonce sonne ici
    cnx.envoyer({ t: 'ev', e: { k: 'storm', id: 7, an: s, at: s + 1000, until: s + 12_000, sd: 9, b: [[120, 300, s + 9000]] } });
    await expect.poll(async () => (await noeuds(page)) - n1).toBe(2);
    await page.waitForTimeout(600);
    expect((await noeuds(page)) - n1).toBe(2);
  });
});
