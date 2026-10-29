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
 *    les routes REST de la Coupe (`/coupe/…`) par `FauxCoupeRest`, plus bas (`api.coupeRest`).
 *
 * Un test peut remplacer la réponse d'une route avec `surcharger(méthode, chemin, fabrique)` :
 * la fabrique reçoit la requête décodée et rend `{ status, json }`, `RESEAU_COUPE` (échec réseau)
 * ou `undefined` (comportement par défaut).
 */
import { creerDonnees, CLIENT, media } from './donnees.js';
import { FauxCoupe, CLE_LISTE_LUCAS, PHOTO_LUCAS } from './fauxCoupe.js';
import { MAINTENANT, cleDuJourParis, instantParis } from './temps.js';

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
    this.compteurId = 0;
    this.compteurJeton = 0;
  }

  // ─── Outils pour les tests ───────────────────────────────────────────

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
