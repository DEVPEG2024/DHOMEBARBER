// Admin « Cartes cadeau » : scanner QR d'une carte (caméra + jsQR).
// Le 21 oct. 2026, Safari a remonté « IndexSizeError: The index is not in the allowed range. »
// (getImageData) : la vidéo se disait prête avec une image encore vide (0 × 0), la lecture levait
// une erreur et la boucle s'arrêtait (scanner figé). Caméra simulée : vidéo « prête » dont la
// taille reste à 0 × 0 tant que le test ne la fixe pas.
import { test, expect } from './support/test.js';
import { ADMIN } from './support/donnees.js';

test('scanner : image vide de Safari sans erreur, la lecture reprend quand l\'image arrive', async ({ page, connecter }) => {
  await connecter(ADMIN);
  await page.addInitScript(() => {
    window.__camera = { w: 0, h: 0, lectures: 0 };
    navigator.mediaDevices.getUserMedia = async () => new MediaStream();
    HTMLMediaElement.prototype.play = async function play() {};
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => window.__camera.w });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => window.__camera.h });
    const lire = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function getImageData(...args) {
      window.__camera.lectures += 1;
      return lire.apply(this, args);
    };
  });

  await page.goto('/admin/gift-cards');
  await page.getByRole('button', { name: 'Scanner' }).click();
  await expect(page.getByRole('heading', { name: 'Scanner une carte' })).toBeVisible();

  // Image vide : aucune lecture tentée, aucune erreur (vérifiée à la fin par les fixtures)
  await page.clock.runFor(500);
  expect(await page.evaluate(() => window.__camera.lectures)).toBe(0);

  // L'image arrive : la boucle tourne toujours et lit chaque image
  await page.evaluate(() => { window.__camera.w = 64; window.__camera.h = 48; });
  await page.clock.runFor(500);
  expect(await page.evaluate(() => window.__camera.lectures)).toBeGreaterThan(5);
});
