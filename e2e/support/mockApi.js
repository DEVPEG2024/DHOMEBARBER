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
 *    `/ws/coupe` (La Coupe du Gang) est servi par un faux serveur de jeu (`support/fauxCoupe.js`).
 *
 * Un test peut remplacer la réponse d'une route avec `surcharger(méthode, chemin, fabrique)` :
 * la fabrique reçoit la requête décodée et rend `{ status, json }`, `RESEAU_COUPE` (échec réseau)
 * ou `undefined` (comportement par défaut).
 */
import { creerDonnees } from './donnees.js';
import { FauxCoupe } from './fauxCoupe.js';

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
