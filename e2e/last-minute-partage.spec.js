// « Envoyer à un ami » sur une carte Last Minute de l'accueil (20 oct. 2026) : le client partage le
// créneau par la feuille de partage du téléphone ; sans partage possible (navigateur d'ordinateur),
// le message et le lien sont copiés.
import { test, expect } from './support/test.js';
import { BARBERS, CLIENT, rendezVous } from './support/donnees.js';
import { jour } from './support/temps.js';
import { toast } from './support/outils.js';

/** Créneau Last Minute publié depuis l'agenda : ligne sans client, statut `last_minute`. */
const lastMinute = (id, barber, date, debut, finCreneau) => rendezVous({
  id, barber, prestations: [], date, debut, statut: 'last_minute', end_time: finCreneau, total_duration: 30,
});

const TEXTE = '⚡ Place Last Minute chez D\'Home Barber : aujourd\'hui à 15:30 avec Kevin. Réserve vite :';
const LIEN = `https://dhomebarber.fr/booking?barber=${BARBERS.kevin.id}&date=${jour(0)}&time=15%3A30&src=partage-last-minute`;

const boutonPartage = (page) => page.getByRole('button', { name: /^Envoyer à un ami : aujourd'hui à 15:30 avec Kevin$/ });

test.describe('Last Minute : « Envoyer à un ami »', () => {
  test.beforeEach(async ({ connecter, api }) => {
    await connecter(CLIENT);
    api.tables.Appointment.push(lastMinute('lm-kevin', BARBERS.kevin, jour(0), '15:30', '16:00'));
  });

  test('partage du téléphone : texte et lien public de la réservation pré-remplie', async ({ page }) => {
    // Faux partage du téléphone : garde ce que l'app lui confie
    await page.addInitScript(() => {
      window.__partages = [];
      Object.defineProperty(Navigator.prototype, 'share', {
        configurable: true,
        value: async function share(data) { window.__partages.push(data); },
      });
    });
    await page.goto('/');
    await boutonPartage(page).click();

    await expect.poll(() => page.evaluate(() => window.__partages.length)).toBe(1);
    const partage = await page.evaluate(() => window.__partages[0]);
    expect(partage).toEqual({ title: 'Last Minute · D\'Home Barber', text: TEXTE, url: LIEN });
    // Partage réussi : aucun message à l'écran
    await expect(toast(page, 'Lien copié')).toHaveCount(0);
  });

  test('partage refermé par le client : ni copie ni message', async ({ page }) => {
    await page.addInitScript(() => {
      window.__appels = 0;
      window.__copie = null;
      Object.defineProperty(Navigator.prototype, 'share', {
        configurable: true,
        value: async function share() {
          window.__appels += 1;
          throw new DOMException('Partage annulé', 'AbortError');
        },
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (texte) => { window.__copie = texte; } },
      });
    });
    await page.goto('/');
    await boutonPartage(page).click();
    await expect.poll(() => page.evaluate(() => window.__appels)).toBe(1);
    expect(await page.evaluate(() => window.__copie)).toBeNull();
    await expect(toast(page, 'Lien copié')).toHaveCount(0);
    await expect(toast(page, 'Partage impossible')).toHaveCount(0);
  });

  test('sans partage du navigateur : message et lien copiés, avec un mot pour le dire', async ({ page }) => {
    await page.addInitScript(() => {
      window.__copie = null;
      Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (texte) => { window.__copie = texte; } },
      });
    });
    await page.goto('/');
    await boutonPartage(page).click();

    await expect(toast(page, 'Lien copié : collez-le dans un message à votre ami.')).toBeVisible();
    expect(await page.evaluate(() => window.__copie)).toBe(`${TEXTE} ${LIEN}`);
  });
});
