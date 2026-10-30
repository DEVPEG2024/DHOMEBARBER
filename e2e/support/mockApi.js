/**
 * Faux serveur en mémoire : remplace l'API Heroku pendant les vérifications de bout en bout.
 *
 * Règle absolue : AUCUNE requête n'atteint la production. Tout ce qui part vers un autre domaine
 * que le build local est intercepté par `context.route` :
 *  - l'API (`API_HOTE`) est servie par ce module (entités, connexion, routes dédiées) ;
 *  - une route de l'API non prévue reçoit 501 ET est notée dans `nonPrevues` : la fixture fait
 *    échouer le test (on voit tout de suite qu'une route manque au faux serveur) ;
 *  - les autres domaines (polices Google, CDN, storage.googleapis…) reçoivent une réponse vide ;
 *  - le WebSocket `/ws/live` est neutralisé (`routeWebSocket`), il envoie un compteur fictif ;
 *    `/ws/coupe` (La Coupe du Gang) est servi par un faux serveur de jeu (`support/fauxCoupe.js`) ;
 *    les routes REST de la Coupe (`/coupe/…`) par `FauxCoupeRest`, plus bas (`api.coupeRest`) ;
 *  - le fil « New Gang » v2 (`/feed…`) par `FauxFil` (`api.filRest`), état dans `api.fil`.
 *
 * Un test peut remplacer la réponse d'une route avec `surcharger(méthode, chemin, fabrique)` :
 * la fabrique reçoit la requête décodée et rend `{ status, json }`, `RESEAU_COUPE` (échec réseau)
 * ou `undefined` (comportement par défaut).
 */
import { creerDonnees, CLIENT, media } from './donnees.js';
import { FauxCoupe, CLE_LISTE_LUCAS, PHOTO_LUCAS } from './fauxCoupe.js';
import { MAINTENANT, cleDuJourParis, instantParis, jour } from './temps.js';

export const API_HOTE = 'dhomebarber-api-3aabb8313cb6.herokuapp.com';
export const API_ORIGINE = `https://${API_HOTE}`;
/** Préfixe des routes de l'app (`API_BASE` de src/api/apiClient.js). */
const PREFIXE = '/api/apps/prod';
/** Paramètres publics (fonctions activées, prestations les plus demandées). */
const CHEMIN_PARAMETRES_PUBLICS = '/api/apps/public/prod/public-settings/by-id/prod';

/** Réponse spéciale d'une surcharge : la requête échoue comme sans réseau (« Failed to fetch »). */
export const RESEAU_COUPE = Symbol('réseau coupé');

/** Entités connues du vrai serveur (`ENTITY_MAP` de routes/entities.js du backend). */
const ENTITES = new Set([
  'Service', 'ServiceCategory', 'Employee', 'Appointment', 'Product', 'Order', 'Review',
  'SalonSettings', 'TimeOff', 'User', 'CleaningTask', 'CleaningSchedule', 'SkillCategory', 'Post',
  'PostLike', 'PostComment', 'Event', 'GiftCard', 'PostReport', 'UserBlock', 'TextileDrop',
  'TextileConcept', 'TextileReservation', 'SalonEvent', 'SalonEventInvite', 'Partner', 'Feedback',
]);
/** Lisibles sans connexion (`PUBLIC_READ_ENTITIES`) ; les autres répondent 401 sans jeton valable. */
const ENTITES_PUBLIQUES = new Set([
  'Service', 'ServiceCategory', 'Employee', 'Product', 'Review', 'SalonSettings', 'SkillCategory',
  'Post', 'PostLike', 'PostComment', 'Partner',
]);
const LIMITE_PAR_DEFAUT = 500;
const LIMITE_MAX = 2000;

const ENTETES_CORS = (origine) => ({
  'access-control-allow-origin': origine || '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, Accept',
  'access-control-max-age': '600',
  vary: 'Origin',
});

/** Jeton au format JWT (le navigateur lit `userId` dans la charge utile, sans vérifier la signature). */
function fabriquerJeton(userId, n) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ userId, n })}.e2e`;
}

/** Égalité d'un filtre `q` (même sémantique que `buildConditions` du serveur). */
function correspond(ligne, cle, valeur) {
  const v = ligne[cle];
  if (valeur === null || valeur === undefined) return v === null || v === undefined;
  if (Array.isArray(valeur)) return valeur.some((x) => correspond(ligne, cle, x));
  if (typeof valeur === 'boolean') return v === valeur;
  return v !== null && v !== undefined && String(v) === String(valeur);
}

function trier(lignes, tri, table) {
  const colonneParDefaut = lignes.some((l) => 'created_at' in l) ? 'created_at' : 'created_date';
  const [col, sens] = tri
    ? (tri.startsWith('-') ? [tri.slice(1), -1] : [tri, 1])
    : [colonneParDefaut, -1];
  return [...lignes].sort((a, b) => {
    const x = a[col];
    const y = b[col];
    if (x === y) return 0;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sens;
  }).map((l) => (table === 'Appointment' ? avecBlocage(l) : l));
}

/** Le serveur dit quelles lignes occupent un créneau pour un client (`blocks_client`). */
function avecBlocage(rdv) {
  const libre = rdv.status === 'cancelled'
    || (rdv.status === 'last_minute' && !rdv.client_email)
    || rdv.status === 'no_show';
  return { ...rdv, blocks_client: !libre };
}

/** Compte tel que `/me` le renvoie (jamais le mot de passe). */
function compteSansSecret(compte) {
  const { motDePasse: _secret, ...reste } = compte;
  return { ...reste, public_key: `cle-${compte.id}`, permissions: compte.permissions ?? [] };
}

export class FauxServeur {
  constructor(donnees = creerDonnees()) {
    this.donnees = donnees;
    this.tables = donnees.tables;
    this.comptes = donnees.comptes;
    /** Toutes les requêtes reçues par le faux serveur : `{ methode, chemin, query, q, corps }`. */
    this.requetes = [];
    /** Requêtes vers l'API qu'aucune route ne sert : le test échoue s'il y en a. */
    this.nonPrevues = [];
    /** Domaines externes contactés (réponse vide). */
    this.externes = [];
    /** Erreurs remontées par l'app elle-même (`type: 'error'` de la mesure d'audience). */
    this.erreursApp = [];
    /** Exceptions levées par le faux serveur ou une surcharge (réponse 500) : le test échoue. */
    this.erreursServeur = [];
    this.surcharges = [];
    this.jetons = new Map();
    /** Faux serveur de jeu de La Coupe du Gang (`/ws/coupe`) : connexions et messages reçus. */
    this.coupe = new FauxCoupe(this);
    /** Routes REST de La Coupe du Gang (points, classement, barbers, blocages, signalements). */
    this.coupeRest = new FauxCoupeRest(this);
    // Jeu ouvert, comme en production sans COUPE_WS=off ; un test le ferme avec
    // `api.donnees.parametresPublics.features.coupe = false` (les routes /coupe répondent alors 404 `disabled`)
    this.donnees.parametresPublics.features.coupe ??= true;
    // Fil « New Gang » v2 (routes /feed…) : état dans `api.fil` (activité, votes, réglages, vues)
    this.donnees.fil ??= { activite: [], votes: [], likesCommentaires: [], reglages: {}, vuLe: {}, vues: {} };
    this.filRest = new FauxFil(this);
    /** Heure du faux serveur : l'heure figée des tests, qui avance avec le temps réel écoulé. */
    this.debutReel = Date.now();
    this.compteurId = 0;
    this.compteurJeton = 0;
  }

  // ─── Outils pour les tests ───────────────────────────────────────────

  /**
   * État du fil v2 (`donnees.fil`) : `activite` (lignes `activiteFil` de support/donnees.js), `votes`,
   * `likesCommentaires`, `reglages` et `vuLe` (par email en minuscules), `vues` (par publication).
   */
  get fil() {
    return this.donnees.fil;
  }

  /** Heure du serveur : `MAINTENANT` (mardi 10 h, Paris) + le temps réel écoulé depuis le début du test. */
  maintenant() {
    return new Date(MAINTENANT.getTime() + (Date.now() - this.debutReel));
  }

  /**
   * Remplace la réponse d'une route. `chemin` : chaîne exacte (après `/api/apps/prod`) ou RegExp.
   * `fabrique(req)` → `{ status, json }`, `RESEAU_COUPE` ou `undefined` (comportement par défaut).
   */
  surcharger(methode, chemin, fabrique) {
    this.surcharges.unshift({ methode: methode.toUpperCase(), chemin, fabrique });
  }

  /** Requêtes reçues pour `methode` + `chemin` (chaîne exacte ou RegExp, après `/api/apps/prod`). */
  requetesVers(methode, chemin) {
    return this.requetes.filter((r) => r.methode === methode.toUpperCase() && cheminCorrespond(chemin, r.chemin));
  }

  /** Jeton de session valable pour ce compte (connexion directe, sans passer par l'écran). */
  ouvrirSession(email) {
    const compte = this.comptes.find((c) => c.email === email);
    if (!compte) throw new Error(`Compte simulé inconnu : ${email}`);
    this.compteurJeton += 1;
    const jeton = fabriquerJeton(compte.id, this.compteurJeton);
    this.jetons.set(jeton, compte.id);
    return jeton;
  }

  /** Toutes les sessions deviennent invalides (le serveur répondra 401). */
  revoquerSessions() {
    this.jetons.clear();
  }

  // ─── Branchement sur le navigateur ───────────────────────────────────

  /** Intercepte tout ce qui ne vient pas du build local, pour ce contexte de navigation. */
  async installer(context, origineApp) {
    const local = new URL(origineApp);
    // Fin du test : le faux serveur de jeu arrête ses envois (états du match, minuteries)
    context.on('close', () => this.coupe.arreter());
    await context.route((url) => url.host !== local.host, (route) => this.repondre(route, origineApp));
    // WebSockets : aucun n'est jamais ouvert vers un vrai serveur. Le compteur de connectés
    // (`/ws/live`, tableau de bord) reçoit un nombre fictif ; le jeu (`/ws/coupe`) a son faux
    // serveur ; tout autre est noté et refermé.
    await context.routeWebSocket(() => true, (ws) => {
      const chemin = new URL(ws.url()).pathname;
      if (/\/ws\/live$/.test(chemin)) {
        ws.send(JSON.stringify({ type: 'live_count', count: 3 }));
        return;
      }
      if (/\/ws\/coupe$/.test(chemin)) {
        this.coupe.brancher(ws);
        return;
      }
      this.nonPrevues.push(`WEBSOCKET ${ws.url()}`);
      ws.close();
    });
  }

  async repondre(route, origineApp) {
    const requete = route.request();
    const url = new URL(requete.url());
    if (url.host !== API_HOTE) {
      // Domaine externe (polices, CDN, images) : réponse vide, les tests ne dépendent pas d'internet
      this.externes.push(url.href);
      return route.fulfill({ status: 200, body: '', contentType: typeDeContenu(url.pathname) });
    }
    const cors = ENTETES_CORS(requete.headers().origin || new URL(origineApp).origin);
    if (requete.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    // Images stockées en base (`GET /api/media/<id>`) : une image de couleur, la même pour un même id
    const mediaId = /^\/api\/media\/([^/]+)$/.exec(url.pathname)?.[1];
    if (mediaId && requete.method() === 'GET') {
      this.requetes.push({ methode: 'GET', chemin: url.pathname, query: {}, q: null, corps: null });
      return route.fulfill({ status: 200, headers: cors, contentType: 'image/svg+xml', body: imageDeMedia(mediaId) });
    }

    const req = this.decoder(requete, url);
    let reponse;
    try {
      reponse = await this.traiter(req);
    } catch (err) {
      // Défaut du faux serveur lui-même (ou d'une surcharge) : le test échoue avec la cause
      this.erreursServeur.push(`${req.methode} ${req.cheminComplet} : ${err.message}`);
      reponse = { status: 500, json: { error: `Erreur du faux serveur : ${err.message}` } };
    }
    if (reponse === RESEAU_COUPE) return route.abort('internetdisconnected');
    return route.fulfill({
      status: reponse.status ?? 200,
      headers: { ...cors, ...(reponse.headers || {}) },
      contentType: 'application/json; charset=utf-8',
      body: reponse.json === undefined ? '' : JSON.stringify(reponse.json),
    });
  }

  decoder(requete, url) {
    let corps = null;
    const brut = requete.postData();
    if (brut) {
      try { corps = JSON.parse(brut); } catch { corps = brut; }
    }
    const jeton = (requete.headers().authorization || '').replace(/^Bearer\s+/i, '');
    const compteId = jeton ? this.jetons.get(jeton) : null;
    const chemin = url.pathname.startsWith(PREFIXE) ? url.pathname.slice(PREFIXE.length) : url.pathname;
    let q = null;
    if (url.searchParams.has('q')) {
      try { q = JSON.parse(url.searchParams.get('q')); } catch { q = null; }
    }
    const req = {
      methode: requete.method(),
      chemin,
      cheminComplet: url.pathname,
      query: Object.fromEntries(url.searchParams),
      q,
      corps,
      jetonEnvoye: !!jeton,
      compte: compteId ? this.comptes.find((c) => c.id === compteId) || null : null,
    };
    this.requetes.push({ methode: req.methode, chemin: req.chemin, query: req.query, q: req.q, corps: req.corps });
    return req;
  }

  async traiter(req) {
    for (const s of this.surcharges) {
      if (s.methode === req.methode && cheminCorrespond(s.chemin, req.chemin)) {
        const r = await s.fabrique(req);
        if (r !== undefined) return r;
      }
    }
    if (req.cheminComplet === CHEMIN_PARAMETRES_PUBLICS && req.methode === 'GET') {
      return { json: this.donnees.parametresPublics };
    }
    if (req.cheminComplet.startsWith(PREFIXE)) {
      const r = this.routeConnue(req);
      if (r) return r;
    }
    this.nonPrevues.push(`${req.methode} ${req.cheminComplet}${Object.keys(req.query).length ? `?${new URLSearchParams(req.query)}` : ''}`);
    return { status: 501, json: { error: 'Route non simulée par le faux serveur (e2e/support/mockApi.js)' } };
  }

  // ─── Routes du faux serveur ──────────────────────────────────────────

  routeConnue(req) {
    const { methode, chemin } = req;

    // Connexion
    if (methode === 'POST' && chemin === '/auth/login') return this.connexion(req);
    if (methode === 'POST' && chemin === '/auth/logout') return { json: { success: true } };

    // Mesure d'audience (src/lib/analytics.js) : acceptée ; seules les erreurs de l'app (écran planté
    // attrapé par l'ErrorBoundary, erreur non gérée) sont gardées, la fixture fait échouer le test
    if (methode === 'POST' && chemin === '/analytics/collect') {
      const evenements = Array.isArray(req.corps?.events) ? req.corps.events : [];
      for (const e of evenements) {
        if (e?.type === 'error') this.erreursApp.push(`${e.name} (${e.props?.source || '?'}, ${e.props?.page || '?'})`);
      }
      return { json: { ok: true } };
    }

    // Envoi d'une image (`UploadFile`) : rangée « en base », URL `/api/media/<uuid>` comme le vrai serveur
    if (methode === 'POST' && chemin === '/integration-endpoints/Core/UploadFile') {
      if (!req.compte) return nonAuthentifie();
      this.compteurId += 1;
      const id = `bbbbbbbb-0000-4000-8000-${String(this.compteurId).padStart(12, '0')}`;
      return { json: { file_url: `${API_ORIGINE}/api/media/${id}` } };
    }

    // Carte Gang du client (révélation de niveau, profil)
    if (methode === 'GET' && chemin === '/gang-card/me') {
      if (!req.compte) return nonAuthentifie();
      return {
        json: {
          card: null, seen_tier: null, level_up: false, leaderboard_opt_in: false,
          tiers: [], seen_badges: [], new_badges: [], upcoming: null,
        },
      };
    }

    // Team of the Season (en tête du fil) : personne n'y figure ; un test la remplit par `surcharger`
    if (methode === 'GET' && chemin === '/gang-card/leaderboard') {
      if (!req.compte) return nonAuthentifie();
      return { json: { since: jour(-90), days: 90, entries: [] } };
    }

    // Vues des publications du fil (admin, ancien fil) : aucune
    if (methode === 'GET' && chemin === '/analytics/post-views') {
      if (!req.compte) return nonAuthentifie();
      if (req.compte.role !== 'admin') return { status: 403, json: { error: 'Accès refusé' } };
      return { json: { counts: {} } };
    }

    // Niveau de carte Gang des clients d'une fiche de l'agenda (équipe) : aucun client n'a de carte
    if (methode === 'GET' && chemin === '/gang-card/summary') {
      if (!req.compte) return nonAuthentifie();
      if (!['admin', 'barber'].includes(req.compte.role)) return { status: 403, json: { error: 'Accès refusé' } };
      return { json: {} };
    }

    // Événements du salon (carte de l'accueil) : aucune invitation
    if (methode === 'GET' && chemin === '/salon-events/mine') {
      if (!req.compte) return nonAuthentifie();
      return { json: { now: new Date().toISOString(), events: [] } };
    }

    // Textile & drops (carte de l'accueil) : ni drop ni pièce du Labo
    if (methode === 'GET' && chemin === '/textile/overview') {
      return {
        json: { now: new Date().toISOString(), drops: [], concepts: [], me: { votes: {}, alerts: [], reservations: [] } },
      };
    }

    // La Coupe du Gang : routes REST (routes/coupe.js du serveur)
    if (chemin.startsWith('/coupe/')) return this.coupeRest.traiter(req);

    // Fil « New Gang » v2 (routes/feed.js et routes/feedActivity.js du serveur)
    if (chemin === '/feed' || chemin.startsWith('/feed/')) return this.filRest.traiter(req);

    // Entités
    const m = /^\/entities\/([A-Za-z]+)(?:\/([^/]+))?$/.exec(chemin);
    if (m) return this.entite(req, m[1], m[2] ? decodeURIComponent(m[2]) : null);
    return null;
  }

  connexion(req) {
    const { email, password } = req.corps || {};
    const compte = this.comptes.find((c) => c.email.toLowerCase() === String(email || '').trim().toLowerCase());
    if (!compte || compte.motDePasse !== password) {
      return { status: 401, json: { error: 'Email ou mot de passe incorrect' } };
    }
    const jeton = this.ouvrirSession(compte.email);
    return { json: { access_token: jeton, user: compteSansSecret(compte) } };
  }

  entite(req, nom, id) {
    if (!ENTITES.has(nom)) return null; // entité inconnue : 501 + test en échec
    const { methode } = req;

    if (nom === 'User' && id === 'me' && methode === 'GET') {
      if (!req.compte) return req.jetonEnvoye ? jetonInvalide() : nonAuthentifie();
      return { json: compteSansSecret(req.compte) };
    }

    // Lecture publique de certaines entités ; le reste exige une session valable
    const lecture = methode === 'GET';
    if (!req.compte && !(lecture && ENTITES_PUBLIQUES.has(nom))) {
      return req.jetonEnvoye ? jetonInvalide() : nonAuthentifie();
    }

    if (nom === 'User') return this.entiteUser(req, id);

    const table = this.tables[nom] || (this.tables[nom] = []);

    if (lecture && !id) {
      let lignes = table;
      if (req.q && typeof req.q === 'object') {
        lignes = lignes.filter((l) => Object.entries(req.q).every(([cle, valeur]) => correspond(l, cle, valeur)));
      }
      const limite = Math.min(Math.max(parseInt(req.query.limit, 10) || LIMITE_PAR_DEFAUT, 1), LIMITE_MAX);
      const saut = Math.max(parseInt(req.query.skip, 10) || 0, 0);
      return { json: trier(lignes, req.query.sort, nom).slice(saut, saut + limite) };
    }
    if (lecture && id) {
      const ligne = table.find((l) => String(l.id) === id);
      return ligne ? { json: nom === 'Appointment' ? avecBlocage(ligne) : ligne } : { status: 404, json: { error: 'Introuvable' } };
    }
    if (methode === 'POST' && !id) {
      this.compteurId += 1;
      const ligne = {
        ...(req.corps || {}),
        id: `${nom.toLowerCase()}-e2e-${this.compteurId}`,
        created_date: new Date().toISOString(),
        // Fil (Post, PostComment, PostLike, UserBlock, PostReport) : identité tirée du jeton
        ...this.filRest.identiteCrud(nom, req.compte),
      };
      table.push(ligne);
      return { status: 201, json: nom === 'Appointment' ? avecBlocage(ligne) : ligne };
    }
    if (methode === 'PUT' && id) {
      const ligne = table.find((l) => String(l.id) === id);
      if (!ligne) return { status: 404, json: { error: 'Introuvable' } };
      Object.assign(ligne, req.corps || {}, { updated_date: new Date().toISOString() });
      return { json: nom === 'Appointment' ? avecBlocage(ligne) : ligne };
    }
    if (methode === 'DELETE' && id) {
      const i = table.findIndex((l) => String(l.id) === id);
      if (i < 0) return { status: 404, json: { error: 'Introuvable' } };
      table.splice(i, 1);
      return { json: { success: true } };
    }
    return null;
  }

  /** Comptes : l'admin lit tous les comptes (filtre `q` appliqué), les autres seulement le leur. */
  entiteUser(req, id) {
    const estAdmin = req.compte.role === 'admin';
    if (req.methode === 'GET' && !id) {
      let visibles = estAdmin ? this.comptes : [req.compte];
      if (req.q && typeof req.q === 'object') {
        visibles = visibles.filter((c) => Object.entries(req.q).every(([cle, valeur]) => correspond(c, cle, valeur)));
      }
      return { json: visibles.map(compteSansSecret) };
    }
    return null;
  }
}

// ─── La Coupe du Gang : routes REST ────────────────────────────────────

/** Saison de la Coupe à l'instant figé des tests : mois de Paris et fin (1er du mois suivant, 0 h, Paris). */
export function saisonCoupe(instant = MAINTENANT) {
  const cle = cleDuJourParis(instant);
  const [a, m] = cle.split('-').map(Number);
  const suivant = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  return { season: cle.slice(0, 7), season_ends_at: instantParis(suivant, '00:00').toISOString() };
}

/**
 * Joueurs du classement simulé, mêmes noms et mêmes points que les maquettes validées :
 * [points, victoires, défaites] de la saison et du classement général (points = 3 × V − D).
 * Les barbers sont rattachés à leur fiche (`employee_id`) ; `salon` est la ligne commune des
 * comptes admin (« D'Home Barber »). Tous ont accepté d'y figurer (`opt_in`).
 */
const JOUEURS_COUPE = [
  { cle: 'joueur-lucas', nom: 'Lucas M.', role: 'user', saison: [87, 31, 6], total: [214, 79, 23] },
  { cle: 'joueur-kevin', nom: 'Kevin', role: 'barber', employee_id: 'emp-kevin', saison: [81, 29, 6], total: [190, 70, 20] },
  { cle: 'salon', nom: "D'Home Barber", role: 'salon', saison: [74, 27, 7], total: [240, 88, 24] },
  { cle: 'joueur-sarah', nom: 'Sarah K.', role: 'user', avatar: 31, saison: [69, 24, 3], total: [120, 45, 15] },
  { cle: 'joueur-dom', nom: 'Dom', role: 'barber', employee_id: 'emp-dom', saison: [63, 22, 3], total: [150, 55, 15] },
  { cle: 'joueur-yanis', nom: 'Yanis B.', role: 'user', saison: [58, 21, 5], total: [88, 33, 11] },
  { cle: 'joueur-romain', nom: 'Romain', role: 'barber', employee_id: 'emp-romain', saison: [51, 18, 3], total: [130, 48, 14] },
  { cle: 'joueur-mehdi', nom: 'Mehdi A.', role: 'user', saison: [40, 14, 2], total: [60, 22, 6] },
  { cle: 'joueur-hugo', nom: 'Hugo L.', role: 'user', saison: [36, 13, 3], total: [41, 15, 4] },
];

const MOTIFS_SIGNALEMENT = new Set(['name', 'behavior', 'cheating', 'other']);
const STATUTS_SIGNALEMENT = new Set(['pending', 'handled', 'dismissed']);

const statsDe = ([points, wins, losses]) => ({ points, wins, losses, matches: wins + losses });
/** Instant ISO `minutes` avant l'heure figée des tests. */
const ilYA = (minutes) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();

/**
 * Faux `routes/coupe.js` (contrat docs/fonctions/coupe-du-gang-contrat.md, section 2), état modifiable
 * par les tests :
 *  - `joueurs` : lignes du classement hors comptes de connexion (`opt_in: false` pour en retirer une) ;
 *  - `etats[idCompte]` : droits, choix du classement et points d'un compte simulé ; par défaut le
 *    client de test a 42 points (8e, 16 V, 6 D), un autre client n'a pas de carte (`no_card`) ;
 *  - `dispo[idFiche]` (« Dispo pour un match »), `occupes` (rendez-vous en cours) et `injoignables`
 *    (aucune notification activée : `reachable` faux) des barbers ; `fichesAvecCompte` : seules ces
 *    fiches (et celles d'un compte de connexion) sont listées, comme le serveur ;
 *  - `blocages`, `signalements`, `rapports` (signalements vus par l'admin, avec le compte signalé) ;
 *  - `exclus` (clés exclues des classements par l'admin : opt-in refusé en 403 `banned`) et
 *    `remisAZero` (clés dont l'admin a remis les points à zéro) ;
 *  - `listeJoueurs` : liste « Défier un joueur » (`GET /coupe/players`, sans les joueurs bloqués
 *    par le lecteur), servie seulement avec `features.coupePlayers` vrai ; `challenge_opt_in` d'un
 *    compte dans `etats` (« Me proposer aux défis », clients seulement : 403 `not_client`).
 * Jeu fermé (`features.coupe` faux) : 404 `{ code: 'disabled' }`, comme avec COUPE_WS=off.
 */
export class FauxCoupeRest {
  constructor(serveur) {
    this.serveur = serveur;
    Object.assign(this, saisonCoupe());
    this.joueurs = JOUEURS_COUPE.map((j) => ({ ...j, saison: [...j.saison], total: [...j.total], opt_in: true }));
    this.etats = {
      [CLIENT.id]: {
        eligible: true,
        eligible_reason: null,
        opt_in: true,
        saison: [42, 16, 6],
        total: [97, 37, 14],
        recent: [
          { ended_at: ilYA(40), won: true, cancelled: false, score: [3, 1], opponent: { name: 'Kevin', role: 'barber' }, delta: 3, ranked: true },
          { ended_at: ilYA(65), won: false, cancelled: false, score: [2, 3], opponent: { name: 'Lucas M.', role: 'user' }, delta: -1, ranked: true },
        ],
      },
    };
    this.dispo = { 'emp-dom': true, 'emp-kevin': true, 'emp-romain': true };
    /** Fiches en rendez-vous (`busy`) : Romain, comme sur la maquette (« Occupé »). */
    this.occupes = new Set(['emp-romain']);
    /** Fiches dont le barber n'a activé les notifications sur aucun appareil (`reachable` faux). */
    this.injoignables = new Set();
    /** Fiches reliées à un compte barber (le serveur ne liste que celles-là). */
    this.fichesAvecCompte = new Set(['emp-dom', 'emp-kevin', 'emp-romain']);
    this.blocages = new Map();
    this.signalements = [];
    this.exclus = new Set();
    this.remisAZero = [];
    // Lucas M. : joignable, avec sa photo ; Sarah K. : joignable ; Yanis B. : pas joignable
    this.listeJoueurs = [
      { key_hash: CLE_LISTE_LUCAS, name: 'Lucas M.', photo_url: PHOTO_LUCAS, reachable: true },
      { key_hash: 'b2'.repeat(16), name: 'Sarah K.', photo_url: null, reachable: true },
      { key_hash: 'c3'.repeat(16), name: 'Yanis B.', photo_url: null, reachable: false },
    ];
    this.rapports = [
      {
        id: 'rapport-1', reported_name: 'Yanis B.', reason: 'behavior', details: 'Réactions en boucle pendant le match.',
        created_at: ilYA(150), status: 'pending',
        reported_user_id: 'user-yanis', reported_email: 'yanis.b@exemple.fr', reported_key_hash: 'joueur-yanis',
      },
    ];
  }

  /** Remplace l'état d'un compte simulé (droits, choix, points), ex. un client sans carte. */
  definirEtat(idCompte, etat) {
    this.etats[idCompte] = { ...this.etatParDefaut(null), ...etat };
  }

  // ─── Règles ──────────────────────────────────────────────────────────

  fiche(id) {
    return (this.serveur.tables.Employee || []).find((e) => String(e.id) === String(id)) || null;
  }

  ficheVisible(id, compte) {
    const e = this.fiche(id);
    if (!e || e.is_active === false) return false;
    return !e.is_hidden || compte?.is_tester === true;
  }

  /** Clé de classement : `salon` pour un admin, la ligne de sa fiche pour un barber connu, sinon le compte. */
  cleDe(compte) {
    if (!compte) return null;
    if (compte.role === 'admin') return 'salon';
    if (compte.role === 'barber' && compte.employee_id) {
      const j = this.joueurs.find((x) => x.employee_id && String(x.employee_id) === String(compte.employee_id));
      if (j) return j.cle;
    }
    return `compte-${compte.id}`;
  }

  /** Nom affiché (contrat, section 0) : prénom + initiale, prénom de la fiche, « D'Home Barber ». */
  nomDe(compte) {
    if (compte.role === 'admin') return "D'Home Barber";
    if (compte.role === 'barber') return this.fiche(compte.employee_id)?.name || String(compte.full_name || 'Barber').split(' ')[0];
    const [prenom = 'Membre', nom = ''] = String(compte.full_name || '').trim().split(/\s+/);
    return nom ? `${prenom} ${nom.charAt(0).toUpperCase()}.` : prenom;
  }

  etatParDefaut(compte) {
    const client = !compte || compte.role === 'user';
    return {
      eligible: !client,
      eligible_reason: client ? 'no_card' : null,
      opt_in: false,
      saison: [0, 0, 0],
      total: [0, 0, 0],
      recent: [],
    };
  }

  /** État d'un compte : sa ligne du classement simulé (admin, barber connu) ou son état propre. */
  etatDe(compte) {
    const j = this.joueurs.find((x) => x.cle === this.cleDe(compte));
    if (j) return { eligible: true, eligible_reason: null, opt_in: j.cle === 'salon' ? true : j.opt_in !== false, saison: j.saison, total: j.total, recent: [] };
    return this.etats[compte.id] || this.etatParDefaut(compte);
  }

  /** Classement complet d'une période (`saison` ou `total`), trié comme le serveur. */
  classement(periode, lecteur) {
    const lignes = [];
    for (const j of this.joueurs) {
      if (j.cle !== 'salon' && j.opt_in === false) continue;
      if (j.role === 'barber' && !this.ficheVisible(j.employee_id, lecteur)) continue;
      const s = statsDe(j[periode]);
      // Personne sans match de la période n'est classé (le salon non plus : « toujours » = sans interrupteur)
      if (s.matches === 0) continue;
      const avatar = j.role === 'barber' ? this.fiche(j.employee_id)?.photo_url ?? null : (j.avatar ? media(j.avatar) : null);
      lignes.push({ cle: j.cle, name: j.nom, role: j.role, avatar_url: avatar, employee_id: j.employee_id ?? null, ...s });
    }
    for (const compte of this.serveur.comptes) {
      const cle = this.cleDe(compte);
      if (this.joueurs.some((j) => j.cle === cle) || compte.is_tester === true) continue;
      const etat = this.etatDe(compte);
      const s = statsDe(etat[periode]);
      if (!etat.opt_in || s.matches === 0) continue;
      lignes.push({
        cle, name: this.nomDe(compte), role: compte.role === 'barber' ? 'barber' : 'user',
        avatar_url: compte.photo_url ?? null, employee_id: compte.employee_id ?? null, ...s,
      });
    }
    lignes.sort((a, b) => b.points - a.points || b.wins - a.wins || a.matches - b.matches || a.name.localeCompare(b.name));
    return lignes.map((l, i) => ({ ...l, rank: i + 1 }));
  }

  // ─── Routes ──────────────────────────────────────────────────────────

  traiter(req) {
    const { methode, chemin, compte } = req;
    const sous = chemin.slice('/coupe'.length);
    if (!compte) return nonAuthentifie();
    if (this.serveur.donnees.parametresPublics.features?.coupe === false) {
      return { status: 404, json: { error: 'La Coupe du Gang est fermée pour le moment', code: 'disabled' } };
    }
    const corps = req.corps && typeof req.corps === 'object' ? req.corps : {};

    if (methode === 'GET' && sous === '/me') return { json: this.moi(compte) };

    if (methode === 'GET' && sous === '/leaderboard') {
      const periode = req.query.scope === 'total' ? 'total' : 'saison';
      const lignes = this.classement(periode, compte);
      const cle = this.cleDe(compte);
      const etat = this.etatDe(compte);
      const mienne = lignes.find((l) => l.cle === cle);
      // Comme le serveur : les joueurs bloqués par le lecteur sont retirés, sans renuméroter
      const bloques = new Set((this.blocages.get(compte.id) || []).map((b) => b.key_hash));
      bloques.delete(cle);
      const visibles = lignes.filter((l) => l.rank <= 50 + bloques.size && !bloques.has(l.cle)).slice(0, 50);
      return {
        json: {
          scope: periode === 'total' ? 'total' : 'season',
          season: this.season,
          season_ends_at: this.season_ends_at,
          rows: visibles.map((l) => ({
            rank: l.rank, key_hash: l.cle, name: l.name, role: l.role, avatar_url: l.avatar_url,
            employee_id: l.employee_id, points: l.points, wins: l.wins, losses: l.losses, matches: l.matches,
            me: l.cle === cle,
          })),
          me: { rank: mienne?.rank ?? null, ...statsDe(etat[periode]), opt_in: !!etat.opt_in },
        },
      };
    }

    if (methode === 'PATCH' && sous === '/settings') {
      // `opt_in` (classement) et / ou `challenge_opt_in` (liste « Défier un joueur », clients seulement)
      const valide = (v) => v === undefined || typeof v === 'boolean';
      if (!valide(corps.opt_in) || !valide(corps.challenge_opt_in) || (corps.opt_in === undefined && corps.challenge_opt_in === undefined)) {
        return { status: 400, json: { error: 'Choix invalide', code: 'invalid' } };
      }
      if (corps.challenge_opt_in === true && compte.role !== 'user') {
        return { status: 403, json: { error: 'Réservé aux clients : les barbers ont « Dispo pour un match »', code: 'not_client' } };
      }
      // Compte exclu des classements par le salon : il ne peut pas s'y remettre (contrat, section 7) ;
      // s'en retirer reste permis
      if ((corps.opt_in || corps.challenge_opt_in) && this.exclus.has(this.cleDe(compte))) {
        return { status: 403, json: { error: 'Le salon t\'a retiré du classement. Contacte-le si tu penses que c\'est une erreur.', code: 'banned' } };
      }
      if (corps.opt_in !== undefined) {
        const j = this.joueurs.find((x) => x.cle === this.cleDe(compte));
        if (j) j.opt_in = j.cle === 'salon' ? true : corps.opt_in;
        else this.etats[compte.id] = { ...this.etatDe(compte), opt_in: corps.opt_in };
      }
      if (corps.challenge_opt_in !== undefined && compte.role === 'user') {
        this.etats[compte.id] = { ...this.etatDe(compte), challenge_opt_in: corps.challenge_opt_in };
      }
      const etat = this.etatDe(compte);
      return { json: { opt_in: !!etat.opt_in, challenge_opt_in: compte.role === 'user' && etat.challenge_opt_in === true } };
    }

    if (methode === 'GET' && sous === '/players') {
      if (this.serveur.donnees.parametresPublics.features?.coupePlayers !== true) return null;
      const bloques = new Set((this.blocages.get(compte.id) || []).map((b) => b.key_hash));
      return { json: this.listeJoueurs.filter((p) => !bloques.has(p.key_hash)) };
    }

    if (methode === 'GET' && sous === '/barbers') {
      // Comme le serveur : barbers actifs et visibles qui ont un compte ; `available` = dispo, pas en
      // rendez-vous, joignable (au moins un appareil qui reçoit les notifications)
      const avecCompte = new Set([
        ...this.fichesAvecCompte,
        ...this.serveur.comptes.filter((c) => c.role === 'barber' && c.employee_id).map((c) => String(c.employee_id)),
      ]);
      const fiches = (this.serveur.tables.Employee || [])
        .filter((e) => this.ficheVisible(e.id, compte) && avecCompte.has(String(e.id)))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      return {
        json: fiches.map((e) => {
          const busy = this.occupes.has(e.id);
          const reachable = !this.injoignables.has(e.id);
          return {
            employee_id: e.id, name: e.name, photo_url: e.photo_url ?? null,
            available: !!this.dispo[e.id] && !busy && reachable, busy, reachable,
          };
        }),
      };
    }

    if (methode === 'PATCH' && sous === '/availability') {
      if (compte.role !== 'barber' || !compte.employee_id) {
        return { status: 403, json: { error: 'Réservé aux barbers', code: 'not_barber' } };
      }
      if (typeof corps.available !== 'boolean') return { status: 400, json: { error: 'Choix invalide', code: 'invalid' } };
      this.dispo[compte.employee_id] = corps.available;
      return { json: { available: corps.available } };
    }

    const fiche = /^\/player\/([^/]+)$/.exec(sous);
    if (methode === 'GET' && fiche) return this.joueur(decodeURIComponent(fiche[1]), compte);

    if (methode === 'GET' && sous === '/blocks') return { json: this.blocages.get(compte.id) || [] };

    if (methode === 'POST' && sous === '/block') {
      const cle = typeof corps.key_hash === 'string' ? corps.key_hash : '';
      if (!cle || cle.length > 64) return { status: 400, json: { error: 'Joueur inconnu', code: 'invalid' } };
      if (cle === this.cleDe(compte)) return { status: 400, json: { error: 'Tu ne peux pas te bloquer toi-même', code: 'self' } };
      const liste = this.blocages.get(compte.id) || [];
      if (!liste.some((b) => b.key_hash === cle)) {
        if (liste.length >= 50) return { status: 400, json: { error: 'Tu as déjà bloqué 50 joueurs', code: 'too_many' } };
        const nom = this.classement('total', compte).find((l) => l.cle === cle)?.name
          || this.joueurs.find((j) => j.cle === cle)?.nom || 'Ancien joueur';
        liste.push({ key_hash: cle, name: nom });
      }
      this.blocages.set(compte.id, liste);
      return { json: { blocked: true } };
    }

    const deblocage = /^\/block\/([^/]+)$/.exec(sous);
    if (methode === 'DELETE' && deblocage) {
      const cle = decodeURIComponent(deblocage[1]);
      this.blocages.set(compte.id, (this.blocages.get(compte.id) || []).filter((b) => b.key_hash !== cle));
      return { json: { blocked: false } };
    }

    if (methode === 'POST' && sous === '/report') {
      const cle = typeof corps.key_hash === 'string' ? corps.key_hash : '';
      if (!cle || !MOTIFS_SIGNALEMENT.has(corps.reason)) {
        return { status: 400, json: { error: 'Signalement incomplet', code: 'invalid' } };
      }
      if (corps.details != null && (typeof corps.details !== 'string' || corps.details.length > 500)) {
        return { status: 400, json: { error: 'Précisions trop longues (500 caractères au plus)', code: 'invalid' } };
      }
      this.signalements.push({ compte: compte.id, key_hash: cle, room_code: corps.room_code ?? null, reason: corps.reason, details: corps.details ?? null });
      return { json: { ok: true } };
    }

    if (methode === 'GET' && sous === '/admin/overview') {
      if (compte.role !== 'admin') return { status: 403, json: { error: 'Accès refusé', code: 'forbidden' } };
      return {
        json: {
          today: { matches: 3, players: 5 },
          season: { matches: 42, players: 12, ranked: 37 },
          // `a_key_hash` / `b_key_hash` : clés publiques (null pour le salon)
          top_pairs: [
            { a: 'Lucas M.', b: 'Kevin', a_key_hash: 'joueur-lucas', b_key_hash: 'joueur-kevin', matches: 9, ranked: 9 },
            { a: 'Sarah K.', b: 'Dom', a_key_hash: 'joueur-sarah', b_key_hash: 'joueur-dom', matches: 6, ranked: 6 },
          ],
          // `reported_banned` : null pour le salon ou un compte supprimé
          reports: [...this.rapports]
            .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1))
            .map((r) => ({ ...r, reported_banned: r.reported_key_hash ? this.exclus.has(r.reported_key_hash) : null })),
        },
      };
    }

    // Admin : exclure des classements / réintégrer (POST / DELETE …/ban : 400 `salon`, 404 `not_found`),
    // remettre les points à zéro (POST …/reset, salon permis)
    const actionJoueur = /^\/admin\/players\/([^/]+)\/(ban|reset)$/.exec(sous);
    if (actionJoueur && (methode === 'POST' || (methode === 'DELETE' && actionJoueur[2] === 'ban'))) {
      if (compte.role !== 'admin') return { status: 403, json: { error: 'Accès refusé', code: 'forbidden' } };
      const cle = decodeURIComponent(actionJoueur[1]);
      if (cle === 'salon' && actionJoueur[2] === 'ban') {
        return { status: 400, json: { error: 'La ligne du salon ne peut pas être exclue', code: 'salon' } };
      }
      const connue = cle === 'salon' || cle.startsWith('compte-') || this.joueurs.some((j) => j.cle === cle)
        || this.rapports.some((r) => r.reported_key_hash === cle);
      if (!connue) return { status: 404, json: { error: 'Joueur introuvable', code: 'not_found' } };
      if (actionJoueur[2] === 'reset') {
        this.remisAZero.push(cle);
        const j = this.joueurs.find((x) => x.cle === cle);
        if (j) { j.saison = [0, 0, 0]; j.total = [0, 0, 0]; }
      } else if (methode === 'POST') {
        this.exclus.add(cle);
        const j = this.joueurs.find((x) => x.cle === cle);
        if (j) j.opt_in = false;
        const idCompte = cle.startsWith('compte-') ? cle.slice('compte-'.length) : null;
        if (idCompte && this.etats[idCompte]) this.etats[idCompte] = { ...this.etats[idCompte], opt_in: false };
      } else {
        this.exclus.delete(cle);
      }
      return { json: { ok: true } };
    }

    const rapport = /^\/admin\/reports\/([^/]+)$/.exec(sous);
    if (methode === 'PATCH' && rapport) {
      if (compte.role !== 'admin') return { status: 403, json: { error: 'Accès refusé', code: 'forbidden' } };
      const ligne = this.rapports.find((r) => r.id === decodeURIComponent(rapport[1]));
      if (!ligne) return { status: 404, json: { error: 'Signalement introuvable', code: 'not_found' } };
      if (!STATUTS_SIGNALEMENT.has(corps.status)) return { status: 400, json: { error: 'Statut invalide', code: 'invalid' } };
      ligne.status = corps.status;
      return { json: { status: ligne.status } };
    }

    return null; // route de la Coupe inconnue : 501 + test en échec
  }

  /** `GET /coupe/me` (`banned` : exclu des classements par le salon ; `recent[].reason`) */
  moi(compte) {
    const etat = this.etatDe(compte);
    const cle = this.cleDe(compte);
    const rang = (periode) => (etat.opt_in ? this.classement(periode, compte).find((l) => l.cle === cle)?.rank ?? null : null);
    return {
      season: this.season,
      season_ends_at: this.season_ends_at,
      eligible: !!etat.eligible,
      eligible_reason: etat.eligible ? null : etat.eligible_reason || 'not_eligible',
      opt_in: !!etat.opt_in,
      challenge_opt_in: compte.role === 'user' && etat.challenge_opt_in === true && !this.exclus.has(cle),
      banned: this.exclus.has(cle),
      season_stats: { ...statsDe(etat.saison), rank: rang('saison') },
      total_stats: { ...statsDe(etat.total), rank: rang('total') },
      recent: (etat.recent || []).map((r) => ({ reason: r.cancelled ? 'cancelled' : null, ...r })),
    };
  }

  /** `GET /coupe/player/:keyHash` : fiche publique d'un joueur du classement. */
  joueur(cle, lecteur) {
    const saison = this.classement('saison', lecteur).find((l) => l.cle === cle);
    const total = this.classement('total', lecteur).find((l) => l.cle === cle);
    // Un joueur de la liste « Défier un joueur » a aussi sa fiche (Signaler, Bloquer), sans points
    const deLaListe = this.listeJoueurs.find((p) => p.key_hash === cle);
    const ligne = saison || total || (deLaListe ? { name: deLaListe.name, role: 'user' } : null);
    if (!ligne) return { status: 404, json: { error: 'Joueur introuvable', code: 'not_found' } };
    const stats = (l) => (l ? { points: l.points, rank: l.rank, wins: l.wins, losses: l.losses, matches: l.matches } : { points: 0, rank: null, wins: 0, losses: 0, matches: 0 });
    return { json: { name: ligne.name, role: ligne.role, season_stats: stats(saison), total_stats: stats(total) } };
  }
}

// ─── Fil « New Gang » v2 ───────────────────────────────────────────────

/** Réactions acceptées (FEED_REACTIONS du serveur) ; ❤ sans sélecteur de variante toléré. */
const REACTIONS_FIL = ['❤️', '🔥', '💪', '😂', '👏', '💈'];
const sansVariante = (r) => String(r).replace(/️/g, '');
const PREFS_PAR_DEFAUT = Object.freeze({ reactions: true, comments: true, salon: false, visit: true });
const CLES_PREFS = Object.keys(PREFS_PAR_DEFAUT);
const TAILLE_PAGE_FIL = 20;
const TAILLE_PAGE_FIL_MAX = 30;
const JOUR_MS = 86_400_000;
const LOGO_DU_SALON = '/icons/icon-192.png';

const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const minuscule = (v) => (v == null ? '' : String(v).trim().toLowerCase());
const horodatage = (ligne) => new Date(ligne.created_at || ligne.created_date || 0).toISOString();
const resume = (texte, n) => {
  const t = String(texte ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const erreurFil = (status, error, code) => ({ status, json: code ? { error, code } : { error } });

/**
 * Faux `routes/feed.js` + `routes/feedActivity.js` (contrat docs/fonctions/fil-new-gang-contrat.md,
 * section 4), sur les tables du faux serveur : `Post`, `PostLike`, `PostComment`, `UserBlock`,
 * `Appointment`, `Employee`, `Service`, et l'état du fil `api.fil` (`donnees.fil`) : activité, votes,
 * ❤️ de commentaires, réglages, dernière visite du fil, vues. Tout est relu à chaque requête : un
 * test peut remplacer une table (`api.tables.Post = …`, `api.fil.activite = …`) à tout moment.
 *
 * Règles reprises du serveur : identité lue dans le jeton (jamais dans le corps), l'admin écrit au
 * nom du salon, auteurs bloqués par le lecteur exclus de tout, email seulement pour l'équipe et sur
 * ses propres lignes, activité créée pour l'auteur de la publication (jamais pour soi). Sans
 * `features.feedV2` (serveur plus ancien), aucune route : 501 et test en échec si l'app en appelle une.
 */
export class FauxFil {
  constructor(serveur) {
    this.serveur = serveur;
    this.compteur = 0;
  }

  get etat() { return this.serveur.donnees.fil; }
  get posts() { return this.serveur.tables.Post || []; }
  get likes() { return this.serveur.tables.PostLike || (this.serveur.tables.PostLike = []); }
  get commentaires() { return this.serveur.tables.PostComment || (this.serveur.tables.PostComment = []); }

  nouvelId(prefixe) {
    this.compteur += 1;
    return `${prefixe}-fil-${this.compteur}`;
  }

  // ─── Identités ───────────────────────────────────────────────────────

  compteParEmail(email) {
    const e = minuscule(email);
    return e ? this.serveur.comptes.find((c) => minuscule(c.email) === e) || null : null;
  }

  /** Clé publique d'un email : celle que `/me` donne au compte (`cle-<id>`), sinon tirée de l'email. */
  cleDeEmail(email) {
    const e = minuscule(email);
    if (!e) return null;
    const compte = this.compteParEmail(e);
    if (compte) return `cle-${compte.id}`;
    let h = 7;
    for (const c of e) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return `cle-m${h.toString(16)}`;
  }

  /** Champs auteur d'un compte (`authorFields` du serveur) : l'admin = le salon. */
  auteur(compte) {
    if (compte.role === 'admin') {
      return { author_email: minuscule(compte.email), author_name: "D'Home Barber", author_role: 'admin', author_photo_url: LOGO_DU_SALON };
    }
    return {
      author_email: minuscule(compte.email),
      author_name: compte.full_name || 'Membre du Gang',
      author_role: compte.role || 'user',
      author_photo_url: compte.photo_url || null,
    };
  }

  /** Blocages du lecteur (`UserBlock` : `blocked_key`, `blocked_email`, `key:<clé>`). */
  bloquesPar(email) {
    const e = minuscule(email);
    const cles = new Set();
    const emails = new Set();
    for (const b of this.serveur.tables.UserBlock || []) {
      // Ligne créée par l'app sans `blocker_email` (le faux CRUD ne l'ajoute pas) : celle du lecteur
      if (b.blocker_email && minuscule(b.blocker_email) !== e) continue;
      if (b.blocked_key) cles.add(String(b.blocked_key));
      const be = minuscule(b.blocked_email);
      if (be.startsWith('key:')) cles.add(be.slice(4));
      else if (be) emails.add(be);
    }
    return { cles, emails };
  }

  estBloque(blocages, email, cle) {
    const k = cle || this.cleDeEmail(email);
    return (!!k && blocages.cles.has(k)) || (!!email && blocages.emails.has(minuscule(email)));
  }

  /** Publication masquée pour ce lecteur : auteur bloqué, ou Moment d'un membre bloqué. */
  publicationBloquee(post, blocages) {
    if (this.estBloque(blocages, post.author_email, post.author_key)) return true;
    if (post.kind === 'moment' && post.subject_user_id) {
      const membre = this.serveur.comptes.find((c) => String(c.id) === String(post.subject_user_id));
      if (membre && this.estBloque(blocages, membre.email)) return true;
    }
    return false;
  }

  /** Même email que le lecteur (`sameEmail` du serveur) : un admin n'est pas l'auteur d'une ligne d'un autre admin. */
  estAMoi(ligne, lecteur, champEmail = 'author_email') {
    const e = minuscule(ligne[champEmail]);
    return !!e && e === minuscule(lecteur.email);
  }

  // ─── Formes de l'API ─────────────────────────────────────────────────

  commentairesVisibles(postId, blocages) {
    const tous = this.commentaires.filter((c) => String(c.post_id) === String(postId));
    const ids = new Set(tous.map((c) => String(c.id)));
    return tous
      // Réponse dont la racine a été supprimée : partie avec elle (ON DELETE CASCADE)
      .filter((c) => !c.parent_id || ids.has(String(c.parent_id)))
      .filter((c) => !this.estBloque(blocages, c.author_email, c.author_key))
      .sort((a, b) => horodatage(a).localeCompare(horodatage(b)) || String(a.id).localeCompare(String(b.id)));
  }

  commentaire(c, lecteur) {
    const moi = this.estAMoi(c, lecteur);
    const equipe = ['admin', 'barber'].includes(lecteur.role);
    const coeurs = this.etat.likesCommentaires.filter((l) => String(l.comment_id) === String(c.id));
    return {
      id: c.id,
      post_id: c.post_id,
      parent_id: c.parent_id || null,
      author_name: c.author_name || 'Membre du Gang',
      author_role: c.author_role || 'user',
      author_photo_url: c.author_photo_url || null,
      author_key: c.author_key || this.cleDeEmail(c.author_email),
      ...(equipe || moi ? { author_email: c.author_email || null } : {}),
      is_mine: moi,
      content: c.content,
      created_at: horodatage(c),
      likes: coeurs.length,
      my_like: coeurs.some((l) => minuscule(l.user_email) === minuscule(lecteur.email)),
    };
  }

  reactionsDe(postId, lecteur) {
    const reactions = {};
    let mienne = null;
    const lignes = this.likes.filter((l) => String(l.post_id) === String(postId));
    for (const l of lignes) {
      const r = REACTIONS_FIL.find((x) => sansVariante(x) === sansVariante(l.reaction || '')) || '❤️';
      reactions[r] = (reactions[r] || 0) + 1;
      if (minuscule(l.user_email) === minuscule(lecteur.email)) mienne = r;
    }
    return { reactions, reactions_total: lignes.length, my_reaction: mienne };
  }

  sondage(post, lecteur) {
    const meta = objet(post.meta);
    const options = (Array.isArray(meta.options) ? meta.options : []).map((o) => ({
      id: o.id,
      label: o.label,
      votes: this.etat.votes.filter((v) => String(v.post_id) === String(post.id) && v.option_id === o.id).length,
    }));
    const monVote = this.etat.votes.find((v) => String(v.post_id) === String(post.id) && minuscule(v.user_email) === minuscule(lecteur.email));
    const fin = Date.parse(meta.ends_at || '');
    return {
      question: meta.question || '',
      options,
      total: options.reduce((s, o) => s + o.votes, 0),
      my_vote: monVote && options.some((o) => o.id === monVote.option_id) ? monVote.option_id : null,
      ends_at: meta.ends_at || null,
      closed: !(Number.isFinite(fin) && fin > this.serveur.maintenant().getTime()),
    };
  }

  metaPublique(kind, meta) {
    const m = objet(meta);
    if (kind === 'look') {
      const ids = Array.isArray(m.service_ids) ? m.service_ids : [];
      const reservable = !!m.bookable && !!m.employee_id && ids.length > 0;
      return {
        employee_id: m.employee_id || null,
        employee_name: m.employee_name || null,
        service_ids: ids,
        service_names: Array.isArray(m.service_names) ? m.service_names : [],
        bookable: !!m.bookable,
        booking_path: reservable
          ? `/booking?barber=${encodeURIComponent(m.employee_id)}&services=${ids.map(encodeURIComponent).join(',')}&from=feed-look`
          : null,
      };
    }
    if (kind === 'before_after') return { employee_id: m.employee_id || null, employee_name: m.employee_name || null };
    if (kind === 'moment') {
      return {
        type: m.type || 'tier_up', tier: m.tier || null, tier_label: m.tier_label || null,
        member_name: m.member_name || null, member_photo_url: m.member_photo_url || null,
      };
    }
    if (kind === 'last_minute') return m;
    return {};
  }

  /** Publication telle que `GET /feed` la rend (`item` du contrat). */
  item(post, lecteur, blocages = this.bloquesPar(lecteur.email)) {
    const kind = post.kind || 'post';
    const meta = objet(post.meta);
    const images = Array.isArray(meta.images) && meta.images.length
      ? meta.images.filter((u) => typeof u === 'string').slice(0, 4)
      : (post.image_url ? [post.image_url] : []);
    const moi = this.estAMoi(post, lecteur);
    const equipe = ['admin', 'barber'].includes(lecteur.role);
    const commentaires = this.commentairesVisibles(post.id, blocages);
    let content = post.content ?? '';
    if (kind === 'poll') content = meta.question || '';
    else if (kind === 'look' || kind === 'before_after') content = meta.caption ?? '';
    return {
      id: post.id,
      kind,
      created_at: horodatage(post),
      author_name: post.author_name || 'Membre du Gang',
      author_role: post.author_role || 'user',
      author_photo_url: post.author_photo_url || null,
      author_key: post.author_key || this.cleDeEmail(post.author_email),
      ...(equipe || moi ? { author_email: post.author_email || null } : {}),
      is_mine: moi,
      content,
      images,
      image_url: post.image_url || null,
      meta: this.metaPublique(kind, meta),
      appointment_id: kind === 'last_minute' ? post.appointment_id || null : null,
      ...this.reactionsDe(post.id, lecteur),
      comments_count: commentaires.length,
      comments_preview: commentaires.slice(-2).map((c) => this.commentaire(c, lecteur)),
      poll: kind === 'poll' ? this.sondage(post, lecteur) : null,
      views: moi || lecteur.role === 'admin' ? Number(this.etat.vues[post.id]) || 0 : null,
    };
  }

  postVisible(id, lecteur) {
    const post = this.posts.find((p) => String(p.id) === String(id));
    if (!post || this.publicationBloquee(post, this.bloquesPar(lecteur.email))) return null;
    return post;
  }

  // ─── Activité (lib/feedActivity.js) ──────────────────────────────────

  /** Destinataire de l'activité d'une publication : son auteur, ou le membre d'un Moment. */
  destinataireDe(post) {
    if (post.kind === 'moment' && post.subject_user_id) {
      return minuscule(this.serveur.comptes.find((c) => String(c.id) === String(post.subject_user_id))?.email) || null;
    }
    return minuscule(post.author_email) || null;
  }

  /** Le destinataire a-t-il bloqué l'auteur du geste ? (lignes `UserBlock` à son nom seulement) */
  aBloque(destinataire, acteurEmail) {
    const cle = this.cleDeEmail(acteurEmail);
    return (this.serveur.tables.UserBlock || []).some((b) => minuscule(b.blocker_email) === destinataire
      && (minuscule(b.blocked_email) === minuscule(acteurEmail) || (cle && (b.blocked_key === cle || minuscule(b.blocked_email) === `key:${cle}`))));
  }

  noterActivite(destinataire, acteur, champs, unique) {
    const email = minuscule(acteur.author_email);
    if (!destinataire || destinataire === email || this.aBloque(destinataire, email)) return;
    const ligne = {
      recipient_email: destinataire,
      actor_email: email,
      actor_name: acteur.author_name,
      actor_role: acteur.author_role,
      actor_photo_url: acteur.author_photo_url,
      emoji: null,
      excerpt: null,
      post_id: null,
      comment_id: null,
      appointment_id: null,
      ...champs,
      created_at: this.serveur.maintenant().toISOString(),
      read_at: null,
      pushed_at: null,
    };
    const existante = unique ? this.etat.activite.find(unique) : null;
    if (existante) Object.assign(existante, ligne);
    else this.etat.activite.push({ id: this.nouvelId('act'), ...ligne });
  }

  retirerActivite(test) {
    this.etat.activite = this.etat.activite.filter((a) => !(test(a) && !a.read_at));
  }

  /**
   * Champs que le serveur écrit lui-même à la création par le CRUD des entités du fil (ancien fil,
   * signalement, blocage) : identité lue dans le jeton, jamais dans le corps.
   */
  identiteCrud(nom, compte) {
    if (!compte) return {};
    const quand = this.serveur.maintenant().toISOString();
    const email = minuscule(compte.email);
    if (nom === 'Post' || nom === 'PostComment') return { ...this.auteur(compte), created_at: quand };
    if (nom === 'PostLike') return { user_email: email, created_at: quand };
    if (nom === 'UserBlock') return { blocker_email: email, created_at: quand };
    if (nom === 'PostReport') return { reporter_email: email, status: 'pending', created_at: quand };
    return {};
  }

  // ─── Routes ──────────────────────────────────────────────────────────

  traiter(req) {
    if (this.serveur.donnees.parametresPublics.features?.feedV2 !== true) return null;
    const { methode, chemin, compte } = req;
    if (!compte) return nonAuthentifie();
    const corps = req.corps && typeof req.corps === 'object' && !Array.isArray(req.corps) ? req.corps : {};
    const sous = chemin.slice('/feed'.length);

    if (methode === 'GET' && sous === '') return this.page(req, compte);
    if (methode === 'GET' && sous === '/visits') return { json: { visits: this.visites(compte) } };
    if (methode === 'POST' && sous === '/posts') return this.publier(corps, compte);
    if (methode === 'GET' && sous === '/activity') return this.activite(compte);
    if (methode === 'POST' && sous === '/activity/read') return this.marquerLu(corps, compte);
    if (methode === 'GET' && sous === '/unread') return this.nonLus(req, compte);
    if (methode === 'POST' && sous === '/seen') {
      this.etat.vuLe[minuscule(compte.email)] = this.serveur.maintenant().toISOString();
      return { json: { ok: true } };
    }
    if (sous === '/prefs' && methode === 'GET') return { json: this.reglages(compte) };
    if (sous === '/prefs' && methode === 'PUT') return this.changerReglages(req.corps, compte);

    const coeur = /^\/comments\/([^/]+)\/like$/.exec(sous);
    if (methode === 'POST' && coeur) return this.aimerCommentaire(decodeURIComponent(coeur[1]), corps, compte);

    const m = /^\/([^/]+)(?:\/(comments|react|vote))?$/.exec(sous);
    if (!m) return null;
    const id = decodeURIComponent(m[1]);
    const action = m[2] || null;
    const post = this.postVisible(id, compte);
    if (!post) return erreurFil(404, "Cette publication n'existe plus.", 'not_found');
    if (methode === 'GET' && !action) return { json: { item: this.item(post, compte) } };
    if (methode === 'GET' && action === 'comments') {
      const liste = this.commentairesVisibles(post.id, this.bloquesPar(compte.email)).slice(0, 500);
      return { json: { comments: liste.map((c) => this.commentaire(c, compte)), total: liste.length } };
    }
    if (methode === 'POST' && action === 'comments') return this.commenter(post, corps, compte);
    if (methode === 'POST' && action === 'react') return this.reagir(post, corps, compte);
    if (methode === 'POST' && action === 'vote') return this.voter(post, corps, compte);
    return null;
  }

  /** `GET /feed?before=&filter=&limit=` → `{ items, next_cursor }` (curseur `<horodatage>_<id>`). */
  page(req, compte) {
    const filtre = ['all', 'salon', 'looks', 'polls'].includes(String(req.query.filter || 'all')) ? String(req.query.filter || 'all') : 'all';
    const n = Number(req.query.limit);
    const limite = Number.isInteger(n) && n >= 1 ? Math.min(n, TAILLE_PAGE_FIL_MAX) : TAILLE_PAGE_FIL;
    let curseur = null;
    if (req.query.before) {
      const s = String(req.query.before);
      const i = s.indexOf('_');
      const ts = s.slice(0, i);
      if (i < 0 || !Number.isFinite(Date.parse(ts)) || !s.slice(i + 1)) return erreurFil(400, 'Curseur invalide');
      curseur = { ts: new Date(ts).toISOString(), id: s.slice(i + 1) };
    }
    const blocages = this.bloquesPar(compte.email);
    const lignes = this.posts
      .filter((p) => !this.publicationBloquee(p, blocages))
      .filter((p) => {
        if (filtre === 'salon') return p.author_role === 'admin';
        if (filtre === 'looks') return p.kind === 'look' || p.kind === 'before_after';
        if (filtre === 'polls') return p.kind === 'poll';
        return true;
      })
      .map((p) => ({ p, ts: horodatage(p), id: String(p.id) }))
      .sort((a, b) => b.ts.localeCompare(a.ts) || b.id.localeCompare(a.id))
      .filter((l) => !curseur || l.ts < curseur.ts || (l.ts === curseur.ts && l.id < curseur.id));
    const pageLignes = lignes.slice(0, limite);
    const derniere = pageLignes[pageLignes.length - 1];
    return {
      json: {
        items: pageLignes.map((l) => this.item(l.p, compte, blocages)),
        next_cursor: lignes.length > limite && derniere ? `${derniere.ts}_${derniere.id}` : null,
      },
    };
  }

  /** Visites du client des 60 derniers jours (commencées, sans proche), la plus récente d'abord. */
  visites(compte) {
    if (compte.role !== 'user') return [];
    const maintenant = this.serveur.maintenant().getTime();
    return (this.serveur.tables.Appointment || [])
      .filter((a) => minuscule(a.client_email) === minuscule(compte.email) && !a.guest_name
        && ['confirmed', 'completed'].includes(a.status))
      .map((a) => ({ a, debut: instantParis(a.date, a.start_time || '00:00').getTime() }))
      .filter(({ debut }) => debut <= maintenant && debut >= maintenant - 60 * JOUR_MS)
      .sort((x, y) => y.debut - x.debut)
      .slice(0, 10)
      .map(({ a }) => {
        const fiche = (this.serveur.tables.Employee || []).find((e) => String(e.id) === String(a.employee_id));
        return {
          id: a.id,
          date: a.date,
          start_time: a.start_time,
          employee_id: a.employee_id,
          employee_name: fiche?.name || a.employee_name || null,
          employee_photo_url: fiche?.photo_url || null,
          service_names: (a.services || []).map((s) => s.name).filter(Boolean),
        };
      });
  }

  /** Une photo de l'app (`<API>/api/media/<id>`), sinon 400 (comme `profilePhotoOrNull`). */
  photo(v, libelle = 'Photo') {
    if (v === undefined || v === null || v === '') return { erreur: erreurFil(400, `${libelle} manquante`) };
    if (typeof v !== 'string' || !v.startsWith(`${API_ORIGINE}/api/media/`)) {
      return { erreur: erreurFil(400, "Photo invalide : envoyez-la depuis l'app") };
    }
    return { url: v };
  }

  /** `POST /feed/posts` (`validateNewPost`, puis `content` de repli, `meta.caption`, doublon de 10 min). */
  publier(corps, compte) {
    const kind = corps.kind === undefined || corps.kind === null || corps.kind === '' ? 'post' : String(corps.kind);
    if (!['post', 'look', 'poll', 'before_after'].includes(kind)) return erreurFil(400, 'Format de publication inconnu');
    if (corps.content != null && typeof corps.content !== 'string') return erreurFil(400, 'Publication invalide');
    const texte = String(corps.content || '').trim();
    if (texte.length > 5000) return erreurFil(400, 'Publication trop longue (5000 caractères au plus)');
    const auteur = this.auteur(compte);
    const meta = {};
    let images = [];
    let content = texte;

    if (kind === 'poll') {
      if (compte.role !== 'admin') return erreurFil(403, 'Seul le salon peut publier un sondage');
      const p = objet(corps.poll);
      const question = String(p.question || '').trim();
      if (!question) return erreurFil(400, 'Question manquante');
      const labels = [];
      for (const o of Array.isArray(p.options) ? p.options : []) {
        const label = String(o && typeof o === 'object' ? o.label || '' : o || '').trim();
        if (!label) continue;
        if (labels.some((l) => l.toLowerCase() === label.toLowerCase())) return erreurFil(400, 'Deux réponses identiques');
        labels.push(label);
      }
      if (labels.length < 2) return erreurFil(400, 'Au moins 2 réponses');
      if (labels.length > 4) return erreurFil(400, '4 réponses au plus');
      const jours = p.days === undefined || p.days === null || p.days === '' ? 3 : Number(p.days);
      if (!Number.isInteger(jours) || jours < 1 || jours > 14) return erreurFil(400, 'Durée du sondage : 1 à 14 jours');
      Object.assign(meta, {
        question,
        options: labels.map((label, i) => ({ id: 'abcd'[i], label })),
        ends_at: new Date(this.serveur.maintenant().getTime() + jours * JOUR_MS).toISOString(),
      });
      content = `📊 Sondage : ${question}\n\n${labels.map((l) => `• ${l}`).join('\n')}\n\nVote dans la dernière version de l'app D'Home Barber.`;
    } else {
      if ((kind === 'look' || kind === 'before_after') && compte.role !== 'user') {
        return erreurFil(403, 'Ce format est réservé aux membres du Gang');
      }
      let visite = null;
      if (corps.visit_id !== undefined && corps.visit_id !== null && corps.visit_id !== '') {
        visite = this.visites(compte).find((v) => String(v.id) === String(corps.visit_id)) || null;
        if (!visite) return erreurFil(404, 'Cette visite est introuvable : choisis une de tes visites récentes.', 'visit_not_found');
      }
      if (kind === 'before_after') {
        const avant = this.photo(corps.before, 'Photo « avant »');
        if (avant.erreur) return avant.erreur;
        const apres = this.photo(corps.after, 'Photo « après »');
        if (apres.erreur) return apres.erreur;
        if (avant.url === apres.url) return erreurFil(400, 'Choisis deux photos différentes');
        images = [avant.url, apres.url];
        Object.assign(meta, { employee_id: visite?.employee_id ?? null, employee_name: visite?.employee_name ?? null });
        content = [texte, '↔️ Avant / Après'].filter(Boolean).join('\n\n');
      } else {
        if (corps.images != null && !Array.isArray(corps.images)) return erreurFil(400, 'Photos invalides');
        if ((corps.images || []).length > 4) return erreurFil(400, '4 photos au plus');
        for (const v of corps.images || []) {
          const r = this.photo(v);
          if (r.erreur) return r.erreur;
          if (!images.includes(r.url)) images.push(r.url);
        }
        if (kind === 'look') {
          if (!images.length) return erreurFil(400, 'Ajoute au moins une photo de ton look');
          if (!visite) return erreurFil(400, 'Choisis la visite de ce look');
          const rdv = (this.serveur.tables.Appointment || []).find((a) => String(a.id) === String(visite.id));
          const fiche = (this.serveur.tables.Employee || []).find((e) => String(e.id) === String(visite.employee_id));
          const catalogue = this.serveur.tables.Service || [];
          const prestations = (rdv?.services || [])
            .map((s) => catalogue.find((c) => String(c.id) === String(s.service_id) && c.is_active !== false))
            .filter(Boolean);
          const reservable = corps.bookable !== false && !!fiche && fiche.is_active !== false && !fiche.is_hidden && prestations.length > 0;
          Object.assign(meta, {
            employee_id: visite.employee_id,
            employee_name: fiche?.name || visite.employee_name || null,
            service_ids: prestations.map((s) => String(s.id)),
            service_names: prestations.map((s) => s.name),
            bookable: reservable,
          });
          const quoi = meta.service_names.join(' + ');
          const fin = [quoi, meta.employee_name ? `avec ${meta.employee_name}` : ''].filter(Boolean).join(' ');
          content = [texte, fin ? `✂️ ${fin}` : ''].filter(Boolean).join('\n\n');
        } else if (!texte && !images.length) {
          return erreurFil(400, 'Publication vide');
        }
      }
    }
    if (images.length > 1) meta.images = images;
    meta.caption = texte;
    const imageUrl = kind === 'before_after' ? images[1] : images[0] || null;

    // Doublon (même auteur, même texte en base, même photo, 10 min) : rendu tel quel
    const maintenant = this.serveur.maintenant().getTime();
    const doublon = this.posts.find((p) => minuscule(p.author_email) === auteur.author_email
      && (p.content || '') === content && (p.image_url || null) === imageUrl
      && maintenant - Date.parse(horodatage(p)) < 10 * 60_000);
    if (doublon) return { json: { item: this.item(doublon, compte) } };

    const ligne = {
      id: this.nouvelId('post'),
      kind: kind === 'post' ? null : kind,
      ...auteur,
      content,
      image_url: imageUrl,
      meta,
      created_at: new Date(maintenant).toISOString(),
    };
    if (!this.serveur.tables.Post) this.serveur.tables.Post = [];
    this.serveur.tables.Post.push(ligne);
    return { status: 201, json: { item: this.item(ligne, compte) } };
  }

  /** `POST /feed/:id/react { reaction }` (emoji de la liste, ou null pour retirer). */
  reagir(post, corps, compte) {
    let reaction = null;
    if (corps.reaction !== null && corps.reaction !== undefined) {
      reaction = REACTIONS_FIL.find((r) => sansVariante(r) === sansVariante(String(corps.reaction).trim())) || null;
      if (!reaction) return erreurFil(400, 'Réaction invalide');
    }
    const email = minuscule(compte.email);
    const moi = (l) => String(l.post_id) === String(post.id) && minuscule(l.user_email) === email;
    const existante = this.likes.find(moi);
    const acteur = this.auteur(compte);
    if (!reaction) {
      this.serveur.tables.PostLike = this.likes.filter((l) => !moi(l));
      this.retirerActivite((a) => a.type === 'reaction' && String(a.post_id) === String(post.id) && minuscule(a.actor_email) === email);
    } else {
      if (existante) existante.reaction = reaction;
      else {
        this.likes.push({
          id: this.nouvelId('like'), post_id: post.id, user_email: email, reaction,
          created_at: this.serveur.maintenant().toISOString(),
        });
      }
      const destinataire = this.destinataireDe(post);
      this.noterActivite(destinataire, acteur, { type: 'reaction', post_id: post.id, emoji: reaction },
        (a) => a.type === 'reaction' && a.recipient_email === destinataire && String(a.post_id) === String(post.id) && a.actor_email === email);
    }
    return { json: this.reactionsDe(post.id, compte) };
  }

  /** `POST /feed/:id/comments { content, reply_to? }` → `{ comment, comments_count }`. */
  commenter(post, corps, compte) {
    if (corps.content != null && typeof corps.content !== 'string') return erreurFil(400, 'Commentaire invalide');
    const content = String(corps.content || '').trim();
    if (!content) return erreurFil(400, 'Commentaire vide');
    if (content.length > 1000) return erreurFil(400, 'Commentaire trop long (1000 caractères au plus)');
    let repondu = null;
    if (corps.reply_to !== undefined && corps.reply_to !== null && corps.reply_to !== '') {
      repondu = this.commentaires.find((c) => String(c.id) === String(corps.reply_to) && String(c.post_id) === String(post.id));
      if (!repondu) return erreurFil(400, 'Ce commentaire n’appartient pas à cette publication.', 'bad_reply');
    }
    const auteur = this.auteur(compte);
    const blocages = this.bloquesPar(compte.email);
    const maintenant = this.serveur.maintenant().getTime();
    const parentId = repondu ? repondu.parent_id || repondu.id : null;
    // Doublon de 30 s (même texte, même fil) : rendu tel quel
    const doublon = this.commentaires.find((c) => String(c.post_id) === String(post.id)
      && minuscule(c.author_email) === auteur.author_email && c.content === content
      && String(c.parent_id || '') === String(parentId || '')
      && maintenant - Date.parse(horodatage(c)) < 30_000);
    const ligne = doublon || {
      id: this.nouvelId('com'),
      post_id: post.id,
      parent_id: parentId,
      ...auteur,
      content,
      created_at: new Date(maintenant).toISOString(),
    };
    if (!doublon) {
      this.commentaires.push(ligne);
      const extrait = resume(content, 140);
      const destRepondu = repondu ? minuscule(repondu.author_email) || null : null;
      if (destRepondu) {
        this.noterActivite(destRepondu, auteur, { type: 'reply', post_id: post.id, comment_id: ligne.id, excerpt: extrait });
      }
      const destPost = this.destinataireDe(post);
      if (destPost && destPost !== destRepondu) {
        this.noterActivite(destPost, auteur, { type: 'comment', post_id: post.id, comment_id: ligne.id, excerpt: extrait });
      }
    }
    return {
      status: doublon ? 200 : 201,
      json: { comment: this.commentaire(ligne, compte), comments_count: this.commentairesVisibles(post.id, blocages).length },
    };
  }

  /** `POST /feed/comments/:id/like { liked }` → `{ likes, my_like }`. */
  aimerCommentaire(id, corps, compte) {
    const c = this.commentaires.find((x) => String(x.id) === String(id));
    const post = c ? this.postVisible(c.post_id, compte) : null;
    if (!c || !post || this.estBloque(this.bloquesPar(compte.email), c.author_email, c.author_key)) {
      return erreurFil(404, "Ce commentaire n'existe plus.", 'not_found');
    }
    if (typeof corps.liked !== 'boolean') return erreurFil(400, 'Choix invalide');
    const email = minuscule(compte.email);
    const moi = (l) => String(l.comment_id) === String(c.id) && minuscule(l.user_email) === email;
    if (corps.liked) {
      if (!this.etat.likesCommentaires.some(moi)) {
        this.etat.likesCommentaires.push({ comment_id: c.id, user_email: email, created_at: this.serveur.maintenant().toISOString() });
        const destinataire = minuscule(c.author_email) || null;
        this.noterActivite(destinataire, this.auteur(compte), { type: 'comment_like', post_id: c.post_id, comment_id: c.id, excerpt: resume(c.content, 140) },
          (a) => a.type === 'comment_like' && a.recipient_email === destinataire && String(a.comment_id) === String(c.id) && a.actor_email === email);
      }
    } else {
      this.etat.likesCommentaires = this.etat.likesCommentaires.filter((l) => !moi(l));
      this.retirerActivite((a) => a.type === 'comment_like' && String(a.comment_id) === String(c.id) && minuscule(a.actor_email) === email);
    }
    const vue = this.commentaire(c, compte);
    return { json: { likes: vue.likes, my_like: vue.my_like } };
  }

  /** `POST /feed/:id/vote { option_id }` → `{ poll }` ; 409 `poll_closed` après la fin. */
  voter(post, corps, compte) {
    if (post.kind !== 'poll') return erreurFil(400, 'Cette publication n’est pas un sondage.', 'not_a_poll');
    const avant = this.sondage(post, compte);
    if (avant.closed) return erreurFil(409, 'Ce sondage est terminé.', 'poll_closed');
    const option = String(corps.option_id == null ? '' : corps.option_id);
    if (!avant.options.some((o) => o.id === option)) return erreurFil(400, 'Réponse inconnue');
    const email = minuscule(compte.email);
    const existant = this.etat.votes.find((v) => String(v.post_id) === String(post.id) && minuscule(v.user_email) === email);
    const quand = this.serveur.maintenant().toISOString();
    if (existant) Object.assign(existant, { option_id: option, updated_at: quand });
    else this.etat.votes.push({ post_id: post.id, user_email: email, option_id: option, created_at: quand, updated_at: quand });
    return { json: { poll: this.sondage(post, compte) } };
  }

  /** Lignes d'activité visibles du compte (90 jours, auteurs bloqués exclus, publication présente). */
  lignesActivite(compte) {
    const email = minuscule(compte.email);
    const blocages = this.bloquesPar(email);
    const depuis = this.serveur.maintenant().getTime() - 90 * JOUR_MS;
    const commentaires = new Set(this.commentaires.map((c) => String(c.id)));
    return this.etat.activite
      .filter((a) => minuscule(a.recipient_email) === email && Date.parse(horodatage(a)) >= depuis)
      .filter((a) => !a.actor_email || !this.estBloque(blocages, a.actor_email))
      .map((a) => ({ a, post: a.post_id ? this.posts.find((p) => String(p.id) === String(a.post_id)) : null }))
      // Publication ou commentaire supprimés : l'activité part avec (ON DELETE CASCADE)
      .filter(({ a, post }) => (!a.post_id || post) && (!a.comment_id || commentaires.has(String(a.comment_id))))
      .sort((x, y) => horodatage(y.a).localeCompare(horodatage(x.a)) || String(y.a.id).localeCompare(String(x.a.id)));
  }

  /**
   * Lignes → éléments de l'écran Activité (`groupActivity` du serveur) : réactions par publication,
   * ❤️ par commentaire, entre lignes de même état (lu / non lu) ; le reste un par un.
   */
  grouper(lignes) {
    const groupes = [];
    const index = new Map();
    for (const { a, post } of lignes) {
      const par = a.type === 'reaction' ? 'post_id' : a.type === 'comment_like' ? 'comment_id' : null;
      const nonLu = !a.read_at;
      const cle = par && a[par] ? `${a.type}:${a[par]}:${nonLu ? 'u' : 'r'}` : null;
      let g = cle ? index.get(cle) : null;
      if (!g) {
        g = {
          id: String(a.id), ids: [], type: a.type, post_id: a.post_id || null, comment_id: a.comment_id || null,
          appointment_id: a.appointment_id || null, actors: [], actors_count: 0, emoji: a.emoji || null,
          excerpt: a.excerpt || null, created_at: horodatage(a), unread: nonLu,
          post_kind: post ? post.kind || 'post' : null, post_image_url: post ? post.image_url || null : null,
          qui: new Set(),
        };
        groupes.push(g);
        if (cle) index.set(cle, g);
      }
      g.ids.push(String(a.id));
      const qui = this.cleDeEmail(a.actor_email) || a.actor_name || 'Un membre';
      if (!g.qui.has(qui)) {
        g.qui.add(qui);
        g.actors_count += 1;
        if (g.actors.length < 3) g.actors.push({ name: a.actor_name || 'Un membre', photo_url: a.actor_photo_url || null, role: a.actor_role || null });
      }
    }
    return groupes.map(({ qui: _qui, ...g }) => g);
  }

  /** Non-lus de l'activité comptés en éléments de l'écran (groupes), 99 au plus, comme le serveur. */
  nonLusActivite(compte) {
    return Math.min(99, this.grouper(this.lignesActivite(compte).filter(({ a }) => !a.read_at)).length);
  }

  /** `GET /feed/activity` → `{ items, unread_count, polls }`. */
  activite(compte) {
    const items = this.grouper(this.lignesActivite(compte).slice(0, 80));
    const maintenant = this.serveur.maintenant().getTime();
    const blocages = this.bloquesPar(compte.email);
    const polls = this.posts
      // Sondages du salon que le lecteur n'a pas écrits (l'admin ne vote pas au sien depuis l'activité)
      .filter((p) => p.kind === 'poll' && p.author_role === 'admin' && !this.estAMoi(p, compte) && !this.publicationBloquee(p, blocages))
      .filter((p) => maintenant - Date.parse(horodatage(p)) <= 14 * JOUR_MS)
      .map((p) => ({ p, s: this.sondage(p, compte) }))
      .filter(({ s }) => !s.closed && !s.my_vote)
      .sort((x, y) => horodatage(y.p).localeCompare(horodatage(x.p)))
      .map(({ p, s }) => ({ post_id: p.id, question: s.question, ends_at: s.ends_at }));
    return {
      json: {
        items,
        unread_count: this.nonLusActivite(compte),
        polls,
      },
    };
  }

  /** `POST /feed/activity/read { ids? }` → `{ unread_count }` (sans `ids` : tout). */
  marquerLu(corps, compte) {
    const email = minuscule(compte.email);
    let ids = null;
    if (corps.ids !== undefined) {
      if (!Array.isArray(corps.ids) || corps.ids.length > 500 || corps.ids.some((x) => typeof x !== 'string' && typeof x !== 'number')) {
        return erreurFil(400, 'Liste invalide');
      }
      ids = new Set(corps.ids.map(String));
    }
    const quand = this.serveur.maintenant().toISOString();
    for (const a of this.etat.activite) {
      if (minuscule(a.recipient_email) !== email || a.read_at) continue;
      if (!ids || ids.has(String(a.id))) a.read_at = quand;
    }
    return { json: { unread_count: this.nonLusActivite(compte) } };
  }

  /** `GET /feed/unread?since=` → `{ activity, posts }` (99 au plus chacun). */
  nonLus(req, compte) {
    let depuis = null;
    if (req.query.since) {
      depuis = Date.parse(String(req.query.since));
      if (!Number.isFinite(depuis)) return erreurFil(400, 'Date invalide');
    } else {
      const vu = this.etat.vuLe[minuscule(compte.email)];
      depuis = vu ? Date.parse(vu) : null;
    }
    const activity = this.nonLusActivite(compte);
    const blocages = this.bloquesPar(compte.email);
    // Ni Last Minute, ni les siennes, ni un Moment du Gang qui le concerne
    const posts = depuis == null ? 0 : Math.min(99, this.posts.filter((p) => p.kind !== 'last_minute'
      && !this.estAMoi(p, compte)
      && !(p.subject_user_id && String(p.subject_user_id) === String(compte.id))
      && !this.publicationBloquee(p, blocages)
      && Date.parse(horodatage(p)) > depuis).length);
    return { json: { activity, posts } };
  }

  reglages(compte) {
    const v = objet(this.etat.reglages[minuscule(compte.email)]);
    const out = { ...PREFS_PAR_DEFAUT };
    for (const k of CLES_PREFS) if (typeof v[k] === 'boolean') out[k] = v[k];
    return out;
  }

  /** `PUT /feed/prefs` : clés connues, booléens stricts (400 sinon) → réglages complets. */
  changerReglages(corps, compte) {
    if (!corps || typeof corps !== 'object' || Array.isArray(corps)) return erreurFil(400, 'Réglages invalides');
    const changement = {};
    for (const [k, v] of Object.entries(corps)) {
      if (!CLES_PREFS.includes(k)) return erreurFil(400, 'Réglage inconnu');
      if (typeof v !== 'boolean') return erreurFil(400, 'Réglage invalide');
      changement[k] = v;
    }
    if (!Object.keys(changement).length) return erreurFil(400, 'Aucun réglage');
    const email = minuscule(compte.email);
    this.etat.reglages[email] = { ...this.reglages(compte), ...changement };
    return { json: this.reglages(compte) };
  }
}

function cheminCorrespond(motif, chemin) {
  return motif instanceof RegExp ? motif.test(chemin) : motif === chemin;
}

const nonAuthentifie = () => ({ status: 401, json: { error: 'Non authentifié' } });
const jetonInvalide = () => ({ status: 401, json: { error: 'Token invalide ou expiré' } });

/** Image d'un média simulé : portrait 4:5 d'une teinte tirée de l'id (lisible sur les captures). */
function imageDeMedia(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h},45%,42%)"/>`
    + `<stop offset="1" stop-color="hsl(${(h + 40) % 360},50%,18%)"/></linearGradient></defs>`
    + `<rect width="800" height="1000" fill="url(#g)"/><circle cx="400" cy="380" r="170" fill="hsla(${h},30%,85%,0.35)"/>`
    + `<rect x="230" y="560" width="340" height="320" rx="150" fill="hsla(${h},30%,85%,0.25)"/></svg>`;
}

function typeDeContenu(chemin) {
  if (/\.css(\?|$)/.test(chemin) || chemin.includes('/css')) return 'text/css';
  if (/\.m?js(\?|$)/.test(chemin)) return 'application/javascript';
  if (/\.json(\?|$)/.test(chemin)) return 'application/json';
  return 'text/plain';
}
