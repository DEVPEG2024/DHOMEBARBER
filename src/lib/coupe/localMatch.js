/*
 * Match hors ligne de La Coupe du Gang : contre le salon (ordinateur, 3 niveaux) ou à deux sur un
 * téléphone. Aucun réseau, aucun point. Porté du prototype validé par le propriétaire
 * (docs/prototypes/coupe-du-gang.html) sur le moteur partagé (engine.js) : mêmes règles et même
 * physique que le match en ligne (petite surface interdite, ballon rendu après 5 s dans une moitié,
 * premier à 3, ralenti sur un but).
 *
 * Indépendant de React et du DOM : l'écran lui donne les cibles des joueurs et le dessine.
 *
 *   const match = new LocalMatch({ mode: 'bot', level: 'barber', onEvent: (type, data) => … });
 *   match.start();
 *   // à chaque frame : match.update(dt); renderer.render(match.getFrame(), dt);
 *
 * Repère : joueur 0 en bas (toi, ou le joueur du bas à deux), joueur 1 en haut (le salon, ou le
 * joueur du haut). `getFrame()` a la même forme que celle du match en ligne.
 *
 * Événements (`onEvent`) : start, kickoff, hit {v, x, y, mine, side}, wall (vitesse), post,
 * goal {scorer, score}, end {winner, score}, toast (texte).
 */
import {
  H, BR, STEP, HUMAN_SPEED, KEEP_LIMIT, GOALS_TO_WIN, LEVELS,
  createBall, createPaddle, homePaddle, placeKickoff, movePaddle, stepBall, collidePaddle, walls,
  unpin, goalScorer, halfOf, botTarget,
} from './engine.js';

// Compte à rebours du coup d'envoi (comme en ligne), engagement, but (bannière puis réengagement)
const COUNT_S = 3;
const READY_S = 0.8;
const GOAL_S = 1.9;
// Ralenti après un but (comme le prototype)
const GOAL_SLOW_S = 0.75;
const GOAL_SLOW = 0.22;
// Un seul effet de frappe toutes les 60 ms par joueur (sons, étincelles, vibration)
const HIT_COOLDOWN = 0.06;
// Le salon réfléchit un peu après chaque engagement
const BOT_FIRST_THINK = 0.3;

export const LOCAL_MODES = ['bot', 'local'];

export class LocalMatch {
  constructor({ mode = 'bot', level = 'barber', onEvent, rnd = Math.random } = {}) {
    this.mode = mode === 'local' ? 'local' : 'bot';
    this.level = LEVELS[level] ? level : 'barber';
    this.onEvent = onEvent || null;
    this.rnd = typeof rnd === 'function' ? rnd : Math.random;
    this.started = false;
    this.paused = false;
    this.taughtBox = false;
    this._wallFx = (kind, v) => {
      if (kind === 'post') { if (v > 120) this.emit('post', v); } else this.emit('wall', v);
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
    this._kickoff(first, 'count');
    this.emit('start', { mode: this.mode, level: this.level });
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

    if ((this.phase === 'count' && this.phaseT >= COUNT_S) || (this.phase === 'ready' && this.phaseT >= READY_S)) {
      this.phase = 'live';
      this.phaseT = 0;
      this.half = halfOf(this.ball);
      this.halfT = 0;
    } else if (this.phase === 'live') {
      this._keepAway(dt);
    } else if (this.phase === 'goal' && this.phaseT >= GOAL_S) {
      if (this.score[this.scorer] >= GOALS_TO_WIN) this._end(this.scorer);
      else this._kickoff(1 - this.scorer, 'ready'); // ballon posé devant celui qui a encaissé
    }
  }

  /** Image du match pour le dessin (même forme que le match en ligne). */
  getFrame() {
    if (!this.started) return null;
    return {
      phase: this.phase,
      phaseT: this.phaseT,
      keepT: this.phase === 'live' ? this.halfT : 0,
      score: this.score,
      flashBox: this.flash,
      ball: this.ball,
      paddles: this.pads,
    };
  }

  // ─── Simulation ──────────────────────────────────────────────────

  _reset() {
    this.phase = 'count';
    this.phaseT = 0;
    this.score = [0, 0];
    this.scorer = -1;
    this.winner = -1;
    this.half = 0;
    this.halfT = 0;
    this.acc = 0;
    this.ball = createBall();
    this.pads = [createPaddle(0), createPaddle(1)];
    this.pads.forEach((p) => { p.think = 0; });
    this.held = [false, false];
    this.cooldown = [0, 0];
    this.flash = [0, 0];
  }

  _kickoff(toSide, phase) {
    placeKickoff(this.ball, toSide);
    this.pads.forEach((p, i) => {
      homePaddle(p, i);
      p.think = BOT_FIRST_THINK;
      // Doigt levé : le joueur attend chez lui ; doigt posé, il le rejoint aussitôt
      if (!this.held[i] || !this.isHuman(i)) { p.tx = p.x; p.ty = p.y; }
    });
    this.phase = phase;
    this.phaseT = 0;
    this.half = toSide;
    this.halfT = 0;
    this.emit('kickoff', { toSide });
  }

  _substep(dt) {
    const L = LEVELS[this.level];
    this.pads.forEach((p, i) => {
      const human = this.isHuman(i);
      if (movePaddle(p, i, dt, human ? HUMAN_SPEED : L.speed) && human) {
        this.flash[i] = 0.5;
        if (!this.taughtBox) {
          this.taughtBox = true;
          this.emit('toast', this.mode === 'local' ? "Interdit d'entrer dans sa petite surface" : "Interdit d'entrer dans ta petite surface");
        }
      }
    });
    const b = this.ball;
    const [p0, p1] = this.pads;
    if (this.phase === 'count' || this.phase === 'ready') {
      unpin(b, p0, 0);
      unpin(b, p1, 1);
      return;
    }
    stepBall(b, dt, this._wallFx);
    this._collide(0);
    this._collide(1);
    walls(b);
    unpin(b, p0, 0);
    unpin(b, p1, 1);
    if (this.phase === 'live') {
      const g = goalScorer(b);
      if (g >= 0) this._goal(g);
    }
  }

  _collide(i) {
    const b = this.ball;
    const p = this.pads[i];
    const v = collidePaddle(b, p, i);
    if (!(v > 0) || this.cooldown[i] > 0) return;
    this.cooldown[i] = HIT_COOLDOWN;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    this.emit('hit', { v, x: b.x - (dx / d) * BR, y: b.y - (dy / d) * BR, mine: this.isHuman(i), side: i });
  }

  _botThink(i, dt) {
    const p = this.pads[i];
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
      this.emit('toast', 'Ballon gardé 5 s : il change de camp');
      this._kickoff(1 - half, 'ready');
    }
  }

  _goal(scorer) {
    this.score[scorer] += 1;
    this.scorer = scorer;
    this.phase = 'goal';
    this.phaseT = 0;
    this.emit('goal', { scorer, score: [...this.score] });
  }

  _end(winner) {
    this.phase = 'over';
    this.winner = winner;
    this.emit('end', { winner, score: [...this.score] });
  }
}
