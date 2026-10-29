// La Coupe du Gang : animations du thème stade, en mouvement NON réduit (les autres fichiers tournent
// en mouvement réduit, où il n'y a ni fondu ni zoom). Contrôle du 29 oct. 2026
// (docs/fonctions/coupe-du-gang-stade.md, « Contrôle des animations ») :
//  - jamais le dessin du match (joueurs, ballon, score) posé sur le stade entier, même 0,2 s : il
//    est caché d'un coup quand la caméra quitte le terrain ou que l'image du stade arrive, et
//    pendant le chargement de l'image (sinon l'ancien terrain dessiné, puis le stade d'un coup) ;
//  - la bannière « BUT ! » ne reste pas sous « FIN DU MATCH ».
import { test, expect } from './support/test.js';
import { ADMIN } from './support/donnees.js';
import { CODE_MATCH } from './support/fauxCoupe.js';
import { MS, MG, VW, VH } from '../src/lib/coupe/renderer.js';
import { W, H } from '../src/lib/coupe/engine.js';

test.use({ reducedMotion: 'no-preference' });

const jeu = (page) => page.getByRole('dialog', { name: 'La Coupe du Gang' });

/**
 * À chaque image du navigateur : caméra en voyage (`data-play` absent) avec l'image du stade prête
 * ou en chargement, et opacité calculée du canvas. `window.__vus` : les opacités vues sans `data-play`.
 */
async function surveillerCanvas(page) {
  await page.addInitScript(() => {
    window.__vus = [];
    const tour = () => {
      const r = document.querySelector('.cdg-root');
      const c = r?.querySelector('.cdg-canvas');
      if (r && c && !r.hasAttribute('data-play') && r.dataset.stadium !== 'off') {
        window.__vus.push(`${r.dataset.stadium}:${getComputedStyle(c).opacity}`);
      }
      requestAnimationFrame(tour);
    };
    requestAnimationFrame(tour);
  });
}

/** Opacités vues sans `data-play` autres que 0 (le canvas à moitié visible sur le stade entier). */
const visibles = (page) => page.evaluate(() => window.__vus.filter((v) => !v.endsWith(':0')));

test.describe('La Coupe du Gang : animations du stade (mouvement non réduit)', () => {
  test('avant-match contre le salon, image du stade lente : le canvas n\'apparaît jamais sur le stade entier', async ({ page, connecter }) => {
    await surveillerCanvas(page);
    // Image servie par le build local, retardée : le jeu s'ouvre pendant son chargement
    await page.route(/\/assets\/stade[^/]*\.webp/, async (route) => {
      await new Promise((r) => setTimeout(r, 700));
      await route.fallback();
    });
    await connecter(ADMIN);
    await page.goto('/coupe-test?mode=bot&level=apprenti');
    await expect(jeu(page)).toHaveAttribute('data-stadium', 'on');
    await expect(jeu(page)).toHaveAttribute('data-play', '1', { timeout: 10_000 });
    const vus = await page.evaluate(() => window.__vus);
    expect(vus.some((v) => v.startsWith('loading:')), JSON.stringify(vus)).toBe(true);
    expect(vus.some((v) => v.startsWith('on:')), JSON.stringify(vus)).toBe(true);
    expect(await visibles(page)).toEqual([]);
  });

  test('fin du match en ligne juste après le but : « FIN DU MATCH » seul, canvas caché d\'un coup au zoom arrière', async ({ page, api, connecter }) => {
    await surveillerCanvas(page);
    api.coupe.avantMatchCd = 4.5;
    await connecter(ADMIN);
    await page.goto('/coupe-test');
    await page.getByLabel('Rejoindre un match').fill(CODE_MATCH);
    await page.getByRole('button', { name: 'Rejoindre', exact: true }).click();
    await expect(jeu(page)).toHaveAttribute('data-play', '1', { timeout: 10_000 });
    const cnx = api.coupe.derniere();
    api.coupe.etat(cnx, { ph: 'live' });
    // But décisif, puis la fin sans attendre la fin de la bannière (adversaire parti pendant la
    // célébration : le serveur finit le match tout de suite)
    cnx.envoyer({ t: 'goal', by: 1, sc: [1, 3] });
    await page.waitForTimeout(250);
    cnx.envoyer({
      t: 'end', winner: 1, sc: [1, 3], forfeit: false, cancelled: false, reason: null,
      points: { ranked: true, reason: null, delta: [-1, 3], total: 45, rank: 6, rank_before: 8 },
    });
    await expect(jeu(page)).toHaveAttribute('data-outro', 'fin');
    await page.waitForTimeout(300);
    // Bande rouge de « BUT ! » (rouge du joueur) autour du centre du terrain : plus un pixel
    const rouges = await page.locator('.cdg-canvas').evaluate((c, g) => {
      const r = c.getBoundingClientRect();
      const k = c.width / r.width;
      const s = Math.min(r.width / g.VW, r.height / g.VH);
      const ox = (r.width - g.VW * s) / 2;
      const oy = (r.height - g.VH * s) / 2;
      const px = (x, y) => [Math.round((ox + (x + g.MS) * s) * k), Math.round((oy + (y + g.MG) * s) * k)];
      const [x0, y0] = px(g.W / 2 - 90, g.H / 2 - 80);
      const [x1, y1] = px(g.W / 2 + 90, g.H / 2 + 10);
      const d = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] > 170 && d[i + 1] < 70 && d[i + 2] < 80) n += 1;
      return n;
    }, { VW, VH, MS, MG, W, H });
    expect(rouges).toBe(0);
    await expect(page.getByRole('heading', { name: 'Victoire' })).toBeVisible();
    expect(await visibles(page)).toEqual([]);
  });
});
