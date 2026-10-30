// L'admin parle au nom du salon dans le fil (26 oct. 2026) : le serveur écrit « D'Home Barber » et
// le logo du salon sur ses publications et commentaires (dhomebarber-api/lib/salonAuthor.js).
// L'app affiche une petite étoile bleue à côté du nom (plus le badge « Admin », 26 oct. 2026), et
// l'admin voit le logo et « au nom de D'Home Barber » en écrivant.
// Fil v2 (30 oct. 2026) : on commente dans la fenêtre des commentaires (plus de champ sous la
// carte) ; les 2 derniers commentaires sont en aperçu sous la publication, avec l'étoile du salon.
import { test, expect } from './support/test.js';
import { ADMIN, CLIENT, LOGO_SALON, MEMBRES, publicationFil, commentaireFil } from './support/donnees.js';

function remplirFil(api) {
  api.tables.Post.push(
    publicationFil({ id: 'p-salon', auteur: MEMBRES.salon, content: 'Le salon sera fermé lundi pour travaux.', minutes: 30 }),
    publicationFil({ id: 'p-client', auteur: MEMBRES.yanis, content: 'Merci Kevin pour la coupe !', minutes: 90 }),
  );
  api.tables.PostComment.push(
    commentaireFil({ id: 'c-salon', post_id: 'p-client', de: MEMBRES.salon, content: 'Merci Yanis, à bientôt !', minutes: 60 }),
  );
}

const carte = (page, id) => page.locator(`[data-post-id="${id}"]`);

test.describe('Fil : l\'admin au nom du salon', () => {
  test('un client voit « D\'Home Barber », le logo et l\'étoile bleue, jamais « Admin »', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto('/feed');

    const salon = carte(page, 'p-salon');
    await expect(salon.getByText('Le salon sera fermé lundi pour travaux.')).toBeVisible();
    await expect(salon.getByText("D'Home Barber", { exact: true })).toBeVisible();
    const etoile = salon.getByTitle('Compte officiel du salon').locator('svg');
    await expect(etoile).toBeVisible();
    await expect(etoile).toHaveClass(/lucide-star/);
    await expect(etoile).toHaveClass(/text-blue-500/);
    await expect(salon.locator(`img[src="${LOGO_SALON}"]`)).toHaveCount(1);

    // Commentaire du salon en aperçu sous la publication d'un client, avec son étoile
    const client = carte(page, 'p-client');
    await expect(client.getByText('Merci Yanis, à bientôt !')).toBeVisible();
    await expect(client.getByTitle('Compte officiel du salon').locator('svg')).toBeVisible();

    // Et dans la fenêtre des commentaires : nom, logo et étoile
    await client.getByRole('button', { name: 'Commenter' }).click();
    const fenetre = page.getByRole('dialog', { name: 'Commentaires · 1' });
    const commentaire = fenetre.locator('[data-comment-id="c-salon"]');
    await expect(commentaire.getByText("D'Home Barber", { exact: true })).toBeVisible();
    await expect(commentaire.locator(`img[src="${LOGO_SALON}"]`)).toHaveCount(1);
    await expect(commentaire.getByTitle('Compte officiel du salon')).toHaveCount(1);
    await fenetre.getByRole('button', { name: 'Fermer' }).click();
    await expect(fenetre).toHaveCount(0);

    await expect(page.getByText('Admin', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Officiel', { exact: true })).toHaveCount(0);
    // Une seule étoile par contenu du salon (publication, commentaire en aperçu), aucune pour un client
    await expect(page.getByTitle('Compte officiel du salon')).toHaveCount(2);
  });

  test('l\'admin écrit au nom du salon : logo et « au nom de D\'Home Barber »', async ({ page, api, connecter }) => {
    remplirFil(api);
    // Membres qui ont vu la publication du salon : le nombre, pour l'admin
    api.fil.vues['p-salon'] = 4;
    await connecter(ADMIN);
    await page.goto('/feed');
    await expect(page.getByText('Le salon sera fermé lundi pour travaux.')).toBeVisible();
    await expect(carte(page, 'p-salon').getByTestId('post-views')).toContainText('4 vues');

    // Réponse sous la publication d'un client : dans la fenêtre des commentaires
    await carte(page, 'p-client').getByRole('button', { name: 'Commenter' }).click();
    const fenetre = page.getByRole('dialog', { name: 'Commentaires · 1' });
    await expect(fenetre.getByPlaceholder("Répondre au nom de D'Home Barber...")).toBeVisible();
    await fenetre.getByRole('button', { name: 'Fermer' }).click();
    await expect(fenetre).toHaveCount(0);

    await page.getByRole('button', { name: 'Nouvelle publication' }).click();
    const composeur = page.getByRole('dialog', { name: 'Nouvelle publication' });
    await expect(composeur.getByPlaceholder("Publier au nom de D'Home Barber : une nouvelle, une photo…")).toBeVisible();
    // Le logo du salon à côté du champ, jamais la photo de l'admin
    await expect(composeur.locator(`img[src="${LOGO_SALON}"]`)).toBeVisible();
    // Le salon publie aussi des sondages
    await expect(composeur.getByRole('tab', { name: 'Sondage' })).toBeVisible();
    await expect(composeur.getByRole('tab', { name: 'Mon look' })).toHaveCount(0);
  });
});
