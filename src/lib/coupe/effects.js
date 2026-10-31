/*
 * Effets du règlement v2 de La Coupe du Gang (31 oct. 2026) : les six événements (mousse, gel,
 * orage, buts qui bougent, arrosage, fumigène), le ballon en feu, électrique ou en l'air, les éclats
 * (allumage, charge, vapeur, court-circuit, éclair), le penalty, le but en or et les anneaux des
 * fautes. Contrat : docs/fonctions/coupe-du-gang-regles-v2-contrat.md (sections 3, 6 et 7). Dessins
 * portés de la planche validée par le propriétaire (docs/prototypes/coupe-regles-v2/coupe-sim.js).
 *
 * Tout se lit dans l'image du match (`frame` : events, now, goalOff, ball.fx / air, mode, camp, pin,
 * phase). Les éclats ponctuels naissent des changements d'une image à l'autre (ballon affiché) et
 * de l'heure des éclairs : l'interface n'appelle rien. Une image sans ces champs (règle
 * d'aujourd'hui) ne dessine rien de plus.
 *
 * Un événement : annoncé de `an` à `at` (contour qui clignote, rien sur le jeu), en jeu de `at` à
 * `until`, puis retiré en douceur (FADE_MS) ; fini plus tôt (penalty, but en or : il quitte la
 * liste), il se retire de la même façon. Le dessin d'un événement est tiré de sa graine (`sd`,
 * `rng`) : mêmes bulles et mêmes éclairs sur les deux téléphones. Pluie, étincelles et fumée : au
 * hasard (Math.random), rien ne dépend d'elles.
 *
 * Coordonnées du terrain (repère local, joueur du bas = 0), dans la transformation du renderer.
 * Aucun texte. Économie (60 images/s sur un iPhone moyen) : particules dans des réserves fixes
 * (plafonds MAX_*, environ 300 à l'écran au plus), sprites préparés une fois, gel et raccords de
 * pelouse pré-dessinés ; aucune allocation par image dans les boucles (objets réutilisés, couleurs
 * fixes et `globalAlpha` plutôt qu'une chaîne par particule).
 *
 * Thème stade : l'image du stade est le terrain (`setImage`). Elle sert au raccord de pelouse qui
 * recouvre la cage peinte quand les buts bougent (une seule cage visible à chaque bout, jamais deux
 * versions d'un même élément), à la ligne du milieu effacée du but en or et à la loupe du gel. Sans
 * elle (terrain dessiné de secours), le renderer refait son calque sans filets ni ligne du milieu
 * (`fieldFlags`) et ce module dessine les filets à leur place.
 *
 * Mouvement réduit (`setReduced`) : ni secousse ni flash plein écran, effets fixes (pas de pluie ni
 * de gouttes, fumée posée, bulles immobiles, arcs figés, presque pas d'étincelles).
 */
import {
  W, H, GL, GR, GW, GD, BBW, BBD, BR, PR, POST, FX_FIRE, FX_ELEC, HOP_S, CHARGE_R, CHARGE_MS, JET_MIN,
  CAMP_S, BLOCK_S, PEN_SHOT_S, jetAngle, rng, inLobes, penaltySpot, keeperLine,
} from './engine.js';
// Chemin relatif (pas l'alias `@/`) : les vérifications de bout en bout chargent ce fichier dans Node
import { COUPE_COLORS } from '../../components/coupe/palette.js';

const TAU = Math.PI * 2;
// Retrait en douceur d'un événement fini ; pelouse mouillée : elle sèche un peu plus lentement
const FADE_MS = 500;
const WET_FADE_MS = 900;
// Plafonds (environ 300 éléments animés à l'écran au plus : un seul événement à la fois)
const MAX_PARTS = 200; // étincelles, flammes, vapeur, éclaboussures…
const MAX_RAIN = 90;
const MAX_DROPS = 150;
const MAX_PUFFS = 120;
const MAX_BUBBLES = 170;
const MAX_RIPPLES = 12;
// Image du stade : place du terrain (mêmes valeurs que stadium.js, qui importe le renderer : pas
// d'import ici, il ferait une boucle et chargerait l'image dans les vérifications sous Node)
const IX0 = 255.4375;
const IY0 = 543;
const IK = 1234 / 640;
// Couleurs (thème stade et règlement v2)
const GOLD = COUPE_COLORS.or;
const RED = COUPE_COLORS.rougeVif;
const ELEC = COUPE_COLORS.elecClair;
// Cages de l'image (docs/prototypes/stade-coupe/gazon_neuf.py) : redessinées à l'identique quand
// elles bougent (aucun saut au début ni à la fin de l'événement)
const NET_FILL = 13 / 255;
const NET_GRID_A = 51 / 255;
const CHALK = 'rgb(236,248,240)';
const CHALK_A = 219 / 255;
// Ligne du milieu de l'image : effacée au but en or (rangées et bornes, unités du terrain)
const MID_HALF = 2.6;
const MID_SHIFT = 24;
const MID_SPANS = [[2.6, 131.4], [228.6, 357.4]];
// But en or : la ligne brille 0,8 s puis s'efface en 0,6 s
const GOLD_GLOW_S = 0.8;
const GOLD_FADE_S = 0.6;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// Tirets des contours (tableaux réutilisés : pas d'allocation par image)
const DASH = [6, 5];
const DASH_LINE = [7, 6];
const NO_DASH = [];
// Traits d'un éclair : largeur, couleur, opacité
const BOLT_LAYERS = [[12, 'rgb(90,160,255)', 0.22], [5, 'rgb(170,215,255)', 0.6], [1.8, '#ffffff', 1]];
// Hasard figé (arcs en mouvement réduit) : générateur de Park et Miller, sans fermeture par appel
let lcg = 1;
const lcgNext = () => {
  lcg = (lcg * 16807) % 2147483647;
  return lcg / 2147483647;
};
const ease = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};
const rand = (a, b) => a + Math.random() * (b - a);

// ─── Sprites (préparés une fois, au premier renderer) ─────────────────

let SPR = null;

function sprite(size, paint) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  paint(c.getContext('2d'), size);
  return c;
}

function radial(stops) {
  return (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    for (const [k, c] of stops) gr.addColorStop(k, c);
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  };
}

function makeSprites() {
  SPR = {
    shadow: sprite(64, radial([[0, 'rgba(0,0,0,.6)'], [0.5, 'rgba(0,0,0,.3)'], [1, 'rgba(0,0,0,0)']])),
    flame: sprite(64, radial([[0, 'rgba(255,250,210,1)'], [0.25, 'rgba(255,190,60,.9)'], [0.6, 'rgba(255,80,20,.45)'], [1, 'rgba(255,40,10,0)']])),
    glowO: sprite(64, radial([[0, 'rgba(255,170,60,.75)'], [1, 'rgba(255,90,20,0)']])),
    glowB: sprite(64, radial([[0, 'rgba(170,225,255,.9)'], [0.45, 'rgba(70,155,255,.4)'], [1, 'rgba(40,110,255,0)']])),
    glowG: sprite(64, radial([[0, 'rgba(255,230,150,.85)'], [0.5, 'rgba(235,193,94,.35)'], [1, 'rgba(235,193,94,0)']])),
    smoke: sprite(96, radial([[0, 'rgba(225,225,228,.6)'], [0.4, 'rgba(215,215,220,.38)'], [0.75, 'rgba(205,205,210,.1)'], [1, 'rgba(205,205,210,0)']])),
    smokeR: sprite(96, radial([[0, 'rgba(238,66,66,.85)'], [0.45, 'rgba(212,42,46,.56)'], [0.8, 'rgba(190,30,35,.14)'], [1, 'rgba(190,30,35,0)']])),
    redLight: sprite(96, radial([[0, 'rgba(255,80,60,.6)'], [0.5, 'rgba(255,40,40,.2)'], [1, 'rgba(255,40,40,0)']])),
    drop: sprite(16, radial([[0, 'rgba(245,250,255,1)'], [0.45, 'rgba(205,230,255,.85)'], [1, 'rgba(205,230,255,0)']])),
    scorch: sprite(96, radial([[0, 'rgba(12,8,5,.95)'], [0.35, 'rgba(28,17,9,.85)'], [0.6, 'rgba(45,28,14,.45)'], [1, 'rgba(45,28,14,0)']])),
    wetDot: sprite(32, radial([[0, 'rgba(4,18,8,.55)'], [1, 'rgba(4,18,8,0)']])),
    film: sprite(64, radial([[0, 'rgba(250,252,253,.92)'], [0.62, 'rgba(236,242,246,.7)'], [0.86, 'rgba(225,232,238,.25)'], [1, 'rgba(225,232,238,0)']])),
    bubble: sprite(64, (g, s) => {
      const c = s / 2;
      const gr = g.createRadialGradient(c * 0.7, c * 0.62, s * 0.03, c, c, c);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.35, '#f6f9fb');
      gr.addColorStop(0.8, '#dbe3e9');
      gr.addColorStop(1, '#bcc7d0');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(c, c, c - 1.5, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(135,150,165,.6)';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,.95)';
      g.beginPath();
      g.arc(c * 0.64, c * 0.56, c * 0.17, 0, TAU);
      g.fill();
    }),
    // Tête d'arroseur : métal, vue du dessus
    head: sprite(32, (g, s) => {
      const c = s / 2;
      const gr = g.createRadialGradient(c - 3, c - 3, 1, c, c, c - 1);
      gr.addColorStop(0, '#eef2f5');
      gr.addColorStop(0.6, '#8d969e');
      gr.addColorStop(1, '#3f454b');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(c, c, c - 1, 0, TAU);
      g.fill();
    }),
    // Fumigène : rouge allumé, brûlé (gris) à la fin
    can: canSprite('#ff4a50', '#8e0f14'),
    canBurnt: canSprite('#7a6a6a', '#3a3030'),
  };
}

function canSprite(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 40;
  c.height = 20;
  const g = c.getContext('2d');
  g.scale(2, 2);
  g.translate(10, 5);
  const gr = g.createLinearGradient(0, -4, 0, 4);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(-5.5, -3.5);
  g.arcTo(8, -3.5, 8, 3.5, 2.5);
  g.arcTo(8, 3.5, -8, 3.5, 2.5);
  g.arcTo(-8, 3.5, -8, -3.5, 2.5);
  g.arcTo(-8, -3.5, 8, -3.5, 2.5);
  g.closePath();
  g.fill();
  g.fillStyle = '#d9d9d9';
  g.fillRect(-8, -3.5, 2.5, 7);
  return c;
}

// ─── Réserves de particules (objets réutilisés) ─────────────────────

// Sortes de particules
const P_FLAME = 1;
const P_SPARK = 2;
const P_ZAP = 3;
const P_POP = 4;
const P_GLINT = 5;
const P_SPLASH = 6;
const P_STEAM = 7;
const P_WISP = 8;
const P_SHOCK = 9; // anneau orange qui s'élargit (allumage)
const P_SHOCKB = 10; // anneau bleu (charge, but électrique)
const P_SHOCKW = 11; // anneau blanc et or (court-circuit)
// Couches : au sol (sous le ballon), traînée du ballon (juste sous lui), par-dessus tout
const L_UNDER = 0;
const L_BALL = 1;
const L_OVER = 2;

function makePool(n, make) {
  const a = new Array(n);
  for (let i = 0; i < n; i++) a[i] = make();
  return { a, n: 0, next: 0 };
}

/** Un élément de la réserve (réserve pleine : le plus ancien emplacement est repris). */
function take(pool) {
  if (pool.n < pool.a.length) return pool.a[pool.n++];
  pool.next = (pool.next + 1) % pool.a.length;
  return pool.a[pool.next];
}

/** Retire l'élément `i` (échangé avec le dernier) : la boucle reprend au même indice. */
function drop(pool, i) {
  const last = pool.n - 1;
  const p = pool.a[i];
  pool.a[i] = pool.a[last];
  pool.a[last] = p;
  pool.n = last;
}

const newPart = () => ({ k: 0, x: 0, y: 0, vx: 0, vy: 0, life: 1, age: 0, s: 1, l: L_OVER });

// ─── Outils de dessin ────────────────────────────────────────────────

/** Ligne brisée (éclair) de (x0, y0) à (x1, y1) : `depth` découpes au hasard de `rnd`. */
function jag(rnd, x0, y0, x1, y1, depth, rough) {
  let pts = [x0, y0, x1, y1];
  for (let d = 0; d < depth; d++) {
    const next = [pts[0], pts[1]];
    for (let i = 0; i < pts.length - 2; i += 2) {
      const ax = pts[i];
      const ay = pts[i + 1];
      const bx = pts[i + 2];
      const by = pts[i + 3];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const off = (rnd() * 2 - 1) * len * rough;
      next.push((ax + bx) / 2 - ((by - ay) / len) * off, (ay + by) / 2 + ((bx - ax) / len) * off, bx, by);
    }
    pts = next;
  }
  return pts;
}

/** Éclair ramifié qui tombe du haut du canvas (`top`) jusqu'à (x, y). */
function makeBolt(rnd, x, y, top) {
  const main = jag(rnd, x + (rnd() * 2 - 1) * 90, top - 20, x, y, 6, 0.3);
  const branches = [];
  const n = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const at = 2 * Math.floor((0.25 + rnd() * 0.5) * (main.length / 2));
    const sx = main[at];
    const sy = main[at + 1];
    const ang = Math.atan2(y - sy, x - sx) + (rnd() * 2 - 1) * 0.9;
    const len = 50 + rnd() * 80;
    branches.push(jag(rnd, sx, sy, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len, 4, 0.35));
  }
  return { main, branches };
}

function polyline(c, pts) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.stroke();
}

/** Éclair : trois traits (halo bleu, cœur bleu clair, fil blanc), sans `shadowBlur` (coûteux). */
function drawBolt(c, bolt, a) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.lineJoin = 'round';
  c.lineCap = 'round';
  for (const [w, color, k] of BOLT_LAYERS) {
    c.strokeStyle = color;
    c.globalAlpha = k * a;
    c.lineWidth = w;
    polyline(c, bolt.main);
    c.lineWidth = w * 0.55;
    for (const br of bolt.branches) polyline(c, br);
  }
  c.restore();
}

/**
 * Petits arcs électriques autour de (x, y), de r0 à r1 : `seed` figé en mouvement réduit, sinon
 * au hasard à chaque image (ils grésillent). Deux traits (halo, fil) au lieu d'un flou.
 */
function arcs(c, x, y, r0, r1, n, seed) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    if (seed) lcg = seed;
    const rnd = seed ? lcgNext : Math.random;
    c.strokeStyle = pass ? '#e6f5ff' : 'rgb(120,190,255)';
    c.globalAlpha = pass ? 0.95 : 0.35;
    c.lineWidth = pass ? 1.1 : 3.2;
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU;
      c.beginPath();
      c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      for (let j = 1; j <= 4; j++) {
        const r = r0 + ((r1 - r0) * j) / 4;
        const aa = a + (rnd() - 0.5);
        c.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r);
      }
      c.stroke();
    }
  }
  c.restore();
}

/** Contour en tirets qui clignote (annonce d'un événement). */
function dashedEllipse(c, x, y, rx, ry, a, clock, color, reduced) {
  c.save();
  c.setLineDash(DASH);
  c.lineDashOffset = reduced ? 0 : -clock * 24;
  c.strokeStyle = color;
  c.lineWidth = 2;
  c.globalAlpha = reduced ? 0.85 : 0.55 + 0.45 * Math.sin(clock * 16);
  c.beginPath();
  c.ellipse(x, y, rx, ry, a, 0, TAU);
  c.stroke();
  c.restore();
}

/** Anneau de chrono (faute qui approche) : fond pâle, arc qui se remplit, or puis rouge. */
function chronoRing(c, x, y, r, frac, width) {
  const f = clamp(frac, 0, 1);
  c.save();
  c.lineCap = 'round';
  c.lineWidth = width;
  c.strokeStyle = 'rgba(255,255,255,.22)';
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.stroke();
  if (f > 0) {
    c.strokeStyle = GOLD;
    c.beginPath();
    c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * f);
    c.stroke();
    // Rouge qui monte vers la fin (rouge plein à la faute)
    const red = f < 0.5 ? 0 : (f - 0.5) / 0.5;
    if (red > 0) {
      c.globalAlpha = red;
      c.strokeStyle = RED;
      c.stroke();
    }
  }
  c.restore();
}

/**
 * Découpe au terrain et à ses filets : c'est le trou du voile des tribunes (StadiumStage), tout ce
 * qui dépasse serait plus clair que le stade assombri autour. À fermer par `c.restore()`.
 */
function clipHole(c) {
  c.save();
  c.beginPath();
  c.rect(0, -GD, W, H + 2 * GD);
  c.clip();
}

/** Chemin lissé fermé (points [x0, y0, x1, y1, …]) passant par les milieux des côtés. */
function smoothPath(target, pts) {
  const n = pts.length / 2;
  const mx = (i, j) => (pts[2 * i] + pts[2 * j]) / 2;
  const my = (i, j) => (pts[2 * i + 1] + pts[2 * j + 1]) / 2;
  target.moveTo(mx(n - 1, 0), my(n - 1, 0));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    target.quadraticCurveTo(pts[2 * i], pts[2 * i + 1], mx(i, j), my(i, j));
  }
  target.closePath();
}

// ─── Raccords de pelouse tirés de l'image du stade ─────────────────────

/**
 * Raccord qui recouvre la cage peinte d'un bout (`top`) : derrière la ligne de but, chaque rangée
 * reprend la couleur médiane du fond sous le filet (gazon en haut, dalle de la piste en bas), le
 * voile blanc du filet retiré, avec un grain de même force ; les rangées des lignes du filet
 * prennent la rangée voisine. Dans le terrain (bas des poteaux sur la ligne de but et les hachures
 * de la petite surface), la même rangée est recopiée 24 unités plus loin (trois pas de hachures).
 * Bords gauche et droit fondus. Rend { canvas, x, y, w, h } (unités du terrain) ou null.
 */
function goalCover(img, top) {
  const x0 = GL - 7;
  const x1 = GR + 7;
  const y0 = top ? -GD - 3.5 : H - 4.6;
  const y1 = top ? 4.6 : H + GD + 3.5;
  const line = top ? 0 : H; // ligne de but : rangées du terrain d'un côté, du filet de l'autre
  const sx = Math.floor(IX0 + x0 * IK);
  const sy = Math.floor(IY0 + y0 * IK);
  const sw = Math.ceil((x1 - x0) * IK);
  const sh = Math.ceil((y1 - y0) * IK);
  const cv = document.createElement('canvas');
  cv.width = sw;
  cv.height = sh;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  let data;
  try {
    data = g.getImageData(0, 0, sw, sh);
  } catch {
    return null; // image illisible (origine) : pas de raccord
  }
  const d = data.data;
  // Colonnes lues : l'intérieur du filet, loin des montants et des poteaux
  const c0 = Math.ceil((GL + 5 - x0) * IK);
  const c1 = Math.floor((GR - 5 - x0) * IK);
  const worldY = (row) => y0 + (row + 0.5) / IK;
  const isGrid = (y) => {
    // Lignes horizontales du filet (tous les 6, à partir du fond en haut, de la ligne en bas)
    const base = top ? -GD : H;
    const k = Math.round((y - base) / 6);
    return Math.abs(y - (base + k * 6)) < 0.75 || Math.abs(y - (top ? -GD : H + GD)) < 1.6;
  };
  const net = (y) => (top ? y > -GD - 1 && y < line : y > line && y < H + GD + 1);
  const rows = [];
  const tmp = { r: [], g: [], b: [] };
  for (let row = 0; row < sh; row++) {
    const y = worldY(row);
    const inPitch = top ? y >= line : y <= line;
    if (inPitch) { rows.push(null); continue; }
    tmp.r.length = 0;
    tmp.g.length = 0;
    tmp.b.length = 0;
    for (let col = c0; col <= c1; col++) {
      const i = (row * sw + col) * 4;
      tmp.r.push(d[i]);
      tmp.g.push(d[i + 1]);
      tmp.b.push(d[i + 2]);
    }
    const med = (arr) => {
      arr.sort((a, b) => a - b);
      return arr[arr.length >> 1];
    };
    // Grain : écart absolu médian du vert (≈ 0,8 écart type)
    const gm = med(tmp.g);
    let dev = 0;
    for (const v of tmp.g) dev += Math.abs(v - gm);
    dev /= tmp.g.length;
    let r = med(tmp.r);
    let gg = gm;
    let b = med(tmp.b);
    if (net(y)) {
      // Voile blanc du filet (255, 255, 255, 13) retiré
      r = (r - 255 * NET_FILL) / (1 - NET_FILL);
      gg = (gg - 255 * NET_FILL) / (1 - NET_FILL);
      b = (b - 255 * NET_FILL) / (1 - NET_FILL);
    }
    rows.push(isGrid(y) ? { grid: true, r, g: gg, b, dev } : { grid: false, r, g: gg, b, dev });
  }
  // Rangées des lignes du filet : la rangée propre la plus proche
  for (let row = 0; row < sh; row++) {
    const v = rows[row];
    if (!v || !v.grid) continue;
    for (let k = 1; k < sh; k++) {
      const a = rows[row - k];
      const b = rows[row + k];
      const pick = (a && !a.grid && a) || (b && !b.grid && b);
      if (pick) { rows[row] = { ...pick }; break; }
    }
  }
  // Rangées derrière la ligne : couleur médiane et grain
  let seed = top ? 7 : 11;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  for (let row = 0; row < sh; row++) {
    const v = rows[row];
    if (!v) continue;
    const amp = Math.min(14, v.dev * 1.25 * 3.46);
    for (let col = 0; col < sw; col++) {
      const i = (row * sw + col) * 4;
      const n = noise() * amp;
      d[i] = clamp(Math.round(v.r + n), 0, 255);
      d[i + 1] = clamp(Math.round(v.g + n), 0, 255);
      d[i + 2] = clamp(Math.round(v.b + n), 0, 255);
      d[i + 3] = 255;
    }
  }
  g.putImageData(data, 0, 0);
  // Rangées du terrain : recopiées 24 unités plus loin (moitié gauche vers la droite et inversement)
  const r0 = top ? Math.floor((line - y0) * IK) : 0;
  const r1 = top ? sh : Math.ceil((line - y0) * IK);
  const half = Math.round(sw / 2);
  const shift = 24 * IK;
  g.drawImage(img, sx + shift, sy + r0, half, r1 - r0, 0, r0, half, r1 - r0);
  g.drawImage(img, sx + half - shift, sy + r0, sw - half, r1 - r0, half, r0, sw - half, r1 - r0);
  // Bords fondus (les poteaux, à 7 unités des bords, restent entièrement couverts)
  const fade = g.createLinearGradient(0, 0, sw, 0);
  const f = (2.4 * IK) / sw;
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(f, '#000');
  fade.addColorStop(1 - f, '#000');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = fade;
  g.fillRect(0, 0, sw, sh);
  return { canvas: cv, x: (sx - IX0) / IK, y: (sy - IY0) / IK, w: sw / IK, h: sh / IK };
}

/**
 * Ligne du milieu effacée (but en or) : chaque moitié de la bande reprend la pelouse de la même
 * bande de tonte, 24 unités plus haut (au-dessus de la ligne) ou plus bas (en dessous). Rend
 * { canvas, x, y, w, h } (unités) ou null.
 */
function midlinePatch(img) {
  const y0 = H / 2 - MID_HALF;
  const y1 = H / 2 + MID_HALF;
  const sx = Math.floor(IX0);
  const sy = Math.floor(IY0 + y0 * IK);
  const sw = Math.ceil(W * IK);
  const sh = Math.ceil((y1 - y0) * IK);
  const mid = Math.round((H / 2) * IK + IY0) - sy;
  const shift = MID_SHIFT * IK;
  const cv = document.createElement('canvas');
  cv.width = sw;
  cv.height = sh;
  const g = cv.getContext('2d');
  for (const [a, b] of MID_SPANS) {
    const px = Math.round(a * IK);
    const pw = Math.round((b - a) * IK);
    g.drawImage(img, sx + px, sy - shift, pw, mid, px, 0, pw, mid);
    g.drawImage(img, sx + px, sy + mid + shift, pw, sh - mid, px, mid, pw, sh - mid);
  }
  return { canvas: cv, x: (sx - IX0) / IK, y: (sy - IY0) / IK, w: sw / IK, h: sh / IK };
}

/** Cage dessinée comme celles de l'image (gazon_neuf.py) : voile, filet tous les 6, cadre, poteaux. */
function drawImageGoal(c, dx, top, gold) {
  const x0 = GL + dx;
  const x1 = GR + dx;
  const yA = top ? -GD : H;
  const yB = top ? 0 : H + GD;
  const line = top ? 0 : H;
  const back = top ? -GD : H + GD;
  c.save();
  c.globalAlpha = NET_FILL;
  c.fillStyle = '#ffffff';
  c.fillRect(x0, yA, GW, GD);
  c.globalAlpha = NET_GRID_A;
  c.strokeStyle = CHALK;
  c.lineWidth = 0.55;
  c.beginPath();
  for (let x = x0; x <= x1 + 1e-6; x += 6) {
    c.moveTo(x, yA);
    c.lineTo(x, yB);
  }
  for (let y = yA; y <= yB + 1e-6; y += 6) {
    c.moveTo(x0, y);
    c.lineTo(x1, y);
  }
  c.stroke();
  c.globalAlpha = CHALK_A;
  c.lineWidth = 2;
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(x0, line);
  c.lineTo(x0, back);
  c.lineTo(x1, back);
  c.lineTo(x1, line);
  c.stroke();
  if (gold > 0) {
    // Annonce : le cadre clignote en or
    c.globalAlpha = gold;
    c.strokeStyle = GOLD;
    c.lineWidth = 2.6;
    c.stroke();
  }
  c.globalAlpha = 1;
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc(x0, line, POST, 0, TAU);
  c.arc(x1, line, POST, 0, TAU);
  c.fill();
  c.restore();
}

/** Cage du terrain dessiné de secours (sans l'image), comme `drawNet` du renderer, décalée. */
function drawFallbackGoal(c, dx, top, gold) {
  const x0 = GL + dx;
  const y0 = top ? -GD : H;
  c.save();
  c.fillStyle = 'rgba(255,255,255,.05)';
  c.fillRect(x0, y0, GW, GD);
  c.strokeStyle = 'rgba(236,248,240,.2)';
  c.lineWidth = 0.6;
  c.beginPath();
  for (let x = x0; x <= x0 + GW; x += 6) { c.moveTo(x, y0); c.lineTo(x, y0 + GD); }
  for (let y = y0; y <= y0 + GD; y += 6) { c.moveTo(x0, y); c.lineTo(x0 + GW, y); }
  c.stroke();
  c.strokeStyle = gold > 0 ? GOLD : 'rgba(236,248,240,.86)';
  c.lineWidth = 2;
  const back = top ? -GD : H + GD;
  const line = top ? 0 : H;
  c.beginPath();
  c.moveTo(x0, line);
  c.lineTo(x0, back);
  c.lineTo(x0 + GW, back);
  c.lineTo(x0 + GW, line);
  c.stroke();
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc(x0, line, POST, 0, TAU);
  c.arc(x0 + GW, line, POST, 0, TAU);
  c.fill();
  c.restore();
}

// ─── Le module ──────────────────────────────────────────────────────

/**
 * Effets du règlement v2, posés sur le canvas du renderer. Rien n'est dessiné pour une image de la
 * règle d'aujourd'hui (ni `events`, ni `fx`, ni `mode`, ni `camp`, ni `pin`).
 */
export function createEffects({ reducedMotion = false } = {}) {
  if (!SPR) makeSprites();
  let reduced = !!reducedMotion;
  let img = null; // image du stade (raccords, loupe du gel)
  let covers = null; // raccords des deux cages [bas, haut]
  let midPatch = null;
  let scale = 1; // px du canvas par unité du terrain (caches du gel)
  const bounds = { x0: -16, y0: -36, x1: W + 16, y1: H + 36 }; // canvas, en unités du terrain
  let clock = 0;
  let prevNow = null;
  const insts = []; // événements vus : { id, k, e, end, … }
  // Ballon de l'image précédente (éclats sur ses changements)
  const prev = { ok: false, x: 0, y: 0, fx: 0, air: 0, live: false };
  // Cages : décalage affiché (revient en douceur si l'événement s'arrête net)
  const goalShow = [0, 0];
  let goalsOn = false; // une cage dessinée à la place de la peinte
  let goalsGold = 0; // annonce : cadre en or
  // But en or
  let gold = { on: false, t: 0, seen: false };
  // Célébration d'un but en feu ou électrique : petits éclairs dans la cage
  const goalBolts = [];
  // Réserves
  const parts = makePool(MAX_PARTS, newPart);
  const rain = makePool(MAX_RAIN, () => ({ x: 0, y: 0, z: 0 }));
  const drops = makePool(MAX_DROPS, () => ({ x: 0, y: 0, vx: 0, vy: 0, z: 0, vz: 0, s: 2 }));
  // Pelouse mouillée : calque du terrain (1 px par unité), tamponné où les gouttes tombent
  let wet = null;
  let wetCtx = null;
  let wetA = 0;
  let wetUsed = false;

  function emit(k, x, y, vx, vy, life, s, l) {
    const p = take(parts);
    p.k = k;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.age = 0;
    p.s = s;
    p.l = l;
  }

  function burst(k, x, y, n, vmin, vmax, l = L_OVER) {
    const m = reduced ? Math.min(n, 4) : n;
    for (let i = 0; i < m; i++) {
      const a = Math.random() * TAU;
      const v = rand(vmin, vmax);
      emit(k, x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.25, 0.5), rand(1, 2), l);
    }
  }

  function steam(x, y, n) {
    const m = reduced ? Math.min(n, 3) : n;
    for (let i = 0; i < m; i++) emit(P_STEAM, x + rand(-6, 6), y + rand(-6, 6), rand(-22, 22), rand(-34, -8), rand(0.6, 1.2), rand(10, 18), L_OVER);
  }

  function ring(k, x, y, life) {
    if (!reduced) emit(k, x, y, 0, 0, life, 1, L_OVER);
  }

  // ─── Instances d'événements ─────────────────────────────────────

  // Phase d'un événement à l'heure `now` : 'an' (annonce), 'on' (en jeu), 'off' (retrait) ; k :
  // opacité du retrait ; u : secondes depuis `at`. Un seul objet, réécrit à chaque appel (lu tout
  // de suite, jamais gardé)
  const PH = { p: 'an', k: 1, u: 0 };
  function phaseOf(inst, now) {
    const e = inst.e;
    const end = inst.end != null ? inst.end : e.until;
    PH.u = (now - e.at) / 1000;
    if (now < e.at) {
      PH.p = 'an';
      PH.k = 1;
    } else if (now < end) {
      PH.p = 'on';
      PH.k = 1;
    } else {
      PH.p = 'off';
      PH.k = clamp(1 - (now - end) / FADE_MS, 0, 1);
    }
    return PH;
  }

  function createInst(e, now) {
    const inst = { id: e.id, k: e.k, e, end: null, born: now };
    const r = rng(e.sd >>> 0);
    if (e.k === 'foam') initFoam(inst, r);
    else if (e.k === 'gel') initGel(inst, r);
    else if (e.k === 'storm') initStorm(inst, r, now);
    else if (e.k === 'water') initWater(inst);
    else if (e.k === 'smoke') initSmoke(inst, r);
    return inst;
  }

  function syncEvents(frame, now) {
    const list = Array.isArray(frame.events) ? frame.events : null;
    for (const inst of insts) inst.seen = false;
    if (list) {
      for (const e of list) {
        if (!e || typeof e.k !== 'string') continue;
        let inst = null;
        for (const it of insts) if (it.id === e.id && it.k === e.k) { inst = it; break; }
        if (!inst) {
          inst = createInst(e, now);
          insts.push(inst);
          if (e.k === 'water') wetReset();
        }
        inst.e = e;
        inst.seen = true;
        if (now >= e.until && inst.end == null) inst.end = e.until;
      }
    }
    for (let i = insts.length - 1; i >= 0; i--) {
      const inst = insts[i];
      if (!inst.seen && inst.end == null) inst.end = Math.min(now, inst.e.until);
      // Oublié une fois retiré et sorti de la liste (encore dans la liste : gardé, effacé, sinon il
      // serait recréé et annoncé de nouveau)
      if (!inst.seen && inst.end != null && now - inst.end > FADE_MS) insts.splice(i, 1);
    }
  }

  // Mousse : bulles tirées de la graine dans les ellipses de l'événement, poussées par le ballon et
  // les joueurs (sillon), qui éclatent quand le ballon file et brûlent au feu
  function initFoam(inst, r) {
    const l = inst.e.l || [];
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let area = 0;
    for (const [x, y, rx, ry] of l) {
      const m = Math.max(rx, ry);
      x0 = Math.min(x0, x - m);
      x1 = Math.max(x1, x + m);
      y0 = Math.min(y0, y - m);
      y1 = Math.max(y1, y + m);
      area += Math.PI * rx * ry;
    }
    const n = Math.min(MAX_BUBBLES, Math.round((area * 0.8) / 50));
    const bubbles = [];
    for (let tries = 0; bubbles.length < n && tries < n * 40; tries++) {
      const x = x0 + r() * (x1 - x0);
      const y = y0 + r() * (y1 - y0);
      if (!inLobes(l, x, y)) continue;
      bubbles.push({ x, y, r: 3 + r() ** 2 * 9, d: r() * 0.6, ph: r() * TAU, ox: 0, oy: 0, dead: false });
    }
    bubbles.sort((a, b) => a.y - b.y);
    inst.bubbles = bubbles;
  }

  function popBubble(q, hot) {
    q.dead = true;
    const x = q.x + q.ox;
    const y = q.y + q.oy;
    if (hot) { steam(x, y, 1); return; }
    if (reduced) return;
    for (let i = 0; i < 3; i++) emit(P_POP, x, y, rand(-45, 45), rand(-45, 45), rand(0.2, 0.35), rand(0.8, 1.8), L_OVER);
  }

  function stepFoam(inst, ph, dt, b, pads) {
    if (ph.p === 'an') return;
    const hot = b && b.fx === FX_FIRE;
    const on = b && !(b.air > 0) && ph.p === 'on';
    const sp = b ? Math.sqrt(b.vx * b.vx + b.vy * b.vy) : 0;
    for (const q of inst.bubbles) {
      if (q.dead) continue;
      const qx = q.x + q.ox;
      const qy = q.y + q.oy;
      if (on) {
        const m = BR + q.r * 0.8 + (hot ? 9 : 0);
        const dx = qx - b.x;
        const dy = qy - b.y;
        if (dx < m && dx > -m && dy < m && dy > -m) {
          const d2 = dx * dx + dy * dy;
          if (d2 < m * m && d2 > 1e-4) {
            if (hot) {
              if (Math.random() < 30 * dt) popBubble(q, true);
              continue;
            }
            const d = Math.sqrt(d2);
            q.ox += (dx / d) * (m - d) * 0.7;
            q.oy += (dy / d) * (m - d) * 0.7;
            if (sp > 200 && Math.random() < 2.5 * dt) popBubble(q, false);
          }
        }
      }
      if (pads && ph.p === 'on') {
        for (const p of pads) {
          if (!p) continue;
          const m = PR + q.r * 0.6;
          const dx = q.x + q.ox - p.x;
          const dy = q.y + q.oy - p.y;
          if (dx >= m || dx <= -m || dy >= m || dy <= -m) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 < m * m && d2 > 1e-4) {
            const d = Math.sqrt(d2);
            q.ox += (dx / d) * (m - d) * 0.6;
            q.oy += (dy / d) * (m - d) * 0.6;
          }
        }
      }
      if (ph.p === 'off' && Math.random() < dt * 3) popBubble(q, false);
    }
  }

  function drawFoam(c, inst, ph) {
    if (ph.p === 'an') return;
    const k = ph.k;
    const grow = ph.p === 'on' ? ease(ph.u / 0.5) : 1;
    // Ombre et voile crémeux sous les bulles, une fois par ellipse
    c.save();
    for (const [x, y, rx, ry, a] of inst.e.l) {
      c.save();
      c.translate(x + 1.5, y + 2.5);
      c.rotate(a);
      c.globalAlpha = 0.34 * k * grow;
      c.drawImage(SPR.shadow, -rx * 1.12, -ry * 1.12, rx * 2.24, ry * 2.24);
      c.translate(-1.5, -2.5);
      c.globalAlpha = 0.88 * k * grow;
      c.drawImage(SPR.film, -rx * 1.08 * grow, -ry * 1.08 * grow, rx * 2.16 * grow, ry * 2.16 * grow);
      c.restore();
    }
    c.restore();
    c.globalAlpha = k;
    for (const q of inst.bubbles) {
      if (q.dead) continue;
      const a = ph.p === 'on' ? ease((ph.u - q.d) / 0.35) : 1;
      if (a <= 0) continue;
      const wob = reduced ? 1 : 1 + 0.05 * Math.sin(clock * 3 + q.ph);
      const s = q.r * 2 * a * wob * (ph.p === 'off' ? 0.4 + 0.6 * k : 1);
      c.drawImage(SPR.bubble, q.x + q.ox - s / 2, q.y + q.oy - s / 2, s, s);
    }
    c.globalAlpha = 1;
  }

  // Gel : flaque translucide (contour lissé tiré de la graine autour de l'ellipse du jeu), loupe
  // sur la pelouse de l'image, reflets, ondes là où le ballon glisse
  function initGel(inst, r) {
    const [cx, cy, rx, ry, a] = inst.e.l[0];
    const n = 20;
    let rr = [];
    for (let i = 0; i < n; i++) rr.push(0.9 + r() * 0.2);
    for (let pass = 0; pass < 2; pass++) rr = rr.map((v, j) => (rr[(j + n - 1) % n] + v * 2 + rr[(j + 1) % n]) / 4);
    const pts = [];
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      const x = Math.cos(t) * rx * rr[i];
      const y = Math.sin(t) * ry * rr[i];
      pts.push(cx + x * ca - y * sa, cy + x * sa + y * ca);
    }
    inst.pts = pts;
    inst.R = Math.max(rx, ry) * 1.15 + 6;
    inst.path = null;
    inst.cache = null;
    inst.cacheK = 0;
    inst.ripples = makePool(MAX_RIPPLES, () => ({ x: 0, y: 0, age: 0 }));
    inst.ripT = 0;
  }

  function gelPath(inst) {
    if (!inst.path && typeof Path2D !== 'undefined') {
      inst.path = new Path2D();
      smoothPath(inst.path, inst.pts);
    }
    return inst.path;
  }

  function gelCache(inst) {
    const k = Math.max(0.5, scale);
    if (inst.cache && inst.cacheK === k) return inst.cache;
    const [cx, cy, rx, , a] = inst.e.l[0];
    const R = inst.R;
    const size = Math.max(4, Math.ceil(2 * R * k));
    const cv = inst.cache || document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const g = cv.getContext('2d');
    g.setTransform(k, 0, 0, k, (R - cx) * k, (R - cy) * k);
    const path = gelPath(inst);
    g.save();
    if (path) g.clip(path);
    if (img) {
      // Loupe : la pelouse de l'image vue un peu plus grande à travers le gel
      const m = 1.08;
      g.globalAlpha = 0.65;
      g.drawImage(img, IX0 + (cx - R / m) * IK, IY0 + (cy - R / m) * IK, ((2 * R) / m) * IK, ((2 * R) / m) * IK, cx - R, cy - R, 2 * R, 2 * R);
      g.globalAlpha = 1;
    }
    const gr = g.createRadialGradient(cx - 8, cy - 6, 2, cx, cy, rx);
    gr.addColorStop(0, 'rgba(215,255,248,.4)');
    gr.addColorStop(0.55, 'rgba(70,215,205,.3)');
    gr.addColorStop(1, 'rgba(18,135,145,.48)');
    g.fillStyle = gr;
    g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    if (path) {
      g.lineWidth = 7;
      g.strokeStyle = 'rgba(10,70,75,.3)';
      g.stroke(path);
    }
    g.restore();
    if (path) {
      g.lineWidth = 1.6;
      g.strokeStyle = 'rgba(225,255,250,.75)';
      g.stroke(path);
    }
    inst.cache = cv;
    inst.cacheK = k;
    inst.cacheA = a;
    return cv;
  }

  function stepGel(inst, ph, dt, b) {
    const rp = inst.ripples;
    for (let i = 0; i < rp.n; i++) {
      const q = rp.a[i];
      q.age += dt;
      if (q.age >= 0.9) { drop(rp, i); i--; }
    }
    if (ph.p !== 'on' || !b || b.air > 0 || !inLobes(inst.e.l, b.x, b.y)) return;
    inst.ripT -= dt;
    if (inst.ripT <= 0 && !reduced) {
      inst.ripT = 0.06;
      const q = take(rp);
      q.x = b.x;
      q.y = b.y;
      q.age = 0;
    }
    if (!reduced && Math.random() < 20 * dt) emit(P_GLINT, b.x + rand(-7, 7), b.y + rand(-7, 7), 0, 0, 0.4, rand(0.8, 1.6), L_OVER);
  }

  function drawGel(c, inst, ph) {
    if (ph.p === 'an') return;
    const grow = ph.p === 'on' ? (reduced ? 1 : ease(ph.u / 0.6)) : 1;
    const k = ph.k;
    if (grow <= 0.01 || k <= 0) return;
    const [cx, cy, rx, ry, a] = inst.e.l[0];
    const R = inst.R;
    c.save();
    c.globalAlpha = k;
    c.translate(cx, cy);
    c.scale(grow, grow);
    c.translate(-cx, -cy);
    c.drawImage(gelCache(inst), cx - R, cy - R, 2 * R, 2 * R);
    const path = gelPath(inst);
    const rp = inst.ripples;
    if (rp.n && path) {
      c.save();
      c.clip(path);
      c.strokeStyle = 'rgb(235,255,252)';
      c.lineWidth = 1.3;
      for (let i = 0; i < rp.n; i++) {
        const q = rp.a[i];
        const t = q.age / 0.9;
        c.globalAlpha = 0.55 * (1 - t) * k;
        c.beginPath();
        c.ellipse(q.x, q.y, 4 + t * 26, 3 + t * 18, a, 0, TAU);
        c.stroke();
      }
      c.restore();
    }
    // Reflets qui glissent un peu
    c.translate(cx, cy);
    c.rotate(a);
    const sh = reduced ? 0 : Math.sin(clock * 1.4) * 8;
    c.fillStyle = '#ffffff';
    c.globalAlpha = 0.22 * k;
    c.beginPath();
    c.ellipse(-rx * 0.32 + sh, -ry * 0.36, rx * 0.3, 5, -0.12, 0, TAU);
    c.fill();
    c.globalAlpha = 0.62 * k;
    c.beginPath();
    c.ellipse(-rx * 0.32 + sh, -ry * 0.36, rx * 0.25, 2.6, -0.12, 0, TAU);
    c.fill();
    c.beginPath();
    c.ellipse(rx * 0.22 + sh * 0.6, -ry * 0.48, rx * 0.08, 1.7, -0.12, 0, TAU);
    c.fill();
    c.restore();
  }

  // Orage : ciel assombri pendant l'annonce, pluie, et pour chaque éclair (heure `t`) : contour
  // bleu 1 s avant, éclair ramifié et flash à l'heure, trace brûlée et braises, point chargé 3 s
  function initStorm(inst, r, now) {
    inst.strikes = (inst.e.b || []).map((s, i) => {
      // Trace brûlée et braises à la taille du point chargé (CHARGE_R du moteur)
      const q = CHARGE_R / 26;
      const blobs = [];
      for (let j = 0; j < 6; j++) blobs.push({ x: (r() * 28 - 14) * q, y: (r() * 24 - 12) * q, s: (26 + r() * 22) * q });
      const embers = [];
      for (let j = 0; j < 14; j++) embers.push({ x: (r() * 32 - 16) * q, y: (r() * 28 - 14) * q, ph: r() * TAU });
      // Éclair déjà tombé (match repris) : trace et point chargé, sans flash
      return { x: s[0], y: s[1], t: s[2], i, hit: now >= s[2] ? s[2] : null, bolt: null, blobs, embers, seed: (inst.e.sd + (i + 1) * 7919) >>> 0 };
    });
    inst.dark = 0;
  }

  function strike(inst, s) {
    s.hit = s.t;
    s.bolt = makeBolt(rng(s.seed), s.x, s.y, bounds.y0);
    burst(P_SPARK, s.x, s.y, 22, 60, 220);
    if (!reduced) {
      for (let k = 0; k < 7; k++) emit(P_WISP, s.x + rand(-8, 8), s.y + rand(-8, 8), rand(-6, 6), rand(-16, -6), rand(1.2, 2.2), rand(8, 14), L_OVER);
    }
  }

  function stormDark(inst, ph, now) {
    const e = inst.e;
    if (ph.p === 'an') return ease((now - e.an) / Math.max(1, e.at - e.an));
    return ph.p === 'on' ? 1 : ph.k;
  }

  function stepStorm(inst, ph, dt, now) {
    inst.dark = stormDark(inst, ph, now);
    for (const s of inst.strikes) {
      if (s.hit == null && now >= s.t) {
        // L'heure de l'éclair passe : éclair et flash (une fois), seulement s'il vient de tomber
        if (prevNow != null && prevNow < s.t && now - s.t < 600) strike(inst, s);
        else s.hit = s.t;
      }
    }
  }

  function drawStormGround(c, inst, ph, now) {
    const k = ph.k;
    // Ciel assombri (sous le ballon et les joueurs, qui restent lisibles), sur le terrain et ses
    // filets : le reste du stade est déjà sous le voile des tribunes
    if (inst.dark > 0) {
      c.globalAlpha = 0.48 * inst.dark;
      c.fillStyle = 'rgb(4,8,22)';
      c.fillRect(0, -GD, W, H + 2 * GD);
      c.globalAlpha = 1;
    }
    // Traces brûlées et braises, par-dessus l'ombre de l'orage (elles se voient)
    for (const s of inst.strikes) {
      if (s.hit == null) continue;
      c.globalAlpha = 0.85 * k;
      for (const bl of s.blobs) c.drawImage(SPR.scorch, s.x + bl.x - bl.s / 2, s.y + bl.y - bl.s / 2, bl.s, bl.s);
      const age = (now - s.hit) / 1000;
      const life = Math.max(0, 1 - age / 4.5) * k;
      if (life > 0.02) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = 'rgb(255,140,30)';
        for (const em of s.embers) {
          const a = life * (reduced ? 0.7 : 0.5 + 0.5 * Math.sin(clock * 9 + em.ph));
          if (a <= 0.02) continue;
          c.globalAlpha = a;
          c.beginPath();
          c.arc(s.x + em.x, s.y + em.y, 1.3, 0, TAU);
          c.fill();
        }
        c.globalCompositeOperation = 'source-over';
      }
    }
    c.globalAlpha = 1;
  }

  function drawStormOver(c, inst, ph, now) {
    const k = ph.k;
    for (const s of inst.strikes) {
      // Contour bleu qui clignote, 1 s avant l'éclair (jamais avant l'annonce)
      if (s.hit == null && now >= Math.max(inst.e.an, s.t - 1000)) dashedEllipse(c, s.x, s.y, CHARGE_R, CHARGE_R, 0, clock, ELEC, reduced);
      if (s.hit == null) continue;
      const age = (now - s.hit) / 1000;
      if (age * 1000 < CHARGE_MS) {
        // Point chargé : lueur qui palpite et arcs bleus
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = (reduced ? 0.85 : 0.75 + 0.25 * Math.sin(clock * 20)) * k;
        const g = CHARGE_R * 1.3;
        c.drawImage(SPR.glowB, s.x - g, s.y - g, 2 * g, 2 * g);
        c.restore();
        // Arcs jusqu'au bord de la zone qui charge le ballon
        arcs(c, s.x, s.y, 3, CHARGE_R, 4, reduced ? s.seed % 2147483646 + 1 : 0);
      }
      if (s.bolt && age < 0.45) {
        const f = age < 0.1 ? 1 : age < 0.14 ? 0.15 : age < 0.2 ? 0.85 : age < 0.26 ? 0.2 : Math.max(0, 0.6 - (age - 0.26) * 4);
        if (f > 0.01) {
          drawBolt(c, s.bolt, reduced ? Math.min(f, 0.8) : f);
          if (!reduced) {
            // Flash : le terrain s'éclaire d'un coup
            c.globalAlpha = 0.42 * f;
            c.fillStyle = 'rgb(225,238,255)';
            c.fillRect(bounds.x0, bounds.y0, bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);
            c.globalCompositeOperation = 'lighter';
            c.globalAlpha = f;
            c.drawImage(SPR.glowB, s.x - 90, s.y - 90, 180, 180);
            c.globalCompositeOperation = 'source-over';
            c.globalAlpha = 1;
          }
        }
      }
    }
  }

  // Pluie : une réserve de traits, autant que le ciel est sombre (aucune en mouvement réduit)
  function stepRain(dark, dt) {
    const want = reduced ? 0 : Math.round(MAX_RAIN * dark);
    while (rain.n < want) {
      const d = take(rain);
      d.x = rand(-10, W + 10);
      d.y = rand(-GD, H + GD);
      d.z = rand(0, 240);
    }
    if (rain.n > want) rain.n = want;
    for (let i = 0; i < rain.n; i++) {
      const d = rain.a[i];
      d.z -= 950 * dt;
      d.x -= 50 * dt;
      if (d.z <= 0) {
        if (Math.random() < 0.5) emit(P_SPLASH, d.x, d.y, 0, 0, 0.3, rand(3, 6), L_UNDER);
        d.x = rand(-10, W + 10);
        d.y = rand(-GD, H + GD);
        d.z = rand(160, 240);
      }
    }
  }

  function drawRain(c) {
    if (!rain.n) return;
    c.strokeStyle = 'rgba(200,220,255,.32)';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < rain.n; i++) {
      const d = rain.a[i];
      const y = d.y - d.z * 0.25;
      c.moveTo(d.x + 3, y - 9);
      c.lineTo(d.x, y);
    }
    c.stroke();
  }

  // Arrosage : têtes qui sortent pendant l'annonce, jets qui balaient (angle du moteur), gouttes,
  // éclaboussures, pelouse mouillée plus sombre
  function initWater(inst) {
    inst.heads = (inst.e.s || []).map((s) => ({ s, acc: 0 }));
  }

  function wetReset() {
    if (typeof document === 'undefined') return;
    if (!wet) {
      wet = document.createElement('canvas');
      wet.width = W;
      wet.height = H;
      wetCtx = wet.getContext('2d');
    }
    wetCtx.clearRect(0, 0, W, H);
    wetA = 0;
    wetUsed = true;
  }

  function stepWater(inst, ph, dt, now) {
    if (ph.p !== 'on' || reduced) return;
    const tau = now - inst.e.at;
    for (const h of inst.heads) {
      const s = h.s;
      const a = jetAngle(s, tau);
      h.acc += dt * 80;
      while (h.acc >= 1) {
        h.acc -= 1;
        const aa = a + rand(-0.05, 0.05);
        const dist = JET_MIN + (s[4] - JET_MIN) * rand(0.12, 1.02);
        const T = rand(0.42, 0.62);
        const d = take(drops);
        d.x = s[0] + Math.cos(aa) * 6;
        d.y = s[1] + Math.sin(aa) * 6;
        d.vx = (Math.cos(aa) * dist) / T;
        d.vy = (Math.sin(aa) * dist) / T;
        d.z = 4;
        d.vz = (900 * T) / 2;
        d.s = rand(1.6, 2.8);
      }
    }
  }

  function stepDrops(dt) {
    for (let i = 0; i < drops.n; i++) {
      const d = drops.a[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vz -= 900 * dt;
      d.z += d.vz * dt;
      if (d.z <= 0) {
        if (Math.random() < 0.35) emit(P_SPLASH, d.x, d.y, 0, 0, 0.28, rand(2, 4), L_UNDER);
        if (wetCtx && d.x > 0 && d.x < W && d.y > 0 && d.y < H) {
          wetCtx.globalAlpha = 0.1;
          wetCtx.drawImage(SPR.wetDot, d.x - 8, d.y - 8, 16, 16);
        }
        drop(drops, i);
        i--;
      }
    }
  }

  function headUp(inst, ph, now) {
    const e = inst.e;
    if (ph.p === 'an') return reduced ? 1 : ease((now - e.an) / 400);
    return ph.p === 'on' ? 1 : ph.k;
  }

  function drawWaterGround(c, inst, ph, now) {
    const up = headUp(inst, ph, now);
    if (up <= 0) return;
    const tau = ph.p === 'an' ? 0 : now - inst.e.at;
    for (const h of inst.heads) {
      const s = h.s;
      const a = jetAngle(s, tau);
      const x = s[0];
      const y = s[1];
      c.globalAlpha = 0.45 * up;
      c.fillStyle = 'rgb(22,15,8)';
      c.beginPath();
      c.arc(x, y, 8 * up + 2, 0, TAU);
      c.fill();
      c.globalAlpha = 1;
      c.drawImage(SPR.head, x - 6 * up, y - 6 * up, 12 * up, 12 * up);
      c.strokeStyle = '#2b3036';
      c.lineWidth = 2.2;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * 9 * up, y + Math.sin(a) * 9 * up);
      c.stroke();
    }
  }

  function drawWaterOver(c, inst, ph, now) {
    if (ph.p !== 'on' && !(ph.p === 'off' && ph.k > 0)) return;
    // Jets : un voile d'eau le long de l'angle (le jeu pousse de JET_MIN à `len`), les gouttes par-dessus
    const tau = now - inst.e.at;
    const k = ph.p === 'on' ? 1 : ph.k;
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = 'rgb(220,236,255)';
    for (const h of inst.heads) {
      const s = h.s;
      const a = jetAngle(s, ph.p === 'on' ? tau : Math.min(tau, inst.e.until - inst.e.at));
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const len = s[4];
      c.globalAlpha = 0.13 * k;
      c.lineWidth = 8;
      c.beginPath();
      c.moveTo(s[0] + ux * 7, s[1] + uy * 7);
      c.lineTo(s[0] + ux * len * 0.92, s[1] + uy * len * 0.92);
      c.stroke();
      c.globalAlpha = 0.42 * k;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(s[0] + ux * 7, s[1] + uy * 7);
      c.lineTo(s[0] + ux * len * 0.7, s[1] + uy * len * 0.7);
      c.stroke();
    }
    c.restore();
  }

  function drawDrops(c) {
    if (!drops.n) return;
    c.globalAlpha = 0.2;
    for (let i = 0; i < drops.n; i++) {
      const d = drops.a[i];
      if (d.z > 6) c.drawImage(SPR.wetDot, d.x - 2, d.y - 2, 4, 4);
    }
    c.globalAlpha = 1;
    for (let i = 0; i < drops.n; i++) {
      const d = drops.a[i];
      c.drawImage(SPR.drop, d.x - d.s, d.y - d.z * 0.35 - d.s, d.s * 2, d.s * 2);
    }
  }

  // Fumigène : lancé de la tribune (x0, y0), il rebondit et roule jusqu'à (x, y) pendant l'annonce,
  // puis flamme rouge et fumée épaisse poussée par le vent `w`, par-dessus le ballon
  function initSmoke(inst, r) {
    const e = inst.e;
    inst.puffs = makePool(MAX_PUFFS, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, g: 0, life: 1, age: 0 }));
    inst.acc = 0;
    inst.lit = 0;
    // Mouvement réduit : nuage posé, tiré de la graine le long du vent
    const wl = Math.hypot(e.w[0], e.w[1]) || 1;
    const ux = e.w[0] / wl;
    const uy = e.w[1] / wl;
    inst.still = [];
    for (let i = 0; i < 26; i++) {
      const along = r() * 120;
      const side = (r() - 0.5) * (24 + along * 0.6);
      inst.still.push({ x: e.x + ux * along - uy * side, y: e.y + uy * along + ux * side, s: 16 + along * 0.35 + r() * 10 });
    }
    inst.can = { x: e.x0, y: e.y0, z: 0, rot: 0 };
  }

  // Place du fumigène à l'heure `now` (calculée, jamais intégrée : juste après une reprise aussi)
  function canAt(inst, now) {
    const e = inst.e;
    const c = inst.can;
    const D = Math.max(1, e.at - e.an);
    const u = clamp((now - e.an) / D, 0, 1.6);
    const lx = e.x0 + (e.x - e.x0) * 0.82;
    const ly = e.y0 + (e.y - e.y0) * 0.82;
    if (u < 0.62) {
      const v = u / 0.62;
      c.x = e.x0 + (lx - e.x0) * v;
      c.y = e.y0 + (ly - e.y0) * v;
      c.z = 4 * 60 * v * (1 - v);
      c.rot = ((now - e.an) / 1000) * 14;
    } else {
      const v = clamp((u - 0.62) / 0.38, 0, 1);
      const o = 1 - (1 - v) * (1 - v);
      c.x = lx + (e.x - lx) * o;
      c.y = ly + (e.y - ly) * o;
      c.z = Math.abs(Math.sin(v * Math.PI * 2.2)) * 12 * (1 - v) * (1 - v);
      c.rot = 0.62 * D * 0.014 + (1 - (1 - v) ** 3) * 2.2;
    }
    return c;
  }

  function stepSmoke(inst, ph, dt, now) {
    const e = inst.e;
    const c = canAt(inst, now);
    inst.lit = ph.p === 'on' ? Math.min(1, inst.lit + dt * 3) : ph.p === 'off' ? Math.max(0, inst.lit - dt * 2.4) : 0;
    const tipX = c.x + Math.cos(c.rot) * 8;
    const tipY = c.y + Math.sin(c.rot) * 8;
    inst.tipX = tipX;
    inst.tipY = tipY;
    if (reduced) return;
    const t = now / 1000;
    const gust = 0.7 + 0.5 * Math.sin(t * 1.3) + 0.2 * Math.sin(t * 3.1);
    if (ph.p === 'on' && inst.lit > 0.05) {
      inst.acc += dt * 30;
      while (inst.acc >= 1) {
        inst.acc -= 1;
        const q = take(inst.puffs);
        q.x = tipX + rand(-2, 2);
        q.y = tipY + rand(-2, 2);
        q.z = rand(0, 4);
        q.vx = rand(-14, 14) + e.w[0] * 0.7;
        q.vy = rand(-14, 14) + e.w[1] * 0.7;
        q.vz = rand(12, 24);
        q.s = rand(6, 9);
        q.g = rand(10, 15);
        q.life = rand(3.6, 5.2);
        q.age = 0;
      }
      if (Math.random() < dt * 30) emit(P_SPARK, tipX, tipY, rand(-90, 90), rand(-90, 90), rand(0.2, 0.4), 1.4, L_OVER);
    }
    const pf = inst.puffs;
    const fv = Math.exp(-1.2 * dt);
    const fz = Math.exp(-0.5 * dt);
    for (let i = 0; i < pf.n; i++) {
      const q = pf.a[i];
      q.age += dt;
      if (q.age >= q.life) { drop(pf, i); i--; continue; }
      // Vent un peu forcé à l'écran (le dessin seul : le jeu ne lit pas `w`)
      const w = Math.min(1, q.age / 0.6) * 1.6;
      q.x += (q.vx + e.w[0] * gust * w) * dt;
      q.y += (q.vy + e.w[1] * gust * w) * dt;
      q.z += q.vz * dt;
      q.vz *= fz;
      q.s = Math.min(75, q.s + q.g * dt);
      q.vx *= fv;
      q.vy *= fv;
    }
  }

  function drawSmokeGround(c, inst, ph, now) {
    const can = canAt(inst, now);
    if (inst.lit > 0 && inst.tipX != null) {
      const fl = reduced ? 1 : 0.8 + 0.2 * Math.sin(clock * 37) + 0.1 * Math.sin(clock * 23);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = clamp(inst.lit * fl, 0, 1) * ph.k * 0.75;
      c.drawImage(SPR.redLight, inst.tipX - 50, inst.tipY - 50, 100, 100);
      c.globalCompositeOperation = 'source-over';
    }
    c.globalAlpha = 0.45 * ph.k;
    c.drawImage(SPR.shadow, can.x - 10 + can.z * 0.3, can.y - 10 + can.z * 0.5, 20, 20);
    c.globalAlpha = 1;
  }

  // Bouffées de fumée dessinées à mi-résolution dans un calque (douces : la différence ne se voit
  // pas), posé en une fois : quatre fois moins de pixels à mélanger, c'est l'effet le plus lourd
  let smokeBuf = null;
  let smokeCtx = null;
  function smokeLayer() {
    if (typeof document === 'undefined') return null;
    const k = scale / 2;
    const w = Math.max(1, Math.ceil((bounds.x1 - bounds.x0) * k));
    const h = Math.max(1, Math.ceil((bounds.y1 - bounds.y0) * k));
    if (!smokeBuf) {
      smokeBuf = document.createElement('canvas');
      smokeCtx = smokeBuf.getContext('2d');
    }
    if (smokeBuf.width !== w || smokeBuf.height !== h) {
      smokeBuf.width = w;
      smokeBuf.height = h;
    }
    smokeCtx.setTransform(1, 0, 0, 1, 0, 0);
    smokeCtx.clearRect(0, 0, w, h);
    smokeCtx.setTransform(k, 0, 0, k, -bounds.x0 * k, -bounds.y0 * k);
    return smokeCtx;
  }

  function drawSmokeOver(c, inst, ph, now) {
    const can = canAt(inst, now);
    const k = ph.k;
    // Fumigène (rouge, brûlé à la fin)
    c.save();
    c.globalAlpha = k;
    c.translate(can.x, can.y - can.z * 0.4);
    c.rotate(can.rot);
    const sc = 1 + can.z / 160;
    c.scale(sc, sc);
    c.drawImage(ph.p === 'off' ? SPR.canBurnt : SPR.can, -10, -5, 20, 10);
    c.restore();
    if (inst.lit > 0) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = clamp(inst.lit * (reduced ? 0.9 : 0.75 + 0.25 * Math.random()), 0, 1) * k;
      c.drawImage(SPR.flame, inst.tipX - 9, inst.tipY - 9, 18, 18);
      c.drawImage(SPR.redLight, inst.tipX - 22, inst.tipY - 22, 44, 44);
      c.globalCompositeOperation = 'source-over';
    }
    if (reduced) {
      // Nuage posé : il apparaît et s'en va, sans bouger
      const a = (ph.p === 'on' ? clamp(ph.u / 0.6, 0, 1) : ph.p === 'off' ? k : 0) * 0.9;
      if (a > 0) {
        c.globalAlpha = a;
        for (const q of inst.still) c.drawImage(SPR.smokeR, q.x - q.s, q.y - q.s, q.s * 2, q.s * 2);
      }
      c.globalAlpha = 1;
      return;
    }
    const pf = inst.puffs;
    if (!pf.n) return;
    const g = smokeLayer() || c;
    // Rectangle touché (unités) : seul lui est reposé sur le canvas
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < pf.n; i++) {
      const q = pf.a[i];
      const t = q.age / q.life;
      const a = Math.min(1, q.age / 0.35) * (1 - t) ** 1.3 * k;
      const x = q.x;
      const y = q.y - q.z * 0.3;
      const s = q.s;
      const ar = a * 0.78 * (1 - t * 0.7);
      const ag = a * 0.55 * t;
      if (ar <= 0.02 && ag <= 0.02) continue;
      if (ar > 0.02) {
        g.globalAlpha = Math.min(1, ar);
        g.drawImage(SPR.smokeR, x - s, y - s, s * 2, s * 2);
      }
      if (ag > 0.02) {
        g.globalAlpha = ag;
        g.drawImage(SPR.smoke, x - s, y - s, s * 2, s * 2);
      }
      if (x - s < x0) x0 = x - s;
      if (y - s < y0) y0 = y - s;
      if (x + s > x1) x1 = x + s;
      if (y + s > y1) y1 = y + s;
    }
    g.globalAlpha = 1;
    c.globalAlpha = 1;
    if (g === c || x1 <= x0) return;
    // Calque → canvas : le rectangle touché, dans les bords du canvas
    const kk = scale / 2;
    const ax = Math.max(bounds.x0, x0 - 1);
    const ay = Math.max(bounds.y0, y0 - 1);
    const bx = Math.min(bounds.x1, x1 + 1);
    const by = Math.min(bounds.y1, y1 + 1);
    if (bx <= ax || by <= ay) return;
    const sx = Math.max(0, Math.floor((ax - bounds.x0) * kk));
    const sy = Math.max(0, Math.floor((ay - bounds.y0) * kk));
    const sw = Math.min(smokeBuf.width - sx, Math.ceil((bx - ax) * kk) + 1);
    const sh = Math.min(smokeBuf.height - sy, Math.ceil((by - ay) * kk) + 1);
    if (sw <= 0 || sh <= 0) return;
    c.drawImage(smokeBuf, sx, sy, sw, sh, bounds.x0 + sx / kk, bounds.y0 + sy / kk, sw / kk, sh / kk);
  }

  // ─── Cages qui bougent ──────────────────────────────────────────

  function stepGoals(frame, dt, now) {
    let on = false;
    let goldA = 0;
    for (const inst of insts) {
      if (inst.k !== 'goals') continue;
      on = true;
      if (now < inst.e.at && inst.end == null) goldA = reduced ? 0.8 : 0.55 + 0.45 * Math.sin(clock * 16);
    }
    const off = Array.isArray(frame.goalOff) ? frame.goalOff : null;
    for (let i = 0; i < 2; i++) {
      if (off) goalShow[i] = Number(off[i]) || 0;
      else if (goalShow[i] !== 0) {
        // Événement fini net (penalty, but en or) : la cage revient en 0,3 s
        const f = Math.exp(-dt / 0.08);
        goalShow[i] = Math.abs(goalShow[i]) < 0.3 ? 0 : goalShow[i] * f;
      }
    }
    goalsOn = on || goalShow[0] !== 0 || goalShow[1] !== 0;
    goalsGold = goldA;
  }

  function drawGoals(c, stadium) {
    if (!goalsOn) return;
    clipHole(c);
    for (let i = 0; i < 2; i++) {
      const top = i === 1;
      if (stadium) {
        const cv = covers && covers[i];
        if (cv) c.drawImage(cv.canvas, cv.x, cv.y, cv.w, cv.h);
        drawImageGoal(c, goalShow[i], top, goalsGold);
      } else drawFallbackGoal(c, goalShow[i], top, goalsGold);
    }
    if (goalsGold > 0) {
      // Flèches dorées de part et d'autre de chaque cage : elles vont bouger
      c.save();
      c.strokeStyle = GOLD;
      c.lineWidth = 2.4;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.globalAlpha = goalsGold;
      c.beginPath();
      for (const y of [-GD / 2, H + GD / 2]) {
        for (const s of [-1, 1]) {
          const xa = W / 2 + s * (GW / 2 + 30);
          const xb = W / 2 + s * (GW / 2 + 10);
          c.moveTo(xb, y);
          c.lineTo(xa, y);
          c.moveTo(xa - s * 6, y - 5);
          c.lineTo(xa, y);
          c.lineTo(xa - s * 6, y + 5);
        }
      }
      c.stroke();
      c.restore();
    }
    c.restore();
  }

  // ─── Ballon : éclats sur ses changements ─────────────────────────

  function stepBall(frame, dt) {
    const b = frame.ball;
    if (!b) { prev.ok = false; return; }
    const fx = b.fx | 0;
    const air = b.air > 0 ? b.air : 0;
    const live = frame.phase === 'live';
    const dx = b.x - prev.x;
    const dy = b.y - prev.y;
    const near = dx * dx + dy * dy < 70 * 70;
    if (prev.ok && live && prev.live && near) {
      if (fx === FX_FIRE && prev.fx !== FX_FIRE) {
        // Allumage : gerbe d'étincelles et onde orange
        burst(P_SPARK, b.x, b.y, 24, 80, 260);
        ring(P_SHOCK, b.x, b.y, 0.45);
      } else if (fx === FX_ELEC && prev.fx !== FX_ELEC) {
        burst(P_ZAP, b.x, b.y, 14, 80, 240);
        ring(P_SHOCKB, b.x, b.y, 0.4);
      }
      if (prev.fx && !fx) {
        if (air > 0 && !(prev.air > 0)) {
          // Court-circuit : décharge, éclair blanc et le ballon qui bondit
          burst(P_ZAP, b.x, b.y, 22, 80, 280);
          burst(P_SPARK, b.x, b.y, 8, 60, 200);
          ring(P_SHOCKW, b.x, b.y, 0.35);
        } else if (prev.fx === FX_FIRE) steam(b.x, b.y, 12); // vapeur : éteint
        else burst(P_ZAP, b.x, b.y, 8, 40, 140); // charge perdue
      }
    }
    // Flammes de la balle en feu, étincelles bleues de la balle électrique : en jeu et pendant la
    // célébration seulement (après la fin du match, plus rien ne naît : `busy()` redevient faux et
    // la boucle d'animation de l'écran s'arrête)
    if (!reduced && (fx === FX_FIRE || fx === FX_ELEC) && (live || frame.phase === 'goal')) {
      const sp = Math.sqrt((b.vx || 0) ** 2 + (b.vy || 0) ** 2);
      const lift = air > 0 ? Math.sin(Math.PI * (1 - air / HOP_S)) * 14 : 0;
      if (fx === FX_FIRE) {
        const n = Math.min(4, Math.ceil(dt * 60 * (1 + sp / 350)));
        for (let k = 0; k < n; k++) {
          emit(P_FLAME, b.x + rand(-4, 4), b.y - lift + rand(-4, 4), -(b.vx || 0) * 0.12 + rand(-30, 30), -(b.vy || 0) * 0.12 + rand(-30, 30), rand(0.25, 0.45), rand(10, 18), L_BALL);
        }
      } else if (Math.random() < dt * 14) {
        const a = Math.random() * TAU;
        emit(P_ZAP, b.x, b.y - lift, Math.cos(a) * 160, Math.sin(a) * 160, rand(0.12, 0.25), 1, L_OVER);
      }
    }
    prev.ok = true;
    prev.x = b.x;
    prev.y = b.y;
    prev.fx = fx;
    prev.air = air;
    prev.live = live;
  }

  function stepParts(dt) {
    const damp = Math.exp(-3 * dt);
    for (let i = 0; i < parts.n; i++) {
      const p = parts.a[i];
      p.age += dt;
      if (p.age >= p.life) { drop(parts, i); i--; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.k === P_FLAME || p.k === P_SPARK || p.k === P_ZAP) {
        p.vx *= damp;
        p.vy *= damp;
      }
    }
    for (let i = goalBolts.length - 1; i >= 0; i--) {
      goalBolts[i].age += dt;
      if (goalBolts[i].age > 0.45) goalBolts.splice(i, 1);
    }
  }

  function drawParts(c, layer) {
    if (!parts.n) return;
    for (let i = 0; i < parts.n; i++) {
      const p = parts.a[i];
      if (p.l !== layer) continue;
      const t = p.age / p.life;
      const a = 1 - t;
      switch (p.k) {
        case P_FLAME: {
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = a * 0.9;
          const s = p.s * (1 + t * 0.7);
          c.drawImage(SPR.flame, p.x - s / 2, p.y - s / 2, s, s);
          break;
        }
        case P_SPARK:
        case P_ZAP:
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = a;
          c.strokeStyle = p.k === P_SPARK ? 'rgb(255,190,90)' : 'rgb(175,222,255)';
          c.lineWidth = 1.4;
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
          c.stroke();
          break;
        case P_POP:
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = a * 0.9;
          c.fillStyle = '#ffffff';
          c.beginPath();
          c.arc(p.x, p.y, p.s, 0, TAU);
          c.fill();
          break;
        case P_GLINT:
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = a;
          c.fillStyle = '#e8fffb';
          c.beginPath();
          c.arc(p.x, p.y, p.s, 0, TAU);
          c.fill();
          break;
        case P_SPLASH:
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = 0.5 * a;
          c.strokeStyle = 'rgb(220,236,255)';
          c.lineWidth = 0.9;
          c.beginPath();
          c.arc(p.x, p.y, p.s * (0.4 + t), 0, TAU);
          c.stroke();
          break;
        case P_STEAM:
        case P_WISP: {
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = (p.k === P_STEAM ? 0.6 : 0.35) * a;
          const s = p.s * (1 + t * 1.4);
          c.drawImage(SPR.smoke, p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case P_SHOCK:
        case P_SHOCKB:
        case P_SHOCKW:
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = 0.8 * a;
          c.strokeStyle = p.k === P_SHOCK ? 'rgb(255,170,60)' : p.k === P_SHOCKB ? 'rgb(120,190,255)' : 'rgb(255,240,190)';
          c.lineWidth = 3 * a + 0.5;
          c.beginPath();
          c.arc(p.x, p.y, 8 + t * 46, 0, TAU);
          c.stroke();
          break;
        default:
          break;
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  // ─── But en or ───────────────────────────────────────────────────

  function stepGold(frame, dt) {
    const on = !!(frame.mode && frame.mode.k === 'gold');
    if (on && !gold.on) {
      // Passage au but en or vu en direct : la ligne brille puis s'efface ; repris en plein but en
      // or : déjà effacée
      gold = { on: true, t: gold.seen ? 0 : GOLD_GLOW_S + GOLD_FADE_S, seen: true };
    } else if (!on && gold.on) gold = { on: false, t: 0, seen: true };
    if (gold.on) {
      const before = gold.t;
      gold.t += dt;
      if (!reduced && gold.t > GOLD_GLOW_S && before < GOLD_GLOW_S + GOLD_FADE_S) {
        for (let i = 0; i < 3; i++) emit(P_GLINT, rand(6, W - 6), H / 2 + rand(-2, 2), 0, rand(-30, 30), 0.6, rand(1, 2), L_OVER);
      }
    }
    gold.seen = true;
  }

  /** Ligne du milieu : 0 = visible, 1 = effacée (but en or). */
  const midGone = () => (gold.on ? clamp((gold.t - GOLD_GLOW_S) / GOLD_FADE_S, 0, 1) : 0);

  function drawGoldLine(c, stadium) {
    if (!gold.on) return;
    const gone = reduced ? (gold.t > GOLD_GLOW_S ? 1 : 0) : midGone();
    if (stadium && midPatch && gone > 0) {
      c.globalAlpha = gone;
      c.drawImage(midPatch.canvas, midPatch.x, midPatch.y, midPatch.w, midPatch.h);
      c.globalAlpha = 1;
    }
    if (gone < 1) {
      // La ligne brille en or avant de s'effacer
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = (1 - gone) * (reduced ? 0.7 : 0.6 + 0.4 * Math.sin(clock * 12));
      c.fillStyle = 'rgba(235,193,94,.6)';
      c.fillRect(0, H / 2 - 4, W, 8);
      c.restore();
    }
  }

  // ─── Penalty, fautes ─────────────────────────────────────────────

  function drawPenalty(c, frame) {
    const m = frame.mode;
    if (!m || m.k !== 'pen') return;
    const s = m.s === 1 ? 1 : 0;
    const spot = penaltySpot(s);
    const keeper = 1 - s;
    const ky = keeperLine(keeper);
    c.save();
    // Ligne du gardien : tirets dorés entre les poteaux (il y est tenu, x de GL à GR), petits
    // butoirs aux deux bouts, côté terrain
    c.setLineDash(DASH_LINE);
    c.strokeStyle = GOLD;
    c.globalAlpha = 0.9;
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(GL, ky);
    c.lineTo(GR, ky);
    c.stroke();
    c.setLineDash(NO_DASH);
    const tick = 7;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(GL, ky - tick);
    c.lineTo(GL, ky + tick);
    c.moveTo(GR, ky - tick);
    c.lineTo(GR, ky + tick);
    c.stroke();
    // Point de penalty (le ballon y est posé)
    c.globalAlpha = 1;
    c.fillStyle = 'rgb(236,248,240)';
    c.beginPath();
    c.arc(spot.x, spot.y, 3.2, 0, TAU);
    c.fill();
    c.restore();
    // Temps pour tirer : anneau qui se vide autour du ballon (plein pendant la mise en place)
    const b = frame.ball;
    if (b && (frame.phase === 'pen' || (frame.phase === 'live' && m.left >= 0))) {
      const f = frame.phase === 'pen' ? 1 : clamp(m.left / PEN_SHOT_S, 0, 1);
      c.save();
      c.lineCap = 'round';
      c.lineWidth = 3.5;
      c.strokeStyle = 'rgba(255,255,255,.22)';
      c.beginPath();
      c.arc(b.x, b.y, BR + 11, 0, TAU);
      c.stroke();
      c.strokeStyle = f < 0.34 ? RED : GOLD;
      c.beginPath();
      c.arc(b.x, b.y, BR + 11, -Math.PI / 2, -Math.PI / 2 + TAU * f);
      c.stroke();
      c.restore();
    }
  }

  // Camper : anneau sous le joueur à partir de 1 s (rouge à 3 s) et sa grande surface soulignée
  function drawCamp(c, frame) {
    const camp = frame.camp;
    if (!Array.isArray(camp) || (frame.mode && frame.mode.k)) return;
    for (let i = 0; i < 2; i++) {
      const v = Number(camp[i]) || 0;
      const p = frame.paddles && frame.paddles[i];
      if (v < 1 || !p) continue;
      const f = (v - 1) / (CAMP_S - 1);
      c.save();
      c.globalAlpha = 0.25 + 0.45 * clamp(f, 0, 1) * (reduced ? 1 : 0.7 + 0.3 * Math.sin(clock * 10));
      c.strokeStyle = f >= 1 ? RED : GOLD;
      c.lineWidth = 2;
      const x0 = (W - BBW) / 2;
      c.strokeRect(x0, i === 0 ? H - BBD : 1, BBW, BBD - 1);
      c.restore();
      chronoRing(c, p.x, p.y, PR + 6, f, 3.5);
    }
  }

  // Bloquer : anneau autour du ballon à partir de 0,5 s
  function drawPin(c, frame) {
    const pin = frame.pin;
    const b = frame.ball;
    if (!Array.isArray(pin) || !b || (frame.mode && frame.mode.k)) return;
    const v = Math.max(Number(pin[0]) || 0, Number(pin[1]) || 0);
    if (v < 0.5) return;
    chronoRing(c, b.x, b.y, BR + 9, (v - 0.5) / (BLOCK_S - 0.5), 3);
  }

  // ─── Annonces : contours qui clignotent ──────────────────────────

  function drawAnnounce(c, inst, now) {
    const e = inst.e;
    if (now >= e.at || inst.end != null) return;
    if (e.k === 'foam') for (const [x, y, rx, ry, a] of e.l) dashedEllipse(c, x, y, rx + 5, ry + 5, a, clock, '#ffffff', reduced);
    else if (e.k === 'gel') {
      const [x, y, rx, ry, a] = e.l[0];
      dashedEllipse(c, x, y, rx + 6, ry + 6, a, clock, '#c8fff6', reduced);
    } else if (e.k === 'water') for (const s of e.s) dashedEllipse(c, s[0], s[1], 18, 18, 0, clock, '#d4e6f5', reduced);
    else if (e.k === 'smoke') dashedEllipse(c, e.x, e.y, 22, 22, 0, clock, RED, reduced);
  }

  // ─── Interface du module ─────────────────────────────────────────

  function hasKind(k) {
    for (const inst of insts) if (inst.k === k) return true;
    return false;
  }

  function clear() {
    insts.length = 0;
    parts.n = 0;
    rain.n = 0;
    drops.n = 0;
    goalBolts.length = 0;
    goalShow[0] = 0;
    goalShow[1] = 0;
    goalsOn = false;
    goalsGold = 0;
    gold = { on: false, t: 0, seen: false };
    prev.ok = false;
    prevNow = null;
    wetA = 0;
  }

  return {
    setReduced(on) { reduced = !!on; },
    /** Image du stade chargée (raccords de pelouse, loupe du gel), ou null. */
    setImage(image) {
      img = image || null;
      covers = null;
      midPatch = null;
      for (const inst of insts) inst.cacheK = 0;
      if (!img) return;
      try {
        covers = [goalCover(img, false), goalCover(img, true)];
        midPatch = midlinePatch(img);
      } catch {
        covers = null;
        midPatch = null;
      }
    },
    /** Échelle du canvas (px par unité) et ses bords en unités du terrain, au redimensionnement. */
    setView(k, x0, y0, x1, y1) {
      scale = k;
      bounds.x0 = x0;
      bounds.y0 = y0;
      bounds.x1 = x1;
      bounds.y1 = y1;
    },
    reset: clear,
    /** Terrain dessiné de secours : calque à refaire sans filets (cages qui bougent) ni ligne du milieu. */
    fieldFlags() {
      return { nets: !goalsOn, midline: !(gold.on && (reduced ? gold.t > GOLD_GLOW_S : midGone() >= 1)) };
    },
    /** Hauteur du ballon en l'air (0 à 1, bond du court-circuit). */
    hop(ball) {
      const air = ball && ball.air > 0 ? ball.air : 0;
      return air > 0 ? Math.sin(Math.PI * clamp(1 - air / HOP_S, 0, 1)) : 0;
    },
    /** Une image : effets avancés de `dt` secondes. `frame` null : plus rien (hors match). */
    step(frame, dt) {
      clock += dt;
      if (!frame) {
        if (insts.length || goalsOn) clear();
        stepParts(dt);
        return;
      }
      const now = Number.isFinite(frame.now) ? frame.now : null;
      if (now != null) syncEvents(frame, now);
      else if (insts.length) insts.length = 0;
      const b = frame.ball;
      let dark = 0;
      let water = false;
      for (const inst of insts) {
        const ph = phaseOf(inst, now);
        if (inst.k === 'foam') stepFoam(inst, ph, dt, b, frame.paddles);
        else if (inst.k === 'gel') stepGel(inst, ph, dt, b);
        else if (inst.k === 'storm') {
          stepStorm(inst, ph, dt, now);
          dark = Math.max(dark, inst.dark);
        } else if (inst.k === 'water') {
          stepWater(inst, ph, dt, now);
          water = true;
          wetA = ph.p === 'on' ? Math.min(1, wetA + dt * 3) : ph.p === 'off' ? Math.min(wetA, clamp(1 - (now - inst.end) / WET_FADE_MS, 0, 1)) : wetA;
        } else if (inst.k === 'smoke') stepSmoke(inst, ph, dt, now);
      }
      if (!water && wetA > 0) wetA = Math.max(0, wetA - (dt * 1000) / WET_FADE_MS);
      stepRain(dark, dt);
      stepDrops(dt);
      stepGoals(frame, dt, now);
      stepGold(frame, dt);
      stepBall(frame, dt);
      stepParts(dt);
      prevNow = now;
    },
    /**
     * Au sol, sous le ballon et les joueurs (et sous les noms) : raccords et cages qui bougent,
     * ligne du milieu, pelouse mouillée, gel, mousse, traces de foudre, têtes d'arroseur, lueur du
     * fumigène, ciel d'orage.
     */
    ground(c, frame, stadium) {
      if (!frame) return;
      const now = frame.now;
      drawGoals(c, stadium);
      drawGoldLine(c, stadium);
      if (wetUsed && wet && wetA > 0) {
        c.globalAlpha = wetA;
        c.drawImage(wet, 0, 0, W, H);
        c.globalAlpha = 1;
      }
      for (const inst of insts) {
        const ph = phaseOf(inst, now);
        if (inst.k === 'gel') drawGel(c, inst, ph);
        else if (inst.k === 'water') drawWaterGround(c, inst, ph, now);
        else if (inst.k === 'smoke') drawSmokeGround(c, inst, ph, now);
      }
      drawParts(c, L_UNDER);
      for (const inst of insts) {
        if (inst.k === 'storm') drawStormGround(c, inst, phaseOf(inst, now), now);
      }
    },
    /** Sous le ballon, sur le terrain : penalty, anneaux des fautes (sous le joueur). */
    play(c, frame) {
      if (!frame) return;
      drawPenalty(c, frame);
      drawCamp(c, frame);
    },
    /** Juste sous le ballon : lueur et flammes (ballon en feu ou électrique). */
    ballBack(c, b, hop) {
      if (!b) return;
      drawParts(c, L_BALL);
      const fx = b.fx | 0;
      if (!fx) return;
      const lift = hop * 14;
      c.globalCompositeOperation = 'lighter';
      if (fx === FX_FIRE) c.drawImage(SPR.glowO, b.x - 30, b.y - lift - 30, 60, 60);
      else c.drawImage(SPR.glowB, b.x - 32, b.y - lift - 32, 64, 64);
      c.globalCompositeOperation = 'source-over';
    },
    /** Sur le ballon : teinte du feu ou de la charge, arcs électriques, anneau du ballon bloqué. */
    ballFront(c, frame, hop) {
      const b = frame && frame.ball;
      if (!b) return;
      const fx = b.fx | 0;
      const lift = hop * 14;
      const k = 1 + 0.6 * hop;
      if (fx === FX_FIRE || fx === FX_ELEC) {
        c.save();
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = fx === FX_FIRE ? 0.62 : 0.55;
        c.drawImage(fx === FX_FIRE ? SPR.flame : SPR.glowB, b.x - BR * k * 1.15, b.y - lift - BR * k * 1.15, BR * k * 2.3, BR * k * 2.3);
        c.restore();
        if (fx === FX_ELEC) arcs(c, b.x, b.y - lift, 9, 21, 3, reduced ? 4242 : 0);
      }
      drawPin(c, frame);
    },
    /**
     * Par-dessus le ballon et les joueurs : bulles, eau, pluie, points chargés, éclairs et flash,
     * fumée (elle cache le ballon), étincelles, contours d'annonce.
     */
    over(c, frame) {
      if (!frame) {
        drawParts(c, L_OVER);
        return;
      }
      const now = frame.now;
      for (const inst of insts) {
        if (inst.k === 'foam') drawFoam(c, inst, phaseOf(inst, now));
      }
      if (drops.n || hasKind('water')) {
        // Jets et gouttes : jamais sur les tribunes
        clipHole(c);
        for (const inst of insts) {
          if (inst.k === 'water') drawWaterOver(c, inst, phaseOf(inst, now), now);
        }
        drawDrops(c);
        c.restore();
      }
      drawRain(c);
      for (const inst of insts) {
        if (inst.k === 'storm') drawStormOver(c, inst, phaseOf(inst, now), now);
      }
      for (const inst of insts) {
        if (inst.k === 'smoke') drawSmokeOver(c, inst, phaseOf(inst, now), now);
      }
      drawParts(c, L_OVER);
      for (const gb of goalBolts) drawBolt(c, gb, Math.max(0, 1 - gb.age / 0.45));
      for (const inst of insts) drawAnnounce(c, inst, now);
    },
    /**
     * But (scorer 0 = joueur du bas, qui marque dans la cage du haut) : en feu, gerbe de flammes et
     * onde ; électrique (ou à 2), décharges bleues et petits éclairs dans la cage.
     */
    goal(scorer, { value = 1, fx = 0 } = {}, ball) {
      const top = scorer === 0;
      const gx = ball && Number.isFinite(ball.x) ? clamp(ball.x, GL + 8, GR - 8) : W / 2;
      const gy = top ? -GD * 0.45 : H + GD * 0.45;
      if (fx === FX_FIRE) {
        const n = reduced ? 4 : 30;
        for (let i = 0; i < n; i++) {
          emit(P_FLAME, gx + rand(-30, 30), gy + rand(-8, 8), rand(-90, 90), (top ? 1 : -1) * rand(20, 160), rand(0.4, 0.8), rand(14, 26), L_OVER);
        }
        burst(P_SPARK, gx, gy, 30, 120, 420);
        ring(P_SHOCK, gx, gy, 0.6);
      }
      if (fx === FX_ELEC || value >= 2) {
        burst(P_ZAP, gx, gy, 36, 120, 420);
        ring(P_SHOCKB, gx, gy, 0.5);
        ring(P_SHOCKW, gx, gy, 0.35);
        if (!reduced) {
          for (let i = 0; i < 3; i++) {
            const a = (top ? Math.PI / 2 : -Math.PI / 2) + rand(-1.1, 1.1);
            const len = rand(60, 120);
            goalBolts.push({ main: jag(Math.random, gx, gy, gx + Math.cos(a) * len, gy + Math.sin(a) * len, 4, 0.3), branches: [], age: 0 });
          }
        }
      }
    },
    /** Des effets passagers sont encore à l'écran (étincelles, éclairs de but). */
    busy() {
      return parts.n > 0 || goalBolts.length > 0;
    },
  };
}
