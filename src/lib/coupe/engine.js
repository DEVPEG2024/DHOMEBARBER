/*
 * Moteur de La Coupe du Gang (foot façon air hockey, docs/fonctions/coupe-du-gang.md).
 *
 * DEUX COPIES IDENTIQUES, octet pour octet : src/lib/coupe/engine.js (app) et
 * lib/coupeEngine.mjs (serveur dhomebarber-api, chargé par import()). Toute modification se fait
 * dans les deux ; test/test-coupe-engine.js du serveur compare les fichiers.
 *
 * Fonctions pures sur des objets simples, sans horloge ni DOM : le serveur rejoue la même physique
 * que le téléphone. Repère : terrain W × H, joueur 0 en bas (y grand), joueur 1 en haut. Le
 * téléphone du joueur 1 tourne le terrain de 180° (flipPoint / flipVel) pour se voir en bas.
 */

export const W = 360;
export const H = 640;
export const GW = 124; // largeur de la cage
export const GL = (W - GW) / 2;
export const GR = GL + GW;
export const GD = 28; // profondeur du filet
export const SBW = 150; // petite surface (interdite à son propre joueur)
export const SBD = 52;
export const BBW = 228; // grande surface (dessin seulement)
export const BBD = 100;
export const BR = 11; // rayon du ballon
export const PR = 24; // rayon d'un joueur
export const POST = 3.5;
export const BALL_MAX = 980; // unités par seconde
export const E_WALL = 0.8;
export const E_HIT = 0.9;
export const STEP = 1 / 240; // pas fixe de la physique, en secondes
export const FRICTION_STEP = Math.exp(-0.5 * STEP);
export const HUMAN_SPEED = 3000; // vitesse maximale d'un joueur qui suit le doigt
export const HIT_CAP = 1800; // vitesse du joueur prise en compte dans une frappe
export const KEEP_LIMIT = 5; // secondes dans la même moitié avant que le ballon change de camp
export const GOALS_TO_WIN = 3;
export const FINGER_OFFSET = 34; // le joueur se place au-dessus du doigt
export const POSTS = [[GL, 0], [GR, 0], [GL, H], [GR, H]];
export const LEVELS = {
  apprenti: { name: 'Apprenti', tag: 'APP', speed: 520, react: 0.24, aim: 70, predict: 0, guardY: 132 },
  barber: { name: 'Barber', tag: 'BRB', speed: 900, react: 0.13, aim: 34, predict: 0.08, guardY: 118 },
  boss: { name: 'Boss', tag: 'BOSS', speed: 1450, react: 0.05, aim: 12, predict: 0.16, guardY: 108 },
};

// ---------- Règlement v2 : constantes (docs/fonctions/coupe-du-gang-regles-v2-contrat.md) ----------

export const RULES_V2 = 2; // `start.rules` : 2 = règlement v2 ; absent = règle d'aujourd'hui
export const GOALS_TO_WIN_V2 = 5;
export const FX_NONE = 0;
export const FX_FIRE = 1; // balle en feu : vaut 1 but, brûle mousse et gel, s'éteint dans l'eau
export const FX_ELEC = 2; // balle électrique : vaut 2 buts, plus rapide, court-circuit dans l'eau
// Vitesse d'impact (collidePaddle) d'une frappe très forte : le joueur plafonne à HIT_CAP (1800),
// il faut donc reprendre à pleine vitesse un ballon qui arrive (banc d'essai du 31 oct. : à 1700,
// tout geste vif allumait le ballon, une vingtaine de fois par match)
export const FIRE_HIT = 2200;
export const BALL_MAX_ELEC = 1250;
export const ELEC_BOOST = 1.3;
export const HOP_S = 0.5; // bond du court-circuit : ballon intouchable pendant 0,5 s
export const FOAM_DRAG = 3.4; // freinage par seconde dans la mousse
export const FOAM_MIN = 45; // … sans jamais arrêter le ballon
export const GEL_GAIN = 2.2; // accélération par seconde sur le gel
export const GEL_FIRE = 640; // vitesse à laquelle le gel enflamme le ballon
export const CHARGE_R = 32; // rayon d'un point frappé par la foudre
export const CHARGE_MS = 3000; // point chargé pendant 3 s
export const JET_MIN = 14; // un jet commence à 14 de la tête de l'arroseur
export const JET_W = 14; // demi-largeur d'un jet
export const JET_PUSH = 1300; // poussée d'un jet (unités par seconde²)
export const GOAL_SLIDE = 90; // décalage maximal d'une cage qui bouge
export const CAMP_S = 3; // camper : plus de 3 s dans sa grande surface
export const BLOCK_S = 1.5; // bloquer : ballon coincé plus de 1,5 s contre son mur
export const PIN_BAND = 12; // bloquer : ballon à moins de BR + 12 d'un de ses bords…
export const PIN_GAP = 20; // … son joueur à moins de PR + BR + 20, côté terrain
export const PIN_DECAY = 2; // le chrono de blocage redescend deux fois plus vite qu'il ne monte
export const WARN_MAX = 3; // 3e avertissement (ballon gardé 5 s) : penalty
// Point de penalty : distance à la ligne de but. Banc d'essai de F2 (31 oct.), gardien sur sa ligne :
// à 190, un bon tireur ne marquait que 26 % contre le salon Barber ; à 160, 48 % (59 % entre deux
// humains). Plus près, le gardien couvre plus d'angle et le taux retombe.
export const PEN_D = 160;
export const PEN_SET_S = 1.8; // phase `pen` : ballon posé, joueurs en place
export const PEN_SHOT_S = 3; // pour tirer
export const PEN_END_S = 1.5; // après le tir, sans but : raté
export const PEN_SAVE_S = 0.6; // arrêt du gardien : engagement 0,6 s plus tard
export const GOLD_MAX_S = 120; // but en or sans but au bout de 2 min : match nul
export const EVENT_KINDS = ['foam', 'gel', 'storm', 'goals', 'water', 'smoke'];
export const EVENT_MS = { foam: 6000, gel: 6000, storm: 5000, goals: 8000, water: 10000, smoke: 10000 };
export const EVENT_ANNOUNCE_MS = 1000; // annoncé 1 s avant
export const EVENT_GAP_MIN_MS = 20000; // un événement toutes les 20 à 40 s de jeu
export const EVENT_GAP_MAX_MS = 40000;
// Orage ou gel : l'arrosage s'y ajoute une fois sur trois (combos électrique + eau, feu + eau ;
// sans lui, deux événements ne se croisaient jamais)
export const COMBO_P = 0.35;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createBall() {
  return { x: W / 2, y: H / 2, vx: 0, vy: 0, roll: 0 };
}

export function createPaddle(side) {
  const y = side === 0 ? H - 100 : 100;
  return { x: W / 2, y, tx: W / 2, ty: y, vx: 0, vy: 0 };
}

// Rotation de 180° : le joueur du haut se voit en bas.
export const flipPoint = (x, y) => ({ x: W - x, y: H - y });
export const flipVel = (vx, vy) => ({ vx: -vx, vy: -vy });

export function boxOf(side) {
  const x0 = (W - SBW) / 2;
  return side === 0 ? { x0, x1: x0 + SBW, y0: H - SBD, y1: H } : { x0, x1: x0 + SBW, y0: 0, y1: SBD };
}

// Repousse le joueur hors d'une petite surface. Rend true s'il y était.
function outOfBox(p, b, inward) {
  const cx = clamp(p.x, b.x0, b.x1);
  const cy = clamp(p.y, b.y0, b.y1);
  const dx = p.x - cx;
  const dy = p.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= PR * PR) return false;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    p.x = cx + (dx / d) * PR;
    p.y = cy + (dy / d) * PR;
  } else {
    // Centre dans la surface : sortie par le côté le plus proche (jamais par la ligne de but)
    const out = inward < 0 ? p.y - (b.y0 - PR) : b.y1 + PR - p.y;
    const left = p.x - (b.x0 - PR);
    const right = b.x1 + PR - p.x;
    const m = Math.min(out, left, right);
    if (m === out) p.y = inward < 0 ? b.y0 - PR : b.y1 + PR;
    else if (m === left) p.x = b.x0 - PR;
    else p.x = b.x1 + PR;
  }
  return true;
}

// Garde le joueur dans sa moitié, hors de sa petite surface. Rend true si la surface l'a repoussé.
// `mode` (règlement v2) : { k: 'pen', s: tireur } pendant un penalty (le gardien sur sa ligne, le
// tireur derrière le point de penalty, ligne du milieu franchie), { k: 'gold' } pendant le but en
// or (tout le terrain, sauf les deux petites surfaces) ; absent : la règle d'aujourd'hui.
export function constrainPaddle(p, side, mode) {
  p.x = clamp(p.x, PR, W - PR);
  if (mode && mode.k === 'gold') {
    p.y = clamp(p.y, PR, H - PR);
    const own = outOfBox(p, boxOf(side), side === 0 ? -1 : 1);
    const opp = outOfBox(p, boxOf(1 - side), side === 0 ? 1 : -1);
    return own || opp;
  }
  if (mode && mode.k === 'pen') {
    if (side !== mode.s) {
      p.x = clamp(p.x, GL, GR);
      p.y = keeperLine(side);
      return false;
    }
    const spot = penaltySpot(side);
    p.y = side === 0 ? clamp(p.y, spot.y, H - PR) : clamp(p.y, PR, spot.y);
    return outOfBox(p, boxOf(side), side === 0 ? -1 : 1);
  }
  p.y = side === 0 ? clamp(p.y, H / 2 + PR, H - PR) : clamp(p.y, PR, H / 2 - PR);
  return outOfBox(p, boxOf(side), side === 0 ? -1 : 1);
}

export function targetInBox(p, side) {
  const b = boxOf(side);
  const m = PR * 0.3;
  return p.tx > b.x0 - m && p.tx < b.x1 + m && p.ty > b.y0 - m && p.ty < b.y1 + m;
}

// Avance le joueur vers sa cible (p.tx, p.ty) sans dépasser maxSpeed. Rend true si la petite
// surface l'a repoussé alors que la cible y était (le doigt essaie d'y entrer). `mode` : voir
// constrainPaddle.
export function movePaddle(p, side, dt, maxSpeed, mode) {
  const ox = p.x;
  const oy = p.y;
  const dx = p.tx - p.x;
  const dy = p.ty - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const maxd = maxSpeed * dt;
  if (d > maxd) {
    p.x += (dx / d) * maxd;
    p.y += (dy / d) * maxd;
  } else {
    p.x = p.tx;
    p.y = p.ty;
  }
  const pushed = constrainPaddle(p, side, mode);
  p.vx = (p.x - ox) / dt;
  p.vy = (p.y - oy) / dt;
  return pushed && targetInBox(p, side);
}

// Vitesse plafonnée (BALL_MAX ; BALL_MAX_ELEC pour un ballon électrique, règlement v2)
export function capBall(b) {
  const max = b.fx === FX_ELEC ? BALL_MAX_ELEC : BALL_MAX;
  const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (s > max) {
    b.vx *= max / s;
    b.vy *= max / s;
  }
}

function net(b, dir, dx) {
  if (dir < 0 ? b.y >= 0 : b.y <= H) return;
  if (b.x < GL + dx + BR) { b.x = GL + dx + BR; b.vx = Math.abs(b.vx) * 0.4; }
  if (b.x > GR + dx - BR) { b.x = GR + dx - BR; b.vx = -Math.abs(b.vx) * 0.4; }
  if (dir < 0 && b.y < -GD + BR) { b.y = -GD + BR; b.vy = Math.abs(b.vy) * 0.18; b.vx *= 0.6; }
  if (dir > 0 && b.y > H + GD - BR) { b.y = H + GD - BR; b.vy = -Math.abs(b.vy) * 0.18; b.vx *= 0.6; }
}

// Bords, poteaux, filets. onEvent(kind, speed) : 'wall' | 'post', pour le son. `gx` (règlement
// v2, « Buts qui bougent ») : [décalage de la cage du bas, décalage de la cage du haut], en x ;
// absent : cages au milieu.
export function walls(b, onEvent, gx) {
  const dxB = gx ? gx[0] : 0;
  const dxT = gx ? gx[1] : 0;
  if (b.x < BR) {
    b.x = BR;
    if (b.vx < 0) { if (onEvent) onEvent('wall', -b.vx); b.vx = -b.vx * E_WALL; }
  } else if (b.x > W - BR) {
    b.x = W - BR;
    if (b.vx > 0) { if (onEvent) onEvent('wall', b.vx); b.vx = -b.vx * E_WALL; }
  }
  for (const [px0, py] of POSTS) {
    const px = px0 + (py === 0 ? dxT : dxB);
    const dx = b.x - px;
    const dy = b.y - py;
    const m = BR + POST;
    const d2 = dx * dx + dy * dy;
    if (d2 < m * m && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      b.x = px + nx * m;
      b.y = py + ny * m;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= (1 + E_WALL) * vn * nx;
        b.vy -= (1 + E_WALL) * vn * ny;
        if (onEvent) onEvent('post', -vn);
      }
    }
  }
  if (b.y < BR) {
    if (!(b.x > GL + dxT && b.x < GR + dxT)) {
      b.y = BR;
      if (b.vy < 0) { if (onEvent) onEvent('wall', -b.vy); b.vy = -b.vy * E_WALL; }
    } else net(b, -1, dxT);
  } else if (b.y > H - BR) {
    if (!(b.x > GL + dxB && b.x < GR + dxB)) {
      b.y = H - BR;
      if (b.vy > 0) { if (onEvent) onEvent('wall', b.vy); b.vy = -b.vy * E_WALL; }
    } else net(b, 1, dxB);
  }
}

// Un pas de ballon seul : frottement, déplacement, bords. Règlement v2 : `fld` (liste des
// événements, contrat section 3) et `t` (heure du début du pas, en ms, horloge des événements)
// ajoutent mousse, gel, foudre, arrosage et cages qui bougent ; onEvent reçoit en plus 'fire',
// 'charge', 'douse' et 'short'.
export function stepBall(b, dt, onEvent, fld, t) {
  b.vx *= FRICTION_STEP;
  b.vy *= FRICTION_STEP;
  if (fld && fld.length) fieldForces(b, dt, fld, t, onEvent);
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.roll += Math.sqrt(b.vx * b.vx + b.vy * b.vy) * dt;
  if (b.air > 0) b.air = b.air > dt ? b.air - dt : 0;
  walls(b, onEvent, fld && fld.length ? goalOffsets(fld, t) : null);
}

// Choc ballon / joueur. Rend la vitesse d'impact (> 0) s'il y a eu frappe, sinon 0.
// Ballon en l'air (court-circuit, règlement v2) : intouchable.
export function collidePaddle(b, p, side) {
  if (b.air > 0) return 0;
  const m = BR + PR;
  let dx = b.x - p.x;
  let dy = b.y - p.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= m * m) return 0;
  let d = Math.sqrt(d2);
  if (d < 1e-4) { dx = 0; dy = side === 0 ? -1 : 1; d = 1; }
  const nx = dx / d;
  const ny = dy / d;
  b.x = p.x + nx * m;
  b.y = p.y + ny * m;
  let pvx = p.vx;
  let pvy = p.vy;
  const ps = Math.sqrt(pvx * pvx + pvy * pvy);
  if (ps > HIT_CAP) { pvx *= HIT_CAP / ps; pvy *= HIT_CAP / ps; }
  const vn = (b.vx - pvx) * nx + (b.vy - pvy) * ny;
  let hit = 0;
  if (vn < 0) {
    b.vx -= (1 + E_HIT) * vn * nx;
    b.vy -= (1 + E_HIT) * vn * ny;
    hit = -vn;
  }
  capBall(b);
  return hit;
}

// Ballon coincé contre un bord par le joueur : on recule le joueur (sauf ballon en l'air).
export function unpin(b, p, side, mode) {
  if (b.air > 0) return;
  const m = BR + PR;
  const dx = b.x - p.x;
  const dy = b.y - p.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= m * m) return;
  const d = Math.sqrt(d2) || 1;
  p.x = b.x - (dx / d) * m;
  p.y = b.y - (dy / d) * m;
  constrainPaddle(p, side, mode);
}

// Qui a marqué : 0 (ballon entré dans la cage du haut), 1 (cage du bas), -1 personne.
export function goalScorer(b) {
  if (b.y < -BR) return 0;
  if (b.y > H + BR) return 1;
  return -1;
}

// Moitié où se trouve le ballon : 0 en bas, 1 en haut.
export const halfOf = (b) => (b.y > H / 2 ? 0 : 1);

// Engagement : ballon arrêté devant celui qui le reçoit, joueurs à leur place.
export function placeKickoff(b, toSide) {
  b.x = W / 2;
  b.y = toSide === 0 ? H * 0.68 : H * 0.32;
  b.vx = 0;
  b.vy = 0;
  clearFx(b);
}

export function homePaddle(p, side) {
  p.x = W / 2;
  p.y = side === 0 ? H - 100 : 100;
  p.vx = 0;
  p.vy = 0;
}

// Fait avancer le ballon seul (sans joueur) de `seconds`, par pas fixes. Sert au serveur pour
// rejouer après une frappe et au téléphone pour amener un état du serveur jusqu'à maintenant.
// Rend le marqueur s'il y a but pendant ce temps (et s'arrête là), sinon -1. `fld`, `t` : voir
// stepBall (t = heure de l'état de départ, en ms).
export function advanceBall(b, seconds, onEvent, fld, t) {
  let left = seconds;
  let at = t || 0;
  while (left > 1e-9) {
    const dt = left < STEP ? left : STEP;
    stepBall(b, dt, onEvent, fld, at);
    at += dt * 1000;
    left -= dt;
    const g = goalScorer(b);
    if (g >= 0) return g;
  }
  return -1;
}

// ---------- Règlement v2 : ballon en feu ou électrique ----------

// Ballon sans effet (engagement, penalty)
export function clearFx(b) {
  b.fx = FX_NONE;
  b.own = -1;
  b.air = 0;
}

// Valeur d'un but : 2 pour un ballon électrique, sinon 1 (le feu vaut 1)
export const goalValue = (b) => (b.fx === FX_ELEC ? 2 : 1);

// Camp dont le ballon prend la direction d'attaque : 0 s'il monte (vers la cage du haut)
const towardSide = (b) => (b.vy < 0 ? 0 : 1);

// Après une frappe de `side` (hit : vitesse rendue par collidePaddle, > 0). Une touche de
// l'adversaire éteint le feu ou la charge ('out') ; une frappe très forte vers le camp adverse
// allume le feu ('fire'), sauf sur un ballon électrique. Rend 'fire', 'out' ou null.
export function touchBall(b, side, hit) {
  let r = null;
  if (b.fx && b.own !== side) {
    b.fx = FX_NONE;
    b.own = -1;
    r = 'out';
  }
  if (hit >= FIRE_HIT && b.fx !== FX_ELEC && towardSide(b) === side) {
    if (b.fx !== FX_FIRE) r = 'fire';
    b.fx = FX_FIRE;
    b.own = side;
  }
  return r;
}

// ---------- Règlement v2 : événements (contrat, section 3) ----------

// Point dans une des ellipses [x, y, rx, ry, angle] d'une flaque
export function inLobes(l, x, y) {
  for (const e of l) {
    const dx = x - e[0];
    const dy = y - e[1];
    const c = Math.cos(e[4]);
    const s = Math.sin(e[4]);
    const u = (dx * c + dy * s) / e[2];
    const v = (dy * c - dx * s) / e[3];
    if (u * u + v * v <= 1) return true;
  }
  return false;
}

const JET_TICK_MS = 75;
const JET_TICK_A = 0.07;
const JET_BACK = 2.6;

// Angle d'un arroseur à turbine [x, y, base, range, len, ph] à tau ms du début de l'arrosage :
// il avance par à-coups (0,07 rad toutes les 75 ms) de base à base + range, puis revient d'un
// coup (2,6 rad/s) ; ph décale son cycle
export function jetAngle(s, tau) {
  const fwd = Math.ceil(s[3] / JET_TICK_A) * JET_TICK_MS;
  const cycle = fwd + (s[3] / JET_BACK) * 1000;
  let u = (tau + s[5]) % cycle;
  if (u < 0) u += cycle;
  if (u < fwd) return s[2] + Math.min(s[3], Math.floor(u / JET_TICK_MS) * JET_TICK_A);
  return s[2] + s[3] - ((u - fwd) / 1000) * JET_BACK;
}

// Décalage d'une cage à tau ms : clés [[ms, dx], …] de [0, 0] à [durée, 0], en douceur
function slide(keys, tau) {
  if (tau <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (tau < keys[i][0]) {
      const [t0, x0] = keys[i - 1];
      const [t1, x1] = keys[i];
      const u = (tau - t0) / (t1 - t0);
      return x0 + (x1 - x0) * u * u * (3 - 2 * u);
    }
  }
  return keys[keys.length - 1][1];
}

// [décalage de la cage du bas, de la cage du haut] à l'heure t (ms), ou null : cages au milieu
export function goalOffsets(fld, t) {
  for (const e of fld) {
    if (e.k === 'goals' && t >= e.at && t < e.until) return [slide(e.g[0], t - e.at), slide(e.g[1], t - e.at)];
  }
  return null;
}

// Effets des événements en cours sur le ballon pendant un pas de dt secondes commencé à t (ms).
// Un ballon en l'air n'est touché par rien ; le feu traverse mousse et gel (il les brûle).
function fieldForces(b, dt, fld, t, onEvent) {
  if (b.air > 0) return;
  for (const e of fld) {
    if (t < e.at || t >= e.until) continue;
    if (e.k === 'foam') {
      if (b.fx === FX_FIRE || !inLobes(e.l, b.x, b.y)) continue;
      const f = Math.exp(-FOAM_DRAG * dt);
      b.vx *= f;
      b.vy *= f;
      const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sp > 0 && sp < FOAM_MIN) {
        b.vx *= FOAM_MIN / sp;
        b.vy *= FOAM_MIN / sp;
      }
    } else if (e.k === 'gel') {
      if (b.fx === FX_FIRE || !inLobes(e.l, b.x, b.y)) continue;
      const g = 1 + GEL_GAIN * dt;
      b.vx *= g;
      b.vy *= g;
      capBall(b);
      if (!b.fx && b.vx * b.vx + b.vy * b.vy > GEL_FIRE * GEL_FIRE) {
        b.fx = FX_FIRE;
        b.own = towardSide(b);
        if (onEvent) onEvent('fire', GEL_FIRE);
      }
    } else if (e.k === 'storm') {
      if (b.fx === FX_ELEC) continue;
      for (const s of e.b) {
        if (t < s[2] || t >= s[2] + CHARGE_MS) continue;
        const dx = b.x - s[0];
        const dy = b.y - s[1];
        if (dx * dx + dy * dy >= CHARGE_R * CHARGE_R) continue;
        b.fx = FX_ELEC;
        b.own = towardSide(b);
        b.vx *= ELEC_BOOST;
        b.vy *= ELEC_BOOST;
        capBall(b);
        if (onEvent) onEvent('charge', Math.sqrt(b.vx * b.vx + b.vy * b.vy));
        break;
      }
    } else if (e.k === 'water') {
      for (const s of e.s) {
        const a = jetAngle(s, t - e.at);
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        const rx = b.x - s[0];
        const ry = b.y - s[1];
        const along = rx * ux + ry * uy;
        if (along <= JET_MIN || along >= s[4] || Math.abs(ry * ux - rx * uy) >= JET_W) continue;
        b.vx += ux * JET_PUSH * dt;
        b.vy += uy * JET_PUSH * dt;
        capBall(b);
        if (b.fx === FX_FIRE) {
          b.fx = FX_NONE;
          b.own = -1;
          if (onEvent) onEvent('douse', 0);
        } else if (b.fx === FX_ELEC) {
          // Court-circuit : le ballon bondit, plus rien ne le touche pendant HOP_S
          b.fx = FX_NONE;
          b.own = -1;
          b.air = HOP_S;
          if (onEvent) onEvent('short', 0);
          return;
        }
      }
    }
  }
}

// Événements encore utiles à l'heure t (annoncés ou en cours) : les autres peuvent être oubliés
export const liveEvents = (fld, t) => fld.filter((e) => t < e.until);

// Nombres pseudo-aléatoires tirés d'une graine (mulberry32) : dessin d'un événement (`sd`)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Temps de jeu (ms) jusqu'au prochain événement : 20 à 40 s
export const nextEventGap = (rnd) => EVENT_GAP_MIN_MS + rnd() * (EVENT_GAP_MAX_MS - EVENT_GAP_MIN_MS);

// Prochain événement tiré au hasard, jamais deux fois le même de suite
export function pickEventKind(rnd, prev) {
  const list = EVENT_KINDS.filter((k) => k !== prev);
  return list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
}

const q1 = (v) => Math.round(v * 10) / 10;
const q3 = (v) => Math.round(v * 1000) / 1000;

// Place d'un élément de rayon r dans le rectangle donné, loin des joueurs ; sinon le dernier essai
function freeSpot(rnd, pads, r, x0, x1, y0, y1) {
  let spot = null;
  for (let i = 0; i < 24; i++) {
    spot = { x: x0 + rnd() * (x1 - x0), y: y0 + rnd() * (y1 - y0) };
    let ok = true;
    for (const p of pads || []) {
      const dx = spot.x - p.x;
      const dy = spot.y - p.y;
      if (dx * dx + dy * dy < (r + PR + 20) * (r + PR + 20)) { ok = false; break; }
    }
    if (ok) break;
  }
  return spot;
}

// Trajet d'une cage qui bouge pendant `dur` ms : déplacements et arrêts au hasard, retour au milieu
function goalPath(rnd, dur) {
  const keys = [[0, 0]];
  let t = 0;
  let x = 0;
  for (;;) {
    const move = 600 + rnd() * 900;
    const hold = rnd() < 0.5 ? 150 + rnd() * 450 : 0;
    if (t + move + hold > dur - 900) break;
    let nx = x;
    for (let i = 0; i < 5 && Math.abs(nx - x) < 40; i++) nx = (rnd() * 2 - 1) * GOAL_SLIDE;
    t += move;
    x = q1(nx);
    keys.push([Math.round(t), x]);
    if (hold) {
      t += hold;
      keys.push([Math.round(t), x]);
    }
  }
  keys.push([dur, 0]);
  return keys;
}

// Événement `kind` annoncé à l'heure t (ms), en jeu à t + 1 s. Positions dans le repère du serveur,
// tirées par rnd loin des cages et des joueurs `pads` ([{x, y}, …]), arrondies (elles partent
// telles quelles aux téléphones). `sd` : graine du dessin (bulles, fumée…), sans effet sur le jeu.
export function makeEvent(kind, id, t, rnd, pads) {
  const r = (a, c) => a + rnd() * (c - a);
  const at = t + EVENT_ANNOUNCE_MS;
  const e = { k: kind, id, an: t, at, until: at + EVENT_MS[kind], sd: Math.floor(rnd() * 2147483647) };
  if (kind === 'foam' || kind === 'gel') {
    const base = kind === 'foam' ? r(34, 46) : r(30, 42);
    const c = freeSpot(rnd, pads, base * 1.6, 72, W - 72, SBD + 80, H - SBD - 80);
    const rot = r(0, Math.PI);
    const n = kind === 'foam' ? 2 + Math.floor(rnd() * 2) : 1;
    e.l = [];
    for (let i = 0; i < n; i++) {
      const off = i === 0 ? 0 : r(base * 0.5, base * 0.9);
      const oa = rot + (i === 2 ? Math.PI : 0) + r(-0.6, 0.6);
      e.l.push([q1(c.x + Math.cos(oa) * off), q1(c.y + Math.sin(oa) * off), q1(base * r(1.1, 1.6)), q1(base * r(0.7, 1)), q3(rot + r(-0.4, 0.4))]);
    }
  } else if (kind === 'storm') {
    const n = 1 + Math.floor(rnd() * 3);
    const offs = [r(200, 400), r(900, 1300), r(1600, 2100)];
    e.b = [];
    for (let i = 0; i < n; i++) {
      const c = freeSpot(rnd, pads, CHARGE_R, 40, W - 40, SBD + 50, H - SBD - 50);
      e.b.push([q1(c.x), q1(c.y), Math.round(at + offs[i])]);
    }
    e.until = e.b[n - 1][2] + CHARGE_MS;
  } else if (kind === 'water') {
    const n = 2 + Math.floor(rnd() * 3);
    e.s = [];
    for (let i = 0; i < n; i++) {
      const c = freeSpot(rnd, pads, 20, 40, W - 40, SBD + 50, H - SBD - 50);
      e.s.push([q1(c.x), q1(c.y), q3(r(0, 2 * Math.PI)), q3(r(0.8, 1.6)), q1(r(105, 150)), Math.round(r(0, 2000))]);
    }
  } else if (kind === 'goals') {
    e.g = [goalPath(rnd, EVENT_MS.goals), goalPath(rnd, EVENT_MS.goals)];
  } else {
    // Fumigène : lancé d'une tribune (bord gauche, droit, haut ou bas), il roule jusqu'à (x, y) ; la
    // fumée part avec le vent w [vx, vy]. Rien ne change pour le ballon : il est seulement caché.
    const c = freeSpot(rnd, pads, 30, 50, W - 50, SBD + 60, H - SBD - 60);
    const stand = Math.floor(rnd() * 4);
    const from = stand === 0 ? [-30, c.y + r(-80, 80)] : stand === 1 ? [W + 30, c.y + r(-80, 80)]
      : stand === 2 ? [c.x + r(-80, 80), -40] : [c.x + r(-80, 80), H + 40];
    const wa = r(0, 2 * Math.PI);
    const ws = r(12, 34);
    e.x0 = q1(from[0]);
    e.y0 = q1(from[1]);
    e.x = q1(c.x);
    e.y = q1(c.y);
    e.w = [q1(Math.cos(wa) * ws), q1(Math.sin(wa) * ws)];
  }
  return e;
}

// Événements créés à l'heure t : celui de `kind`, et une fois sur COMBO_P l'arrosage avec un orage
// ou un gel (mêmes heures, identifiant suivant). Le serveur et le match hors ligne passent par ici.
export function makeEvents(kind, id, t, rnd, pads) {
  const list = [makeEvent(kind, id, t, rnd, pads)];
  if ((kind === 'storm' || kind === 'gel') && rnd() < COMBO_P) {
    const w = makeEvent('water', id + 1, t, rnd, pads);
    list.push(w);
  }
  return list;
}

// Événement vu par le joueur du haut (terrain tourné de 180°) : positions et angles tournés, cages
// échangées (la cage du bas devient celle du haut), décalages inversés
export function flipEvent(e) {
  const f = { ...e };
  if (e.l) f.l = e.l.map((l) => [W - l[0], H - l[1], l[2], l[3], l[4]]);
  if (e.b) f.b = e.b.map((s) => [W - s[0], H - s[1], s[2]]);
  if (e.s) f.s = e.s.map((s) => [W - s[0], H - s[1], (s[2] + Math.PI) % (2 * Math.PI), s[3], s[4], s[5]]);
  if (e.g) f.g = [e.g[1], e.g[0]].map((keys) => keys.map(([t, x]) => [t, -x]));
  if (e.k === 'smoke') {
    f.x0 = W - e.x0;
    f.y0 = H - e.y0;
    f.x = W - e.x;
    f.y = H - e.y;
    f.w = [-e.w[0], -e.w[1]];
  }
  return f;
}

// ---------- Règlement v2 : fautes, penalty ----------

// Camper : centre du joueur dans sa grande surface
export function inBigBox(p, side) {
  const x0 = (W - BBW) / 2;
  if (p.x <= x0 || p.x >= x0 + BBW) return false;
  return side === 0 ? p.y > H - BBD : p.y < BBD;
}

// Bloquer : ballon dans la moitié de `side`, contre un de ses bords (côtés, ligne de fond hors de
// la cage), son joueur collé à lui côté terrain. Sans condition de vitesse : un ballon écrasé contre
// le bord vibre vite (S1, 31 oct. : 784 unités/s), et le serveur ne le voit qu'entre deux frappes ;
// le chrono (pinClock) redescend au lieu de repartir de zéro à chaque rebond.
export function pinnedBy(b, p, side) {
  if (halfOf(b) !== side) return false;
  const dx = b.x - p.x;
  const dy = b.y - p.y;
  const m = PR + BR + PIN_GAP;
  if (dx * dx + dy * dy > m * m) return false;
  const lim = BR + PIN_BAND;
  if (b.x <= lim) return p.x > b.x;
  if (b.x >= W - lim) return p.x < b.x;
  if (b.x > GL && b.x < GR) return false;
  if (side === 0) return b.y >= H - lim && p.y < b.y;
  return b.y <= lim && p.y > b.y;
}

// Chrono de la faute « bloquer » (secondes) : monte pendant le blocage, redescend deux fois plus
// vite sinon
export const pinClock = (s, pinned, dt) => (pinned ? s + dt : Math.max(0, s - PIN_DECAY * dt));

// Point de penalty du tireur : devant la cage qu'il attaque
export const penaltySpot = (shooter) => ({ x: W / 2, y: shooter === 0 ? PEN_D : H - PEN_D });

// Ligne du gardien pendant un penalty : sa ligne de but (centre à PR + 3 de la ligne, entre les
// poteaux). Au bord de sa petite surface, il arrêtait tous les tirs directs sans bouger (banc
// d'essai du 31 oct.)
export const keeperLine = (side) => (side === 0 ? H - PR - 3 : PR + 3);

// Penalty : ballon arrêté sur le point, sans effet
export function placePenalty(b, shooter) {
  const s = penaltySpot(shooter);
  b.x = s.x;
  b.y = s.y;
  b.vx = 0;
  b.vy = 0;
  clearFx(b);
}

// Place d'un joueur au début d'un penalty (chaque téléphone place le sien, comme à l'engagement) :
// le gardien au milieu de sa ligne, le tireur 80 derrière le ballon
export function penaltyPlace(side, shooter) {
  if (side !== shooter) return { x: W / 2, y: keeperLine(side) };
  const s = penaltySpot(shooter);
  return { x: W / 2, y: shooter === 0 ? s.y + 80 : s.y - 80 };
}

// ---------- Ordinateur (le salon, hors ligne seulement) ----------

function foldX(x) {
  const span = W - 2 * BR;
  let u = (x - BR) % (2 * span);
  if (u < 0) u += 2 * span;
  return BR + (u > span ? 2 * span - u : u);
}

// Cible du joueur ordinateur. Calculée côté haut ; side 0 utilise le même calcul en miroir.
// live : le ballon est en jeu. rnd : fonction aléatoire (Math.random par défaut).
export function botTarget(b, p, side, level, live, rnd = Math.random) {
  const L = LEVELS[level] || LEVELS.barber;
  const r = (a, c) => a + rnd() * (c - a);
  const flip = side === 0;
  const by = flip ? H - b.y : b.y;
  const bvy = flip ? -b.vy : b.vy;
  const py = flip ? H - p.y : p.y;
  const bx = b.x;
  const bvx = b.vx;
  const px = p.x;
  let tx;
  let ty;
  if (!live) {
    tx = W / 2;
    ty = L.guardY;
  } else {
    const fx = bx + bvx * L.predict;
    const fy = by + bvy * L.predict;
    if (fy < H / 2 - 2) {
      const defY = SBD + PR + 18;
      if (bvy < -260 && by > py - 6) {
        const t = (by - defY) / -bvy;
        tx = clamp(foldX(bx + bvx * t) + r(-L.aim, L.aim) / 3, PR, W - PR);
        ty = defY;
      } else if (fy < py - 4) {
        const s = px < fx ? -1 : 1;
        tx = fx + s * (BR + PR + 14);
        ty = fy - (BR + PR);
      } else {
        const ax = W / 2 + r(-1, 1) * (GW / 2 - 14) + r(-L.aim, L.aim) * 0.5;
        const ay = H + 30;
        let dx = ax - fx;
        let dy = ay - fy;
        const dl = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= dl;
        dy /= dl;
        const toX = fx - px;
        const toY = fy - py;
        const tl = Math.sqrt(toX * toX + toY * toY) || 1;
        const align = (toX * dx + toY * dy) / tl;
        if (align > 0.9 && tl < 95) {
          tx = fx + dx * 60;
          ty = fy + dy * 60;
        } else {
          tx = fx - dx * (BR + PR + 4);
          ty = fy - dy * (BR + PR + 4);
        }
      }
    } else {
      tx = W / 2 + (bx - W / 2) * 0.55 + r(-L.aim, L.aim) * 0.3;
      ty = L.guardY;
    }
  }
  return { x: tx, y: flip ? H - ty : ty, react: L.react * r(0.8, 1.2), speed: L.speed };
}
