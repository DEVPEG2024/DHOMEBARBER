// L'admin parle au nom du salon dans le fil (26 oct. 2026) : le serveur écrit « D'Home Barber » et
// le logo du salon sur ses publications et commentaires (dhomebarber-api/lib/salonAuthor.js).
// L'app affiche le badge « Officiel » (plus « Admin »), et l'admin voit le logo et « au nom de
// D'Home Barber » en écrivant.
import { test, expect } from './support/test.js';
import { ADMIN, CLIENT } from './support/donnees.js';
import { jour } from './support/temps.js';

const LOGO = '/icons/icon-192.png';
const ilYa = (min) => new Date(Date.now() - min * 60000).toISOString();

function remplirFil(api) {
  api.surcharger('GET', '/gang-card/leaderboard', () => ({ json: { since: jour(-90), days: 90, entries: [] } }));
  api.tables.Post.push(
    { id: 'p-salon', author_name: "D'Home Barber", author_role: 'admin', author_photo_url: LOGO, content: 'Le salon sera fermé lundi pour travaux.', image_url: null, created_at: ilYa(30) },
    { id: 'p-client', author_name: 'Yanis K.', author_role: 'user', author_photo_url: null, content: 'Merci Kevin pour la coupe !', image_url: null, created_at: ilYa(90) },
  );
  api.tables.PostComment.push(
    { id: 'c-salon', post_id: 'p-client', author_name: "D'Home Barber", author_role: 'admin', author_photo_url: LOGO, content: 'Merci Yanis, à bientôt !', created_at: ilYa(60) },
  );
}

test.describe('Fil : l\'admin au nom du salon', () => {
  test('un client voit « D\'Home Barber », le logo et le badge « Officiel », jamais « Admin »', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');

    const publication = page.getByText('Le salon sera fermé lundi pour travaux.');
    await expect(publication).toBeVisible();
    const carte = page.locator('div.rounded-2xl').filter({ has: publication }).first();
    await expect(carte.getByText("D'Home Barber", { exact: true })).toBeVisible();
    await expect(carte.getByText('Officiel', { exact: true })).toBeVisible();
    await expect(carte.locator(`img[src="${LOGO}"]`)).toHaveCount(1);

    // Commentaire du salon sous la publication d'un client
    const carteClient = page.locator('div.rounded-2xl').filter({ has: page.getByText('Merci Kevin pour la coupe !') }).first();
    const commentaires = carteClient.getByRole('button', { name: /1/ }).filter({ has: page.locator('svg.lucide-message-circle') });
    if (await commentaires.count()) await commentaires.first().click();
    await expect(carteClient.getByText('Merci Yanis, à bientôt !')).toBeVisible();
    await expect(carteClient.getByText('Officiel', { exact: true })).toBeVisible();

    await expect(page.getByText('Admin', { exact: true })).toHaveCount(0);
  });

  test('l\'admin écrit au nom du salon : logo et « au nom de D\'Home Barber »', async ({ page, api, connecter }) => {
    remplirFil(api);
    // Vues des publications, lues par l'admin seulement
    api.surcharger('GET', '/analytics/post-views', () => ({ json: { counts: { 'p-salon': 4 } } }));
    await connecter(ADMIN);
    await page.goto('/feed');
    await expect(page.getByText('Le salon sera fermé lundi pour travaux.')).toBeVisible();

    // Avatar à côté du champ : le rang le plus proche qui contient le champ (pas la page entière)
    const avatarDe = (champ, rang) => page.locator(rang).filter({ has: champ }).last().locator(`img[src="${LOGO}"]`);

    const reponse = page.getByPlaceholder("Répondre au nom de D'Home Barber...").first();
    await expect(reponse).toBeVisible();
    await expect(avatarDe(reponse, 'div.flex.items-center.gap-2')).toHaveCount(1);

    await page.getByRole('button', { name: 'Nouvelle publication' }).click();
    const champ = page.getByPlaceholder("Publier au nom de D'Home Barber : une nouvelle, une photo…");
    await expect(champ).toBeVisible();
    await expect(avatarDe(champ, 'div.flex.gap-3')).toBeVisible();
  });
});
