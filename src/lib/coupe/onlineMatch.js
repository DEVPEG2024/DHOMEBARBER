/*
 * Match en ligne de La Coupe du Gang : connexion `/ws/coupe` (protocole v3) et code réseau,
 * indépendants de React (contrat : docs/fonctions/coupe-du-gang-contrat.md, section 4 ;
 * règlement v2 : docs/fonctions/coupe-du-gang-regles-v2-contrat.md, sections 4 et 6 ; principe
 * réseau : section « Prototype réseau » de docs/fonctions/coupe-du-gang.md).
 *
 * Protocole v3 (31 oct. 2026) : `auth.v` = 3. Le serveur joue le règlement v2 seulement si les deux
 * téléphones sont en v3 (`start.rules === 2`, `start.gw` = 5) ; sans `start.rules` (adversaire sur
 * une app publiée, ou `COUPE_RULES_V2=off`), tout se passe exactement comme en v2 : aucun champ du
 * règlement v2 n'est lu, l'image et les événements ajoutés restent neutres (0, null, []).
 *
 * Principe « la frappe appartient à celui qui frappe » :
 *  - ce téléphone simule son joueur et le ballon sans attendre ; il ne fait le choc qu'avec SON
 *    joueur, et envoie chaque frappe (`hit`) : position et vitesse de son joueur au moment du choc.
 *    Le serveur refait le choc sur SON ballon (anti-triche), puis rejoue ;
 *  - à chaque `state`, il recale son ballon sur celui du serveur amené à maintenant (sauf tant que
 *    sa dernière frappe n'est pas acquittée), l'affichage lissant l'écart en ~80 ms ;
 *  - phase, score et buts viennent toujours du serveur.
 *
 * Affichage (banc d'essai du 29 oct. 2026 : le ballon traversait l'adversaire puis sautait à
 * chaque frappe adverse, et l'attaquant voyait des buts que le serveur ne comptait pas) :
 *  - dans SA moitié, le ballon est prédit au présent (sa frappe est immédiate) ;
 *  - dans la moitié ADVERSE, le ballon est montré au même instant que l'adversaire : interpolé
 *    dans les `state` reçus, avec un retard d'un demi-aller-retour plus un intervalle d'état ;
 *  - une bande autour de la ligne médiane passe en douceur d'une horloge à l'autre ;
 *  - le ballon affiché n'entre dans une cage qu'au `goal` du serveur, et se recale alors sur lui.
 *
 * Repère : localement on joue toujours en bas (side 0 du moteur). Le joueur `side 1` tourne tout
 * de 180° (flipPoint / flipVel) à l'entrée comme à la sortie du réseau.
 *
 *   const match = new OnlineMatch({ onChange: (ui) => …, onEvent: (type, data) => … });
 *   match.create();   // ou join('4821'), joinLink(lien), peek(lien) puis accept(), challenge(idFiche),
 *                     // challengePlayer(cléPublique) (liste « Défier un joueur »)
 *   // à chaque frame : match.update(dt); renderer.render(match.getFrame(), dt);
 *   match.destroy();  // écran fermé : en plein match, ce n'est PAS un abandon (voir plus bas)
 *
 * Coupures et départs (contre-expertise du 29 oct. 2026) :
 *  - socket fermée ou muette en plein match (plus aucun `state` depuis 1,5 s, ou plus de `pong`
 *    depuis 6 s hors match) : fermée par l'app, puis reprise automatique (`resume {link}`), le
 *    serveur garde la place 10 s (phase `pause`) ;
 *  - page cachée (autre app, écran verrouillé) en plein match : socket fermée exprès (pause chez le
 *    serveur, au lieu d'un joueur figé), reprise au retour ; dans la salle d'attente (lien partagé
 *    depuis une autre app), même chose : le serveur garde la salle et son code ;
 *  - écran quitté en plein match (retour du navigateur, notification, lien) : `destroy()` ferme la
 *    socket SANS `leave` ; le lien du match est gardé 10 s (`readPendingResume`) pour reprendre si
 *    l'on revient. Seuls « Abandonner » (confirmé), la salle d'attente et la fin envoient `leave`.
 *
 * Règlement v2 (`start.rules === 2`) :
 *  - événements du terrain : liste locale `fld` tenue par `ev` (annonce), `ev_end` (fin avant
 *    l'heure : penalty, but en or) et `start.evs` (reprise), tournés par `flipEvent` pour le joueur
 *    1, oubliés avec `liveEvents`. Toutes leurs heures sont celles du serveur : la prédiction de sa
 *    moitié les applique à l'heure du serveur estimée (`stepBall(…, fld, t)`, `advanceBall` quand un
 *    état est amené à maintenant, `walls` avec `goalOffsets`), `touchBall` après chaque frappe de son
 *    joueur ; la vue de la moitié adverse les applique à son heure à elle ;
 *  - état : `b` à 7 valeurs (`fx`, `own`, `air` ; `own` tourné pour le joueur 1), `md` (penalty,
 *    but en or), `w`, `cp`, `pk` (échangés pour le joueur 1), `ne` ; phase `pen` : son joueur est posé
 *    sur `penaltyPlace(0, tireur local)` à son début, comme à l'engagement ; le mode du moteur
 *    (`movePaddle`, `unpin`) suit `md` ;
 *  - affichage : la frontière entre « sa » zone (ballon prédit au présent) et celle de
 *    l'adversaire (ballon au même instant que lui) suit le mode. Jeu normal : la ligne médiane.
 *    Penalty : le milieu entre la ligne du gardien et le point de penalty (le tireur passe la ligne
 *    médiane, le gardien reste sur sa ligne). But en or (les deux joueurs vont partout, sauf dans les
 *    petites surfaces) : le ballon appartient à celui des deux joueurs dont il est le plus près
 *    (soi au présent, l'adversaire tel qu'il est affiché) ; en jeu normal, ce partage retombe sur la
 *    ligne médiane. Les frappes adverses sont repérées de la même façon (près de l'adversaire en but
 *    en or). La prédiction ne fait toujours le choc qu'avec SON joueur : une frappe de l'adversaire
 *    dans sa moitié (but en or) arrive par le recalage, et l'affichage montre alors le ballon de
 *    l'adversaire (vue retardée), qui ne le traverse jamais ;
 *  - effet du ballon affiché (`fx`, `own`, `air`) : celui de l'horloge qui domine l'affichage
 *    (présent ou vue adverse), sans jamais revenir à un état plus ancien que celui déjà montré : un
 *    ballon allumé par sa frappe reste allumé quand la vue adverse, en retard, ne le sait pas encore.
 *    Les événements `fire`, `charge`, `douse`, `short` naissent de ses changements, une fois chacun
 *    (rien sur un recalage qui confirme, rien sur une frappe refusée) ; `bolt` quand l'heure du
 *    serveur passe un éclair ;
 *  - cages qui bougent : `getFrame().goalOff` donne la cage du bas à l'heure présente et celle du
 *    haut à l'heure de la vue adverse, celles où le ballon affiché les rencontre ; la ligne de but
 *    du ballon affiché suit ces décalages.
 */
import {
  W, H, GL, GR, BR, PR, STEP, HUMAN_SPEED, KEEP_LIMIT, BALL_MAX, GOALS_TO_WIN,
  RULES_V2, GOALS_TO_WIN_V2, FX_NONE, FX_FIRE, FX_ELEC, HOP_S, CAMP_S, BLOCK_S, EVENT_KINDS,
  createBall, createPaddle, homePaddle, flipPoint, flipVel,
  movePaddle, stepBall, collidePaddle, walls, unpin, advanceBall,
  touchBall, goalOffsets, liveEvents, flipEvent, penaltyPlace, penaltySpot, keeperLine,
  inBigBox, pinnedBy, pinClock,
} from './engine.js';
import { API_SERVER_URL, getToken as readToken } from '@/api/apiClient';

/**
 * Adresse du serveur de jeu ; `VITE_COUPE_WS_URL` la remplace (serveur local). Hors développement,
 * seulement en `wss://` : le jeton (valable un an) ne part jamais en clair.
 */
export function coupeSocketUrl() {
  const custom = import.meta.env.VITE_COUPE_WS_URL;
  if (custom && (import.meta.env.DEV || /^wss:\/\//.test(String(custom)))) return String(custom);
  return `${API_SERVER_URL.replace(/^http/, 'ws')}/ws/coupe`;
}

// Version du protocole, portée par `auth` (autre valeur : `update_required`, fermeture 4426). 3 : le
// serveur peut jouer le règlement v2 (contrat du règlement v2, section 4) ; il accepte encore 2
export const PROTOCOL_VERSION = 3;
// Horloge : 5 ping à 200 ms d'écart après `hello`, puis un toutes les 2 s ; 8 derniers échantillons
const PING_BURST = 5;
const PING_BURST_GAP = 200;
const PING_EVERY = 2000;
const CLOCK_SAMPLES = 8;
// Position de son joueur envoyée 30 fois par seconde
const INPUT_HZ = 30;
// Frappes : le serveur refuse deux frappes à moins de 10 ms (heure `at`) ; marge pour le bruit de
// l'horloge estimée (12 ms = 3 pas de la physique, comme 10). Le premier choc d'une série part tout
// de suite. Pendant une poussée (un choc à chaque pas), le plus récent part dès HIT_GAP_MS quand le
// joueur va vite (mesure de S1 du 29 oct. 2026 : à 40 ms, un joueur lancé au-delà de ~1 850 u/s
// passe devant le ballon du serveur entre deux instantanés, refus `no_contact` et recul de 70 à
// 97 unités ; à 10 ms, aucun refus), sinon toutes les HIT_HOLD_MS (ballon coincé contre un bord,
// joueur freiné). Au plus HIT_RATE_MAX frappes par seconde glissante : avec les `in` (30/s), sous
// le seau de 60 messages/s du serveur (au-delà il ignore l'excédent, et des `in` perdus figeraient
// ce joueur chez l'adversaire).
const HIT_GAP_MS = 12;
const HIT_HOLD_MS = 40;
const FAST_PUSH_SPEED = 1200;
const HIT_RATE_MAX = 25;
// Vue de la moitié adverse : retard = demi-aller-retour + un intervalle d'état (30 états/s)
const STATE_GAP_MS = 33;
const VIEW_DEFAULT_MS = 110;
const VIEW_MIN_MS = 35;
const VIEW_MAX_MS = 220;
// Bande de transition autour de la ligne médiane (demi-largeur, unités du terrain). Élargie avec le
// retard : la vue ne doit jamais faire reculer le ballon (pente du raccord < 1 / (retard × vitesse)),
// et l'accélération apparente dans la bande reste faible
const BAND_MIN = 100;
const BAND_PER_S = 900;
// Ballon affiché sans saut (banc v2 du 29 oct. 2026 : 141 à 153 images par minute de jeu où il
// sautait de plus de 15 u, surtout au passage d'une horloge à l'autre et quand la vue adverse se
// corrige) : il ne bouge jamais de plus que le ballon peut en une image, plus SHOW_EXCESS u/s (9 u
// par image) ; l'écart restant est rattrapé à cette vitesse. Jamais près d'une ligne de but quand le
// ballon y file (URGENT_DIST) : le but se voit à temps (un limiteur sans cette exception cachait des
// buts). Mesuré sur le même banc : 28 et 41 sauts par minute (4G, 4G difficile), buts non vus du
// défenseur 0 sur 3 et 1 sur 16 (avant : 1 sur 9 et 3 sur 19). Un fondu dans le temps à la place
// (150 à 250 ms) faisait plus de sauts que la bande seule
const SHOW_EXCESS = 540;
const URGENT_DIST = 160;
// Au-delà de cet écart (reprise, engagement manqué), saut franc
const SHOW_SNAP = 400;
// Vue adverse coupée (frappe en attente du serveur) puis rétablie : fondu de ~60 ms
const GATE_TAU = 0.06;
// États gardés pour la vue adverse (ms)
const VIEW_BUFFER_MS = 1000;
// Grille des pas : le serveur avance son ballon par pas fixes depuis l'engagement (ou la dernière
// frappe). Une simulation locale décalée sur une autre grille fait rebondir le ballon à un autre
// instant (jusqu'à un pas de trajet, ~4 unités par rebond). Écart toléré avant de se recaler (ms)
const STEP_MS = STEP * 1000;
const GRID_EPS_MS = 0.3;
// Recalage du ballon : au-delà de 1,5 on prend le serveur ; au-delà de 30 c'est un « recalage »
// compté par le diagnostic (hors frappes adverses, attendues : banc d'essai du 29 oct. 2026)
const SNAP_EPS = 1.5;
const RESYNC_EPS = 30;
// Décalage d'affichage qui fond en ~80 ms (3 τ) ; au-delà de SMOOTH_MAX, saut franc
const SMOOTH_TAU = 0.027;
const SMOOTH_MAX = 200;
// Recalage au but : toujours glissé (le ballon file dans la bonne cage)
const GOAL_SMOOTH_MAX = 480;
// Frappe adverse vue dans les états : changement de vitesse franc, loin des bords
const OPP_HIT_DV = 300;
// Délais de connexion
const CONNECT_TIMEOUT = 8000;
const REPLY_TIMEOUT = 8000;
const REACT_GAP = 1000; // réactions : 1 par seconde
// Ralenti visuel après un but (comme le prototype)
const GOAL_SLOW_MS = 750;
const GOAL_SLOW = 0.22;
// Compte à rebours en cours (`start.cd`, `state.cd`, secondes) : 4,5 au premier coup d'envoi d'un
// match (thème stade, serveur du 29 oct. 2026), 3 après un but ou un retour ; absent d'un serveur
// plus ancien : 3 s
const COUNT_S = 3;
// Reprise après une coupure : le serveur garde la place 10 s à partir du moment où il voit la
// coupure (tout de suite si l'app ferme la socket, plus tard si le réseau est tombé net). L'app
// essaie un peu plus longtemps : c'est le serveur qui dit si le match existe encore (`no_room`).
const SERVER_RESUME_MS = 10000;
const RESUME_TRY_MS = 15000;
const RESUME_RETRY_MS = 1200;
const RESUME_REPLY_MS = 4000;
// Salle d'attente : 2 minutes chez le serveur (contrat 4.2), code et lien compris
const ROOM_MS = 2 * 60 * 1000;
// Abandon : le serveur renvoie la fin du match (`end`, points compris) ; au-delà, écran de fin fait
// ici. Moins de 20 s de jeu effectif avant l'abandon : match annulé (contrat, section 7)
const ABANDON_WAIT_MS = 3500;
const CANCEL_PLAY_MS = 20 * 1000;
// Surveillance de la connexion (une socket peut rester « ouverte » sans plus rien transmettre :
// réseau mobile tombé, Wi-Fi quitté) : en match, le serveur envoie 30 états par seconde ; hors
// match, un `ping` part toutes les 2 s
const WATCH_EVERY_MS = 500;
const STATE_SILENCE_MS = 1500;
const PONG_SILENCE_MS = 6000;
// Lien d'un défi : 12 caractères [a-z0-9] (contrat 4.2) ; un peu de marge
const LINK_MAX = 32;
// Règlement v2 : événements gardés encore 1,5 s après leur fin (la vue adverse, en retard, et
// l'extrapolation d'un état peuvent encore en avoir besoin) ; un éclair passé depuis plus de 0,6 s
// n'est plus annoncé (reprise d'un match, page revenue au premier plan) ; au plus 24 événements
const FLD_KEEP_MS = 1500;
const BOLT_LATE_MS = 600;
const FLD_MAX = 24;
// Frappe adverse en but en or : ballon à moins de cette distance de l'adversaire (contact + trajet
// d'un intervalle d'état)
const OPP_REACH_GOLD = PR + BR + 70;
// Match quitté sans abandon : lien gardé pour la reprise (onglet seulement, jamais d'un appareil à l'autre)
const RESUME_KEY = 'cdg-reprise';
/** Événement de `window` quand le match à reprendre change (accueil de la Coupe). */
export const RESUME_EVENT = 'cdg:reprise';

const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const numOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
// Durée de compte à rebours lisible (0 à 10 s), sinon null
const countOf = (v) => { const cd = numOrNull(v); return cd !== null && cd > 0 && cd <= 10 ? cd : null; };
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const smooth = (u) => u * u * (3 - 2 * u);

// ─── Règlement v2 : effet du ballon, événements du serveur ─────────────

// Effet du ballon réduit à une valeur comparable : effet, camp qui l'a donné, ballon en l'air
const fxKeyOf = (fx, own, air) => fx * 6 + (fx ? own + 1 : 0) * 2 + (air > 0 ? 1 : 0);
const NO_FX = Object.freeze({ fx: FX_NONE, own: -1, air: 0 });

// Liste de 1 à `max` tableaux d'au moins `n` nombres
const rows = (a, n, max) => Array.isArray(a) && a.length >= 1 && a.length <= max
  && a.every((r) => Array.isArray(r) && r.length >= n && r.slice(0, n).every(fin));

/**
 * Descripteur d'événement reçu du serveur (contrat du règlement v2, section 3), recopié champ par
 * champ, ou null s'il est illisible (il ne doit jamais casser la physique : un champ manquant
 * ferait des NaN dans le moteur).
 */
function eventOrNull(e) {
  if (!e || typeof e !== 'object' || !EVENT_KINDS.includes(e.k)) return null;
  if (!fin(e.id) || !fin(e.an) || !fin(e.at) || !fin(e.until) || e.until < e.at) return null;
  const out = { k: e.k, id: e.id, an: e.an, at: e.at, until: e.until, sd: fin(e.sd) ? e.sd : 0 };
  if (e.k === 'foam' || e.k === 'gel') {
    if (!rows(e.l, 5, 8)) return null;
    out.l = e.l.map((r) => r.slice(0, 5));
  } else if (e.k === 'storm') {
    if (!rows(e.b, 3, 6)) return null;
    out.b = e.b.map((r) => r.slice(0, 3));
  } else if (e.k === 'water') {
    if (!rows(e.s, 6, 8)) return null;
    out.s = e.s.map((r) => r.slice(0, 6));
  } else if (e.k === 'goals') {
    // Deux trajets [[ms, dx], …], heures croissantes
    if (!Array.isArray(e.g) || e.g.length !== 2) return null;
    if (!e.g.every((keys) => rows(keys, 2, 60) && keys.every((k, i) => i === 0 || k[0] >= keys[i - 1][0]))) return null;
    out.g = e.g.map((keys) => keys.map((k) => [k[0], k[1]]));
  } else {
    if (![e.x0, e.y0, e.x, e.y].every(fin) || !Array.isArray(e.w) || !fin(e.w[0]) || !fin(e.w[1])) return null;
    out.x0 = e.x0;
    out.y0 = e.y0;
    out.x = e.x;
    out.y = e.y;
    out.w = [e.w[0], e.w[1]];
  }
  return out;
}

/** Lien d'un défi nettoyé (`?defi=` d'une adresse) ; chaîne vide s'il n'y a rien d'utilisable. */
export function cleanChallengeLink(link) {
  return String(link ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, LINK_MAX);
}

const ERRORS = {
  unreachable: { message: 'Connexion impossible au serveur de jeu', retry: true },
  not_allowed: { message: "Le jeu en ligne n'est pas ouvert à ton compte", retry: false },
  disabled: { message: 'La Coupe fait une pause : reviens un peu plus tard', retry: false },
  opp_left: { message: "L'autre joueur est parti", retry: false },
  lost: { message: 'Connexion perdue : le match est arrêté', retry: false },
  match_over: { message: "Le match s'est arrêté pendant ton absence", retry: false },
  already_playing: { message: 'Tu as déjà un match en cours', retry: true },
  idle: { message: "Plus d'activité depuis 5 minutes", retry: true },
  // Même jeton, même refus : pas de « Réessayer »
  session: { message: "Ta session n'est pas reconnue par le serveur de jeu. Reconnecte-toi puis réessaie.", retry: false },
  // Codes envoyés par le serveur (dhomebarber-api/lib/coupeRooms.js)
  no_room: {
    message: (m) => (m.viaLink() ? "Ce défi n'existe plus : il a expiré ou quelqu'un l'a déjà pris" : 'Aucun match en attente avec ce code'),
    retry: false,
  },
  own_room: {
    message: (m) => (m.viaLink() ? "C'est ton propre défi : envoie le lien à quelqu'un d'autre" : "C'est ton propre match : l'autre téléphone doit utiliser un autre compte"),
    retry: false,
  },
  room_expired: {
    message: (m) => {
      // Invité dont le créateur n'est pas revenu dans les 2 minutes
      if (m.ui.status === 'room' && m.ui.side === 1) return `${m.ui.waitingFor?.name || m.ui.invite?.from?.name || "L'autre joueur"} n'est pas revenu à temps`;
      return m.lastAction?.t === 'challenge' ? `${m.invitedName()} n'a pas répondu à temps` : "Personne n'a rejoint le match : le code a expiré";
    },
    retry: true,
  },
  invite_expired: { message: 'Ce défi a expiré', retry: false },
  declined: { message: (m) => `${m.invitedName()} ne peut pas jouer maintenant`, retry: false },
  blocked: { message: 'Tu ne peux pas jouer contre ce joueur', retry: false },
  // Deux comptes admin : ils jouent tous les deux sous « D'Home Barber » (une seule ligne au classement)
  salon_vs_salon: {
    message: 'Deux comptes du salon ne peuvent pas s’affronter : ils jouent tous les deux sous « D’Home Barber »',
    retry: false,
  },
  barber_unavailable: { message: "Ce barber n'est plus dispo pour un match", retry: false },
  // Liste « Défier un joueur » : sorti de la liste, plus joignable, déjà en match…
  player_unavailable: { message: "Ce joueur n'est plus disponible pour un match", retry: false },
  rate_limited: { message: "Trop d'essais : attends quelques minutes avant de recommencer", retry: false },
  server_full: { message: 'Trop de matchs en ce moment : réessaie dans une minute', retry: true },
  update_required: { message: "Mets l'app à jour pour jouer en ligne", retry: false },
  replaced: { message: 'Ton compte a ouvert le jeu sur un autre appareil', retry: false },
  server_error: { message: 'Erreur du serveur de jeu', retry: true },
  server: { message: 'Le serveur de jeu a refusé la demande', retry: true },
};

const SERVER_CODES = new Set(['not_allowed', 'disabled', 'no_room', 'own_room', 'room_expired', 'rate_limited',
  'server_full', 'update_required', 'replaced', 'server_error', 'blocked', 'barber_unavailable',
  'player_unavailable', 'already_playing', 'idle', 'salon_vs_salon']);

// Fermetures sans message `error` préalable (ou arrivées seules)
const CLOSE_KINDS = {
  4401: 'session',
  4403: 'not_allowed',
  4408: 'idle',
  4409: 'replaced',
  4426: 'update_required',
  4429: 'rate_limited',
  1011: 'server_error',
};

// Revanche refusée par le serveur (`error` après « Revanche ») : ce qu'on dit sous le bouton
const REMATCH_NOTES = {
  blocked: 'Revanche impossible',
  room_expired: 'Revanche expirée',
  already_playing: 'Revanche impossible : un match est déjà en cours',
  rate_limited: "Trop de matchs d'affilée : fais une pause",
};
// Inutile de retenter une reprise : le même jeton serait refusé de la même façon
const FATAL_KINDS = new Set(['session', 'not_allowed', 'replaced', 'update_required', 'disabled']);

/** Code d'erreur du serveur → message ; un code inconnu reste générique. */
const errorKind = (code) => (SERVER_CODES.has(String(code)) ? String(code) : 'server');

export const IDLE_UI = Object.freeze({
  status: 'idle', // idle | connecting | invite | room | match | over | error
  code: null,
  link: null,
  side: null,
  invited: null, // défi lancé à un barber : { name, role } (salle réservée à son compte)
  invite: null, // défi reçu : { link, from: { name, role }, expiresAt } (heure de l'appareil, ms)
  incoming: null, // défi reçu pendant que le jeu est ouvert (salle d'attente, fin de match) : même forme
  roomAt: null, // salle d'attente ouverte (heure de l'appareil, ms)
  waitingFor: null, // salle rejointe pendant l'absence de son créateur : { name } (`waiting_opponent`)
  names: [], // [moi, adversaire]
  roles: [],
  keys: [], // clés publiques (Signaler, Bloquer)
  photos: [], // [moi, adversaire] : photo d'un client (`start.photos`), null sinon
  myName: null, // mon nom tel que le serveur le montre à l'adversaire (`hello.name`, jamais d'email)
  rankedHint: null, // les deux ont droit aux points : true / false, null inconnu (indicatif, la fin du match fait foi)
  rules: null, // règlement du match (`start.rules`) : 2 = règlement v2, 1 = règle d'aujourd'hui, null hors match
  goalsToWin: null, // buts pour gagner (`start.gw`) : 5 en règlement v2, 3 sinon, null hors match
  result: null, // { won, winner (0 moi, 1 l'adversaire, null nul ou annulé), draw, score, forfeit, cancelled, reason, points }
  rematchAsked: false,
  // Connexion perdue : reprise en cours (`cut` coupure, `hidden` retour au premier plan, `return`
  // écran rouvert après un départ), en plein match ou dans la salle d'attente ; false sinon
  reconnecting: false,
  abandoning: false, // « Abandonner » confirmé : fin du match attendue du serveur (3,5 s au plus)
  away: null, // l'adversaire s'est déconnecté : { until } (heure de l'appareil, ms)
  timeWarn: false, // `time_left` reçu : la fin du temps de jeu approche (5 min de jeu effectif)
  oppGone: false, // fin du match : l'adversaire est parti (ou revanche refusée), plus de revanche
  rematchNote: null, // pourquoi la revanche est impossible, quand ce n'est pas un départ
  offline: false, // fin du match : connexion fermée, plus de revanche
  error: null, // { kind, code, message, retry }
});

// ─── Match quitté sans abandon : lien gardé pour la reprise ──────────

function notifyResume() {
  try { window.dispatchEvent(new Event(RESUME_EVENT)); } catch { /* hors navigateur */ }
}

const pairOf = (arr, f) => (Array.isArray(arr) ? [f(arr[0]), f(arr[1])] : [f(null), f(null)]);

const MEDIA_PHOTO = /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Photo d'un joueur (`start.photos`, photo de profil d'un client) : seulement une image envoyée à
 * l'app (`https://<api>/api/media/<uuid>`), sinon null (jamais d'image d'un autre domaine).
 */
export function photoUrlOrNull(v) {
  return typeof v === 'string' && v.length <= 500 && MEDIA_PHOTO.test(v) ? v : null;
}

/**
 * Match quitté il y a moins de 10 s sans l'abandonner (écran fermé, page cachée) : de quoi le
 * reprendre (`resume {link}`), ou null. `until` : fin de la place gardée par le serveur (heure de
 * l'appareil, ms). Au-delà, le serveur a prononcé le forfait : l'entrée est effacée.
 */
export function readPendingResume(now = Date.now()) {
  let raw = null;
  try { raw = sessionStorage.getItem(RESUME_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const e = JSON.parse(raw);
    const link = cleanChallengeLink(e?.link);
    const until = Number(e?.until);
    if (link && Number.isFinite(until) && until > now) {
      return {
        link,
        until,
        you: e.you === 1 ? 1 : 0,
        names: pairOf(e.names, (v) => String(v ?? '').slice(0, 60)),
        roles: pairOf(e.roles, (v) => String(v ?? '').slice(0, 20)),
        keys: pairOf(e.keys, (v) => String(v ?? '').slice(0, 80)),
        photos: pairOf(e.photos, photoUrlOrNull),
        score: pairOf(e.score, (v) => clampN(Math.round(num(v)), 0, 99)),
        // Règlement du match (le `start` de la reprise le redonne)
        rules: e.rules === RULES_V2 ? RULES_V2 : 1,
        goalsToWin: clampN(Math.round(num(e.goalsToWin)) || (e.rules === RULES_V2 ? GOALS_TO_WIN_V2 : GOALS_TO_WIN), 1, 20),
      };
    }
  } catch { /* entrée illisible : effacée */ }
  clearPendingResume();
  return null;
}

/** Plus rien à reprendre (reprise faite, abandon, fin du match). */
export function clearPendingResume() {
  let had = false;
  try {
    had = sessionStorage.getItem(RESUME_KEY) !== null;
    sessionStorage.removeItem(RESUME_KEY);
  } catch { /* stockage indisponible */ }
  if (had) notifyResume();
}

function writePendingResume(entry) {
  try { sessionStorage.setItem(RESUME_KEY, JSON.stringify(entry)); } catch { /* stockage indisponible : pas de reprise */ }
  notifyResume();
}

export class OnlineMatch {
  constructor({ url = coupeSocketUrl(), getToken = readToken, onChange, onEvent } = {}) {
    this.url = url;
    this.getToken = getToken;
    this.onChange = onChange || null;
    this.onEvent = onEvent || null;
    this.ui = { ...IDLE_UI };
    this.ws = null;
    this.opened = false;
    this.timers = {};
    this.lastAction = null;
    this.link = null;
    this.helloSeen = false;
    this.resuming = null;
    this.resumeTimer = null;
    this.abandoning = false;
    this.abandonTimer = null;
    this.lastPongAt = 0;
    this.lastStateAt = 0;
    // Horloge
    this._resetClock();
    this.viewDelay = VIEW_DEFAULT_MS;
    // Match
    this.you = 0;
    this.lastReact = -Infinity;
    this.taughtBox = false;
    this.target = null;
    this.fingerDown = false;
    // Règlement du match en cours (`start.rules`, `start.gw`)
    this.rules = 1;
    this.goalsToWin = GOALS_TO_WIN;
    this._resetMatch();
    // Bruits de la prédiction locale. 'fire', 'charge', 'douse' et 'short' (règlement v2) ne sortent
    // pas d'ici : ils naissent du ballon AFFICHÉ (_shownFx), une fois chacun
    this._wallFx = (kind, v) => {
      if (kind === 'post') { if (v > 120) this.emit('post', v); } else if (kind === 'wall') this.emit('wall', v);
    };
    // Page cachée ou revenue au premier plan ; surveillance d'une socket muette
    this._onVisibility = () => this._visibilityChanged();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVisibility);
    this.watchTimer = setInterval(() => this._watch(), WATCH_EVERY_MS);
  }

  // ─── Commandes de l'écran ─────────────────────────────────────────

  /** Crée un match : le serveur rend un code à 4 chiffres et un lien à partager. */
  create() { this._begin({ t: 'create' }); }

  /** Rejoint le match `code` (4 chiffres). */
  join(code) {
    const c = String(code || '').replace(/\D/g, '').slice(0, 4);
    if (c.length !== 4) { this._failNow('no_room', { t: 'join', code: c }); return; }
    this._begin({ t: 'join', code: c });
  }

  /** Rejoint un match par son lien (défi accepté sans passer par l'écran « Défi reçu »). */
  joinLink(link) {
    const l = cleanChallengeLink(link);
    if (!l) { this._failNow('no_room', { t: 'join', link: '' }); return; }
    this._begin({ t: 'join', link: l });
  }

  /** Défi reçu : qui défie, et jusqu'à quand (`invite`), avant d'accepter ou de refuser. */
  peek(link) {
    const l = cleanChallengeLink(link);
    if (!l) { this._failNow('no_room', { t: 'peek', link: '' }); return; }
    this._begin({ t: 'peek', link: l });
  }

  /** Défie un barber « Dispo » : salle réservée à son compte, il reçoit une notification. */
  challenge(employeeId) {
    const id = String(employeeId ?? '').trim().slice(0, 64);
    if (!id) { this._failNow('barber_unavailable', { t: 'challenge', employee_id: '' }); return; }
    this._begin({ t: 'challenge', employee_id: id });
  }

  /**
   * Défie un client de la liste « Défier un joueur » (clé publique `key_hash` de GET /coupe/players) :
   * salle réservée à son compte, il reçoit une notification (ou le défi, jeu ouvert).
   */
  challengePlayer(keyHash) {
    const key = String(keyHash ?? '').trim().toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(key)) { this._failNow('player_unavailable', { t: 'challenge', key_hash: '' }); return; }
    this._begin({ t: 'challenge', key_hash: key });
  }

  /**
   * Défi reçu : accepter (même connexion ; si elle est tombée pendant que l'écran attendait, une
   * nouvelle part, avec le `join`).
   */
  accept() {
    if (this.ui.status !== 'invite' || !this.ui.invite) return;
    this._joinInvite(this.ui.invite);
  }

  /** Défi reçu : refuser (le défiant reçoit `declined`), puis fermer la connexion. */
  decline() {
    if (this.ui.status !== 'invite' || !this.ui.invite) return;
    this._send({ t: 'decline', link: this.ui.invite.link });
    this.lastAction = null;
    this._teardown();
    this._set({ ...IDLE_UI });
  }

  /** Défi reçu dont le compte à rebours est fini. */
  expireInvite() {
    if (this.ui.status !== 'invite') return;
    this.lastAction = null;
    this._fail('invite_expired');
  }

  /**
   * Défi reçu alors que le jeu est ouvert (barber dans sa salle d'attente ou sur l'écran de fin) :
   * l'accepter quitte cette salle (le serveur la ferme au `join`) et rejoint celle du défiant.
   */
  acceptIncoming() {
    const inc = this.ui.incoming;
    if (!inc || (this.ui.status !== 'room' && this.ui.status !== 'over')) return;
    this._endResume();
    this._joinInvite(inc);
  }

  /** Défi reçu pendant que le jeu est ouvert : « Pas maintenant » (le défiant reçoit `declined`). */
  declineIncoming() {
    const inc = this.ui.incoming;
    if (!inc) return;
    this._send({ t: 'decline', link: inc.link });
    this._set({ incoming: null });
  }

  /** Défi reçu pendant que le jeu est ouvert, dont le compte à rebours est fini. */
  expireIncoming() {
    if (this.ui.incoming) this._set({ incoming: null });
  }

  /**
   * Reprend un match quitté il y a moins de 10 s (`readPendingResume`) : nouvelle connexion, puis
   * `resume {link}` ; le serveur renvoie `start` (mêmes noms, score) et le match continue.
   */
  resumeFrom(entry) {
    const link = cleanChallengeLink(entry?.link);
    if (!link) { this._failNow('match_over', null); return; }
    this._endResume();
    this._teardown();
    this._resetClock();
    this.lastAction = null;
    this.link = link;
    this.you = entry.you === 1 ? 1 : 0;
    this._resetMatch();
    this.rules = entry.rules === RULES_V2 ? RULES_V2 : 1;
    this.goalsToWin = Number(entry.goalsToWin) > 0 ? Number(entry.goalsToWin) : (this.rules === RULES_V2 ? GOALS_TO_WIN_V2 : GOALS_TO_WIN);
    if (Array.isArray(entry.score) && entry.score.length === 2) this.score = [num(entry.score[0]), num(entry.score[1])];
    this._set({
      ...IDLE_UI,
      status: 'match',
      link,
      side: this.you,
      rules: this.rules,
      goalsToWin: this.goalsToWin,
      names: Array.isArray(entry.names) ? entry.names.slice(0, 2) : [],
      roles: Array.isArray(entry.roles) ? entry.roles.slice(0, 2) : [],
      keys: Array.isArray(entry.keys) ? entry.keys.slice(0, 2) : [],
      photos: Array.isArray(entry.photos) ? entry.photos.slice(0, 2).map(photoUrlOrNull) : [],
    });
    this._startResume('match', { reason: 'return', serverUntil: Number(entry.until) || null });
  }

  /** Recommence la dernière demande (après « Connexion impossible »). */
  retry() {
    if (this.lastAction) this._begin(this.lastAction);
  }

  /** Revanche : le serveur relance le match (`start`) quand les deux l'ont demandée. */
  rematch() {
    const ui = this.ui;
    if (ui.status !== 'over' || ui.rematchAsked || ui.oppGone || ui.offline) return;
    if (!this._send({ t: 'rematch' })) { this._set({ offline: true }); return; }
    this._set({ rematchAsked: true });
  }

  /**
   * Quitte la salle, le défi ou le match. En plein match, c'est un abandon (forfait) : l'écran
   * demande confirmation avant (« Abandonner »). Sur l'écran « Défi reçu », c'est un refus.
   */
  leave() {
    const st = this.ui.status;
    this.lastAction = null;
    this._endResume();
    this._stopAbandon();
    clearPendingResume();
    if (this.ws && this.ws.readyState === 1) {
      if (st === 'invite' && this.ui.invite) this._send({ t: 'decline', link: this.ui.invite.link });
      else this._send({ t: 'leave' });
    }
    this._teardown();
    this._set({ ...IDLE_UI });
  }

  /**
   * « Abandonner » (confirmé) : `leave` en plein match, c'est un forfait (annulé avant 20 s de jeu).
   * Le serveur renvoie la fin du match à ce téléphone (`end` avec ses points) avant de le
   * détacher : on l'attend ABANDON_WAIT_MS au plus, sinon l'écran de fin est fait ici.
   */
  abandon() {
    if (this.ui.status !== 'match' || this.abandoning) { this.leave(); return; }
    this.abandoning = true;
    this.lastAction = null;
    clearPendingResume();
    const sent = !this.resuming && this._send({ t: 'leave' });
    this._endResume();
    this.pendingHit = null;
    this._set({ abandoning: true, reconnecting: false });
    clearTimeout(this.abandonTimer);
    this.abandonTimer = setTimeout(() => this._abandonFallback(), sent ? ABANDON_WAIT_MS : 0);
  }

  /** Réaction toute faite (0 👏, 1 🔥, 2 😂), une par seconde. Rend true si elle est partie. */
  react(r) {
    if (this.ui.status !== 'match' && this.ui.status !== 'over') return false;
    if (r !== 0 && r !== 1 && r !== 2) return false;
    // Jamais avant `hello` ni pendant une reprise : le serveur fermerait la socket (1008)
    if (!this._canPlay()) return false;
    const now = performance.now();
    if (now - this.lastReact < REACT_GAP) return false;
    if (!this._send({ t: 'react', r })) return false;
    this.lastReact = now;
    this.emit('react', { r, mine: true });
    return true;
  }

  /** Cible du joueur (repère local, décalage du doigt déjà appliqué). */
  setTarget(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.target = { x, y };
  }

  /** Doigt posé ou levé : levé, le joueur reste où il est et revient chez lui à l'engagement. */
  setFingerDown(down) { this.fingerDown = !!down; }

  /** Heure du serveur estimée (ms). */
  serverNow() { return performance.now() + this.offset; }

  /**
   * Diagnostic : ping médian (ms, null avant le premier pong), recalages du ballon (écart > 30,
   * hors frappes adverses) et frappes refusées par le serveur (acquittées sans effet), pour ce match.
   */
  stats() {
    return {
      ping: this.pingMs == null ? null : Math.round(this.pingMs),
      recalages: this.recalages,
      refusees: this.refused,
    };
  }

  /**
   * Écran du jeu fermé. En plein match (ou pendant sa reprise), ce n'est PAS un abandon : retour
   * du navigateur, notification touchée, lien suivi… La socket se ferme sans `leave` (le serveur
   * met le match en pause 10 s) et le lien est gardé pour reprendre si l'on revient à temps.
   * Ailleurs (salle d'attente, défi, fin du match), on quitte comme « Retour ».
   */
  destroy() {
    clearInterval(this.watchTimer);
    this.watchTimer = null;
    clearTimeout(this.abandonTimer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVisibility);
    if (this._inPlay()) {
      this._remember();
      this.lastAction = null;
      this._endResume();
      this._teardown();
    } else {
      this.leave();
    }
    this.onChange = null;
    this.onEvent = null;
  }

  emit(type, data) {
    try { this.onEvent?.(type, data); } catch { /* un effet raté ne casse pas le match */ }
  }

  /** Le dernier essai visait un lien (défi) plutôt qu'un code. */
  viaLink() { return !!(this.lastAction && (this.lastAction.t === 'peek' || this.lastAction.link !== undefined)); }

  /** Prénom du barber ou du joueur défié (messages d'erreur). */
  invitedName() {
    return this.ui.invited?.name || (this.lastAction?.key_hash !== undefined ? 'Ce joueur' : 'Le barber');
  }

  // ─── Boucle (appelée à chaque frame) ──────────────────────────────

  update(dt) {
    const f = Math.exp(-dt / SMOOTH_TAU);
    this.offsetBall.x *= f;
    this.offsetBall.y *= f;
    if (Math.abs(this.offsetBall.x) < 0.01) this.offsetBall.x = 0;
    if (Math.abs(this.offsetBall.y) < 0.01) this.offsetBall.y = 0;
    this.flash = Math.max(0, this.flash - dt);
    const st = this.ui.status;
    if (st === 'match') {
      const slow = this.phase === 'goal' && performance.now() < this.slowUntil ? GOAL_SLOW : 1;
      this.acc += dt;
      // Heure du serveur où en est la simulation locale (elle a `acc` de retard sur maintenant)
      const base = this.serverNow() - this.acc * 1000;
      let n = 0;
      while (this.acc >= STEP && n < 60) {
        n += 1;
        this.simNow = base + n * STEP * 1000;
        this._step(slow);
        this.acc -= STEP;
      }
      if (n >= 60) this.acc = 0;
      // Temps de jeu effectif (abandon : annulé avant 20 s) ; temps restant après `time_left` : ils
      // ne s'écoulent qu'en jeu, comme chez le serveur
      if (this.phase === 'live') {
        this.playedMs += dt * 1000;
        if (this.timeLeftMs != null) this.timeLeftMs = Math.max(0, this.timeLeftMs - dt * 1000);
      }
      // Règlement v2 : événements finis oubliés, éclairs annoncés quand leur heure passe
      if (this.fld.length) this._tickEvents(this.serverNow());
      // État reçu plus récent que le ballon local à son arrivée : comparé maintenant que la
      // simulation l'a rattrapé
      const late = this.lateState;
      if (late && this.simNow >= late.s) {
        this.lateState = null;
        if (this.phase === late.ph) this._reconcile(late.m, late.s, late.ph);
      }

      this.inAcc += dt;
      if (this.inAcc >= 1 / INPUT_HZ) {
        this.inAcc -= 1 / INPUT_HZ;
        if (this.inAcc > 1 / INPUT_HZ) this.inAcc = 0;
        // Position de son joueur et heure du serveur estimée de cette position (`at`, comme une
        // frappe : `t` est le type du message). Jamais avant `hello` ni pendant une reprise : un `in`
        // arrivé pendant la vérification du jeton fait fermer la socket en 1008 (banc du 29 oct. 2026 :
        // 0 reprise sur 4 avec 40 ms de vérification)
        if (this._canPlay()) {
          const p = this._flip(this.me.x, this.me.y);
          this._send({ t: 'in', x: r1(p.x), y: r1(p.y), at: r1(this.simNow > 0 ? this.simNow : this.serverNow()) });
        }
      }
    }
    if (st === 'match' || st === 'over') this._computeView(dt);
  }

  /**
   * Image du match pour le dessin (null hors match). Mêmes champs que LocalMatch (contrat du
   * règlement v2, section 6), tous en repère local (son joueur en bas, index 0).
   */
  getFrame() {
    if (this.ui.status !== 'match' && this.ui.status !== 'over') return null;
    const now = this.serverNow();
    const phaseT = this.phaseAt ? this.phaseAt.pt + Math.max(0, (now - this.phaseAt.s) / 1000) : 0;
    const keepT = this.phase === 'live' && this.keep
      ? Math.min(KEEP_LIMIT, this.keep.kt + Math.max(0, (now - this.keep.s) / 1000))
      : 0;
    const v2 = this.rules === RULES_V2;
    // Secondes de jeu écoulées depuis le dernier état (les chronos du serveur n'avancent qu'en jeu)
    const el = v2 && this.phase === 'live' && this.v2At != null ? Math.max(0, (now - this.v2At) / 1000) : 0;
    return {
      phase: this.phase,
      phaseT,
      // Durée du compte à rebours en cours (secondes), null hors `count`
      countS: this.phase === 'count' ? this.countS : null,
      keepT,
      score: this.score,
      flashBox: this.flash,
      ball: this.view.ball,
      paddles: [this.me, this.view.opp],
      // Secondes de jeu restantes après `time_left` (null avant)
      timeLeft: this.timeLeftMs == null ? null : Math.ceil(this.timeLeftMs / 1000),
      // Règlement v2 (neutre en règle d'aujourd'hui)
      rules: this.rules,
      goalsToWin: this.goalsToWin,
      // Heure des événements : celle du serveur, estimée
      now,
      events: v2 ? this.fld.filter((e) => now < e.until) : [],
      goalOff: v2 ? this._goalOff(now) : null,
      mode: v2 ? this._frameMode(el) : null,
      warn: [this.warn[0], this.warn[1]],
      camp: v2 ? this._campNow(el) : [0, 0],
      pin: v2 ? this._pinNow(el) : [0, 0],
      nextEvent: v2 && this.nextEv ? { left: Math.max(0, this.nextEv.left - el), total: this.nextEv.total } : null,
    };
  }

  // Cages qui bougent : celle du bas à l'heure présente (le ballon y est prédit au présent), celle
  // du haut à l'heure de la vue adverse (le ballon y est montré au même instant que l'adversaire)
  _goalOff(now) {
    const b = goalOffsets(this.fld, now);
    const t = goalOffsets(this.fld, now - this.viewDelay);
    if (!b && !t) return null;
    return [b ? b[0] : 0, t ? t[1] : 0];
  }

  // Mode affiché : { k: 'pen', s, left } ou { k: 'gold', left } ; `left` s'écoule en jeu
  _frameMode(el) {
    const md = this.md;
    if (!md) return null;
    if (md.k === 'pen') return { k: 'pen', s: md.s, left: md.left < 0 ? -1 : Math.max(0, md.left - el) };
    return { k: 'gold', left: Math.max(0, md.left - el) };
  }

  // Secondes d'affilée dans sa grande surface : celles du serveur, avancées depuis son état. Pour
  // son joueur, le téléphone sait tout de suite qu'il en est sorti ou qu'il a touché le ballon
  _campNow(el) {
    const c = this.campS;
    let mine = 0;
    if (!this.md && inBigBox(this.me, 0)) {
      // Dernier état calculé avant que le serveur connaisse ma dernière frappe (un demi-aller-retour
      // plus tard) : le chrono repart de cette frappe
      const before = this.v2At < this.lastHitAt + (this.pingMs ?? 150) / 2 + 50;
      if (before && this.phase === 'live') mine = Math.max(0, (this.serverNow() - this.lastHitAt) / 1000);
      else if (c[0] > 0) mine = c[0] + el;
    }
    return [Math.min(CAMP_S, mine), c[1] > 0 ? Math.min(CAMP_S, c[1] + el) : 0];
  }

  // Secondes de ballon bloqué : celles du serveur, avancées depuis son état (la sienne redescend
  // comme chez le serveur, pinClock, dès que le ballon prédit n'est plus coincé par son joueur)
  _pinNow(el) {
    const p = this.pinS;
    const mine = p[0] > 0 && !this.md ? Math.min(BLOCK_S, pinClock(p[0], pinnedBy(this.ball, this.me, 0), el)) : 0;
    return [mine, p[1] > 0 ? Math.min(BLOCK_S, p[1] + el) : 0];
  }

  // ─── Simulation locale ───────────────────────────────────────────

  _resetClock() {
    this.samples = [];
    this.offset = 0;
    this.hasClock = false;
    this.roughClock = false;
    this.pingMs = null;
  }

  _resetMatch() {
    this.seq = 0;
    this.ackedSeq = 0;
    this.sentHits = [];
    this.hitTimes = [];
    this.ackCheck = false;
    this.lastHitAt = -Infinity;
    this.lastHitPerf = -Infinity;
    this.lastHitFx = -Infinity;
    this.pendingHit = null;
    this.score = [0, 0];
    this.phase = 'count';
    this.phaseAt = null;
    // Durée inconnue jusqu'à `start.cd` ou au premier état (le dessin compte alors 3 s, l'écran ne
    // joue pas l'avant-match)
    this.countS = null;
    this.keep = null;
    this.ball = createBall();
    this.me = createPaddle(0);
    this.oppBuf = [];
    this.ballBuf = [];
    this.offsetBall = { x: 0, y: 0 };
    this.recalages = 0;
    this.refused = 0;
    this.flash = 0;
    this.acc = 0;
    this.inAcc = 0;
    this.simNow = 0;
    this.slowUntil = 0;
    this.gate = 0;
    this.goalSync = false;
    this.lateState = null;
    this.lastOppHitS = -Infinity;
    this.timeLeftMs = null;
    this.playedMs = 0;
    // Frappes refusées connues par `acc` (dernière frappe acceptée, état du serveur) : la plus
    // récente déjà traitée, et un recalage immédiat demandé
    this.refusedUpTo = 0;
    this.forceResync = false;
    this.hasAcc = false;
    // Affichage : ballon affiché à l'image d'avant (lissage de sortie), poids de la vue adverse à la
    // dernière image (diagnostic)
    this.shownPrev = null;
    this.viewWeight = 0;
    // Règlement v2 : événements du terrain (repère local), éclairs déjà annoncés, mode (`md`) lu et
    // celui du moteur, avertissements, chronos des fautes, prochain événement, heure de l'état qui
    // les a donnés, tireur du dernier penalty sifflé
    this.fld = [];
    this.bolts = new Set();
    this.md = null;
    this.engMode = undefined;
    this.warn = [0, 0];
    this.campS = [0, 0];
    this.pinS = [0, 0];
    this.nextEv = null;
    this.v2At = null;
    this.penShooter = null;
    // Effet du ballon : celui du ballon local (prédit) et celui du ballon affiché, chacun avec
    // l'heure (serveur) où il a commencé. `mine` : donné par ma propre frappe ; `quiet` : venu d'un
    // recalage qui défait ce que ma dernière frappe venait de faire (refusée ou jugée autrement par
    // le serveur) : pas d'éclat ; `prevKey` : effet d'avant
    this.fxLocal = { key: fxKeyOf(0, -1, 0), fx: FX_NONE, own: -1, start: -Infinity, mine: false, quiet: false, prevKey: fxKeyOf(0, -1, 0) };
    this.fxShown = { key: fxKeyOf(0, -1, 0), fx: FX_NONE, own: -1, air: 0, start: -Infinity };
    this.view = { ball: { ...this.ball, ...NO_FX }, opp: null };
  }

  /** Les messages de jeu (`in`, `hit`, `react`) peuvent partir : compte accepté, pas de reprise ni d'abandon. */
  _canPlay() {
    return !!this.ws && this.helloSeen && !this.resuming && !this.abandoning;
  }

  // Un pas de physique, dans l'ordre du serveur (contrat du règlement v2, section 2) : joueur (mode
  // du penalty ou du but en or), ballon avec les événements à l'heure du serveur du début du pas,
  // choc avec son joueur, `touchBall`, bords (cages décalées), `unpin`
  _step(slow) {
    const me = this.me;
    const b = this.ball;
    const mode = this.engMode;
    if (this.target) { me.tx = this.target.x; me.ty = this.target.y; } else { me.tx = me.x; me.ty = me.y; }
    if (movePaddle(me, 0, STEP, HUMAN_SPEED, mode)) {
      this.flash = 0.5;
      if (!this.taughtBox) { this.taughtBox = true; this.emit('toast', "Interdit d'entrer dans ta petite surface"); }
    }
    const ph = this.phase;
    if (ph === 'count' || ph === 'ready' || ph === 'pause' || ph === 'pen') { unpin(b, me, 0, mode); return; }
    if (ph === 'over') return;
    const v2 = this.rules === RULES_V2;
    const fld = v2 && this.fld.length ? this.fld : undefined;
    const t = this.simNow - STEP_MS;
    stepBall(b, STEP * slow, this._wallFx, fld, t);
    if (v2) this._noteLocalFx(false, false);
    if (ph !== 'live') return; // but : le ballon finit sa course au fond des filets, au ralenti
    // Joueur tel qu'il est au moment du choc (avant d'être reculé par `unpin`)
    const pad = { x: me.x, y: me.y, vx: me.vx, vy: me.vy };
    const v = collidePaddle(b, me, 0); // son propre joueur seulement
    // Règlement v2 : feu allumé par une frappe très forte, feu ou charge de l'adversaire éteints
    const touched = v > 0 && v2 ? touchBall(b, 0, v) : null;
    walls(b, null, fld ? goalOffsets(fld, t) : undefined); // ballon poussé contre un bord : remis dans le terrain
    unpin(b, me, 0, mode);
    if (v2) this._noteLocalFx(touched !== null, false);
    if (v > 0) this._onLocalHit(v, pad);
    this._flushHit();
  }

  // Effet du ballon local changé (prédiction, recalage) : noté avec son heure (serveur) et l'effet
  // d'avant (`prevKey`)
  _noteLocalFx(mine, quiet) {
    const b = this.ball;
    const fx = b.fx || FX_NONE;
    const own = fx ? (b.own === 0 || b.own === 1 ? b.own : -1) : -1;
    const key = fxKeyOf(fx, own, b.air);
    const L = this.fxLocal;
    if (key === L.key) return;
    this.fxLocal = { key, fx, own, start: this.simNow > 0 ? this.simNow : this.serverNow(), mine, quiet, prevKey: L.key };
  }

  // Envoi des frappes. Chaque `hit` est l'instantané d'un choc : position et vitesse de son joueur.
  // Le PREMIER choc d'une série part tout de suite : le serveur le refait sur son ballon, qui ne
  // contient encore aucun choc de la série. Pendant une poussée (le joueur, plus rapide que le
  // ballon, le touche plusieurs pas de suite), le plus récent part dès HIT_GAP_MS si le joueur va
  // vite, sinon toutes les HIT_HOLD_MS ; celui de la fin de la poussée part dès que son délai est
  // passé. Jamais plus de HIT_RATE_MAX par seconde glissante.
  _flushHit() {
    const snap = this.pendingHit;
    if (!snap) return;
    // Trop près de la frappe précédente (le serveur la refuserait) : une plus récente la remplace,
    // sinon elle est abandonnée (presque le même choc que celui déjà parti)
    if (snap.at - this.lastHitAt < HIT_GAP_MS) {
      if (this.simNow - snap.at > HIT_HOLD_MS) this.pendingHit = null;
      return;
    }
    const wait = snap.speed > FAST_PUSH_SPEED ? HIT_GAP_MS : HIT_HOLD_MS;
    if (this.simNow - this.lastHitAt >= wait && this._hitBudget()) this._sendHit(snap);
  }

  /** Frappes envoyées dans la dernière seconde : encore de la place sous HIT_RATE_MAX ? */
  _hitBudget() {
    const now = performance.now();
    const times = this.hitTimes;
    while (times.length && now - times[0] >= 1000) times.shift();
    return times.length < HIT_RATE_MAX;
  }

  _onLocalHit(v, pad) {
    const b = this.ball;
    const now = performance.now();
    if (now - this.lastHitFx >= 60) {
      this.lastHitFx = now;
      const dx = b.x - pad.x;
      const dy = b.y - pad.y;
      const d = Math.hypot(dx, dy) || 1;
      this.emit('hit', { v, x: b.x - (dx / d) * BR, y: b.y - (dy / d) * BR, mine: true });
    }
    if (this.phase !== 'live') return;
    // Instantané du moment du choc, dans le repère du serveur
    const snap = {
      at: this.simNow,
      p: this._flip(pad.x, pad.y),
      pv: this._flipV(pad.vx, pad.vy),
      speed: Math.hypot(pad.vx, pad.vy),
    };
    const gap = snap.at - this.lastHitAt;
    if (gap >= HIT_HOLD_MS && this._hitBudget()) this._sendHit(snap); // premier choc d'une série
    else if (gap >= HIT_GAP_MS) this.pendingHit = snap; // poussée : le plus récent attend son tour
  }

  // Frappe : position et vitesse de son joueur au moment du choc (avant `unpin`), heure du serveur
  // estimée, EN PLEINE PRÉCISION : le serveur refait le choc avec ces valeurs, et l'angle du choc
  // amplifie toute erreur (mesure de S1 du 29 oct. 2026 : 0,07 unité d'écart sans arrondi, jusqu'à
  // 8 unités après quelques rebonds avec les arrondis du prototype v1). ~150 octets.
  _sendHit(snap) {
    // Jamais avant `hello` ni pendant une reprise (fermeture 1008) : le serveur n'en ferait rien
    if (!this._canPlay()) { this.pendingHit = null; return; }
    this.seq += 1;
    this._send({
      t: 'hit',
      n: this.seq,
      at: snap.at,
      p: [snap.p.x, snap.p.y],
      pv: [snap.pv.vx, snap.pv.vy],
    });
    this.sentHits.push({ n: this.seq, at: snap.at });
    if (this.sentHits.length > 32) this.sentHits.shift();
    this.hitTimes.push(performance.now());
    this.lastHitAt = snap.at;
    this.lastHitPerf = performance.now();
    this.pendingHit = null;
  }

  // Tant que la dernière frappe n'est pas acquittée, le ballon du serveur ne la contient pas encore.
  // Passé ce délai, la frappe est tenue pour refusée (ou perdue) et le téléphone se recale.
  _ackWait() {
    return Math.max(300, (this.pingMs ?? 150) * 2 + 150);
  }

  /** Heure (serveur) de ma plus ancienne frappe pas encore prise en compte (ou pas encore partie). */
  _firstUnackedAt() {
    const h = this.sentHits.find((x) => x.n > this.ackedSeq);
    if (h) return h.at;
    return this.pendingHit ? this.pendingHit.at : Infinity;
  }

  /** Une de mes frappes attend encore d'être prise en compte par le serveur. */
  _hitPending() {
    if (this.pendingHit) return true;
    return this.ackedSeq < this.seq && performance.now() - this.lastHitPerf < this._ackWait();
  }

  // ─── Affichage : moitié adverse au même instant que l'adversaire ─────

  _computeView(dt) {
    // Retard de la vue adverse : un demi-aller-retour plus un intervalle d'état, suivi en douceur
    const target = clampN((this.pingMs ?? (VIEW_DEFAULT_MS - STATE_GAP_MS) * 2) / 2 + STATE_GAP_MS, VIEW_MIN_MS, VIEW_MAX_MS);
    this.viewDelay += (target - this.viewDelay) * Math.min(1, dt * 2);
    const tView = this.serverNow() - this.viewDelay;
    const b = this.ball;
    let x = b.x + this.offsetBall.x;
    let y = b.y + this.offsetBall.y;
    const live = this.ui.status === 'match' && this.phase === 'live';
    // Vue adverse coupée seulement quand elle arrive à l'heure d'une de mes frappes que les états
    // reçus ne contiennent pas encore (avant, elle montre un passé juste)
    const gateTarget = live && !(this._hitPending() && tView >= this._firstUnackedAt()) ? 1 : 0;
    this.gate += (gateTarget - this.gate) * Math.min(1, dt / GATE_TAU);
    if (this.gate < 0.001) this.gate = 0;
    const opp = this._oppAt(tView);
    let d = null;
    let w = 0;
    if (live) {
      d = this.gate > 0 ? this._ballAt(tView) : null;
      if (d) {
        const band = Math.max(BAND_MIN, (this.viewDelay / 1000) * BAND_PER_S);
        w = this._oppWeight(x, y, band, opp) * this.gate; // 1 chez l'adversaire
        x += (d.x - x) * w;
        y += (d.y - y) * w;
      }
      this.viewWeight = w;
      this._fireOppHits(tView);
      // Pas de saut : au-delà de ce que le ballon peut faire en une image (+ SHOW_EXCESS u/s), le
      // ballon affiché rattrape à cette vitesse ; sauf ballon qui file vers une ligne de but, tout près
      const prev = this.shownPrev;
      if (prev) {
        const dx = x - prev.x;
        const dy = y - prev.y;
        const dist = Math.hypot(dx, dy);
        const allowed = (BALL_MAX + SHOW_EXCESS) * dt;
        // Vers une ligne de but : le ballon affiché y va (dy), ou le ballon local y file (vy)
        const down = dy > 0 || b.vy > 0;
        const up = dy < 0 || b.vy < 0;
        const nearGoal = (down && (y > H - URGENT_DIST || prev.y > H - URGENT_DIST))
          || (up && (y < URGENT_DIST || prev.y < URGENT_DIST));
        if (dist > allowed && dist < SHOW_SNAP && !nearGoal) {
          x = prev.x + (dx * allowed) / dist;
          y = prev.y + (dy * allowed) / dist;
        }
      }
      // Ligne de but : le ballon affiché n'entre dans une cage qu'au `goal` du serveur (cages qui
      // bougent : celle du bas à l'heure présente, celle du haut à l'heure de la vue adverse)
      let dB = 0;
      let dT = 0;
      if (this.fld.length) {
        const gB = goalOffsets(this.fld, this.serverNow());
        const gT = goalOffsets(this.fld, tView);
        dB = gB ? gB[0] : 0;
        dT = gT ? gT[1] : 0;
      }
      if ((y > H && x > GL + dB && x < GR + dB) || (y < 0 && x > GL + dT && x < GR + dT)) y = clampN(y, 0, H);
      this.shownPrev = { x, y };
    } else {
      this.shownPrev = null;
      this.viewWeight = 0;
    }
    const fx = this.rules === RULES_V2 ? this._shownFx(live, w, d, dt, x, y) : NO_FX;
    this.view.ball = { x, y, vx: b.vx, vy: b.vy, roll: b.roll, fx: fx.fx, own: fx.own, air: fx.air };
    this.view.opp = opp;
  }

  /**
   * Poids de la vue adverse (0 : ballon prédit au présent, 1 : ballon au même instant que
   * l'adversaire) pour un ballon en (x, y). Jeu normal : moitié adverse (en haut), bande autour de la
   * ligne médiane. Penalty : même bande autour du milieu entre la ligne du gardien et le point de
   * penalty. But en or : selon le joueur le plus proche (soi au présent, l'adversaire affiché) ; avec
   * deux joueurs chacun dans sa moitié, c'est la ligne médiane.
   */
  _oppWeight(x, y, band, opp) {
    const mode = this.engMode;
    if (mode && mode.k === 'gold' && opp) {
      const dMe = Math.hypot(x - this.me.x, y - this.me.y);
      const dOp = Math.hypot(x - opp.x, y - opp.y);
      return smooth(clampN(((dMe - dOp) / 2 + band) / (2 * band), 0, 1));
    }
    const u = clampN((y - (this._midY() - band)) / (2 * band), 0, 1);
    return 1 - smooth(u);
  }

  /** Frontière entre sa zone et celle de l'adversaire (repère local) : ligne médiane, ou celle du penalty. */
  _midY() {
    const mode = this.engMode;
    if (mode && mode.k === 'pen') return (keeperLine(1 - mode.s) + penaltySpot(mode.s).y) / 2;
    return H / 2;
  }

  /** Ballon (repère local) que l'adversaire peut avoir frappé à l'heure de l'état `op` (sa position). */
  _inOppReach(x, y, op) {
    const mode = this.engMode;
    if (mode && mode.k === 'gold') return !!op && Math.hypot(x - op.x, y - op.y) < OPP_REACH_GOLD;
    return y < this._midY() + PR;
  }

  /**
   * Effet du ballon affiché (règlement v2). Il suit l'horloge qui domine l'affichage (vue adverse si
   * w ≥ 0,5, sinon le ballon prédit), mais ne revient jamais à un état plus ancien que celui déjà
   * montré : une horloge en retard (la vue adverse avant ma frappe, ou un ballon prédit avant le
   * recalage) n'éteint ni ne rallume rien. Chaque changement montré donne son événement, une fois.
   * Hors jeu (engagement, penalty posé, pause, but), il reprend celui du ballon local, sans éclat.
   */
  _shownFx(live, w, d, dt, x, y) {
    const shown = this.fxShown;
    const L = this.fxLocal;
    if (!live) {
      const b = this.ball;
      const air = b.air > 0 ? b.air : 0;
      if (shown.key !== L.key) this.fxShown = { key: L.key, fx: L.fx, own: L.own, air, start: Math.max(shown.start, L.start) };
      else shown.air = air;
      return this.fxShown;
    }
    const src = w >= 0.5 && d && d.fxKey !== undefined
      ? { key: d.fxKey, fx: d.fx, own: d.own, air: d.air, start: d.fxStart, quiet: false }
      : { key: L.key, fx: L.fx, own: L.own, air: this.ball.air > 0 ? this.ball.air : 0, start: L.start, quiet: L.quiet };
    if (src.key !== shown.key && src.start > shown.start) {
      const next = { key: src.key, fx: src.fx, own: src.own, air: src.air, start: src.start };
      this.fxShown = next;
      if (!src.quiet) this._emitFx(shown, next, x, y);
      return next;
    }
    if (src.key === shown.key) {
      shown.air = src.air;
      return shown;
    }
    // Source en retard : l'état montré reste ; un bond montré retombe tout seul au bout de HOP_S
    if (shown.key % 2 === 1) {
      shown.air = Math.max(0, shown.air - dt);
      if (shown.air <= 0) {
        this.fxShown = { key: fxKeyOf(FX_NONE, -1, 0), fx: FX_NONE, own: -1, air: 0, start: shown.start + HOP_S * 1000 };
        return this.fxShown;
      }
    }
    return shown;
  }

  // Événements nés d'un changement de l'effet du ballon affiché (contrat du règlement v2, section 6)
  _emitFx(a, b, x, y) {
    const airA = a.key % 2 === 1;
    const airB = b.key % 2 === 1;
    if (airB && !airA) this.emit('short', { x, y });
    else if (b.fx === FX_FIRE && (a.fx !== FX_FIRE || a.own !== b.own)) this.emit('fire', { x, y });
    else if (b.fx === FX_ELEC && a.fx !== FX_ELEC) this.emit('charge', { x, y });
    else if (b.fx === FX_NONE && a.fx !== FX_NONE && !airB) this.emit('douse', { x, y, was: a.fx });
  }

  // Ballon du serveur à l'heure `t` (repère local), interpolé entre deux états ; au-delà du
  // dernier état, amené jusqu'à `t` (250 ms au plus, avec les événements). Effet du ballon
  // (règlement v2) : celui de l'état d'avant `t`, avec l'heure où il a commencé (`fxStart`)
  _ballAt(t) {
    const buf = this.ballBuf;
    if (!buf.length) return null;
    const last = buf[buf.length - 1];
    if (t >= last.s) {
      const c = { x: last.x, y: last.y, vx: last.vx, vy: last.vy, roll: 0, fx: last.fx, own: last.own, air: last.air };
      if (last.ph === 'live') {
        const fld = this.fld.length ? this.fld : undefined;
        advanceBall(c, Math.min(0.25, (t - last.s) / 1000), null, fld, last.s);
      }
      if (!c.fx) c.own = -1;
      c.fxKey = fxKeyOf(c.fx || FX_NONE, c.own, c.air);
      c.fxStart = c.fxKey === last.fxKey ? last.fxStart : t;
      return c;
    }
    if (t <= buf[0].s) return buf[0];
    for (let i = buf.length - 1; i > 0; i--) {
      const a = buf[i - 1];
      if (a.s <= t) {
        const e = buf[i];
        const k = e.s > a.s ? (t - a.s) / (e.s - a.s) : 1;
        return {
          x: a.x + (e.x - a.x) * k,
          y: a.y + (e.y - a.y) * k,
          fx: a.fx,
          own: a.own,
          air: a.air > 0 ? Math.max(0, a.air - (t - a.s) / 1000) : 0,
          fxKey: a.fxKey,
          fxStart: a.fxStart,
        };
      }
    }
    return last;
  }

  // Frappe adverse : étincelles et son quand la vue adverse arrive à l'état qui la montre
  _fireOppHits(t) {
    for (const e of this.ballBuf) {
      if (e.hit && !e.fired && e.s <= t) {
        e.fired = true;
        if (t - e.s < 200) this.emit('hit', { v: e.hit, x: e.x, y: e.y, mine: false });
      }
    }
  }

  // ─── Repère ──────────────────────────────────────────────────────

  _flip(x, y) { return this.you === 1 ? flipPoint(x, y) : { x, y }; }

  _flipV(vx, vy) { return this.you === 1 ? flipVel(vx, vy) : { vx, vy }; }

  // Ballon d'un état (repère local) ; règlement v2 : effet, camp qui l'a donné (tourné pour le
  // joueur 1) et bond, lus dans les valeurs 5 à 7 (absentes : ballon sans effet)
  _ballIn(b) {
    const p = this._flip(num(b[0]), num(b[1]));
    const v = this._flipV(num(b[2]), num(b[3]));
    const c = { x: p.x, y: p.y, vx: v.vx, vy: v.vy, roll: this.ball.roll, fx: FX_NONE, own: -1, air: 0 };
    if (this.rules === RULES_V2 && b.length >= 7) {
      const fx = Number(b[4]);
      c.fx = fx === FX_FIRE || fx === FX_ELEC ? fx : FX_NONE;
      c.own = c.fx ? this._sideIn(b[5]) : -1;
      c.air = clampN(num(b[6]), 0, HOP_S);
    }
    return c;
  }

  /** Camp du serveur (0, 1) vu de ce téléphone (0 = soi) ; -1 pour tout le reste. */
  _sideIn(v) {
    const n = Number(v);
    if (n !== 0 && n !== 1) return -1;
    return n === this.you ? 0 : 1;
  }

  _pair(arr) {
    return [num(arr[this.you]), num(arr[1 - this.you])];
  }

  _oppAt(t) {
    const buf = this.oppBuf;
    if (!buf.length) return null;
    if (t <= buf[0].s) return buf[0];
    const last = buf[buf.length - 1];
    if (t >= last.s) return last;
    for (let i = buf.length - 1; i > 0; i--) {
      const a = buf[i - 1];
      if (a.s <= t) {
        const b = buf[i];
        const k = b.s > a.s ? (t - a.s) / (b.s - a.s) : 1;
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
    }
    return last;
  }

  // ─── Messages du serveur ─────────────────────────────────────────

  _onMessage(m) {
    switch (m.t) {
      case 'hello': this._onHello(m); break;
      case 'pong': this._onPong(m); break;
      case 'room': this._onRoom(m); break;
      case 'invite': this._onInvite(m); break;
      case 'declined': if (this.ui.status === 'room') this._fail('declined'); break;
      case 'waiting_opponent': this._onWaitingOpponent(m); break;
      case 'start': this._onStart(m); break;
      case 'state': this._onState(m); break;
      case 'goal': this._onGoal(m); break;
      case 'pause': this._onPause(m); break;
      case 'time_left': this._onTimeLeft(m); break;
      case 'end': this._onEnd(m); break;
      case 'opp_left': this._onOppLeft(); break;
      case 'react':
        if (m.r === 0 || m.r === 1 || m.r === 2) this.emit('react', { r: m.r, mine: false });
        break;
      case 'error': this._onError(m.code); break;
      // Règlement v2 (jamais envoyés sans `start.rules`, ignorés sinon)
      case 'ev': this._onEv(m); break;
      case 'ev_end': this._onEvEnd(m); break;
      case 'foul': this._onFoul(m); break;
      case 'pen_end': this._onPenEnd(m); break;
      case 'gold': this._onGold(); break;
      default: break;
    }
  }

  /** Message du règlement v2 utilisable : match en cours, en règlement v2. */
  _v2Live() {
    return this.ui.status === 'match' && this.rules === RULES_V2;
  }

  // Événements reçus (`ev.e`, `start.evs`) : lus, tournés pour le joueur 1, rangés par `id`
  _eventIn(raw) {
    const e = eventOrNull(raw);
    if (!e) return null;
    return this.you === 1 ? flipEvent(e) : e;
  }

  // Rangé par `id` : un combo du serveur (`makeEvents` : orage ou gel avec l'arrosage, mêmes heures,
  // identifiants qui se suivent) arrive en deux `ev` de suite, gardés et appliqués ensemble
  _onEv(m) {
    if (!this._v2Live()) return;
    const e = this._eventIn(m.e);
    if (!e) return;
    const list = this.fld.filter((x) => x.id !== e.id);
    list.push(e);
    while (list.length > FLD_MAX) list.shift();
    this.fld = list;
    this.emit('event', { e });
  }

  // Fin d'un événement avant son heure (penalty, but en or) : il s'arrête maintenant ; le dessin le
  // retire en douceur (il ne figure plus dans `events`)
  _onEvEnd(m) {
    if (!this._v2Live()) return;
    const id = Number(m.id);
    const e = this.fld.find((x) => x.id === id);
    if (!e) return;
    const now = this.serverNow();
    if (now < e.until) {
      this.fld = this.fld.map((x) => (x.id === id ? { ...x, until: Math.max(x.an, now), at: Math.min(x.at, Math.max(x.an, now)) } : x));
    }
    this.emit('event_end', { id });
  }

  // Faute (`side` : le fautif ; `w` : ses avertissements après la faute ; `pen` : penalty donné)
  _onFoul(m) {
    if (!this._v2Live()) return;
    const side = this._sideIn(m.side);
    if (side < 0) return;
    const k = m.k === 'camp' || m.k === 'block' || m.k === 'keep' ? m.k : null;
    if (!k) return;
    const warn = clampN(Math.round(num(m.w)), 0, 99);
    const pen = m.pen === true;
    this.warn = side === 0 ? [warn, this.warn[1]] : [this.warn[0], warn];
    if (pen) this.penShooter = 1 - side;
    this.emit('foul', { side, k, warn, pen });
  }

  _onPenEnd(m) {
    if (!this._v2Live()) return;
    const r = m.r === 'goal' || m.r === 'saved' || m.r === 'missed' ? m.r : null;
    if (r) this.emit('pen_end', { r });
  }

  _onGold() {
    if (!this._v2Live()) return;
    this.emit('gold', {});
  }

  // Événements à l'heure `now` (serveur) : éclairs annoncés une fois, événements finis oubliés
  _tickEvents(now) {
    for (const e of this.fld) {
      if (e.k !== 'storm' || now < e.an) continue;
      e.b.forEach((s, i) => {
        if (now < s[2]) return;
        const id = `${e.id}:${i}`;
        if (this.bolts.has(id)) return;
        this.bolts.add(id);
        if (now - s[2] < BOLT_LATE_MS) this.emit('bolt', { x: s[0], y: s[1] });
      });
    }
    const cut = now - FLD_KEEP_MS;
    if (this.fld.some((e) => e.until <= cut)) this.fld = liveEvents(this.fld, cut);
  }

  _onPong(m) {
    const now = performance.now();
    const c = Number(m.c);
    const s = Number(m.s);
    if (!Number.isFinite(c) || !Number.isFinite(s)) return;
    const rtt = now - c;
    if (rtt < 0 || rtt > 15000) return;
    this.lastPongAt = now;
    this.samples.push({ rtt, offset: s - (c + rtt / 2) });
    if (this.samples.length > CLOCK_SAMPLES) this.samples.shift();
    // Écart pris sur l'échantillon au plus court aller-retour ; ping affiché = médiane
    let best = this.samples[0];
    for (const x of this.samples) if (x.rtt < best.rtt) best = x;
    this.offset = best.offset;
    this.hasClock = true;
    const sorted = this.samples.map((x) => x.rtt).sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    this.pingMs = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  _onRoom(m) {
    // Salle d'attente reprise après une coupure (`resume {link}`) : même salle, même code
    const back = this.resuming?.kind === 'room';
    if (this.ui.status !== 'connecting' && !back) return;
    clearTimeout(this.timers.reply);
    if (back) this._endResume();
    const link = cleanChallengeLink(m.link);
    if (link) this.link = link;
    // `photo` : celle d'un client défié depuis la liste des joueurs (jamais d'un barber)
    const inv = m.invited && typeof m.invited === 'object'
      ? { name: String(m.invited.name || '').slice(0, 60), role: String(m.invited.role || 'barber'), photo: photoUrlOrNull(m.invited.photo) }
      : null;
    this._set({
      status: 'room',
      code: String(m.code ?? '').replace(/\D/g, '').slice(0, 8),
      link: this.link,
      side: Number(m.side) === 1 ? 1 : 0,
      invited: inv || (back ? this.ui.invited : null),
      // Le code garde sa durée d'origine après une reprise
      roomAt: back && this.ui.roomAt ? this.ui.roomAt : Date.now(),
      reconnecting: false,
      waitingFor: back ? this.ui.waitingFor : null,
    });
  }

  // Salle rejointe pendant que son créateur est parti un instant (il partageait le lien depuis une
  // autre app) : le serveur attend son retour, puis envoie `start` aux deux
  _onWaitingOpponent(m) {
    if (this.ui.status !== 'room' && this.ui.status !== 'connecting') return;
    clearTimeout(this.timers.reply);
    const name = String(m?.name || this.ui.invite?.from?.name || '').slice(0, 60);
    this._set({ waitingFor: { name: name || null } });
  }

  _onInvite(m) {
    // `photo` : celle du client qui défie (serveur du 29 oct. 2026 au soir), jamais d'un barber
    const from = { name: String(m.from?.name || '').slice(0, 60), role: String(m.from?.role || 'user'), photo: photoUrlOrNull(m.from?.photo) };
    const link = cleanChallengeLink(m.link);
    const secs = clampN(Number(m.expires_in) || 120, 0, 600);
    if (this.ui.status === 'connecting' && this.lastAction?.t === 'peek') {
      clearTimeout(this.timers.reply);
      this._set({ status: 'invite', invite: { link: link || this.lastAction.link, from, expiresAt: Date.now() + secs * 1000 } });
      return;
    }
    // Défi reçu par un barber qui a le jeu ouvert (contrat 4.4 : `invite` sur ses sockets) : dans
    // sa salle d'attente ou sur l'écran de fin, l'écran « Défi reçu » s'affiche par-dessus. Jamais
    // en plein match (le serveur ne défie pas un barber qui joue) ni sur un autre défi.
    if (!link || link === this.link || this.ui.incoming) return;
    if (this.ui.status !== 'room' && this.ui.status !== 'over') return;
    this._set({ incoming: { link, from, expiresAt: Date.now() + secs * 1000 } });
    this.emit('invite', { link, from });
  }

  // Rejoint la salle d'un défi (`invite` : { link, from, expiresAt }), sur la connexion ouverte
  _joinInvite(invite) {
    const action = { t: 'join', link: invite.link };
    this.lastAction = action;
    this.link = action.link;
    // Le nom du défiant reste connu (« En attente de … » si le serveur attend son retour)
    const keep = { invite: { link: invite.link, from: invite.from, expiresAt: invite.expiresAt } };
    if (!this._send(action)) { this._begin(action, keep); return; }
    this._set({ ...IDLE_UI, status: 'connecting', ...keep });
    clearTimeout(this.timers.reply);
    this.timers.reply = setTimeout(() => {
      if (this.ui.status === 'connecting') this._fail('unreachable');
    }, REPLY_TIMEOUT);
  }

  _onStart(m) {
    clearTimeout(this.timers.reply);
    const you = Number(m.you) === 1 ? 1 : 0;
    const both = (arr) => (Array.isArray(arr) ? [String(arr[you] ?? ''), String(arr[1 - you] ?? '')] : ['', '']);
    const info = {
      side: you,
      names: both(m.names),
      roles: both(m.roles),
      keys: both(m.keys),
      // Photos des clients (serveur du 29 oct. 2026) ; absentes d'un serveur plus ancien : initiales
      photos: Array.isArray(m.photos) ? [photoUrlOrNull(m.photos[you]), photoUrlOrNull(m.photos[1 - you])] : [null, null],
      // true / false ; null quand le serveur de salles ne sait pas (toujours null avec le serveur v2 :
      // l'écran n'affiche rien d'après lui, la fin du match fait foi)
      rankedHint: m.ranked_hint === true ? true : m.ranked_hint === false ? false : null,
      // Règlement du match : v2 seulement si le serveur le dit (`rules: 2`, `gw` buts pour gagner)
      rules: m.rules === RULES_V2 ? RULES_V2 : 1,
      goalsToWin: m.rules === RULES_V2
        ? (Number.isInteger(m.gw) && m.gw >= 1 && m.gw <= 20 ? m.gw : GOALS_TO_WIN_V2)
        : GOALS_TO_WIN,
    };
    this.rules = info.rules;
    this.goalsToWin = info.goalsToWin;
    this.lastStateAt = performance.now();
    // Salle d'attente reprise, puis l'adversaire qui attendait : c'est le coup d'envoi du match
    const roomBack = this.resuming?.kind === 'room';
    if (roomBack) this._endResume();
    // Reprise après une coupure (`start.resume`, ou `start` renvoyé en plein match) : le match
    // continue tel quel, avec le score du serveur (`start.sc`)
    if (!roomBack && (this.resuming || this.ui.status === 'match' || (m.resume === true && this.ui.status !== 'over'))) {
      const wasResuming = !!this.resuming;
      this._endResume();
      clearPendingResume();
      this.you = you;
      if (Array.isArray(m.sc) && m.sc.length === 2) this.score = this._pair(m.sc);
      // Frappes perdues pendant la coupure : plus rien à attendre du serveur (ni de ses refus)
      this.ackedSeq = this.seq;
      this.refusedUpTo = Math.max(this.refusedUpTo, this.seq);
      this.pendingHit = null;
      this.sentHits = [];
      this.lateState = null;
      // Règlement v2 : événements encore en cours chez le serveur (`evs`) ; le mode, les
      // avertissements et les chronos arrivent avec le premier état
      this._eventsFromStart(m);
      this._set({ ...info, status: 'match', reconnecting: false, away: null, error: null });
      if (wasResuming) this.emit('resumed', { ...info, score: [...this.score] });
      return;
    }
    this.you = you;
    this._resetMatch();
    this._eventsFromStart(m);
    this.countS = countOf(m.cd); // 4,5 : avant-match dès cette image
    // Temps de la phase compté dès maintenant si l'heure du serveur est connue ; sinon à partir du
    // premier état : l'heure arrivée entre-temps (pong) le faisait sauter, et la caméra avec
    this.phaseAt = this.hasClock || this.roughClock ? { pt: 0, s: this.serverNow() } : null;
    if (!this.fingerDown) this.target = null;
    this._set({
      ...info,
      status: 'match',
      result: null,
      rematchAsked: false,
      oppGone: false,
      rematchNote: null,
      offline: false,
      away: null,
      reconnecting: false,
      incoming: null,
      waitingFor: null,
      timeWarn: false,
      error: null,
    });
    this.emit('start', info);
  }

  // `start.evs` (reprise en règlement v2) : événements dont la fin n'est pas passée chez le serveur
  _eventsFromStart(m) {
    this.fld = [];
    if (this.rules !== RULES_V2 || !Array.isArray(m.evs)) return;
    for (const raw of m.evs.slice(0, FLD_MAX)) {
      const e = this._eventIn(raw);
      if (e && !this.fld.some((x) => x.id === e.id)) this.fld.push(e);
    }
  }

  // Champs du règlement v2 d'un état (heure `s`) : mode, avertissements, chronos des fautes,
  // prochain événement ; tableaux rangés [moi, adversaire]
  _readV2State(m, s) {
    const md = Array.isArray(m.md) ? m.md : null;
    if (md && md[0] === 'pen' && this._sideIn(md[1]) >= 0) {
      const sh = this._sideIn(md[1]);
      const left = Number(md[2]);
      this.md = { k: 'pen', s: sh, left: Number.isFinite(left) && left >= 0 ? clampN(left, 0, 30) : -1 };
      if (!this.engMode || this.engMode.k !== 'pen' || this.engMode.s !== sh) this.engMode = { k: 'pen', s: sh };
    } else if (md && md[0] === 'gold') {
      this.md = { k: 'gold', left: clampN(num(md[1]), 0, 600) };
      if (!this.engMode || this.engMode.k !== 'gold') this.engMode = { k: 'gold' };
    } else {
      this.md = null;
      this.engMode = undefined;
    }
    if (Array.isArray(m.w) && m.w.length === 2) this.warn = this._pair(m.w).map((v) => clampN(Math.round(v), 0, 99));
    this.campS = Array.isArray(m.cp) && m.cp.length === 2 ? this._pair(m.cp).map((v) => clampN(v, 0, 60)) : [0, 0];
    this.pinS = Array.isArray(m.pk) && m.pk.length === 2 ? this._pair(m.pk).map((v) => clampN(v, 0, 60)) : [0, 0];
    this.nextEv = Array.isArray(m.ne) && m.ne.length >= 2 && fin(m.ne[0]) && fin(m.ne[1])
      ? { left: clampN(m.ne[0], 0, 600), total: clampN(m.ne[1], 0, 600) }
      : null;
    this.v2At = s;
  }

  _onState(m) {
    if (this.ui.status !== 'match') return;
    this.lastStateAt = performance.now();
    const s = Number(m.s);
    if (!Number.isFinite(s)) return;
    // Repli tant qu'aucun pong n'est revenu : l'état est daté d'à peu près maintenant
    if (!this.hasClock && !this.roughClock) { this.offset = s - performance.now(); this.roughClock = true; }

    const prev = this.phase;
    const prevMode = this.md;
    const ph = typeof m.ph === 'string' ? m.ph : prev;
    this.phase = ph;
    // `pt` / `kt` : secondes écoulées dans la phase / ballon dans la moitié `k`, à l'heure `s`
    this.phaseAt = { pt: num(m.pt), s };
    // `cd` : durée du compte à rebours en cours (secondes) ; absente d'un serveur plus ancien : 3 s
    if (ph === 'count') this.countS = countOf(m.cd) ?? COUNT_S;
    this.keep = { kt: num(m.kt), s };
    if (Array.isArray(m.sc) && m.sc.length === 2) this.score = this._pair(m.sc);
    if (ph !== 'pause' && this.ui.away) this._set({ away: null });
    // Mode lu avant le changement de phase : le penalty pose son joueur d'après le tireur
    if (this.rules === RULES_V2) this._readV2State(m, s);
    if (ph !== prev) this._onPhase(prev, ph, prevMode);

    // Adversaire : gardé ~1 s pour l'interpolation
    const op = Array.isArray(m.p) ? m.p[1 - this.you] : null;
    if (Array.isArray(op) && Number.isFinite(Number(op[0])) && Number.isFinite(Number(op[1]))) {
      const last = this.oppBuf[this.oppBuf.length - 1];
      if (last && s < last.s) this.oppBuf = [];
      const q = this._flip(Number(op[0]), Number(op[1]));
      this.oppBuf.push({ s, x: q.x, y: q.y });
      if (this.oppBuf.length > 40) this.oppBuf.shift();
    }

    this._onAck(
      Array.isArray(m.ack) ? num(m.ack[this.you]) : 0,
      Array.isArray(m.acc) ? num(m.acc[this.you]) : null,
    );
    this._bufferBall(m, s, ph);
    this._reconcile(m, s, ph);
    // But : une fois le ballon du serveur au fond des filets, le ballon local s'y recale
    if (ph === 'goal' && this.goalSync && Array.isArray(m.b) && m.b.length >= 4) {
      this.goalSync = false;
      this._resyncTo(this._ballIn(m.b));
    }
  }

  // Mes frappes acquittées : les états reçus avant, datés d'après la première d'entre elles, ne la
  // contenaient pas (le serveur l'a rejouée depuis) ; la vue adverse ne doit plus s'en servir.
  // `acc` (dernière frappe ACCEPTÉE) : les frappes de (acc, ack] ont été refusées. Les frappes
  // suivantes partaient d'un ballon qui contenait la frappe refusée (refus en cascade, banc du 29 oct.
  // 2026) : on n'attend plus rien d'elles, le ballon du serveur est repris tout de suite (une parade
  // refusée ne reste jamais à l'écran).
  _onAck(ack, acc = null) {
    if (acc != null) {
      this.hasAcc = true;
      if (ack > acc && ack > this.refusedUpTo) {
        this.refused += Math.max(0, ack - Math.max(acc, this.refusedUpTo, this.ackedSeq));
        this.refusedUpTo = ack;
        this.forceResync = true;
        this.ackedSeq = this.seq;
        this.sentHits = [];
        this.pendingHit = null;
        this.ackCheck = false;
        return;
      }
    }
    if (!(ack > this.ackedSeq)) return;
    const first = this.sentHits.find((h) => h.n > this.ackedSeq && h.n <= ack);
    if (first) this.ballBuf = this.ballBuf.filter((e) => e.s <= first.at);
    this.sentHits = this.sentHits.filter((h) => h.n > ack);
    this.ackedSeq = ack;
    this.ackCheck = true;
  }

  _bufferBall(m, s, ph) {
    if (!Array.isArray(m.b) || m.b.length < 4) return;
    const q = this._ballIn(m.b);
    const buf = this.ballBuf;
    let last = buf[buf.length - 1];
    if (last && s < last.s) { this.ballBuf = []; last = null; }
    const e = { s, x: q.x, y: q.y, vx: q.vx, vy: q.vy, ph, fx: q.fx, own: q.own, air: q.air, fxKey: fxKeyOf(q.fx, q.own, q.air), fxStart: s };
    // Frappe adverse : vitesse changée d'un coup, à sa portée (sa moitié ; près de lui en but en or),
    // loin des bords et des poteaux, et pas au moment d'une de mes frappes (le ballon peut toucher mon
    // joueur près de la ligne médiane), ni ballon qui vient d'être chargé par la foudre (× 1,3)
    if (last && ph === 'live' && last.ph === 'live' && Math.abs(s - this.lastHitAt) > 200) {
      const dv = Math.hypot(q.vx - last.vx, q.vy - last.vy);
      const op = this.oppBuf[this.oppBuf.length - 1];
      const charged = q.fx === FX_ELEC && last.fx !== FX_ELEC;
      const awayFromEnds = this.engMode ? q.y < H - BR - 8 : true;
      if (dv > OPP_HIT_DV && !charged && this._inOppReach(q.x, q.y, op) && q.y > BR + 8 && awayFromEnds
        && q.x > BR + 8 && q.x < W - BR - 8) {
        e.hit = dv * 0.5;
        this.lastOppHitS = s;
        this._repairOppHit(last, e);
      }
    }
    // Effet du ballon : heure où il a commencé (premier état qui le montre)
    const prev = this.ballBuf[this.ballBuf.length - 1];
    if (prev && prev.fxKey === e.fxKey) e.fxStart = prev.fxStart;
    this.ballBuf.push(e);
    while (this.ballBuf.length > 2 && this.ballBuf[0].s < s - VIEW_BUFFER_MS) this.ballBuf.shift();
  }

  // Frappe adverse apparue dans l'état F : les états reçus juste avant (dont S) ont été envoyés
  // avant que le serveur la connaisse, ils montrent le ballon qui file à travers l'adversaire.
  // L'instant du choc est là où les deux trajectoires se croisent (droite de S, droite de F
  // remontée dans le temps) : les états postérieurs sont retirés et un point de choc les remplace.
  // La vue adverse passe alors directement du ballon d'avant au ballon renvoyé.
  _repairOppHit(S, F) {
    const tS = (S.s - F.s) / 1000; // ≤ 0
    // Écart entre les deux droites : A + B·t (t en secondes, 0 = F)
    const ax = S.x - S.vx * tS - F.x;
    const ay = S.y - S.vy * tS - F.y;
    const bx = S.vx - F.vx;
    const by = S.vy - F.vy;
    const bb = bx * bx + by * by;
    if (bb < 1) return;
    const t = clampN(-(ax * bx + ay * by) / bb, -0.3, 0);
    const sHit = F.s + t * 1000;
    this.ballBuf = this.ballBuf.filter((x) => x.s <= sHit);
    const last = this.ballBuf[this.ballBuf.length - 1];
    if (!last || sHit - last.s > 0.5) {
      // Point du choc : effet du ballon d'après la frappe (feu éteint ou allumé par l'adversaire)
      const fxStart = last && last.fxKey === F.fxKey ? last.fxStart : sHit;
      this.ballBuf.push({
        s: sHit, x: F.x + F.vx * t, y: F.y + F.vy * t, vx: F.vx, vy: F.vy, ph: F.ph, hit: F.hit, fired: false,
        fx: F.fx, own: F.own, air: F.air, fxKey: F.fxKey, fxStart,
      });
      F.hit = 0;
    }
  }

  _onPhase(prev, ph, prevMode = null) {
    if (ph === 'count' || ph === 'ready' || ph === 'pen') {
      // Engagement : chacun chez soi, le doigt reprend la main aussitôt (comme le prototype). Aussi au
      // retour d'une pause : prise en plein jeu, le serveur réengage pour celui qui est resté (on ne
      // gèle plus un tir en coupant sa connexion, contrat section 7) ; prise pendant un engagement,
      // le ballon était déjà posé. Le serveur ne déplace jamais les joueurs : il suit les `in`.
      // Penalty (règlement v2) : même chose, son joueur posé sur sa place du penalty (gardien au
      // milieu de sa ligne, tireur derrière le ballon)
      const shooter = ph === 'pen' ? (this.md?.k === 'pen' ? this.md.s : this.penShooter) : null;
      if (ph === 'pen' && (shooter === 0 || shooter === 1)) {
        const spot = penaltyPlace(0, shooter);
        this.me.x = spot.x;
        this.me.y = spot.y;
        this.me.vx = 0;
        this.me.vy = 0;
      } else homePaddle(this.me, 0);
      if (!this.fingerDown) this.target = null;
      this.offsetBall.x = 0;
      this.offsetBall.y = 0;
      this.pendingHit = null;
      this.ballBuf = [];
      // Ballon gardé 5 s en jeu normal (pas la fin d'un penalty arrêté ou raté)
      if (prev === 'live' && ph === 'ready' && !prevMode) this.emit('toast', 'Ballon gardé 5 s : il change de camp');
      // Engagement : `kickoff` ; penalty : `penalty {s}` (tireur local), comme LocalMatch
      if (ph === 'pen') {
        this.penShooter = null;
        this.emit('penalty', { s: shooter === 0 || shooter === 1 ? shooter : null });
      } else this.emit('kickoff');
    }
  }

  _reconcile(m, s, ph) {
    if (!Array.isArray(m.b) || m.b.length < 4) return;
    // But : le ballon finit sa course au ralenti sur ce téléphone, le serveur réengage ensuite
    if (ph === 'goal' || ph === 'over') return;
    // Frappe pas encore prise en compte par le serveur (ou pas encore partie : frappes
    // rapprochées) : son ballon ne la contient pas. Sauf frappe refusée (`acc`) : recalage tout de suite
    const force = this.forceResync;
    if (!force) {
      if (this.pendingHit) return;
      const ack = Array.isArray(m.ack) ? num(m.ack[this.you]) : 0;
      if (ack < this.seq && performance.now() - this.lastHitPerf < this._ackWait()) return;
    }

    // « Maintenant » = l'heure où en est le ballon local (dernier pas de la simulation). Les
    // messages arrivent entre deux frames : amener l'état du serveur à l'heure réelle le mettrait
    // jusqu'à une frame (17 ms, ~10 unités) en avance sur le ballon local.
    const copy = this._ballIn(m.b);
    const raw = { x: copy.x, y: copy.y };
    if (ph === 'live') {
      const at = this.simNow > 0 ? this.simNow : this.serverNow();
      const ageMs = at - s;
      // État plus récent que le dernier pas simulé (faible latence : il arrive entre deux frames,
      // jusqu'à une frame en avance) : le comparer tel quel ferait un faux recalage d'une frame, puis
      // l'inverse à l'état suivant. Il attend que la simulation l'ait rattrapé (frame suivante).
      if (ageMs < -GRID_EPS_MS && this.simNow > 0) {
        this.lateState = { m, s, ph };
        return; // (un recalage forcé attend avec lui)
      }
      if (ageMs > 0) {
        // Pas entiers depuis l'état du serveur (sa grille), et la simulation locale s'y cale : son
        // heure passe sur le pas le plus proche (≤ 2 ms, rattrapés à la frame suivante). Le petit
        // écart de position qui en résulte est lissé comme un recalage, une fois.
        const steps = Math.min(Math.round(ageMs / STEP_MS), Math.round(600 / STEP_MS));
        // Avec les événements du terrain, à leur heure (celle de l'état, puis pas à pas)
        advanceBall(copy, steps * STEP, null, this.fld.length ? this.fld : undefined, s);
        const e = ageMs - steps * STEP_MS;
        if (this.simNow > 0 && Math.abs(e) > GRID_EPS_MS && Math.abs(e) < STEP_MS) {
          this.acc += e / 1000;
          this.simNow -= e;
        }
      }
    }

    this.forceResync = false;
    if (ph !== 'live') {
      // Engagement, penalty posé, pause : ballon arrêté là où le serveur le pose
      this._setBall(copy);
      this.offsetBall.x = 0;
      this.offsetBall.y = 0;
      if (this.rules === RULES_V2) this._noteLocalFx(false, false);
      return;
    }

    const dx = this.ball.x - copy.x;
    const dy = this.ball.y - copy.y;
    const err = Math.hypot(dx, dy);
    const check = this.ackCheck;
    this.ackCheck = false;
    // Règlement v2 : l'effet du ballon (feu, charge, bond) suit le serveur même quand la position
    // concorde. Sans éclat seulement quand le serveur défait exactement ce que ma dernière frappe
    // venait de faire (frappe refusée, ou jugée autrement : premier état après son acquittement)
    if (this.rules === RULES_V2) {
      const b = this.ball;
      if ((b.fx || 0) !== copy.fx || (copy.fx && b.own !== copy.own) || (b.air > 0) !== (copy.air > 0)) {
        const L = this.fxLocal;
        const undoMine = L.mine && L.prevKey === fxKeyOf(copy.fx, copy.own, copy.air)
          && (this.simNow > 0 ? this.simNow : this.serverNow()) - L.start < this._ackWait() + 200;
        const quiet = (force || check) && undoMine;
        b.fx = copy.fx;
        b.own = copy.own;
        b.air = copy.air;
        this._noteLocalFx(false, quiet);
      } else if (copy.air > 0) b.air = copy.air;
    }
    if (err <= SNAP_EPS) return;
    // Le ballon du serveur a changé de vitesse dans la moitié adverse (à la portée de l'adversaire),
    // ou juste après une frappe adverse vue dans les états (le ballon a pu déjà repasser la ligne
    // médiane) : frappe de l'adversaire, attendue (ce n'est pas un recalage)
    const dv = Math.hypot(copy.vx - this.ball.vx, copy.vy - this.ball.vy);
    // (but en or : ballon de l'état, comparé à l'adversaire du même état)
    const op = this.oppBuf[this.oppBuf.length - 1];
    const zone = this.engMode && this.engMode.k === 'gold' ? raw : copy;
    const oppHit = dv > OPP_HIT_DV && (this._inOppReach(zone.x, zone.y, op) || s - this.lastOppHitS < 400);
    // Première comparaison après l'acquittement de ma frappe : le serveur ne l'a pas prise (estimation
    // pour un serveur sans `acc` ; avec `acc`, les refus sont comptés exactement par _onAck)
    if (!this.hasAcc && check && !oppHit && dv > OPP_HIT_DV && err > RESYNC_EPS) this.refused += 1;
    // On prend l'état du serveur ; l'affichage garde l'écart, qui fond en ~80 ms (pas de saut)
    if (err < SMOOTH_MAX) {
      this.offsetBall.x += dx;
      this.offsetBall.y += dy;
    } else {
      this.offsetBall.x = 0;
      this.offsetBall.y = 0;
    }
    this._setBall(copy);
    if (err > RESYNC_EPS && !oppHit) this.recalages += 1;
  }

  _setBall(copy) {
    this.ball.x = copy.x;
    this.ball.y = copy.y;
    this.ball.vx = copy.vx;
    this.ball.vy = copy.vy;
    // Règlement v2 : effet du ballon (absent : sans effet)
    this.ball.fx = copy.fx || FX_NONE;
    this.ball.own = copy.fx ? copy.own : -1;
    this.ball.air = copy.air > 0 ? copy.air : 0;
  }

  // Ballon local posé sur `copy` ; l'affichage repart de là où il était et glisse jusqu'à lui
  _resyncTo(copy) {
    const shown = this.view.ball;
    this._setBall(copy);
    const dx = shown.x - copy.x;
    const dy = shown.y - copy.y;
    if (Math.hypot(dx, dy) < GOAL_SMOOTH_MAX) {
      this.offsetBall.x = dx;
      this.offsetBall.y = dy;
    } else {
      this.offsetBall.x = 0;
      this.offsetBall.y = 0;
    }
  }

  _onGoal(m) {
    if (this.ui.status !== 'match') return;
    const scorer = Number(m.by) === this.you ? 0 : 1;
    if (Array.isArray(m.sc) && m.sc.length === 2) this.score = this._pair(m.sc);
    const v2 = this.rules === RULES_V2;
    // Règlement v2 : valeur du but (2 pour un ballon électrique) et effet du ballon au franchissement
    const value = v2 && Number(m.v) === 2 ? 2 : 1;
    const fx = v2 && (Number(m.fx) === FX_FIRE || Number(m.fx) === FX_ELEC) ? Number(m.fx) : FX_NONE;
    // Le serveur a le dernier mot : le ballon local se recale sur son dernier ballon, amené jusqu'à
    // la ligne (un défenseur ne voit plus « BUT ! » avec le ballon hors de sa cage), puis sur le
    // ballon au fond des filets au premier état du but
    const last = this.ballBuf[this.ballBuf.length - 1];
    if (last) {
      const c = { x: last.x, y: last.y, vx: last.vx, vy: last.vy, fx: last.fx, own: last.own, air: last.air };
      if (last.ph === 'live') advanceBall(c, clampN((this.serverNow() - last.s) / 1000, 0, 0.3), null, this.fld.length ? this.fld : undefined, last.s);
      if (v2) {
        c.fx = fx;
        if (!fx) c.own = -1;
      }
      this._resyncTo(c);
    }
    this.goalSync = true;
    this.phase = 'goal';
    this.phaseAt = { pt: 0, s: this.serverNow() };
    this.slowUntil = performance.now() + GOAL_SLOW_MS;
    this.pendingHit = null;
    this.emit('goal', { scorer, score: [...this.score], value, fx });
  }

  _onPause(m) {
    if (this.ui.status !== 'match') return;
    const away = Number(m.away);
    if (away === this.you) return; // ce téléphone est bien là
    const left = clampN(num(m.left), 0, 30);
    this.phase = 'pause';
    this.pendingHit = null;
    this._set({ away: { until: Date.now() + left * 1000 } });
    this.emit('pause', { left });
  }

  // 30 s avant la limite de 5 min de jeu effectif (contrat, section 7) : bandeau « 30 s »
  _onTimeLeft(m) {
    if (this.ui.status !== 'match') return;
    const s = Number(m.s);
    if (!Number.isFinite(s)) return;
    this.timeLeftMs = clampN(s, 0, 600) * 1000;
    if (!this.ui.timeWarn) this._set({ timeWarn: true });
    this.emit('time_left', { s: Math.ceil(clampN(s, 0, 600)) });
  }

  /**
   * Points de la fin du match, vus de ce téléphone (null : pas encore confirmés par le serveur).
   * `end.points` est personnel (contrat, section 7) : `delta` par côté, `total`, `rank` et
   * `rank_before` (place avant le match) à soi. Une ancienne forme par côté (`total: [p0, p1]`)
   * est encore lue.
   */
  _points(p) {
    if (!p || typeof p !== 'object') return null;
    const mine = (v) => (Array.isArray(v) ? numOrNull(v[this.you]) : numOrNull(v));
    const place = (v) => {
      const n = mine(v);
      return n != null && n >= 1 ? Math.round(n) : null;
    };
    const delta = Array.isArray(p.delta) ? [numOrNull(p.delta[this.you]), numOrNull(p.delta[1 - this.you])] : [numOrNull(p.delta), null];
    return {
      ranked: p.ranked === true,
      reason: p.reason ? String(p.reason).slice(0, 40) : null,
      delta: delta[0] ?? 0,
      oppDelta: delta[1] ?? 0,
      total: mine(p.total),
      rank: place(p.rank),
      rankBefore: place(p.rank_before),
    };
  }

  _onEnd(m) {
    if (this.ui.status !== 'match') return;
    if (Array.isArray(m.sc) && m.sc.length === 2) this.score = this._pair(m.sc);
    const cancelled = m.cancelled === true;
    const reason = typeof m.reason === 'string' && m.reason ? m.reason.slice(0, 40) : null;
    const w = m.winner === null || m.winner === undefined ? null : Number(m.winner);
    const winner = cancelled || (w !== 0 && w !== 1) ? null : (w === this.you ? 0 : 1);
    this._finish({
      won: winner === 0,
      winner,
      // Temps écoulé à égalité (`time_limit_draw`) : match nul, sans points
      draw: !cancelled && winner === null,
      score: [...this.score],
      forfeit: m.forfeit === true,
      cancelled,
      reason,
      points: this._points(m.points),
      abandoned: !!this.abandoning,
    });
  }

  // Abandon sans `end` du serveur à temps (ou connexion déjà perdue) : défaite par forfait, ou match
  // annulé avant 20 s de jeu effectif ; les points viendront du classement
  _abandonFallback() {
    if (!this.abandoning || this.ui.status !== 'match') return;
    const cancelled = this.playedMs < CANCEL_PLAY_MS;
    this._finish({
      won: false,
      winner: cancelled ? null : 1,
      draw: false,
      score: [...this.score],
      forfeit: true,
      cancelled,
      reason: cancelled ? 'cancelled' : null,
      points: null,
      abandoned: true,
    });
  }

  _finish(result) {
    const abandoned = !!this.abandoning;
    this.abandoning = false;
    clearTimeout(this.abandonTimer);
    this.phase = 'over';
    this.pendingHit = null;
    this.goalSync = false;
    this.timeLeftMs = null;
    this._endResume();
    clearPendingResume();
    // Après un abandon, le serveur a détaché ce téléphone : plus de revanche, connexion fermée
    if (abandoned) this._teardown();
    this._set({
      status: 'over', result, rematchAsked: false, away: null, timeWarn: false, reconnecting: false, abandoning: false,
      ...(abandoned ? { offline: true } : {}),
    });
    this.emit('end', result);
  }

  _onOppLeft() {
    const st = this.ui.status;
    if (this.abandoning) return;
    // Après la fin : l'autre joueur est parti, plus de revanche (l'écran de fin reste)
    if (st === 'over') { this._set({ oppGone: true, rematchAsked: false, rematchNote: null }); return; }
    if (st === 'match' || st === 'room') {
      if (this.ws && this.ws.readyState === 1) this._send({ t: 'leave' });
      this._fail('opp_left');
    }
  }

  _onError(code) {
    const kind = errorKind(code);
    if (this.abandoning) return; // la fin du match (ou son repli) arrive
    const r = this.resuming;
    if (r?.kind === 'room') {
      if (kind === 'no_room' || kind === 'room_expired') {
        // Invité parti un instant (sa place n'est plus gardée) : il rejoint de nouveau par le lien
        if (this.ui.side === 1 && this.link && !r.rejoined) {
          r.rejoined = true;
          this._send({ t: 'join', link: this.link });
          return;
        }
        this._fail(kind === 'no_room' && this.ui.side === 1 ? 'no_room' : 'room_expired');
        return;
      }
      if (FATAL_KINDS.has(kind) || ['rate_limited', 'already_playing', 'server_full', 'blocked', 'salon_vs_salon'].includes(kind)) this._fail(kind, code);
      return;
    }
    if (r) {
      // Reprise refusée : le match n'existe plus (forfait prononcé, serveur redémarré)
      if (kind === 'no_room' || kind === 'room_expired') { this._fail('match_over'); return; }
      if (FATAL_KINDS.has(kind)) this._fail(kind, code);
      return;
    }
    const status = this.ui.status;
    if (status === 'connecting' || status === 'room' || status === 'invite') { this._fail(kind, code); return; }
    // Fin du match : l'écran de fin reste ; seule la revanche devient impossible
    if (status === 'over') {
      if (kind === 'server_full') {
        this._set({ rematchAsked: false });
        this.emit('toast', ERRORS.server_full.message);
      } else if (kind === 'idle') {
        this._set({ rematchAsked: false, offline: true });
      } else {
        this._set({ rematchAsked: false, oppGone: true, rematchNote: REMATCH_NOTES[kind] || null });
      }
      return;
    }
    // Match en cours : seuls les codes connus ferment l'écran (accès retiré, autre appareil,
    // salle expirée, panne) ; un code inconnu est ignoré
    if (kind !== 'server') this._fail(kind, code);
  }

  _onClose(e) {
    const status = this.ui.status;
    const opened = this.opened;
    const kind = CLOSE_KINDS[e?.code];
    const fatal = !!kind && FATAL_KINDS.has(kind);
    this._teardown();
    // Abandon en cours : le serveur a détaché ce téléphone sans fin du match, on la fait ici
    if (this.abandoning) { this._abandonFallback(); return; }
    if (this.resuming) {
      if (fatal) { this._fail(kind); return; }
      this._scheduleResume();
      return;
    }
    if (status === 'error' || status === 'idle') return;
    // Fin du match : l'écran de fin (et les points) reste ; plus de revanche possible
    if (status === 'over') { this._set({ offline: true, rematchAsked: false, incoming: null }); return; }
    if (status === 'match') {
      if (fatal) { this._fail(kind); return; }
      if (this.link) { this._startResume('match', { reason: 'cut' }); return; }
      this._fail('lost');
      return;
    }
    // Salle d'attente : le serveur la garde (code et lien compris) ; on la reprend
    if (status === 'room' && !kind && this.link) { this._startResume('room', { reason: 'cut' }); return; }
    // Défi reçu : l'écran reste ; « Accepter » rouvrira une connexion avec le `join`
    if (status === 'invite' && !kind) return;
    if (kind) { this._fail(kind); return; }
    if (!opened || status === 'connecting' || status === 'room' || status === 'invite') { this._fail('unreachable'); return; }
    this._fail('lost');
  }

  // ─── Reprise après une coupure ───────────────────────────────────

  /**
   * Reprise par `resume {link}` : en plein match (`kind` 'match', 10 s chez le serveur) ou dans la
   * salle d'attente ('room', jusqu'à l'expiration du code). `connect: false` : la page est cachée,
   * la connexion attendra son retour au premier plan. `serverUntil` : fin de la place gardée par
   * le serveur (match quitté, heure de l'appareil).
   */
  _startResume(kind, { connect = true, reason = 'cut', serverUntil = null } = {}) {
    const now = Date.now();
    const deadline = kind === 'room'
      ? (this.ui.roomAt || now) + ROOM_MS
      : Math.max(now + RESUME_TRY_MS, serverUntil || 0);
    if (deadline <= now) { this._fail(kind === 'room' ? 'room_expired' : 'match_over'); return; }
    this.resuming = {
      kind,
      link: this.link,
      deadline,
      serverUntil: kind === 'match' ? (serverUntil || now + SERVER_RESUME_MS) : null,
      waiting: !connect,
      rejoined: false,
    };
    if (kind === 'match') {
      // Ballon figé sur ce téléphone jusqu'au retour
      this.phase = 'pause';
      this.pendingHit = null;
    }
    this._set({ reconnecting: reason });
    this.emit('reconnecting', { kind, reason });
    if (connect) this._connect();
  }

  _scheduleResume() {
    const r = this.resuming;
    if (!r || r.waiting) return;
    const left = r.deadline - Date.now();
    if (left <= 0) { this._fail(r.kind === 'room' ? 'room_expired' : 'lost'); return; }
    clearTimeout(this.resumeTimer);
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = null;
      if (this.resuming && !this.resuming.waiting) this._connect();
    }, Math.min(RESUME_RETRY_MS, left));
  }

  _endResume() {
    clearTimeout(this.resumeTimer);
    this.resumeTimer = null;
    this.resuming = null;
  }

  _stopAbandon() {
    clearTimeout(this.abandonTimer);
    this.abandonTimer = null;
    this.abandoning = false;
  }

  /** Match en cours sur ce téléphone (ou en reprise), pas encore fini ni abandonné. */
  _inPlay() {
    return this.ui.status === 'match' && this.phase !== 'over' && !!this.link && !this.abandoning;
  }

  // Lien du match gardé pour une reprise après un départ de l'écran (10 s, place gardée par le serveur)
  _remember() {
    const until = this.resuming?.kind === 'match' && this.resuming.serverUntil
      ? this.resuming.serverUntil
      : Date.now() + SERVER_RESUME_MS;
    writePendingResume({
      link: this.link,
      until,
      you: this.you,
      names: this.ui.names,
      roles: this.ui.roles,
      keys: this.ui.keys,
      photos: this.ui.photos,
      score: [...this.score],
      rules: this.rules,
      goalsToWin: this.goalsToWin,
    });
  }

  // Page cachée (autre app, écran verrouillé) ou revenue au premier plan
  _visibilityChanged() {
    if (typeof document === 'undefined' || this.abandoning) return;
    if (document.hidden) {
      const r = this.resuming;
      if (r) {
        // Reprise en cours : elle attendra le retour au premier plan
        r.waiting = true;
        clearTimeout(this.resumeTimer);
        this._teardown();
        if (r.kind === 'match') this._remember();
        return;
      }
      if (this._inPlay()) {
        // Téléphone en arrière-plan : il ne répondrait plus (iOS fige la page). On ferme exprès : le
        // serveur met le match en pause (10 s pour revenir) au lieu de jouer contre un joueur figé
        this._teardown();
        this._startResume('match', { connect: false, reason: 'hidden' });
        this._remember();
        return;
      }
      if (this.ui.status === 'room' && this.ui.side === 0 && this.link && !this.ui.incoming) {
        // Salle d'attente (lien partagé depuis une autre app) : le serveur la garde, un ami qui la
        // rejoint pendant ce temps attend notre retour (`waiting_opponent`)
        this._teardown();
        this._startResume('room', { connect: false, reason: 'hidden' });
      }
      return;
    }
    const r = this.resuming;
    if (r?.waiting) {
      r.waiting = false;
      if (Date.now() > r.deadline) { this._fail(r.kind === 'room' ? 'room_expired' : 'match_over'); return; }
      this._connect();
      return;
    }
    // Socket gardée en arrière-plan : on vérifie tout de suite qu'elle répond encore
    if (this.ws && this.helloSeen) {
      this.lastPongAt = performance.now();
      this.lastStateAt = performance.now();
      this._ping();
    }
  }

  // Surveillance : une socket « ouverte » qui ne transmet plus rien (réseau tombé sans fermeture)
  // est fermée par l'app, comme une coupure (reprise du match ou de la salle d'attente)
  _watch() {
    if (!this.ws || !this.opened || !this.helloSeen || this.resuming || this.abandoning) return;
    if (typeof document !== 'undefined' && document.hidden) return; // minuteries ralenties : rien de fiable
    const now = performance.now();
    if (this.ui.status === 'match' && this.phase !== 'over' && now - this.lastStateAt > STATE_SILENCE_MS) {
      this._onClose({ code: 1006 });
      return;
    }
    if (now - this.lastPongAt > PONG_SILENCE_MS) this._onClose({ code: 1006 });
  }

  // ─── Connexion ───────────────────────────────────────────────────

  _begin(action, keep = null) {
    this._endResume();
    this._stopAbandon();
    this._teardown();
    this._resetClock();
    this.lastAction = action;
    this.link = action.link || null;
    this._set({ ...IDLE_UI, status: 'connecting', ...(keep || {}) });
    this._connect();
  }

  _connect() {
    this.helloSeen = false;
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch {
      if (this.resuming) this._scheduleResume(); else this._fail('unreachable');
      return;
    }
    this.ws = ws;
    this.opened = false;
    const limit = this.resuming
      ? Math.max(500, Math.min(CONNECT_TIMEOUT, this.resuming.deadline - Date.now()))
      : CONNECT_TIMEOUT;
    this.timers.connect = setTimeout(() => {
      if (this.ws !== ws || this.opened) return;
      if (this.resuming) { this._teardown(); this._scheduleResume(); } else this._fail('unreachable');
    }, limit);
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.opened = true;
      clearTimeout(this.timers.connect);
      // Jeton jamais dans l'adresse (journaux du routeur Heroku) : premier message, avec la
      // version du protocole. Rien d'autre avant `hello` (le serveur fermerait).
      this._send({ t: 'auth', v: PROTOCOL_VERSION, token: this.getToken() || '' });
      this.timers.reply = setTimeout(() => {
        if (this.ws !== ws || this.helloSeen) return;
        if (this.resuming) { this._teardown(); this._scheduleResume(); } else if (this.ui.status === 'connecting') this._fail('unreachable');
      }, this.resuming ? RESUME_REPLY_MS : REPLY_TIMEOUT);
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m && typeof m === 'object') this._onMessage(m);
    };
    ws.onerror = () => { /* la fermeture suit */ };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this._onClose(e);
    };
  }

  // `hello` : compte accepté. La demande part alors (ou la reprise), puis les ping de l'horloge
  _onHello(m) {
    if (this.helloSeen) return;
    this.helloSeen = true;
    // Nom montré à l'adversaire (image du défi de la salle d'attente) : celui du serveur
    const myName = typeof m?.name === 'string' ? m.name.trim().slice(0, 60) : '';
    if (myName && myName !== this.ui.myName) this._set({ myName });
    clearTimeout(this.timers.reply);
    this.lastPongAt = performance.now();
    this.lastStateAt = performance.now();
    if (this.resuming) {
      // `resume` est réservé au créateur d'une salle d'attente (et aux deux joueurs d'un match) :
      // un invité qui a perdu sa connexion pendant l'attente a été retiré, il rejoint de nouveau
      const r = this.resuming;
      if (r.kind === 'room' && this.ui.side === 1) {
        r.rejoined = true;
        this._send({ t: 'join', link: r.link });
      } else {
        this._send({ t: 'resume', link: r.link });
      }
      const ws = this.ws;
      this.timers.reply = setTimeout(() => {
        if (this.ws === ws && this.resuming) { this._teardown(); this._scheduleResume(); }
      }, RESUME_REPLY_MS);
    } else {
      if (this.lastAction) this._send(this.lastAction);
      this.timers.reply = setTimeout(() => {
        if (this.ui.status === 'connecting') this._fail('unreachable');
      }, REPLY_TIMEOUT);
    }
    this._startPings();
  }

  _startPings() {
    let n = 0;
    const burst = () => {
      this._ping();
      n += 1;
      if (n < PING_BURST) this.timers.burst = setTimeout(burst, PING_BURST_GAP);
      else this.timers.ping = setInterval(() => this._ping(), PING_EVERY);
    };
    burst();
  }

  _ping() {
    this._send({ t: 'ping', c: r2(performance.now()) });
  }

  _send(msg) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    try {
      ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  // Erreur avant toute connexion (lien ou fiche vide)
  _failNow(kind, action) {
    this._endResume();
    this._teardown();
    this.lastAction = action;
    this._fail(kind);
  }

  _fail(kind, code) {
    // Erreur en plein match : rejouer le `join` d'origine ne peut que rater (salle fermée), et chaque
    // code raté compte dans le blocage du serveur (5 par minute) : retour à l'accueil, sans « Réessayer ».
    // Salle d'attente perdue : « Réessayer » en ouvre une autre (ou relance le défi).
    if (this.ui.status === 'match' || this.ui.status === 'over' || this.resuming?.kind === 'match') {
      this.lastAction = null;
      clearPendingResume();
    }
    this._endResume();
    this._stopAbandon();
    this._teardown();
    const def = ERRORS[kind] || ERRORS.server;
    const message = typeof def.message === 'function' ? def.message(this) : def.message;
    this._set({
      status: 'error',
      reconnecting: false,
      away: null,
      incoming: null,
      waitingFor: null,
      timeWarn: false,
      error: { kind, code: code ?? null, message, retry: def.retry && !!this.lastAction },
    });
  }

  _teardown() {
    clearTimeout(this.timers.connect);
    clearTimeout(this.timers.reply);
    clearTimeout(this.timers.burst);
    clearInterval(this.timers.ping);
    this.timers = {};
    const ws = this.ws;
    this.ws = null;
    this.opened = false;
    this.pendingHit = null;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try { ws.close(1000); } catch { /* déjà fermée */ }
    }
  }

  _set(patch) {
    this.ui = { ...this.ui, ...patch };
    try { this.onChange?.(this.ui); } catch { /* écran démonté */ }
  }
}
