// Last Minute dans le fil (22 oct. 2026) : le serveur publie chaque créneau libre du jour dans le fil
// (`kind = 'last_minute'`, barber / jour / heures dans `meta`). L'app montre la carte orange de
// l'accueil (Réserver, Envoyer à un ami) à la place du texte, et plus rien une fois le créneau
// commencé. Horloge figée : mardi 10:00 à Paris.
import { test, expect } from './support/test.js';
import { BARBERS, CLIENT, rendezVous } from './support/donnees.js';
import { jour } from './support/temps.js';

/**
 * Ligne Last Minute libre d'une publication (le serveur ne publie que des créneaux qui existent ;
 * le fil recoupe ses cartes avec la liste à jour des créneaux libres, comme l'accueil).
 */
const creneauDe = (pub) => rendezVous({
  id: pub.appointment_id, barber: BARBERS.kevin, prestations: [], date: pub.meta.date,
  debut: pub.meta.start_time, statut: 'last_minute', end_time: pub.meta.end_time,
});

const publication = (id, start, end, over = {}) => ({
  id,
  author_name: "D'Home Barber",
  author_role: 'admin',
  author_photo_url: null,
  content: `⚡ Last Minute aujourd'hui à ${start} avec Kevin. Le créneau vient de se libérer : réserve-le vite depuis l'accueil !`,
  image_url: null,
  likes_count: 0,
  kind: 'last_minute',
  appointment_id: `lm-${id}`,
  meta: { employee_id: BARBERS.kevin.id, barber_name: 'Kevin', date: jour(0), start_time: start, end_time: end },
  created_at: new Date().toISOString(),
  ...over,
});

test.describe('Last Minute dans le fil', () => {
  test.beforeEach(async ({ connecter, api }) => {
    await connecter(CLIENT);
    // Le fil montre aussi le classement de la carte Gang (vide ici)
    api.surcharger('GET', '/gang-card/leaderboard', () => ({ json: { since: jour(-90), days: 90, entries: [] } }));
  });

  test('créneau à venir : la carte Last Minute (Réserver) à la place du texte ; créneau commencé : rien', async ({ page, api }) => {
    const p1500 = publication('p-1500', '15:00', '15:40');
    const p0900 = publication('p-0900', '09:00', '09:40'); // commencé à 09:00 (il est 10:00)
    api.tables.Appointment.push(creneauDe(p1500), creneauDe(p0900));
    api.tables.Post.push(
      p1500,
      p0900,
      { id: 'p-normal', author_name: 'Yanis K.', author_role: 'user', content: 'Merci Kevin pour la coupe !', created_at: new Date(Date.now() - 3600000).toISOString() },
    );
    await page.goto('/feed');

    const carte = page.getByRole('article', { name: "Créneau Last Minute aujourd'hui à 15:00 avec Kevin" });
    await expect(carte).toBeVisible();
    await expect(carte).toContainText('15:00');
    const reserver = carte.getByRole('link', { name: "Réserver ce créneau, aujourd'hui à 15:00 avec Kevin" });
    await expect(reserver).toHaveAttribute('href', `/booking?barber=${BARBERS.kevin.id}&date=${jour(0)}&time=15%3A00`);
    await expect(carte.getByRole('button', { name: "Envoyer à un ami : aujourd'hui à 15:00 avec Kevin" })).toBeVisible();
    // Le texte de repli (lu par les apps plus anciennes) n'est pas doublé sous la carte
    await expect(page.getByText(/Le créneau vient de se libérer/)).toHaveCount(0);
    // Créneau commencé : ni carte ni texte
    await expect(page.getByRole('article', { name: /09:00 avec Kevin/ })).toHaveCount(0);
    // Les autres publications restent
    await expect(page.getByText('Merci Kevin pour la coupe !')).toBeVisible();

    await reserver.click();
    await expect(page).toHaveURL((url) => url.pathname === '/booking' && url.searchParams.get('time') === '15:00');
  });

  test('barber retiré de l\'équipe visible : publication masquée', async ({ page, api }) => {
    api.tables.Post.push(publication('p-x', '15:00', '15:40', { meta: { employee_id: 'barber-inconnu', barber_name: 'X', date: jour(0), start_time: '15:00', end_time: '15:40' } }));
    await page.goto('/feed');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('article', { name: /Créneau Last Minute/ })).toHaveCount(0);
  });
});
