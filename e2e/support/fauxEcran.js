/**
 * Faux écran du salon (`GET /coupe/screen` avec `X-Screen-Key`) et ses liens côté admin
 * (`/coupe/admin/screens…`) ; contrat docs/fonctions/coupe-spectateurs-contrat.md, section 2.
 * Branché par mockApi.js (`api.ecran`).
 *
 * Mêmes règles que le vrai serveur (routes/coupe.js, lib/coupeScreen.js) : spectateurs fermés
 * (`features.coupeSpectators` faux) → 404 `disabled` partout ; clé absente, inconnue ou coupée → 403
 * `screen_revoked` (jamais 401) ; lecture → `last_seen_at` posé ; 60 lectures par minute (une seule
 * IP ici ; au-delà 429 `rate_limited`, `plafondLectures`) ; admin seul pour `/coupe/admin/screens`
 * (401 sans compte, 403 sinon) ; liste du plus récent au plus ancien ; 5 écrans actifs au plus (409
 * `too_many_screens`) ; 10 créations par heure et par compte (429 `rate_limited`) ; nom de 1 à 40
 * caractères, « Écran du salon » par défaut ; la clé n'est rendue qu'à la création. Lignes de `live`
 * des matchs de tournoi : `tour { tid, name, label, title }`, `label` = nom du tour (« Quart de
 * finale »), `title` = nom du match (« Quart 1 ») ; `watchers` compte les écrans (`screen` : un écran
 * regarde).
 *
 * État modifiable par les tests :
 *  - `ecrans` : `[{ id, label, cle, created_at, last_seen_at, revoked_at }]` ; au départ « Télé du
 *    salon » (clé `CLE_ECRAN`, active) et « Ancienne tablette » (clé `CLE_COUPEE`, coupée) ;
 *  - `etat` : la réponse de `/coupe/screen` sans `server_now` (mode libre de la planche, écran 15,
 *    au départ) ; `modeTournoi()` y pose le tournoi de la planche (écran 14) et ses matchs en direct.
 * Aides : `modeTournoi(options)`, `matchOrdinaire(options)`, `ajouterDirect(row)`, `finirDirect(id, fin)`, `lectures()`,
 * `couper(cle)`, `cleValide(cle)`, `socketsEcran(cle)`, `fermerSocketsEcran(cle, code)`. Les matchs en
 * direct sont aussi ouverts au faux serveur de jeu (`api.coupe.ouvrirDirect`, e2e/support/fauxCoupe.js) :
 * l'écran les regarde en grand par /ws/coupe avec sa clé ; `finirDirect` y envoie `wend`, `couper` y
 * envoie `error screen_revoked` puis ferme les sockets de l'écran (4401), comme le vrai serveur
 * (`dropScreen`) ; `fermerSocketsEcran` les ferme sans rien dire ni toucher à la clé (4401 seul).
 */
/** Clé d'un écran actif (24 octets en base64url côté serveur : 32 caractères). */
export const CLE_ECRAN = 'TeleDuSalon_e2e-0123456789abcdef';
/** Clé d'un écran coupé par le salon. */
export const CLE_COUPEE = 'AncienneTablette_e2e-fedcba98765';
/** Écran actif de départ (`ecrans[0]`). */
export const ECRAN_TELE = 'eeeeeeee-0000-4000-8000-000000000001';

/** Tournoi de la planche (écran 14) et ses matchs. */
export const TOURNOI_ECRAN = 'c0ffee00-0000-4000-8000-000000000001';
export const MATCHS_ECRAN = {
  q1: 'c0ffee00-0000-4000-8000-0000000000a1',
  q2: 'c0ffee00-0000-4000-8000-0000000000a2',
  q3: 'c0ffee00-0000-4000-8000-0000000000a3',
  q4: 'c0ffee00-0000-4000-8000-0000000000a4',
  d1: 'c0ffee00-0000-4000-8000-0000000000a5',
  d2: 'c0ffee00-0000-4000-8000-0000000000a6',
  f: 'c0ffee00-0000-4000-8000-0000000000a7',
};
/** Match ordinaire regardable (`w`, 12 caractères `[a-z2-9]`). */
export const SALLE_ECRAN = 'kv7m2q9xa3bc';

import { MAINTENANT } from './temps.js';

const J = (nom, role = 'user') => ({ name: nom, role });
const LUCAS = J('Lucas M.');
const DOM = J('Dom', 'barber');
const INES = J('Inès B.');
const SOFIANE = J('Sofiane R.');
const KEVIN = J('Kevin', 'barber');
const YANIS = J('Yanis K.');
const SALON = J("D'Home Barber", 'salon');
const ROMAIN = J('Romain', 'barber');

const iso = (ms) => new Date(ms).toISOString();
const erreur = (status, code, error) => ({ status, json: { error, code } });

/** Plafonds du vrai serveur (routes/coupe.js) : lectures de l'écran par minute, créations par heure. */
export const PLAFOND_LECTURES = 60;
export const PLAFOND_CREATIONS = 10;

/** Match de tournoi de la planche : nom du tour (`label`, comme le vrai serveur) et du match (`title`). */
const TOURS = { Quart: 'Quart de finale', Demie: 'Demi-finale', Finale: 'Finale' };
export function tourEcran(title, { tid = TOURNOI_ECRAN, name = 'Coupe de Novembre' } = {}) {
  const label = TOURS[String(title).split(' ')[0]] || '';
  return { tid, name, label, title };
}

/** Mois de Paris `AAAA-MM` d'un instant. */
function saisonDe(instant) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' })
    .formatToParts(instant).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}`;
}

export class FauxEcran {
  constructor(serveur) {
    this.serveur = serveur;
    const t0 = this.maintenant();
    this.compteur = 0;
    this.ecrans = [
      {
        id: ECRAN_TELE, label: 'Télé du salon', cle: CLE_ECRAN,
        created_at: iso(t0 - 6 * 86_400_000), last_seen_at: iso(t0 - 60_000), revoked_at: null,
      },
      {
        id: 'eeeeeeee-0000-4000-8000-000000000002', label: 'Ancienne tablette', cle: CLE_COUPEE,
        created_at: iso(t0 - 30 * 86_400_000), last_seen_at: iso(t0 - 20 * 86_400_000), revoked_at: iso(t0 - 10 * 86_400_000),
      },
    ];
    this.etat = this.modeLibre();
    /** Lectures de `/coupe/screen` (heure réelle) et créations par compte (quotas du vrai serveur). */
    this.plafondLectures = PLAFOND_LECTURES;
    this.heuresLectures = [];
    this.creationsParCompte = new Map();
  }

  /** Heure du faux serveur (ms) ; `MAINTENANT` tant que le faux serveur n'a pas fini de se construire. */
  maintenant() {
    const t = this.serveur.maintenant().getTime();
    return Number.isFinite(t) ? t : MAINTENANT.getTime();
  }

  /** Mode libre de la planche (écran 15) : classement, prochain tournoi dans 17 jours, barbers… */
  modeLibre() {
    const t = this.maintenant();
    const saison = saisonDe(new Date(t));
    const [a, m] = saison.split('-').map(Number);
    const debut = t + 17 * 86_400_000 + 9 * 3_600_000; // dans 17 jours, à 19:00 (10:00 + 9 h)
    return {
      season: saison,
      season_ends_at: new Date(Date.UTC(a, m, 1) - 3_600_000).toISOString(),
      tournament: null,
      next_tournament: {
        id: 'c0ffee00-0000-4000-8000-000000000099', name: 'Coupe de Novembre', starts_at: iso(debut), size: 16,
        registered: 11, url: 'https://dhomebarber.fr/coupe/tournoi/c0ffee00-0000-4000-8000-000000000099',
      },
      leaderboard: [
        { rank: 1, ...LUCAS, points: 252 },
        { rank: 2, ...KEVIN, points: 238 },
        { rank: 3, ...INES, points: 221 },
        { rank: 4, ...SALON, points: 219 },
        { rank: 5, ...YANIS, points: 214 },
        { rank: 6, ...DOM, points: 190 },
        { rank: 7, ...SOFIANE, points: 176 },
        { rank: 8, ...ROMAIN, points: 158 },
      ],
      barbers: [
        { name: 'Kevin', available: true },
        { name: 'Dom', available: false },
        { name: 'Romain', available: false },
      ],
      recent: [
        { p: [KEVIN, LUCAS], sc: [5, 3], reason: 'goal', ended_at: iso(t - 20 * 60_000) },
        { p: [INES, DOM], sc: [5, 4], reason: 'goal', ended_at: iso(t - 55 * 60_000) },
      ],
      played_today: 14,
      snake: { name: 'Théo L.', score: 1240 },
      live: [],
    };
  }

  /**
   * Tournoi de la planche (écran 14), quarts en cours : Quart 1 (Lucas M. – Dom, 3 – 2, commencé il y
   * a 2:41, 34 spectateurs et l'écran du salon) et Quart 4 (D'Home Barber – Romain, 1 – 1) en direct,
   * Quart 2 fini 5 – 3, Quart 3 à suivre. `avantTirage` : présence ouverte, tableau pas encore tiré.
   */
  modeTournoi({ avantTirage = false, direct = true } = {}) {
    const t = this.maintenant();
    const tour = (title) => tourEcran(title);
    if (avantTirage) {
      this.etat.tournament = {
        id: TOURNOI_ECRAN, name: 'Coupe de Novembre', status: 'open', size: 8, starts_at: iso(t + 12 * 60_000),
        round_label: null, rounds: [],
      };
      this.etat.live = [];
      return this.etat.tournament;
    }
    this.etat.tournament = {
      id: TOURNOI_ECRAN, name: 'Coupe de Novembre', status: 'running', size: 8, starts_at: iso(t - 20 * 60_000),
      round_label: 'Quarts de finale',
      rounds: [
        {
          label: 'Quarts de finale',
          matches: [
            { mid: MATCHS_ECRAN.q1, label: 'Quart 1', p: [LUCAS, DOM], sc: null, so: null, status: 'ready', winner: null },
            { mid: MATCHS_ECRAN.q2, label: 'Quart 2', p: [INES, SOFIANE], sc: [5, 3], so: null, status: 'done', winner: 0 },
            { mid: MATCHS_ECRAN.q3, label: 'Quart 3', p: [KEVIN, YANIS], sc: null, so: null, status: 'ready', winner: null },
            { mid: MATCHS_ECRAN.q4, label: 'Quart 4', p: [SALON, ROMAIN], sc: null, so: null, status: 'ready', winner: null },
          ],
        },
        {
          label: 'Demi-finales',
          matches: [
            { mid: MATCHS_ECRAN.d1, label: 'Demie 1', p: [null, INES], sc: null, so: null, status: 'pending', winner: null },
            { mid: MATCHS_ECRAN.d2, label: 'Demie 2', p: [null, null], sc: null, so: null, status: 'pending', winner: null },
          ],
        },
        {
          label: 'Finale',
          matches: [{ mid: MATCHS_ECRAN.f, label: 'Finale', p: [null, null], sc: null, so: null, status: 'pending', winner: null }],
        },
      ],
    };
    this.etat.live = direct ? [
      {
        // 35 dont l'écran du salon : « 34 spectateurs en ce moment » (la télé ne se compte pas)
        kind: 'tour', id: MATCHS_ECRAN.q1, names: ['Lucas M.', 'Dom'], roles: ['user', 'barber'], sc: [3, 2],
        started_at: iso(t - 161_000), watchers: 35, screen: true, tour: tour('Quart 1'),
      },
      {
        kind: 'tour', id: MATCHS_ECRAN.q4, names: ["D'Home Barber", 'Romain'], roles: ['salon', 'barber'], sc: [1, 1],
        started_at: iso(t - 90_000), watchers: 5, screen: false, tour: tour('Quart 4'),
      },
    ] : [];
    for (const row of this.etat.live) this.ouvrirAuJeu(row);
    return this.etat.tournament;
  }

  /** Match ordinaire regardable en direct (mode libre). */
  matchOrdinaire({ id = SALLE_ECRAN, names = ['Sarah K.', 'Kevin'], roles = ['user', 'barber'], sc = [1, 0], depuis = 40_000, watchers = 3 } = {}) {
    const row = { kind: 'room', id, names, roles, sc, started_at: iso(this.maintenant() - depuis), watchers, screen: true, tour: null };
    this.etat.live = [...this.etat.live.filter((r) => r.id !== id), row];
    this.ouvrirAuJeu(row, { rules: 1, gw: 3 });
    return row;
  }

  /** Un match de plus en direct (ligne de `live`), ouvert aussi au faux serveur de jeu. */
  ajouterDirect(row) {
    const ligne = { started_at: iso(this.maintenant()), watchers: 1, screen: false, tour: null, ...row };
    this.etat.live = [...this.etat.live.filter((r) => r.id !== ligne.id), ligne];
    this.ouvrirAuJeu(ligne, ligne.kind === 'tour' ? {} : { rules: 1, gw: 3 });
    return ligne;
  }

  /**
   * Le même match ouvert aux spectateurs du faux serveur de jeu (`api.coupe`, /ws/coupe) : l'écran
   * le regarde en grand avec sa clé (`auth {screen}`, `watch`).
   */
  ouvrirAuJeu(row, { rules = 2, gw = 5 } = {}) {
    const jeu = this.serveur.coupe;
    if (typeof jeu?.ouvrirDirect !== 'function') return;
    jeu.ouvrirDirect({
      kind: row.kind, id: row.id, names: row.names, roles: row.roles, rules, gw, sc: row.sc, tour: row.tour,
      watchers: row.watchers, screen: row.screen, commence: true, etat: null,
    });
  }

  /**
   * Un match n'est plus en direct : retiré de `live` et, au faux serveur de jeu, `wend` à ses
   * spectateurs (`fin` : `{ winner, sc, reason, forfeit, so }`, vainqueur d'après le score par défaut).
   */
  finirDirect(id, fin = null) {
    const row = this.etat.live.find((r) => r.id === id);
    this.etat.live = this.etat.live.filter((r) => r.id !== id);
    const jeu = this.serveur.coupe;
    if (jeu?.directs?.has?.(id) && !jeu.directs.get(id).fini) {
      const sc = fin?.sc || row?.sc || [0, 0];
      jeu.finDirect(id, { winner: sc[0] >= sc[1] ? 0 : 1, sc, ...(fin || {}) });
    }
  }

  /** Clé d'un écran actif (le faux serveur de jeu la lit pour `auth {screen}`). */
  cleValide(cle) {
    return this.ecrans.some((e) => e.cle === cle && !e.revoked_at);
  }

  /** Lectures de `/coupe/screen` reçues (avec leur clé). */
  lectures() {
    return this.serveur.requetes.filter((r) => r.methode === 'GET' && r.chemin === '/coupe/screen');
  }

  /**
   * Coupe un écran par sa clé (comme « Couper » dans l'admin) : ses sockets de jeu reçoivent
   * `error screen_revoked` puis sont fermées (4401), comme `dropScreen` du vrai serveur
   * (`fermerEcran` du faux serveur de jeu).
   */
  couper(cle) {
    const e = this.ecrans.find((x) => x.cle === cle);
    if (e) e.revoked_at = iso(this.maintenant());
    this.serveur.coupe?.fermerEcran?.(cle);
  }

  /** Sockets de jeu ouvertes avec cette clé d'écran (toutes, fermées comprises). */
  socketsEcran(cle) {
    const jeu = this.serveur.coupe;
    return Array.isArray(jeu?.connexions) ? jeu.connexions.filter((c) => c.ecran === cle) : [];
  }

  /**
   * Ferme les sockets ouvertes de cet écran avec `code` (4401 par défaut), sans `screen_revoked` et
   * sans toucher à la clé : redémarrage du serveur de jeu, contrôle raté, coupure.
   */
  fermerSocketsEcran(cle, code = 4401) {
    for (const cnx of this.socketsEcran(cle)) {
      if (cnx.ferme) continue;
      cnx.ferme = true;
      try { cnx.ws.close({ code, reason: 'coupure' }); } catch { /* déjà fermée */ }
    }
  }

  actifs() {
    return this.ecrans.filter((e) => !e.revoked_at);
  }

  traiter(req) {
    const { methode, chemin } = req;
    if (this.serveur.donnees.parametresPublics.features?.coupeSpectators === false) {
      return erreur(404, 'disabled', 'L’écran du salon est fermé pour le moment');
    }

    if (chemin === '/coupe/screen') {
      if (methode !== 'GET') return null;
      // 60 lectures par minute et par IP, tous les essais comptés (clé coupée comprise)
      const reel = Date.now();
      this.heuresLectures = this.heuresLectures.filter((h) => reel - h < 60_000);
      if (this.heuresLectures.length >= this.plafondLectures) {
        return erreur(429, 'rate_limited', 'Trop de lectures d’affilée : réessayez dans une minute');
      }
      this.heuresLectures.push(reel);
      const ecran = this.ecrans.find((e) => e.cle === req.cleEcran && !e.revoked_at);
      if (!ecran) return erreur(403, 'screen_revoked', 'Écran coupé par le salon');
      ecran.last_seen_at = iso(this.maintenant());
      // Copie : un test peut modifier `etat` sans toucher à une réponse déjà rendue
      return { json: JSON.parse(JSON.stringify({ server_now: iso(this.maintenant()), ...this.etat })) };
    }

    // ─── Admin ─────────────────────────────────────────────────────────
    const compte = req.compte;
    if (!compte) return erreur(401, 'unauthorized', 'Non connecté');
    if (compte.role !== 'admin') return erreur(403, 'forbidden', 'Accès réservé aux administrateurs');

    if (chemin === '/coupe/admin/screens' && methode === 'GET') {
      // Du plus récent au plus ancien (comme `ORDER BY created_at DESC`)
      const liste = this.actifs().map((e, i) => ({ e, i }))
        .sort((a, b) => Date.parse(b.e.created_at) - Date.parse(a.e.created_at) || b.i - a.i);
      return { json: liste.map(({ e: { id, label, created_at, last_seen_at } }) => ({ id, label, created_at, last_seen_at })) };
    }

    if (chemin === '/coupe/admin/screens' && methode === 'POST') {
      // 10 créations par heure et par compte admin (avant tout contrôle, comme le quota du serveur)
      const reel = Date.now();
      const faites = (this.creationsParCompte.get(compte.id) || []).filter((h) => reel - h < 3_600_000);
      if (faites.length >= PLAFOND_CREATIONS) {
        return erreur(429, 'rate_limited', 'Trop d’écrans créés d’affilée : réessayez dans une heure');
      }
      this.creationsParCompte.set(compte.id, [...faites, reel]);
      const brut = req.corps?.label;
      if (brut !== undefined && brut !== null && typeof brut !== 'string') return erreur(400, 'bad_label', 'Nom de l’écran invalide');
      const label = typeof brut === 'string' && brut.trim() ? brut.trim() : 'Écran du salon';
      if ([...label].length > 40) return erreur(400, 'bad_label', 'Le nom de l’écran fait 40 caractères au plus.');
      if (this.actifs().length >= 5) {
        return erreur(409, 'too_many_screens', '5 écrans au plus : coupez-en un avant d’en créer un autre.');
      }
      this.compteur += 1;
      const n = String(this.compteur).padStart(4, '0');
      const ecran = {
        id: `eeeeeeee-0000-4000-8000-1000000${n}0`, label, cle: `NouvelEcran_e2e_${n}_AbCdEfGhIjKlMn`,
        created_at: iso(this.maintenant()), last_seen_at: null, revoked_at: null,
      };
      this.ecrans.push(ecran);
      return {
        status: 201,
        json: { id: ecran.id, label, key: ecran.cle, url: `https://dhomebarber.fr/ecran#cle=${ecran.cle}` },
      };
    }

    const m = /^\/coupe\/admin\/screens\/([^/]+)$/.exec(chemin);
    if (m && methode === 'DELETE') {
      const ecran = this.ecrans.find((e) => e.id === decodeURIComponent(m[1]) && !e.revoked_at);
      if (!ecran) return erreur(404, 'not_found', 'Écran introuvable');
      this.couper(ecran.cle);
      return { json: { ok: true } };
    }
    return null;
  }
}
