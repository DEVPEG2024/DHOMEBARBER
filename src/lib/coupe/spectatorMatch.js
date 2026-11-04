/*
 * Spectateur d'un match de La Coupe du Gang : connexion `/ws/coupe` en protocole 3, sans jouer
 * (contrat : docs/fonctions/coupe-spectateurs-contrat.md, sections 1 et 4.1). Indépendant de React,
 * comme OnlineMatch. Sert la page « Regarder un match » (téléphone) et l'écran du salon (clé d'écran).
 *
 *   const sm = new SpectatorMatch({ screenKey = null, closeWhenDone, onChange: (ui) => …, onEvent: (type, data) => … });
 *   sm.watch({ m });   // match de tournoi (uuid du tableau) ; ou sm.watch({ w }) : match ordinaire.
 *                      // Un autre `watch` change de match sur la même socket (écran du salon)
 *   sm.cheer(0);       // réaction toute faite (0 « Allez ! », 1 « Quel but », 2 « Bravo », 3 « Oh non »),
 *                      // une toutes les 3,3 s (3 s du serveur, plus une marge pour l'écart du réseau)
 *   sm.unwatch();  sm.retry();  sm.destroy();
 *   // à chaque image : renderer.render(sm.getFrame(), dt) (WatchStage le fait)
 *
 * Connexion : `auth {token, v: 3, watch: true}` avec le jeton du compte (comme OnlineMatch), ou
 * `auth {screen: <clé>, v: 3}` pour l'écran du salon ; `hello` doit dire `watch: true` (sinon le
 * serveur ne connaît pas les spectateurs : `disabled`). Puis `watch {m}` ou `watch {w}` :
 *  - `wstart` : le match se regarde (`live`, `paused` pendant une pause) ;
 *  - `not_live` (match de tournoi pas encore commencé) : `waiting`, nouveau `watch` toutes les 5 s
 *    pendant 10 min (au-delà : `waitOver`, « Réessayer ») ; `rate_limited` : nouvel essai 10 s plus tard ;
 *  - `no_match` : `unavailable` ; `watch_full` et `server_full` : `full` ; `disabled` : `disabled`.
 * Coupure (socket fermée, ou muette : plus de `pong` depuis 6 s, plus d'état depuis 3 s en plein
 * match) : 3 essais de reconnexion (1, 2 puis 3 s), puis `offline` avec « Réessayer » (`retry`).
 * Écran coupé : seulement après `error screen_revoked` (`revoked`, plus rien n'est tenté ; décision
 * A1 du 4 nov. 2026) ; un 4401 seul est, pour un écran, une coupure comme une autre, et pour un
 * compte un jeton refusé (`offline` + `error: 'session'`, sans nouvel essai). 4429 (quota) : nouvel
 * essai 30 s plus tard, sans entamer les 3 essais rapides ; 4409 (`replaced`) : pour un écran, nouvel
 * essai 30 s plus tard ; pour un compte, `offline` + `replaced` (il regarde ailleurs). 4426
 * (`update_required`) : rien de plus. 4408 (socket restée 5 min sans match regardé) : reconnexion
 * sans compter d'essai si un match est encore demandé. Page cachée : la connexion est fermée (une
 * place de spectateur rendue), reprise au retour, sans compter d'essai ; `no_match` à la reprise
 * d'un match déjà vu en direct : `unavailable` avec `missed` (fini pendant l'absence), dernier
 * score gardé.
 *
 * Même match demandé de nouveau (`retry`, reprise, `watch` de l'écran) : noms, rôles, score, tour et
 * règle gardés jusqu'au `wstart`, image d'avant dessinée jusqu'au premier état. `closeWhenDone`
 * (vrai par défaut pour un compte, faux pour l'écran) : la socket se ferme après `wend`, un refus
 * définitif (`no_match`, `watch_full`, `disabled`), `unwatch` ou une attente trop longue (une place
 * sur 120 rendue) ; `watch` ou `retry` la rouvrent. L'écran du salon garde une seule socket et change
 * de match par `watch` (décision A2).
 *
 * Dessin : les `state` (un sur deux du serveur, ~15 par seconde, repère du serveur : joueur 0 en
 * bas) sont gardés 2 s ; l'image est celle de l'heure du serveur moins WATCH_DELAY_MS (200 ms),
 * horloge du serveur estimée par `ping` / `pong` (échantillon au plus court aller-retour, comme
 * OnlineMatch). Joueurs interpolés entre deux états ; ballon avancé par le moteur depuis l'état
 * d'avant (rebonds, événements du terrain) et recollé à l'état d'après (écart réparti, aucun
 * saut) ; au-delà du dernier état, avancé 250 ms au plus. `getFrame()` rend la même forme d'image
 * qu'OnlineMatch (renderer.js, effects.js), mais dans le repère du serveur (index 0 = joueur 0, en
 * bas, rouge). Règle d'aujourd'hui (`rules` 1, premier à 3) comme règlement v2 (`rules` 2).
 *
 * Messages du match (`goal`, `foul`, `pen_end`, `gold`, `shootout`, `pause`, `time_left`, `ev`,
 * `ev_end`, `wend`) appliqués à l'heure retardée : le bandeau d'un but part quand le ballon dessiné
 * entre dans la cage. `watchers` et `cheer` des autres spectateurs : tout de suite.
 *
 * `ui` (onChange) : { status: 'connecting' | 'waiting' | 'live' | 'paused' | 'ended' | 'unavailable'
 *   | 'full' | 'disabled' | 'offline' | 'revoked' | 'idle' (après unwatch), kind ('tour' | 'room' ;
 *   null avant le premier `wstart` de ce match), id, names [joueur 0, joueur 1], roles, sc [joueur 0,
 *   joueur 1], so ({ first, shots: [[…], […]] } | null), tour ({ tid, name, label, title } | null :
 *   `label` le tour, « Quart de finale », `title` le match, « Quart 1 », vide sur un serveur qui ne
 *   l'envoie pas), watchers, screen, ph (phase dessinée), rules, gw, result ({ winner, sc, reason,
 *   forfeit, so } | null), et en plus : mode ('pen' | 'gold' | null), penS (tireur), away ({ side,
 *   until } | null), timeWarn, waitOver, reconnecting, missed (`no_match` à la reprise d'un match vu en
 *   direct : fini pendant l'absence), error }.
 * Événements (onEvent et subscribe) : 'start' et 'resumed' (wstart), 'goal' ({ scorer, score,
 * value, fx }), 'foul' ({ side, k, warn, pen }), 'penalty' ({ s }), 'pen_end' ({ r }), 'gold',
 * 'shootout' ({ first }), 'ev' ({ e }), 'ev_end' ({ id }), 'kickoff', 'pause' ({ side, left }),
 * 'time_left' ({ s }), 'end' (result), 'cheer' ({ r, mine }).
 * Jamais d'exception qui remonte : messages illisibles ignorés, minuteries et rappels sous try.
 */
import {
  KEEP_LIMIT, GOALS_TO_WIN, GOALS_TO_WIN_V2, RULES_V2, FX_NONE, FX_FIRE, FX_ELEC, HOP_S, CAMP_S, BLOCK_S, EVENT_KINDS,
  createBall, advanceBall, goalOffsets, liveEvents, foulClock, inBigBox,
} from './engine.js';
import { getToken as readToken } from '@/api/apiClient';
import { coupeSocketUrl, PROTOCOL_VERSION } from './onlineMatch.js';
import { CHEERS, CHEER_GAP_MS, WATCH_DELAY_MS } from './watch.js';

// Horloge : 5 ping à 200 ms d'écart après `hello`, puis un toutes les 2 s ; 8 derniers échantillons
const PING_BURST = 5;
const PING_BURST_GAP = 200;
const PING_EVERY = 2000;
const CLOCK_SAMPLES = 8;
const CONNECT_TIMEOUT = 8000;
const REPLY_TIMEOUT = 8000;
// Reconnexion : 3 essais, puis « Connexion perdue » et « Réessayer »
const RETRY_DELAYS = [1000, 2000, 3000];
// Match de tournoi pas encore commencé : nouvel essai toutes les 5 s, 10 min au plus
const NOT_LIVE_EVERY_MS = 5000;
const NOT_LIVE_FOR_MS = 10 * 60 * 1000;
// `rate_limited` (10 `watch` par minute et par socket) : nouvel essai plus tard
const RATE_RETRY_MS = 10000;
// 4429 (quota d'authentification), 4409 d'un écran (`replaced`) : nouvel essai bien plus tard, sans
// entamer les 3 essais rapides (au salon, tout le monde partage une IP ; décision A3 du 4 nov. 2026)
const SLOW_RETRY_MS = 30000;
// Réactions : une toutes les 3 s chez le serveur (heure d'arrivée) ; marge pour un message parti
// plus vite que le précédent (vérification du 4 nov. 2026 : à 3 s tout juste, la deuxième arrivait
// un peu avant chez le faux serveur, qui l'ignorait)
const CHEER_MARGIN_MS = 300;
// Surveillance d'une socket muette ; file des messages vidée au même rythme quand rien ne se dessine
const TICK_MS = 100;
const PONG_SILENCE_MS = 6000;
const STATE_SILENCE_MS = 3000;
// États gardés (ms) ; ballon avancé au plus 250 ms au-delà du dernier état
const BUFFER_MS = 2000;
const EXTRA_S = 0.25;
// Règlement v2 : événements gardés 1,5 s après leur fin, 24 au plus ; tirs au but gardés par joueur
const FLD_KEEP_MS = 1500;
const FLD_MAX = 24;
const SO_MAX = 30;
// Identifiants : match de tournoi (uuid du serveur), match ordinaire (12 caractères, contrat 1.2)
const MID_RE = /^[A-Za-z0-9-]{1,64}$/;
const WID_RE = /^[a-z0-9]{12}$/;
// Saut du ballon au-delà duquel il ne « roule » pas (engagement, but)
const ROLL_JUMP = 120;

const NO_EVENTS = Object.freeze([]);
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round(v * 100) / 100;
const cleanText = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const countOf = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= 10 ? n : null; };
const intIn = (v, a, b) => clampN(Math.round(num(v)), a, b);
const pairOf = (arr, f) => (Array.isArray(arr) ? [f(arr[0]), f(arr[1])] : [f(null), f(null)]);
const sameShots = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Tirs d'un côté (`so[i]`) : 1 but, 0 raté ; null si illisible. */
function shotsOf(a) {
  if (!Array.isArray(a)) return null;
  return a.slice(-SO_MAX).map((v) => (v === 1 || v === true ? 1 : 0));
}

/** Premier tireur déduit des tirs (celui qui a un tir de plus), null sinon. */
const firstOf = (a, b) => (a.length !== b.length ? (a.length > b.length ? 0 : 1) : null);

// Liste de 1 à `max` tableaux d'au moins `n` nombres
const rows = (a, n, max) => Array.isArray(a) && a.length >= 1 && a.length <= max
  && a.every((r) => Array.isArray(r) && r.length >= n && r.slice(0, n).every(fin));

/**
 * Descripteur d'événement du serveur (contrat du règlement v2, section 3) recopié champ par champ,
 * ou null s'il est illisible (un champ manquant ferait des NaN dans le moteur). Même lecture
 * qu'OnlineMatch (eventOrNull, non exportée), sans rotation : le spectateur garde le repère du serveur.
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

/** Clé d'un match demandé, comparable à celle d'un `wstart` (`tour:<m>`, `room:<w>`). */
const keyOf = (t) => (t ? (t.m ? `tour:${t.m}` : `room:${t.w}`) : null);

/** Match à regarder d'après `{ m }` (match de tournoi) ou `{ w }` (match ordinaire), ou null. */
export function watchTargetOf(raw) {
  const m = String(raw?.m ?? '').trim();
  if (m && MID_RE.test(m)) return { m };
  const w = String(raw?.w ?? '').trim().toLowerCase();
  if (w && WID_RE.test(w)) return { w };
  return null;
}

/** `ui` de départ (rien de regardé encore). */
export const WATCH_IDLE_UI = Object.freeze({
  status: 'connecting',
  kind: null,
  id: null,
  names: [],
  roles: [],
  sc: [0, 0],
  so: null,
  tour: null,
  watchers: 0,
  screen: false,
  ph: null,
  rules: 1,
  gw: GOALS_TO_WIN,
  result: null,
  mode: null,
  penS: null,
  away: null,
  timeWarn: false,
  waitOver: false,
  reconnecting: false,
  missed: false,
  error: null,
});

// Messages du match appliqués à l'heure retardée (comme le dessin)
const DELAYED = new Set(['goal', 'foul', 'pen_end', 'gold', 'shootout', 'pause', 'time_left', 'ev', 'ev_end', 'wend']);

export class SpectatorMatch {
  constructor({ screenKey = null, closeWhenDone = null, onChange, onEvent, url = coupeSocketUrl(), getToken = readToken } = {}) {
    this.screenKey = typeof screenKey === 'string' && screenKey ? screenKey.slice(0, 200) : null;
    // Page « Regarder » : socket fermée quand plus rien n'est à regarder ; écran : une seule socket gardée
    this.closeWhenDone = typeof closeWhenDone === 'boolean' ? closeWhenDone : !this.screenKey;
    this.url = url;
    this.getToken = getToken;
    this.onChange = onChange || null;
    this.onEvent = onEvent || null;
    this.listeners = new Set();
    this.ui = { ...WATCH_IDLE_UI, status: 'idle' };
    this.ws = null;
    this.opened = false;
    this.helloSeen = false;
    this.timers = {};
    this.retryTimer = null;
    this.watchTimer = null;
    this.target = null; // match demandé ({ m } ou { w }), null quand plus rien n'est à regarder
    this.lastTarget = null; // pour « Réessayer »
    this.attempts = 0;
    this.notLiveSince = null;
    this.awaitingStart = false; // `watch` parti, réponse attendue
    this.watching = false; // entre `wstart` et `wend` (ou `unwatch`)
    this.ending = false; // `wend` reçu, appliqué à l'heure retardée
    this.suspended = false; // page cachée : connexion fermée exprès
    this.destroyed = false;
    this.lastPongAt = 0;
    this.lastStateAt = 0;
    this.lastCheerAt = -Infinity;
    this.matchKey = null;
    this._resetClock();
    this._resetMatch();
    this._onVisibility = () => { try { this._visibilityChanged(); } catch { /* jamais d'erreur */ } };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVisibility);
    this.tick = setInterval(() => { try { this._tick(); } catch { /* jamais d'erreur */ } }, TICK_MS);
  }

  // ─── Commandes ───────────────────────────────────────────────────

  /** Regarde un match : `{ m }` (match de tournoi) ou `{ w }` (match ordinaire). Remplace le précédent. */
  watch(raw) {
    if (this.destroyed) return;
    const target = watchTargetOf(raw);
    this._clearWaitTimers();
    this.notLiveSince = null;
    this.attempts = 0;
    this.watching = false;
    this.ending = false;
    // Même match déjà vu (`retry`, écran qui le redemande) : noms, score, tour et image d'avant gardés
    // jusqu'au `wstart` (décision A5) ; un autre match : tout repart de zéro
    const same = !!target && !!this.matchKey && keyOf(target) === this.matchKey;
    if (same) {
      this.queue = [];
      this.freshBuffer = true;
    } else {
      this._resetMatch();
      this.matchKey = null;
    }
    if (!target) {
      this.target = null;
      this._set({ ...WATCH_IDLE_UI, watchers: 0, status: 'unavailable' });
      return;
    }
    this.target = target;
    this.lastTarget = target;
    this._set(same
      ? { status: 'connecting', result: null, away: null, waitOver: false, reconnecting: false, missed: false, error: null }
      : { ...WATCH_IDLE_UI, status: 'connecting' });
    if (this.suspended) return; // la connexion repartira au retour au premier plan
    if (this._ready()) this._sendWatch();
    else if (!this.ws) this._connect();
    // (connexion en cours : `hello` enverra le `watch`)
  }

  /** Ne regarde plus rien (la socket reste ouverte : `watch` pour un autre match). */
  unwatch() {
    if (this.destroyed) return;
    if (this.closeWhenDone) this._teardown(); // une place de spectateur rendue
    else if (this._ready() && (this.target || this.watching)) this._send({ t: 'unwatch' });
    this.target = null;
    this.watching = false;
    this.ending = false;
    this.awaitingStart = false;
    this._clearWaitTimers();
    clearTimeout(this.timers.reply);
    this._resetMatch();
    this.matchKey = null;
    this._set({ ...WATCH_IDLE_UI, status: 'idle' });
  }

  /** Recommence après « Connexion perdue », « Trop de spectateurs » ou une attente trop longue. */
  retry() {
    if (this.destroyed || !this.lastTarget) return;
    const target = this.lastTarget;
    // Nouvelle connexion si l'ancienne n'est plus là (ou n'a jamais dit bonjour)
    if (!this._ready()) this._teardown();
    this.watch(target);
  }

  /**
   * Réaction toute faite (index de CHEERS), une toutes les 3 s, jamais pour l'écran du salon.
   * Rend true si elle est partie (l'événement 'cheer' { r, mine: true } la montre tout de suite).
   */
  cheer(r) {
    if (this.destroyed || this.screenKey) return false;
    if (!Number.isInteger(r) || r < 0 || r >= CHEERS.length) return false;
    if (!this.watching || (this.ui.status !== 'live' && this.ui.status !== 'paused')) return false;
    const now = performance.now();
    if (now - this.lastCheerAt < CHEER_GAP_MS + CHEER_MARGIN_MS) return false;
    if (!this._send({ t: 'cheer', r })) return false;
    this.lastCheerAt = now;
    this.emit('cheer', { r, mine: true });
    return true;
  }

  /** Millisecondes avant la prochaine réaction possible (0 : tout de suite). */
  cheerWaitMs() {
    return Math.max(0, CHEER_GAP_MS + CHEER_MARGIN_MS - (performance.now() - this.lastCheerAt));
  }

  /** Écouteur d'événements en plus de `onEvent` (WatchStage) ; rend la fonction qui le retire. */
  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** Écran fermé : plus rien n'est envoyé ni reçu. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    clearInterval(this.tick);
    this.tick = null;
    this._clearWaitTimers();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVisibility);
    if (this._ready() && this.watching) this._send({ t: 'unwatch' });
    this._teardown();
    this.target = null;
    this.onChange = null;
    this.onEvent = null;
    this.listeners.clear();
  }

  /** Heure du serveur estimée (ms). */
  serverNow() { return performance.now() + this.offset; }

  // ─── Image du match ──────────────────────────────────────────────

  /**
   * Image du match à l'heure du serveur moins 200 ms (null sans état reçu), même forme
   * qu'OnlineMatch.getFrame(), repère du serveur (index 0 : joueur 0, en bas). Les objets de l'image
   * sont réutilisés d'une image à l'autre (le dessin garde ses copies).
   */
  getFrame() {
    try {
      return this._frame();
    } catch {
      return null;
    }
  }

  _frame() {
    const buf = this.buf;
    if (!buf.length) return null;
    this._pump();
    const t = this.viewT;
    let i = buf.length - 1;
    while (i > 0 && buf[i].s > t) i -= 1;
    const a = buf[i];
    const b = a.s <= t && i + 1 < buf.length ? buf[i + 1] : null;
    const el = Math.max(0, (t - a.s) / 1000);
    const live = a.ph === 'live';
    const v2 = this.rules === RULES_V2;
    const F = this.fv;

    // Joueurs : interpolés entre les deux états
    const k = b && b.s > a.s ? clampN((t - a.s) / (b.s - a.s), 0, 1) : 0;
    const P = this.vpads;
    P[0].x = b ? a.p0x + (b.p0x - a.p0x) * k : a.p0x;
    P[0].y = b ? a.p0y + (b.p0y - a.p0y) * k : a.p0y;
    P[1].x = b ? a.p1x + (b.p1x - a.p1x) * k : a.p1x;
    P[1].y = b ? a.p1y + (b.p1y - a.p1y) * k : a.p1y;

    // Ballon
    this._ballAt(t, a, b, k);

    F.phase = a.ph;
    F.phaseT = a.pt + el;
    F.countS = a.ph === 'count' ? (a.cd ?? 3) : null;
    F.keepT = live ? Math.min(KEEP_LIMIT, a.kt + el) : 0;
    F.score = a.sc;
    F.flashBox = 0;
    F.ball = this.vball;
    F.paddles = P;
    F.timeLeft = this._timeLeft(t);
    F.rules = this.rules;
    F.goalsToWin = this.gw;
    F.now = t;
    if (v2) {
      const playEl = live ? el : 0;
      F.events = this._frameEvents(t);
      const g = this.fldGoals ? goalOffsets(this.fld, t) : null;
      if (g) {
        this.goalOffArr[0] = g[0];
        this.goalOffArr[1] = g[1];
        F.goalOff = this.goalOffArr;
      } else F.goalOff = null;
      F.mode = this._frameMode(a.md, playEl);
      F.warn[0] = a.w ? a.w[0] : this.warn[0];
      F.warn[1] = a.w ? a.w[1] : this.warn[1];
      // Chronos des fautes, avancés depuis l'état (jeu normal seulement)
      for (let s = 0; s < 2; s += 1) {
        const c = a.cp ? a.cp[s] : 0;
        const p = a.pk ? a.pk[s] : 0;
        F.camp[s] = c > 0 && live && !a.md ? Math.min(CAMP_S, foulClock(c, inBigBox(P[s], s), playEl)) : 0;
        F.pin[s] = p > 0 && live && !a.md ? Math.min(BLOCK_S, p + playEl) : 0;
      }
      if (a.ne) {
        F.next.left = Math.max(0, a.ne.left - playEl);
        F.next.total = a.ne.total;
        F.nextEvent = F.next;
      } else F.nextEvent = null;
    } else {
      F.events = NO_EVENTS;
      F.goalOff = null;
      F.mode = null;
      F.warn[0] = 0; F.warn[1] = 0; F.camp[0] = 0; F.camp[1] = 0; F.pin[0] = 0; F.pin[1] = 0;
      F.nextEvent = null;
    }
    return F;
  }

  // Ballon dessiné à l'heure `t` entre les états `a` et `b` (b absent : au-delà du dernier état)
  _ballAt(t, a, b, k) {
    const vb = this.vball;
    const fld = this.fld.length ? this.fld : undefined;
    let x;
    let y;
    let vx = a.bvx;
    let vy = a.bvy;
    if (a.ph === 'live') {
      // Avancé par le moteur depuis `a` (rebonds, événements), l'écart avec `b` réparti dans le temps :
      // une simple ligne droite quand rien ne gêne le ballon, aucun saut à l'arrivée de `b`
      const c = this._ballCopy(a, this.tmpBall);
      advanceBall(c, Math.min(b ? (b.s - a.s) / 1000 : EXTRA_S, Math.max(0, (t - a.s) / 1000)), null, fld, a.s);
      x = c.x;
      y = c.y;
      vx = c.vx;
      vy = c.vy;
      if (b && b.ph === 'live') {
        if (a.errFor !== b) {
          const e = this._ballCopy(a, this.tmpBall2);
          advanceBall(e, Math.max(0, (b.s - a.s) / 1000), null, fld, a.s);
          a.errFor = b;
          a.ex = b.bx - e.x;
          a.ey = b.by - e.y;
        }
        x += a.ex * k;
        y += a.ey * k;
      }
    } else if (b && (b.ph === a.ph || b.ph === 'live')) {
      x = a.bx + (b.bx - a.bx) * k;
      y = a.by + (b.by - a.by) * k;
    } else {
      // Changement de phase (but → engagement) : le ballon reste où il est jusqu'à l'état suivant
      x = a.bx;
      y = a.by;
    }
    const d = Math.hypot(x - vb.x, y - vb.y);
    if (d < ROLL_JUMP) vb.roll += d;
    vb.x = x;
    vb.y = y;
    vb.vx = vx;
    vb.vy = vy;
    vb.fx = a.fx;
    vb.own = a.fx ? a.own : -1;
    vb.air = a.air > 0 ? Math.max(0, a.air - Math.max(0, (t - a.s) / 1000)) : 0;
  }

  _ballCopy(a, into) {
    const c = into;
    c.x = a.bx;
    c.y = a.by;
    c.vx = a.bvx;
    c.vy = a.bvy;
    c.roll = 0;
    c.fx = a.fx;
    c.own = a.own;
    c.air = a.air;
    return c;
  }

  // Mode affiché : { k: 'pen', s, left } ou { k: 'gold', left } ; `left` s'écoule en jeu
  _frameMode(md, el) {
    if (!md) return null;
    const F = this.fv;
    if (md.k === 'pen') {
      F.pen.s = md.s;
      F.pen.left = md.left < 0 ? -1 : Math.max(0, md.left - el);
      return F.pen;
    }
    F.gold.left = Math.max(0, md.left - el);
    return F.gold;
  }

  // Secondes de jeu restantes après `time_left` (null avant, et au but en or)
  _timeLeft(t) {
    const L = this.timeLeftAt;
    if (!L) return null;
    if (L.t == null) return Math.max(0, Math.ceil(L.s));
    return Math.max(0, Math.ceil(L.s - Math.max(0, (t - L.t) / 1000)));
  }

  // Événements de l'image (annoncés ou en cours, now < until) : la même liste tant que rien ne change
  _frameEvents(now) {
    const c = this.evCache;
    if (c && now >= c.from && now < c.next) return c.list;
    const list = [];
    let next = Infinity;
    for (const e of this.fld) {
      if (now < e.until) {
        list.push(e);
        if (e.until < next) next = e.until;
      }
    }
    this.evCache = { list, from: now, next };
    return list;
  }

  // ─── Heure retardée : messages du match, phase et score montrés ─────

  // Heure de l'image : celle du serveur moins 200 ms, jamais en arrière (sauf nouvelle horloge)
  _viewTime() {
    const target = this.serverNow() - WATCH_DELAY_MS;
    if (target > this.viewT || this.viewT - target > 1000) this.viewT = target;
    return this.viewT;
  }

  // Messages arrivés jusqu'à l'heure de l'image, puis l'état montré (phase, score, tirs au but)
  _pump() {
    if (!this.watching && !this.queue.length) return;
    const t = this._viewTime();
    while (this.queue.length && this.queue[0].at <= t) {
      const q = this.queue.shift();
      try { this._apply(q.m); } catch { /* message illisible : ignoré */ }
    }
    if (!this.watching) return;
    const buf = this.buf;
    if (!buf.length) return;
    let i = buf.length - 1;
    while (i > 0 && buf[i].s > t) i -= 1;
    const st = buf[i];
    if (st === this.shown || (this.shown && st.s < this.shown.s)) return;
    const prev = this.shown;
    this.shown = st;
    this._showState(prev, st);
    // Événements finis oubliés
    if (this.fld.length && t - FLD_KEEP_MS >= this.fldEnd) {
      this.fld = liveEvents(this.fld, t - FLD_KEEP_MS);
      this._fldChanged();
    }
  }

  // Nouvel état montré : phase (pause, penalty, engagement), score, mode du règlement v2, tirs au but
  _showState(prev, st) {
    const patch = {};
    const ph = st.ph;
    if (!prev || prev.ph !== ph) {
      patch.ph = ph;
      if (ph === 'pause') patch.status = 'paused';
      else if (this.ui.status === 'paused' || this.ui.status === 'connecting') patch.status = 'live';
      if (ph !== 'pause' && this.ui.away) patch.away = null;
      if (prev && (ph === 'count' || ph === 'ready')) this.emit('kickoff', {});
      if (prev && ph === 'pen') this.emit('penalty', { s: st.md && st.md.k === 'pen' ? st.md.s : null });
    }
    if (this.ui.sc[0] !== st.sc[0] || this.ui.sc[1] !== st.sc[1]) patch.sc = [st.sc[0], st.sc[1]];
    const mode = st.md ? st.md.k : null;
    const penS = st.md && st.md.k === 'pen' ? st.md.s : null;
    if (mode !== this.ui.mode) patch.mode = mode;
    if (penS !== this.ui.penS) patch.penS = penS;
    if (mode === 'gold' && this.timeLeftAt) {
      this.timeLeftAt = null;
      patch.timeWarn = false;
    }
    if (st.so) {
      const cur = this.ui.so;
      if (!cur || !sameShots(cur.shots[0], st.so[0]) || !sameShots(cur.shots[1], st.so[1])) {
        const first = cur?.first ?? firstOf(st.so[0], st.so[1]);
        patch.so = { first, shots: [st.so[0], st.so[1]] };
      }
    }
    if (Object.keys(patch).length) this._set(patch);
  }

  // Message du match à son heure
  _apply(m) {
    switch (m.t) {
      case 'goal': {
        const scorer = Number(m.by) === 1 ? 1 : 0;
        const sc = Array.isArray(m.sc) && m.sc.length === 2 ? [intIn(m.sc[0], 0, 99), intIn(m.sc[1], 0, 99)] : this.ui.sc;
        const v2 = this.rules === RULES_V2;
        const value = v2 && Number(m.v) === 2 ? 2 : 1;
        const fx = v2 && (Number(m.fx) === FX_FIRE || Number(m.fx) === FX_ELEC) ? Number(m.fx) : FX_NONE;
        if (sc !== this.ui.sc) this._set({ sc });
        this.emit('goal', { scorer, score: [...sc], value, fx });
        break;
      }
      case 'foul': {
        const side = Number(m.side);
        const k = m.k === 'camp' || m.k === 'block' || m.k === 'keep' ? m.k : null;
        if ((side !== 0 && side !== 1) || !k) break;
        const warn = intIn(m.w, 0, 99);
        this.warn[side] = warn;
        this.emit('foul', { side, k, warn, pen: m.pen === true });
        break;
      }
      case 'pen_end': {
        const r = m.r === 'goal' || m.r === 'saved' || m.r === 'missed' ? m.r : null;
        if (r) this.emit('pen_end', { r });
        break;
      }
      case 'gold':
        if (this.timeLeftAt) {
          this.timeLeftAt = null;
          this._set({ timeWarn: false });
        }
        this.emit('gold', {});
        break;
      case 'shootout': {
        const f = Number(m.first);
        const first = f === 0 || f === 1 ? f : null;
        const shots = this.ui.so?.shots || [[], []];
        this._set({ so: { first, shots } });
        this.emit('shootout', { first });
        break;
      }
      case 'pause': {
        const side = Number(m.away) === 1 ? 1 : 0;
        const left = clampN(num(m.left), 0, 30);
        this._set({ away: { side, until: Date.now() + left * 1000 } });
        this.emit('pause', { side, left });
        break;
      }
      case 'time_left': {
        const s = Number(m.s);
        if (!Number.isFinite(s)) break;
        this.timeLeftAt = { s: clampN(s, 0, 600), t: this.viewT };
        if (!this.ui.timeWarn) this._set({ timeWarn: true });
        this.emit('time_left', { s: Math.ceil(clampN(s, 0, 600)) });
        break;
      }
      case 'ev':
        if (m.e) this.emit('ev', { e: m.e });
        break;
      case 'ev_end':
        this.emit('ev_end', { id: Number(m.id) });
        break;
      case 'wend':
        this._finish(m);
        break;
      default:
        break;
    }
  }

  // `wend` : fin du match (mêmes valeurs que `end`, sans points), puis plus rien n'est regardé
  _finish(m) {
    const w = m.winner === null || m.winner === undefined ? null : Number(m.winner);
    const sc = Array.isArray(m.sc) && m.sc.length === 2 ? [intIn(m.sc[0], 0, 99), intIn(m.sc[1], 0, 99)] : [...this.ui.sc];
    const so = Array.isArray(m.so) && m.so.length === 2 && m.so.every((v) => Number.isFinite(Number(v)))
      ? [intIn(m.so[0], 0, 99), intIn(m.so[1], 0, 99)]
      : null;
    const result = {
      winner: w === 0 || w === 1 ? w : null,
      sc,
      reason: typeof m.reason === 'string' && m.reason ? m.reason.slice(0, 40) : null,
      forfeit: m.forfeit === true,
      so,
    };
    this.watching = false;
    this.ending = false;
    this.timeLeftAt = null;
    this._clearWaitTimers();
    // Plus rien à regarder : la page rend sa place (décision A2) ; l'écran garde sa socket
    if (this.closeWhenDone) this._teardown();
    this._set({ status: 'ended', result, sc, away: null, timeWarn: false, reconnecting: false });
    this.emit('end', result);
  }

  // ─── Messages du serveur ─────────────────────────────────────────

  _onMessage(m) {
    switch (m.t) {
      case 'hello': this._onHello(m); break;
      case 'pong': this._onPong(m); break;
      case 'wstart': this._onWstart(m); break;
      case 'state': this._onState(m); break;
      case 'watchers': this._onWatchers(m); break;
      case 'cheer': {
        const r = Number(m.r);
        if (this.watching && Number.isInteger(r) && r >= 0 && r < CHEERS.length) this.emit('cheer', { r, mine: false });
        break;
      }
      case 'error': this._onError(m.code); break;
      default:
        if (DELAYED.has(m.t)) this._onMatchMessage(m);
        break;
    }
  }

  _onHello(m) {
    if (this.helloSeen) return;
    // Serveur sans spectateurs (déployé avant eux) : il prendrait cette socket pour un joueur
    if (m.watch !== true) {
      this.target = null;
      this._teardown();
      this._set({ status: 'disabled', reconnecting: false, error: 'disabled' });
      return;
    }
    this.helloSeen = true;
    clearTimeout(this.timers.reply);
    this.lastPongAt = performance.now();
    this.lastStateAt = performance.now();
    this._startPings();
    if (this.target) this._sendWatch();
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
    let best = this.samples[0];
    for (const x of this.samples) if (x.rtt < best.rtt) best = x;
    this.offset = best.offset;
    this.hasClock = true;
    this.halfRtt = best.rtt / 2;
  }

  _onWatchers(m) {
    if (!this.watching) return;
    const n = intIn(m.n, 0, 100000);
    const screen = m.screen === true;
    if (n !== this.ui.watchers || screen !== this.ui.screen) this._set({ watchers: n, screen });
  }

  _onWstart(m) {
    if (!this.target || this.destroyed) return;
    clearTimeout(this.timers.reply);
    this._clearWaitTimers();
    this.awaitingStart = false;
    this.attempts = 0;
    this.notLiveSince = null;
    // Surveillance : le premier état de cette connexion arrive dans les 100 ms
    this.lastStateAt = performance.now();
    const kind = m.kind === 'tour' ? 'tour' : 'room';
    const id = cleanText(m.id, 64);
    const key = `${kind}:${id}`;
    const resumed = this.matchKey === key && (this.ui.status === 'connecting' || this.ui.reconnecting);
    this.matchKey = key;
    const rules = m.rules === RULES_V2 ? RULES_V2 : 1;
    const gwRaw = Number(m.gw);
    const gw = Number.isInteger(gwRaw) && gwRaw >= 1 && gwRaw <= 20 ? gwRaw : (rules === RULES_V2 ? GOALS_TO_WIN_V2 : GOALS_TO_WIN);
    const sc = pairOf(m.sc, (v) => intIn(v, 0, 99));
    const names = pairOf(m.names, (v) => cleanText(v, 60));
    const roles = pairOf(m.roles, (v) => cleanText(v, 20));
    // `title` (« Quart 1 ») : serveur d'après le 4 nov. 2026 (S9) ; sinon vide, `label` sert de repli
    const tour = m.tour && typeof m.tour === 'object'
      ? {
        tid: MID_RE.test(String(m.tour.tid || '')) ? String(m.tour.tid) : null,
        name: cleanText(m.tour.name, 60),
        label: cleanText(m.tour.label, 40),
        title: cleanText(m.tour.title, 40),
      }
      : null;
    let so = null;
    if (Array.isArray(m.so) && m.so.length === 2) {
      const a = shotsOf(m.so[0]);
      const b = shotsOf(m.so[1]);
      if (a && b) so = { first: firstOf(a, b), shots: [a, b] };
    }
    const ph = typeof m.ph === 'string' ? m.ph.slice(0, 12) : 'count';
    if (!resumed) this._resetMatch();
    else {
      // Même match après une reconnexion : l'ancien tampon reste dessiné jusqu'au premier état reçu
      this.queue = [];
      this.freshBuffer = true;
    }
    this.rules = rules;
    this.gw = gw;
    // Règlement v2 : événements encore en cours chez le serveur
    this.fld = [];
    if (rules === RULES_V2 && Array.isArray(m.evs)) {
      for (const raw of m.evs.slice(0, FLD_MAX)) {
        const e = eventOrNull(raw);
        if (e && !this.fld.some((x) => x.id === e.id)) this.fld.push(e);
      }
    }
    this._fldChanged();
    this.watching = true;
    this.ending = false;
    // Alerte des 30 s déjà partie (`tl`, secondes restantes : serveur d'après le 4 nov. 2026, S10)
    const tl = Number(m.tl);
    let timeWarn = resumed ? this.ui.timeWarn : false;
    if (Number.isFinite(tl) && tl >= 0 && ph !== 'over') {
      const clock = this.hasClock || this.roughClock;
      this.timeLeftAt = { s: clampN(tl, 0, 600), t: clock ? this.serverNow() - (this.halfRtt || 0) : null };
      timeWarn = true;
    } else if (!resumed) this.timeLeftAt = null;
    // Pause en cours (`away {side, left}`, S10) : qui est parti et combien de secondes il lui reste
    let away = resumed ? this.ui.away : null;
    if (ph === 'pause' && m.away && typeof m.away === 'object' && (Number(m.away.side) === 0 || Number(m.away.side) === 1)) {
      away = { side: Number(m.away.side), until: Date.now() + clampN(num(m.away.left), 0, 30) * 1000 };
    } else if (ph !== 'pause') away = null;
    const info = {
      kind,
      id,
      names,
      roles,
      sc,
      so,
      tour,
      rules,
      gw,
      ph,
      watchers: intIn(m.watchers, 0, 100000),
      screen: m.screen === true,
    };
    this._set({
      ...info,
      status: ph === 'pause' ? 'paused' : 'live',
      result: null,
      waitOver: false,
      reconnecting: false,
      missed: false,
      error: null,
      away,
      timeWarn,
      ...(resumed ? {} : { mode: null, penS: null }),
    });
    this.emit(resumed ? 'resumed' : 'start', { ...info });
  }

  // `state` : repère du serveur, gardé 2 s
  _onState(m) {
    if (!this.watching || this.ending) return;
    const s = Number(m.s);
    if (!Number.isFinite(s)) return;
    const b = m.b;
    if (!Array.isArray(b) || b.length < 4) return;
    this.lastStateAt = performance.now();
    // Repli tant qu'aucun pong n'est revenu : l'état est daté d'à peu près maintenant
    if (!this.hasClock && !this.roughClock) {
      this.offset = s - performance.now();
      this.roughClock = true;
    }
    // `tl` du `wstart` reçu avant toute horloge : daté du premier état (envoyé juste après)
    if (this.timeLeftAt && this.timeLeftAt.t == null) this.timeLeftAt.t = s;
    if (this.freshBuffer) {
      // Reconnexion : nouvel état, nouveau tampon (jamais une ligne droite à travers la coupure)
      this.freshBuffer = false;
      this.buf = [];
      this.shown = null;
      this.viewT = -Infinity;
    }
    const last = this.buf[this.buf.length - 1] || null;
    if (last && s <= last.s) {
      if (s < last.s) {
        this.buf = [];
        this.shown = null;
      } else return;
    }
    const v2 = this.rules === RULES_V2;
    const prev = this.buf[this.buf.length - 1] || null;
    const pad = (arr, i, d) => {
      const p = Array.isArray(arr) ? arr[i] : null;
      return Array.isArray(p) && fin(Number(p[0])) && fin(Number(p[1])) ? [Number(p[0]), Number(p[1])] : d;
    };
    const p0 = pad(m.p, 0, prev ? [prev.p0x, prev.p0y] : [180, 540]);
    const p1 = pad(m.p, 1, prev ? [prev.p1x, prev.p1y] : [180, 100]);
    const e = {
      s,
      ph: typeof m.ph === 'string' ? m.ph.slice(0, 12) : (prev ? prev.ph : 'live'),
      pt: Math.max(0, num(m.pt)),
      cd: countOf(m.cd),
      kt: Math.max(0, num(m.kt)),
      bx: num(b[0]),
      by: num(b[1]),
      bvx: num(b[2]),
      bvy: num(b[3]),
      fx: FX_NONE,
      own: -1,
      air: 0,
      p0x: p0[0],
      p0y: p0[1],
      p1x: p1[0],
      p1y: p1[1],
      sc: Array.isArray(m.sc) && m.sc.length === 2 ? [intIn(m.sc[0], 0, 99), intIn(m.sc[1], 0, 99)] : (prev ? prev.sc : [...this.ui.sc]),
      md: null,
      w: null,
      cp: null,
      pk: null,
      ne: null,
      so: null,
      errFor: null,
      ex: 0,
      ey: 0,
    };
    if (v2) {
      if (b.length >= 7) {
        const fx = Number(b[4]);
        e.fx = fx === FX_FIRE || fx === FX_ELEC ? fx : FX_NONE;
        const own = Number(b[5]);
        e.own = e.fx && (own === 0 || own === 1) ? own : -1;
        e.air = clampN(num(b[6]), 0, HOP_S);
      }
      const md = Array.isArray(m.md) ? m.md : null;
      if (md && md[0] === 'pen' && (Number(md[1]) === 0 || Number(md[1]) === 1)) {
        const left = Number(md[2]);
        e.md = { k: 'pen', s: Number(md[1]), left: Number.isFinite(left) && left >= 0 ? clampN(left, 0, 30) : -1 };
      } else if (md && md[0] === 'gold') e.md = { k: 'gold', left: clampN(num(md[1]), 0, 600) };
      if (Array.isArray(m.w) && m.w.length === 2) e.w = [intIn(m.w[0], 0, 99), intIn(m.w[1], 0, 99)];
      if (Array.isArray(m.cp) && m.cp.length === 2) e.cp = [clampN(num(m.cp[0]), 0, 60), clampN(num(m.cp[1]), 0, 60)];
      if (Array.isArray(m.pk) && m.pk.length === 2) e.pk = [clampN(num(m.pk[0]), 0, 60), clampN(num(m.pk[1]), 0, 60)];
      if (Array.isArray(m.ne) && m.ne.length >= 2 && fin(m.ne[0]) && fin(m.ne[1])) {
        e.ne = { left: clampN(m.ne[0], 0, 600), total: clampN(m.ne[1], 0, 600) };
      }
    }
    // Tirs au but (match de tournoi) : par côté du serveur
    if (Array.isArray(m.so) && m.so.length === 2) {
      const a = shotsOf(m.so[0]);
      const c = shotsOf(m.so[1]);
      if (a && c) e.so = [a, c];
    }
    this.buf.push(e);
    while (this.buf.length > 2 && this.buf[0].s < s - BUFFER_MS) this.buf.shift();
  }

  // Message du match : rangé pour l'heure retardée (les événements du terrain sont tenus tout de suite,
  // à leurs propres heures du serveur)
  _onMatchMessage(m) {
    if (!this.watching || this.ending) return;
    // Heure du serveur où il a été envoyé (arrivée moins un demi-aller-retour)
    const at = this.hasClock ? this.serverNow() - (this.halfRtt || 0) : this.serverNow();
    if (m.t === 'ev') {
      if (this.rules !== RULES_V2) return;
      const e = eventOrNull(m.e);
      if (!e) return;
      const list = this.fld.filter((x) => x.id !== e.id);
      list.push(e);
      while (list.length > FLD_MAX) list.shift();
      this.fld = list;
      this._fldChanged();
      m = { t: 'ev', e };
    } else if (m.t === 'ev_end') {
      if (this.rules !== RULES_V2) return;
      const id = Number(m.id);
      const e = this.fld.find((x) => x.id === id);
      if (!e) return;
      if (at < e.until) {
        this.fld = this.fld.map((x) => (x.id === id ? { ...x, until: Math.max(x.an, at), at: Math.min(x.at, Math.max(x.an, at)) } : x));
        this._fldChanged();
      }
    } else if (m.t === 'wend') {
      // Plus rien à regarder (pas de reconnexion si la socket se ferme d'ici l'heure retardée)
      this.target = null;
      this.ending = true;
    }
    // Aucune horloge encore (aucun état ni pong) : tout de suite
    if (!this.hasClock && !this.roughClock) {
      try { this._apply(m); } catch { /* ignoré */ }
      return;
    }
    this.queue.push({ at, m });
  }

  _onError(code) {
    const c = String(code || '');
    switch (c) {
      case 'not_live': {
        if (!this.target) return;
        clearTimeout(this.timers.reply);
        this.awaitingStart = false;
        this.attempts = 0;
        this.watching = false;
        const now = Date.now();
        if (this.notLiveSince == null) this.notLiveSince = now;
        if (now - this.notLiveSince >= NOT_LIVE_FOR_MS) {
          // Attente trop longue : la page rend sa place (« Réessayer » rouvre la connexion)
          if (this.closeWhenDone) this._teardown();
          this._set({ status: 'waiting', waitOver: true, reconnecting: false, error: null });
          return;
        }
        this._set({ status: 'waiting', waitOver: false, reconnecting: false, error: null });
        this._scheduleWatch(NOT_LIVE_EVERY_MS);
        break;
      }
      case 'rate_limited':
        // Avant `hello` : quota d'authentification, la fermeture 4429 suit (nouvel essai dans 30 s)
        if (!this.target || !this.helloSeen) return;
        clearTimeout(this.timers.reply);
        this.awaitingStart = false;
        this._scheduleWatch(RATE_RETRY_MS);
        break;
      case 'no_match': {
        // Reprise d'un match déjà vu en direct (page revenue, reconnexion) : fini pendant l'absence,
        // le dernier score vu reste (décision A6)
        const missed = !!this.target && !!this.matchKey && keyOf(this.target) === this.matchKey;
        this._stop('unavailable', null, missed ? { missed: true } : null);
        break;
      }
      case 'screen_revoked':
        // Écran coupé par le salon (clé refusée) : la fermeture 4401 suit ; plus rien n'est tenté
        if (!this.screenKey) return;
        this._teardown();
        this.lastTarget = null;
        this._stop('revoked', 'revoked');
        break;
      case 'watch_full':
        this._stop('full', 'watch_full');
        break;
      case 'server_full':
        this._stop('full', 'server_full');
        break;
      case 'disabled':
        this._stop('disabled', 'disabled');
        break;
      default:
        // `watch_only` et le reste : rien à faire (la socket reste ouverte)
        break;
    }
  }

  // Plus rien à regarder pour cette demande (refus du serveur) ; la page rend sa place (décision A2)
  _stop(status, error, extra = null) {
    clearTimeout(this.timers.reply);
    this._clearWaitTimers();
    this.target = null;
    this.awaitingStart = false;
    this.watching = false;
    this.ending = false;
    this.queue = [];
    if (this.closeWhenDone) this._teardown();
    this._set({ status, error, reconnecting: false, away: null, waitOver: false, missed: false, ...(extra || {}) });
  }

  // ─── Connexion ───────────────────────────────────────────────────

  _ready() {
    return !!this.ws && this.ws.readyState === 1 && this.helloSeen;
  }

  _sendWatch() {
    const t = this.target;
    if (!t || !this._ready()) return;
    this.awaitingStart = true;
    this.watching = false;
    if (!this._send({ t: 'watch', ...t })) return;
    clearTimeout(this.timers.reply);
    const ws = this.ws;
    this.timers.reply = setTimeout(() => {
      if (this.ws === ws && this.awaitingStart && !this.destroyed) this._lost('unreachable');
    }, REPLY_TIMEOUT);
  }

  _scheduleWatch(ms) {
    clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(() => {
      this.watchTimer = null;
      try {
        if (this.destroyed || !this.target || this.suspended) return;
        if (this._ready()) this._sendWatch();
        else if (!this.ws) this._connect();
      } catch { /* jamais d'erreur */ }
    }, ms);
  }

  _clearWaitTimers() {
    clearTimeout(this.watchTimer);
    this.watchTimer = null;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  _connect() {
    if (this.destroyed) return;
    this._teardown();
    this.helloSeen = false;
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this._lost('unreachable');
      return;
    }
    this.ws = ws;
    this.opened = false;
    this.timers.connect = setTimeout(() => {
      if (this.ws === ws && !this.opened) this._lost('unreachable');
    }, CONNECT_TIMEOUT);
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.opened = true;
      clearTimeout(this.timers.connect);
      // Jeton (ou clé d'écran) jamais dans l'adresse : premier message, avec la version du protocole
      const auth = this.screenKey
        ? { t: 'auth', screen: this.screenKey, v: PROTOCOL_VERSION }
        : { t: 'auth', token: (() => { try { return this.getToken() || ''; } catch { return ''; } })(), v: PROTOCOL_VERSION, watch: true };
      this._send(auth);
      this.timers.reply = setTimeout(() => {
        if (this.ws === ws && !this.helloSeen) this._lost('unreachable');
      }, REPLY_TIMEOUT);
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (!m || typeof m !== 'object') return;
      try { this._onMessage(m); } catch { /* message illisible : ignoré */ }
    };
    ws.onerror = () => { /* la fermeture suit */ };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      try { this._onClose(e); } catch { /* jamais d'erreur */ }
    };
  }

  _onClose(e) {
    const code = Number(e?.code);
    this._teardown();
    if (this.destroyed || this.suspended) return;
    if (code === 4401) {
      // Écran : seul `error screen_revoked` dit « écran coupé » (déjà traité, la socket n'écoute plus) ;
      // un 4401 seul est une coupure comme une autre (décision A1)
      if (this.screenKey) {
        if (this.target) this._lost('lost');
        return;
      }
      // Compte : jeton refusé, « Connexion perdue » sans nouvel essai (pas de boucle)
      this.target = null;
      this.watching = false;
      this._clearWaitTimers();
      this._set({ status: 'offline', reconnecting: false, error: 'session', away: null });
      return;
    }
    if (code === 4429 || (code === 4409 && this.screenKey)) {
      // Quota (avant `hello` : authentification), ou écran remplacé : nouvel essai dans 30 s, sans
      // entamer les essais rapides (décision A3)
      if (this.target) this._retryLater(SLOW_RETRY_MS);
      return;
    }
    if (code === 4409 || code === 4426 || code === 4403) {
      this.target = null;
      this.watching = false;
      const error = code === 4409 ? 'replaced' : code === 4426 ? 'update_required' : 'not_allowed';
      this._set({ status: 'offline', reconnecting: false, error });
      return;
    }
    if (code === 1013) {
      // Serveur plein (après `server_full`) : l'écran le dit déjà
      if (this.ui.status !== 'full') this._stop('full', 'server_full');
      return;
    }
    if (!this.target) return; // plus rien à regarder (fin du match, refus) : pas de reconnexion
    if (code === 4408) {
      // Socket restée 5 min sans match regardé (attente d'un match pas encore commencé) : on repart
      this._connect();
      return;
    }
    this._lost('lost');
  }

  // Nouvelle connexion dans `ms`, sans compter d'essai ; le match reste à l'écran (« Connexion perdue,
  // on réessaie… » sur le terrain)
  _retryLater(ms) {
    this._teardown();
    if (this.destroyed || this.suspended || !this.target) return;
    this._clearWaitTimers();
    clearTimeout(this.timers.reply);
    this.watching = false;
    this.awaitingStart = false;
    this._set({ status: 'connecting', reconnecting: false, away: null });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      try { if (!this.destroyed && this.target && !this.suspended) this._connect(); } catch { /* jamais d'erreur */ }
    }, ms);
  }

  // Connexion ratée ou perdue : nouvel essai (3 au plus), puis « Connexion perdue »
  _lost(kind) {
    this._teardown();
    if (this.destroyed || this.suspended) return;
    if (!this.target) return;
    this.watching = false;
    this.awaitingStart = false;
    if (this.attempts < RETRY_DELAYS.length) {
      const delay = RETRY_DELAYS[this.attempts];
      this.attempts += 1;
      if (!this.ui.reconnecting) this._set({ reconnecting: true });
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        try { if (!this.destroyed && this.target && !this.suspended) this._connect(); } catch { /* jamais d'erreur */ }
      }, delay);
      return;
    }
    this._clearWaitTimers();
    this.target = null;
    this._set({ status: 'offline', reconnecting: false, error: kind === 'unreachable' ? 'unreachable' : 'lost', away: null });
  }

  _startPings() {
    let n = 0;
    const ws = this.ws;
    const burst = () => {
      if (this.ws !== ws) return;
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

  _teardown() {
    clearTimeout(this.timers.connect);
    clearTimeout(this.timers.reply);
    clearTimeout(this.timers.burst);
    clearInterval(this.timers.ping);
    this.timers = {};
    const ws = this.ws;
    this.ws = null;
    this.opened = false;
    this.helloSeen = false;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try { ws.close(1000); } catch { /* déjà fermée */ }
    }
  }

  // Surveillance (socket muette) et messages du match quand rien ne se dessine (page sans image)
  _tick() {
    if (this.destroyed) return;
    this._pump();
    if (!this._ready() || this.suspended) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const now = performance.now();
    if (now - this.lastPongAt > PONG_SILENCE_MS) { this._onClose({ code: 1006 }); return; }
    if (this.watching && !this.ending && this.buf.length && now - this.lastStateAt > STATE_SILENCE_MS) this._onClose({ code: 1006 });
  }

  // Page cachée : connexion fermée (place de spectateur rendue) ; revenue : reprise, sans essai compté
  _visibilityChanged() {
    if (typeof document === 'undefined' || this.destroyed) return;
    if (document.hidden) {
      if (!this.target && !this.watching) return;
      this.suspended = true;
      this._clearWaitTimers();
      this._teardown();
      return;
    }
    if (!this.suspended) return;
    this.suspended = false;
    if (this.target) {
      this.attempts = 0;
      if (this.ui.status === 'live' || this.ui.status === 'paused') this._set({ reconnecting: true });
      this._connect();
    }
  }

  // ─── État ────────────────────────────────────────────────────────

  _resetClock() {
    this.samples = [];
    this.offset = 0;
    this.hasClock = false;
    this.roughClock = false;
    this.halfRtt = 0;
  }

  _resetMatch() {
    this.buf = [];
    this.queue = [];
    this.shown = null;
    this.viewT = -Infinity;
    this.freshBuffer = false;
    this.rules = 1;
    this.gw = GOALS_TO_WIN;
    this.fld = [];
    this.evCache = null;
    this.fldEnd = Infinity;
    this.fldGoals = false;
    this.warn = [0, 0];
    this.timeLeftAt = null;
    this.goalOffArr = [0, 0];
    this.vball = { ...createBall(), fx: FX_NONE, own: -1, air: 0 };
    this.vpads = [{ x: 180, y: 540 }, { x: 180, y: 100 }];
    this.tmpBall = { ...createBall(), fx: FX_NONE, own: -1, air: 0 };
    this.tmpBall2 = { ...createBall(), fx: FX_NONE, own: -1, air: 0 };
    this.fv = {
      phase: 'count', phaseT: 0, countS: null, keepT: 0, score: [0, 0], flashBox: 0, ball: this.vball,
      paddles: this.vpads, timeLeft: null, rules: 1, goalsToWin: GOALS_TO_WIN, now: 0, events: NO_EVENTS,
      goalOff: null, mode: null, warn: [0, 0], camp: [0, 0], pin: [0, 0], nextEvent: null,
      next: { left: 0, total: 0 }, pen: { k: 'pen', s: 0, left: 0 }, gold: { k: 'gold', left: 0 },
    };
  }

  _fldChanged() {
    let end = Infinity;
    let goals = false;
    for (const e of this.fld) {
      if (e.until < end) end = e.until;
      if (e.k === 'goals') goals = true;
    }
    this.fldEnd = end;
    this.fldGoals = goals;
    this.evCache = null;
  }

  emit(type, data) {
    try { this.onEvent?.(type, data); } catch { /* un effet raté ne casse rien */ }
    for (const fn of this.listeners) {
      try { fn(type, data); } catch { /* idem */ }
    }
  }

  _set(patch) {
    this.ui = { ...this.ui, ...patch };
    try { this.onChange?.(this.ui); } catch { /* écran démonté */ }
  }
}
