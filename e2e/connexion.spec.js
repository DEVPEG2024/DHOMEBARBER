// Connexion : réussite, refus, compte verrouillé, retour à la page demandée, session expirée.
import { test, expect } from './support/test.js';
import { CLIENT, MOT_DE_PASSE } from './support/donnees.js';
import { seConnecterParEcran, toast } from './support/outils.js';

/** Message du serveur pour un compte verrouillé (LOGIN_LOCKED_MSG de routes/auth.js du backend). */
const MESSAGE_VERROU = 'Trop d\'essais sur ce compte. Réessayez dans 15 minutes ou réinitialisez votre mot de passe (« Mot de passe oublié »).';

test.describe('Connexion', () => {
  test('connexion réussie : le client arrive sur l\'accueil', async ({ page, api }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();

    await seConnecterParEcran(page, CLIENT.email, MOT_DE_PASSE);

    await expect(page).toHaveURL(/\/$/);
    await expect(toast(page, `Bienvenue ${CLIENT.full_name} !`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Réserver maintenant' })).toBeVisible();
    // Le jeton reçu est bien rangé : les requêtes suivantes partent authentifiées
    expect(api.requetesVers('POST', '/auth/login')[0].corps).toEqual({ email: CLIENT.email, password: MOT_DE_PASSE });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('base44_access_token'))).toBeTruthy();
  });

  test('mauvais mot de passe : message d\'erreur, on reste sur la connexion', async ({ page }) => {
    await page.goto('/login');
    await seConnecterParEcran(page, CLIENT.email, 'pas-le-bon');

    await expect(toast(page, 'Email ou mot de passe incorrect')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem('base44_access_token'))).toBeNull();
  });

  test('compte verrouillé (429) : message du serveur et lien « Mot de passe oublié »', async ({ page, api }) => {
    api.surcharger('POST', '/auth/login', () => ({ status: 429, json: { error: MESSAGE_VERROU, locked: true } }));
    await page.goto('/login');
    await seConnecterParEcran(page, CLIENT.email, MOT_DE_PASSE);

    // Dès le verrou, le toast propose la réinitialisation (sans attendre un second refus)
    const message = toast(page, MESSAGE_VERROU);
    await expect(message).toBeVisible();
    await message.getByRole('button', { name: 'Mot de passe oublié ?' }).click();

    await expect(page.getByRole('heading', { name: 'Mot de passe oublié' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Envoyer le code' })).toBeVisible();
  });

  test('page protégée sans session : connexion demandée, puis retour à la page demandée', async ({ page }) => {
    await page.goto('/booking?services=srv-coupe');

    // La requête entière est gardée dans `redirect`
    await expect(page).toHaveURL((url) => url.pathname === '/login'
      && url.searchParams.get('redirect') === '/booking?services=srv-coupe');
    await seConnecterParEcran(page, CLIENT.email, MOT_DE_PASSE);

    await expect(page).toHaveURL((url) => url.pathname === '/booking' && url.searchParams.get('services') === 'srv-coupe');
    await expect(page.getByRole('heading', { name: 'Choisissez votre créneau' })).toBeVisible();
  });

  test('session expirée en cours d\'usage (401) : retour à la connexion avec un message', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Réserver maintenant' })).toBeVisible();
    // Chargements de l'accueil partis (la carte Gang du client arrive en dernier) : révoquée plus
    // tôt, une requête encore en route recevait le 401 avant le tap sur « Profil », la page partait
    // seule vers la connexion et le tap ne trouvait plus le lien (vérification GitHub, 21 oct. 2026)
    await expect.poll(() => api.requetesVers('GET', '/gang-card/me').length).toBeGreaterThan(0);

    // Le jeton n'est plus accepté par le serveur : la prochaine requête répond 401
    api.revoquerSessions();
    await page.getByRole('link', { name: 'Profil' }).click();

    await expect(toast(page, 'Votre session a expiré, reconnectez-vous.')).toBeVisible();
    // RequireAuth ajoute `expired=1` (état `sessionExpired` d'AuthContext) : avant le 20 oct. 2026 il
    // redirigeait sans, et le message ne tenait qu'au drapeau de sessionStorage
    await expect(page).toHaveURL((url) => url.pathname === '/login'
      && url.searchParams.get('redirect') === '/profile'
      && url.searchParams.get('expired') === '1');
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('base44_access_token'))).toBeNull();
  });
});
