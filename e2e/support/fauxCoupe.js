/**
 * Faux serveur de jeu de La Coupe du Gang (`/ws/coupe`) pour les vérifications de bout en bout :
 * il suit le contrat (docs/fonctions/coupe-du-gang.md, « Prototype réseau ») juste assez pour
 * l'écran /coupe-test. Aucun WebSocket n'atteint un vrai serveur (`routeWebSocket` sans
 * `connectToServer`).
 *
 *  - `auth` doit être le premier message, avec la version `v: 1` (sinon `update_required` puis 4426)
 *    et un jeton de session du faux serveur (sinon 4401) ; un client simple non testeur (ou tout
 *    compte si `refuser`) reçoit `error not_allowed` puis 4403 ; accepté → `hello` ;
 *  - `injoignable` : la connexion est refermée aussitôt (serveur de jeu indisponible) ;
 *  - `ping {c}` → `pong {c, s}` ; `create` → `room` avec CODE_MATCH ;
 *  - `join` avec CODE_MATCH → `room`, `start` (on joue le side 1 contre Kevin) et un `state`
 *    (`pt` / `kt` en secondes) ; un autre code → `error no_room`.
 */
export const CODE_MATCH = '4821';

/** Écart fictif entre l'horloge du serveur et celle du navigateur (ms). */
const DECALAGE_HORLOGE = 5000;

export class FauxCoupe {
  constructor(serveur) {
    this.serveur = serveur;
    /** Connexions reçues : `{ url, messages, compte }` (messages décodés, dans l'ordre). */
    this.connexions = [];
    /** Réglages d'un test : tout compte refusé (`not_allowed`), serveur qui ferme aussitôt. */
    this.refuser = false;
    this.injoignable = false;
  }

  /** Tous les messages reçus d'un type donné (`auth`, `create`, `join`, `react`, `leave`…). */
  messages(type) {
    return this.connexions.flatMap((c) => c.messages.filter((m) => m?.t === type));
  }

  brancher(ws) {
    const envoyer = (obj) => ws.send(JSON.stringify(obj));
    // `envoyer` : un test peut pousser lui-même des messages du serveur (state, goal, end…)
    const cnx = { url: ws.url(), messages: [], compte: null, dernierPing: 0, envoyer };
    this.connexions.push(cnx);
    if (this.injoignable) {
      // 1001 : serveur parti (1011 voudrait dire « erreur du serveur de jeu » pour l'app)
      ws.close({ code: 1001, reason: 'indisponible' });
      return;
    }
    ws.onMessage((brut) => {
      let m;
      try {
        m = JSON.parse(String(brut));
      } catch {
        cnx.messages.push({ t: 'illisible', brut: String(brut) });
        return;
      }
      cnx.messages.push(m);
      this.repondre(cnx, m, envoyer, ws);
    });
  }

  repondre(cnx, m, envoyer, ws) {
    // Premier message : `auth` obligatoire
    if (!cnx.compte) {
      if (m.t !== 'auth') {
        ws.close({ code: 4401, reason: 'auth' });
        return;
      }
      if (m.v !== 1) {
        envoyer({ t: 'error', code: 'update_required' });
        ws.close({ code: 4426, reason: 'update_required' });
        return;
      }
      const idCompte = this.serveur.jetons.get(m.token);
      const compte = this.serveur.comptes.find((c) => c.id === idCompte);
      if (!compte) {
        ws.close({ code: 4401, reason: 'auth' });
        return;
      }
      if (this.refuser || (!['admin', 'barber'].includes(compte.role) && compte.is_tester !== true)) {
        envoyer({ t: 'error', code: 'not_allowed' });
        ws.close({ code: 4403, reason: 'not_allowed' });
        return;
      }
      cnx.compte = compte;
      envoyer({ t: 'hello', name: compte.role === 'admin' ? "D'Home Barber" : 'Membre du Gang' });
      return;
    }

    switch (m.t) {
      case 'ping':
        cnx.dernierPing = Number(m.c) || 0;
        envoyer({ t: 'pong', c: m.c, s: cnx.dernierPing + DECALAGE_HORLOGE });
        break;
      case 'create':
        envoyer({ t: 'room', code: CODE_MATCH, side: 0 });
        break;
      case 'join':
        if (m.code !== CODE_MATCH) {
          envoyer({ t: 'error', code: 'no_room' });
          break;
        }
        envoyer({ t: 'room', code: CODE_MATCH, side: 1 });
        envoyer({ t: 'start', you: 1, names: ['Kevin', "D'Home Barber"], roles: ['barber', 'admin'] });
        envoyer({
          t: 'state',
          s: cnx.dernierPing + DECALAGE_HORLOGE,
          ph: 'count',
          pt: 0.4,
          b: [180, 205, 0, 0],
          p: [[180, 540], [180, 100]],
          sc: [0, 0],
          ack: [0, 0],
          k: 1,
          kt: 0.4,
        });
        break;
      default:
        break;
    }
  }
}
