/**
 * Faux `GET /coupe/live` (matchs en direct regardables ; contrat docs/fonctions/coupe-spectateurs-contrat.md,
 * section 2), comme la route du serveur (routes/coupe.js) :
 *  - 401 sans session ; 404 `{ code: 'disabled' }` quand les spectateurs sont fermés
 *    (`features.coupeSpectators` faux) ou le jeu coupé (`features.coupe` faux) ;
 *  - `matchs` : les matchs commencés regardables (`watchableLive()` du serveur de jeu), une ligne
 *    `{ kind, id, names, roles, sc, started_at, watchers, screen, tour, userIds?, keys? }` ; `tour`
 *    comme le vrai serveur (`watchableLive()`, décision S9 du contrat, section 6) :
 *    `{ tid, name, label, title }`, `label` = le nom du tour (« Quart de finale »), `title` = le
 *    match (« Quart 1 ») ; un serveur d'avant `title` se joue en le retirant. Comme le
 *    serveur, la réponse retire les matchs où le lecteur est assis (`userIds` : ids des comptes
 *    des deux joueurs) et ceux d'un joueur qu'il a bloqué (`keys` : clés publiques, lues dans les
 *    blocages de la Coupe, `api.coupeRest.blocages`), met les matchs de tournoi d'abord puis du plus
 *    récent au plus ancien, en garde 20, et ne renvoie jamais `userIds` ni `keys` ;
 *  - `lectures` : nombre de `GET` reçus (relecture toutes les 15 s, page visible).
 * Fabriques : `matchTournoi({...})`, `matchOrdinaire({...})`. Une panne se joue avec
 * `api.surcharger('GET', '/coupe/live', () => RESEAU_COUPE)` (ou un `{ status: 500 }`).
 */
import { MAINTENANT } from './temps.js';

/** Identifiants des matchs simulés : un match de tournoi (uuid) et un match ordinaire (`w`, 12 caractères). */
export const ID_DIRECT_TOURNOI = 'd1000000-0000-4000-8000-000000000001';
export const ID_DIRECT_TOURNOI_2 = 'd1000000-0000-4000-8000-000000000002';
export const ID_DIRECT_ORDINAIRE = 'w2x7k9m4p8qa';
export const ID_TOURNOI_DIRECT = '7a000000-0000-4000-8000-0000000000aa';

/** Match de tournoi en cours (quart 1 de la Coupe de Novembre, Lucas M. contre Dom, 3 – 2, 34 spectateurs). */
export function matchTournoi(valeurs = {}) {
  return {
    kind: 'tour',
    id: ID_DIRECT_TOURNOI,
    names: ['Lucas M.', 'Dom'],
    roles: ['user', 'barber'],
    sc: [3, 2],
    started_at: new Date(MAINTENANT.getTime() - 2 * 60_000).toISOString(),
    watchers: 34,
    screen: true,
    tour: { tid: ID_TOURNOI_DIRECT, name: 'Coupe de Novembre', label: 'Quart de finale', title: 'Quart 1' },
    userIds: ['user-lucas', 'user-dom'],
    keys: ['cle-lucas-4567', 'cle-dom'],
    ...valeurs,
  };
}

/** Match ordinaire regardable (les deux joueurs l'ont accepté) : D'Home Barber contre Inès B., 1 – 0. */
export function matchOrdinaire(valeurs = {}) {
  return {
    kind: 'room',
    id: ID_DIRECT_ORDINAIRE,
    names: ["D'Home Barber", 'Inès B.'],
    roles: ['salon', 'user'],
    sc: [1, 0],
    started_at: new Date(MAINTENANT.getTime() - 60_000).toISOString(),
    watchers: 0,
    screen: false,
    tour: null,
    userIds: ['user-admin', 'user-ines'],
    keys: ['salon', 'cle-ines'],
    ...valeurs,
  };
}

const PUBLIC_FIELDS = ['kind', 'id', 'names', 'roles', 'sc', 'started_at', 'watchers', 'screen', 'tour'];

export class FauxDirect {
  constructor(serveur) {
    this.serveur = serveur;
    this.matchs = [];
    this.lectures = 0;
  }

  traiter(req) {
    if (!req.compte) return { status: 401, json: { error: 'Non connecté', code: 'unauthorized' } };
    const features = this.serveur.donnees.parametresPublics.features || {};
    if (features.coupeSpectators === false || features.coupe === false) {
      return { status: 404, json: { error: 'Regarder les matchs est fermé pour le moment', code: 'disabled' } };
    }
    if (req.methode !== 'GET') return null;
    this.lectures += 1;
    const lecteur = req.compte;
    const bloques = new Set((this.serveur.coupeRest?.blocages?.get(lecteur.id) || []).map((b) => b.key_hash));
    const ms = (m) => Date.parse(m.started_at) || 0;
    const matches = this.matchs
      .filter((m) => !(m.userIds || []).includes(lecteur.id))
      .filter((m) => !(m.keys || []).some((k) => bloques.has(k)))
      .sort((a, b) => Number(b.kind === 'tour') - Number(a.kind === 'tour') || ms(b) - ms(a))
      .slice(0, 20)
      .map((m) => Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, m[k] ?? null])));
    return { json: { server_now: new Date().toISOString(), matches } };
  }
}
