/**
 * Faux serveur de jeu de La Coupe du Gang (`/ws/coupe`, protocoles v2 et v3) pour les
 * vérifications de bout en bout. Il suit les contrats (docs/fonctions/coupe-du-gang-contrat.md,
 * sections 4 et 7 ; docs/fonctions/coupe-du-gang-regles-v2-contrat.md, sections 4 et 6) et le
 * serveur réel (dhomebarber-api/lib/coupeRooms.js) d'assez près pour que l'app s'y trompe : un
 * écart avec lui doit faire échouer un test. Aucun WebSocket n'atteint un vrai serveur
 * (`routeWebSocket` sans `connectToServer`).
 *
 * Connexion :
 *  - `auth` doit être le premier message, avec `v: 2` ou `v: 3` (sinon `update_required` puis
 *    4426 ; la connexion garde sa version, `cnx.version`) et un jeton de session du faux serveur
 *    (sinon 4401). `versions` (`[2, 3]` par défaut) : versions acceptées ; `faux.versions = [2]`
 *    joue un serveur d'avant le protocole v3 (site déployé avant le serveur, ou serveur revenu en
 *    arrière). `refuser` : `error not_allowed` puis 4403 →
 *    `hello {name, role}` après `delaiAuth` ms (vérification du jeton, 30 ms par défaut) ;
 *    `injoignable` : la connexion est refermée aussitôt ;
 *  - pendant la vérification, comme le serveur : 2 `ping` au plus, la dernière commande de salle
 *    (`create`, `join`, `peek`, `challenge`, `decline`, `resume`) gardée pour après `hello` ; tout
 *    autre message (`in`, `hit`, `react`…) ferme la socket en 1008 (`fermetures1008`) ;
 *  - `ping {c}` → `pong {c, s}` (heure du serveur fictive, voir `heure`).
 *
 * Salles (une par demande de l'app ; l'autre joueur est simulé) :
 *  - `create` → `room {code, link, side: 0}` (CODE_MATCH, LIEN_MATCH) ; l'adversaire arrive quand
 *    le test appelle `rejoint()` → `start {you: 0}` ;
 *  - `challenge {employee_id}` → salle réservée au barber (`invited`), ou `barber_unavailable` si
 *    `barberIndispo` ; `rejoint()` quand il accepte ;
 *  - `challenge {key_hash}` (liste « Défier un joueur ») : CLE_LISTE_LUCAS → salle réservée à Lucas M.
 *    (`invited` avec sa photo) ; autre clé ou `joueurIndispo` → `player_unavailable` ;
 *  - `join {code}` (CODE_MATCH) ou `join {link}` (LIEN_MATCH, LIEN_DEFI, LIEN_INVITE) → `room
 *    {side: 1}` puis `start {you: 1}` et un `state` ; si `createurAbsent`, `waiting_opponent {}`
 *    d'abord (le `start` part à `createurRevient()`) ; autre code ou lien → `error no_room` ;
 *  - `peek {link}` : LIEN_DEFI → `invite` (Lucas M., 2 min) ; sinon `error no_room`.
 *
 * Match : un `state` toutes les 100 ms (comme les 30 / s du vrai serveur, assez pour la
 * surveillance de l'app : 1,5 s sans état = connexion perdue), avec la phase, le score, `ack` (le
 * dernier `hit.n` traité, du côté de l'app) et `acc` (la dernière frappe acceptée : toutes, sauf
 * avec `refuserFrappes`). `etat(cnx, valeurs)` change l'état courant et l'envoie tout de suite ;
 * `cnx.envoyer({ t: 'end' | 'goal' | … })` met aussi l'état à jour.
 *
 * Coupure : socket fermée par l'app (ou `couper`) sans `leave` → la salle reste, l'app a
 * `delaiReprise` (10 s, temps réel) pour `resume {link}` en plein match ; salle d'attente gardée
 * (2 min) pour son créateur, un invité qui perd sa connexion pendant l'attente est retiré (il refait
 * `join {link}`). `resume` → `start {resume: true, sc}` puis `state` (match), ou `room` (salle
 * d'attente, puis `start` si l'adversaire est arrivé entre-temps) ; trop tard, inconnu, ou invité
 * d'une salle d'attente → `error no_room`.
 * `leave` en plein match = forfait : l'app reçoit sa fin du match (`end` personnel, `finAbandon`,
 * null pour ne rien envoyer) puis la salle est fermée. `retenirReprise` : la réponse à `resume`
 * attend `libererReprise()`. `taire(cnx)` : plus ni `state` ni `pong` (socket muette).
 * `expirerAbsences()` : les absents perdent tout de suite (forfait, comme après 10 s).
 * Refus : `refusCreation` (`create`, `challenge`) et `refusJoin` (`join`) : code d'erreur rendu.
 *
 * Un test pousse lui-même le reste (`goal`, `end`, `pause`, `declined`, `time_left`, `invite`…)
 * avec `envoyer`.
 *
 * Règlement v2 (protocole v3) :
 *  - `regles` (1 par défaut) : `faux.regles = 2` avant le `start` y met `rules: 2, gw: 5`, comme le
 *    vrai serveur quand les deux téléphones sont en v3 (une connexion `v: 2` garde la règle
 *    d'aujourd'hui). La salle retient son règlement (`salle.regles`) : une reprise par une socket
 *    v2 dans un match en règlement v2 reçoit `error no_room`, comme chez le serveur ;
 *  - `etat(cnx, {…})` passe tels quels les champs v2 (`md`, `w`, `cp`, `pk`, `ne`, `b` à 7
 *    valeurs `[x, y, vx, vy, fx, own, air]`), tous dans le repère du serveur (joueur 0 en bas) ; ils
 *    restent dans l'état envoyé toutes les 100 ms jusqu'à ce qu'un `etat` les change (`md:
 *    undefined` l'efface : jeu normal) ;
 *  - `envoyer(cnx, {…})` passe tels quels `ev {e}`, `ev_end {id}`, `foul {side, k, w, pen}`,
 *    `pen_end {r}`, `gold {}` et `goal {by, sc, v, fx}` ; les événements envoyés (`ev`), moins ceux
 *    finis par `ev_end`, repartent dans `start.evs` d'une reprise (ceux dont `until` n'est pas
 *    passé à l'heure du faux serveur) ;
 *  - `evenements(cnx, [e1, e2…])` envoie un `ev` par descripteur, dans l'ordre : un combo du vrai
 *    serveur (`makeEvents` : orage ou gel avec l'arrosage, mêmes heures, identifiants qui se
 *    suivent) part ainsi en deux `ev` de suite, gardés ensemble.
 *
 * Tournois (docs/fonctions/coupe-tournois-contrat.md, section 5) :
 *  - `tjoin {m}` (protocole v3, sinon `update_required`) : `faux.tournoi` décrit le match
 *    (`match` : ID_MATCH_TOURNOI, `nom`, `tour`, `opp` : nom de l'adversaire dans `tour` (null :
 *    serveur d'avant `tour.opp`), `you` : côté imposé, `forfaitDans` : échéance du forfait en ms
 *    après le premier `tjoin` (gardée pour les suivants, comme la base ; 0 ou moins : déjà passée),
 *    `avecLien` : la salle donne son lien, `adversairePresent` : l'adversaire attend déjà, `refus` :
 *    code d'erreur rendu, `t_not_ready`…, `refusFois` : refus seulement aux N premiers `tjoin`, null
 *    à tous) ; autre match → `t_not_found` ; échéance passée → `t_closed`. Sinon
 *    `room {code, link?, side, tour: {name, label, fa, opp}}` (le code est envoyé exprès : l'app ne
 *    doit pas le montrer), puis `start` (avec `tour`) à `rejoint()`, ou tout de suite si
 *    `adversairePresent`. Comme le vrai serveur date `fa` de son horloge, la réponse attend le
 *    premier `ping` de la connexion. Match en cours dont le joueur est absent : `tjoin` = reprise
 *    (`start {resume: true}`) ; `redemarrer(cnx)` : serveur redémarré (salle perdue, socket coupée
 *    en 1012, nouvelle échéance au prochain `tjoin`) ;
 *  - salle d'attente d'un tournoi quittée (socket fermée, `leave`) : retirée, un nouveau `tjoin` en
 *    rouvre une ; `rematch` → `error rematch_off` ; `leave` en plein match : fin avec `tour: true` ;
 *  - tirs au but, dans l'ordre du serveur des salles : `gold` (but en or fini sans but), puis
 *    `tirsAuBut(cnx, premier)` : `shootout {first}` et `so: [[], []]` dans les états, par côté du
 *    serveur ; le test joue chaque tir avec `etat` (`ph: 'pen'` 3 s, puis `live` avec
 *    `md: ['pen', s, …]`), puis `pen_end {r}` ; tir marqué : `ph: 'goal'` sans message `goal`, `sc`
 *    inchangé, `so` complété ; fin : état `over`, puis `end` avec `tour: true` et `so: [a, b]`
 *    (abandon pendant la séance : `end` forfait avec le `so` des états, par côté du serveur). Une
 *    reprise pendant la séance renvoie `start {resume, tour}` sans `shootout` (les tirs restent dans
 *    les états) ; `fermerTournoi(cnx, code)` : `error {code}` puis la salle fermée (forfait
 *    prononcé, match réglé par l'admin).
 *
 * Spectateurs (docs/fonctions/coupe-spectateurs-contrat.md, section 1) :
 *  - `auth {token, v: 3, watch: true}` → `hello {name, role, watch: true}` (socket spectateur,
 *    `cnx.spectateur`) ; `auth {screen: <clé>, v: 3}` (écran du salon) → `hello {role: 'screen',
 *    watch: true}` si la clé est dans `clesEcran` (CLE_ECRAN au départ) ou acceptée par
 *    `api.ecran.cleValide(clé)` quand le faux serveur de l'écran la fournit, sinon, comme le serveur
 *    depuis le 4 nov. 2026 (S2), `error screen_revoked` puis fermeture 4401 ; `limiterAuth = n` :
 *    les n prochaines authentifications de spectateur reçoivent `error rate_limited` puis 4429
 *    (quota, avant `hello`). `auth.sp` (compteur des joueurs) est ignoré, comme tout champ inconnu.
 *    Une socket spectateur qui envoie un message de joueur (`create`, `join`, `peek`, `challenge`,
 *    `decline`, `resume`, `tjoin`, `rematch`, `in`, `hit`, `react`) reçoit `error watch_only` ; une
 *    socket joueur qui envoie `watch` aussi ;
 *  - matchs regardables : `ouvrirDirect(desc)` (DIRECT_TOURNOI : match de tournoi ID_MATCH_TOURNOI,
 *    Lucas M. contre Dom, « Quart 1 », règlement v2 ; DIRECT_MATCH : match ordinaire ID_DIRECT,
 *    Kevin contre le salon, règle d'aujourd'hui ; `commence: false` : pas encore commencé). Son état
 *    (`etat`, repère du serveur, joueur 0 en bas) part 10 fois par seconde à ses spectateurs ;
 *    `etatDirect(id, valeurs)` le change et l'envoie tout de suite (le temps de la phase avance tout
 *    seul sans `pt` donné) ;
 *  - `watch {m}` / `watch {w}` : `refusRegarder` (code rendu : 'no_match', 'watch_full', 'disabled',
 *    'server_full' (puis fermeture 1013)…, aux `refusRegarderFois` premiers seulement, null à tous) ;
 *    plus de 10 `watch` par minute sur une socket → `rate_limited` ; inconnu, fini, ou mauvais genre
 *    (`m` pour un match ordinaire) → `no_match` ; pas commencé → `not_live` ; sinon `wstart` (avec
 *    `wstartEnPlus` mêlé, pour vérifier que l'app ignore un champ en trop comme `photos`) puis l'état ;
 *    `wstart.tour` porte `label` (le tour, « Quart de finale ») et `title` (le match, « Quart 1 ») ;
 *    `tl` (secondes restantes) après un `time_left` relayé (jusqu'au but en or), `away {side, left}`
 *    pendant une pause (comme le serveur, S9 et S10) ; `unwatch` : plus rien de ce match ;
 *  - `relayer(id, obj)` : un message à ses spectateurs (`goal`, `ev`, `ev_end`, `foul`, `pen_end`,
 *    `gold`, `shootout`, `pause`, `time_left` ; l'état suit `goal` et `pause`, les `ev` repartent dans
 *    `wstart.evs`) ; `finDirect(id, fin)` : `wend {winner, sc, reason, forfeit, so?}` puis plus rien ;
 *    `spectateurs(id, n, ecran)` : `watchers {n, screen}` ; `encouragement(id, r)` : `cheer {r}` d'un
 *    autre spectateur ; `commencerDirect(id)` : le prochain `watch` reçoit `wstart` ;
 *    `fermerEcran(clé)` : l'admin coupe l'écran (`error screen_revoked` puis 4401, clé refusée
 *    ensuite) ; `remplacer(cnx)` : une socket plus récente du même compte ou écran (`error replaced`
 *    puis 4409) ; `couper(cnx, 4401)` : un 4401 seul (sans `screen_revoked`) ;
 *    `cnx.fermeeParApp` : la socket a été fermée par l'app (place de spectateur rendue) ;
 *  - `cheer {r}` (gardé dans les messages : la cadence se lit par `messages('cheer')`) : relayé aux
 *    autres spectateurs du match, ignoré à moins de 3 s du précédent de la socket (`cheersIgnores`) ;
 *  - joueurs : aucune aide ici, `envoyer(cnx, {t: 'watchers' | 'cheer', …})` pousse ces messages.
 */
export const CODE_MATCH = '4821';
/** Lien d'un match (12 caractères [a-z0-9], contrat 4.2). */
export const LIEN_MATCH = 'k7m2p9q4x8ab';
/** Lien du défi reçu de Lucas M. */
export const LIEN_DEFI = 'd3f1r3cu8x2z';
/** Lien d'un défi reçu pendant que le jeu est ouvert (`invite` sur la socket de l'app). */
export const LIEN_INVITE = 'n0uv3aud3f1x';
/** Clés publiques des adversaires (Signaler, Bloquer). */
export const CLE_KEVIN = 'cle-kevin-0123';
export const CLE_LUCAS = 'cle-lucas-4567';
/** Clé publique de Lucas M. dans la liste « Défier un joueur » (32 caractères hexadécimaux, GET /coupe/players). */
export const CLE_LISTE_LUCAS = 'a1'.repeat(16);
/** Photo de profil de Lucas M. (média de l'app), portée par `invited` d'un défi depuis la liste. */
export const PHOTO_LUCAS = 'https://dhomebarber-api-3aabb8313cb6.herokuapp.com/api/media/0b9f0c1e-3c1f-4b8e-9a52-2f6a1c0d9e11';
/** Tournois : un tournoi et le match de l'app (uuid du serveur), lien de la salle quand il est donné. */
export const ID_TOURNOI = '7d1e5a20-3b4c-4f6e-9a8b-0c1d2e3f4a5b';
export const ID_MATCH_TOURNOI = 'c3a9f0b2-6d4e-4a1f-8b7c-2e5d9f0a1b3c';
export const LIEN_TOURNOI = 't0urn01l1en9';
/** Match de tournoi par défaut : quart de finale contre Kevin, 1 min 42 avant le forfait. */
export const TOURNOI_DEFAUT = Object.freeze({
  match: ID_MATCH_TOURNOI, nom: 'Coupe de Novembre', tour: 'Quart de finale', opp: 'Kevin', you: 0,
  forfaitDans: 102_000, avecLien: true, adversairePresent: false, refus: null, refusFois: null,
});

/** Spectateurs : clé d'un écran du salon acceptée par défaut. */
export const CLE_ECRAN = 'ecran-salon-cle-0123456789abcdef';
/** Match ordinaire regardable (12 caractères [a-z2-9], contrat 1.2). */
export const ID_DIRECT = 'r3gard3k7m2p';
/**
 * Match de tournoi en direct : quart 1 de la Coupe de Novembre, Lucas M. (en bas) contre Dom (en haut).
 * `tour.label` : le nom du tour (comme le serveur), `tour.title` : le match (S9, 4 nov. 2026).
 */
export const DIRECT_TOURNOI = Object.freeze({
  kind: 'tour', id: ID_MATCH_TOURNOI, names: ['Lucas M.', 'Dom'], roles: ['user', 'barber'], rules: 2, gw: 5,
  sc: [0, 0], tour: { tid: ID_TOURNOI, name: 'Coupe de Novembre', label: 'Quart de finale', title: 'Quart 1' },
  watchers: 34, screen: false, commence: true, etat: null,
});
/** Match ordinaire regardable (les deux joueurs ont allumé « Laisser regarder mes matchs ») : Kevin contre le salon. */
export const DIRECT_MATCH = Object.freeze({
  kind: 'room', id: ID_DIRECT, names: ['Kevin', "D'Home Barber"], roles: ['barber', 'salon'], rules: 1, gw: 3,
  sc: [0, 0], tour: null, watchers: 3, screen: false, commence: true, etat: null,
});
/** Messages de joueur refusés à une socket spectateur (`watch_only`, contrat 1.1). */
const JOUEUR_SEULEMENT = new Set(['create', 'join', 'peek', 'challenge', 'decline', 'resume', 'tjoin', 'rematch', 'in', 'hit', 'react']);

/** Écart fictif entre l'horloge du serveur et celle du navigateur (ms). */
const DECALAGE_HORLOGE = 5000;
/** Un `state` toutes les 100 ms pendant un match (temps réel). */
const CADENCE_ETATS = 100;
/** Place gardée après une coupure en plein match (temps réel, comme le serveur). */
const DELAI_REPRISE = 10_000;
/** Salle d'attente : 2 minutes. */
const DUREE_SALLE = 120_000;
/** Vérification du jeton avant `hello` (le vrai serveur lit la base) : un `in` envoyé trop tôt ferme la socket. */
const DELAI_AUTH = 30;
/** Avant `hello`, seules ces commandes de salle sont gardées pour après (comme le serveur). */
const EN_ATTENTE_AUTH = new Set(['create', 'join', 'peek', 'challenge', 'decline', 'resume', 'tjoin']);

const KEVIN = { nom: 'Kevin', role: 'barber', cle: CLE_KEVIN };
const LUCAS = { nom: 'Lucas M.', role: 'user', cle: CLE_LUCAS };

/** Nom affiché d'un compte (contrat 0) : admin = « D'Home Barber », sinon prénom + initiale. */
function nomDe(compte) {
  if (compte.role === 'admin') return "D'Home Barber";
  const [prenom = 'Membre', nom = ''] = String(compte.full_name || '').split(/\s+/);
  return nom ? `${prenom} ${nom.charAt(0)}.` : prenom;
}

/**
 * État d'un match au coup d'envoi (repère du serveur) ; `k` : moitié du ballon. Sans `cd` (durée du
 * compte à rebours) : l'app compte 3 s, sans avant-match ; `avantMatch()` joue le vrai premier coup
 * d'envoi (4,5 s, temps écoulé qui avance).
 */
const ETAT_DEPART = () => ({ ph: 'count', pt: 0.4, b: [180, 320, 0, 0], p: [[180, 540], [180, 100]], sc: [0, 0], k: 0, kt: 0 });

export class FauxCoupe {
  constructor(serveur) {
    this.serveur = serveur;
    /** Connexions reçues : `{ url, messages, compte, version, envoyer, ws, salle, ferme, muet }` (messages décodés, dans l'ordre). */
    this.connexions = [];
    /** Salles ouvertes par l'app (la plus récente en dernier). */
    this.salles = [];
    /** Réglages d'un test. */
    this.refuser = false;
    this.injoignable = false;
    this.barberIndispo = false;
    /** `challenge {key_hash}` refusé (`player_unavailable`) : le joueur n'est plus dans la liste. */
    this.joueurIndispo = false;
    this.retenirReprise = false;
    this.reprisesEnAttente = [];
    this.createurAbsent = false;
    /** Code d'erreur rendu à `create` et `challenge` (`already_playing`, `rate_limited`…), sinon null. */
    this.refusCreation = null;
    /** Code d'erreur rendu à `join` (`salon_vs_salon`, `blocked`…), sinon null. */
    this.refusJoin = null;
    /** Les frappes sont traitées (`ack`) mais refusées (`acc` ne bouge pas). */
    this.refuserFrappes = false;
    /**
     * Durée du premier compte à rebours annoncée au coup d'envoi (`state.cd`, 4,5 au vrai serveur
     * depuis le thème stade) ; null : rien d'annoncé, l'app compte 3 s sans avant-match.
     */
    this.avantMatchCd = null;
    /**
     * Photo de l'adversaire simulé dans `start.photos` (url de média) ; null par défaut. Envoyée
     * telle quelle, même pour un barber (le vrai serveur ne le fait pas : l'app doit l'ignorer).
     */
    this.photoAdversaire = null;
    /** `start` sans `photos` (serveur d'avant les photos des clients). */
    this.sansPhotos = false;
    /**
     * Fin du match envoyée à celui qui abandonne (`leave` en plein match), sans `t` ni `sc` ;
     * null : rien (l'app fait sa fin elle-même au bout de 3,5 s). Par défaut : défaite classée.
     */
    this.finAbandon = { forfeit: true, cancelled: false, reason: null, points: { ranked: true, reason: null, delta: null, total: 41, rank: 9, rank_before: 8 } };
    /**
     * Règlement des matchs commencés (`start`) : 1 (règle d'aujourd'hui) ou 2 (règlement v2 :
     * `rules: 2, gw: 5` dans le `start` d'une connexion en protocole v3).
     */
    this.regles = 1;
    /** Versions du protocole acceptées par `auth` : `[2]` pour un serveur d'avant la v3. */
    this.versions = [2, 3];
    this.delaiAuth = DELAI_AUTH;
    this.delaiReprise = DELAI_REPRISE;
    /** Sockets fermées en 1008 (message de jeu avant `hello`). */
    this.fermetures1008 = 0;
    /** Match de tournoi rejoint par `tjoin` (voir TOURNOI_DEFAUT) ; un test en change les champs. */
    this.tournoi = { ...TOURNOI_DEFAUT };
    /** Spectateurs : matchs regardables (id → direct), clés d'écran acceptées, refus imposés. */
    this.directs = new Map();
    this.clesEcran = new Set([CLE_ECRAN]);
    this.refusRegarder = null;
    this.refusRegarderFois = null;
    /** Champs mêlés à chaque `wstart` (un serveur qui enverrait trop : `{ photos: [...] }`). */
    this.wstartEnPlus = null;
    /** Réactions ignorées par le faux serveur (moins de 3 s après la précédente de la socket). */
    this.cheersIgnores = 0;
    /** Authentifications de spectateur refusées par le quota (`rate_limited` puis 4429), les n prochaines. */
    this.limiterAuth = 0;
    this.minuteries = new Set();
  }

  // ─── Outils pour les tests ───────────────────────────────────────────

  /** Tous les messages reçus d'un type donné (`auth`, `create`, `join`, `react`, `leave`…). */
  messages(type) {
    return this.connexions.flatMap((c) => c.messages.filter((m) => m?.t === type));
  }

  /** Dernière connexion ouverte par l'app. */
  derniere() {
    return this.connexions[this.connexions.length - 1];
  }

  /** Salle de la dernière demande (ou celle d'une connexion). */
  salle(cnx = null) {
    return cnx ? cnx.salle : this.salles[this.salles.length - 1] || null;
  }

  /**
   * Heure du serveur fictive pour cette connexion : l'heure du navigateur au dernier ping reçu,
   * plus le temps écoulé depuis (même horloge des deux côtés), plus un écart fixe.
   */
  heure(cnx = this.derniere()) {
    return this.heureConnue(cnx) ?? DECALAGE_HORLOGE;
  }

  /**
   * Même heure, ou null tant qu'aucun ping n'a jamais été reçu : l'horloge du navigateur est alors
   * inconnue. Nouvelle connexion (reprise) sans ping encore : la plus récente.
   */
  heureConnue(cnx) {
    const ref = cnx?.dernierPing ? cnx : [...this.connexions].reverse().find((c) => c.dernierPing) || null;
    return ref ? ref.dernierPing + (Date.now() - ref.pingRecuA) + DECALAGE_HORLOGE : null;
  }

  /** Change l'état du match (`state`) de la connexion et l'envoie tout de suite (ballon au centre, en jeu par défaut). */
  etat(cnx = this.derniere(), valeurs = {}) {
    const salle = cnx.salle;
    if (salle) {
      salle.etat = { ...salle.etat, ph: 'live', ...valeurs };
      if (salle.etat.ph !== 'count') salle.compteDepuis = null;
      else {
        // Compte à rebours posé : 3 s sans durée donnée (comme le vrai serveur après un but ou un
        // retour) ; sans `pt` donné, son temps avance depuis zéro
        if (valeurs.cd === undefined) salle.etat.cd = 3;
        if (valeurs.pt === undefined) salle.etat.pt = 0;
        salle.compteDepuis = valeurs.pt === undefined ? Date.now() : null;
      }
      if (salle.phase === 'wait') salle.phase = 'match';
      this.envoyerEtat(salle);
      return;
    }
    const { cd, ...depart } = ETAT_DEPART();
    const etat = { ...depart, ph: 'live', ...valeurs };
    cnx.envoyer({ t: 'state', s: this.heure(cnx), ...etat, ...(etat.ph === 'count' ? { cd: valeurs.cd ?? cd } : {}), ack: [0, 0] });
  }

  /**
   * Règlement v2 : un `ev {e}` par descripteur (repère du serveur), dans l'ordre, comme le vrai
   * serveur à la création d'un combo (`makeEvents`) ; ils restent dans `start.evs` d'une reprise.
   */
  evenements(cnx = this.derniere(), liste = []) {
    for (const e of liste) this.envoyer(cnx, { t: 'ev', e });
  }

  /** Coupe la connexion de l'app comme une perte de réseau (1001 : rien de fatal). */
  couper(cnx = this.derniere(), code = 1001) {
    this.fermeture(cnx);
    try { cnx.ws.close({ code, reason: 'coupure' }); } catch { /* déjà fermée */ }
  }

  /** Socket muette : plus ni `state` ni `pong` (réseau tombé sans fermeture). */
  taire(cnx = this.derniere()) {
    cnx.muet = true;
  }

  /** L'adversaire arrive dans la salle d'attente de l'app (créateur, side 0) : `start`, ou au retour de l'app. */
  rejoint(cnx = this.derniere()) {
    const salle = cnx.salle || this.salle();
    if (!salle) throw new Error('Aucune salle à rejoindre');
    salle.adversairePret = true;
    if (salle.cnx) this.coupDEnvoi(salle);
  }

  /** Salle rejointe pendant l'absence du créateur (`waiting_opponent`) : il revient, le match commence. */
  createurRevient(cnx = this.derniere()) {
    const salle = cnx.salle;
    if (salle && salle.phase === 'wait') this.coupDEnvoi(salle);
  }

  /** Répond aux reprises retenues (`retenirReprise`). */
  libererReprise() {
    this.retenirReprise = false;
    const liste = this.reprisesEnAttente;
    this.reprisesEnAttente = [];
    // Une connexion refermée entre-temps (l'app a réessayé) n'est plus servie
    for (const { cnx, salle } of liste) if (!cnx.ferme) this.reprendre(cnx, salle);
  }

  /** Les joueurs absents perdent tout de suite (forfait, comme après 10 s chez le serveur). */
  expirerAbsences() {
    for (const salle of this.salles) {
      if (salle.absentDepuis != null && salle.phase === 'match') this.fermerSalle(salle);
    }
  }

  /**
   * Tournoi : la séance de tirs au but commence (`shootout {first}`, `premier` dans le repère du
   * serveur) ; les états portent ensuite `so` (tirs de chacun), vide au départ.
   */
  tirsAuBut(cnx = this.derniere(), premier = 0) {
    const salle = cnx.salle;
    cnx.envoyer({ t: 'shootout', first: premier });
    if (salle) salle.etat = { ...salle.etat, so: [[], []] };
  }

  /**
   * Tournoi : serveur redémarré en plein match ou en salle d'attente : la salle est perdue, la
   * socket coupée (1012) ; le match redevient jouable avec une nouvelle échéance (au prochain
   * `tjoin`). Avec `refus: 't_not_ready'` et `refusFois`, les premiers `tjoin` après le retour
   * sont refusés, comme juste après un vrai redémarrage.
   */
  redemarrer(cnx = this.derniere()) {
    const salle = cnx.salle;
    this.couper(cnx, 1012);
    if (salle) this.fermerSalle(salle);
    this.tournoi.echeance = null;
  }

  /** Tournoi : salle fermée par le serveur (`error {code}` : forfait prononcé, match réglé par l'admin). */
  fermerTournoi(cnx = this.derniere(), code = 't_closed') {
    cnx.envoyer({ t: 'error', code });
    if (cnx.salle) this.fermerSalle(cnx.salle);
  }

  // ─── Spectateurs ─────────────────────────────────────────────────────

  /**
   * Ouvre un match regardable (DIRECT_TOURNOI par défaut, ou DIRECT_MATCH, champs changés par
   * `desc`) ; son état part 10 fois par seconde à ses spectateurs. Rend le direct.
   */
  ouvrirDirect(desc = DIRECT_TOURNOI) {
    const base = { ...DIRECT_TOURNOI, ...desc };
    const etat = { ph: 'live', pt: 1, b: [180, 320, 0, 0], p: [[180, 540], [180, 100]], sc: base.sc || [0, 0], k: 0, kt: 0, ...(base.etat || {}) };
    const d = { ...base, etat, evs: [], fini: false, phaseDepuis: Date.now(), ptDonne: base.etat?.pt !== undefined, tic: null, tl: null, pause: null };
    const ancien = this.directs.get(d.id);
    if (ancien?.tic) { clearInterval(ancien.tic); this.minuteries.delete(ancien.tic); }
    this.directs.set(d.id, d);
    const id = setInterval(() => {
      if (d.fini) return;
      for (const cnx of this.regardent(d.id)) this.envoyerEtatDirect(d, cnx);
    }, CADENCE_ETATS);
    id.unref?.();
    d.tic = id;
    this.minuteries.add(id);
    return d;
  }

  /** Sockets spectateurs qui regardent ce match. */
  regardent(id) {
    return this.connexions.filter((c) => c.spectateur && !c.ferme && c.regarde === id);
  }

  /** Change l'état du direct (repère du serveur) et l'envoie tout de suite. */
  etatDirect(id, valeurs = {}) {
    const d = this.directs.get(id);
    if (!d) throw new Error(`Direct inconnu : ${id}`);
    if (valeurs.ph && valeurs.ph !== d.etat.ph) d.phaseDepuis = Date.now();
    if (valeurs.ph && valeurs.ph !== 'pause') d.pause = null;
    d.ptDonne = valeurs.pt !== undefined;
    d.etat = { ...d.etat, ...valeurs };
    if (Array.isArray(valeurs.sc)) d.sc = valeurs.sc;
    for (const cnx of this.regardent(id)) this.envoyerEtatDirect(d, cnx);
  }

  envoyerEtatDirect(d, cnx) {
    const s = this.heureConnue(cnx);
    if (s == null) return;
    const { cd, ...etat } = d.etat;
    if (!d.ptDonne) etat.pt = Math.round(Date.now() - d.phaseDepuis) / 1000;
    cnx.envoyer({ t: 'state', s, ...etat, ...(etat.ph === 'count' ? { cd: cd || 3 } : {}) });
  }

  /** Message du match à ses spectateurs (l'état suit `goal` et `pause`, les `ev` restent pour `wstart.evs`). */
  relayer(id, obj) {
    const d = this.directs.get(id);
    if (!d) throw new Error(`Direct inconnu : ${id}`);
    if (obj.t === 'goal' && Array.isArray(obj.sc)) {
      d.sc = obj.sc;
      d.etat = { ...d.etat, ph: 'goal', sc: obj.sc };
      d.phaseDepuis = Date.now();
      d.ptDonne = false;
    }
    if (obj.t === 'pause') {
      d.etat = { ...d.etat, ph: 'pause' };
      d.phaseDepuis = Date.now();
      d.ptDonne = false;
      d.pause = { side: Number(obj.away) === 1 ? 1 : 0, left: Number(obj.left) || 0, depuis: Date.now() };
    }
    // Alerte des 30 s (repart dans `wstart.tl`), effacée par le but en or
    if (obj.t === 'time_left') d.tl = { s: Number(obj.s) || 0, depuis: Date.now() };
    if (obj.t === 'gold') d.tl = null;
    if (obj.t === 'ev' && obj.e) d.evs = [...d.evs.filter((e) => e.id !== obj.e.id), obj.e];
    if (obj.t === 'ev_end') d.evs = d.evs.filter((e) => e.id !== obj.id);
    for (const cnx of this.regardent(id)) cnx.envoyer(obj);
  }

  /** Fin du match regardé : `wend` à ses spectateurs, puis ils ne regardent plus rien. */
  finDirect(id, fin = {}) {
    const d = this.directs.get(id);
    if (!d) throw new Error(`Direct inconnu : ${id}`);
    const sc = fin.sc || d.etat.sc || d.sc;
    const msg = {
      t: 'wend',
      winner: fin.winner === undefined ? 0 : fin.winner,
      sc,
      reason: fin.reason === undefined ? null : fin.reason,
      forfeit: fin.forfeit === true,
      ...(fin.so ? { so: fin.so } : {}),
    };
    d.fini = true;
    d.etat = { ...d.etat, ph: 'over', sc };
    for (const cnx of this.regardent(id)) {
      cnx.envoyer(msg);
      cnx.regarde = null;
    }
    if (d.tic) { clearInterval(d.tic); this.minuteries.delete(d.tic); d.tic = null; }
  }

  /** Nombre de spectateurs (écrans compris) et écran du salon : `watchers {n, screen}`. */
  spectateurs(id, n, ecran = false) {
    const d = this.directs.get(id);
    if (!d) throw new Error(`Direct inconnu : ${id}`);
    d.watchers = n;
    d.screen = !!ecran;
    for (const cnx of this.regardent(id)) cnx.envoyer({ t: 'watchers', n, screen: !!ecran });
  }

  /** Réaction d'un autre spectateur (anonyme) : `cheer {r}`. */
  encouragement(id, r) {
    for (const cnx of this.regardent(id)) cnx.envoyer({ t: 'cheer', r });
  }

  /** Le match de tournoi pas encore commencé commence : le prochain `watch` reçoit `wstart`. */
  commencerDirect(id) {
    const d = this.directs.get(id);
    if (!d) throw new Error(`Direct inconnu : ${id}`);
    d.commence = true;
    d.phaseDepuis = Date.now();
  }

  /**
   * L'admin coupe un écran du salon : ses sockets reçoivent `error screen_revoked` puis sont fermées
   * en 4401 (serveur du 4 nov. 2026, S2), la clé est refusée ensuite.
   */
  fermerEcran(cle) {
    this.clesEcran.delete(cle);
    for (const cnx of this.connexions) {
      if (cnx.ecran === cle && !cnx.ferme) this.refuserEcran(cnx);
    }
  }

  // Clé d'écran refusée (connexion, coupure par l'admin) : `screen_revoked` avant le 4401
  refuserEcran(cnx) {
    cnx.envoyer({ t: 'error', code: 'screen_revoked' });
    cnx.ferme = true;
    try { cnx.ws.close({ code: 4401, reason: 'ecran coupe' }); } catch { /* déjà fermée */ }
  }

  /** Une socket plus récente du même compte (ou du même écran) prend la place : `replaced` puis 4409. */
  remplacer(cnx = this.derniere()) {
    cnx.envoyer({ t: 'error', code: 'replaced' });
    cnx.ferme = true;
    try { cnx.ws.close({ code: 4409, reason: 'replaced' }); } catch { /* déjà fermée */ }
  }

  /** Clé d'écran acceptée (celles d'ici, ou celles du faux serveur de l'écran s'il sait les lire). */
  cleEcranValide(cle) {
    if (!cle) return false;
    if (this.clesEcran.has(cle)) return true;
    try { return this.serveur?.ecran?.cleValide?.(cle) === true; } catch { return false; }
  }

  // `watch {m}` / `watch {w}` d'une socket spectateur
  regarder(cnx, m) {
    const maintenant = Date.now();
    cnx.watchs = (cnx.watchs || []).filter((t) => maintenant - t < 60_000);
    cnx.regarde = null;
    if (cnx.watchs.length >= 10) {
      cnx.envoyer({ t: 'error', code: 'rate_limited' });
      return;
    }
    cnx.watchs.push(maintenant);
    const refus = this.refusRegarder;
    if (refus && (this.refusRegarderFois == null || this.refusRegarderFois > 0)) {
      if (this.refusRegarderFois != null) this.refusRegarderFois -= 1;
      cnx.envoyer({ t: 'error', code: refus });
      if (refus === 'server_full') {
        cnx.ferme = true;
        cnx.ws.close({ code: 1013, reason: 'plein' });
      }
      return;
    }
    const tournoi = m.m !== undefined;
    const id = String(tournoi ? m.m : m.w ?? '');
    const d = this.directs.get(id);
    if (!d || d.fini || d.kind !== (tournoi ? 'tour' : 'room')) {
      cnx.envoyer({ t: 'error', code: 'no_match' });
      return;
    }
    if (!d.commence) {
      cnx.envoyer({ t: 'error', code: 'not_live' });
      return;
    }
    cnx.regarde = id;
    const heure = this.heure(cnx);
    cnx.envoyer({
      t: 'wstart',
      kind: d.kind,
      id: d.id,
      names: d.names,
      roles: d.roles,
      rules: d.rules,
      gw: d.gw,
      sc: d.etat.sc,
      kick: 0,
      ph: d.etat.ph,
      ...(d.etat.ph === 'count' ? { cd: d.etat.cd || 3 } : {}),
      evs: d.rules === 2 ? d.evs.filter((e) => !(Number(e.until) <= heure)) : [],
      so: d.etat.so || null,
      tour: d.tour,
      watchers: d.watchers,
      screen: d.screen,
      ...(d.tl ? { tl: Math.max(0, Math.round((d.tl.s - (Date.now() - d.tl.depuis) / 1000) * 10) / 10) } : {}),
      ...(d.etat.ph === 'pause' && d.pause
        ? { away: { side: d.pause.side, left: Math.max(0, Math.ceil(d.pause.left - (Date.now() - d.pause.depuis) / 1000)) } }
        : {}),
      ...(this.wstartEnPlus || {}),
    });
    this.envoyerEtatDirect(d, cnx);
  }

  // Messages d'une socket spectateur après `auth`
  repondreSpectateur(cnx, m) {
    if (!cnx.authOk) {
      // Vérification du jeton ou de la clé : 2 `ping` au plus, rien d'autre n'est gardé
      if (m.t === 'ping' && (cnx.pingsAvantHello = (cnx.pingsAvantHello || 0) + 1) <= 2) return;
      cnx.ferme = true;
      cnx.ws.close({ code: 1008, reason: 'avant hello' });
      return;
    }
    if (JOUEUR_SEULEMENT.has(m.t)) {
      cnx.envoyer({ t: 'error', code: 'watch_only' });
      return;
    }
    switch (m.t) {
      case 'ping':
        cnx.dernierPing = Number(m.c) || 0;
        cnx.pingRecuA = Date.now();
        cnx.envoyer({ t: 'pong', c: m.c, s: this.heure(cnx) });
        break;
      case 'watch':
        this.regarder(cnx, m);
        break;
      case 'unwatch':
        cnx.regarde = null;
        break;
      case 'cheer': {
        const r = Number(m.r);
        const maintenant = Date.now();
        if (!cnx.regarde || cnx.ecran || !Number.isInteger(r) || r < 0 || r > 3) break;
        if (maintenant - (cnx.dernierCheer || 0) < 3000) { this.cheersIgnores += 1; break; }
        cnx.dernierCheer = maintenant;
        for (const autre of this.regardent(cnx.regarde)) if (autre !== cnx) autre.envoyer({ t: 'cheer', r });
        break;
      }
      default:
        break;
    }
  }

  /** Arrête tout (fin du test) : plus aucun envoi. */
  arreter() {
    for (const id of this.minuteries) { clearInterval(id); clearTimeout(id); }
    this.minuteries.clear();
    for (const cnx of this.connexions) cnx.ferme = true;
  }

  // ─── Branchement ─────────────────────────────────────────────────────

  brancher(ws) {
    // `envoyes` : messages partis vers l'app, sauf `state` et `pong` (30 par seconde)
    const cnx = { url: ws.url(), messages: [], envoyes: [], compte: null, version: null, dernierPing: 0, pingRecuA: 0, ws, salle: null, ferme: false, muet: false };
    cnx.envoyer = (obj) => this.envoyer(cnx, obj);
    this.connexions.push(cnx);
    if (this.injoignable) {
      // 1001 : serveur parti (1011 voudrait dire « erreur du serveur de jeu » pour l'app)
      cnx.ferme = true;
      ws.close({ code: 1001, reason: 'indisponible' });
      return;
    }
    ws.onMessage((brut) => {
      if (cnx.ferme) return;
      let m;
      try {
        m = JSON.parse(String(brut));
      } catch {
        cnx.messages.push({ t: 'illisible', brut: String(brut) });
        return;
      }
      cnx.messages.push(m);
      this.repondre(cnx, m);
    });
    // Fermée par l'app (fin de l'écran, page cachée, surveillance) : la salle garde sa place
    ws.onClose(() => {
      if (!cnx.ferme) cnx.fermeeParApp = true;
      this.fermeture(cnx);
    });
  }

  /** Envoi vers l'app ; met l'état de la salle à jour pour les messages poussés par un test. */
  envoyer(cnx, obj) {
    if (cnx.ferme) return;
    if (cnx.muet && (obj.t === 'state' || obj.t === 'pong')) return;
    if (obj.t !== 'state' && obj.t !== 'pong') cnx.envoyes.push(obj);
    const salle = cnx.salle;
    if (salle) {
      if (obj.t === 'goal' && Array.isArray(obj.sc)) salle.etat = { ...salle.etat, ph: 'goal', pt: 0, sc: obj.sc };
      // L'adversaire est parti un instant : ballon arrêté, les états disent `pause`
      if (obj.t === 'pause') salle.etat = { ...salle.etat, ph: 'pause', pt: 0 };
      if (obj.t === 'end') {
        salle.phase = 'over';
        if (Array.isArray(obj.sc)) salle.etat = { ...salle.etat, ph: 'over', sc: obj.sc };
      }
      if (obj.t === 'start' && !obj.resume) {
        salle.phase = 'match';
        salle.etat = ETAT_DEPART();
        salle.compteDepuis = null;
        // `ack` et `acc` repartent de zéro à chaque match (revanche comprise), comme les événements
        salle.dernierHit = 0;
        salle.derniereAcceptee = 0;
        salle.evs = [];
        salle.regles = obj.rules === 2 ? 2 : 1;
        this.demarrerEtats(salle);
      }
      // Règlement v2 : événements du match, pour le `start.evs` d'une reprise
      if (obj.t === 'ev' && obj.e && typeof obj.e === 'object') salle.evs = [...(salle.evs || []).filter((e) => e.id !== obj.e.id), obj.e];
      if (obj.t === 'ev_end') salle.evs = (salle.evs || []).filter((e) => e.id !== obj.id);
    }
    try {
      cnx.ws.send(JSON.stringify(obj));
    } catch {
      cnx.ferme = true;
    }
  }

  envoyerEtat(salle) {
    const cnx = salle.cnx;
    if (!cnx || cnx.ferme) return;
    // Pas d'état avant le premier ping : son heure serait inventée, et l'app la corrigerait d'un
    // coup au premier pong (temps de la phase faussé de plusieurs secondes, avant-match sauté).
    // Le vrai serveur date toujours ses états de sa vraie heure ; l'état suivant part 100 ms après
    const s = this.heureConnue(cnx);
    if (s == null) return;
    const ack = [0, 0];
    const acc = [0, 0];
    ack[salle.you] = salle.dernierHit;
    acc[salle.you] = salle.derniereAcceptee;
    // `cd` seulement pendant un compte à rebours, comme le vrai serveur ; avant-match : `pt` avance
    const { cd, ...etat } = salle.etat;
    if (etat.ph === 'count' && salle.compteDepuis) etat.pt = Math.round(Date.now() - salle.compteDepuis) / 1000;
    cnx.envoyer({ t: 'state', s, ...etat, ...(etat.ph === 'count' && cd ? { cd } : {}), ack, acc });
  }

  /**
   * Premier coup d'envoi du vrai serveur (thème stade, 29 oct. 2026) : compte à rebours de `cd`
   * secondes (4,5 : 2 s de stade et de zoom, puis 3, 2, 1), temps écoulé qui avance avec l'horloge.
   */
  avantMatch(cnx = this.derniere(), cd = 4.5) {
    const salle = cnx.salle;
    salle.etat = { ...salle.etat, ph: 'count', pt: 0, cd };
    salle.compteDepuis = Date.now();
    if (salle.phase === 'wait') salle.phase = 'match';
    this.envoyerEtat(salle);
  }

  // Un `state` toutes les 100 ms tant que le match dure et que l'app est là
  demarrerEtats(salle) {
    if (salle.tic) return;
    const id = setInterval(() => {
      if (salle.phase !== 'match') {
        clearInterval(id);
        this.minuteries.delete(id);
        salle.tic = null;
        return;
      }
      this.envoyerEtat(salle);
    }, CADENCE_ETATS);
    id.unref?.();
    salle.tic = id;
    this.minuteries.add(id);
  }

  nouvelleSalle(cnx, { you, adversaire, lien, invited = null }) {
    if (cnx.salle && cnx.salle.phase !== 'fermee') this.fermerSalle(cnx.salle);
    const salle = {
      code: CODE_MATCH, lien, you, adversaire, invited, phase: 'wait', ouverteA: Date.now(),
      cnx, absentDepuis: null, adversairePret: false, etat: ETAT_DEPART(), dernierHit: 0, derniereAcceptee: 0, tic: null,
      // Règlement du match (décidé au `start`) et événements envoyés (règlement v2)
      regles: 1, evs: [],
    };
    this.salles.push(salle);
    cnx.salle = salle;
    return salle;
  }

  fermerSalle(salle) {
    salle.phase = 'fermee';
    if (salle.tic) { clearInterval(salle.tic); this.minuteries.delete(salle.tic); salle.tic = null; }
    if (salle.cnx) salle.cnx.salle = null;
    salle.cnx = null;
  }

  /** Socket de l'app fermée sans `leave` : la salle attend son retour. */
  fermeture(cnx) {
    if (cnx.ferme) return;
    cnx.ferme = true;
    const salle = cnx.salle;
    if (!salle || salle.cnx !== cnx) return;
    salle.cnx = null;
    if (salle.phase === 'over') { this.fermerSalle(salle); return; }
    // Salle d'attente d'un tournoi : retirée (un nouveau `tjoin` en rouvre une)
    if (salle.phase === 'wait' && salle.tour) { this.fermerSalle(salle); return; }
    // Invité d'une salle d'attente : retiré (il rejoindra de nouveau par le lien)
    if (salle.phase === 'wait' && salle.you === 1) { this.fermerSalle(salle); return; }
    salle.absentDepuis = Date.now();
    if (salle.phase === 'match') {
      // Pas revenu à temps : forfait (la salle se ferme)
      const id = setTimeout(() => {
        this.minuteries.delete(id);
        if (salle.absentDepuis != null && salle.phase === 'match') this.fermerSalle(salle);
      }, this.delaiReprise);
      id.unref?.();
      this.minuteries.add(id);
    }
  }

  /**
   * `start` : on joue `salle.you` contre l'adversaire simulé (Kevin, ou Lucas M. pour un défi).
   * Comme le serveur v2 : `ranked_hint` toujours null, `sc` (score courant), `resume` après une reprise.
   */
  depart(cnx, { reprise = false } = {}) {
    const salle = cnx.salle;
    const a = salle.adversaire;
    const moi = cnx.compte;
    const you = salle.you;
    const cote = (mien, autre) => (you === 0 ? [mien, autre] : [autre, mien]);
    // Règlement v2 : décidé au coup d'envoi (`regles` = 2 et connexion en protocole v3), gardé à la
    // reprise ; la reprise redonne les événements pas encore finis (`evs`)
    const v2 = reprise ? salle.regles === 2 : this.regles === 2 && cnx.version === 3;
    const heure = this.heure(cnx);
    const regles = v2
      ? { rules: 2, gw: 5, ...(reprise ? { evs: (salle.evs || []).filter((e) => !(Number(e.until) <= heure)) } : {}) }
      : {};
    cnx.envoyer({
      t: 'start',
      you,
      names: cote(nomDe(moi), a.nom),
      roles: cote(moi.role === 'admin' ? 'salon' : moi.role, a.role),
      keys: cote(moi.role === 'admin' ? 'salon' : `cle-${moi.id}`, a.cle),
      // Photos des clients, comme le vrai serveur : celle du compte connecté s'il est client
      ...(this.sansPhotos ? {} : { photos: cote(moi.role === 'user' ? moi.photo_url || null : null, this.photoAdversaire) }),
      kick: 0,
      ranked_hint: null,
      sc: salle.etat.sc,
      // Durée du compte à rebours en cours, comme le vrai serveur : 4,5 au premier coup d'envoi
      // (`avantMatchCd`), 3 après un retour
      ...(reprise ? { cd: 3, resume: true } : this.avantMatchCd ? { cd: this.avantMatchCd } : {}),
      ...regles,
      // Tournoi : `tour` (nom, tour, échéance) et le lien de la salle s'il y en a un
      ...(salle.tour ? { tour: salle.tour, ...(salle.lien ? { link: salle.lien } : {}) } : {}),
    });
  }

  coupDEnvoi(salle) {
    const cnx = salle.cnx;
    if (!cnx) return;
    this.depart(cnx);
    // Vrai premier coup d'envoi (`avantMatchCd`, 4,5 s) : `cd` dès le premier état, temps qui avance
    if (this.avantMatchCd) {
      salle.etat = { ...salle.etat, ph: 'count', pt: 0, cd: this.avantMatchCd };
      salle.compteDepuis = Date.now();
    }
    this.envoyerEtat(salle);
  }

  reprendre(cnx, salle) {
    salle.cnx = cnx;
    salle.absentDepuis = null;
    cnx.salle = salle;
    if (salle.phase === 'wait') {
      cnx.envoyer({ t: 'room', code: salle.code, link: salle.lien, side: salle.you, ...(salle.invited ? { invited: salle.invited } : {}), ...(salle.tour ? { tour: salle.tour } : {}) });
      if (salle.adversairePret) this.coupDEnvoi(salle);
      return;
    }
    // Retour en plein match : nouveau compte à rebours (3 s, temps qui avance depuis zéro), le match
    // continue avec le même score
    salle.etat = { ...salle.etat, ph: 'count', pt: 0, cd: 3 };
    salle.compteDepuis = Date.now();
    this.depart(cnx, { reprise: true });
    this.envoyerEtat(salle);
    this.demarrerEtats(salle);
  }

  repondre(cnx, m) {
    // Premier message : `auth` obligatoire
    if (!cnx.authRecu) {
      if (m.t !== 'auth') {
        cnx.ferme = true;
        cnx.ws.close({ code: 4401, reason: 'auth' });
        return;
      }
      cnx.authRecu = true;
      // Protocole v2 (apps publiées) ou v3 (règlement v2 possible) ; la connexion garde sa version
      if (!this.versions.includes(m.v)) {
        cnx.envoyer({ t: 'error', code: 'update_required' });
        cnx.ferme = true;
        cnx.ws.close({ code: 4426, reason: 'update_required' });
        return;
      }
      cnx.version = m.v;
      // Quota des authentifications de spectateur (avant `hello`) : `rate_limited` puis 4429
      if ((m.screen !== undefined || m.watch === true) && this.limiterAuth > 0) {
        this.limiterAuth -= 1;
        cnx.envoyer({ t: 'error', code: 'rate_limited' });
        cnx.ferme = true;
        cnx.ws.close({ code: 4429, reason: 'rate_limited' });
        return;
      }
      // Écran du salon : clé d'écran, sans compte ; spectateurs en protocole 3 seulement
      if (m.screen !== undefined) {
        const cle = String(m.screen || '');
        if (m.v !== 3) {
          cnx.ferme = true;
          cnx.ws.close({ code: 4401, reason: 'auth' });
          return;
        }
        if (!this.cleEcranValide(cle)) {
          this.refuserEcran(cnx);
          return;
        }
        cnx.spectateur = true;
        cnx.ecran = cle;
        const accueillirEcran = () => {
          if (cnx.ferme) return;
          cnx.authOk = true;
          cnx.envoyer({ t: 'hello', role: 'screen', watch: true });
        };
        if (this.delaiAuth > 0) {
          const id = setTimeout(() => { this.minuteries.delete(id); accueillirEcran(); }, this.delaiAuth);
          id.unref?.();
          this.minuteries.add(id);
        } else accueillirEcran();
        return;
      }
      if (m.watch === true) cnx.spectateur = true;
      const idCompte = this.serveur.jetons.get(m.token);
      const compte = this.serveur.comptes.find((c) => c.id === idCompte);
      if (!compte) {
        cnx.ferme = true;
        cnx.ws.close({ code: 4401, reason: 'auth' });
        return;
      }
      // Vérification du jeton (lecture du compte) : `hello` un peu plus tard
      const accueillir = () => {
        if (cnx.ferme) return;
        if (this.refuser) {
          cnx.envoyer({ t: 'error', code: 'not_allowed' });
          cnx.ferme = true;
          cnx.ws.close({ code: 4403, reason: 'not_allowed' });
          return;
        }
        cnx.compte = compte;
        cnx.authOk = true;
        cnx.envoyer({
          t: 'hello', name: nomDe(compte), role: compte.role === 'admin' ? 'salon' : compte.role,
          ...(cnx.spectateur ? { watch: true } : {}),
        });
        const enAttente = cnx.commandeEnAttente;
        cnx.commandeEnAttente = null;
        if (enAttente) this.repondre(cnx, enAttente);
      };
      if (this.delaiAuth > 0) {
        const id = setTimeout(() => { this.minuteries.delete(id); accueillir(); }, this.delaiAuth);
        id.unref?.();
        this.minuteries.add(id);
      } else accueillir();
      return;
    }
    // Socket spectateur (`watch: true`, ou écran du salon) : son propre protocole
    if (cnx.spectateur) {
      this.repondreSpectateur(cnx, m);
      return;
    }
    // Pendant la vérification du jeton : 2 `ping`, la dernière commande de salle, rien d'autre
    if (!cnx.compte) {
      if (m.t === 'ping' && (cnx.pingsAvantHello = (cnx.pingsAvantHello || 0) + 1) <= 2) return;
      if (EN_ATTENTE_AUTH.has(m.t)) { cnx.commandeEnAttente = m; return; }
      this.fermetures1008 += 1;
      cnx.ferme = true;
      cnx.ws.close({ code: 1008, reason: 'avant hello' });
      return;
    }

    const salle = cnx.salle;
    switch (m.t) {
      case 'ping': {
        cnx.dernierPing = Number(m.c) || 0;
        cnx.pingRecuA = Date.now();
        cnx.envoyer({ t: 'pong', c: m.c, s: this.heure(cnx) });
        // `tjoin` arrivé avant l'heure de cette connexion : l'échéance `fa` est maintenant datable
        const tjoin = cnx.tjoinEnAttente;
        cnx.tjoinEnAttente = null;
        if (tjoin) this.repondre(cnx, tjoin);
        break;
      }
      case 'tjoin': {
        const t = this.tournoi;
        if (cnx.version !== 3) {
          cnx.envoyer({ t: 'error', code: 'update_required' });
          break;
        }
        if (t.refus && (t.refusFois == null || t.refusFois > 0)) {
          if (t.refusFois != null) t.refusFois -= 1;
          cnx.envoyer({ t: 'error', code: t.refus });
          break;
        }
        if (m.m !== t.match) {
          cnx.envoyer({ t: 'error', code: 't_not_found' });
          break;
        }
        // Match en cours dont ce joueur est parti : `tjoin` le reprend, comme `resume`
        const enCours = [...this.salles].reverse().find((sa) => sa.tourMid === m.m && sa.phase === 'match'
          && sa.absentDepuis != null && Date.now() - sa.absentDepuis <= this.delaiReprise);
        if (enCours) {
          if (this.retenirReprise) { this.reprisesEnAttente.push({ cnx, salle: enCours }); break; }
          this.reprendre(cnx, enCours);
          break;
        }
        if (this.heureConnue(cnx) == null) {
          cnx.tjoinEnAttente = m;
          break;
        }
        // Échéance du forfait : posée au premier `tjoin` (la base fait foi ensuite) ; passée :
        // personne ne rejoint plus (le vrai serveur : `t_closed`)
        const heure = this.heure(cnx);
        if (t.echeance == null) t.echeance = Math.round(heure + t.forfaitDans);
        if (heure >= t.echeance) {
          cnx.envoyer({ t: 'error', code: 't_closed' });
          break;
        }
        const nouvelle = this.nouvelleSalle(cnx, { you: t.you, adversaire: KEVIN, lien: t.avecLien ? LIEN_TOURNOI : null });
        nouvelle.tourMid = t.match;
        nouvelle.tour = { name: t.nom, label: t.tour, fa: t.echeance, ...(t.opp ? { opp: t.opp } : {}) };
        cnx.envoyer({ t: 'room', code: CODE_MATCH, ...(nouvelle.lien ? { link: nouvelle.lien } : {}), side: t.you, tour: nouvelle.tour });
        if (t.adversairePresent) this.rejoint(cnx);
        break;
      }
      case 'watch':
        // Une socket joueur ne regarde pas (spectateur : `auth {watch: true}`)
        cnx.envoyer({ t: 'error', code: 'watch_only' });
        break;
      case 'rematch':
        // Jamais de revanche dans une salle de tournoi (une salle ordinaire : le test pousse le `start`)
        if (salle?.tour) cnx.envoyer({ t: 'error', code: 'rematch_off' });
        break;
      case 'create':
        if (this.refusCreation) {
          cnx.envoyer({ t: 'error', code: this.refusCreation });
          break;
        }
        this.nouvelleSalle(cnx, { you: 0, adversaire: KEVIN, lien: LIEN_MATCH });
        cnx.envoyer({ t: 'room', code: CODE_MATCH, link: LIEN_MATCH, side: 0 });
        break;
      case 'challenge': {
        if (this.refusCreation) {
          cnx.envoyer({ t: 'error', code: this.refusCreation });
          break;
        }
        if (m.employee_id === undefined && m.key_hash !== undefined) {
          if (this.joueurIndispo || m.key_hash !== CLE_LISTE_LUCAS) {
            cnx.envoyer({ t: 'error', code: 'player_unavailable' });
            break;
          }
          const invited = { name: 'Lucas M.', role: 'user', photo: PHOTO_LUCAS };
          this.nouvelleSalle(cnx, { you: 0, adversaire: LUCAS, lien: LIEN_MATCH, invited });
          cnx.envoyer({ t: 'room', code: CODE_MATCH, link: LIEN_MATCH, side: 0, invited });
          break;
        }
        if (this.barberIndispo) {
          cnx.envoyer({ t: 'error', code: 'barber_unavailable' });
          break;
        }
        const invited = { name: 'Kevin', role: 'barber' };
        this.nouvelleSalle(cnx, { you: 0, adversaire: KEVIN, lien: LIEN_MATCH, invited });
        cnx.envoyer({ t: 'room', code: CODE_MATCH, link: LIEN_MATCH, side: 0, invited });
        break;
      }
      case 'peek':
        if (this.refusJoin) {
          cnx.envoyer({ t: 'error', code: this.refusJoin });
          break;
        }
        if (m.link !== LIEN_DEFI) {
          cnx.envoyer({ t: 'error', code: 'no_room' });
          break;
        }
        cnx.envoyer({ t: 'invite', link: LIEN_DEFI, from: { name: 'Lucas M.', role: 'user' }, expires_in: 120 });
        break;
      case 'join': {
        if (this.refusJoin) {
          cnx.envoyer({ t: 'error', code: this.refusJoin });
          break;
        }
        const liens = [LIEN_MATCH, LIEN_DEFI, LIEN_INVITE];
        if (m.code !== CODE_MATCH && !liens.includes(m.link)) {
          cnx.envoyer({ t: 'error', code: 'no_room' });
          break;
        }
        const adversaire = m.link === LIEN_DEFI || m.link === LIEN_INVITE ? LUCAS : KEVIN;
        const lien = m.link || LIEN_MATCH;
        const nouvelle = this.nouvelleSalle(cnx, { you: 1, adversaire, lien });
        cnx.envoyer({ t: 'room', code: CODE_MATCH, link: lien, side: 1 });
        if (this.createurAbsent) {
          cnx.envoyer({ t: 'waiting_opponent' });
          break;
        }
        this.coupDEnvoi(nouvelle);
        break;
      }
      case 'resume': {
        // En plein match : les deux joueurs ; salle d'attente : seulement son créateur (un invité
        // parti est retiré, il refait `join {link}`)
        const visee = [...this.salles].reverse().find((s) => s.lien === m.link && s.absentDepuis != null
          && (s.phase === 'match' ? Date.now() - s.absentDepuis <= this.delaiReprise
            : s.phase === 'wait' && s.you === 0 && Date.now() - s.ouverteA <= DUREE_SALLE));
        // Match en règlement v2 : une socket v2 (app publiée) ne peut pas le reprendre
        if (!visee || (visee.phase === 'match' && visee.regles === 2 && cnx.version !== 3)) {
          cnx.envoyer({ t: 'error', code: 'no_room' });
          break;
        }
        if (this.retenirReprise) {
          // La réponse viendra à `libererReprise()`
          this.reprisesEnAttente.push({ cnx, salle: visee });
          break;
        }
        this.reprendre(cnx, visee);
        break;
      }
      case 'hit':
        if (salle && Number(m.n) > salle.dernierHit) {
          salle.dernierHit = Number(m.n);
          if (!this.refuserFrappes) salle.derniereAcceptee = salle.dernierHit;
        }
        break;
      case 'leave':
        // En plein match : forfait, et la fin du match (personnelle) part à celui qui abandonne avant
        // qu'il soit détaché ; salle d'attente, fin du match : fermée
        if (salle && salle.phase === 'match' && this.finAbandon) {
          const fin = { ...this.finAbandon };
          if (fin.points) {
            const delta = [0, 0];
            delta[salle.you] = -1;
            delta[1 - salle.you] = 3;
            fin.points = { ...fin.points, delta: fin.points.delta || delta };
          }
          // Tournoi : un abandon est toujours un forfait, jamais « annulé » ; pendant la séance de
          // tirs au but, la fin porte aussi leur score (`so`, par côté du serveur)
          const so = salle.tour && Array.isArray(salle.etat.so)
            ? { so: salle.etat.so.map((l) => l.reduce((n, v) => n + (v ? 1 : 0), 0)) }
            : {};
          const tour = salle.tour ? { tour: true, cancelled: false, ...so } : {};
          cnx.envoyer({ t: 'end', winner: fin.cancelled && !salle.tour ? null : 1 - salle.you, sc: salle.etat.sc, ...fin, ...tour });
        }
        if (salle) this.fermerSalle(salle);
        break;
      default:
        break;
    }
  }
}
