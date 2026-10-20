// Vérifications transverses : pas de défilement horizontal, console sans erreur, hors connexion.
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { ADMIN, CLIENT } from './support/donnees.js';
import { jour } from './support/temps.js';
import { attendreSansDebordement } from './support/outils.js';

/** Pages client vérifiées, avec ce qui prouve qu'elles ont fini de se charger. */
const PAGES_CLIENT = [
  {
    nom: 'l\'accueil',
    chemin: '/',
    prete: (page) => expect(page.getByRole('link', { name: 'Réserver maintenant' })).toBeVisible(),
  },
  {
    nom: 'la réservation (prestations)',
    chemin: '/booking',
    prete: (page) => expect(page.getByRole('button', { name: 'Choisir : Coupe', exact: true })).toBeVisible(),
  },
  {
    nom: 'la réservation (créneau)',
    chemin: '/booking?services=srv-coupe',
    prete: (page) => expect(page.getByRole('group', { name: 'Après-midi' })).toBeVisible(),
  },
  {
    nom: 'le profil',
    chemin: '/profile',
    prete: (page) => expect(page.getByRole('heading', { level: 1, name: /Camille/ })).toBeVisible(),
  },
];

/** Pages de l'équipe vérifiées. */
const PAGES_EQUIPE = [
  {
    nom: 'l\'agenda (jour)',
    chemin: `/admin/agenda?view=day&date=${jour(0)}`,
    prete: (page) => expect(page.locator('[data-drop-column="emp-dom"]')).toContainText('Jules Martin'),
  },
  {
    nom: 'l\'agenda (semaine)',
    chemin: `/admin/agenda?view=week&date=${jour(0)}`,
    // À 320 px le nom du client est tronqué dans la carte : on vérifie la colonne du jour
    prete: (page) => expect(page.locator(`[data-drop-column="${jour(0)}"]`)).toContainText('Nina Roche'),
  },
];

/**
 * Messages d'erreur de la console tolérés : aucun aujourd'hui. Si un avertissement devient
 * inévitable (bibliothèque tierce), l'ajouter ici avec une expression précise ET la raison.
 */
const ERREURS_CONSOLE_TOLEREES = [];

const erreursNonTolerees = (journal) => journal.console.filter((texte) => !ERREURS_CONSOLE_TOLEREES.some((re) => re.test(texte)));

for (const largeur of [320, 390]) {
  test.describe(`Écran de ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 720 } });

    test(`pas de défilement horizontal sur les pages client à ${largeur} px`, async ({ page, connecter }) => {
      await connecter(CLIENT);
      for (const { nom, chemin, prete } of PAGES_CLIENT) {
        await page.goto(chemin);
        await prete(page);
        await attendreSansDebordement(page, nom);
      }
    });

    test(`pas de défilement horizontal sur l'agenda à ${largeur} px`, async ({ page, connecter }) => {
      await connecter(ADMIN);
      for (const { nom, chemin, prete } of PAGES_EQUIPE) {
        await page.goto(chemin);
        await prete(page);
        await attendreSansDebordement(page, nom);
      }
    });
  });
}

test.describe('Console du navigateur', () => {
  test('aucune erreur sur l\'accueil, la réservation et le profil', async ({ page, connecter, journal }) => {
    await connecter(CLIENT);
    for (const { chemin, prete } of PAGES_CLIENT) {
      await page.goto(chemin);
      await prete(page);
    }
    expect(erreursNonTolerees(journal), 'Erreurs dans la console').toEqual([]);
  });

  test('aucune erreur sur l\'agenda', async ({ page, connecter, journal }) => {
    await connecter(ADMIN);
    for (const { chemin, prete } of PAGES_EQUIPE) {
      await page.goto(chemin);
      await prete(page);
    }
    expect(erreursNonTolerees(journal), 'Erreurs dans la console').toEqual([]);
  });
});

test.describe('Gyroscope', () => {
  // La fenêtre n'existe pas sous la réduction des animations (réglage de toute la suite) : sans
  // cette ligne, le test passerait même avec l'ancienne détection
  test.use({ reducedMotion: 'no-preference' });

  // Chromium récent expose `DeviceOrientationEvent.requestPermission` : la fenêtre « Fais bouger la
  // carte » ne doit s'ouvrir que sur iPhone / iPad (src/lib/motion.js, `isAppleTouchDevice`)
  test('pas de fenêtre « Fais bouger la carte » sur Chrome, même avec requestPermission', async ({ page, connecter }) => {
    await page.addInitScript(() => {
      if (window.DeviceOrientationEvent && !window.DeviceOrientationEvent.requestPermission) {
        window.DeviceOrientationEvent.requestPermission = () => Promise.resolve('granted');
      }
    });
    await connecter(CLIENT);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { level: 1, name: /Camille/ })).toBeVisible();
    // La fenêtre s'ouvrait 1,2 s après l'arrivée (2 s de plus si une révélation Gang est ouverte) :
    // les minuteries de la page avancent de 5 s
    await page.clock.runFor(5000);
    await expect(page.getByText('Fais bouger la carte')).toHaveCount(0);
  });

  test.describe('sur iPhone (Safari)', () => {
    test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });

    test('la fenêtre « Fais bouger la carte » s\'ouvre toujours sur la carte du profil', async ({ page, connecter }) => {
      await page.addInitScript(() => {
        if (window.DeviceOrientationEvent && !window.DeviceOrientationEvent.requestPermission) {
          window.DeviceOrientationEvent.requestPermission = () => Promise.resolve('granted');
        }
      });
      await connecter(CLIENT);
      await page.goto('/profile');
      await expect(page.getByRole('heading', { level: 1, name: /Camille/ })).toBeVisible();
      await page.clock.runFor(5000);
      await expect(page.getByText('Fais bouger la carte')).toBeVisible();
    });
  });
});

test.describe('Hors connexion', () => {
  test('liste impossible à charger : « Pas de connexion internet » et non une liste vide', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    let horsLigne = true;
    api.surcharger('GET', '/entities/Appointment', () => (horsLigne ? RESEAU_COUPE : undefined));

    await page.goto('/appointments');
    const alerte = page.getByRole('alert').filter({ hasText: 'Pas de connexion internet' });
    await expect(alerte).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Aucun rendez-vous à venir')).toHaveCount(0);

    // Le réseau revient : « Réessayer » affiche les rendez-vous
    horsLigne = false;
    await alerte.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByText('15:00 — 15:45', { exact: true })).toBeVisible();
    await expect(alerte).toHaveCount(0);
  });

  test('lancement sans réseau avec une session enregistrée : écran « Pas de connexion internet »', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    let horsLigne = true;
    api.surcharger('GET', '/entities/User/me', () => (horsLigne ? RESEAU_COUPE : undefined));

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Pas de connexion internet' })).toBeVisible();
    await expect(page.getByText('Votre session est bien enregistrée.', { exact: false })).toBeVisible();
    // La session n'est pas perdue : le jeton reste rangé
    expect(await page.evaluate(() => localStorage.getItem('base44_access_token'))).toBeTruthy();

    horsLigne = false;
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Réserver maintenant' })).toBeVisible();
  });
});
