/*
 * Match en ligne de La Coupe du Gang : connexion `/ws/coupe` et code réseau, indépendants de React
 * (contrat : section « Prototype réseau » de docs/fonctions/coupe-du-gang.md).
 *
 * Principe « la frappe appartient à celui qui frappe » :
 *  - ce téléphone simule son joueur et le ballon sans attendre ; il ne fait le choc qu'avec SON
 *    joueur, et envoie chaque frappe (`hit`) au serveur, qui la vérifie et rejoue ;
 *  - à chaque `state`, il recale son ballon sur celui du serveur amené à maintenant (sauf tant que
 *    sa dernière frappe n'est pas acquittée), l'affichage lissant l'écart en ~80 ms ;
 *  - l'adversaire est affiché 100 ms dans le passé, interpolé entre deux `state` ;
 *  - phase, score et buts viennent toujours du serveur.
 *
 * Repère : localement on joue toujours en bas (side 0 du moteur). Le joueur `side 1` tourne tout
 * de 180° (flipPoint / flipVel) à l'entrée comme à la sortie du réseau.
 *
 *   const match = new OnlineMatch({ onChange: (ui) => …, onEvent: (type, data) => … });
 *   match.create();            // ou match.join('4821')
 *   // à chaque frame : match.update(dt); renderer.render(match.getFrame(), dt);
 */
import {
  H, BR, PR, STEP, HUMAN_SPEED, KEEP_LIMIT,
  createBall, createPaddle, homePaddle, flipPoint, flipVel,
  movePaddle, stepBall, collidePaddle, walls, unpin, advanceBall,
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

// Version du protocole, portée par `auth` (autre valeur : `update_required`, fermeture 4426)
const PROTOCOL_VERSION = 1;
// Horloge : 5 ping à 200 ms d'écart après `hello`, puis un toutes les 2 s ; 8 derniers échantillons
const PING_BURST = 5;
const PING_BURST_GAP = 200;
const PING_EVERY = 2000;
const CLOCK_SAMPLES = 8;
// Position de son joueur envoyée 30 fois par seconde
const INPUT_HZ = 30;
// Frappes : le serveur refuse deux frappes à moins de 10 ms (heure `at`) ; marge pour le bruit de
// l'horloge estimée. Le premier choc d'une série part tout de suite ; pendant une poussée (un choc
// à chaque pas), un instantané au plus toutes les HIT_HOLD_MS (~55 messages/s avec les `in`, sous
// le seau de 60/s du serveur).
const HIT_GAP_MS = 12;
const HIT_HOLD_MS = 40;
// Adversaire affiché avec 100 ms de retard
const OPP_DELAY_MS = 100;
// Recalage du ballon : au-delà de 1,5 on prend le serveur ; au-delà de 8 c'est un « recalage »
const SNAP_EPS = 1.5;
const RESYNC_EPS = 8;
// Décalage d'affichage qui fond en ~80 ms (3 τ) ; au-delà de SMOOTH_MAX, saut franc
const SMOOTH_TAU = 0.027;
const SMOOTH_MAX = 200;
// Délais de connexion
const CONNECT_TIMEOUT = 8000;
const REPLY_TIMEOUT = 8000;
const REACT_GAP = 1000; // réactions : 1 par seconde
// Ralenti visuel après un but (comme le prototype)
const GOAL_SLOW_MS = 750;
const GOAL_SLOW = 0.22;

const ERRORS = {
  unreachable: { message: 'Connexion impossible au serveur de jeu', retry: true },
  not_allowed: { message: "Réservé à l'équipe et aux testeurs pendant l'essai", retry: false },
  opp_left: { message: "L'autre joueur est parti", retry: false },
  lost: { message: 'Connexion au serveur de jeu perdue : le match est arrêté', retry: false },
  // Même jeton, même refus : pas de « Réessayer »
  session: { message: "Ta session n'est pas reconnue par le serveur de jeu. Reconnecte-toi puis réessaie.", retry: false },
  // Codes envoyés par le serveur (dhomebarber-api/lib/coupeRooms.js)
  no_room: { message: 'Aucun match en attente avec ce code', retry: false },
  own_room: { message: "C'est ton propre match : l'autre téléphone doit utiliser un autre compte", retry: false },
  room_expired: { message: 'Ce match a expiré : crées-en un nouveau', retry: false },
  rate_limited: { message: "Trop d'essais : attends quelques minutes avant de recommencer", retry: false },
  server_full: { message: 'Trop de matchs en ce moment : réessaie dans une minute', retry: true },
  update_required: { message: "Mets l'app à jour pour jouer en ligne", retry: false },
  replaced: { message: 'Ton compte a ouvert le jeu sur un autre appareil', retry: false },
  server_error: { message: 'Erreur du serveur de jeu', retry: true },
  server: { message: 'Le serveur de jeu a refusé la demande', retry: true },
};

const SERVER_CODES = new Set(['not_allowed', 'no_room', 'own_room', 'room_expired', 'rate_limited',
  'server_full', 'update_required', 'replaced', 'server_error']);

// Fermetures sans message `error` préalable (ou arrivées seules)
const CLOSE_KINDS = {
  4401: 'session',
  4403: 'not_allowed',
  4409: 'replaced',
  4426: 'update_required',
  4429: 'rate_limited',
  1011: 'server_error',
};

/** Code d'erreur du serveur → message ; un code inconnu reste générique. */
const errorKind = (code) => (SERVER_CODES.has(String(code)) ? String(code) : 'server');

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

const IDLE_UI = Object.freeze({
  status: 'idle', // idle | connecting | room | match | over | error
  code: null,
  side: null,
  names: [],
  roles: [],
  result: null, // { won, score: [moi, adversaire] }
  rematchAsked: false,
  error: null, // { kind, code, message, retry }
});

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
    this.helloSeen = false;
    // Horloge
    this.samples = [];
    this.offset = 0;
    this.hasClock = false;
    this.roughClock = false;
    this.pingMs = null;
    // Match
    this.you = 0;
    this.lastReact = -Infinity;
    this.taughtBox = false;
    this.target = null;
    this.fingerDown = false;
    this._resetMatch();
    this._wallFx = (kind, v) => {
      if (kind === 'post') { if (v > 120) this.emit('post', v); } else this.emit('wall', v);
    };
  }

  // ─── Commandes de l'écran ─────────────────────────────────────────

  /** Crée un match : le serveur rend un code à 4 chiffres. */
  create() { this._begin({ t: 'create' }); }

  /** Rejoint le match `code` (4 chiffres). */
  join(code) {
    const c = String(code || '').replace(/\D/g, '').slice(0, 4);
    if (c.length !== 4) return;
    this._begin({ t: 'join', code: c });
  }

  /** Recommence la dernière demande (après « Connexion impossible »). */
  retry() {
    if (this.lastAction) this._begin(this.lastAction);
  }

  /** Revanche : le serveur relance le match (`start`) quand les deux l'ont demandée. */
  rematch() {
    if (this.ui.status !== 'over' || this.ui.rematchAsked) return;
    if (!this._send({ t: 'rematch' })) { this._fail('lost'); return; }
    this._set({ rematchAsked: true });
  }

  /** Quitte la salle ou le match (prototype : l'autre joueur voit « L'autre joueur est parti »). */
  leave() {
    this.lastAction = null;
    if (this.ws && this.ws.readyState === 1) this._send({ t: 'leave' });
    this._teardown();
    this._set({ ...IDLE_UI });
  }

  /** Réaction toute faite (0 👏, 1 🔥, 2 😂), une par seconde. Rend true si elle est partie. */
  react(r) {
    if (this.ui.status !== 'match' && this.ui.status !== 'over') return false;
    if (r !== 0 && r !== 1 && r !== 2) return false;
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

  /** Diagnostic : ping médian (ms, null avant le premier pong) et nombre de recalages du match. */
  stats() {
    return { ping: this.pingMs == null ? null : Math.round(this.pingMs), recalages: this.recalages };
  }

  destroy() {
    this.leave();
    this.onChange = null;
    this.onEvent = null;
  }

  emit(type, data) {
    try { this.onEvent?.(type, data); } catch { /* un effet raté ne casse pas le match */ }
  }

  // ─── Boucle (appelée à chaque frame) ──────────────────────────────

  update(dt) {
    const f = Math.exp(-dt / SMOOTH_TAU);
    this.offsetBall.x *= f;
    this.offsetBall.y *= f;
    if (Math.abs(this.offsetBall.x) < 0.01) this.offsetBall.x = 0;
    if (Math.abs(this.offsetBall.y) < 0.01) this.offsetBall.y = 0;
    this.flash = Math.max(0, this.flash - dt);
    if (this.ui.status !== 'match') return;

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

    this.inAcc += dt;
    if (this.inAcc >= 1 / INPUT_HZ) {
      this.inAcc -= 1 / INPUT_HZ;
      if (this.inAcc > 1 / INPUT_HZ) this.inAcc = 0;
      const p = this._flip(this.me.x, this.me.y);
      this._send({ t: 'in', x: r1(p.x), y: r1(p.y) });
    }
  }

  /** Image du match pour le dessin (null hors match). */
  getFrame() {
    if (this.ui.status !== 'match' && this.ui.status !== 'over') return null;
    const now = this.serverNow();
    const phaseT = this.phaseAt ? this.phaseAt.pt + Math.max(0, (now - this.phaseAt.s) / 1000) : 0;
    const keepT = this.phase === 'live' && this.keep
      ? Math.min(KEEP_LIMIT, this.keep.kt + Math.max(0, (now - this.keep.s) / 1000))
      : 0;
    return {
      phase: this.phase,
      phaseT,
      keepT,
      score: this.score,
      flashBox: this.flash,
      ball: {
        x: this.ball.x + this.offsetBall.x,
        y: this.ball.y + this.offsetBall.y,
        vx: this.ball.vx,
        vy: this.ball.vy,
        roll: this.ball.roll,
      },
      paddles: [this.me, this._oppAt(now - OPP_DELAY_MS)],
    };
  }

  // ─── Simulation locale ───────────────────────────────────────────

  _resetMatch() {
    this.seq = 0;
    this.lastHitAt = -Infinity;
    this.lastHitPerf = -Infinity;
    this.lastHitFx = -Infinity;
    this.pendingHit = null;
    this.score = [0, 0];
    this.phase = 'count';
    this.phaseAt = null;
    this.keep = null;
    this.ball = createBall();
    this.me = createPaddle(0);
    this.oppBuf = [];
    this.offsetBall = { x: 0, y: 0 };
    this.recalages = 0;
    this.flash = 0;
    this.acc = 0;
    this.inAcc = 0;
    this.simNow = 0;
    this.slowUntil = 0;
  }

  _step(slow) {
    const me = this.me;
    const b = this.ball;
    if (this.target) { me.tx = this.target.x; me.ty = this.target.y; } else { me.tx = me.x; me.ty = me.y; }
    if (movePaddle(me, 0, STEP, HUMAN_SPEED)) {
      this.flash = 0.5;
      if (!this.taughtBox) { this.taughtBox = true; this.emit('toast', "Interdit d'entrer dans ta petite surface"); }
    }
    const ph = this.phase;
    if (ph === 'count' || ph === 'ready') { unpin(b, me, 0); return; }
    if (ph === 'over') return;
    stepBall(b, STEP * slow, this._wallFx);
    if (ph !== 'live') return; // but : le ballon finit sa course au fond des filets, au ralenti
    const v = collidePaddle(b, me, 0); // son propre joueur seulement
    walls(b); // ballon poussé contre un bord : remis dans le terrain avant l'instantané
    unpin(b, me, 0);
    if (v > 0) this._onLocalHit(v);
    this._flushHit();
  }

  // Envoi des frappes. Chaque `hit` est l'instantané d'un choc (contrat : ballon à moins de
  // PR + BR + 4 du joueur). Le PREMIER choc d'une série part tout de suite : c'est le seul que le
  // serveur peut comparer à son ballon, qui ne contient encore aucun choc de la série (envoyer le
  // dernier faisait refuser toutes les frappes fortes sur un ballon arrêté : le joueur, plus rapide
  // que le ballon, le touche plusieurs pas de suite). Pendant une poussée, le dernier instantané
  // part ensuite toutes les HIT_HOLD_MS, et celui de la fin de la poussée dès que ce délai est passé.
  _flushHit() {
    const snap = this.pendingHit;
    if (snap && this.simNow - this.lastHitAt >= HIT_HOLD_MS) this._sendHit(snap);
  }

  _onLocalHit(v) {
    const b = this.ball;
    const me = this.me;
    const now = performance.now();
    if (now - this.lastHitFx >= 60) {
      this.lastHitFx = now;
      const dx = b.x - me.x;
      const dy = b.y - me.y;
      const d = Math.hypot(dx, dy) || 1;
      this.emit('hit', { v, x: b.x - (dx / d) * BR, y: b.y - (dy / d) * BR, mine: true });
    }
    if (this.phase !== 'live') return;
    // Instantané du moment du choc, dans le repère du serveur
    const snap = { at: this.simNow, b: this._ballOut(b), p: this._flip(me.x, me.y) };
    const gap = snap.at - this.lastHitAt;
    if (gap >= HIT_HOLD_MS) this._sendHit(snap); // premier choc d'une série
    else if (gap >= HIT_GAP_MS) this.pendingHit = snap; // poussée : le plus récent attend son tour
  }

  // Frappe : état du ballon juste après le choc, position de son joueur, heure du serveur estimée
  _sendHit(snap) {
    this.seq += 1;
    this._send({
      t: 'hit',
      n: this.seq,
      at: r1(snap.at),
      b: [r2(snap.b.x), r2(snap.b.y), r2(snap.b.vx), r2(snap.b.vy)],
      p: [r2(snap.p.x), r2(snap.p.y)],
    });
    this.lastHitAt = snap.at;
    this.lastHitPerf = performance.now();
    this.pendingHit = null;
  }

  // Tant que la dernière frappe n'est pas acquittée, le ballon du serveur ne la contient pas encore.
  // Passé ce délai, la frappe est tenue pour refusée et le téléphone se recale.
  _ackWait() {
    return Math.max(300, (this.pingMs ?? 150) * 2 + 150);
  }

  // ─── Repère ──────────────────────────────────────────────────────

  _flip(x, y) { return this.you === 1 ? flipPoint(x, y) : { x, y }; }

  _ballIn(b) {
    const p = this._flip(num(b[0]), num(b[1]));
    const v = this.you === 1 ? flipVel(num(b[2]), num(b[3])) : { vx: num(b[2]), vy: num(b[3]) };
    return { x: p.x, y: p.y, vx: v.vx, vy: v.vy, roll: this.ball.roll };
  }

  _ballOut(b) {
    const p = this._flip(b.x, b.y);
    const v = this.you === 1 ? flipVel(b.vx, b.vy) : { vx: b.vx, vy: b.vy };
    return { x: p.x, y: p.y, vx: v.vx, vy: v.vy };
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
      case 'hello': this._onHello(); break;
      case 'pong': this._onPong(m); break;
      case 'room':
        clearTimeout(this.timers.reply);
        if (this.ui.status === 'connecting') {
          this._set({ status: 'room', code: String(m.code ?? ''), side: Number(m.side) === 1 ? 1 : 0 });
        }
        break;
      case 'start': this._onStart(m); break;
      case 'state': this._onState(m); break;
      case 'goal': this._onGoal(m); break;
      case 'end': this._onEnd(m); break;
      case 'opp_left':
        if (this.ws && this.ws.readyState === 1) this._send({ t: 'leave' });
        this._fail('opp_left');
        break;
      case 'react':
        if (m.r === 0 || m.r === 1 || m.r === 2) this.emit('react', { r: m.r, mine: false });
        break;
      case 'error': this._onError(m.code); break;
      default: break;
    }
  }

  _onPong(m) {
    const now = performance.now();
    const c = Number(m.c);
    const s = Number(m.s);
    if (!Number.isFinite(c) || !Number.isFinite(s)) return;
    const rtt = now - c;
    if (rtt < 0 || rtt > 15000) return;
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

  _onStart(m) {
    clearTimeout(this.timers.reply);
    const you = Number(m.you) === 1 ? 1 : 0;
    this.you = you;
    const names = Array.isArray(m.names) ? m.names : [];
    const roles = Array.isArray(m.roles) ? m.roles : [];
    this._resetMatch();
    this.phaseAt = { pt: 0, s: this.serverNow() };
    if (!this.fingerDown) this.target = null;
    this._set({
      status: 'match',
      side: you,
      names: [String(names[you] ?? ''), String(names[1 - you] ?? '')],
      roles: [String(roles[you] ?? ''), String(roles[1 - you] ?? '')],
      result: null,
      rematchAsked: false,
      error: null,
    });
    this.emit('start', { names: this.ui.names, roles: this.ui.roles });
  }

  _onState(m) {
    if (this.ui.status !== 'match') return;
    const s = Number(m.s);
    if (!Number.isFinite(s)) return;
    // Repli tant qu'aucun pong n'est revenu : l'état est daté d'à peu près maintenant
    if (!this.hasClock && !this.roughClock) { this.offset = s - performance.now(); this.roughClock = true; }

    const prev = this.phase;
    const ph = typeof m.ph === 'string' ? m.ph : prev;
    this.phase = ph;
    // `pt` / `kt` : secondes écoulées dans la phase / ballon dans la moitié `k`, à l'heure `s`
    this.phaseAt = { pt: num(m.pt), s };
    this.keep = { kt: num(m.kt), s };
    if (Array.isArray(m.sc) && m.sc.length === 2) this.score = this._pair(m.sc);
    if (ph !== prev) this._onPhase(prev, ph);

    // Adversaire : gardé ~1 s pour l'interpolation
    const op = Array.isArray(m.p) ? m.p[1 - this.you] : null;
    if (Array.isArray(op) && Number.isFinite(Number(op[0])) && Number.isFinite(Number(op[1]))) {
      const last = this.oppBuf[this.oppBuf.length - 1];
      if (last && s < last.s) this.oppBuf = [];
      const q = this._flip(Number(op[0]), Number(op[1]));
      this.oppBuf.push({ s, x: q.x, y: q.y });
      if (this.oppBuf.length > 40) this.oppBuf.shift();
    }

    this._reconcile(m, s, ph);
  }

  _onPhase(prev, ph) {
    if (ph === 'count' || ph === 'ready') {
      // Engagement : chacun chez soi, le doigt reprend la main aussitôt (comme le prototype)
      homePaddle(this.me, 0);
      if (!this.fingerDown) this.target = null;
      this.offsetBall.x = 0;
      this.offsetBall.y = 0;
      this.pendingHit = null;
      if (prev === 'live' && ph === 'ready') this.emit('toast', 'Ballon gardé 5 s : il change de camp');
      this.emit('kickoff');
    }
  }

  _reconcile(m, s, ph) {
    if (!Array.isArray(m.b) || m.b.length < 4) return;
    // But : le ballon finit sa course au ralenti sur ce téléphone, le serveur réengage ensuite
    if (ph === 'goal' || ph === 'over') return;
    // Frappe pas encore prise en compte par le serveur (ou pas encore partie : frappes
    // rapprochées) : son ballon ne la contient pas
    if (this.pendingHit) return;
    const ack = Array.isArray(m.ack) ? num(m.ack[this.you]) : 0;
    if (ack < this.seq && performance.now() - this.lastHitPerf < this._ackWait()) return;

    // « Maintenant » = l'heure où en est le ballon local (dernier pas de la simulation). Les
    // messages arrivent entre deux frames : amener l'état du serveur à l'heure réelle le mettrait
    // jusqu'à une frame (17 ms, ~10 unités) en avance sur le ballon local, et chaque `state`
    // compterait un faux recalage.
    const copy = this._ballIn(m.b);
    const at = this.simNow > 0 ? this.simNow : this.serverNow();
    const age = (at - s) / 1000;
    if (age > 0) advanceBall(copy, Math.min(age, 0.6));

    if (ph !== 'live') {
      this._setBall(copy);
      this.offsetBall.x = 0;
      this.offsetBall.y = 0;
      return;
    }

    const dx = this.ball.x - copy.x;
    const dy = this.ball.y - copy.y;
    const err = Math.hypot(dx, dy);
    if (err <= SNAP_EPS) return;
    // Le ballon du serveur a changé de vitesse dans la moitié adverse : frappe de l'adversaire
    const dv = Math.hypot(copy.vx - this.ball.vx, copy.vy - this.ball.vy);
    if (dv > 300 && copy.y < H / 2 + PR) this.emit('hit', { v: dv * 0.5, x: copy.x, y: copy.y, mine: false });
    // On prend l'état du serveur ; l'affichage garde l'écart, qui fond en ~80 ms (pas de saut)
    if (err < SMOOTH_MAX) {
      this.offsetBall.x += dx;
      this.offsetBall.y += dy;
    } else {
      this.offsetBall.x = 0;
      this.offsetBall.y = 0;
    }
    this._setBall(copy);
    if (err > RESYNC_EPS) this.recalages += 1;
  }

  _setBall(copy) {
    this.ball.x = copy.x;
    this.ball.y = copy.y;
    this.ball.vx = copy.vx;
    this.ball.vy = copy.vy;
  }

  _onGoal(m) {
    if (this.ui.status !== 'match') return;
    const scorer = Number(m.by) === this.you ? 0 : 1;
    if (Array.isArray(m.sc) && m.sc.length === 2) this.score = this._pair(m.sc);
    this.phase = 'goal';
    this.phaseAt = { pt: 0, s: this.serverNow() };
    this.slowUntil = performance.now() + GOAL_SLOW_MS;
    this.pendingHit = null;
    this.emit('goal', { scorer, score: [...this.score] });
  }

  _onEnd(m) {
    if (this.ui.status !== 'match') return;
    if (Array.isArray(m.sc) && m.sc.length === 2) this.score = this._pair(m.sc);
    const won = Number(m.winner) === this.you;
    this.phase = 'over';
    this.pendingHit = null;
    this._set({ status: 'over', result: { won, score: [...this.score] }, rematchAsked: false });
    this.emit('end', { won, score: [...this.score] });
  }

  _onError(code) {
    const kind = errorKind(code);
    const status = this.ui.status;
    if (status === 'connecting' || status === 'room') { this._fail(kind, code); return; }
    // Revanche refusée faute de place : on reste sur la fin de match, la revanche se redemande
    if (status === 'over' && kind === 'server_full') {
      this._set({ rematchAsked: false });
      this.emit('toast', ERRORS.server_full.message);
      return;
    }
    // Match en cours ou fini : seuls les codes connus ferment l'écran (accès retiré, autre
    // appareil, salle expirée, panne) ; un code inconnu est ignoré
    if (kind !== 'server') this._fail(kind, code);
  }

  _onClose(e) {
    const status = this.ui.status;
    const opened = this.opened;
    this._teardown();
    if (status === 'error' || status === 'idle') return;
    const kind = CLOSE_KINDS[e?.code];
    if (kind) { this._fail(kind); return; }
    if (!opened || status === 'connecting') { this._fail('unreachable'); return; }
    this._fail('lost');
  }

  // ─── Connexion ───────────────────────────────────────────────────

  _begin(action) {
    this._teardown();
    this.lastAction = action;
    this._set({ ...IDLE_UI, status: 'connecting' });
    this.helloSeen = false;
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this._fail('unreachable');
      return;
    }
    this.ws = ws;
    this.opened = false;
    this.timers.connect = setTimeout(() => {
      if (this.ws === ws && !this.opened) this._fail('unreachable');
    }, CONNECT_TIMEOUT);
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.opened = true;
      clearTimeout(this.timers.connect);
      // Jeton jamais dans l'adresse (journaux du routeur Heroku) : premier message, avec la
      // version du protocole. Rien d'autre avant `hello` (le serveur fermerait).
      this._send({ t: 'auth', v: PROTOCOL_VERSION, token: this.getToken() || '' });
      this.timers.reply = setTimeout(() => {
        if (this.ui.status === 'connecting') this._fail('unreachable');
      }, REPLY_TIMEOUT);
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

  // `hello` : compte accepté. create / join partent alors, puis les ping de l'horloge
  _onHello() {
    if (this.helloSeen) return;
    this.helloSeen = true;
    clearTimeout(this.timers.reply);
    if (this.lastAction) this._send(this.lastAction);
    this.timers.reply = setTimeout(() => {
      if (this.ui.status === 'connecting') this._fail('unreachable');
    }, REPLY_TIMEOUT);
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

  _fail(kind, code) {
    // Erreur en plein match : rejouer le `join` d'origine ne peut que rater (salle fermée), et chaque
    // code raté compte dans le blocage du serveur (5 par minute) : retour à l'accueil, sans « Réessayer »
    if (this.ui.status === 'match' || this.ui.status === 'over') this.lastAction = null;
    this._teardown();
    const def = ERRORS[kind] || ERRORS.server;
    this._set({
      status: 'error',
      error: { kind, code: code ?? null, message: def.message, retry: def.retry && !!this.lastAction },
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
    this.samples = [];
    this.hasClock = false;
    this.roughClock = false;
    this.pingMs = null;
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
