/*
 * Match hors ligne de La Coupe du Gang : contre le salon (ordinateur, 3 niveaux) ou à deux sur un
 * téléphone. Aucun réseau, aucun point. Porté du prototype validé par le propriétaire
 * (docs/prototypes/coupe-du-gang.html) sur le moteur partagé (engine.js) : même physique que le
 * match en ligne.
 *
 * Deux règlements (`rules`) :
 * - 1 (défaut) : la règle d'aujourd'hui, inchangée (petite surface interdite, ballon rendu après
 *   5 s dans une moitié, premier à 3, sans limite de temps, ralenti sur un but) ;
 * - 2 : le règlement v2 (docs/fonctions/coupe-du-gang-regles-v2-contrat.md, sections 1 et 6),
 *   les mêmes règles que l'arbitre du serveur, avec l'horloge du match et `rnd` (Math.random) :
 *   premier à 5, 5 min de jeu puis but en or à égalité (2 min sans but : nul), ballon en feu
 *   (frappe très forte, gel) ou électrique (foudre, but à 2), un événement toutes les 20 à 40 s de
 *   jeu, fautes (camper 3 s, bloquer 1,5 s, ballon gardé 5 s : avertissement, penalty au 3e),
 *   penalty. Le salon apprend le penalty (gardien qui suit le ballon sur sa ligne, tireur qui
 *   attend puis frappe fort, direct ou par la bande), le but en or (il monte chercher le ballon),
 *   ne campe jamais (il sort de sa grande surface à mi-chemin de la faute) et ne bloque pas le
 *   ballon. À deux, les mêmes règles pour les deux joueurs. Cages qui bougent : personne sur sa
 *   ligne de but (modeAt du moteur).
 *
 * Indépendant de React et du DOM : l'écran lui donne les cibles des joueurs et le dessine.
 *
 *   const match = new LocalMatch({ mode: 'bot', level: 'barber', rules: 2, onEvent: (type, data) => … });
 *   match.start();
 *   // à chaque frame : match.update(dt); renderer.render(match.getFrame(), dt);
 *
 * Repère : joueur 0 en bas (toi, ou le joueur du bas à deux), joueur 1 en haut (le salon, ou le
 * joueur du haut) ; c'est aussi le repère du serveur (événements, camps). `getFrame()` a la même
 * forme que celle du match en ligne (contrat, section 6) : `countS` (4,5 s au coup d'envoi de
 * chaque match, revanche comprise), `rules`, `goalsToWin`, `now` (ms, horloge du match), `events`,
 * `goalOff`, `ball` (fx, own, air), `mode`, `warn`, `camp`, `pin`, `nextEvent`, `timeLeft`.
 *
 * Événements (`onEvent`) : start {mode, level, rules, goalsToWin}, kickoff {toSide},
 * hit {v, x, y, mine, side}, wall (vitesse), post (vitesse), goal {scorer, score, value, fx},
 * end {winner, score, reason, draw}, toast (texte) ; règlement v2 en plus : event {e},
 * event_end {id}, bolt {x, y}, fire {x, y}, charge {x, y}, douse {x, y, was}, short {x, y},
 * foul {side, k, warn, pen}, penalty {s}, pen_end {r}, gold {}, time_left {s}.
 * `end.reason` : null, 'time_limit' (5 min, celui qui mène gagne), 'time_limit_draw' (but en or
 * sans but : nul, `winner` null, `draw` vrai) ou 'golden_goal'.
 */
import {
  W, H, GW, GL, GR, BR, PR, BBD, STEP, BALL_MAX, HIT_CAP, PEN_D, HUMAN_SPEED, KEEP_LIMIT, GOALS_TO_WIN,
  GOALS_TO_WIN_V2, LEVELS, RULES_V2, FX_FIRE, FX_ELEC, CAMP_S, BLOCK_S, WARN_MAX, PEN_SET_S, PEN_SHOT_S,
  PEN_END_S, PEN_SAVE_S, GOLD_MAX_S, clamp, createBall, createPaddle, homePaddle, placeKickoff,
  movePaddle, stepBall, collidePaddle, walls, unpin, goalScorer, halfOf, botTarget, touchBall,
  goalValue, clearFx, inBigBox, pinnedBy, pinClock, foulClock, modeAt, penaltySpot, keeperLine, placePenalty, penaltyPlace,
  goalOffsets, liveEvents, nextEventGap, pickEventKind, makeEvents,
} from './engine.js';

// Compte à rebours du coup d'envoi (comme en ligne) : 4,5 s au coup d'envoi d'un match (thème stade,
// docs/fonctions/coupe-du-gang-stade.md : le stade entier, le zoom sur le terrain, puis 3, 2, 1),
// 3 s pour tout autre compte à rebours (but en or compris) ; engagement ; but (bannière puis
// réengagement)
const COUNT_S = 3;
const FIRST_COUNT_S = 4.5;
const READY_S = 0.8;
const GOAL_S = 1.9;
// Ralenti après un but (comme le prototype)
const GOAL_SLOW_S = 0.75;
const GOAL_SLOW = 0.22;
// Un seul effet de frappe toutes les 60 ms par joueur (sons, étincelles, vibration)
const HIT_COOLDOWN = 0.06;
// Le salon réfléchit un peu après chaque engagement
const BOT_FIRST_THINK = 0.3;

// Règlement v2 : durée du match comme le serveur (MATCH_PLAY_MS, TIME_WARN_MS de coupeRooms.js) ;
// après un penalty, pas d'événement avant 5 s de jeu
const MATCH_PLAY_MS = 5 * 60 * 1000;
const TIME_WARN_MS = 30 * 1000;
const PEN_EVENT_GAP_MS = 5000;
// Le salon et les fautes : il sort de sa grande surface quand son chrono de camping (foulClock)
// atteint 1,4 s (la faute est à 3 s), recule après 0,5 s de ballon coincé (la faute est à 1,5 s)
const BOT_BOX_S = 1.4;
const BOT_BOX_LOW = 0.4; // … et ne revient qu'une fois le chrono redescendu là
const BOT_OUT = 18; // sortie : son centre 18 au-delà de la grande surface
const BOT_ESCAPE_S = 0.25; // recul du ballon coincé : il reste un instant à l'écart avant de rejouer
const BOT_PIN_S = 0.5;
const BOT_PIN_BACK = 40;
// Le salon au penalty : élan derrière le ballon, frappe à travers à la vitesse maximale d'une frappe
// (HIT_CAP : jamais en feu, un ballon arrêté ne s'allume pas) ; angles essayés jusqu'à 72° de l'axe
// (par la bande compris), imprécision : un quart de L.aim à la distance du point
const SHOT_BACK = 75;
const SHOT_THROUGH = 60;
const SHOT_TRIES = 97; // un angle tous les 1,5°
const SHOT_ANGLE = 1.25;
const SHOT_AIM = 0.25;
// … plus 5 dans tous les cas : sans elle, le Boss marquait 100 % de ses penaltys (tir au point en
// 0,14 s, qu'aucun gardien ne rattrape s'il est bien placé dans le coin)
const SHOT_AIM_MIN = 5;
// Le salon gardien : il réagit au tir après son réflexe de penalty (± 20 %), plus lent que son temps
// de réaction du jeu normal (LEVELS.react) : un tir parti du point met environ 0,17 s pour atteindre
// sa ligne, et 0,13 s rendaient le Barber imbattable (7 % de penaltys marqués par un bon tireur,
// banc d'essai du 31 oct.) ; parfois il plonge d'abord d'un côté au hasard (0,2 s), comme un
// gardien qui devine (bon une fois sur deux : plus souvent pour les meilleurs niveaux)
const KEEPER_REACT = { apprenti: 0.3, barber: 0.2, boss: 0.16 };
const KEEPER_GUESS = { apprenti: 0.15, barber: 0.25, boss: 0.35 };
const KEEPER_GUESS_S = 0.2;
// But en or : il monte chercher un ballon plus lent que ça dans la moitié adverse
const GOLD_CHASE = 420;

export const LOCAL_MODES = ['bot', 'local'];

// Rebonds sur les bords (prévision du gardien) : le moteur garde la sienne pour botTarget
function foldX(x) {
  const span = W - 2 * BR;
  let u = (x - BR) % (2 * span);
  if (u < 0) u += 2 * span;
  return BR + (u > span ? 2 * span - u : u);
}

// Penalty du tireur `s` : angles de tir (de l'axe de la cage, jusqu'à ±SHOT_ANGLE) qui marquent
// contre un gardien immobile à sa place (ballon seul à pleine vitesse, rebonds et poteaux du
// moteur), gardés s'ils sont loin du bord de leur fenêtre (angles voisins qui marquent aussi).
// Calculés une fois par côté : ils suivent keeperLine, PEN_D et la cage du moteur, rien n'est réglé
// à la main
const shotWindows = new Map();
function shotAngles(s) {
  if (shotWindows.has(s)) return shotWindows.get(s);
  const spot = penaltySpot(s);
  const keeper = { ...penaltyPlace(1 - s, s), vx: 0, vy: 0 };
  const fwd = s === 1 ? 1 : -1;
  const n = SHOT_TRIES;
  const step = (2 * SHOT_ANGLE) / (n - 1);
  const pass = [];
  for (let i = 0; i < n; i++) {
    const t = -SHOT_ANGLE + i * step;
    const b = { ...createBall(), x: spot.x, y: spot.y, vx: Math.sin(t) * BALL_MAX, vy: fwd * Math.cos(t) * BALL_MAX };
    clearFx(b);
    let ok = false;
    for (let k = 0; k * STEP < PEN_END_S; k++) {
      stepBall(b, STEP);
      if (collidePaddle(b, keeper, 1 - s) > 0) break;
      const g = goalScorer(b);
      if (g >= 0) { ok = g === s; break; }
    }
    pass.push(ok);
  }
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) left[i] = pass[i] ? (i ? left[i - 1] : 0) + 1 : 0;
  for (let i = n - 1; i >= 0; i--) right[i] = pass[i] ? (i < n - 1 ? right[i + 1] : 0) + 1 : 0;
  let best = 0;
  for (let i = 0; i < n; i++) best = Math.max(best, Math.min(left[i], right[i]));
  const list = [];
  for (let i = 0; i < n; i++) {
    if (pass[i] && Math.min(left[i], right[i]) >= Math.max(1, best - 1)) list.push(-SHOT_ANGLE + i * step);
  }
  const out = { list, step };
  shotWindows.set(s, out);
  return out;
}

// But en or : cible pour aller frapper le ballon vers la cage adverse, où qu'il soit (calcul du
// côté haut, comme botTarget ; side 0 en miroir)
function attackTarget(b, p, side, L, rnd) {
  const r = (a, c) => a + rnd() * (c - a);
  const flip = side === 0;
  const fx = b.x + b.vx * L.predict;
  const fy = (flip ? H - b.y : b.y) + (flip ? -b.vy : b.vy) * L.predict;
  const px = p.x;
  const py = flip ? H - p.y : p.y;
  let tx;
  let ty;
  if (fy < py - 4) {
    // Ballon derrière lui : il le contourne
    tx = fx + (px < fx ? -1 : 1) * (BR + PR + 14);
    ty = fy - (BR + PR);
  } else {
    const ax = W / 2 + r(-1, 1) * (GW / 2 - 14) + r(-L.aim, L.aim) * 0.5;
    let dx = ax - fx;
    let dy = H + 30 - fy;
    const dl = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= dl;
    dy /= dl;
    const toX = fx - px;
    const toY = fy - py;
    const tl = Math.sqrt(toX * toX + toY * toY) || 1;
    const k = (toX * dx + toY * dy) / tl > 0.9 && tl < 95 ? 60 : -(BR + PR + 4);
    tx = fx + dx * k;
    ty = fy + dy * k;
  }
  return { x: clamp(tx, PR, W - PR), y: flip ? H - ty : ty };
}

export class LocalMatch {
  constructor({ mode = 'bot', level = 'barber', onEvent, rnd = Math.random, rules = 1 } = {}) {
    this.mode = mode === 'local' ? 'local' : 'bot';
    this.level = LEVELS[level] ? level : 'barber';
    this.onEvent = onEvent || null;
    this.rnd = typeof rnd === 'function' ? rnd : Math.random;
    this.rules = Number(rules) === RULES_V2 ? RULES_V2 : 1;
    this.v2 = this.rules === RULES_V2;
    this.goalsToWin = this.v2 ? GOALS_TO_WIN_V2 : GOALS_TO_WIN;
    this.started = false;
    this.paused = false;
    this.taughtBox = false;
    // Bruits du moteur : bords et poteaux seulement. 'fire', 'charge', 'douse' et 'short' (règlement
    // v2) sont lus sur le ballon après chaque pas (_watchFx), jamais pris pour un bord
    this._wallFx = (kind, v) => {
      if (kind === 'post') { if (v > 120) this.emit('post', v); } else if (kind === 'wall') this.emit('wall', v);
    };
    this._reset();
  }

  /** Vrai pour un joueur tenu par un doigt (toi contre le salon ; les deux à deux). */
  isHuman(side) { return this.mode === 'local' || side === 0; }

  emit(type, data) {
    try { this.onEvent?.(type, data); } catch { /* un effet raté ne casse pas le match */ }
  }

  // ─── Commandes de l'écran ─────────────────────────────────────────

  /** Nouveau match (aussi la revanche). Contre le salon, le premier ballon est pour toi. */
  start() {
    this._reset();
    this.started = true;
    this.paused = false;
    const first = this.mode === 'bot' ? 0 : (this.rnd() < 0.5 ? 0 : 1);
    this._kickoff(first, 'count', FIRST_COUNT_S);
    if (this.v2) {
      this.nextTotal = nextEventGap(this.rnd);
      this.nextAt = this.nextTotal;
      // Angles de penalty du salon calculés pendant l'avant-match (une fois), pas au coup de sifflet
      if (this.mode === 'bot') shotAngles(1);
    }
    this.emit('start', { mode: this.mode, level: this.level, rules: this.rules, goalsToWin: this.goalsToWin });
  }

  /** Pause (fenêtre « Pause », téléphone tourné, app en arrière-plan) : plus rien ne bouge. */
  setPaused(on) {
    if (!this.started || this.phase === 'over') { this.paused = false; return; }
    this.paused = !!on;
    if (this.paused) this.held = [false, false];
  }

  /** Cible d'un joueur humain (repère du terrain, décalage du doigt déjà appliqué). */
  setTarget(side, x, y) {
    if (!this.isHuman(side) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const p = this.pads[side];
    p.tx = x;
    p.ty = y;
  }

  /** Doigt posé ou levé : levé, le joueur reste où il est ; à l'engagement il repart de chez lui. */
  setHeld(side, down) {
    if (side === 0 || side === 1) this.held[side] = !!down;
  }

  // ─── Boucle (appelée à chaque frame) ──────────────────────────────

  update(dt) {
    if (!this.started || this.paused || this.phase === 'over') return;
    const ts = this.phase === 'goal' && this.phaseT < GOAL_SLOW_S ? GOAL_SLOW : 1;
    this.phaseT += dt;
    this.acc += dt * ts;
    let n = 0;
    while (this.acc >= STEP && n < 60) {
      this._substep(STEP);
      this.acc -= STEP;
      n += 1;
    }
    if (n >= 60) this.acc = 0;
    if (this.mode === 'bot') this._botThink(1, dt * ts);
    this.cooldown = this.cooldown.map((v) => Math.max(0, v - dt));
    this.flash = this.flash.map((v) => Math.max(0, v - dt));

    if ((this.phase === 'count' && this.phaseT >= this.countS) || (this.phase === 'ready' && this.phaseT >= READY_S)
      || (this.phase === 'pen' && this.phaseT >= PEN_SET_S)) {
      this.phase = 'live';
      this.phaseT = 0;
      this.half = halfOf(this.ball);
      this.halfT = 0;
    } else if (this.phase === 'live') {
      // Règlement v2 : ni ballon gardé ni avertissement pendant un penalty ou le but en or
      if (!this.md) this._keepAway(dt);
    } else if (this.phase === 'goal' && this.phaseT >= GOAL_S) {
      if (this.md && this.md.k === 'gold') this._end(this.scorer, 'golden_goal');
      else if (this.score[this.scorer] >= this.goalsToWin) this._end(this.scorer);
      else this._kickoff(1 - this.scorer, 'ready'); // ballon posé devant celui qui a encaissé
    }
    if (this.v2) this._checkClock();
  }

  /** Image du match pour le dessin (même forme que le match en ligne). */
  getFrame() {
    if (!this.started) return null;
    const v2 = this.v2;
    return {
      phase: this.phase,
      phaseT: this.phaseT,
      // Durée du compte à rebours en cours (secondes), null hors `count`
      countS: this.phase === 'count' ? this.countS : null,
      keepT: this.phase === 'live' && !this.md ? this.halfT : 0,
      score: this.score,
      flashBox: this.flash,
      ball: this.ball,
      paddles: this.pads,
      // Secondes de jeu restantes, 30 s avant la fin des 5 minutes (null avant, et au but en or)
      timeLeft: v2 && this.warned && !(this.md && this.md.k === 'gold')
        ? Math.max(0, Math.ceil((MATCH_PLAY_MS - this.playMs) / 1000))
        : null,
      rules: this.rules,
      goalsToWin: this.goalsToWin,
      now: this.clock,
      events: this.evs,
      goalOff: v2 && this.evs.length ? goalOffsets(this.evs, this.clock) : null,
      mode: v2 ? this._frameMode() : null,
      warn: this.warn,
      camp: this.campT,
      pin: this.pinT,
      nextEvent: v2 && !this.md && this.phase !== 'over'
        ? { left: Math.max(0, (this.nextAt - this.evPlay) / 1000), total: this.nextTotal / 1000 }
        : null,
    };
  }

  // ─── Simulation ──────────────────────────────────────────────────

  _reset() {
    this.phase = 'count';
    this.phaseT = 0;
    this.countS = COUNT_S;
    this.score = [0, 0];
    this.scorer = -1;
    this.winner = -1;
    this.reason = null;
    this.half = 0;
    this.halfT = 0;
    this.acc = 0;
    this.ball = createBall();
    this.pads = [createPaddle(0), createPaddle(1)];
    this.pads.forEach((p) => { p.think = 0; });
    this.held = [false, false];
    this.cooldown = [0, 0];
    this.flash = [0, 0];
    // Règlement v2 (neutre en règle d'aujourd'hui) : horloge du match (ms, événements), temps de jeu
    // (limite de 5 min), temps de jeu normal (prochain événement), temps de but en or
    this.md = null; // null (jeu normal), { k: 'pen', s } ou { k: 'gold' } : contrainte des joueurs
    this.pen = null;
    this.clock = 0;
    this.playMs = 0;
    this.evPlay = 0;
    this.goldPlay = 0;
    this.warned = false;
    this.evs = [];
    this.evSeq = 0;
    this.lastKind = null;
    this.nextAt = 0;
    this.nextTotal = 0;
    this.warn = [0, 0];
    this.campT = [0, 0];
    this.pinT = [0, 0];
    this.hitStep = [false, false];
    this.shownFx = 0;
    this.shownAir = false;
    if (this.v2) {
      clearFx(this.ball);
      this.pads.forEach((p) => { p.boost = 0; p.boxOut = false; p.escape = 0; });
    }
  }

  // `countS` : durée du compte à rebours quand `phase` vaut `count` (4,5 s au coup d'envoi de `start`) ;
  // `md` : contrainte des joueurs après cet engagement (règlement v2 : but en or), sinon jeu normal
  _kickoff(toSide, phase, countS = COUNT_S, md = null) {
    placeKickoff(this.ball, toSide);
    this.pads.forEach((p, i) => {
      homePaddle(p, i);
      p.think = BOT_FIRST_THINK;
      // Doigt levé : le joueur attend chez lui ; doigt posé, il le rejoint aussitôt
      if (!this.held[i] || !this.isHuman(i)) { p.tx = p.x; p.ty = p.y; }
    });
    this.phase = phase;
    this.phaseT = 0;
    if (phase === 'count') this.countS = countS;
    this.half = toSide;
    this.halfT = 0;
    if (this.v2) {
      this.md = md;
      this.pen = null;
      this._clearFoulTimers();
      this._syncFx();
      this.pads.forEach((p) => { p.boost = 0; p.boxOut = false; p.escape = 0; });
    }
    this.emit('kickoff', { toSide });
  }

  // Ordre d'un pas (contrat, section 2) : joueurs (contrainte du mode), ballon (événements),
  // chocs (touchBall en règlement v2), bords (cages décalées), joueurs décollés du ballon. Mode des
  // joueurs à l'heure du pas (modeAt) : penalty, but en or, ou LINE_MODE pendant les cages qui
  // bougent (personne sur sa ligne de but)
  _substep(dt) {
    const L = LEVELS[this.level];
    const md = this.v2 ? modeAt(this.md, this.evs, this.clock) : this.md;
    this.pads.forEach((p, i) => {
      const human = this.isHuman(i);
      if (movePaddle(p, i, dt, human ? HUMAN_SPEED : (p.boost > 0 ? p.boost : L.speed), md) && human) {
        this.flash[i] = 0.5;
        if (!this.taughtBox) {
          this.taughtBox = true;
          this.emit('toast', this.mode === 'local' ? "Interdit d'entrer dans sa petite surface" : "Interdit d'entrer dans ta petite surface");
        }
      }
    });
    const b = this.ball;
    const [p0, p1] = this.pads;
    const t = this.clock;
    if (this.phase === 'count' || this.phase === 'ready' || this.phase === 'pen') {
      unpin(b, p0, 0, md);
      unpin(b, p1, 1, md);
      if (this.v2) {
        this._tick(t, dt);
        this._clearFoulTimers();
      }
      return;
    }
    const fld = this.v2 ? this.evs : undefined;
    this.hitStep[0] = false;
    this.hitStep[1] = false;
    stepBall(b, dt, this._wallFx, fld, t);
    this._collide(0);
    this._collide(1);
    walls(b, null, fld && fld.length ? goalOffsets(fld, t) : null);
    unpin(b, p0, 0, md);
    unpin(b, p1, 1, md);
    if (this.v2) {
      this._tick(t, dt);
      this._rules(dt);
      return;
    }
    if (this.phase === 'live') {
      const g = goalScorer(b);
      if (g >= 0) this._goal(g);
    }
  }

  _collide(i) {
    const b = this.ball;
    const p = this.pads[i];
    const v = collidePaddle(b, p, i);
    if (!(v > 0)) return;
    if (this.v2 && this.phase === 'live') this._touched(i, v);
    if (this.cooldown[i] > 0) return;
    this.cooldown[i] = HIT_COOLDOWN;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    this.emit('hit', { v, x: b.x - (dx / d) * BR, y: b.y - (dy / d) * BR, mine: this.isHuman(i), side: i });
  }

  _botThink(i, dt) {
    const p = this.pads[i];
    if (this.v2 && this._botRules(i, p, dt)) return;
    p.think -= dt;
    if (p.think > 0) return;
    const t = botTarget(this.ball, p, i, this.level, this.phase === 'live', this.rnd);
    p.tx = t.x;
    p.ty = t.y;
    p.think = t.react;
  }

  _keepAway(dt) {
    const half = this.ball.y > H / 2 ? 0 : 1;
    if (half !== this.half) {
      this.half = half;
      this.halfT = 0;
      return;
    }
    this.halfT += dt;
    if (this.halfT >= KEEP_LIMIT) {
      // Règlement v2 : un avertissement pour le camp qui gardait (penalty au 3e)
      if (this.v2) {
        this._foul(half, 'keep');
        return;
      }
      this.emit('toast', 'Ballon gardé 5 s : il change de camp');
      this._kickoff(1 - half, 'ready');
    }
  }

  _goal(scorer) {
    // Règlement v2 : valeur lue au franchissement (2 pour un ballon électrique)
    const value = this.v2 ? goalValue(this.ball) : 1;
    const fx = this.v2 ? this.ball.fx || 0 : 0;
    this.score[scorer] += value;
    this.scorer = scorer;
    this.phase = 'goal';
    this.phaseT = 0;
    this.emit('goal', { scorer, score: [...this.score], value, fx });
  }

  // `winner` : 0, 1, ou -1 pour un match nul (but en or sans but)
  _end(winner, reason = null) {
    const draw = winner !== 0 && winner !== 1;
    this.phase = 'over';
    this.winner = draw ? -1 : winner;
    this.reason = reason;
    this.emit('end', { winner: draw ? null : winner, score: [...this.score], reason, draw });
  }

  // ─── Règlement v2 : arbitre (contrat, section 1) ─────────────────

  // Après chaque pas : horloge du match, éclairs, événements finis, effets du ballon
  _tick(t, dt) {
    const t1 = t + dt * 1000;
    this.clock = t1;
    for (const e of this.evs) {
      if (e.k !== 'storm') continue;
      for (const s of e.b) if (s[2] > t && s[2] <= t1) this.emit('bolt', { x: s[0], y: s[1] });
    }
    if (this.evs.some((e) => e.until <= t1)) this.evs = liveEvents(this.evs, t1);
    this._watchFx();
  }

  // Changements du ballon (feu, charge, perte sans bond, bond du court-circuit), une fois chacun
  _watchFx() {
    const b = this.ball;
    const fx = b.fx || 0;
    const air = b.air > 0;
    const hop = air && !this.shownAir;
    if (fx !== this.shownFx) {
      if (fx === FX_FIRE) this.emit('fire', { x: b.x, y: b.y });
      else if (fx === FX_ELEC) this.emit('charge', { x: b.x, y: b.y });
      else if (!hop) this.emit('douse', { x: b.x, y: b.y, was: this.shownFx });
    }
    if (hop) this.emit('short', { x: b.x, y: b.y });
    this.shownFx = fx;
    this.shownAir = air;
  }

  // Ballon replacé (engagement, penalty) : son effet effacé sans bruit
  _syncFx() {
    this.shownFx = this.ball.fx || 0;
    this.shownAir = this.ball.air > 0;
  }

  _clearFoulTimers() {
    this.campT[0] = 0;
    this.campT[1] = 0;
    this.pinT[0] = 0;
    this.pinT[1] = 0;
  }

  // Frappe acceptée de `i` en jeu : feu (touchBall), chrono de camping remis à zéro, tir ou arrêt
  // d'un penalty
  _touched(i, v) {
    touchBall(this.ball, i, v);
    this.hitStep[i] = true;
    this.campT[i] = 0;
    const P = this.pen;
    if (!P || P.done || !this.md || this.md.k !== 'pen') return;
    if (i === P.s && !P.shot) {
      P.shot = true;
      P.shotT = P.t;
      // Le salon tireur s'arrête net après sa frappe
      const p = this.pads[i];
      if (!this.isHuman(i)) { p.boost = 0; p.tx = p.x; p.ty = p.y; }
      // Le salon gardien voit partir le tir : il réagit après son temps de réaction, ou plonge
      const k = this.pads[1 - i];
      if (!this.isHuman(1 - i)) {
        k.think = (KEEPER_REACT[this.level] || KEEPER_REACT.barber) * (0.8 + this.rnd() * 0.4);
        if (this.rnd() < (KEEPER_GUESS[this.level] || 0)) {
          k.tx = W / 2 + (this.rnd() < 0.5 ? -1 : 1) * (GW / 2) * (0.5 + this.rnd() * 0.5);
          k.think = Math.max(k.think, KEEPER_GUESS_S);
        }
      }
    } else if (i !== P.s && P.shot && !P.saved) {
      // Touche du gardien : l'arrêt n'est acquis (pen_end 'saved') que si le ballon ne franchit pas
      // la ligne pendant PEN_SAVE_S, comme au serveur ; le mode reste `pen` jusque-là
      P.saved = true;
      P.savedT = P.t;
    }
  }

  // Après les chocs d'un pas : temps de jeu, but, penalty, but en or, événements et fautes
  _rules(dt) {
    if (this.phase !== 'live') {
      this._clearFoulTimers();
      return;
    }
    const ms = dt * 1000;
    this.playMs += ms;
    const md = this.md;
    if (md && md.k === 'pen') {
      this._clearFoulTimers();
      this._penStep(dt);
      return;
    }
    const g = goalScorer(this.ball);
    if (md && md.k === 'gold') {
      this.goldPlay += ms;
      this._clearFoulTimers();
      if (g >= 0) this._goal(g);
      return;
    }
    if (g >= 0) {
      this._clearFoulTimers();
      this._goal(g);
      return;
    }
    // Jeu normal : prochain événement, chronos des fautes
    this.evPlay += ms;
    if (this.evPlay >= this.nextAt) this._spawnEvent();
    const b = this.ball;
    for (let i = 0; i < 2; i++) {
      const p = this.pads[i];
      // Camper : foulClock (redescend deux fois plus vite hors de la surface), remis à zéro par une
      // frappe de ce joueur
      this.campT[i] = this.hitStep[i] ? 0 : foulClock(this.campT[i], inBigBox(p, i), dt);
      this.pinT[i] = pinClock(this.pinT[i], pinnedBy(b, p, i), dt);
    }
    for (let i = 0; i < 2; i++) {
      if (this.campT[i] >= CAMP_S) { this._foul(i, 'camp'); return; }
      if (this.pinT[i] >= BLOCK_S) { this._foul(i, 'block'); return; }
    }
  }

  // Un ou deux événements (makeEvents : l'arrosage s'ajoute parfois à un orage ou un gel), un
  // message `event` par descripteur ; l'écart jusqu'au prochain compte une fois
  _spawnEvent() {
    const kind = pickEventKind(this.rnd, this.lastKind);
    this.lastKind = kind;
    const list = makeEvents(kind, this.evSeq + 1, this.clock, this.rnd, this.pads);
    this.evSeq += list.length;
    for (const e of list) {
      this.evs.push(e);
      this.emit('event', { e });
    }
    this.nextTotal = nextEventGap(this.rnd);
    this.nextAt = this.evPlay + this.nextTotal;
  }

  // Penalty, but en or : tous les événements finissent
  _endEvents() {
    for (const e of this.evs) if (this.clock < e.until) this.emit('event_end', { id: e.id });
    this.evs = [];
  }

  // Faute de `side` : camper et bloquer donnent un penalty ; ballon gardé, un avertissement (le
  // ballon change de camp comme aujourd'hui), penalty au 3e et son compteur repart à 0 (`foul.warn`
  // vaut alors 3, comme au serveur ; 0 dans l'image). Messages dans l'ordre du serveur : `foul`,
  // puis `penalty` (hors ligne, sans le délai de grâce du réseau)
  _foul(side, k) {
    let pen = k !== 'keep';
    let warn = this.warn[side];
    if (k === 'keep') {
      warn += 1;
      this.warn[side] = warn;
      if (warn >= WARN_MAX) {
        pen = true;
        this.warn[side] = 0;
      }
    }
    this.emit('foul', { side, k, warn, pen });
    if (pen) this._penalty(1 - side);
    else {
      this.emit('toast', 'Ballon gardé 5 s : il change de camp');
      this._kickoff(1 - side, 'ready');
    }
  }

  // Penalty pour `s` : ballon sur le point, joueurs à leur place (gardien sur sa ligne, tireur
  // derrière le ballon), phase `pen` de 1,8 s puis 3 s pour tirer
  _penalty(s) {
    this._endEvents();
    placePenalty(this.ball, s);
    this.md = { k: 'pen', s };
    this.pen = { s, t: 0, shot: false, shotT: 0, saved: false, savedT: 0, done: false, plan: null };
    this.pads.forEach((p, i) => {
      const q = penaltyPlace(i, s);
      p.x = q.x;
      p.y = q.y;
      p.vx = 0;
      p.vy = 0;
      p.think = BOT_FIRST_THINK;
      p.boost = 0;
      p.boxOut = false;
      p.escape = 0;
      if (!this.held[i] || !this.isHuman(i)) { p.tx = p.x; p.ty = p.y; }
    });
    if (!this.isHuman(s)) this.pen.plan = this._shotPlan(s);
    this.phase = 'pen';
    this.phaseT = 0;
    this.halfT = 0;
    this._clearFoulTimers();
    this._syncFx();
    this.emit('penalty', { s });
  }

  // Un pas de penalty en jeu : but (aussi dans les PEN_SAVE_S qui suivent la touche du gardien),
  // arrêt acquis au bout de ce délai (engagement du gardien), tir manqué
  _penStep(dt) {
    const P = this.pen;
    if (!P || P.done) return;
    P.t += dt;
    const g = goalScorer(this.ball);
    if (g >= 0) {
      // Le tireur marque ; un ballon renvoyé dans sa propre cage compte pour le gardien
      this._penEnd(g === P.s ? 'goal' : 'missed');
      this._goal(g);
      return;
    }
    if (P.saved) {
      if (P.t - P.savedT >= PEN_SAVE_S) {
        this._penEnd('saved');
        this._penOver();
      }
      return;
    }
    if ((!P.shot && P.t >= PEN_SHOT_S) || (P.shot && P.t - P.shotT >= PEN_END_S)) {
      this._penEnd('missed');
      this._penOver();
    }
  }

  _penEnd(r) {
    this.pen.done = true;
    // Après un penalty, pas d'événement avant 5 s de jeu
    if (this.nextAt < this.evPlay + PEN_EVENT_GAP_MS) {
      this.nextAt = this.evPlay + PEN_EVENT_GAP_MS;
      this.nextTotal = Math.max(this.nextTotal, PEN_EVENT_GAP_MS);
    }
    this.emit('pen_end', { r });
  }

  // Arrêté ou raté : engagement du gardien, mode effacé
  _penOver() {
    this._kickoff(1 - this.pen.s, 'ready');
  }

  // Temps de jeu : 30 s avant la fin, `time_left` ; à 5 min, celui qui mène gagne, égalité = but en
  // or. Jamais pendant un penalty (la limite attend sa fin) ; but en or : 2 min sans but = nul
  _checkClock() {
    if (this.phase === 'over') return;
    const md = this.md;
    if (md && md.k === 'gold') {
      if (this.phase === 'live' && this.goldPlay >= GOLD_MAX_S * 1000) this._end(-1, 'time_limit_draw');
      return;
    }
    if (md || (this.phase !== 'live' && this.phase !== 'ready')) return;
    const left = MATCH_PLAY_MS - this.playMs;
    if (left <= 0) {
      const [a, c] = this.score;
      if (a !== c) this._end(a > c ? 0 : 1, 'time_limit');
      else this._startGold();
      return;
    }
    if (!this.warned && left <= TIME_WARN_MS) {
      this.warned = true;
      this.emit('time_left', { s: Math.ceil(left / 1000) });
    }
  }

  // But en or : événements finis, engagement au hasard en 3 s, tout le terrain sauf les petites
  // surfaces, plus aucune règle, le premier but gagne
  _startGold() {
    this._endEvents();
    this.goldPlay = 0;
    this._kickoff(this.rnd() < 0.5 ? 0 : 1, 'count', COUNT_S, { k: 'gold' });
    this.emit('gold', {});
  }

  _frameMode() {
    const md = this.md;
    if (!md) return null;
    if (md.k === 'gold') return { k: 'gold', left: Math.max(0, GOLD_MAX_S - this.goldPlay / 1000) };
    const P = this.pen;
    if (!P || P.done) return null;
    const left = this.phase === 'pen' ? PEN_SHOT_S : P.shot ? -1 : Math.max(0, PEN_SHOT_S - P.t);
    return { k: 'pen', s: P.s, left };
  }

  // ─── Règlement v2 : le salon ─────────────────────────────────────

  // Rend true quand la cible est décidée ici (penalty, but en or, sortie de surface, ballon coincé) ;
  // sinon botTarget du moteur, comme aujourd'hui
  _botRules(i, p, dt) {
    const md = this.md;
    if (this.phase === 'pen' && this.pen) {
      const q = penaltyPlace(i, this.pen.s);
      p.tx = q.x;
      p.ty = q.y;
      p.boost = 0;
      return true;
    }
    if (md && md.k === 'pen') {
      if (i === this.pen.s) this._botShoot(p);
      else this._botKeep(i, p, dt);
      return true;
    }
    if (md && md.k === 'gold') return this._botGold(i, p, dt);
    return this._botEscape(i, p, dt);
  }

  // Tir au but : un angle au milieu d'une des fenêtres qui marquent contre le gardien à sa place
  // (shotAngles : un coin, ou par la bande), puis l'imprécision du niveau
  _shotPlan(s) {
    const L = LEVELS[this.level];
    const r = (a, c) => a + this.rnd() * (c - a);
    const { list, step } = shotAngles(s);
    let a = list.length ? list[Math.floor(this.rnd() * list.length)] + r(-0.5, 0.5) * step : r(-SHOT_ANGLE, SHOT_ANGLE);
    // Précision du niveau : L.aim (écart en x à la distance du point, plus SHOT_AIM_MIN) en angle
    a += r(-1, 1) * Math.atan((L.aim * SHOT_AIM + SHOT_AIM_MIN) / PEN_D);
    return { dx: Math.sin(a), dy: (s === 1 ? 1 : -1) * Math.cos(a), wait: r(0.4, 1.4), power: HIT_CAP };
  }

  // Tireur : il prend son élan derrière le ballon, attend 0,4 à 1,4 s, puis frappe à travers
  _botShoot(p) {
    const P = this.pen;
    const plan = P.plan;
    if (!plan || P.shot || P.done || this.phase !== 'live') {
      p.boost = 0;
      if (P.shot || P.done) { p.tx = p.x; p.ty = p.y; }
      return;
    }
    const b = this.ball;
    if (P.t < plan.wait) {
      p.boost = 0;
      p.tx = b.x - plan.dx * SHOT_BACK;
      p.ty = b.y - plan.dy * SHOT_BACK;
    } else {
      p.boost = plan.power;
      p.tx = b.x + plan.dx * SHOT_THROUGH;
      p.ty = b.y + plan.dy * SHOT_THROUGH;
    }
  }

  // Gardien : sur sa ligne (keeperLine, entre les poteaux), entre le ballon et le milieu de sa cage ;
  // tir parti, il va où le ballon passera (rebonds compris), avec son temps de réaction
  _botKeep(i, p, dt) {
    p.boost = 0;
    p.think -= dt;
    if (p.think > 0) return;
    const L = LEVELS[this.level];
    const r = (a, c) => a + this.rnd() * (c - a);
    p.think = L.react * r(0.8, 1.2);
    const b = this.ball;
    const y = keeperLine(i);
    const goalY = i === 1 ? 0 : H;
    let x;
    if (i === 1 ? b.vy < -40 : b.vy > 40) {
      x = foldX(b.x + b.vx * ((y - b.y) / b.vy)) + r(-L.aim, L.aim) / 3;
    } else {
      x = W / 2 + (b.x - W / 2) * (Math.abs(goalY - y) / Math.max(1, Math.abs(goalY - b.y)));
    }
    p.tx = clamp(x, GL, GR);
    p.ty = y;
  }

  // But en or : ballon lent (ou qui part vers la cage adverse) dans la moitié adverse, il monte le
  // chercher ; sinon botTarget, comme d'habitude
  _botGold(i, p, dt) {
    if (this.phase !== 'live') return false;
    const b = this.ball;
    if (i === 1 ? b.y <= H / 2 : b.y >= H / 2) return false;
    p.think -= dt;
    if (p.think > 0) return true;
    const L = LEVELS[this.level];
    const away = i === 1 ? b.vy > 0 : b.vy < 0;
    const t = Math.sqrt(b.vx * b.vx + b.vy * b.vy) < GOLD_CHASE || away
      ? attackTarget(b, p, i, L, this.rnd)
      : botTarget(b, p, i, this.level, true, this.rnd);
    p.tx = t.x;
    p.ty = t.y;
    p.think = L.react * (0.8 + this.rnd() * 0.4);
    return true;
  }

  // Jeu normal : chrono de camping (foulClock, qui redescend au lieu de repartir à zéro) à 1,4 s, il
  // sort de sa grande surface et n'y revient qu'une fois le chrono redescendu à 0,4 s (la faute est
  // à 3 s) ; ballon coincé par lui 0,5 s, il recule (la faute est à 1,5 s)
  _botEscape(i, p, dt) {
    if (this.phase !== 'live') {
      p.boxOut = false;
      p.escape = 0;
      return false;
    }
    if (this.campT[i] >= BOT_BOX_S) p.boxOut = true;
    if (p.boxOut && this.campT[i] > BOT_BOX_LOW) {
      p.tx = clamp(p.x, PR, W - PR);
      p.ty = i === 1 ? BBD + BOT_OUT : H - BBD - BOT_OUT;
      return true;
    }
    if (p.boxOut) {
      p.boxOut = false;
      p.think = 0;
    }
    if (p.escape > 0) {
      p.escape -= dt;
      if (p.escape > 0) return true;
      p.think = 0;
      return false;
    }
    if (this.pinT[i] >= BOT_PIN_S) {
      const b = this.ball;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const midY = i === 1 ? H * 0.25 : H * 0.75;
      p.tx = clamp(p.x + (dx / d) * BOT_PIN_BACK + (W / 2 - p.x) * 0.3, PR, W - PR);
      p.ty = p.y + (dy / d) * BOT_PIN_BACK + (midY - p.y) * 0.3;
      p.escape = BOT_ESCAPE_S;
      return true;
    }
    return false;
  }
}
