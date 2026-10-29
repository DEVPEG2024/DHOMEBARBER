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

// Garde le joueur dans sa moitié, hors de sa petite surface. Rend true si la surface l'a repoussé.
export function constrainPaddle(p, side) {
  p.x = clamp(p.x, PR, W - PR);
  p.y = side === 0 ? clamp(p.y, H / 2 + PR, H - PR) : clamp(p.y, PR, H / 2 - PR);
  const b = boxOf(side);
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
    const out = side === 0 ? p.y - (b.y0 - PR) : b.y1 + PR - p.y;
    const left = p.x - (b.x0 - PR);
    const right = b.x1 + PR - p.x;
    const m = Math.min(out, left, right);
    if (m === out) p.y = side === 0 ? b.y0 - PR : b.y1 + PR;
    else if (m === left) p.x = b.x0 - PR;
    else p.x = b.x1 + PR;
  }
  return true;
}

export function targetInBox(p, side) {
  const b = boxOf(side);
  const m = PR * 0.3;
  return p.tx > b.x0 - m && p.tx < b.x1 + m && p.ty > b.y0 - m && p.ty < b.y1 + m;
}

// Avance le joueur vers sa cible (p.tx, p.ty) sans dépasser maxSpeed. Rend true si la petite
// surface l'a repoussé alors que la cible y était (le doigt essaie d'y entrer).
export function movePaddle(p, side, dt, maxSpeed) {
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
  const pushed = constrainPaddle(p, side);
  p.vx = (p.x - ox) / dt;
  p.vy = (p.y - oy) / dt;
  return pushed && targetInBox(p, side);
}

export function capBall(b) {
  const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (s > BALL_MAX) {
    b.vx *= BALL_MAX / s;
    b.vy *= BALL_MAX / s;
  }
}

function net(b, dir) {
  if (dir < 0 ? b.y >= 0 : b.y <= H) return;
  if (b.x < GL + BR) { b.x = GL + BR; b.vx = Math.abs(b.vx) * 0.4; }
  if (b.x > GR - BR) { b.x = GR - BR; b.vx = -Math.abs(b.vx) * 0.4; }
  if (dir < 0 && b.y < -GD + BR) { b.y = -GD + BR; b.vy = Math.abs(b.vy) * 0.18; b.vx *= 0.6; }
  if (dir > 0 && b.y > H + GD - BR) { b.y = H + GD - BR; b.vy = -Math.abs(b.vy) * 0.18; b.vx *= 0.6; }
}

// Bords, poteaux, filets. onEvent(kind, speed) : 'wall' | 'post', pour le son.
export function walls(b, onEvent) {
  if (b.x < BR) {
    b.x = BR;
    if (b.vx < 0) { if (onEvent) onEvent('wall', -b.vx); b.vx = -b.vx * E_WALL; }
  } else if (b.x > W - BR) {
    b.x = W - BR;
    if (b.vx > 0) { if (onEvent) onEvent('wall', b.vx); b.vx = -b.vx * E_WALL; }
  }
  for (const [px, py] of POSTS) {
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
  const mouth = b.x > GL && b.x < GR;
  if (b.y < BR) {
    if (!mouth) {
      b.y = BR;
      if (b.vy < 0) { if (onEvent) onEvent('wall', -b.vy); b.vy = -b.vy * E_WALL; }
    } else net(b, -1);
  } else if (b.y > H - BR) {
    if (!mouth) {
      b.y = H - BR;
      if (b.vy > 0) { if (onEvent) onEvent('wall', b.vy); b.vy = -b.vy * E_WALL; }
    } else net(b, 1);
  }
}

// Un pas de ballon seul : frottement, déplacement, bords.
export function stepBall(b, dt, onEvent) {
  b.vx *= FRICTION_STEP;
  b.vy *= FRICTION_STEP;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.roll += Math.sqrt(b.vx * b.vx + b.vy * b.vy) * dt;
  walls(b, onEvent);
}

// Choc ballon / joueur. Rend la vitesse d'impact (> 0) s'il y a eu frappe, sinon 0.
export function collidePaddle(b, p, side) {
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

// Ballon coincé contre un bord par le joueur : on recule le joueur.
export function unpin(b, p, side) {
  const m = BR + PR;
  const dx = b.x - p.x;
  const dy = b.y - p.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= m * m) return;
  const d = Math.sqrt(d2) || 1;
  p.x = b.x - (dx / d) * m;
  p.y = b.y - (dy / d) * m;
  constrainPaddle(p, side);
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
}

export function homePaddle(p, side) {
  p.x = W / 2;
  p.y = side === 0 ? H - 100 : 100;
  p.vx = 0;
  p.vy = 0;
}

// Fait avancer le ballon seul (sans joueur) de `seconds`, par pas fixes. Sert au serveur pour
// rejouer après une frappe et au téléphone pour amener un état du serveur jusqu'à maintenant.
// Rend le marqueur s'il y a but pendant ce temps (et s'arrête là), sinon -1.
export function advanceBall(b, seconds, onEvent) {
  let left = seconds;
  while (left > 1e-9) {
    const dt = left < STEP ? left : STEP;
    stepBall(b, dt, onEvent);
    left -= dt;
    const g = goalScorer(b);
    if (g >= 0) return g;
  }
  return -1;
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
