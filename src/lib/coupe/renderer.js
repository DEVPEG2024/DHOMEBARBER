/*
 * Dessin canvas de La Coupe du Gang (docs/fonctions/coupe-du-gang.md), porté du prototype validé
 * par le propriétaire (docs/prototypes/coupe-du-gang.html) : terrain, panneaux lumineux, ballon et
 * sa traînée, joueurs, étincelles, bannière « BUT ! », « GO ! », tremblement, pluie de lames de rasoir.
 *
 * Thème stade (planche validée le 29 oct. 2026, docs/fonctions/coupe-du-gang-stade.md) : rouge, noir
 * et blanc, une touche d'or (`COUPE_COLORS`). Quand l'image du stade est sous le canvas
 * (`setStadium(true)`), il ne dessine plus aucun terrain (ni fond, ni gazon, ni lignes, ni filets,
 * ni panneaux, ni « DHB ») : l'image est LE terrain, le canvas y pose les joueurs, le ballon, les
 * noms, le score et les effets. Sans l'image (`false`, par défaut, ou image qui ne charge pas), le
 * terrain est dessiné comme avant, aux nouvelles couleurs.
 *
 * Indépendant de React et du réseau : on lui donne une « image » du match (`render(frame, dt)`).
 * Repère local : le joueur du bas est toujours l'indice 0 (anneau rouge : toi, ou le joueur du bas
 * à deux), celui du haut l'indice 1 (anneau blanc). À deux sur un téléphone (`setTwoPlayers(true)`),
 * les textes du joueur du haut sont tournés vers lui.
 *
 * Économie (relecture du 29 oct. 2026) : le terrain, le fond des panneaux, les noms, le texte des
 * panneaux et les deux joueurs sont pré-dessinés dans des calques au redimensionnement (et quand
 * les joueurs changent) ; une frame ne fait que les recopier. Le renderer ne dessine que quand on
 * l'appelle : l'écran n'anime rien quand aucun match n'est affiché (`paint` une fois, puis rien).
 *
 * Joueurs : jamais de photo (une photo de barber n'est jamais ronde, règle de l'app). Le salon =
 * « DHB » + petite étoile bleue ; un barber = son initiale + petits ciseaux ; un client = ses
 * initiales.
 */
import {
  W, H, GW, GL, GR, GD, SBW, SBD, BBW, BBD, BR, PR, POST, POSTS, KEEP_LIMIT, FINGER_OFFSET, boxOf,
} from './engine.js';
// Chemin relatif (pas l'alias `@/`) : les vérifications de bout en bout chargent ce fichier dans Node
import { COUPE_COLORS } from '../../components/coupe/palette.js';

// Marges autour du terrain (unités du terrain) : panneaux sur les côtés, cages et noms en haut et en bas
export const MS = 16;
export const MG = 36;
export const VW = W + MS * 2;
export const VH = H + MG * 2;
const TAU = Math.PI * 2;
// Panneaux : largeur, longueur, haut (unités du terrain)
const BOARD_W = MS - 6;
const BOARD_LEN = H + 2 * MG - 8;
const BOARD_Y0 = -MG + 4;
// Demi-côté du calque d'un joueur (ombre, étoile, ciseaux compris)
const SPRITE_HALF = PR + 10;
// Pastille d'un nom dans la marge : largeur au plus (unités), pour ne jamais passer sur la cage
const NAME_MAX = W - GR - 2;
// Compte à rebours du coup d'envoi : 3 s. Au premier coup d'envoi d'un match (`countS` > 3,
// avant-match du thème stade : le stade entier, puis le zoom sur le terrain), les chiffres 3, 2, 1
// n'occupent que les 2,5 dernières secondes
const COUNT_S = 3;
const INTRO_DIGITS_S = 2.5;
// « GO ! » au coup d'envoi (passage de `count` à `live`, jamais après un engagement `ready`)
const GO_S = 0.5;
// Bande rouge inclinée de la bannière « BUT ! » (skewX(-8deg) de la maquette StadeAnimation)
const BANNER_SKEW = Math.tan((-8 * Math.PI) / 180);

/**
 * Couleurs du jeu (thème stade, `COUPE_COLORS`) : le jeu reste sombre quel que soit le thème de
 * l'app. Joueur 0 (toi, ou le joueur du bas à deux) en rouge, joueur 1 (l'adversaire) en blanc.
 */
export const COLORS = {
  night: COUPE_COLORS.noir,
  stand: COUPE_COLORS.noir2,
  fg: COUPE_COLORS.blanc,
  muted: COUPE_COLORS.gris,
  // Terrain dessiné (sans l'image du stade) : mêmes bandes de gazon et mêmes lignes que l'image
  // (docs/prototypes/stade-coupe/gazon_neuf.py)
  turfA: '#24482b',
  turfB: '#1b3a21',
  chalk: 'rgba(236, 248, 240, .86)',
  board: COUPE_COLORS.rougeVif, // texte des panneaux lumineux
  // Joueur 0 : anneau rouge ; son nom et son score en rouge vif (rouge écrit sur fond noir)
  me: COUPE_COLORS.rouge,
  meDeep: COUPE_COLORS.rougeSombre,
  meText: COUPE_COLORS.rougeVif,
  // Joueur 1 : anneau blanc ; son nom et son score en blanc
  rival: COUPE_COLORS.blancCasse,
  rivalDeep: '#b9bcc2',
  rivalText: COUPE_COLORS.blanc,
  // Contour des grands chiffres et des textes posés sur le terrain ; pastilles des noms
  ink: 'rgba(11, 11, 12, .88)',
  pill: 'rgba(11, 11, 12, .8)',
  gold: COUPE_COLORS.or, // étincelles
  warn: COUPE_COLORS.or, // alertes : ballon gardé dans une moitié, petite surface interdite
  // Étoile du salon : même bleu que dans le fil (text-blue-500)
  star: COUPE_COLORS.etoile,
};

const BOARD_TEXT = "D'HOME BARBER  ·  DOUVAINE  ·  LA COUPE DU GANG  ·  ";
const font = (w, px) => `${w} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
const rand = (a, b) => a + Math.random() * (b - a);

/** Le salon (« D'Home Barber ») : rôle `admin` (prototype réseau) ou `salon` (classement). */
export const isSalonRole = (role) => role === 'admin' || role === 'salon';

/**
 * Pastille d'un joueur d'après son nom et son rôle (rôles envoyés par le serveur dans `start`) :
 * salon → « DHB » + étoile, barber → initiale + ciseaux, client → initiales (« Camille T. » → « CT »).
 * `tag` impose le texte (contre le salon : « TOI », « BOSS » ; à deux : « J1 », « J2 »).
 */
export function playerBadge(name, role, tag) {
  const clean = String(name || '').trim();
  if (isSalonRole(role)) return { name: clean || "D'Home Barber", tag: tag || 'DHB', star: true, scissors: false };
  const words = clean.split(/\s+/).filter(Boolean);
  const first = (words[0] || '?').charAt(0).toUpperCase();
  if (role === 'barber') return { name: clean || 'Barber', tag: tag || first, star: false, scissors: true };
  const second = words[1] ? words[1].charAt(0).toUpperCase() : '';
  return { name: clean || 'Joueur', tag: tag || `${first}${second}`, star: false, scissors: false };
}

/** Échelle et marges du terrain dans une zone de `width` × `height` px (mêmes calculs partout). */
export function viewOf(width, height) {
  const s = Math.max(0.01, Math.min(width / VW, height / VH));
  return { s, ox: (width - VW * s) / 2, oy: (height - VH * s) / 2 };
}

/** Point de l'écran → terrain (repère local), pour une zone dont le coin est (`left`, `top`). */
export function screenToWorld(view, left, top, clientX, clientY) {
  return { x: (clientX - left - view.ox) / view.s - MS, y: (clientY - top - view.oy) / view.s - MG };
}

function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function pentagon(c, x, y, r, rot) {
  c.beginPath();
  for (let k = 0; k < 5; k++) {
    const a = rot + (k * TAU) / 5;
    c[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
}

/** Étoile à cinq branches (étoile bleue du salon). */
function star(c, x, y, r, color) {
  c.save();
  c.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    c[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = color;
  c.fill();
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(11,11,12,.85)';
  c.stroke();
  c.restore();
}

/** Petits ciseaux (barber) : deux anneaux et deux lames croisées, dans une pastille noire. */
function scissors(c, x, y, size, color) {
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(11,11,12,.9)';
  c.beginPath();
  c.arc(0, 0, size, 0, TAU);
  c.fill();
  c.strokeStyle = color;
  c.lineWidth = 1.3;
  c.lineCap = 'round';
  const s = size * 0.62;
  c.beginPath();
  c.arc(-s * 0.55, s * 0.55, s * 0.32, 0, TAU);
  c.moveTo(s * 0.55 + s * 0.32, s * 0.55);
  c.arc(s * 0.55, s * 0.55, s * 0.32, 0, TAU);
  c.stroke();
  c.beginPath();
  c.moveTo(-s * 0.32, s * 0.3);
  c.lineTo(s * 0.7, -s * 0.85);
  c.moveTo(s * 0.32, s * 0.3);
  c.lineTo(-s * 0.7, -s * 0.85);
  c.stroke();
  c.restore();
}

function blade(c) {
  const w = 30;
  const h = 13;
  const g = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, '#f4f7f9');
  g.addColorStop(0.5, '#a9b3bb');
  g.addColorStop(1, '#e3e8ec');
  c.fillStyle = g;
  rrect(c, -w / 2, -h / 2, w, h, 2.5);
  c.fill();
  c.fillStyle = '#0b100d';
  rrect(c, -9, -1.6, 18, 3.2, 1.6);
  c.fill();
  c.beginPath();
  c.arc(-9, 0, 2.4, 0, TAU);
  c.arc(9, 0, 2.4, 0, TAU);
  c.fill();
  c.beginPath();
  c.arc(0, 0, 2.8, 0, TAU);
  c.fill();
  c.beginPath();
  c.moveTo(-2.5, -h / 2);
  c.lineTo(0, -h / 2 + 2.5);
  c.lineTo(2.5, -h / 2);
  c.fill();
  c.beginPath();
  c.moveTo(-2.5, h / 2);
  c.lineTo(0, h / 2 - 2.5);
  c.lineTo(2.5, h / 2);
  c.fill();
}

const tagFont = (tag) => font(800, tag.length > 3 ? 12 : tag.length > 2 ? 14 : tag.length > 1 ? 16 : 19);

/**
 * Nom d'un joueur sur sa pastille noire (maquette StadeMatch), autour de y = 0 : bord droit de la
 * pastille en x = 0 (`alignEnd`), sinon bord gauche en x = 0 ; étoile du salon devant le nom. Un nom
 * trop long pour la marge est écrit plus petit, puis coupé (« … ») : la pastille ne passe jamais
 * sur la cage. `minPx` : taille du texte au moins (unités du terrain), pour qu'il reste lisible sur
 * un petit écran.
 */
function namePill(c, badge, color, alignEnd, minPx = 0) {
  const pad = 7;
  const lead = badge.star ? 15 : 0;
  const room = NAME_MAX - lead - pad * 2;
  let label = badge.name.toUpperCase();
  let px = Math.max(14, minPx);
  c.font = font(800, px);
  let tw = c.measureText(label).width;
  if (tw > room) {
    px = Math.max(11, minPx, Math.floor((px * room) / tw));
    c.font = font(800, px);
    tw = c.measureText(label).width;
    const chars = Array.from(label);
    while (tw > room && chars.length > 1) {
      chars.pop();
      label = `${chars.join('').trimEnd()}…`;
      tw = c.measureText(label).width;
    }
  }
  const pw = tw + lead + pad * 2;
  const x0 = alignEnd ? -pw : 0;
  const ph = Math.max(21, Math.round(px * 1.5));
  rrect(c, x0, -ph / 2, pw, ph, 6);
  c.fillStyle = COLORS.pill;
  c.fill();
  if (badge.star) star(c, x0 + pad + 5.5, 0, 5.5, COLORS.star);
  c.fillStyle = color;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText(label, x0 + pad + lead, 1);
}

/**
 * Crée le dessin sur `canvas`, dimensionné sur son parent (observé : rotation, clavier, fenêtre).
 * options : { reducedMotion } (animations réduites : ni tremblement, ni zoom, panneaux immobiles,
 * peu de lames).
 */
export function createRenderer(canvas, { reducedMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d');
  const strips = [document.createElement('canvas'), document.createElement('canvas')]; // gauche, droite
  const sprites = [document.createElement('canvas'), document.createElement('canvas')];
  const host = canvas.parentElement || canvas;
  const view = { s: 1, ox: 0, oy: 0, cw: 0, ch: 0, dpr: 1 };
  let reduced = !!reducedMotion;
  let twoPlayers = false;
  let labels = false; // noms et cadre du score (pendant un match)
  let stadium = false; // image du stade sous le canvas : aucun terrain dessiné
  let players = [playerBadge('Toi', 'user'), playerBadge('Adversaire', 'user')];
  let boardTw = 1;
  let particles = [];
  let blades = [];
  let trail = [];
  let shake = 0;
  let shakeX = 0;
  let shakeY = 0;
  let clock = 0;
  let banner = null; // { t, scorer }
  let go = null; // { t } : « GO ! » au coup d'envoi
  let prevPhase = null; // phase de la frame précédente (« GO ! » au passage de `count` à `live`)
  let lastFrame = null;
  let painted = false;
  let destroyed = false;

  const scale = () => view.s * view.dpr;

  function worldTransform(c, sx = 0, sy = 0) {
    c.setTransform(scale(), 0, 0, scale(),
      view.dpr * (view.ox + (MS + sx) * view.s), view.dpr * (view.oy + (MG + sy) * view.s));
  }

  // ─── Calques (refaits au redimensionnement, quand les joueurs ou les polices changent) ───

  function drawNet(c, dir) {
    const y0 = dir < 0 ? -GD : H;
    c.save();
    c.fillStyle = 'rgba(255,255,255,.05)';
    c.fillRect(GL, y0, GW, GD);
    c.beginPath();
    c.rect(GL, y0, GW, GD);
    c.clip();
    c.strokeStyle = 'rgba(236,248,240,.2)';
    c.lineWidth = 0.6;
    for (let x = GL; x <= GR; x += 6) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y0 + GD); c.stroke(); }
    for (let y = y0; y <= y0 + GD; y += 6) { c.beginPath(); c.moveTo(GL, y); c.lineTo(GR, y); c.stroke(); }
    c.restore();
    c.strokeStyle = COLORS.chalk;
    c.lineWidth = 2;
    c.beginPath();
    const back = dir < 0 ? -GD : H + GD;
    const line = dir < 0 ? 0 : H;
    c.moveTo(GL, line);
    c.lineTo(GL, back);
    c.lineTo(GR, back);
    c.lineTo(GR, line);
    c.stroke();
  }

  // Noms dans les marges, sur une pastille noire, au bord droit du terrain (le bas en rouge vif, le
  // haut en blanc) ; à deux, celui du haut tourné vers son joueur
  function drawNames(c) {
    // Jamais moins de 9 px à l'écran (iPhone SE : 6 px sans ce plancher)
    const minPx = Math.min(22, 9 / Math.max(0.01, view.s));
    c.save();
    c.translate(W, H + MG / 2);
    namePill(c, players[0], COLORS.meText, true, minPx);
    c.restore();
    c.save();
    c.translate(W, -MG / 2);
    if (twoPlayers) {
      c.rotate(Math.PI);
      namePill(c, players[1], COLORS.rivalText, false, minPx);
    } else namePill(c, players[1], COLORS.rivalText, true, minPx);
    c.restore();
    // Cadre noir du score, au bord droit, à cheval sur la ligne médiane (chiffres à chaque frame)
    c.save();
    rrect(c, W - 33, H / 2 - 46, 27, 92, 13.5);
    c.fillStyle = 'rgba(11,11,12,.86)';
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.2)';
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.3)';
    c.fillRect(W - 27, H / 2 - 0.5, 15, 1);
    c.restore();
  }

  // Terrain dessiné (sans l'image du stade) : fond, filets, gazon, lignes, « DHB », poteaux, fond
  // des panneaux
  function drawField(c) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const bg = c.createRadialGradient(cx, cy, 10, cx, cy, Math.max(canvas.width, canvas.height) * 0.75);
    bg.addColorStop(0, COLORS.stand);
    bg.addColorStop(1, COLORS.night);
    c.fillStyle = bg;
    c.fillRect(0, 0, canvas.width, canvas.height);
    worldTransform(c);
    drawNet(c, -1);
    drawNet(c, 1);
    const bands = 14;
    for (let k = 0; k < bands; k++) {
      c.fillStyle = k % 2 ? COLORS.turfA : COLORS.turfB;
      c.fillRect(0, (k * H) / bands, W, H / bands + 0.5);
    }
    const light = c.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H * 0.62);
    light.addColorStop(0, 'rgba(255,255,255,.07)');
    light.addColorStop(1, 'rgba(0,0,0,.3)');
    c.fillStyle = light;
    c.fillRect(0, 0, W, H);
    // Petites surfaces hachurées : on n'y entre pas
    [0, 1].forEach((i) => {
      const b = boxOf(i);
      c.save();
      c.beginPath();
      c.rect(b.x0, b.y0, SBW, SBD);
      c.clip();
      c.fillStyle = 'rgba(255,255,255,.035)';
      c.fillRect(b.x0, b.y0, SBW, SBD);
      c.strokeStyle = 'rgba(255,255,255,.09)';
      c.lineWidth = 1.2;
      for (let x = b.x0 - SBD; x < b.x1; x += 8) { c.beginPath(); c.moveTo(x, b.y0); c.lineTo(x + SBD, b.y1); c.stroke(); }
      c.restore();
    });
    c.strokeStyle = COLORS.chalk;
    c.lineWidth = 2;
    c.lineCap = 'round';
    c.strokeRect(1, 1, W - 2, H - 2);
    c.beginPath();
    c.moveTo(1, H / 2);
    c.lineTo(W / 2 - 30, H / 2);
    c.moveTo(W / 2 + 30, H / 2);
    c.lineTo(W - 1, H / 2);
    c.stroke();
    c.beginPath();
    c.arc(W / 2, H / 2, 48, 0, TAU);
    c.stroke();
    const bx0 = (W - BBW) / 2;
    const sx0 = (W - SBW) / 2;
    const a = Math.asin((BBD - 72) / 48);
    c.strokeRect(bx0, 1, BBW, BBD - 1);
    c.strokeRect(bx0, H - BBD, BBW, BBD - 1);
    c.strokeRect(sx0, 1, SBW, SBD - 1);
    c.strokeRect(sx0, H - SBD, SBW, SBD - 1);
    c.beginPath();
    c.arc(W / 2, 72, 48, a, Math.PI - a);
    c.stroke();
    c.beginPath();
    c.arc(W / 2, H - 72, 48, Math.PI + a, TAU - a);
    c.stroke();
    [[1, 1, 0], [W - 1, 1, Math.PI / 2], [W - 1, H - 1, Math.PI], [1, H - 1, Math.PI * 1.5]].forEach(([x, y, s]) => {
      c.beginPath();
      c.arc(x, y, 10, s, s + Math.PI / 2);
      c.stroke();
    });
    c.fillStyle = COLORS.chalk;
    [[W / 2, H / 2], [W / 2, 72], [W / 2, H - 72]].forEach(([x, y]) => {
      c.beginPath();
      c.arc(x, y, 2.6, 0, TAU);
      c.fill();
    });
    c.fillStyle = 'rgba(236,248,240,.16)';
    c.font = font(800, 30);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('DHB', W / 2, H / 2 + 1);
    c.fillStyle = '#ffffff';
    POSTS.forEach(([x, y]) => {
      c.beginPath();
      c.arc(x, y, POST, 0, TAU);
      c.fill();
    });
    // Fond des panneaux (le texte qui défile est dans `strips`)
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -MS + 3 : W + 3;
      rrect(c, x0, BOARD_Y0, BOARD_W, BOARD_LEN, 4);
      c.fillStyle = 'rgba(11,11,12,.92)';
      c.fill();
    }
  }

  // Calque fixe : le terrain dessiné (sauf sur l'image du stade), puis les noms et le cadre du
  // score pendant un match
  function buildPitch() {
    layer.width = canvas.width;
    layer.height = canvas.height;
    const c = lctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (!stadium) drawField(c);
    if (labels) {
      worldTransform(c);
      drawNames(c);
    }
  }

  // Texte des panneaux : une longue bande par côté, recopiée décalée à chaque frame
  function buildStrips() {
    const k = scale();
    lctx.save();
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.font = font(700, 9);
    boardTw = lctx.measureText(BOARD_TEXT).width || 1;
    lctx.restore();
    const tw = boardTw;
    [-1, 1].forEach((side, i) => {
      const cv = strips[i];
      cv.width = Math.max(1, Math.ceil(BOARD_W * k));
      cv.height = Math.max(1, Math.ceil((BOARD_LEN + 2 * tw) * k));
      const c = cv.getContext('2d');
      c.setTransform(k, 0, 0, k, 0, 0);
      c.clearRect(0, 0, BOARD_W, BOARD_LEN + 2 * tw);
      // Bande : y = 0 ↔ terrain y = BOARD_Y0 − tw
      c.translate(BOARD_W / 2, tw - BOARD_Y0);
      c.rotate(side < 0 ? -Math.PI / 2 : Math.PI / 2);
      c.font = font(700, 9);
      c.fillStyle = COLORS.board;
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      for (let u = -BOARD_LEN - MG - 3 * tw; u < BOARD_LEN + MG + 3 * tw; u += tw) c.fillText(BOARD_TEXT, u, 0.5);
    });
  }

  // Un joueur dessiné autour de (0, 0) : ombre, anneau (rouge pour le joueur 0, blanc pour le
  // joueur 1), pastille sombre, texte blanc, reflet, marque du rôle
  function paintPaddle(c, i) {
    const badge = players[i];
    const ring = i === 0 ? [COLORS.me, COLORS.meDeep] : [COLORS.rival, COLORS.rivalDeep];
    c.fillStyle = 'rgba(0,0,0,.36)';
    c.beginPath();
    c.ellipse(3, 6, PR, PR * 0.9, 0, 0, TAU);
    c.fill();
    const g = c.createLinearGradient(-PR, -PR, PR, PR);
    g.addColorStop(0, ring[0]);
    g.addColorStop(1, ring[1]);
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, PR, 0, TAU);
    c.fill();
    const g2 = c.createRadialGradient(-6, -8, 2, 0, 0, PR - 4);
    g2.addColorStop(0, '#36373c');
    g2.addColorStop(1, '#1c1d20');
    c.fillStyle = g2;
    c.beginPath();
    c.arc(0, 0, PR - 4.5, 0, TAU);
    c.fill();
    c.save();
    if (i === 1 && twoPlayers) c.rotate(Math.PI);
    c.fillStyle = COLORS.fg;
    c.font = tagFont(badge.tag);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(badge.tag, 0, 1);
    c.restore();
    c.save();
    c.globalAlpha = 0.2;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(-7, -10, 9, 4.5, -0.6, 0, TAU);
    c.fill();
    c.restore();
    // Marques du rôle, posées sur l'anneau : étoile bleue (salon) ou ciseaux de la couleur de
    // l'anneau (barber)
    if (badge.star) star(c, PR * 0.72, -PR * 0.72, 7, COLORS.star);
    else if (badge.scissors) scissors(c, PR * 0.72, PR * 0.72, 7.5, ring[0]);
  }

  function buildSprites() {
    const k = scale();
    const size = Math.max(1, Math.ceil(2 * SPRITE_HALF * k));
    sprites.forEach((cv, i) => {
      cv.width = size;
      cv.height = size;
      const c = cv.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, size, size);
      c.setTransform(k, 0, 0, k, size / 2, size / 2);
      paintPaddle(c, i);
    });
  }

  function buildLayers() {
    if (destroyed) return;
    buildPitch();
    if (!stadium) buildStrips();
    buildSprites();
  }

  // Taille du parent dans la mise en page. Thème stade : le calque de la caméra qui porte le canvas
  // est transformé pendant un zoom (stade entier), et sa taille à l'écran (getBoundingClientRect)
  // n'est alors plus celle du dessin. offsetWidth / offsetHeight ignorent les transformations mais
  // sont arrondis au pixel : pris seulement quand ils s'écartent de la taille à l'écran.
  function hostSize() {
    const r = host.getBoundingClientRect();
    const lw = host.offsetWidth;
    const lh = host.offsetHeight;
    if (lw > 0 && lh > 0 && (Math.abs(lw - r.width) > 1 || Math.abs(lh - r.height) > 1)) return { width: lw, height: lh };
    return { width: r.width, height: r.height };
  }

  function resize() {
    if (destroyed) return;
    const r = hostSize();
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    view.cw = r.width;
    view.ch = r.height;
    canvas.width = Math.max(1, Math.round(r.width * view.dpr));
    canvas.height = Math.max(1, Math.round(r.height * view.dpr));
    const v = viewOf(r.width, r.height);
    view.s = v.s;
    view.ox = v.ox;
    view.oy = v.oy;
    buildLayers();
    // Redimensionné entre deux frames (ou à l'arrêt) : la dernière image est redessinée une fois
    if (painted) paint(lastFrame);
  }

  // ─── Frame : état des effets ───────────────────────────────────────

  function step(frame, dt) {
    clock += dt;
    if (banner) {
      banner.t += dt;
      if (banner.t > 1.9) banner = null;
    }
    if (go) {
      go.t += dt;
      if (go.t >= GO_S) go = null;
    }
    // Coup d'envoi : le compte à rebours s'achève (pas un engagement `ready`)
    const phase = frame ? frame.phase : null;
    if (prevPhase === 'count' && phase === 'live') go = { t: 0 };
    prevPhase = phase;
    shakeX = 0;
    shakeY = 0;
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 2.4);
      const a = shake * shake * 7;
      shakeX = rand(-a, a);
      shakeY = rand(-a, a);
    }
    if (particles.length) {
      particles = particles.filter((q) => {
        q.life -= dt;
        if (q.life <= 0) return false;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vx *= 0.92;
        q.vy *= 0.92;
        return true;
      });
    }
    if (blades.length) {
      blades = blades.filter((bl) => {
        bl.x += bl.vx * dt;
        bl.y += bl.vy * dt;
        bl.r += bl.vr * dt;
        return bl.y < view.ch + 40;
      });
    }
    if (frame) {
      const b = frame.ball;
      const speed = Math.sqrt((b.vx || 0) ** 2 + (b.vy || 0) ** 2);
      if (speed > 180 && frame.phase !== 'ready' && frame.phase !== 'count' && frame.phase !== 'pause') {
        trail.unshift({ x: b.x, y: b.y });
        if (trail.length > 12) trail.pop();
      } else if (trail.length) trail.pop();
    } else trail = [];
  }

  // ─── Frame : dessin ───────────────────────────────────────────────

  function drawBoardText() {
    const k = scale();
    const tw = boardTw;
    const off = reduced ? 0 : (clock * 26) % tw;
    [-1, 1].forEach((side, i) => {
      const cv = strips[i];
      const src = side > 0 ? tw + off : tw - off;
      const x0 = side < 0 ? -MS + 3 : W + 3;
      ctx.drawImage(cv, 0, src * k, cv.width, BOARD_LEN * k, x0, BOARD_Y0, cv.width / k, BOARD_LEN);
    });
  }

  // Chiffres du score dans le cadre noir : le bas en rouge vif, le haut en blanc
  function drawScore(score) {
    const c = ctx;
    c.font = font(800, 25);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = COLORS.meText;
    c.fillText(String(score[0]), W - 19.5, H / 2 + 22);
    c.fillStyle = COLORS.rivalText;
    if (twoPlayers) {
      c.save();
      c.translate(W - 19.5, H / 2 - 21);
      c.rotate(Math.PI);
      c.fillText(String(score[1]), 0, 1);
      c.restore();
    } else c.fillText(String(score[1]), W - 19.5, H / 2 - 20);
  }

  // Petite surface où le joueur vient d'entrer : clignote en or (alerte)
  function drawBoxFlash(flash) {
    const list = Array.isArray(flash) ? flash : [flash, 0];
    list.forEach((f, i) => {
      if (!(f > 0)) return;
      const b = boxOf(i);
      ctx.save();
      ctx.globalAlpha = Math.min(1, f / 0.5);
      ctx.strokeStyle = COLORS.warn;
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x0, i === 0 ? b.y0 : 1, SBW, SBD - 1);
      ctx.restore();
    });
  }

  function drawBall(b) {
    const c = ctx;
    if (trail.length) {
      // Traînée blanche
      c.save();
      c.globalCompositeOperation = 'lighter';
      trail.forEach((t, k) => {
        const f = 1 - k / trail.length;
        c.fillStyle = `rgba(255,255,255,${0.2 * f})`;
        c.beginPath();
        c.arc(t.x, t.y, BR * (0.45 + 0.55 * f), 0, TAU);
        c.fill();
      });
      c.restore();
    }
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath();
    c.ellipse(b.x + 2.5, b.y + 4, BR, BR * 0.9, 0, 0, TAU);
    c.fill();
    c.save();
    c.beginPath();
    c.arc(b.x, b.y, BR, 0, TAU);
    c.clip();
    const g = c.createRadialGradient(b.x - 3, b.y - 4, 1, b.x, b.y, BR);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#c4ccd2');
    c.fillStyle = g;
    c.fillRect(b.x - BR, b.y - BR, BR * 2, BR * 2);
    c.translate(b.x, b.y);
    c.rotate(((b.roll || 0) / BR) * 0.6);
    c.fillStyle = '#1b2125';
    pentagon(c, 0, 0, BR * 0.4, -Math.PI / 2);
    for (let k = 0; k < 5; k++) {
      const a = (k * TAU) / 5 + Math.PI / 2;
      pentagon(c, Math.cos(a) * BR * 1.02, Math.sin(a) * BR * 1.02, BR * 0.36, a);
    }
    c.restore();
    c.strokeStyle = 'rgba(0,0,0,.28)';
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(b.x, b.y, BR, 0, TAU);
    c.stroke();
  }

  function drawPaddle(i, p) {
    if (!p) return;
    const cv = sprites[i];
    const wu = cv.width / scale();
    ctx.drawImage(cv, p.x - wu / 2, p.y - wu / 2, wu, wu);
  }

  // Étincelles or et blanches
  function drawParticles() {
    if (!particles.length) return;
    const c = ctx;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    for (const q of particles) {
      const f = q.life / q.max;
      c.strokeStyle = q.gold ? `rgba(235,193,94,${f})` : `rgba(255,255,255,${f})`;
      c.lineWidth = 1.6 * f + 0.4;
      c.beginPath();
      c.moveTo(q.x, q.y);
      c.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03);
      c.stroke();
    }
    c.restore();
  }

  // Anneau blanc à l'engagement ; arc doré (alerte) qui se vide quand le ballon traîne dans une
  // moitié : il doit changer de camp
  function drawBallRing(frame) {
    const c = ctx;
    const b = frame.ball;
    if (frame.phase === 'ready') {
      const k = Math.min(1, Math.max(0, frame.phaseT / 0.8));
      c.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(b.x, b.y, BR + 4 + 14 * (1 - k), 0, TAU);
      c.stroke();
    } else if (frame.phase === 'live' && frame.keepT > 2.5) {
      const left = Math.max(0, (KEEP_LIMIT - frame.keepT) / (KEEP_LIMIT - 2.5));
      c.strokeStyle = COLORS.warn;
      c.lineWidth = 2.5;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(b.x, b.y, BR + 6, -Math.PI / 2, -Math.PI / 2 + TAU * left);
      c.stroke();
    }
  }

  // Compte à rebours du coup d'envoi (phase `count`, durée `frame.countS`, 3 s sans elle), chiffres
  // blancs au contour noir. Avant-match (`countS` > 3) : rien pendant le stade entier et le zoom,
  // puis 3, 2, 1 sur les 2,5 dernières secondes
  function drawCountdown(frame) {
    if (frame.phase !== 'count') return;
    const total = Number.isFinite(frame.countS) && frame.countS > 0 ? frame.countS : COUNT_S;
    const left = total - frame.phaseT;
    if (left <= 0) return;
    let n;
    let frac; // 0 → 1 pendant chaque chiffre
    if (total > COUNT_S) {
      if (left > INTRO_DIGITS_S) return;
      const unit = INTRO_DIGITS_S / 3;
      n = Math.max(1, Math.ceil(left / unit));
      frac = n - left / unit;
    } else {
      n = Math.max(1, Math.ceil(left));
      frac = n - left;
    }
    const k = reduced ? 1 : frac < 0.15 ? 0.6 + (frac / 0.15) * 0.5 : frac < 0.3 ? 1.1 - ((frac - 0.15) / 0.15) * 0.1 : 1;
    const c = ctx;
    c.save();
    c.translate(W / 2, H / 2);
    c.scale(k, k);
    c.globalAlpha = frac > 0.8 ? Math.max(0, 1 - (frac - 0.8) / 0.2) : 1;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.font = font(800, 120);
    c.lineWidth = 10;
    c.strokeStyle = COLORS.ink;
    c.strokeText(String(n), 0, -6);
    c.fillStyle = COLORS.fg;
    c.fillText(String(n), 0, -6);
    c.restore();
  }

  // « GO ! » au coup d'envoi, 0,5 s : blanc, ombre rouge (maquette StadeAnimation) ; sans
  // animation si mouvement réduit
  function drawGo() {
    if (!go) return;
    const t = go.t;
    let a = 1;
    let k = 1;
    if (!reduced) {
      a = t < 0.12 ? t / 0.12 : t > 0.32 ? Math.max(0, 1 - (t - 0.32) / 0.18) : 1;
      k = t < 0.12 ? 0.7 + (t / 0.12) * 0.4 : t < 0.2 ? 1.1 - ((t - 0.12) / 0.08) * 0.1 : 1;
    }
    const c = ctx;
    c.save();
    c.globalAlpha = a;
    c.translate(W / 2, H / 2);
    c.scale(k, k);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(800, 78);
    c.fillStyle = COLORS.me;
    c.fillText('GO !', 0, -1.5);
    c.fillStyle = COLORS.fg;
    c.fillText('GO !', 0, -6);
    c.restore();
  }

  // Bannière de but : « BUT ! » en blanc sur une bande rouge inclinée, puis qui marque et le score,
  // en blanc (contour noir : lisibles sur le terrain)
  function drawBanner(score) {
    if (!banner) return;
    const t = banner.t;
    const c = ctx;
    const a = t < 0.1 ? t / 0.1 : t < 1.5 ? 1 : Math.max(0, 1 - (t - 1.5) / 0.4);
    const k = t < 0.18 ? 0.6 + (t / 0.18) * 0.48 : t < 0.3 ? 1.08 - ((t - 0.18) / 0.12) * 0.08 : 1;
    const who = !twoPlayers && banner.scorer === 0 ? 'TU MARQUES' : `${players[banner.scorer].name.toUpperCase()} MARQUE`;
    const line = `${score[0]} – ${score[1]}`;
    c.save();
    c.globalAlpha = a;
    c.translate(W / 2, H / 2);
    if (twoPlayers && banner.scorer === 1) c.rotate(Math.PI);
    c.scale(reduced ? 1 : k, reduced ? 1 : k);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    // Bande ajustée aux lettres (mesurées ; valeurs de repli pour un vieux navigateur)
    c.font = font(800, 90);
    const m = c.measureText('BUT !');
    const asc = m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : 34;
    const desc = m.actualBoundingBoxDescent > 0 ? m.actualBoundingBoxDescent : 30;
    const ty = -10;
    const top = ty - asc - 14;
    const bottom = ty + desc + 12;
    const mid = (top + bottom) / 2;
    const half = m.width / 2 + 26;
    c.save();
    c.translate(0, mid);
    c.transform(1, 0, BANNER_SKEW, 1, 0, 0);
    c.fillStyle = COLORS.me;
    c.fillRect(-half, top - mid, half * 2, bottom - top);
    c.fillStyle = COLORS.fg;
    c.fillText('BUT !', 0, ty - mid);
    c.restore();
    c.strokeStyle = COLORS.ink;
    c.fillStyle = COLORS.fg;
    c.font = font(700, 18);
    c.lineWidth = 5;
    c.strokeText(who, 0, bottom + 18);
    c.fillText(who, 0, bottom + 18);
    c.font = font(800, 26);
    c.strokeText(line, 0, bottom + 46);
    c.fillText(line, 0, bottom + 46);
    c.restore();
  }

  function drawBlades() {
    const c = ctx;
    c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    for (const bl of blades) {
      c.save();
      c.translate(bl.x, bl.y);
      c.rotate(bl.r);
      c.scale(bl.s, bl.s);
      blade(c);
      c.restore();
    }
  }

  const IDLE_BALL = { x: W / 2, y: H / 2, vx: 0, vy: 0, roll: 0 };

  /**
   * Dessine `frame` sans faire avancer le temps. `frame` null (hors match) : le terrain seul avec
   * un ballon au centre ; sur l'image du stade, rien (canvas transparent).
   */
  function paint(frame) {
    if (destroyed) return;
    painted = true;
    lastFrame = frame || null;
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    if (stadium && !frame) {
      if (blades.length) drawBlades();
      return;
    }
    // Sur l'image du stade, le calque ne porte que les noms et le cadre du score
    if (!stadium || labels) c.drawImage(layer, shakeX * scale(), shakeY * scale());
    worldTransform(c, shakeX, shakeY);
    if (!stadium) drawBoardText();
    if (!frame) {
      drawBall(IDLE_BALL);
    } else {
      drawBoxFlash(frame.flashBox);
      if (labels) drawScore(frame.score);
      drawBallRing(frame);
      drawBall(frame.ball);
      drawPaddle(0, frame.paddles[0]);
      drawPaddle(1, frame.paddles[1]);
      drawParticles();
      drawBanner(frame.score);
      drawCountdown(frame);
      drawGo();
    }
    if (blades.length) drawBlades();
  }

  // Doigt → terrain (repère local, joueur en bas)
  function toWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return screenToWorld(view, r.left, r.top, clientX, clientY);
  }

  // Cible d'un joueur : un peu au-dessus du doigt pour que le pouce ne le cache pas (rien à la
  // souris) ; pour le joueur du haut à deux, « au-dessus » est vers le bas de l'écran
  function fingerTarget(clientX, clientY, pointerType, side = 0) {
    const w = toWorld(clientX, clientY);
    const off = pointerType === 'mouse' ? 0 : FINGER_OFFSET;
    return { x: w.x, y: side === 1 ? w.y + off : w.y - off };
  }

  function burst(x, y, n, big) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU;
      const s = big ? rand(120, 520) : rand(80, 320);
      const life = rand(0.3, 0.6);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, gold: Math.random() < 0.6 });
    }
  }

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => resize());
    ro.observe(host);
  }
  resize();
  // Polices chargées après le premier dessin : on refait les calques (textes en Barlow Condensed)
  try {
    document.fonts?.ready?.then(() => {
      if (destroyed) return;
      buildLayers();
      if (painted) paint(lastFrame);
    }).catch(() => {});
  } catch { /* sans API des polices */ }

  return {
    resize,
    toWorld,
    fingerTarget,
    /**
     * Joueurs en repère local : [bas, haut], chacun { name, role, tag? }. Affiche leurs noms et le
     * cadre du score (pendant un match).
     */
    setPlayers(list) {
      players = [0, 1].map((i) => playerBadge(list?.[i]?.name, list?.[i]?.role, list?.[i]?.tag));
      labels = true;
      buildLayers();
    },
    /** Plus de match : terrain sans noms. */
    clearPlayers() {
      if (!labels) return;
      labels = false;
      buildLayers();
    },
    /** À deux sur un téléphone : textes du joueur du haut tournés vers lui. */
    setTwoPlayers(on) {
      if (twoPlayers === !!on) return;
      twoPlayers = !!on;
      buildLayers();
    },
    /**
     * Thème stade : `true` quand l'image du stade est sous le canvas (chargée) : plus aucun terrain
     * dessiné, et rien du tout hors match ; `false` (défaut, image en erreur) : le terrain dessiné
     * revient. La dernière image est redessinée aussitôt (jamais deux terrains à l'écran).
     */
    setStadium(on) {
      if (stadium === !!on) return;
      stadium = !!on;
      buildLayers();
      if (painted) paint(lastFrame);
    },
    setReducedMotion(on) { reduced = !!on; },
    burst,
    /** Frappe : étincelles au point de contact, d'autant plus nombreuses que la frappe est forte. */
    hit(v, x, y) {
      if (v > 250) burst(x, y, Math.min(14, 4 + ((v / 90) | 0)), false);
    },
    /**
     * But (scorer 0 = joueur du bas) : bannière, tremblement, gerbe d'étincelles au fond de la cage.
     * Pas de tremblement sur l'image du stade : seuls les joueurs bougeraient sur un terrain immobile.
     */
    goal(scorer) {
      banner = { t: 0, scorer: scorer === 1 ? 1 : 0 };
      shake = reduced || stadium ? 0 : 1;
      burst(W / 2, scorer === 0 ? 0 : H, reduced ? 10 : 26, true);
    },
    /** Victoire : pluie de lames de rasoir (l'écran de jeu du thème stade la met dans l'écran de fin). */
    victory() {
      const n = reduced ? 18 : 64;
      for (let k = 0; k < n; k++) {
        blades.push({
          x: Math.random() * view.cw,
          y: -30 - Math.random() * view.ch * 0.9,
          vx: rand(-30, 30),
          vy: rand(140, 320),
          r: Math.random() * TAU,
          vr: rand(-1, 1) * (reduced ? 0.5 : 4),
          s: rand(0.8, 1.4),
        });
      }
    },
    /** Nouveau match ou engagement : on efface traînée, effets, bannière et « GO ! ». */
    reset({ keepBlades = false } = {}) {
      trail = [];
      particles = [];
      banner = null;
      go = null;
      prevPhase = null;
      shake = 0;
      shakeX = 0;
      shakeY = 0;
      if (!keepBlades) blades = [];
    },
    resetTrail() { trail = []; },
    /** Une frame : effets avancés de `dt` secondes, puis dessin. */
    render(frame, dt) {
      if (destroyed) return;
      step(frame, dt);
      paint(frame);
    },
    /** Dessin seul, sans animation (terrain d'attente, match en pause, après un redimensionnement). */
    paint,
    /** Des effets sont encore en cours (étincelles, bannière, « GO ! », tremblement, lames). */
    busy() {
      return particles.length > 0 || blades.length > 0 || banner !== null || go !== null || shake > 0;
    },
    destroy() {
      destroyed = true;
      try { ro?.disconnect(); } catch { /* déjà débranché */ }
      ro = null;
    },
  };
}
