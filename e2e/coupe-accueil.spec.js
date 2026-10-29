// La Coupe du Gang : accueil du jeu (/coupe) et classement (/coupe/classement), d'après les
// maquettes validées. Routes REST simulées par `FauxCoupeRest` (e2e/support/mockApi.js) ; l'écran de
// jeu (CoupeGame, constructeur F1) n'est vérifié ici que par ce que l'accueil lui transmet
// (`data-coupe-partie`, `data-coupe-action`, `data-coupe-niveau` de l'enveloppe posée par la page).
import { test, expect, RESEAU_COUPE } from './support/test.js';
import { ADMIN, CLIENT, MOT_DE_PASSE } from './support/donnees.js';
import { saisonCoupe } from './support/mockApi.js';
import { MAINTENANT, cleDuJourParis } from './support/temps.js';
import { attendreSansDebordement, toast } from './support/outils.js';

const { season: SAISON, season_ends_at: FIN_SAISON } = saisonCoupe();
/** « novembre » : mois de la saison simulée, tel que l'app l'écrit. */
const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' })
  .format(new Date(Date.UTC(Number(SAISON.slice(0, 4)), Number(SAISON.slice(5, 7)) - 1, 1)));

/** Phrase de fin de saison attendue (jours du calendrier de Paris jusqu'au 1er du mois suivant). */
function texteFinDeSaison() {
  const jourUtc = (cle) => { const [a, m, j] = cle.split('-').map(Number); return Date.UTC(a, m - 1, j); };
  const jours = Math.round((jourUtc(cleDuJourParis(new Date(FIN_SAISON))) - jourUtc(cleDuJourParis(MAINTENANT))) / 86_400_000);
  return jours === 1 ? 'Fin de la saison ce soir à minuit.' : `Fin de la saison dans ${jours} jours.`;
}

/** Compte barber de Kevin (fiche `emp-kevin`), ajouté au faux serveur par les tests qui en ont besoin. */
const KEVIN = {
  id: 'user-kevin', email: 'kevin.test@dhomebarber.fr', full_name: 'Kevin Barber', phone: '',
  role: 'barber', employee_id: 'emp-kevin',
};

const titre = (page) => page.getByRole('heading', { level: 1, name: 'La Coupe du Gang' });
const blocPoints = (page) => page.getByRole('region', { name: /Points de Coupe/ });
const blocBarbers = (page) => page.getByRole('region', { name: 'Défier un barber' });
const tuileBarber = (page, nom) => blocBarbers(page).getByRole('listitem').filter({ hasText: nom });
const apercuClassement = (page) => page.getByRole('region', { name: 'Classement de la saison' });
const interrupteur = (page) => page.getByRole('switch', { name: 'Apparaître dans le classement' });
const partie = (page) => page.locator('[data-coupe-partie]');

/** Accueil chargé : points, barbers et haut du classement affichés. */
async function accueilPret(page) {
  await expect(titre(page)).toBeVisible();
  await expect(blocPoints(page)).toContainText('Victoire +3, défaite −1');
  await expect(tuileBarber(page, 'Dom')).toBeVisible();
  await expect(apercuClassement(page).getByRole('listitem').first()).toContainText('Lucas M.');
}

/** Éléments de la page qui dépassent l'écran à droite (coupés par `overflow-x-clip`, donc invisibles au défilement). */
function elementsQuiDepassent(page) {
  return page.evaluate(() => {
    const largeur = document.documentElement.clientWidth;
    return [...document.querySelectorAll('main *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > largeur + 0.5;
      })
      .map((el) => `${el.tagName.toLowerCase()} « ${(el.textContent || '').trim().slice(0, 30)} » (${Math.round(el.getBoundingClientRect().right)} px)`);
  });
}

test.describe('La Coupe du Gang : accueil', () => {
  test('points, barbers, modes de jeu et haut du classement', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe');
    await accueilPret(page);

    // Tes Points de Coupe : saison, place, bilan, règle
    const points = blocPoints(page);
    await expect(points).toContainText('Tes Points de Coupe');
    await expect(points).toContainText('42');
    await expect(points).toContainText(`8e de la saison de ${MOIS}`);
    await expect(points).toContainText(/16\s*victoires/);
    await expect(points).toContainText(/6\s*défaites/);
    await expect(points).toContainText('Victoire +3, défaite −1. Ces points ne changent pas ton niveau Gang.');
    await expect(points.getByRole('note')).toHaveCount(0);

    // Défier un barber : Dom et Kevin dispo, Romain en rendez-vous
    await expect(blocBarbers(page)).toContainText('En ligne · points en jeu');
    await expect(tuileBarber(page, 'Dom')).toContainText('Dispo');
    await expect(page.getByRole('button', { name: 'Défier Dom' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Défier Kevin' })).toBeEnabled();
    await expect(tuileBarber(page, 'Romain')).toContainText('Occupé');
    await expect(page.getByRole('button', { name: 'Défier Romain : occupé' })).toBeDisabled();

    // Ami, code, salon, à deux
    await expect(page.getByRole('button', { name: /^Défier un ami/ })).toBeVisible();
    await expect(page.getByLabel('J\'ai un code')).toHaveAttribute('inputmode', 'numeric');
    await expect(page.getByRole('button', { name: /^Contre le salon/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: /^À deux sur ce téléphone/ })).toBeVisible();

    // Haut du classement : trois premiers puis « Toi »
    const lignes = apercuClassement(page).getByRole('listitem');
    await expect(lignes).toHaveCount(4);
    await expect(lignes.nth(0)).toContainText('Lucas M.');
    await expect(lignes.nth(0)).toContainText('87');
    await expect(lignes.nth(1)).toContainText('Kevin');
    await expect(lignes.nth(1).getByRole('img', { name: 'Barber' })).toBeVisible();
    await expect(lignes.nth(2)).toContainText('D\'Home Barber');
    await expect(lignes.nth(2).getByRole('img', { name: 'Le salon' })).toBeVisible();
    await expect(lignes.nth(3)).toContainText('Toi');
    await expect(lignes.nth(3)).toContainText('8e');
    await expect(lignes.nth(3)).toContainText('42 points');
    await expect(apercuClassement(page).getByRole('link', { name: 'Tout voir' })).toHaveAttribute('href', '/coupe/classement');

    await expect(interrupteur(page)).toBeChecked();
    expect(api.requetesVers('GET', '/coupe/me')).not.toHaveLength(0);
    expect(api.requetesVers('GET', '/coupe/leaderboard').map((r) => r.query.scope)).toContain('season');
    // Personne n'est bloqué : pas de section « Joueurs bloqués »
    await expect(page.getByRole('heading', { name: 'Joueurs bloqués' })).toHaveCount(0);
  });

  test('barbers dispo ou non, relus toutes les 30 s (seulement ici)', async ({ page, api, connecter }) => {
    api.coupeRest.dispo['emp-kevin'] = false;
    await connecter(CLIENT);
    await page.goto('/coupe');
    await accueilPret(page);

    await expect(tuileBarber(page, 'Kevin')).toContainText('Pas dispo');
    await expect(page.getByRole('button', { name: 'Défier Kevin : pas dispo' })).toBeDisabled();
    await expect(tuileBarber(page, 'Romain')).toContainText('Occupé');
    const lectures = api.requetesVers('GET', '/coupe/barbers').length;

    // Kevin se met dispo, Romain a fini son rendez-vous : visible au plus 30 s après
    api.coupeRest.dispo['emp-kevin'] = true;
    api.coupeRest.occupes.clear();
    await page.clock.runFor(31_000);
    await expect(page.getByRole('button', { name: 'Défier Kevin' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Défier Romain' })).toBeEnabled();
    expect(api.requetesVers('GET', '/coupe/barbers').length).toBeGreaterThan(lectures);

    // « Défier » : l'adresse du défi (comme le bouton du profil d'un barber), retour = accueil
    await page.getByRole('button', { name: 'Défier Dom' }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/coupe' && url.searchParams.get('challenge') === 'emp-dom');
    await expect(partie(page)).toHaveAttribute('data-coupe-partie', 'online');
    await expect(partie(page)).toHaveAttribute('data-coupe-action', 'challenge');
    await expect(titre(page)).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === '/coupe' && url.search === '');
    await expect(titre(page)).toBeVisible();
    await expect(partie(page)).toHaveCount(0);
  });

  test('défier un ami, « J\'ai un code », contre le salon et à deux', async ({ page, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe');
    await accueilPret(page);

    // Défier un ami : salle en ligne créée par l'écran de jeu, l'adresse ne change pas
    await page.getByRole('button', { name: /^Défier un ami/ }).click();
    await expect(partie(page)).toHaveAttribute('data-coupe-action', 'create');
    await expect(page).toHaveURL((url) => url.pathname === '/coupe' && url.search === '');
    await page.goBack();
    await expect(titre(page)).toBeVisible();

    // J'ai un code : chiffres seulement, 4 pour rejoindre
    const champ = page.getByLabel('J\'ai un code');
    const rejoindre = page.getByRole('button', { name: 'Rejoindre', exact: true });
    await champ.fill('4a8');
    await expect(champ).toHaveValue('48');
    await expect(rejoindre).toBeDisabled();
    await champ.fill('4821');
    await expect(rejoindre).toBeEnabled();
    await rejoindre.click();
    await expect(partie(page)).toHaveAttribute('data-coupe-partie', 'online');
    await expect(partie(page)).toHaveAttribute('data-coupe-action', 'join');
    await page.goBack();
    await expect(titre(page)).toBeVisible();

    // Contre le salon : trois niveaux, puis la partie au niveau choisi
    const contreSalon = page.getByRole('button', { name: /^Contre le salon/ });
    await contreSalon.click();
    await expect(contreSalon).toHaveAttribute('aria-expanded', 'true');
    const niveaux = page.getByRole('group', { name: 'Niveau du salon' }).getByRole('button');
    await expect(niveaux).toHaveText([/Apprenti/, /Barber/, /Boss/]);
    await niveaux.filter({ hasText: 'Boss' }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('mode') === 'bot' && url.searchParams.get('level') === 'boss');
    await expect(partie(page)).toHaveAttribute('data-coupe-partie', 'bot');
    await expect(partie(page)).toHaveAttribute('data-coupe-niveau', 'boss');
    await page.goBack();
    await expect(titre(page)).toBeVisible();

    // À deux sur ce téléphone
    await page.getByRole('button', { name: /^À deux sur ce téléphone/ }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('mode') === 'local');
    await expect(partie(page)).toHaveAttribute('data-coupe-partie', 'local');
  });

  test('l\'adresse ouvre le jeu directement (défi reçu, défi d\'un barber, contre le salon, à deux)', async ({ page, connecter }) => {
    await connecter(CLIENT);

    await page.goto('/coupe?defi=k3x9a7b2m4q8');
    await expect(partie(page)).toHaveAttribute('data-coupe-partie', 'online');
    await expect(partie(page)).toHaveAttribute('data-coupe-action', 'defi');
    await expect(titre(page)).toHaveCount(0);

    await page.goto('/coupe?challenge=emp-kevin');
    await expect(partie(page)).toHaveAttribute('data-coupe-action', 'challenge');

    await page.goto('/coupe?mode=bot&level=barber');
    await expect(partie(page)).toHaveAttribute('data-coupe-partie', 'bot');
    await expect(partie(page)).toHaveAttribute('data-coupe-niveau', 'barber');

    // Niveau inconnu : le premier (Apprenti)
    await page.goto('/coupe?mode=bot&level=legende');
    await expect(partie(page)).toHaveAttribute('data-coupe-niveau', 'apprenti');

    await page.goto('/coupe?mode=local');
    await expect(partie(page)).toHaveAttribute('data-coupe-partie', 'local');

    // Lien de défi abîmé : message, adresse nettoyée, accueil de la Coupe
    await page.goto('/coupe?defi=pas%20un%20lien');
    await expect(toast(page, 'Ce lien de défi n’est pas valable.')).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === '/coupe' && url.search === '');
    await expect(titre(page)).toBeVisible();
  });

  test('interrupteur « Apparaître dans le classement »', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe');
    await accueilPret(page);
    const apercu = apercuClassement(page);
    await expect(apercu.getByRole('listitem').filter({ hasText: 'Toi' })).toContainText('42');

    await interrupteur(page).click();
    await expect(toast(page, 'Tu n’apparais plus dans le classement de la Coupe')).toBeVisible();
    await expect(interrupteur(page)).not.toBeChecked();
    expect(api.requetesVers('PATCH', '/coupe/settings').map((r) => r.corps)).toEqual([{ opt_in: false }]);
    // Classement relu : plus de ligne « Toi », la raison à la place
    await expect(apercu.getByText('Tu n’apparais pas dans le classement')).toBeVisible();
    await expect(apercu.getByText('Toi', { exact: true })).toHaveCount(0);
    await expect(blocPoints(page)).toContainText('Tu n’apparais pas dans le classement');

    await interrupteur(page).click();
    await expect(toast(page, 'Tu apparais dans le classement de la Coupe')).toBeVisible();
    await expect(interrupteur(page)).toBeChecked();
    expect(api.requetesVers('PATCH', '/coupe/settings').map((r) => r.corps)).toEqual([{ opt_in: false }, { opt_in: true }]);
    await expect(apercu.getByRole('listitem').filter({ hasText: 'Toi' })).toContainText('8e');
  });

  test('refus du serveur : le choix revient, message en français, au tutoiement', async ({ page, api, connecter }) => {
    api.surcharger('PATCH', '/coupe/settings', () => ({ status: 500, json: {} }));
    await connecter(CLIENT);
    await page.goto('/coupe');
    await accueilPret(page);

    await interrupteur(page).click();
    await expect(toast(page, 'Le serveur ne répond pas : réessaie dans un instant.')).toBeVisible();
    await expect(interrupteur(page)).toBeChecked();
  });

  test('exclu des classements par le salon : interrupteur bloqué, avec la raison', async ({ page, api, connecter }) => {
    api.coupeRest.definirEtat(CLIENT.id, { eligible: true, opt_in: false, saison: [42, 16, 6], total: [97, 37, 14] });
    api.coupeRest.exclus.add(`compte-${CLIENT.id}`);
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(titre(page)).toBeVisible();
    // `banned` de GET /coupe/me : rien à tenter, la raison est dite
    await expect(interrupteur(page)).not.toBeChecked();
    await expect(interrupteur(page)).toBeDisabled();
    await expect(page.getByText('Le salon t’a retiré du classement. Contacte-le si tu penses que c’est une erreur.')).toBeVisible();
    expect(api.requetesVers('PATCH', '/coupe/settings')).toEqual([]);
  });

  test('exclu pendant que la page est ouverte : le refus du serveur est affiché tel quel', async ({ page, api, connecter }) => {
    api.coupeRest.definirEtat(CLIENT.id, { eligible: true, opt_in: false, saison: [42, 16, 6], total: [97, 37, 14] });
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(interrupteur(page)).toBeEnabled();
    api.coupeRest.exclus.add(`compte-${CLIENT.id}`);

    await interrupteur(page).click();
    await expect(toast(page, 'Le salon t\'a retiré du classement. Contacte-le si tu penses que c\'est une erreur.')).toBeVisible();
    await expect(interrupteur(page)).not.toBeChecked();
    expect(api.requetesVers('PATCH', '/coupe/settings').map((r) => r.corps)).toEqual([{ opt_in: true }]);
  });

  test('barber dont le téléphone ne reçoit pas les défis : « Pas dispo » ; fiche sans compte : absente', async ({ page, api, connecter }) => {
    api.coupeRest.injoignables.add('emp-kevin');
    api.coupeRest.fichesAvecCompte.delete('emp-romain');
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(tuileBarber(page, 'Dom')).toContainText('Dispo');

    // Kevin est « Dispo » dans Mon espace mais n'a pas activé les notifications : il ne verrait pas le défi
    await expect(tuileBarber(page, 'Kevin')).toContainText('Pas dispo');
    await expect(page.getByRole('button', { name: 'Défier Kevin : pas dispo' })).toBeDisabled();
    // Romain n'a pas de compte : le serveur ne le liste pas
    await expect(tuileBarber(page, 'Romain')).toHaveCount(0);
    await expect(blocBarbers(page).getByRole('listitem')).toHaveCount(2);
  });

  test('paramètres illisibles (503) : « Réessayer » sur place, le lien du défi reste, puis le défi s\'ouvre', async ({ page, api, connecter }) => {
    let panne = true;
    api.surcharger('GET', '/api/apps/public/prod/public-settings/by-id/prod', () => (panne ? { status: 503, json: { error: 'Service indisponible' } } : undefined));
    await connecter(CLIENT);
    await page.goto('/coupe?defi=k3x9a7b2m4q8');

    const alerte = page.getByRole('alert').filter({ hasText: 'Impossible de charger la Coupe du Gang' });
    await expect(alerte).toBeVisible({ timeout: 15_000 });
    await expect(alerte).toContainText('Réessaie dans un instant');
    await expect(page).toHaveURL((url) => url.pathname === '/coupe' && url.searchParams.get('defi') === 'k3x9a7b2m4q8');

    panne = false;
    await alerte.getByRole('button', { name: 'Réessayer' }).click();
    await expect(partie(page)).toHaveAttribute('data-coupe-action', 'defi');
    await expect(page).toHaveURL((url) => url.searchParams.get('defi') === 'k3x9a7b2m4q8');
  });

  test('paramètres injoignables (réseau) : « Pas de connexion internet », sans renvoi à l\'accueil', async ({ page, api, connecter }) => {
    api.surcharger('GET', '/api/apps/public/prod/public-settings/by-id/prod', () => RESEAU_COUPE);
    await connecter(CLIENT);
    await page.goto('/coupe/classement');
    const alerte = page.getByRole('alert').filter({ hasText: 'Pas de connexion internet' });
    await expect(alerte).toBeVisible({ timeout: 15_000 });
    await expect(alerte).toContainText('Vérifie ton réseau');
    await expect(page).toHaveURL((url) => url.pathname === '/coupe/classement');
    await expect(page.getByRole('link', { name: 'Retour à l’accueil' })).toBeVisible();
  });

  test('client sans carte Gang : mention de la première visite, matchs amicaux', async ({ page, api, connecter }) => {
    api.coupeRest.definirEtat(CLIENT.id, { eligible: false, eligible_reason: 'no_card', opt_in: false });
    await connecter(CLIENT);
    await page.goto('/coupe');
    await expect(titre(page)).toBeVisible();

    const points = blocPoints(page);
    const mention = points.getByRole('note');
    await expect(mention).toContainText('Les points arrivent avec ta première visite');
    await expect(mention).toContainText('Ta première visite au salon t’ouvre les Points de Coupe. En attendant, tous tes matchs sont amicaux.');
    await expect(points).toContainText('0');
    await expect(points).toContainText('Tu n’apparais pas dans le classement');
    await expect(blocBarbers(page)).toContainText('En ligne · amical');
    // On peut quand même défier un barber (amical)
    await expect(page.getByRole('button', { name: 'Défier Dom' })).toBeEnabled();
    await expect(interrupteur(page)).not.toBeChecked();
  });

  test('barber connecté : la Coupe s\'ouvre (pas de renvoi vers Mon espace), sans sa propre fiche', async ({ page, api, connecter }) => {
    api.comptes.push({ ...KEVIN, motDePasse: MOT_DE_PASSE, photo_url: null, created_date: '2026-01-15T10:00:00.000Z' });
    await connecter(KEVIN);
    await page.goto('/coupe');

    await expect(titre(page)).toBeVisible();
    await expect(page).toHaveURL(/\/coupe$/);
    await expect(blocPoints(page)).toContainText('81');
    await expect(blocPoints(page)).toContainText(`2e de la saison de ${MOIS}`);
    await expect(tuileBarber(page, 'Dom')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Défier Kevin/ })).toHaveCount(0);
    // Sa ligne du classement est la sienne : « Toi » à la 2e place
    await expect(apercuClassement(page).getByRole('listitem').nth(1)).toContainText('Toi');
  });

  test('admin : les points du salon, sans interrupteur', async ({ page, connecter }) => {
    await connecter(ADMIN);
    await page.goto('/coupe');

    await expect(blocPoints(page)).toContainText('Points de Coupe du salon');
    await expect(blocPoints(page)).toContainText('74');
    await expect(blocPoints(page)).toContainText(`3e de la saison de ${MOIS}`);
    await expect(page.getByText('La ligne « D\'Home Barber » est toujours au classement.')).toBeVisible();
    await expect(interrupteur(page)).toHaveCount(0);
    // La ligne du salon est la sienne, toujours sous le nom du salon
    const ligneSalon = apercuClassement(page).getByRole('listitem').nth(2);
    await expect(ligneSalon).toContainText('D\'Home Barber');
    await expect(ligneSalon.getByRole('img', { name: 'Le salon' })).toBeVisible();
  });

  test('jeu fermé (features.coupe faux) : retour à l\'accueil, aucune route de la Coupe appelée', async ({ page, api, connecter }) => {
    api.donnees.parametresPublics.features.coupe = false;
    await connecter(CLIENT);

    await page.goto('/coupe');
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.getByRole('link', { name: 'Réserver maintenant' })).toBeVisible();

    await page.goto('/coupe/classement?x=1');
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.getByRole('link', { name: 'Réserver maintenant' })).toBeVisible();
    expect(api.requetes.filter((r) => r.chemin.startsWith('/coupe/'))).toEqual([]);
  });

  test('hors connexion : « Pas de connexion internet » puis Réessayer, jeux sans réseau toujours là', async ({ page, api, connecter }) => {
    let horsLigne = true;
    api.surcharger('GET', '/coupe/me', () => (horsLigne ? RESEAU_COUPE : undefined));
    await connecter(CLIENT);
    await page.goto('/coupe');

    const alerte = page.getByRole('alert').filter({ hasText: 'Pas de connexion internet' });
    await expect(alerte).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^Contre le salon/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^À deux sur ce téléphone/ })).toBeVisible();

    horsLigne = false;
    await alerte.getByRole('button', { name: 'Réessayer' }).click();
    await expect(blocPoints(page)).toContainText(`8e de la saison de ${MOIS}`);
    await expect(alerte).toHaveCount(0);
  });

  test('sans session : connexion demandée, avec retour au défi', async ({ page }) => {
    await page.goto('/coupe?defi=k3x9a7b2m4q8');
    await expect(page).toHaveURL((url) => url.pathname === '/login'
      && url.searchParams.get('redirect') === '/coupe?defi=k3x9a7b2m4q8');
  });
});

test.describe('La Coupe du Gang : classement', () => {
  const podium = (page) => page.getByRole('list', { name: 'Podium' }).getByRole('listitem');
  const suite = (page) => page.getByRole('list', { name: 'Suite du classement' }).getByRole('listitem');

  test('Saison puis Général : podium, liste, sa ligne, étoile du salon, ciseaux des barbers', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe/classement');

    await expect(page.getByRole('heading', { level: 1, name: 'Classement' })).toBeVisible();
    const saison = page.getByRole('tab', { name: `Saison · ${MOIS}` });
    await expect(saison).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(`${texteFinDeSaison()} Clients et barbers dans le même classement.`)).toBeVisible();

    // Podium : 2e, 1er, 3e
    await expect(podium(page)).toHaveCount(3);
    await expect(podium(page).nth(0)).toContainText('Kevin');
    await expect(podium(page).nth(0)).toContainText('81 pts');
    await expect(podium(page).nth(0).getByRole('img', { name: 'Barber' })).toBeVisible();
    await expect(podium(page).nth(1)).toContainText('Lucas M.');
    await expect(podium(page).nth(1)).toContainText('87 pts');
    await expect(podium(page).nth(2)).toContainText('D\'Home Barber');
    await expect(podium(page).nth(2).getByRole('img', { name: 'Le salon' })).toBeVisible();

    // Suite : 4e à 10e, sa ligne au 8e rang
    await expect(suite(page)).toHaveCount(7);
    await expect(suite(page).nth(0)).toContainText('Sarah K.');
    await expect(suite(page).nth(0)).toContainText('24 V · 3 D');
    await expect(suite(page).nth(1).getByRole('img', { name: 'Barber' })).toBeVisible();
    const moi = suite(page).filter({ hasText: 'Toi' });
    await expect(moi).toContainText('8e');
    await expect(moi).toContainText('16 V · 6 D');
    await expect(moi).toContainText('42 points');
    await expect(interrupteur(page)).toBeChecked();

    // Général
    await page.getByRole('tab', { name: 'Général' }).click();
    await expect(page.getByRole('tab', { name: 'Général' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Tous les matchs depuis le début. Clients et barbers dans le même classement.')).toBeVisible();
    await expect(podium(page).nth(1)).toContainText('D\'Home Barber');
    await expect(podium(page).nth(1)).toContainText('240 pts');
    await expect(podium(page).nth(0)).toContainText('Lucas M.');
    await expect(podium(page).nth(2)).toContainText('Kevin');
    await expect(suite(page).filter({ hasText: 'Toi' })).toContainText('7e');
    await expect(suite(page).filter({ hasText: 'Toi' })).toContainText('97 points');
    expect(api.requetesVers('GET', '/coupe/leaderboard').map((r) => r.query.scope)).toEqual(expect.arrayContaining(['season', 'total']));

    // Flèches du clavier entre les onglets
    await page.getByRole('tab', { name: 'Général' }).press('ArrowLeft');
    await expect(saison).toHaveAttribute('aria-selected', 'true');
    await expect(saison).toBeFocused();
  });

  test('fiche d\'un joueur : signaler puis bloquer, débloquer depuis l\'accueil', async ({ page, api, connecter }) => {
    await connecter(CLIENT);
    await page.goto('/coupe/classement');
    await expect(suite(page).first()).toContainText('Sarah K.');

    // Signaler Sarah K.
    await page.getByRole('button', { name: /Sarah K\./ }).click();
    const fiche = page.getByRole('dialog');
    await expect(fiche.getByRole('heading', { name: 'Sarah K.' })).toBeVisible();
    await expect(fiche).toContainText(/69\s*pts/);
    await fiche.getByRole('button', { name: 'Signaler' }).click();
    const envoyer = fiche.getByRole('button', { name: 'Envoyer' });
    await expect(envoyer).toBeDisabled();
    await fiche.getByLabel('Comportement').check();
    await fiche.getByLabel('Précisions (facultatif)').fill('Réactions en boucle');
    await envoyer.click();
    await expect(toast(page, 'Signalement envoyé')).toBeVisible();
    await expect(fiche).toHaveCount(0);
    expect(api.requetesVers('POST', '/coupe/report').map((r) => r.corps)).toEqual([
      { key_hash: 'joueur-sarah', reason: 'behavior', details: 'Réactions en boucle' },
    ]);

    // Bloquer Yanis B.
    await page.getByRole('button', { name: /Yanis B\./ }).click();
    await fiche.getByRole('button', { name: 'Bloquer' }).click();
    await expect(fiche.getByRole('heading', { name: 'Bloquer Yanis B. ?' })).toBeVisible();
    await fiche.getByRole('button', { name: 'Bloquer' }).click();
    await expect(toast(page, 'Yanis B. ne pourra plus te défier')).toBeVisible();
    await expect(fiche.getByRole('button', { name: 'Débloquer' })).toBeVisible();
    expect(api.requetesVers('POST', '/coupe/block').map((r) => r.corps)).toEqual([{ key_hash: 'joueur-yanis' }]);
    await fiche.getByRole('button', { name: 'Fermer' }).click();
    await expect(fiche).toHaveCount(0);
    // Classement relu : Yanis B. n'y est plus, les places des autres ne bougent pas
    await expect(page.getByRole('button', { name: /Yanis B\./ })).toHaveCount(0);
    await expect(suite(page).filter({ hasText: 'Romain' })).toContainText('7e');

    // La ligne du salon n'a ni Signaler ni Bloquer
    await page.getByRole('button', { name: /D'Home Barber/ }).click();
    await expect(fiche.getByRole('heading', { name: 'D\'Home Barber' })).toBeVisible();
    await expect(fiche.getByRole('button', { name: 'Signaler' })).toHaveCount(0);
    await fiche.getByRole('button', { name: 'Fermer' }).click();

    // Sa propre ligne n'ouvre rien
    await expect(suite(page).filter({ hasText: 'Toi' }).getByRole('button')).toHaveCount(0);

    // Accueil de la Coupe : « Joueurs bloqués », Débloquer
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(titre(page)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Joueurs bloqués' })).toBeVisible();
    await page.getByRole('button', { name: 'Débloquer Yanis B.' }).click();
    await expect(toast(page, 'Yanis B. peut de nouveau te défier')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Joueurs bloqués' })).toHaveCount(0);
    expect(api.requetesVers('DELETE', '/coupe/block/joueur-yanis')).toHaveLength(1);
  });

  test('1er bloqué : sa marche du podium reste vide, les autres gardent leur place', async ({ page, api, connecter }) => {
    api.coupeRest.blocages.set(CLIENT.id, [{ key_hash: 'joueur-lucas', name: 'Lucas M.' }]);
    await connecter(CLIENT);
    await page.goto('/coupe/classement');

    await expect(podium(page)).toHaveCount(2);
    await expect(podium(page).nth(0)).toContainText('Kevin');
    await expect(podium(page).nth(0)).toContainText('2e');
    await expect(podium(page).nth(1)).toContainText('D\'Home Barber');
    await expect(podium(page).nth(1)).toContainText('3e');
    await expect(page.getByRole('list', { name: 'Podium' })).not.toContainText('Lucas M.');
    await expect(suite(page).first()).toContainText('4e');
  });

  test('sa ligne au-delà des 50 premiers : à la suite de la liste, et sur l\'accueil', async ({ page, api, connecter }) => {
    for (let i = 0; i < 50; i += 1) {
      api.coupeRest.joueurs.push({ cle: `joueur-extra-${i}`, nom: `Joueur ${i} X.`, role: 'user', saison: [45 + i, 15 + i, 0], total: [45 + i, 15 + i, 0], opt_in: true });
    }
    await connecter(CLIENT);
    await page.goto('/coupe/classement');

    // 57 joueurs devant : 50 lignes renvoyées (podium + 47), puis « Toi » au 58e rang
    await expect(suite(page).filter({ hasText: 'Toi' })).toContainText('58e');
    await expect(suite(page).filter({ hasText: 'Toi' })).toContainText('16 V · 6 D');
    await expect(suite(page)).toHaveCount(47 + 1);

    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(titre(page)).toBeVisible();
    await expect(apercuClassement(page).getByRole('listitem').filter({ hasText: 'Toi' })).toContainText('58e');
    await expect(blocPoints(page)).toContainText(`58e de la saison de ${MOIS}`);
  });

  test('classement vide', async ({ page, api, connecter }) => {
    for (const j of api.coupeRest.joueurs) j.opt_in = false;
    api.coupeRest.joueurs.find((j) => j.cle === 'salon').saison = [0, 0, 0];
    api.coupeRest.definirEtat(CLIENT.id, { eligible: true, opt_in: true, saison: [0, 0, 0], total: [0, 0, 0] });
    await connecter(CLIENT);
    await page.goto('/coupe/classement');
    // Le salon (sans match) n'apparaît pas : personne n'est classé
    await expect(page.getByText('Personne n’est encore classé cette saison. Joue un match en ligne pour ouvrir le bal.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Podium' })).toHaveCount(0);
  });

  test('sans session : connexion demandée', async ({ page }) => {
    await page.goto('/coupe/classement');
    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === '/coupe/classement');
  });
});

// Téléphones étroits, téléphone courant, ordinateur (1366 px : la page reste centrée, sans débord)
for (const largeur of [320, 390, 1366]) {
  test.describe(`La Coupe du Gang à ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: largeur > 1000 ? 900 : 760 } });

    test(`accueil et classement sans défilement horizontal à ${largeur} px`, async ({ page, connecter }) => {
      await connecter(CLIENT);
      await page.goto('/coupe');
      await accueilPret(page);
      await page.getByRole('button', { name: /^Contre le salon/ }).click();
      await page.getByLabel('J\'ai un code').fill('4821');
      await attendreSansDebordement(page, 'l\'accueil de la Coupe');
      expect(await elementsQuiDepassent(page), 'Éléments coupés à droite sur l\'accueil de la Coupe').toEqual([]);

      await page.goto('/coupe/classement');
      await expect(page.getByRole('list', { name: 'Podium' })).toBeVisible();
      await attendreSansDebordement(page, 'le classement de la Coupe');
      expect(await elementsQuiDepassent(page), 'Éléments coupés à droite sur le classement').toEqual([]);
    });
  });
}

test.describe('La Coupe du Gang : console', () => {
  test('aucune erreur dans la console sur l\'accueil, le classement et une fiche', async ({ page, connecter, journal }) => {
    await connecter(CLIENT);
    await page.goto('/coupe');
    await accueilPret(page);
    await page.getByRole('link', { name: 'Tout voir' }).click();
    await expect(page.getByRole('list', { name: 'Podium' })).toBeVisible();
    await page.getByRole('button', { name: /Sarah K\./ }).click();
    await expect(page.getByRole('dialog')).toContainText('69');
    await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click();
    await page.getByRole('tab', { name: 'Général' }).click();
    await expect(page.getByRole('list', { name: 'Podium' })).toContainText('240 pts');
    expect(journal.console, 'Erreurs dans la console').toEqual([]);
  });
});
