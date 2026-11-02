// QR code « Télécharge l'app » et affiche A4 : node docs/prototypes/qr-app/rendu.mjs <dossier de sortie>
// Le QR mène à https://dhomebarber.fr/app, qui envoie un iPhone vers l'App Store et un Android vers Google Play
// (redirections de vercel.json, page public/app.html sinon). Chaque fichier n'est écrit qu'après une lecture
// réussie du QR par jsQR, à plusieurs tailles.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, '../../..');
const require = createRequire(resolve(RACINE, 'package.json'));
const { chromium } = require('playwright');
const LIEN = 'https://dhomebarber.fr/app';
const SORTIE = resolve(process.argv[2] || resolve(ICI, 'sortie'));
mkdirSync(SORTIE, { recursive: true });

// 1. Matrice du QR (niveau H : 30 % de redondance, le logo du centre en masque moins de 8 %).
const brut = renderToStaticMarkup(createElement(QRCodeSVG, { value: LIEN, level: 'H', marginSize: 0 }));
const n = Number(brut.match(/viewBox="0 0 (\d+) \1"/)[1]);
const d = [...brut.matchAll(/<path[^>]*d="([^"]+)"/g)].map((x) => x[1]).pop();
const m = Array.from({ length: n }, () => Array(n).fill(0));
for (const r of d.matchAll(/M(\d+)[ ,](\d+) ?h(\d+)v1H\d+z/g)) {
  const [x, y, k] = [r[1], r[2], r[3]].map(Number);
  for (let i = 0; i < k; i++) m[y][x + i] = 1;
}

// 2. QR stylé : modules arrondis qui se touchent (des points séparés se lisent mal en grand format),
//    yeux dessinés aux pupilles vert et rouge du drapeau, icône de l'app au centre sur 9 × 9 modules dégagés.
const Q = 4, W = n + 2 * Q, c = Math.floor(n / 2), TROU = 4;
const ENCRE = '#0d0d0d', VERT = '#009246', ROUGE = '#CE2B37';
const dansOeil = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
const dansTrou = (x, y) => Math.abs(x - c) <= TROU && Math.abs(y - c) <= TROU;
const rr = (x, y, w, h, k) => `M${x + k} ${y}H${x + w - k}A${k} ${k} 0 0 1 ${x + w} ${y + k}V${y + h - k}A${k} ${k} 0 0 1 ${x + w - k} ${y + h}H${x + k}A${k} ${k} 0 0 1 ${x} ${y + h - k}V${y + k}A${k} ${k} 0 0 1 ${x + k} ${y}Z`;
const oeil = (x, y, pupille) =>
  `<path fill="${ENCRE}" fill-rule="evenodd" d="${rr(x, y, 7, 7, 2.1)} ${rr(x + 1, y + 1, 5, 5, 1.3)}"/>` +
  `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.95" fill="${pupille}"/>`;
const modules = [];
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
  if (m[y][x] && !dansOeil(x, y) && !dansTrou(x, y)) modules.push(`<rect x="${x + Q}" y="${y + Q}" width="1" height="1" rx="0.3"/>`);
}
const icone = readFileSync(resolve(RACINE, 'public/icons/icon-256.png')).toString('base64');
const t = 7.2, tx = c + Q + 0.5 - t / 2;
const qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="1024" height="1024">` +
  `<rect width="${W}" height="${W}" rx="2.6" fill="#fff"/><g fill="${ENCRE}">${modules.join('')}</g>` +
  oeil(Q, Q, VERT) + oeil(Q + n - 7, Q, ROUGE) + oeil(Q, Q + n - 7, ENCRE) +
  `<clipPath id="tuile"><rect x="${tx}" y="${tx}" width="${t}" height="${t}" rx="1.7"/></clipPath>` +
  `<rect x="${tx}" y="${tx}" width="${t}" height="${t}" rx="1.7" fill="#000"/>` +
  `<image href="data:image/png;base64,${icone}" x="${tx}" y="${tx}" width="${t}" height="${t}" clip-path="url(#tuile)"/></svg>`;

const navigateur = await chromium.launch();
const jsqr = readFileSync(require.resolve('jsqr/dist/jsQR.js'), 'utf8');

// Lit le QR d'une image (data URL) à plusieurs tailles ; rend la liste des échecs.
async function lire(src, tailles) {
  const page = await navigateur.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: jsqr });
  const res = await page.evaluate(async ({ src, tailles }) => {
    const img = new Image(); img.src = src; await img.decode();
    return tailles.map((w) => {
      const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
      const cv = document.createElement('canvas'); cv.width = w + 40; cv.height = h + 40;
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(img, 20, 20, w, h);
      const px = g.getImageData(0, 0, cv.width, cv.height);
      const r = window.jsQR(px.data, px.width, px.height);
      return { w, data: r && r.data };
    });
  }, { src, tailles });
  await page.close();
  for (const r of res) console.log(`  ${r.data === LIEN ? 'lu    ' : 'ÉCHEC '} ${r.w} px`);
  return res.filter((r) => r.data !== LIEN);
}
const echec = (quoi) => { console.error(`QR illisible : ${quoi}`); process.exit(1); };

// 3. Le QR seul : SVG et PNG 2048 px.
console.log('QR seul');
if ((await lire(`data:image/svg+xml;base64,${Buffer.from(qrSvg).toString('base64')}`, [100, 160, 300, 600, 1000, 1600])).length) echec('QR seul');
writeFileSync(resolve(SORTIE, 'qr-code-app.svg'), qrSvg);
{
  const page = await navigateur.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 2 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${qrSvg.replace('width="1024" height="1024"', 'width="1024" height="1024" style="display:block"')}</body></html>`);
  await page.screenshot({ path: resolve(SORTIE, 'qr-code-app.png'), omitBackground: true, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  await page.close();
}

// 4. L'affiche A4 : PDF pour l'imprimeur, PNG 300 dpi (2480 × 3508).
const html = readFileSync(resolve(ICI, 'affiche.html'), 'utf8')
  .replace('<head>', `<head><base href="file://${RACINE}/">`)
  .replace('{{QR}}', qrSvg.replace(' width="1024" height="1024"', ''));
const temp = resolve(SORTIE, '.affiche-rendu.html');
writeFileSync(temp, html);
const page = await navigateur.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 3.125 });
await page.goto(`file://${temp}`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const polices = await page.evaluate(() => ['800 20px "Barlow Condensed"', '20px "Kaushan Script"', '600 20px Inter'].map((f) => document.fonts.check(f)));
if (polices.includes(false)) { console.error('Polices non chargées :', polices); process.exit(1); }
const deborde = await page.evaluate(() => { const p = document.querySelector('.page'); return p.scrollHeight - p.clientHeight; });
if (deborde > 0) console.warn(`Attention : le contenu dépasse la page de ${deborde} px`);
await page.screenshot({ path: resolve(SORTIE, 'affiche-A4.png'), clip: { x: 0, y: 0, width: 793.7, height: 1122.5 } });
await page.close();
// PDF = l'image 300 dpi posée sur une page A4 : exporté tel quel, le HTML sortait les halos flous
// (box-shadow, text-shadow) en rectangles pleins dans Aperçu.
{
  const png = readFileSync(resolve(SORTIE, 'affiche-A4.png')).toString('base64');
  const p = await navigateur.newPage();
  await p.setContent(`<html><head><style>@page{size:210mm 297mm;margin:0}html,body{margin:0}img{display:block;width:210mm;height:297mm}</style></head><body><img src="data:image/png;base64,${png}"></body></html>`);
  await p.evaluate(() => document.images[0].decode());
  await p.pdf({ path: resolve(SORTIE, 'affiche-A4.pdf'), preferCSSPageSize: true, printBackground: true });
  await p.close();
}
console.log('Affiche (PNG entier)');
if ((await lire(`data:image/png;base64,${readFileSync(resolve(SORTIE, 'affiche-A4.png')).toString('base64')}`, [800, 1240, 2480])).length) echec('affiche');
await navigateur.close();
console.log(`Fichiers dans ${SORTIE}`);
