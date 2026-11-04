// Tournois de La Coupe du Gang (contrat : docs/fonctions/coupe-tournois-contrat.md, sections 1 et 3.4) :
// faux serveur des routes /coupe/tournaments… et /coupe/admin/tournaments…, branché par mockApi.js
// (`api.tournois`). Mêmes règles et mêmes formes de réponse que le vrai serveur ; aucun tournoi au
// départ, les tests les fabriquent dans l'état voulu (`creer`).
//
// Côté joueurs, aligné sur le vrai serveur (lib/coupeTournaments.js `tournamentView`, `register`,
// `unregister`, `checkin` ; routes/coupeTournaments.js) : mêmes ordres d'erreur et mêmes textes ; un
// présent sans place au tirage est `out` sans tête de série (un inscrit pas présent : `absent`) ; un
// joueur retiré par le salon n'est plus dans `players`, `me.registered` faux et `me.status`
// `removed` (inscription, désinscription et présence : 403 `removed`) ; `forfeit_at` null une fois
// le match commencé, `ready_at` seulement pour un match `ready` ; se désinscrire sans être inscrit :
// `{ ok: true }`. Les réponses des routes admin ne changent pas (un retrait avant le tirage est
// gardé à part, `retires`, hors de la liste des joueurs).
//
// Clés des joueurs = `key_hash` du faux classement de la Coupe (`api.coupeRest`) : `joueur-lucas`…,
// `salon` pour les comptes admin, `compte-<id>` pour un compte de connexion. Le palmarès (`titres`)
// est donc lu tel quel par `/coupe/me`, `/coupe/player/:keyHash` et les lignes du classement.
//
// Aides pour les tests (voir chaque méthode) :
//   creer({ etat, taille, nom, debut, inscrits, attente, moi, presents, tirageDepuis, raison, gagnants })
//   tournoi(id), match(id, quel), tirer(id), finir(id, quel, résultat), jouerTour(id, tour, résultat),
//   direct(id, quel, live), inscrire(id, qui, options), annuler(id, raison), retirer(id, cle),
//   ajouterTitre(cle, titre), maintenant(), avancer(ms), figer(), cleDe(compte), titres(cle).
import { cleDuJourParis, instantParis, ajouterJours } from './temps.js';

/** Délais du contrat (section 1). */
export const CHECKIN_MS = 15 * 60_000;
export const DRAW_SHOW_MS = 30_000;
export const JOIN_MS = 2 * 60_000;
/** Placement standard du tableau (numéros de tête de série par place). */
const PLACEMENT = { 8: [1, 8, 4, 5, 2, 7, 3, 6], 16: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11] };
const LIBELLES = { 16: ['8es de finale', 'Quarts de finale', 'Demi-finales', 'Finale'], 8: ['Quarts de finale', 'Demi-finales', 'Finale'] };
const SINGULIERS = { '8es de finale': '8e de finale', 'Quarts de finale': 'Quart de finale', 'Demi-finales': 'Demi-finale', Finale: 'Finale' };

/**
 * Joueurs simulés, dans l'ordre où `creer` les inscrit : ceux du faux classement de la Coupe (mêmes
 * clés, mêmes noms, points de la saison relus dans `api.coupeRest`), puis d'autres clients.
 */
export const JOUEURS_TOURNOI = [
  { cle: 'joueur-lucas', nom: 'Lucas M.', role: 'user', points: 87 },
  { cle: 'joueur-kevin', nom: 'Kevin', role: 'barber', points: 81 },
  { cle: 'salon', nom: "D'Home Barber", role: 'salon', points: 74 },
  { cle: 'joueur-sarah', nom: 'Sarah K.', role: 'user', points: 69 },
  { cle: 'joueur-dom', nom: 'Dom', role: 'barber', points: 63 },
  { cle: 'joueur-yanis', nom: 'Yanis B.', role: 'user', points: 58 },
  { cle: 'joueur-romain', nom: 'Romain', role: 'barber', points: 51 },
  { cle: 'joueur-mehdi', nom: 'Mehdi A.', role: 'user', points: 40 },
  { cle: 'joueur-hugo', nom: 'Hugo L.', role: 'user', points: 36 },
  { cle: 'joueur-ines', nom: 'Inès B.', role: 'user', points: 30 },
  { cle: 'joueur-nora', nom: 'Nora D.', role: 'user', points: 24 },
  { cle: 'joueur-bilal', nom: 'Bilal H.', role: 'user', points: 20 },
  { cle: 'joueur-adam', nom: 'Adam C.', role: 'user', points: 15 },
  { cle: 'joueur-theo', nom: 'Théo L.', role: 'user', points: 12 },
  { cle: 'joueur-lea', nom: 'Léa G.', role: 'user', points: 9 },
  { cle: 'joueur-mael', nom: 'Maël S.', role: 'user', points: 5 },
  { cle: 'joueur-enzo', nom: 'Enzo F.', role: 'user', points: 3 },
  { cle: 'joueur-rayan', nom: 'Rayan T.', role: 'user', points: 2 },
];

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const erreur = (status, code, error) => ({ status, json: { error, code } });
const HEURE_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

export class FauxTournois {
  constructor(serveur) {
    this.serveur = serveur;
    /** Tournois (état interne, voir `creer`). */
    this.liste = [];
    /** Avance de l'horloge du faux serveur sur celle de `api.maintenant()` (ms, `avancer`). */
    this.decalage = 0;
    /** Titres ajoutés à la main (`ajouterTitre`), en plus de ceux des tournois finis. */
    this.titresAjoutes = [];
    /** Heure figée (`figer`), sinon null. */
    this.figeeA = null;
    this.compteur = 0;
  }

  // ─── Horloge ─────────────────────────────────────────────────────────

  /**
   * Heure du faux serveur (Date) : celle de `api.maintenant()` (qui suit le temps réel), avancée par
   * `avancer` ; après `figer()`, elle ne bouge plus qu'avec `avancer`.
   */
  maintenant() {
    const base = this.figeeA ?? this.serveur.maintenant().getTime();
    return new Date(base + this.decalage);
  }

  /** Arrête le temps réel côté serveur (animations réglées sur l'heure du serveur, comptes à rebours). */
  figer() {
    this.figeeA = this.serveur.maintenant().getTime();
  }

  ms() {
    return this.maintenant().getTime();
  }

  /** Fait passer `ms` millisecondes côté serveur, puis fait tourner l'horloge (tirage, forfaits…). */
  avancer(ms) {
    this.decalage += ms;
    this.horloge();
  }

  /**
   * Horloge du serveur (`startTournamentTicker`), jouée à chaque requête : tirage (ou annulation à
   * moins de 4 présents) au début, forfaits à l'échéance des 2 min, avancement du tableau.
   */
  horloge() {
    const now = this.ms();
    for (const t of this.liste) {
      // Le vrai serveur tire dans les 5 s qui suivent le début : tirage daté du début
      if (t.status === 'open' && now >= t.starts_at) this.tirerTournoi(t, t.starts_at);
      if (t.status !== 'running') continue;
      for (const m of t.matchs) {
        if (m.status !== 'ready' || m.started_at != null || m.ready_at == null || now < m.ready_at + JOIN_MS) continue;
        const present = m.live?.present || [false, false];
        if (present[0] && present[1]) continue;
        if (present[0] || present[1]) this.clore(t, m, { gagnant: present[0] ? 0 : 1, raison: 'forfeit' });
        else this.clore(t, m, { gagnant: 0, raison: 'double_forfeit' }); // le vrai serveur tire au sort
      }
      this.propager(t);
    }
  }

  // ─── Joueurs ─────────────────────────────────────────────────────────

  /** Clé de classement d'un compte (celle du faux classement de la Coupe). */
  cleDe(compte) {
    return this.serveur.coupeRest.cleDe(compte);
  }

  /** Compte de connexion (par id, email ou objet de support/donnees.js). */
  compte(qui) {
    const id = typeof qui === 'string' ? qui : qui?.id;
    const email = typeof qui === 'string' ? qui : qui?.email;
    return this.serveur.comptes.find((c) => c.id === id || c.email === email) || null;
  }

  /** Joueur d'un compte ou d'une clé simulée : `{ cle, nom, role, user_id }`. */
  joueurDe(qui) {
    const compte = typeof qui === 'object' || /@/.test(String(qui)) || String(qui).startsWith('user-') ? this.compte(qui) : null;
    if (compte) {
      const role = compte.role === 'admin' ? 'salon' : compte.role === 'barber' ? 'barber' : 'user';
      return { cle: this.cleDe(compte), nom: this.serveur.coupeRest.nomDe(compte), role, user_id: compte.id };
    }
    const j = JOUEURS_TOURNOI.find((x) => x.cle === qui);
    if (!j) throw new Error(`Joueur de tournoi inconnu : ${qui}`);
    return { cle: j.cle, nom: j.nom, role: j.role, user_id: `simule-${j.cle}` };
  }

  /** Points de Coupe de la saison (têtes de série). */
  points(cle) {
    const rest = this.serveur.coupeRest;
    const j = rest.joueurs.find((x) => x.cle === cle);
    if (j) return j.saison[0];
    const compte = this.serveur.comptes.find((c) => rest.cleDe(c) === cle);
    if (compte) return rest.etatDe(compte).saison[0];
    return JOUEURS_TOURNOI.find((x) => x.cle === cle)?.points ?? 0;
  }

  // ─── Fabrique des tests ──────────────────────────────────────────────

  /**
   * Tournoi dans un état donné. Options :
   *  - `etat` : `inscriptions` (défaut, début dans 3 jours à 19:00), `presence` (début dans 12 min),
   *    `tirage` (tiré il y a `tirageDepuis` ms, 0 par défaut), `tableau` (tiré il y a 60 s : premier
   *    tour jouable), `fini` (tous les tours joués), `annule` (`raison` : `admin` ou `not_enough`) ;
   *  - `taille` (8 ou 16), `nom`, `debut` (Date ou ms : remplace le début par défaut) ;
   *  - `inscrits` : nombre de joueurs simulés inscrits (défaut : taille − 1) ou liste de clés ;
   *    `attente` : joueurs simulés en plus, en liste d'attente ;
   *  - `moi` : compte inscrit le premier (`CLIENT`…) ou `{ compte, attente, present, rang }` ;
   *  - `presents` (présence) : nombre de joueurs simulés qui ont dit « Je suis là » (défaut : tous
   *    sauf le dernier ; toujours tous pour un tournoi tiré) ;
   *  - `gagnants(match)` (`fini`) : côté gagnant de chaque match (défaut : le côté 0, ou toi).
   * Rend l'état interne (son `id`).
   */
  creer(options = {}) {
    const {
      etat = 'inscriptions', taille = 8, nom = 'Coupe de Novembre', inscrits = null, attente = 0,
      moi = null, presents = null, tirageDepuis = 0, raison = 'admin', gagnants = null,
    } = options;
    const now = this.ms();
    this.compteur += 1;
    let debut = options.debut != null ? new Date(options.debut).getTime() : null;
    if (debut == null) {
      if (etat === 'inscriptions' || etat === 'annule') debut = instantParis(ajouterJours(cleDuJourParis(new Date(now)), 3), '19:00').getTime();
      else if (etat === 'presence') debut = now + 12 * 60_000;
      else if (etat === 'tirage') debut = now - tirageDepuis;
      else debut = now - 60_000;
    }
    const t = {
      id: `7a000000-0000-4000-8000-${String(this.compteur).padStart(12, '0')}`,
      name: nom, starts_at: debut, size: taille, status: 'open', cancel_reason: null, drawn_at: null,
      finished_at: null, created_at: now - 86_400_000, notify: false, joueurs: [], matchs: [],
      champion: null, finaliste: null, retires: new Set(),
    };
    this.liste.push(t);

    // Inscriptions : toi d'abord (ou à ton rang), puis les joueurs simulés, puis la liste d'attente
    const cles = Array.isArray(inscrits)
      ? inscrits
      : JOUEURS_TOURNOI.filter((j) => !moi || j.cle !== this.cleDe(this.compte(moi.compte || moi))).slice(0, inscrits ?? taille - 1).map((j) => j.cle);
    const enAttente = JOUEURS_TOURNOI.filter((j) => !cles.includes(j.cle)).slice(0, attente).map((j) => j.cle);
    const tire = ['tirage', 'tableau', 'fini'].includes(etat);
    let rang = 0;
    const base = t.created_at;
    const ajouter = (qui, { waiting = false, present = false } = {}) => {
      rang += 1;
      t.joueurs.push({ ...this.joueurDe(qui), inscrit_le: base + rang * 60_000, attente: waiting, present_le: present ? Math.min(now, debut) - 60_000 : null, seed: null, statut: 'in' });
    };
    const reglesMoi = moi ? { compte: moi.compte || moi, attente: !!moi.attente, present: moi.present ?? tire, rang: moi.rang ?? 0 } : null;
    const nbPresents = tire ? Infinity : presents ?? (etat === 'presence' ? cles.length - 1 : 0);
    cles.forEach((cle, i) => {
      if (reglesMoi && !reglesMoi.attente && i === reglesMoi.rang) ajouter(reglesMoi.compte, { present: reglesMoi.present });
      ajouter(cle, { present: i < nbPresents });
    });
    if (reglesMoi && !reglesMoi.attente && reglesMoi.rang >= cles.length) ajouter(reglesMoi.compte, { present: reglesMoi.present });
    enAttente.forEach((cle) => ajouter(cle, { waiting: true, present: tire }));
    if (reglesMoi?.attente) ajouter(reglesMoi.compte, { waiting: true, present: reglesMoi.present });

    if (etat === 'annule') {
      t.status = 'cancelled';
      t.cancel_reason = raison;
    }
    if (tire) {
      this.tirerTournoi(t, debut);
      if (etat === 'tableau' || etat === 'fini') {
        // Tirage montré il y a plus de 30 s : le premier tour est jouable
        for (const m of t.matchs) if (m.status === 'ready') m.ready_at = Math.min(m.ready_at, now - 30_000);
      }
    }
    if (etat === 'fini') {
      const cleMoi = reglesMoi ? this.cleDe(this.compte(reglesMoi.compte)) : null;
      const choix = gagnants || ((m) => (m.p[1] === cleMoi ? 1 : 0));
      for (let tour = 1; tour <= this.nbTours(t); tour += 1) this.jouerTour(t.id, tour, { gagnant: choix });
    }
    return t;
  }

  /** Tournoi interne (ou erreur si l'id est inconnu). */
  tournoi(id) {
    const t = this.liste.find((x) => x.id === id);
    if (!t) throw new Error(`Tournoi simulé inconnu : ${id}`);
    return t;
  }

  nbTours(t) {
    return t.size === 16 ? 4 : 3;
  }

  /**
   * Match interne : `quel` = id du match, `{ tour, place }`, ou une clé / un compte (son match en
   * cours ou à venir, sinon son dernier).
   */
  match(id, quel) {
    const t = this.tournoi(id);
    if (quel && typeof quel === 'object' && 'tour' in quel) return t.matchs.find((m) => m.round === quel.tour && m.slot === (quel.place ?? 0));
    const parId = t.matchs.find((m) => m.id === quel);
    if (parId) return parId;
    const cle = typeof quel === 'object' || /@|^user-/.test(String(quel)) ? this.cleDe(this.compte(quel)) : quel;
    const siens = t.matchs.filter((m) => m.p.includes(cle)).sort((a, b) => a.round - b.round);
    return siens.find((m) => m.status === 'pending' || m.status === 'ready') || siens[siens.length - 1];
  }

  /** Tire au sort maintenant (comme l'horloge du serveur à l'heure du début). */
  tirer(id) {
    this.tirerTournoi(this.tournoi(id));
  }

  /**
   * Termine un match `ready` : `{ sc: [a, b], so: [a, b] | null, gagnant: 0 | 1, raison }` (défaut :
   * 5 – 2 pour le côté 0). Le vainqueur avance ; la finale finie clôt le tournoi.
   */
  finir(id, quel, { sc = null, so = null, gagnant = 0, raison = null } = {}) {
    const t = this.tournoi(id);
    const m = this.match(id, quel);
    if (!m || m.status !== 'ready') throw new Error('Match introuvable ou pas jouable');
    const score = sc || (gagnant === 0 ? [5, 2] : [2, 5]);
    this.clore(t, m, { sc: score, so, gagnant, raison });
    this.propager(t);
    return m;
  }

  /** Joue tous les matchs jouables d'un tour (`gagnant` : nombre ou fonction du match). */
  jouerTour(id, tour, { gagnant = 0, sc = null } = {}) {
    const t = this.tournoi(id);
    for (const m of t.matchs.filter((x) => x.round === tour && x.status === 'ready')) {
      const g = typeof gagnant === 'function' ? gagnant(m) : gagnant;
      this.clore(t, m, { sc: sc || (g === 0 ? [5, 2] : [2, 5]), gagnant: g });
    }
    this.propager(t);
  }

  /** Match en direct : `{ sc, so, present: [bool, bool], playing }` (comme `tournamentLive()`). */
  direct(id, quel, live) {
    const m = this.match(id, quel);
    m.live = { sc: [0, 0], so: null, present: [true, true], playing: true, ...live };
    if (m.live.playing && m.started_at == null) m.started_at = this.ms();
    return m;
  }

  /** Inscrit un compte ou un joueur simulé (`{ attente, present }`), sans passer par la route. */
  inscrire(id, qui, { attente = false, present = false } = {}) {
    const t = this.tournoi(id);
    const j = this.joueurDe(qui);
    t.joueurs.push({ ...j, inscrit_le: this.ms(), attente, present_le: present ? this.ms() : null, seed: null, statut: 'in' });
  }

  /** Annule un tournoi (`raison` : `admin` ou `not_enough`). */
  annuler(id, raison = 'admin') {
    const t = this.tournoi(id);
    t.status = 'cancelled';
    t.cancel_reason = raison;
  }

  /** Retire un joueur (comme l'admin) : avant le tirage, sa ligne ; après, forfait de son match. */
  retirer(id, cle) {
    return this.retirerJoueur(this.tournoi(id), cle);
  }

  /** Titre ajouté à la main : `{ name, date: 'AAAA-MM-JJ', rank: 1 | 2, tournament_id? }`. */
  ajouterTitre(cle, titre) {
    this.titresAjoutes.push({ cle, tournament_id: titre.tournament_id || `titre-${this.titresAjoutes.length + 1}`, name: titre.name, date: titre.date, rank: titre.rank ?? 1 });
  }

  /** Palmarès d'une clé de joueur (`key_hash`) : `[{ tournament_id, name, date, rank }]`, du plus récent. */
  titres(cle) {
    const out = [];
    for (const t of this.liste) {
      if (t.status !== 'finished') continue;
      const date = cleDuJourParis(new Date(t.starts_at));
      if (t.champion === cle) out.push({ tournament_id: t.id, name: t.name, date, rank: 1 });
      if (t.finaliste === cle) out.push({ tournament_id: t.id, name: t.name, date, rank: 2 });
    }
    for (const x of this.titresAjoutes) {
      if (x.cle === cle) out.push({ tournament_id: x.tournament_id, name: x.name, date: x.date, rank: x.rank });
    }
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  // ─── Règles (contrat, sections 1 et 3.2) ─────────────────────────────

  /** Tirage : présents inscrits puis présents en attente, têtes de série, placement standard. */
  tirerTournoi(t, instant = this.ms()) {
    if (t.status !== 'open') return;
    const parInscription = (a, b) => a.inscrit_le - b.inscrit_le;
    const presents = [
      ...t.joueurs.filter((j) => j.statut === 'in' && j.present_le != null && !j.attente).sort(parInscription),
      ...t.joueurs.filter((j) => j.statut === 'in' && j.present_le != null && j.attente).sort(parInscription),
    ].slice(0, t.size);
    // Hors du tableau : présent sans place (`out`, sans tête de série) ou pas venu (`absent`)
    for (const j of t.joueurs) if (j.statut === 'in' && !presents.includes(j)) j.statut = j.present_le != null ? 'out' : 'absent';
    if (presents.length < 4) {
      t.status = 'cancelled';
      t.cancel_reason = 'not_enough';
      return;
    }
    const nbTetes = t.size / 4;
    const tetes = [...presents].sort((a, b) => this.points(b.cle) - this.points(a.cle) || parInscription(a, b)).slice(0, nbTetes);
    // Les autres dans l'ordre d'inscription (le vrai serveur les tire au hasard : tests reproductibles)
    const ordre = [...tetes, ...presents.filter((j) => !tetes.includes(j))];
    ordre.forEach((j, i) => { j.seed = i + 1; });
    const place = PLACEMENT[t.size];
    t.matchs = [];
    // Ids des matchs : UUID tirés de celui du tournoi (`…-0102` = tour 1, place 2)
    const id = (tour, place) => `7b${t.id.slice(2, 24)}${String(tour).padStart(6, '0')}${String(place).padStart(6, '0')}`;
    for (let tour = 1; tour <= this.nbTours(t); tour += 1) {
      for (let s = 0; s < t.size / 2 ** tour; s += 1) {
        const p = tour === 1 ? [ordre[place[2 * s] - 1]?.cle ?? null, ordre[place[2 * s + 1] - 1]?.cle ?? null] : [null, null];
        t.matchs.push({
          id: id(tour, s), round: tour, slot: s, p, status: 'pending', ready_at: null, started_at: null, ended_at: null,
          sc: null, so: null, winner: null, reason: null, live: null, resolu: false,
        });
      }
    }
    t.status = 'running';
    t.drawn_at = instant;
    for (const m of t.matchs.filter((x) => x.round === 1)) this.resoudre(t, m);
    this.propager(t);
  }

  /** Un match dont les deux places sont connues : jouable, exempt, ou perdu d'office (joueur retiré). */
  resoudre(t, m) {
    const [a, b] = m.p;
    const retire = (cle) => t.joueurs.find((j) => j.cle === cle)?.statut === 'removed';
    if (a && b) {
      if (retire(a) || retire(b)) {
        this.clore(t, m, { gagnant: retire(a) ? 1 : 0, raison: 'admin' });
        return;
      }
      m.status = 'ready';
      m.ready_at = Math.max(this.ms(), t.drawn_at + DRAW_SHOW_MS);
      return;
    }
    // Exempt : l'adversaire passe d'office (aucun des deux : place vide au tour suivant)
    m.status = 'bye';
    m.winner = a ? 0 : b ? 1 : null;
    m.ended_at = this.ms();
    m.resolu = true;
  }

  /** Fin d'un match : score, vainqueur ; le perdant est éliminé. */
  clore(t, m, { sc = null, so = null, gagnant = 0, raison = null }) {
    m.status = 'done';
    m.sc = sc;
    m.so = so;
    m.winner = gagnant;
    m.reason = raison;
    m.ended_at = this.ms();
    m.live = null;
    m.resolu = true;
    const perdant = t.joueurs.find((j) => j.cle === m.p[1 - gagnant]);
    if (perdant && perdant.statut === 'in') perdant.statut = 'out';
  }

  /** Avancement : vainqueurs posés au tour suivant, matchs jouables, finale → tournoi fini. */
  propager(t) {
    if (t.status !== 'running') return;
    const total = this.nbTours(t);
    const a = (tour, place) => t.matchs.find((m) => m.round === tour && m.slot === place);
    const gagnant = (m) => (m.winner == null ? null : m.p[m.winner]);
    for (let tour = 2; tour <= total; tour += 1) {
      for (const m of t.matchs.filter((x) => x.round === tour && x.status === 'pending')) {
        const f0 = a(tour - 1, m.slot * 2);
        const f1 = a(tour - 1, m.slot * 2 + 1);
        if (f0?.resolu) m.p[0] = gagnant(f0);
        if (f1?.resolu) m.p[1] = gagnant(f1);
        if (f0?.resolu && f1?.resolu) this.resoudre(t, m);
      }
    }
    const finale = a(total, 0);
    if (finale?.resolu) {
      t.status = 'finished';
      t.finished_at = this.ms();
      t.champion = gagnant(finale);
      t.finaliste = finale.winner == null ? null : finale.p[1 - finale.winner];
    }
  }

  retirerJoueur(t, cle) {
    const j = t.joueurs.find((x) => x.cle === cle);
    if (!j) return false;
    if (t.status === 'open') {
      // Le vrai serveur garde sa ligne (`removed`) : il ne peut plus s'y réinscrire
      t.joueurs = t.joueurs.filter((x) => x !== j);
      (t.retires ||= new Set()).add(cle);
      this.promouvoir(t);
      return true;
    }
    j.statut = 'removed';
    const m = t.matchs.find((x) => x.p.includes(cle) && x.status === 'ready');
    if (m) this.clore(t, m, { gagnant: m.p[0] === cle ? 1 : 0, raison: 'admin' });
    this.propager(t);
    return true;
  }

  /** Une place libérée avant le tirage va au premier de la liste d'attente. */
  promouvoir(t) {
    const inscrits = t.joueurs.filter((j) => !j.attente).length;
    if (inscrits >= t.size) return;
    const premier = t.joueurs.filter((j) => j.attente).sort((a, b) => a.inscrit_le - b.inscrit_le)[0];
    if (premier) premier.attente = false;
  }

  // ─── Réponses (formes de la section 3.4) ─────────────────────────────

  publicJoueur(t, cle, lecteur) {
    if (!cle) return null;
    const j = t.joueurs.find((x) => x.cle === cle);
    const simule = JOUEURS_TOURNOI.find((x) => x.cle === cle);
    const name = j ? (j.user_id ? j.nom : 'Ancien joueur') : simule?.nom || 'Ancien joueur';
    return { key_hash: cle, name, role: j?.role || simule?.role || 'user', me: cle === lecteur };
  }

  publicMatch(t, m, lecteur) {
    const pret = m.status === 'ready';
    return {
      id: m.id,
      round: m.round,
      slot: m.slot,
      p: m.p.map((cle) => this.publicJoueur(t, cle, lecteur)),
      status: m.status,
      ready_at: pret ? iso(m.ready_at) : null,
      // Plus d'échéance une fois le match commencé (comme le vrai serveur)
      forfeit_at: !pret || m.ready_at == null || m.started_at != null ? null : iso(m.ready_at + JOIN_MS),
      sc: m.sc,
      so: m.so,
      winner: m.winner,
      reason: m.reason,
      live: m.status === 'ready' && m.live ? { sc: m.live.sc, so: m.live.so ?? null, present: m.live.present, playing: !!m.live.playing } : null,
    };
  }

  resume(t, lecteur, { admin = false } = {}) {
    // Retirés pendant le tournoi : hors des comptes et plus inscrits (comme le vrai serveur) ; la
    // liste de l'admin garde ses comptes d'avant
    const gardes = admin ? t.joueurs : t.joueurs.filter((j) => j.statut !== 'removed');
    const mien = gardes.find((j) => j.cle === lecteur);
    return {
      id: t.id, name: t.name, starts_at: iso(t.starts_at), size: t.size, status: t.status,
      registered: gardes.filter((j) => !j.attente).length,
      waiting: gardes.filter((j) => j.attente).length,
      me: { registered: !!mien, waiting: !!mien?.attente, checked_in: mien?.present_le != null },
    };
  }

  detail(t, lecteur) {
    const total = this.nbTours(t);
    const ligne = t.joueurs.find((j) => j.cle === lecteur);
    const retire = ligne?.statut === 'removed' || !!t.retires?.has(lecteur);
    // Retiré par le salon : plus inscrit (ni attente ni présence), `status: 'removed'`
    const mien = retire ? null : ligne;
    const libelles = LIBELLES[t.size];
    const monMatch = mien?.statut === 'in'
      ? t.matchs
        .filter((m) => m.p.includes(lecteur) && (m.status === 'pending' || m.status === 'ready'))
        .sort((a, b) => a.round - b.round)[0]
      : null;
    const demies = t.matchs.filter((m) => m.round === total - 1 && m.status === 'done');
    return {
      id: t.id,
      name: t.name,
      starts_at: iso(t.starts_at),
      size: t.size,
      status: t.status,
      cancel_reason: t.cancel_reason,
      drawn_at: iso(t.drawn_at),
      finished_at: iso(t.finished_at),
      server_now: this.maintenant().toISOString(),
      checkin_from: iso(t.starts_at - CHECKIN_MS),
      players: [...t.joueurs]
        .filter((j) => j.statut !== 'removed')
        .sort((a, b) => a.inscrit_le - b.inscrit_le)
        .map((j) => ({ ...this.publicJoueur(t, j.cle, lecteur), waiting: j.attente, checked_in: j.present_le != null, seed: j.seed })),
      me: {
        registered: !!mien,
        waiting: !!mien?.attente,
        checked_in: mien?.present_le != null,
        status: retire ? 'removed' : mien?.statut ?? null,
        match: monMatch
          ? { ...this.publicMatch(t, monMatch, lecteur), side: monMatch.p.indexOf(lecteur), label: SINGULIERS[libelles[monMatch.round - 1]] }
          : null,
      },
      rounds: t.matchs.length
        ? libelles.map((label, i) => ({
          round: i + 1,
          label,
          matches: t.matchs.filter((m) => m.round === i + 1).map((m) => this.publicMatch(t, m, lecteur)),
        }))
        : [],
      champion: t.status === 'finished' ? this.publicJoueur(t, t.champion, lecteur) : null,
      runner_up: t.status === 'finished' ? this.publicJoueur(t, t.finaliste, lecteur) : null,
      thirds: t.status === 'finished'
        ? demies.map((m) => this.publicJoueur(t, m.p[1 - m.winner], lecteur)).filter(Boolean)
        : [],
    };
  }

  /** Listes : à venir et en cours (début croissant), puis les 10 derniers finis ou annulés. */
  ordonner(tous = false) {
    const vivants = this.liste.filter((t) => t.status === 'open' || t.status === 'running').sort((a, b) => a.starts_at - b.starts_at);
    const passes = this.liste.filter((t) => t.status === 'finished' || t.status === 'cancelled').sort((a, b) => b.starts_at - a.starts_at);
    return [...vivants, ...(tous ? passes : passes.slice(0, 10))];
  }

  /** Début `AAAA-MM-JJTHH:mm` (heure de Paris) : passé, moins de 30 min, hors 08:00–20:00 → null. */
  lireDebut(texte) {
    const m = HEURE_RE.exec(String(texte || ''));
    if (!m) return null;
    const minutes = Number(m[2]) * 60 + Number(m[3]);
    if (Number(m[2]) > 23 || Number(m[3]) > 59 || minutes < 8 * 60 || minutes > 20 * 60) return null;
    const instant = instantParis(m[1], `${m[2]}:${m[3]}`).getTime();
    if (!Number.isFinite(instant) || instant < this.ms() + 30 * 60_000) return null;
    return instant;
  }

  // ─── Routes ──────────────────────────────────────────────────────────

  traiter(req) {
    if (!req.compte) return { status: 401, json: { error: 'Connexion requise', code: 'unauthorized' } };
    const features = this.serveur.donnees.parametresPublics.features || {};
    if (features.coupeTournaments === false || features.coupe === false) {
      return erreur(404, 'disabled', 'Les tournois sont fermés pour le moment');
    }
    this.horloge();
    const { methode, chemin, compte } = req;
    const corps = req.corps && typeof req.corps === 'object' ? req.corps : {};
    const lecteur = this.cleDe(compte);
    const now = this.ms();

    // ─── Admin ───
    if (chemin.startsWith('/coupe/admin/')) {
      if (compte.role !== 'admin') return erreur(403, 'forbidden', 'Accès réservé aux administrateurs');
      return this.admin(req, corps, lecteur);
    }

    if (methode === 'GET' && chemin === '/coupe/tournaments') {
      return { json: { items: this.ordonner().map((t) => this.resume(t, lecteur)), server_now: this.maintenant().toISOString() } };
    }

    const m = /^\/coupe\/tournaments\/([^/]+)(?:\/(register|checkin))?$/.exec(chemin);
    if (!m) return null;
    const t = this.liste.find((x) => x.id === decodeURIComponent(m[1]));
    if (!t) return erreur(404, 'not_found', 'Tournoi introuvable');
    const action = m[2];

    if (!action && methode === 'GET') return { json: this.detail(t, lecteur) };

    const ouvert = t.status === 'open' && now < t.starts_at;
    const ligne = t.joueurs.find((j) => j.cle === lecteur);
    const retire = ligne?.statut === 'removed' || !!t.retires?.has(lecteur);
    const mien = retire ? null : ligne;
    const RETIRE = () => erreur(403, 'removed', 'Le salon t’a retiré de ce tournoi');

    // Ordre du vrai serveur : exclu du classement (avant tout), clos, retiré, déjà inscrit, plein
    if (action === 'register' && methode === 'POST') {
      if (compte.role !== 'admin' && this.serveur.coupeRest.exclus.has(lecteur)) {
        return erreur(403, 'banned', 'Le salon t’a retiré des classements : tu ne peux pas t’inscrire aux tournois.');
      }
      if (!ouvert) return erreur(409, 'closed', 'Les inscriptions sont fermées pour ce tournoi');
      if (retire) return RETIRE();
      if (mien) return erreur(409, 'already', 'Tu es déjà inscrit à ce tournoi');
      if (t.joueurs.length >= 200) return erreur(409, 'full', 'Le tournoi est complet, liste d’attente comprise');
      const waiting = t.joueurs.filter((j) => !j.attente).length >= t.size;
      const presence = now >= t.starts_at - CHECKIN_MS;
      t.joueurs.push({ ...this.joueurDe(compte), inscrit_le: now, attente: waiting, present_le: presence ? now : null, seed: null, statut: 'in' });
      return { json: { ok: true, waiting } };
    }

    // Se désinscrire sans être inscrit : `{ ok: true }` (rien à faire)
    if (action === 'register' && methode === 'DELETE') {
      if (!ouvert) return erreur(409, 'closed', 'Le tournoi a commencé : tu ne peux plus te désinscrire');
      if (retire) return RETIRE();
      if (mien) {
        t.joueurs = t.joueurs.filter((j) => j !== mien);
        if (!mien.attente) this.promouvoir(t);
      }
      return { json: { ok: true } };
    }

    if (action === 'checkin' && methode === 'POST') {
      if (!ouvert) return erreur(409, 'closed', 'Le tournoi a commencé : la présence est fermée');
      if (now < t.starts_at - CHECKIN_MS) {
        const heure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t.starts_at - CHECKIN_MS));
        return erreur(409, 'not_yet', `La présence s’ouvre 15 minutes avant le début (à ${heure})`);
      }
      if (retire) return RETIRE();
      if (!mien) return erreur(404, 'not_registered', 'Tu n’es pas inscrit à ce tournoi');
      mien.present_le = mien.present_le ?? now;
      return { json: { ok: true } };
    }

    return null;
  }

  admin(req, corps, lecteur) {
    const { methode, chemin } = req;
    if (methode === 'GET' && chemin === '/coupe/admin/tournaments') {
      return {
        json: {
          items: this.ordonner(true).map((t) => ({
            ...this.resume(t, lecteur, { admin: true }),
            players_count: t.joueurs.length,
            present_count: t.joueurs.filter((j) => j.present_le != null).length,
          })),
        },
      };
    }

    if (methode === 'POST' && chemin === '/coupe/admin/tournaments') {
      const name = typeof corps.name === 'string' ? corps.name.trim() : '';
      if (!name || name.length > 60) return erreur(400, 'bad_name', 'Le nom doit faire entre 1 et 60 caractères');
      if (corps.size !== 8 && corps.size !== 16) return erreur(400, 'bad_size', 'Un tournoi se joue à 8 ou 16 joueurs');
      const debut = this.lireDebut(corps.starts_at);
      if (debut == null) return erreur(400, 'bad_time', 'Choisis un début entre 08:00 et 20:00, au moins 30 min après maintenant');
      this.compteur += 1;
      const t = {
        id: `7a000000-0000-4000-8000-${String(this.compteur).padStart(12, '0')}`,
        name, starts_at: debut, size: corps.size, status: 'open', cancel_reason: null, drawn_at: null,
        finished_at: null, created_at: this.ms(), notify: corps.notify === true, joueurs: [], matchs: [],
        champion: null, finaliste: null,
      };
      this.liste.push(t);
      return { json: this.detail(t, lecteur) };
    }

    const m = /^\/coupe\/admin\/tournaments\/([^/]+)(?:\/(cancel|matches\/([^/]+)\/(winner|replay)|players\/([^/]+)\/remove))?$/.exec(chemin);
    if (!m) return null;
    const t = this.liste.find((x) => x.id === decodeURIComponent(m[1]));
    if (!t) return erreur(404, 'not_found', 'Tournoi introuvable');

    if (!m[2] && methode === 'PATCH') {
      if (t.status !== 'open') return erreur(409, 'closed', 'Le tournoi a commencé : il ne se modifie plus');
      if (corps.name !== undefined) {
        const name = typeof corps.name === 'string' ? corps.name.trim() : '';
        if (!name || name.length > 60) return erreur(400, 'bad_name', 'Le nom doit faire entre 1 et 60 caractères');
        t.name = name;
      }
      if (corps.starts_at !== undefined) {
        const debut = this.lireDebut(corps.starts_at);
        if (debut == null) return erreur(400, 'bad_time', 'Choisis un début entre 08:00 et 20:00, au moins 30 min après maintenant');
        t.starts_at = debut;
      }
      return { json: this.detail(t, lecteur) };
    }

    if (m[2] === 'cancel' && methode === 'POST') {
      if (t.status !== 'open' && t.status !== 'running') return erreur(409, 'closed', 'Ce tournoi est déjà fini ou annulé');
      t.status = 'cancelled';
      t.cancel_reason = 'admin';
      return { json: { ok: true } };
    }

    if (m[3] && methode === 'POST') {
      const match = t.matchs.find((x) => x.id === decodeURIComponent(m[3]));
      if (!match) return erreur(404, 'not_found', 'Match introuvable');
      if (m[4] === 'winner') {
        if (corps.side !== 0 && corps.side !== 1) return erreur(400, 'bad_side', 'Choisis le joueur qui passe');
        if (match.status !== 'ready') return erreur(409, 'not_ready', 'Ce match n’est pas en cours');
        this.clore(t, match, { gagnant: corps.side, raison: 'admin' });
        this.propager(t);
        return { json: { ok: true } };
      }
      // Rejouer : match fini dont le suivant n'a pas commencé
      if (t.status !== 'running' || match.status !== 'done') return erreur(409, 'not_replayable', 'Ce match ne peut plus être rejoué');
      const suivant = t.matchs.find((x) => x.round === match.round + 1 && x.slot === match.slot >> 1);
      if (suivant && (suivant.status === 'done' || suivant.started_at != null)) {
        return erreur(409, 'not_replayable', 'Le match suivant a déjà commencé');
      }
      const perdant = t.joueurs.find((j) => j.cle === match.p[1 - match.winner]);
      if (perdant?.statut === 'out') perdant.statut = 'in';
      Object.assign(match, { status: 'ready', ready_at: this.ms(), started_at: null, ended_at: null, sc: null, so: null, winner: null, reason: null, live: null, resolu: false });
      if (suivant) Object.assign(suivant, { p: suivant.p.map((c, i) => (i === (match.slot & 1) ? null : c)), status: 'pending', ready_at: null, resolu: false });
      return { json: { ok: true } };
    }

    if (m[5] && methode === 'POST') {
      if (t.status !== 'open' && t.status !== 'running') return erreur(409, 'closed', 'Ce tournoi est déjà fini ou annulé');
      if (!this.retirerJoueur(t, decodeURIComponent(m[5]))) return erreur(404, 'not_found', 'Joueur introuvable dans ce tournoi');
      return { json: { ok: true } };
    }

    return null;
  }
}
