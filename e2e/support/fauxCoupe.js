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
const EN_ATTENTE_AUTH = new Set(['create', 'join', 'peek', 'challenge', 'decline', 'resume']);

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

  /** Arrête tout (fin du test) : plus aucun envoi. */
  arreter() {
    for (const id of this.minuteries) { clearInterval(id); clearTimeout(id); }
    this.minuteries.clear();
    for (const cnx of this.connexions) cnx.ferme = true;
  }

  // ─── Branchement ─────────────────────────────────────────────────────

  brancher(ws) {
    const cnx = { url: ws.url(), messages: [], compte: null, version: null, dernierPing: 0, pingRecuA: 0, ws, salle: null, ferme: false, muet: false };
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
    ws.onClose(() => this.fermeture(cnx));
  }

  /** Envoi vers l'app ; met l'état de la salle à jour pour les messages poussés par un test. */
  envoyer(cnx, obj) {
    if (cnx.ferme) return;
    if (cnx.muet && (obj.t === 'state' || obj.t === 'pong')) return;
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
      cnx.envoyer({ t: 'room', code: salle.code, link: salle.lien, side: salle.you, ...(salle.invited ? { invited: salle.invited } : {}) });
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
        cnx.envoyer({ t: 'hello', name: nomDe(compte), role: compte.role === 'admin' ? 'salon' : compte.role });
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
      case 'ping':
        cnx.dernierPing = Number(m.c) || 0;
        cnx.pingRecuA = Date.now();
        cnx.envoyer({ t: 'pong', c: m.c, s: this.heure(cnx) });
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
          cnx.envoyer({ t: 'end', winner: fin.cancelled ? null : 1 - salle.you, sc: salle.etat.sc, ...fin });
        }
        if (salle) this.fermerSalle(salle);
        break;
      default:
        break;
    }
  }
}
