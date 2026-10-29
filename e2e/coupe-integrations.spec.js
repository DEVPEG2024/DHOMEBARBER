// La Coupe du Gang dans les écrans existants (29 oct. 2026, contrat :
// docs/fonctions/coupe-du-gang-contrat.md, sections 2 et 5.3) : section « Jeux » de l'accueil,
// entrée du fil, bloc de la carte Gang (sous la carte), « Dispo pour un match » et ligne Coupe de la
// carte FUT dans Mon espace, « Défier » sur le profil d'un barber, Admin → La Coupe du Gang.
// Tout est caché sans `features.coupe` (variable Heroku COUPE_WS=off) : aucune route /coupe appelée.
// Les routes REST de la Coupe sont servies par des surcharges propres à ce fichier, au format de
// routes/coupe.js (contrat, section 2), par-dessus le faux serveur.
import { test, expect } from './support/test.js';
import { ADMIN, BARBERS, CLIENT } from './support/donnees.js';
import { jour } from './support/temps.js';
import { saisonCoupe } from './support/mockApi.js';
import { attendreSansDebordement, toast } from './support/outils.js';

const CHEMIN_PARAMETRES = '/api/apps/public/prod/public-settings/by-id/prod';
// Saison de l'horloge figée des tests (mois de Paris du mardi de référence), jamais une date écrite en dur
const { season: SAISON, season_ends_at: FIN_SAISON } = saisonCoupe();
/** « novembre » : mois de la saison simulée, tel que l'app l'écrit. */
const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' })
  .format(new Date(Date.UTC(Number(SAISON.slice(0, 4)), Number(SAISON.slice(5, 7)) - 1, 15)));
/** « Saison de novembre », « Saison d’octobre » (élision devant une voyelle, comme l'app). */
const LIBELLE_SAISON = /^[aeiouyàâéèêîôû]/i.test(MOIS) ? `Saison d’${MOIS}` : `Saison de ${MOIS}`;
const ilYa = (min) => new Date(Date.now() - min * 60000).toISOString();

/** Compte barber relié à la fiche de Kevin (Mon espace). */
const KEVIN = {
  id: 'user-kevin', email: 'kevin.compte@dhomebarber.fr', full_name: 'Kevin Barber', phone: '',
  role: 'barber', employee_id: BARBERS.kevin.id, permissions: ['agenda'],
};

/** Le serveur dit si le jeu est ouvert (`features.coupe` des paramètres publics). */
function drapeauCoupe(api, ouvert) {
  api.donnees.parametresPublics.features.coupe = ouvert;
}

/** `GET /coupe/me` : client 8e de la saison, quatre derniers matchs (un amical). */
const moi = (surcharge = {}) => ({
  season: SAISON,
  season_ends_at: FIN_SAISON,
  eligible: true,
  eligible_reason: null,
  opt_in: true,
  season_stats: { points: 42, rank: 8, wins: 16, losses: 6, matches: 22 },
  total_stats: { points: 97, rank: 5, wins: 40, losses: 23, matches: 63 },
  recent: [
    { ended_at: ilYa(30), won: true, cancelled: false, score: [3, 1], opponent: { name: 'Kevin', role: 'barber' }, delta: 3, ranked: true },
    { ended_at: ilYa(60), won: true, cancelled: false, score: [3, 2], opponent: { name: 'Kevin', role: 'barber' }, delta: 0, ranked: false },
    { ended_at: ilYa(90), won: false, cancelled: false, score: [2, 3], opponent: { name: 'Sarah K.', role: 'user' }, delta: -1, ranked: true },
    { ended_at: ilYa(120), won: false, cancelled: false, score: [1, 3], opponent: { name: 'Hugo L.', role: 'user' }, delta: -1, ranked: true },
  ],
  ...surcharge,
});

/** `GET /coupe/admin/overview` : chiffres, deux paires (objets et simples noms), deux signalements. */
const apercu = () => ({
  today: { matches: 12, players: 9 },
  season: { matches: 140, players: 37, ranked: 118 },
  top_pairs: [
    { a: { name: 'Lucas M.', role: 'user' }, b: { name: 'Kevin', role: 'barber' }, matches: 23, ranked: 20 },
    { a: 'Sarah K.', b: { name: "D'Home Barber", role: 'salon' }, matches: 9, ranked: 9 },
  ],
  reports: [
    {
      id: 'rep-1', reported_name: 'Bad N.', reason: 'name', details: 'Pseudo insultant', created_at: ilYa(45), status: 'pending',
      reported_user_id: 'user-bad', reported_email: 'bad.n@exemple.fr', reported_key_hash: 'cle-bad',
    },
    {
      id: 'rep-2', reported_name: 'Yanis B.', reason: 'cheating', details: null, created_at: ilYa(3000), status: 'handled',
      // Compte supprimé depuis : ni email ni fiche
      reported_user_id: null, reported_email: null, reported_key_hash: null,
    },
  ],
});

/**
 * Routes REST de la Coupe, état en mémoire. `barbers` : `GET /coupe/barbers` ; `classement` :
 * lignes du classement de la saison ; `apercu` : null → 404 `disabled` (jeu coupé).
 */
function installerCoupe(api, { me = moi(), barbers = [], classement = [], vueAdmin = apercu() } = {}) {
  const etat = { me, barbers, classement, vueAdmin };
  api.surcharger('GET', '/coupe/me', () => ({ json: etat.me }));
  api.surcharger('GET', '/coupe/barbers', () => ({ json: etat.barbers }));
  api.surcharger('GET', '/coupe/leaderboard', (req) => ({
    json: {
      scope: req.query.scope === 'total' ? 'total' : 'season',
      season: SAISON,
      season_ends_at: FIN_SAISON,
      rows: etat.classement,
      me: { rank: null, points: 0, wins: 0, losses: 0, matches: 0, opt_in: false },
    },
  }));
  api.surcharger('PATCH', '/coupe/availability', (req) => {
    if (req.compte?.role !== 'barber' || !req.compte.employee_id) return { status: 403, json: { error: 'Réservé aux barbers', code: 'not_barber' } };
    const dispo = req.corps?.available === true;
    const fiche = api.tables.Employee.find((e) => e.id === req.compte.employee_id);
    if (fiche) fiche.coupe_available = dispo;
    etat.barbers = etat.barbers.map((b) => (b.employee_id === req.compte.employee_id ? { ...b, available: dispo && !b.busy } : b));
    return { json: { available: dispo } };
  });
  api.surcharger('GET', '/coupe/admin/overview', (req) => {
    if (req.compte?.role !== 'admin') return { status: 403, json: { error: 'Accès refusé' } };
    if (!etat.vueAdmin) return { status: 404, json: { error: 'La Coupe du Gang est coupée', code: 'disabled' } };
    return { json: etat.vueAdmin };
  });
  api.surcharger('PATCH', /^\/coupe\/admin\/reports\/[^/]+$/, (req) => {
    const id = req.chemin.split('/').pop();
    const signalement = etat.vueAdmin?.reports.find((r) => r.id === id);
    if (!signalement) return { status: 404, json: { error: 'Signalement introuvable', code: 'not_found' } };
    signalement.status = req.corps?.status;
    return { json: { status: signalement.status } };
  });
  return etat;
}

/** Carte Gang Or d'un client (page /gang-card). */
const CARTE_OR = {
  tier: 'or', tier_label: 'Or', edition: null, public_edition: null, name: 'Camille T.', photo_url: null,
  serial: 42, pos: 'CLA', score: 74, stats: { FID: 70, REG: 72, PON: 99, STY: 61, GNG: 40, FRA: 88 },
  visits: 12, first_visit: jour(-300), last_visit: jour(-14), days_since_last: 14, barber: 'Kevin',
  favorite: 'Coupe', next: { tier: 'orrare', label: 'Or holo', visits_needed: 6, progress: 33 },
  badges: [{ key: 'premiere_coupe', emoji: '🎉', label: 'Première coupe', description: 'Ta toute première visite au salon', unlocked: true, progress: null }],
};

function installerCarteGang(api, carte = CARTE_OR) {
  api.surcharger('GET', '/gang-card/me', () => ({
    json: {
      card: carte, seen_tier: carte?.tier ?? null, level_up: false, leaderboard_opt_in: false,
      tiers: [], seen_badges: ['premiere_coupe'], new_badges: [], upcoming: false,
    },
  }));
  api.surcharger('GET', '/gang-card/leaderboard', () => ({ json: { since: jour(-90), days: 90, entries: [] } }));
}

/** Réponses des paramètres publics reçues par chaque page (compteur posé avant la navigation). */
const parametresRecus = new WeakMap();
test.beforeEach(({ page }) => {
  parametresRecus.set(page, 0);
  page.on('requestfinished', (requete) => {
    if (requete.method() === 'GET' && requete.url().includes(CHEMIN_PARAMETRES)) {
      parametresRecus.set(page, (parametresRecus.get(page) || 0) + 1);
    }
  });
});

/**
 * Toutes les lectures des paramètres publics ont reçu leur réponse, puis l'app a eu deux images pour
 * en tirer les conséquences : un écran qui afficherait la Coupe malgré le drapeau éteint l'aurait
 * déjà montrée et aurait lancé ses requêtes `/coupe`. (Pas d'attente du réseau au repos : la mesure
 * d'audience envoie un lot toutes les 15 s.)
 */
async function attendreParametres(api, page) {
  await expect.poll(() => {
    const envoyees = api.requetesVers('GET', CHEMIN_PARAMETRES).length;
    return envoyees > 0 && (parametresRecus.get(page) || 0) >= envoyees;
  }).toBe(true);
  await page.evaluate(() => new Promise((fin) => requestAnimationFrame(() => requestAnimationFrame(() => fin()))));
}

const appelsCoupe = (api) => api.requetes.filter((r) => /^\/coupe(\/|$)/.test(r.chemin));

test.describe('La Coupe du Gang : accueil', () => {
  test('section « Jeux » après « Comme la dernière fois » : tes points, « Jouer » et les deux accès directs', async ({ page, api, connecter }) => {
    drapeauCoupe(api, true);
    installerCoupe(api);
    await connecter(CLIENT);
    await page.goto('/');

    const section = page.getByRole('region', { name: 'Jeux' });
    await expect(section.getByRole('heading', { name: 'Jeux', exact: true })).toBeVisible();
    await expect(section.getByText('La Coupe du Gang')).toBeVisible();
    // Le seul titre « La Coupe du Gang » reste celui de l'écran du jeu (e2e/coupe.spec.js)
    await expect(page.getByRole('heading', { name: 'La Coupe du Gang' })).toHaveCount(0);
    await expect(section.getByText('42', { exact: true })).toBeVisible();
    await expect(section.getByText(`8e de la ${LIBELLE_SAISON.toLowerCase()}`)).toBeVisible();
    await expect(section.getByRole('link', { name: 'Jouer', exact: true })).toHaveAttribute('href', '/coupe');
    await expect(section.getByRole('link', { name: /Contre le salon/ })).toHaveAttribute('href', '/coupe?mode=bot&level=apprenti');
    await expect(section.getByRole('link', { name: /À deux/ })).toHaveAttribute('href', '/coupe?mode=local');

    // Ordre par défaut : après « Comme la dernière fois » (ici le prochain rendez-vous), avant « Le Gang »
    const y = async (loc) => (await loc.boundingBox()).y;
    const rebook = page.getByText('Votre prochain rendez-vous');
    await expect(rebook).toBeVisible();
    const yJeux = await y(section);
    expect(yJeux).toBeGreaterThan(await y(rebook));
    expect(yJeux).toBeLessThan(await y(page.getByRole('heading', { name: 'Le Gang', exact: true })));
  });

  test('sans le drapeau : ni section « Jeux » ni appel aux routes de la Coupe', async ({ page, api, connecter }) => {
    drapeauCoupe(api, false);
    installerCoupe(api);
    await connecter(CLIENT);
    await page.goto('/');
    await attendreParametres(api, page);
    await expect(page.getByRole('heading', { name: 'Le Gang', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Jeux', exact: true })).toHaveCount(0);
    await expect(page.getByText('La Coupe du Gang')).toHaveCount(0);
    expect(appelsCoupe(api)).toEqual([]);
  });

  test('l\'admin place « Jeux » dans « Organiser l\'accueil », même quand le jeu est coupé', async ({ page, api, connecter }) => {
    drapeauCoupe(api, false);
    await connecter(ADMIN);
    await page.goto('/');
    await page.getByRole('button', { name: 'Organiser l\'accueil' }).click();
    await expect(page.getByText('Jeux', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Points de Coupe du client et « Jouer »/)).toBeVisible();
    await page.getByRole('button', { name: 'Sauvegarder' }).click();
    await expect(toast(page, 'Accueil enregistré')).toBeVisible();
    const envoi = api.requetesVers('PUT', '/entities/SalonSettings/settings-1').at(-1);
    const ordre = envoi.corps.homepage_order;
    expect(ordre).toContain('games');
    expect(ordre.indexOf('games')).toBe(ordre.indexOf('rebook') + 1);
    expect(appelsCoupe(api)).toEqual([]);
  });
});

test.describe('La Coupe du Gang : fil', () => {
  test('entrée compacte en tête du fil, avant les publications', async ({ page, api, connecter }) => {
    drapeauCoupe(api, true);
    installerCoupe(api);
    installerCarteGang(api);
    api.tables.Post.push({ id: 'p-1', author_name: 'Yanis K.', author_role: 'user', author_photo_url: null, content: 'Merci Kevin pour la coupe !', image_url: null, created_at: ilYa(30) });
    await connecter(CLIENT);
    await page.goto('/feed');

    const entree = page.getByRole('link', { name: /La Coupe du Gang/ });
    await expect(entree).toBeVisible();
    await expect(entree).toContainText('Joue contre les barbers');
    await expect(entree).toHaveAttribute('href', '/coupe');
    const publication = page.getByText('Merci Kevin pour la coupe !');
    await expect(publication).toBeVisible();
    expect((await entree.boundingBox()).y).toBeLessThan((await publication.boundingBox()).y);
    // L'entrée ne lit rien de plus (pas de points)
    expect(appelsCoupe(api)).toEqual([]);
  });

  test('sans le drapeau : pas d\'entrée dans le fil', async ({ page, api, connecter }) => {
    drapeauCoupe(api, false);
    installerCarteGang(api);
    api.tables.Post.push({ id: 'p-1', author_name: 'Yanis K.', author_role: 'user', author_photo_url: null, content: 'Merci Kevin pour la coupe !', image_url: null, created_at: ilYa(30) });
    await connecter(CLIENT);
    await page.goto('/feed');
    await expect(page.getByText('Merci Kevin pour la coupe !')).toBeVisible();
    await attendreParametres(api, page);
    await expect(page.getByRole('link', { name: /La Coupe du Gang/ })).toHaveCount(0);
  });
});

test.describe('La Coupe du Gang : page de la carte Gang', () => {
  test('bloc sous la carte : points, rang, victoires, défaites, 3 derniers matchs et « Jouer à la Coupe »', async ({ page, api, connecter }) => {
    drapeauCoupe(api, true);
    installerCoupe(api);
    installerCarteGang(api);
    await connecter(CLIENT);
    await page.goto('/gang-card');

    const bloc = page.getByRole('region', { name: 'La Coupe du Gang' });
    await expect(bloc).toBeVisible();
    await expect(bloc.getByText(LIBELLE_SAISON)).toBeVisible();
    await expect(bloc.getByText('42', { exact: true })).toBeVisible();
    await expect(bloc.getByText('8e', { exact: true })).toBeVisible();
    await expect(bloc.getByText('16', { exact: true })).toBeVisible();
    await expect(bloc.getByText('victoires', { exact: true })).toBeVisible();
    await expect(bloc.getByText('6', { exact: true })).toBeVisible();
    await expect(bloc.getByText('défaites', { exact: true })).toBeVisible();

    const matchs = bloc.getByRole('listitem');
    await expect(matchs).toHaveCount(3);
    await expect(matchs.nth(0)).toContainText('3 – 1 contre Kevin');
    await expect(matchs.nth(0)).toContainText('+3');
    await expect(matchs.nth(1)).toContainText('amical');
    await expect(matchs.nth(2)).toContainText('2 – 3 contre Sarah K.');
    await expect(matchs.nth(2)).toContainText('−1');
    await expect(bloc.getByText('Hugo L.')).toHaveCount(0);
    await expect(bloc.getByRole('link', { name: 'Jouer à la Coupe' })).toHaveAttribute('href', '/coupe');

    // Sous la carte (jamais dessus) : après « Partager en story », et rien de la Coupe ailleurs sur la page
    const partager = page.getByRole('button', { name: 'Partager en story' });
    const boitePartage = await partager.boundingBox();
    expect((await bloc.boundingBox()).y).toBeGreaterThan(boitePartage.y + boitePartage.height);
    await expect(page.getByText('La Coupe du Gang')).toHaveCount(1);
  });

  test('sans carte Gang : le bloc dit que les matchs sont amicaux', async ({ page, api, connecter }) => {
    drapeauCoupe(api, true);
    installerCoupe(api, {
      me: moi({ eligible: false, eligible_reason: 'no_card', opt_in: false, season_stats: { points: 0, rank: null, wins: 0, losses: 0, matches: 0 }, recent: [] }),
    });
    installerCarteGang(api, null);
    await connecter(CLIENT);
    await page.goto('/gang-card');
    await expect(page.getByText('Ta carte arrive après ta première visite au salon')).toBeVisible();
    const bloc = page.getByRole('region', { name: 'La Coupe du Gang' });
    await expect(bloc).toBeVisible();
    await expect(bloc.getByText(/arrivent avec ta carte Gang/)).toBeVisible();
    await expect(bloc.getByText(/Aucun match pour l’instant/)).toBeVisible();
  });

  test('sans le drapeau : pas de bloc ni d\'appel à la Coupe', async ({ page, api, connecter }) => {
    drapeauCoupe(api, false);
    installerCarteGang(api);
    await connecter(CLIENT);
    await page.goto('/gang-card');
    await expect(page.getByRole('button', { name: 'Partager en story' })).toBeVisible();
    await attendreParametres(api, page);
    await expect(page.getByText('La Coupe du Gang')).toHaveCount(0);
    expect(appelsCoupe(api)).toEqual([]);
  });

  test('jeu coupé en cours de route (404 disabled, drapeau encore vrai) : « La Coupe fait une pause », sans « Jouer »', async ({ page, api, connecter }) => {
    drapeauCoupe(api, true);
    installerCarteGang(api);
    api.surcharger('GET', '/coupe/me', () => ({ status: 404, json: { error: 'La Coupe du Gang est fermée pour le moment', code: 'disabled' } }));
    await connecter(CLIENT);
    await page.goto('/gang-card');
    const bloc = page.getByRole('region', { name: 'La Coupe du Gang' });
    await expect(bloc.getByRole('alert')).toContainText('La Coupe fait une pause', { timeout: 10_000 });
    await expect(bloc.getByText('Le serveur n’a pas répondu', { exact: false })).toHaveCount(0);
    await expect(bloc.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
    await expect(bloc.getByRole('link', { name: 'Jouer à la Coupe' })).toHaveCount(0);
  });
});

test.describe('La Coupe du Gang : Mon espace d\'un barber', () => {
  test.beforeEach(({ api }) => {
    api.comptes.push({ ...KEVIN, motDePasse: 'x', birth_date: null, photo_url: null, created_date: '2026-01-15T10:00:00.000Z' });
  });

  test('« Dispo pour un match » s\'allume et s\'éteint ; la carte FUT porte la ligne Coupe', async ({ page, api, connecter }) => {
    drapeauCoupe(api, true);
    installerCoupe(api, {
      me: moi({ season_stats: { points: 81, rank: 2, wins: 27, losses: 6, matches: 33 } }),
      barbers: [{ employee_id: BARBERS.kevin.id, name: 'Kevin', photo_url: null, available: false, busy: false }],
    });
    await connecter(KEVIN);
    await page.goto('/admin/me');

    await expect(page.getByText('COUPE · 81 PTS · 2e')).toBeVisible();
    const dispo = page.getByRole('switch', { name: 'Dispo pour un match' });
    await expect(dispo).toBeEnabled();
    await expect(dispo).not.toBeChecked();
    await expect(page.getByText('Coupé tout seul pendant tes rendez-vous', { exact: false })).toBeVisible();
    await expect(page.getByText('27 – 6')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Jouer à la Coupe' })).toHaveAttribute('href', '/coupe');

    await dispo.click();
    await expect(toast(page, 'Tu es dispo')).toBeVisible();
    await expect(dispo).toBeChecked();
    expect(api.requetesVers('PATCH', '/coupe/availability').at(-1).corps).toEqual({ available: true });

    await dispo.click();
    await expect(toast(page, 'Tu n’es plus dispo pour un match')).toBeVisible();
    await expect(dispo).not.toBeChecked();
    expect(api.requetesVers('PATCH', '/coupe/availability').at(-1).corps).toEqual({ available: false });
  });

  test('pendant un rendez-vous, l\'interrupteur reste allumé et dit « En rendez-vous »', async ({ page, api, connecter }) => {
    drapeauCoupe(api, true);
    api.tables.Employee.find((e) => e.id === BARBERS.kevin.id).coupe_available = true;
    installerCoupe(api, {
      barbers: [{ employee_id: BARBERS.kevin.id, name: 'Kevin', photo_url: null, available: false, busy: true }],
    });
    await connecter(KEVIN);
    await page.goto('/admin/me');
    const dispo = page.getByRole('switch', { name: 'Dispo pour un match' });
    await expect(dispo).toBeChecked();
    await expect(page.getByText('En rendez-vous : les défis reprennent après.')).toBeVisible();
  });

  test('sans le drapeau : ni interrupteur ni ligne Coupe', async ({ page, api, connecter }) => {
    drapeauCoupe(api, false);
    await connecter(KEVIN);
    await page.goto('/admin/me');
    await expect(page.getByText('Double tap pour voir le dos de ta carte')).toBeVisible();
    await attendreParametres(api, page);
    await expect(page.getByRole('switch', { name: 'Dispo pour un match' })).toHaveCount(0);
    await expect(page.getByText(/COUPE ·/)).toHaveCount(0);
    expect(appelsCoupe(api)).toEqual([]);
  });

  test('« Dispo » allumé mais pas de notifications sur ce téléphone : le dire, et les activer', async ({ page, api, connecter }) => {
    // Notifications du navigateur simulées (pas de service worker dans les tests) : autorisées au clic
    await page.addInitScript(() => {
      const abonnement = {
        endpoint: 'https://push.exemple.fr/abonnement-kevin',
        toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'cle', auth: 'secret' } }; },
      };
      const enregistrement = { pushManager: { subscribe: async () => abonnement, getSubscription: async () => abonnement } };
      let permission = 'default';
      Object.defineProperty(window.Notification, 'permission', { configurable: true, get: () => permission });
      window.Notification.requestPermission = async () => { permission = 'granted'; return 'granted'; };
      navigator.serviceWorker.register = async () => enregistrement;
      navigator.serviceWorker.getRegistration = async () => enregistrement;
      Object.defineProperty(navigator.serviceWorker, 'ready', { configurable: true, get: () => Promise.resolve(enregistrement) });
    });
    drapeauCoupe(api, true);
    api.tables.Employee.find((e) => e.id === BARBERS.kevin.id).coupe_available = true;
    const etat = installerCoupe(api, {
      barbers: [{ employee_id: BARBERS.kevin.id, name: 'Kevin', photo_url: null, available: false, busy: false, reachable: false }],
    });
    api.surcharger('GET', '/push/vapid-key', () => ({ json: { publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa' } }));
    api.surcharger('POST', '/push/subscribe', () => {
      // Le serveur connaît maintenant un appareil de Kevin : il est joignable
      etat.barbers = etat.barbers.map((b) => ({ ...b, reachable: true, available: true }));
      return { json: { ok: true } };
    });
    await connecter(KEVIN);
    await page.goto('/admin/me');

    await expect(page.getByRole('switch', { name: 'Dispo pour un match' })).toBeChecked();
    const note = page.getByRole('note').filter({ hasText: 'Active les notifications sur ce téléphone pour recevoir les défis' });
    await expect(note).toBeVisible();
    await note.getByRole('button', { name: 'Activer les notifications' }).click();
    await expect(toast(page, 'Notifications activées')).toBeVisible();
    expect(api.requetesVers('POST', '/push/subscribe').length).toBeGreaterThan(0);
    // `reachable` relu : la mention disparaît
    await expect(note).toHaveCount(0);
  });

  test('les barbers ne sont lus qu\'une fois (pas de relecture toutes les 30 s hors de la Coupe)', async ({ page, api, connecter }) => {
    drapeauCoupe(api, true);
    installerCoupe(api, {
      barbers: [{ employee_id: BARBERS.kevin.id, name: 'Kevin', photo_url: null, available: true, busy: false, reachable: true }],
    });
    await connecter(KEVIN);
    await page.goto('/admin/me');
    await expect(page.getByRole('switch', { name: 'Dispo pour un match' })).toBeVisible();
    await expect.poll(() => api.requetesVers('GET', '/coupe/barbers').length).toBe(1);
    await page.clock.runFor(95_000);
    expect(api.requetesVers('GET', '/coupe/barbers')).toHaveLength(1);
  });
});

test.describe('La Coupe du Gang : profil d\'un barber', () => {
  test('« Défier » seulement quand le barber est dispo ; ligne Coupe s\'il est au classement', async ({ page, api, connecter }) => {
    drapeauCoupe(api, true);
    installerCoupe(api, {
      barbers: [
        { employee_id: BARBERS.kevin.id, name: 'Kevin', photo_url: null, available: true, busy: false },
        { employee_id: BARBERS.dom.id, name: 'Dom', photo_url: null, available: false, busy: false },
      ],
      classement: [
        { rank: 1, key_hash: 'k-lucas', name: 'Lucas M.', role: 'user', avatar_url: null, employee_id: null, points: 87, wins: 30, losses: 3, matches: 33, me: false },
        { rank: 2, key_hash: 'k-kevin', name: 'Kevin', role: 'barber', avatar_url: null, employee_id: BARBERS.kevin.id, points: 81, wins: 27, losses: 6, matches: 33, me: false },
      ],
    });
    await connecter(CLIENT);

    await page.goto(`/barber/${BARBERS.kevin.id}`);
    const defier = page.getByRole('link', { name: 'Défier Kevin' });
    await expect(defier).toBeVisible();
    await expect(defier).toHaveAttribute('href', `/coupe?challenge=${BARBERS.kevin.id}`);
    await expect(page.getByText('Dispo pour un match')).toBeVisible();
    await expect(page.getByText('COUPE · 81 PTS · 2e')).toBeVisible();

    // Dom, pas dispo et absent du classement : on passe à son profil dans l'app (liste déjà lue)
    await page.getByRole('button', { name: 'Dom', exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/barber/${BARBERS.dom.id}$`));
    await expect(page.getByRole('link', { name: 'Prendre rendez-vous avec Dom' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Défier/ })).toHaveCount(0);
    await expect(page.getByText(/COUPE ·/)).toHaveCount(0);
  });

  test('les barbers ne sont lus qu\'une fois sur le profil (pas de relecture toutes les 30 s)', async ({ page, api, connecter }) => {
    drapeauCoupe(api, true);
    installerCoupe(api, { barbers: [{ employee_id: BARBERS.kevin.id, name: 'Kevin', photo_url: null, available: true, busy: false, reachable: true }] });
    await connecter(CLIENT);
    await page.goto(`/barber/${BARBERS.kevin.id}`);
    await expect(page.getByRole('link', { name: 'Défier Kevin' })).toBeVisible();
    const lectures = api.requetesVers('GET', '/coupe/barbers').length;
    await page.clock.runFor(95_000);
    expect(api.requetesVers('GET', '/coupe/barbers')).toHaveLength(lectures);
  });

  test('sans le drapeau : pas de « Défier »', async ({ page, api, connecter }) => {
    drapeauCoupe(api, false);
    installerCoupe(api, { barbers: [{ employee_id: BARBERS.kevin.id, name: 'Kevin', photo_url: null, available: true, busy: false }] });
    await connecter(CLIENT);
    await page.goto(`/barber/${BARBERS.kevin.id}`);
    await expect(page.getByRole('link', { name: 'Prendre rendez-vous avec Kevin' })).toBeVisible();
    await attendreParametres(api, page);
    await expect(page.getByRole('link', { name: /Défier/ })).toHaveCount(0);
    expect(appelsCoupe(api)).toEqual([]);
  });
});

test.describe('La Coupe du Gang : Admin', () => {
  test('chiffres du jour et de la saison, paires, signalements traités, rappel de la coupure', async ({ page, api, connecter }) => {
    drapeauCoupe(api, true);
    const etat = installerCoupe(api);
    await connecter(ADMIN);
    await page.goto('/admin/coupe');

    await expect(page.getByRole('heading', { level: 1, name: 'La Coupe du Gang' })).toBeVisible();
    // Entrée du menu admin (catégorie Clients)
    await expect(page.locator('aside').getByRole('link', { name: 'La Coupe du Gang' })).toHaveAttribute('href', '/admin/coupe');

    await expect(page.getByRole('region', { name: 'Aujourd’hui' }).getByText('12', { exact: true })).toBeVisible();
    await expect(page.getByText('140', { exact: true })).toBeVisible();
    await expect(page.getByText('118', { exact: true })).toBeVisible();

    await expect(page.getByText('Paires qui jouent le plus ensemble')).toBeVisible();
    await expect(page.getByText('Lucas M.', { exact: true })).toBeVisible();
    await expect(page.getByText('dont 20 à points')).toBeVisible();
    await expect(page.getByText("D'Home Barber", { exact: true })).toBeVisible();
    await expect(page.getByTitle('Le salon')).toHaveCount(1);

    await expect(page.getByText('1 à traiter')).toBeVisible();
    const signalement = page.getByRole('listitem').filter({ hasText: 'Bad N.' });
    await expect(signalement).toContainText('Nom choquant');
    await expect(signalement).toContainText('Pseudo insultant');
    await signalement.getByRole('button', { name: 'Traité' }).click();
    await expect(toast(page, 'Signalement traité')).toBeVisible();
    expect(api.requetesVers('PATCH', '/coupe/admin/reports/rep-1').at(-1).corps).toEqual({ status: 'handled' });
    expect(etat.vueAdmin.reports[0].status).toBe('handled');
    await expect(signalement.getByRole('button', { name: 'Traité' })).toHaveCount(0);
    await expect(page.getByText('1 à traiter')).toHaveCount(0);

    await expect(page.getByText('COUPE_WS=off').first()).toBeVisible();
  });

  test('compte signalé : email, fiche du client, exclure puis réintégrer, remettre ses points à zéro', async ({ page, api, connecter }) => {
    drapeauCoupe(api, true);
    installerCoupe(api);
    // Le joueur signalé est connu du serveur (sinon 404 `not_found`)
    api.coupeRest.joueurs.push({ cle: 'cle-bad', nom: 'Bad N.', role: 'user', saison: [5, 2, 1], total: [5, 2, 1], opt_in: true });
    api.surcharger('GET', /^\/gang-card\/admin\/client\/user-bad$/, () => ({
      json: {
        generated_at: new Date().toISOString(),
        account: {
          id: 'user-bad', email: 'bad.n@exemple.fr', full_name: 'Bad Nom', phone: null, birth_date: null,
          created_at: '2026-01-15T10:00:00.000Z', nudged_at: null, leaderboard_opt_in: false, leaderboard_banned_at: null,
        },
        card: null, tiers: [], badges: [], visits: [], missed: [], upcoming: [], absences: 0, client_cancels: 0,
      },
    }));
    await connecter(ADMIN);
    await page.goto('/admin/coupe');

    // (filtré par ses précisions : les toasts « Bad N. … » sont aussi des éléments de liste)
    const signalement = page.getByRole('listitem').filter({ hasText: 'Pseudo insultant' });
    await expect(signalement.getByRole('link', { name: 'bad.n@exemple.fr' })).toHaveAttribute('href', 'mailto:bad.n@exemple.fr');
    // Compte supprimé depuis le signalement : ni email, ni fiche, ni action
    const supprime = page.getByRole('listitem').filter({ hasText: 'Yanis B.' });
    await expect(supprime).toContainText('Compte supprimé');
    await expect(supprime.getByRole('button', { name: 'Exclure des classements' })).toHaveCount(0);

    // Fiche du client (celle des Cartes Gang)
    await signalement.getByRole('button', { name: 'Fiche du client' }).click();
    const fiche = page.getByRole('dialog', { name: /Bad N\./ });
    await expect(fiche).toContainText('bad.n@exemple.fr');
    await page.keyboard.press('Escape');
    await expect(fiche).toHaveCount(0);

    // Exclure des classements, avec confirmation
    await signalement.getByRole('button', { name: 'Exclure des classements' }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Exclure Bad N. des classements ?' });
    await expect(confirmation).toContainText('ne peut plus s’y remettre lui-même');
    await confirmation.getByRole('button', { name: 'Exclure', exact: true }).click();
    await expect(toast(page, 'Bad N. est exclu des classements')).toBeVisible();
    expect(api.requetesVers('POST', '/coupe/admin/players/cle-bad/ban')).toHaveLength(1);
    expect(api.coupeRest.exclus.has('cle-bad')).toBe(true);
    await expect(signalement).toContainText('Exclu');

    // Réintégrer
    await signalement.getByRole('button', { name: 'Réintégrer' }).click();
    await page.getByRole('alertdialog', { name: 'Réintégrer Bad N. ?' }).getByRole('button', { name: 'Réintégrer' }).click();
    await expect(toast(page, 'Bad N. peut de nouveau apparaître dans les classements')).toBeVisible();
    expect(api.requetesVers('DELETE', '/coupe/admin/players/cle-bad/ban')).toHaveLength(1);
    await expect(signalement.getByRole('button', { name: 'Exclure des classements' })).toBeVisible();

    // Remettre ses points à zéro : « Annuler » ne fait rien, puis confirmé
    await signalement.getByRole('button', { name: 'Remettre ses points à zéro' }).click();
    const remise = page.getByRole('alertdialog', { name: 'Remettre les points de Bad N. à zéro ?' });
    await remise.getByRole('button', { name: 'Annuler' }).click();
    await expect(remise).toHaveCount(0);
    expect(api.requetesVers('POST', '/coupe/admin/players/cle-bad/reset')).toHaveLength(0);
    await signalement.getByRole('button', { name: 'Remettre ses points à zéro' }).click();
    await page.getByRole('alertdialog', { name: 'Remettre les points de Bad N. à zéro ?' }).getByRole('button', { name: 'Remettre à zéro' }).click();
    await expect(toast(page, 'Points de Bad N. remis à zéro')).toBeVisible();
    expect(api.coupeRest.remisAZero).toEqual(['cle-bad']);
  });

  test('jeu coupé : la page le dit, l\'entrée du menu disparaît', async ({ page, api, connecter }) => {
    drapeauCoupe(api, false);
    installerCoupe(api, { vueAdmin: null });
    await connecter(ADMIN);
    await page.goto('/admin/coupe');
    await expect(page.getByText('Le jeu est coupé')).toBeVisible();
    await attendreParametres(api, page);
    await expect(page.locator('aside').getByRole('link', { name: 'La Coupe du Gang' })).toHaveCount(0);
  });
});

for (const largeur of [320, 390]) {
  test.describe(`La Coupe du Gang à ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 760 } });

    test(`pages client sans défilement horizontal ni erreur dans la console à ${largeur} px`, async ({ page, api, connecter, journal }) => {
      drapeauCoupe(api, true);
      installerCoupe(api, {
        barbers: [{ employee_id: BARBERS.kevin.id, name: 'Kevin', photo_url: null, available: true, busy: false }],
        classement: [{ rank: 2, key_hash: 'k-kevin', name: 'Kevin', role: 'barber', avatar_url: null, employee_id: BARBERS.kevin.id, points: 81, wins: 27, losses: 6, matches: 33, me: false }],
      });
      installerCarteGang(api);
      await connecter(CLIENT);

      await page.goto('/');
      await expect(page.getByRole('region', { name: 'Jeux' })).toBeVisible();
      await attendreSansDebordement(page, 'l\'accueil');
      await page.goto('/feed');
      await expect(page.getByRole('link', { name: /La Coupe du Gang/ })).toBeVisible();
      await attendreSansDebordement(page, 'le fil');
      await page.goto('/gang-card');
      await expect(page.getByRole('region', { name: 'La Coupe du Gang' }).getByRole('listitem')).toHaveCount(3);
      await attendreSansDebordement(page, 'la carte Gang');
      await page.goto(`/barber/${BARBERS.kevin.id}`);
      await expect(page.getByRole('link', { name: 'Défier Kevin' })).toBeVisible();
      await attendreSansDebordement(page, 'le profil de Kevin');
      expect(journal.console).toEqual([]);
    });

    test(`Mon espace d'un barber sans défilement horizontal ni erreur dans la console à ${largeur} px`, async ({ page, api, connecter, journal }) => {
      api.comptes.push({ ...KEVIN, motDePasse: 'x', birth_date: null, photo_url: null, created_date: '2026-01-15T10:00:00.000Z' });
      drapeauCoupe(api, true);
      installerCoupe(api, {
        me: moi({ season_stats: { points: 81, rank: 2, wins: 27, losses: 6, matches: 33 } }),
        barbers: [{ employee_id: BARBERS.kevin.id, name: 'Kevin', photo_url: null, available: false, busy: false }],
      });
      await connecter(KEVIN);
      await page.goto('/admin/me');
      await expect(page.getByRole('switch', { name: 'Dispo pour un match' })).toBeVisible();
      await attendreSansDebordement(page, 'Mon espace');
      expect(journal.console).toEqual([]);
    });

    test(`Admin → La Coupe du Gang sans défilement horizontal ni erreur dans la console à ${largeur} px`, async ({ page, api, connecter, journal }) => {
      drapeauCoupe(api, true);
      installerCoupe(api);
      await connecter(ADMIN);
      await page.goto('/admin/coupe');
      await expect(page.getByText('Paires qui jouent le plus ensemble')).toBeVisible();
      await attendreSansDebordement(page, 'Admin → La Coupe du Gang');
      expect(journal.console).toEqual([]);
    });
  });
}
