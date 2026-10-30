// Fil « New Gang » v2 (30 oct. 2026) : contrat docs/fonctions/fil-new-gang-contrat.md.
// Pastille de l'onglet « New's Gang ! » (activité non lue, nouvelles publications), écran Activité
// (groupes, tap qui marque lu et ouvre la publication, « Tout marquer lu », sondages à voter,
// réglages « Me prévenir pour »), et l'ancien fil sans `features.feedV2`. Le faux serveur sert
// toutes les routes du contrat (e2e/support/mockApi.js, `FauxFil`) ; horloge figée : mardi 10:00.
import { test, expect, RESEAU_COUPE } from './support/test.js';
import {
  ADMIN, CLIENT, MEMBRES, media, publicationFil, sondageFil, activiteFil, ilYaMin,
} from './support/donnees.js';
import { toast, attendreSansDebordement } from './support/outils.js';

const CHEMIN_PARAMETRES = '/api/apps/public/prod/public-settings/by-id/prod';
const PHOTO_CAMILLE = media(41);
/** Photo de profil de Kevin (barber) : en portrait dans l'activité, jamais ronde. */
const PHOTO_KEVIN = media(42);

/** Page client légère (sans appel à l'API) qui montre la barre du bas. */
const PAGE_LEGERE = '/notifications';

/** Lien de l'onglet du fil dans la barre du bas (son nom dit les nouveautés). */
const ongletFil = (page) => page.locator('nav').getByRole('link', { name: /^New's Gang !/ });

/** Publications du client de test et d'autres membres, et un sondage ouvert du salon. */
function remplirFil(api) {
  api.tables.Post.push(
    publicationFil({ id: 'p-cam', auteur: MEMBRES.camille, content: 'Ma coupe du jour', image_url: PHOTO_CAMILLE, minutes: 180 }),
    publicationFil({ id: 'p-cam-texte', auteur: MEMBRES.camille, content: 'Qui vient samedi ?', minutes: 600 }),
    publicationFil({ id: 'p-yanis', auteur: MEMBRES.yanis, content: 'Merci Kevin pour la coupe !', minutes: 90 }),
    sondageFil({ id: 'p-sondage', question: 'Quelle couleur pour le hoodie ?', reponses: ['Noir', 'Vert'], minutes: 120 }),
  );
  api.tables.PostComment.push(
    { id: 'c-cam', post_id: 'p-yanis', author_email: CLIENT.email, author_name: CLIENT.full_name, author_role: 'user', author_photo_url: null, content: 'Trop frais !', created_at: ilYaMin(60) },
    { id: 'c-salon', post_id: 'p-yanis', parent_id: 'c-cam', author_email: ADMIN.email, author_name: "D'Home Barber", author_role: 'admin', author_photo_url: '/icons/icon-192.png', content: 'Merci Camille, on t\'attend samedi !', created_at: ilYaMin(30) },
  );
}

/** Activité du client : 3 réactions sur sa photo, une réponse du salon, un ancien commentaire lu. */
function remplirActivite(api) {
  api.fil.activite.push(
    activiteFil({ id: 'a-r1', type: 'reaction', de: MEMBRES.yanis, post_id: 'p-cam', emoji: '🔥', minutes: 12 }),
    activiteFil({ id: 'a-r2', type: 'reaction', de: MEMBRES.sarah, post_id: 'p-cam', emoji: '🔥', minutes: 20 }),
    activiteFil({ id: 'a-r3', type: 'reaction', de: MEMBRES.lucas, post_id: 'p-cam', emoji: '❤️', minutes: 25 }),
    activiteFil({ id: 'a-rep', type: 'reply', de: MEMBRES.salon, post_id: 'p-yanis', comment_id: 'c-salon', excerpt: 'Merci Camille, on t\'attend samedi !', minutes: 60 }),
    activiteFil({ id: 'a-old', type: 'comment', de: { ...MEMBRES.kevin, photo_url: PHOTO_KEVIN }, post_id: 'p-cam-texte', excerpt: 'Je serai là', minutes: 2 * 24 * 60, lu: true }),
  );
}

/** Attend que l'app ait reçu ses paramètres publics (drapeau `feedV2` lu). */
async function attendreDrapeau(api, page) {
  await expect.poll(() => api.requetesVers('GET', CHEMIN_PARAMETRES).length).toBeGreaterThan(0);
  await page.evaluate(() => new Promise((fin) => requestAnimationFrame(() => requestAnimationFrame(() => fin()))));
}

test.describe('Fil v2 : pastille de l\'onglet « New\'s Gang ! »', () => {
  test('activité non lue : pastille rouge avec le nombre d\'éléments, et le nom de l\'onglet le dit', async ({ page, api, connecter }) => {
    remplirFil(api);
    remplirActivite(api);
    await connecter(CLIENT);
    await page.goto(PAGE_LEGERE);

    const onglet = ongletFil(page);
    // Comptées comme l'écran Activité les montre : les 3 réactions sur ma photo = 1, la réponse = 1
    await expect(onglet).toHaveAccessibleName('New\'s Gang !, 2 nouveautés');
    await expect(onglet.getByTestId('feed-badge')).toHaveText('2');
    await expect(onglet.getByTestId('feed-dot')).toHaveCount(0);
    expect(api.requetesVers('GET', '/feed/unread').length).toBeGreaterThan(0);
  });

  test('au-delà de 9 : « 9+ » ; le compte exact reste dans le nom', async ({ page, api, connecter }) => {
    remplirFil(api);
    for (let i = 0; i < 12; i += 1) {
      api.fil.activite.push(activiteFil({ type: 'comment', de: MEMBRES.yanis, post_id: 'p-cam', excerpt: `Commentaire ${i}`, minutes: 5 + i }));
    }
    await connecter(CLIENT);
    await page.goto(PAGE_LEGERE);
    const onglet = ongletFil(page);
    await expect(onglet.getByTestId('feed-badge')).toHaveText('9+');
    await expect(onglet).toHaveAccessibleName('New\'s Gang !, 12 nouveautés');
  });

  test('seulement de nouvelles publications : petit point vert', async ({ page, api, connecter }) => {
    remplirFil(api);
    // Dernière visite du fil il y a 1 h 40 : la publication de Yanis (il y a 1 h 30) est nouvelle ;
    // le sondage (il y a 2 h) est plus ancien et mes publications ne comptent jamais
    api.fil.vuLe[CLIENT.email] = ilYaMin(100);
    await connecter(CLIENT);
    await page.goto(PAGE_LEGERE);
    const onglet = ongletFil(page);
    await expect(onglet).toHaveAccessibleName('New\'s Gang !, nouvelles publications');
    await expect(onglet.getByTestId('feed-dot')).toBeVisible();
    await expect(onglet.getByTestId('feed-badge')).toHaveCount(0);
  });

  test('cloche du fil : le nombre d\'éléments non lus, vers l\'écran Activité', async ({ page, api, connecter }) => {
    remplirFil(api);
    remplirActivite(api);
    await connecter(CLIENT);
    await page.goto('/feed');
    const cloche = page.getByRole('link', { name: 'Activité, 2 nouvelles' });
    await expect(cloche).toHaveAttribute('href', '/feed/activite');
    await expect(cloche.getByTestId('feed-activity-badge')).toHaveText('2');
    await cloche.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Activité' })).toBeVisible();
    // Ouvrir l'écran ne marque rien comme lu : seul un tap (ou « Tout marquer lu ») le fait
    expect(api.requetesVers('POST', '/feed/activity/read')).toEqual([]);
  });

  test('rien de nouveau : ni pastille ni point, nom inchangé', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto(PAGE_LEGERE);
    await expect.poll(() => api.requetesVers('GET', '/feed/unread').length).toBeGreaterThan(0);
    const onglet = page.locator('nav').getByRole('link', { name: 'New\'s Gang !', exact: true });
    await expect(onglet).toBeVisible();
    await expect(onglet.getByTestId('feed-badge')).toHaveCount(0);
    await expect(onglet.getByTestId('feed-dot')).toHaveCount(0);
  });

  test('relue toutes les 60 s : une nouvelle réaction fait apparaître la pastille', async ({ page, api, connecter }) => {
    remplirFil(api);
    await connecter(CLIENT);
    await page.goto(PAGE_LEGERE);
    await expect.poll(() => api.requetesVers('GET', '/feed/unread').length).toBeGreaterThan(0);
    await expect(ongletFil(page).getByTestId('feed-badge')).toHaveCount(0);

    api.fil.activite.push(activiteFil({ type: 'reaction', de: MEMBRES.yanis, post_id: 'p-cam', emoji: '💪', minutes: 0 }));
    await page.clock.fastForward(61 * 1000);
    await expect(ongletFil(page).getByTestId('feed-badge')).toHaveText('1');
    await expect(ongletFil(page)).toHaveAccessibleName('New\'s Gang !, 1 nouveauté');
  });

  test('panne de la lecture des nouveautés : aucune pastille, aucun message', async ({ page, api, connecter }) => {
    remplirFil(api);
    remplirActivite(api);
    api.surcharger('GET', '/feed/unread', () => RESEAU_COUPE);
    await connecter(CLIENT);
    await page.goto(PAGE_LEGERE);
    // Premier essai puis une nouvelle tentative (React Query), toutes deux en échec
    await expect.poll(() => api.requetesVers('GET', '/feed/unread').length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
    await expect(ongletFil(page).getByTestId('feed-badge')).toHaveCount(0);
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  });

  test('ancien serveur (sans `features.feedV2`) : ni pastille ni appel aux routes du fil v2', async ({ page, api, connecter }) => {
    api.donnees.parametresPublics.features.feedV2 = false;
    remplirFil(api);
    remplirActivite(api);
    await connecter(CLIENT);
    await page.goto(PAGE_LEGERE);
    await attendreDrapeau(api, page);
    const onglet = page.locator('nav').getByRole('link', { name: 'New\'s Gang !', exact: true });
    await expect(onglet).toBeVisible();
    await expect(onglet.getByTestId('feed-badge')).toHaveCount(0);
    // Une route /feed… appelée répondrait 501 et ferait échouer le test (fixture `api`)
    expect(api.requetes.filter((r) => r.chemin === '/feed' || r.chemin.startsWith('/feed/'))).toEqual([]);
  });
});

test.describe('Fil v2 : écran Activité', () => {
  test('« Nouveau » et « Plus tôt » : groupes, sondage à voter en tête, vignette, point vert', async ({ page, api, connecter }) => {
    remplirFil(api);
    remplirActivite(api);
    await connecter(CLIENT);
    await page.goto('/feed/activite');

    await expect(page.getByRole('heading', { level: 1, name: 'Activité' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retour au fil' })).toHaveAttribute('href', '/feed');

    const nouveau = page.getByRole('region', { name: 'Nouveau' });
    const liens = nouveau.getByRole('link');
    await expect(liens).toHaveCount(3);
    // Le sondage du salon à voter, en tête
    await expect(liens.nth(0)).toHaveAccessibleName('Voter au sondage du salon : Quelle couleur pour le hoodie ?');
    await expect(liens.nth(0)).toHaveAttribute('href', '/feed?post=p-sondage');
    await expect(liens.nth(0)).toContainText('encore');
    // Trois réactions sur ma photo regroupées, la plus récente d'abord, avec la vignette
    await expect(liens.nth(1)).toContainText('Yanis K. et 2 autres ont réagi 🔥 à ta photo');
    await expect(liens.nth(1)).toContainText('Il y a 12 min');
    await expect(liens.nth(1).locator(`img[src="${PHOTO_CAMILLE}"]`)).toHaveCount(1);
    await expect(liens.nth(1)).toContainText('Non lu');
    await expect(liens.nth(1)).toHaveAttribute('href', '/feed?post=p-cam');
    // La réponse du salon ouvre les commentaires
    await expect(liens.nth(2)).toContainText('D\'Home Barber a répondu à ton commentaire : « Merci Camille, on t\'attend samedi ! »');
    await expect(liens.nth(2)).toHaveAttribute('href', '/feed?post=p-yanis&comments=1');

    const plusTot = page.getByRole('region', { name: 'Plus tôt' });
    await expect(plusTot.getByRole('link')).toHaveCount(1);
    await expect(plusTot.getByRole('link')).toContainText('Kevin a commenté ta publication : « Je serai là »');
    await expect(plusTot.getByRole('link')).not.toContainText('Non lu');
    // Photo d'un barber : en portrait (plus haute que large), jamais ronde
    const portrait = await plusTot.locator(`img[src="${PHOTO_KEVIN}"]`).boundingBox();
    expect(portrait.height).toBeGreaterThan(portrait.width);
    const toutLu = page.getByRole('button', { name: 'Tout marquer lu' });
    await expect(toutLu).toBeVisible();
    // Zone de tap de 40 px au moins
    expect((await toutLu.boundingBox()).height).toBeGreaterThanOrEqual(40);
  });

  test('tap sur un élément : marqué lu tout de suite, puis la publication s\'ouvre', async ({ page, api, connecter }) => {
    remplirFil(api);
    remplirActivite(api);
    await connecter(CLIENT);
    await page.goto('/feed/activite');

    await expect(ongletFil(page).getByTestId('feed-badge')).toHaveText('2');
    await page.getByRole('region', { name: 'Nouveau' }).getByRole('link', { name: /ont réagi 🔥 à ta photo/ }).click();

    // Le fil lit `?post=` puis le retire de l'adresse : la publication est chargée seule et montrée en tête
    await expect(page).toHaveURL((url) => url.pathname === '/feed');
    await expect(page.locator('[data-post-id]').first()).toHaveAttribute('data-post-id', 'p-cam');
    expect(api.requetesVers('GET', '/feed/p-cam').length).toBeGreaterThan(0);
    // Une réaction n'ouvre pas les commentaires
    await expect(page.getByRole('dialog', { name: /^Commentaires/ })).toHaveCount(0);
    await expect.poll(() => api.requetesVers('POST', '/feed/activity/read').map((r) => r.corps)).toEqual([{ ids: ['a-r1', 'a-r2', 'a-r3'] }]);
    expect(api.fil.activite.filter((a) => !a.read_at).map((a) => a.id)).toEqual(['a-rep']);
    // La pastille suit (une activité non lue restante)
    await expect(ongletFil(page).getByTestId('feed-badge')).toHaveText('1');
  });

  test('« Ta coupe est toute fraîche » : ouvre le composeur « Mon look » de la visite', async ({ page, api, connecter }) => {
    remplirFil(api);
    api.fil.activite.push(activiteFil({ id: 'a-visite', type: 'visit_invite', de: null, appointment_id: 'apt-passe-kevin', minutes: 30 }));
    await connecter(CLIENT);
    await page.goto('/feed/activite');

    const lien = page.getByRole('link', { name: /Ta coupe est toute fraîche montre-la au Gang/ });
    await expect(lien).toHaveAttribute('href', '/feed?compose=look&visit=apt-passe-kevin');
  });

  test('« Tout marquer lu » : tout passe dans « Plus tôt », pastille retirée', async ({ page, api, connecter }) => {
    remplirFil(api);
    remplirActivite(api);
    await connecter(CLIENT);
    await page.goto('/feed/activite');
    await expect(ongletFil(page).getByTestId('feed-badge')).toHaveText('2');

    await page.getByRole('button', { name: 'Tout marquer lu' }).click();
    await expect(page.getByRole('button', { name: 'Tout marquer lu' })).toHaveCount(0);
    // Il reste le sondage à voter dans « Nouveau » (il ne se « lit » pas : on y vote)
    await expect(page.getByRole('region', { name: 'Nouveau' }).getByRole('link')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Plus tôt' }).getByRole('link')).toHaveCount(3);
    await expect(page.getByText('Non lu')).toHaveCount(0);
    await expect(ongletFil(page).getByTestId('feed-badge')).toHaveCount(0);
    expect(api.requetesVers('POST', '/feed/activity/read').map((r) => r.corps)).toEqual([{}]);
    expect(api.fil.activite.every((a) => a.read_at)).toBe(true);
  });

  test('« Tout marquer lu » refusé (réseau) : retour en arrière et message', async ({ page, api, connecter }) => {
    remplirFil(api);
    remplirActivite(api);
    api.surcharger('POST', '/feed/activity/read', () => RESEAU_COUPE);
    await connecter(CLIENT);
    await page.goto('/feed/activite');

    await page.getByRole('button', { name: 'Tout marquer lu' }).click();
    await expect(toast(page, 'Pas de connexion internet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tout marquer lu' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Nouveau' }).getByRole('link')).toHaveCount(3);
    await expect(ongletFil(page).getByTestId('feed-badge')).toHaveText('2');
  });

  test('rien de neuf : état vide sympa, réglages toujours là', async ({ page, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/feed/activite');
    await expect(page.getByText('Rien de neuf pour l\'instant…')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tout marquer lu' })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: 'Réactions à mes publications' })).toBeVisible();
  });

  test('panne de l\'activité : « Pas de connexion » et Réessayer, jamais l\'état vide', async ({ page, api, connecter }) => {
    remplirFil(api);
    remplirActivite(api);
    let panne = true;
    api.surcharger('GET', '/feed/activity', () => (panne ? RESEAU_COUPE : undefined));
    await connecter(CLIENT);
    await page.goto('/feed/activite');

    const alerte = page.getByRole('alert').filter({ hasText: 'Pas de connexion internet' });
    await expect(alerte).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Rien de neuf pour l\'instant…')).toHaveCount(0);
    panne = false;
    await alerte.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByRole('region', { name: 'Nouveau' }).getByRole('link')).toHaveCount(3);
  });

  test('réglages « Me prévenir pour » : lus du serveur, enregistrés tout de suite', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/feed/activite');

    const reactions = page.getByRole('switch', { name: 'Réactions à mes publications' });
    const commentaires = page.getByRole('switch', { name: 'Commentaires et réponses' });
    const salon = page.getByRole('switch', { name: 'Sondages et nouveautés du salon' });
    const visite = page.getByRole('switch', { name: 'Après ma visite : montrer ma coupe' });
    await expect(reactions).toHaveAttribute('aria-checked', 'true');
    await expect(commentaires).toHaveAttribute('aria-checked', 'true');
    // Nouveautés du salon : seulement sur accord (Apple 4.5.3)
    await expect(salon).toHaveAttribute('aria-checked', 'false');
    await expect(visite).toHaveAttribute('aria-checked', 'true');

    await salon.click();
    await expect(salon).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => api.requetesVers('PUT', '/feed/prefs').map((r) => r.corps)).toEqual([{ salon: true }]);
    expect(api.fil.reglages[CLIENT.email]).toEqual({ reactions: true, comments: true, salon: true, visit: true });

    await reactions.click();
    await expect(reactions).toHaveAttribute('aria-checked', 'false');
    await expect.poll(() => api.fil.reglages[CLIENT.email]?.reactions).toBe(false);

    const carte = page.getByRole('region', { name: 'Me prévenir pour' });
    await expect(carte.getByText('Les notifications de ton téléphone se règlent aussi dans')).toBeVisible();
    const parametres = carte.getByRole('link', { name: 'Paramètres' });
    await expect(parametres).toHaveAttribute('href', '/settings');
    // Mot de 12 px de haut, zone de tap de 40 px : un doigt posé 18 px au-dessus ou au-dessous l'ouvre
    const b = await parametres.boundingBox();
    const lienSous = (dy) => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href') ?? null, { x: b.x + b.width / 2, y: b.y + b.height / 2 + dy });
    expect(await lienSous(-18)).toBe('/settings');
    expect(await lienSous(18)).toBe('/settings');
  });

  test('réglage refusé par le serveur : l\'interrupteur revient, message', async ({ page, api, connecter }) => {
    api.surcharger('PUT', '/feed/prefs', () => ({ status: 503, json: { error: 'Service indisponible' } }));
    await connecter(CLIENT);
    await page.goto('/feed/activite');

    const visite = page.getByRole('switch', { name: 'Après ma visite : montrer ma coupe' });
    await expect(visite).toHaveAttribute('aria-checked', 'true');
    await visite.click();
    await expect(toast(page, 'Service indisponible')).toBeVisible();
    await expect(visite).toHaveAttribute('aria-checked', 'true');
    expect(api.fil.reglages[CLIENT.email]).toBeUndefined();
  });

  test('ancien serveur (sans `features.feedV2`) : retour au fil', async ({ page, api, connecter }) => {
    api.donnees.parametresPublics.features.feedV2 = false;
    await connecter(CLIENT);
    await page.goto('/feed/activite');
    await expect(page).toHaveURL((url) => url.pathname === '/feed');
    expect(api.requetesVers('GET', '/feed/activity')).toEqual([]);
  });

  test('dans l\'admin : retour vers /admin/feed, liens de l\'espace admin', async ({ page, api, connecter }) => {
    remplirFil(api);
    api.fil.activite.push(
      activiteFil({ id: 'a-adm', type: 'comment', pour: ADMIN.email, de: MEMBRES.yanis, post_id: 'p-sondage', excerpt: 'Vert, sans hésiter', minutes: 8 }),
    );
    await connecter(ADMIN);
    await page.goto('/admin/feed/activite');

    await expect(page.getByRole('heading', { level: 1, name: 'Activité' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retour au fil' })).toHaveAttribute('href', '/admin/feed');
    const lien = page.getByRole('region', { name: 'Nouveau' }).getByRole('link', { name: /Yanis K\. a commenté/ });
    await expect(lien).toHaveAttribute('href', '/admin/feed?post=p-sondage&comments=1');
    // Le salon ne vote pas à son propre sondage depuis l'activité : il n'y figure pas
    await expect(page.getByRole('link', { name: /Voter au sondage/ })).toHaveCount(0);
  });

  for (const largeur of [320, 390, 430]) {
    test(`sans défilement horizontal à ${largeur} px`, async ({ page, api, connecter }) => {
      await page.setViewportSize({ width: largeur, height: 760 });
      remplirFil(api);
      remplirActivite(api);
      api.fil.activite.push(activiteFil({
        type: 'comment', de: { ...MEMBRES.mehdi, name: 'Maximilien-Alexandre de la Fontaine-Beaumont' }, post_id: 'p-cam',
        excerpt: 'Unmotsansespacesvraimenttrèslongquinedoitjamaisfairedéborderlapagesurunpetitécrandetéléphone', minutes: 3,
      }));
      await connecter(CLIENT);
      await page.goto('/feed/activite');
      await expect(page.getByRole('region', { name: 'Nouveau' }).getByRole('link')).toHaveCount(4);
      await expect(page.getByRole('switch', { name: 'Commentaires et réponses' })).toBeVisible();
      await attendreSansDebordement(page, `l'écran Activité à ${largeur} px`);
    });
  }
});
