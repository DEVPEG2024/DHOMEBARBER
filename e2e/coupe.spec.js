// La Coupe du Gang, prototype réseau (/coupe-test) : qui y accède, l'accueil, aucun WebSocket avant
// « Créer un match » ou « Rejoindre », messages envoyés au serveur de jeu (faux serveur
// e2e/support/fauxCoupe.js) et erreurs affichées.
import { test, expect } from './support/test.js';
import { ADMIN, CLIENT } from './support/donnees.js';
import { CODE_MATCH } from './support/fauxCoupe.js';

const titre = (page) => page.getByRole('heading', { name: 'La Coupe du Gang' });
const boutonCreer = (page) => page.getByRole('button', { name: /^Créer un match/ });
const boutonRejoindre = (page) => page.getByRole('button', { name: 'Rejoindre', exact: true });

test.describe('La Coupe du Gang (prototype réseau)', () => {
  test('admin : accueil affiché, aucun WebSocket avant « Créer un match », puis code de la salle', async ({ page, api, connecter }) => {
    const sockets = [];
    page.on('websocket', (ws) => sockets.push(ws.url()));
    const jeton = await connecter(ADMIN);
    await page.goto('/coupe-test');

    await expect(titre(page)).toBeVisible();
    await expect(boutonCreer(page)).toBeVisible();
    await expect(boutonRejoindre(page)).toBeDisabled();
    await expect(page.getByRole('img', { name: /Terrain de foot/ })).toBeVisible();
    // Écran prêt : aucun WebSocket de jeu tant qu'on n'a rien demandé
    expect(sockets.filter((u) => u.includes('/ws/coupe'))).toEqual([]);
    expect(api.coupe.connexions).toEqual([]);

    await boutonCreer(page).click();
    await expect(page.getByText(CODE_MATCH, { exact: true })).toBeVisible();
    await expect(page.getByText('En attente de l\'autre joueur')).toBeVisible();

    // Jeton jamais dans l'adresse : premier message `auth`, puis la création
    expect(api.coupe.connexions).toHaveLength(1);
    const [cnx] = api.coupe.connexions;
    expect(new URL(cnx.url).pathname).toBe('/ws/coupe');
    expect(cnx.url).not.toContain(jeton);
    expect(cnx.messages[0]).toEqual({ t: 'auth', v: 1, token: jeton });
    expect(api.coupe.messages('create')).toEqual([{ t: 'create' }]);

    // Annuler : `leave` envoyé, retour à l'accueil
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(titre(page)).toBeVisible();
    await expect.poll(() => api.coupe.messages('leave').length).toBe(1);
  });

  test('client simple : renvoyé vers l\'accueil du salon', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe-test');

    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.getByRole('link', { name: 'Réserver maintenant' })).toBeVisible();
    await expect(titre(page)).toHaveCount(0);
    expect(api.coupe.connexions).toEqual([]);
  });

  test('compte testeur : accès à l\'écran', async ({ page, api, connecter }) => {
    api.comptes.find((c) => c.email === CLIENT.email).is_tester = true;
    await connecter(CLIENT);
    await page.goto('/coupe-test');

    await expect(titre(page)).toBeVisible();
    await expect(page).toHaveURL(/\/coupe-test$/);
  });

  test('sans session : connexion demandée, avec retour au jeu', async ({ page }) => {
    await page.goto('/coupe-test');
    await expect(page).toHaveURL((url) => url.pathname === '/login'
      && url.searchParams.get('redirect') === '/coupe-test');
  });

  test('rejoindre : match ouvert avec le diagnostic et les réactions, puis quitter', async ({ page, api, connecter }) => {
    await connecter(ADMIN);
    await page.goto('/coupe-test');

    const champ = page.getByLabel('Rejoindre un match');
    await expect(champ).toHaveAttribute('inputmode', 'numeric');
    // Chiffres seulement
    await champ.fill('4a8');
    await expect(champ).toHaveValue('48');
    await expect(boutonRejoindre(page)).toBeDisabled();
    await champ.fill(CODE_MATCH);
    await expect(champ).toHaveValue(CODE_MATCH);
    await boutonRejoindre(page).click();

    // Écran du match : barre de diagnostic toujours visible et trois réactions
    await expect(page.getByText(/^Ping \d+ ms · recalages 0$/)).toBeVisible();
    await expect(page.getByRole('group', { name: 'Réactions' }).getByRole('button')).toHaveCount(3);
    expect(api.coupe.messages('join')).toEqual([{ t: 'join', code: CODE_MATCH }]);

    // Position du joueur envoyée dans le repère du serveur : side 1 = moitié du haut
    await expect.poll(() => api.coupe.messages('in').length).toBeGreaterThan(0);
    const [position] = api.coupe.messages('in');
    expect(position.y).toBeLessThan(320);

    // Réaction : une par seconde
    await page.getByRole('button', { name: 'Réagir : En feu' }).click();
    await expect.poll(() => api.coupe.messages('react')).toEqual([{ t: 'react', r: 1 }]);
    await expect(page.getByRole('button', { name: 'Réagir : Bravo' })).toBeDisabled();

    await page.getByRole('button', { name: 'Quitter le match' }).click();
    await expect(titre(page)).toBeVisible();
    await expect.poll(() => api.coupe.messages('leave').length).toBe(1);
  });

  test('accès refusé par le serveur de jeu : message, sans « Réessayer »', async ({ page, api, connecter }) => {
    api.coupe.refuser = true;
    await connecter(ADMIN);
    await page.goto('/coupe-test');
    await boutonCreer(page).click();

    await expect(page.getByRole('alert')).toHaveText('Réservé à l\'équipe et aux testeurs pendant l\'essai');
    await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(titre(page)).toBeVisible();
  });

  test('serveur de jeu injoignable : message et « Réessayer »', async ({ page, api, connecter }) => {
    api.coupe.injoignable = true;
    await connecter(ADMIN);
    await page.goto('/coupe-test');
    await boutonCreer(page).click();

    await expect(page.getByRole('alert')).toHaveText('Connexion impossible au serveur de jeu');
    api.coupe.injoignable = false;
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByText(CODE_MATCH, { exact: true })).toBeVisible();
  });
});
