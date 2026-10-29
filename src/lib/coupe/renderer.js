/*
 * Dessin canvas de La Coupe du Gang (docs/fonctions/coupe-du-gang.md), porté du prototype validé
 * par le propriétaire (docs/prototypes/coupe-du-gang.html) : terrain mis en cache, panneaux
 * lumineux, ballon et sa traînée, joueurs, étincelles, bannière « BUT ! », tremblement, pluie de
 * lames de rasoir.
 *
 * Indépendant de React et du réseau : on lui donne une « image » du match à chaque frame
 * (`render(frame, dt)`). Repère local : le joueur de ce téléphone est toujours en bas (indice 0,
 * en or), l'adversaire en haut (indice 1, en bleu).
 *
 * Joueurs : jamais de photo (une photo de barber n'est jamais ronde, règle de l'app). L'admin =
 * « DHB » + petite étoile bleue ; un barber = son initiale + petits ciseaux ; un client = ses
 * initiales.
 */
import {
  W, H, GW, GL, GR, GD, SBW, SBD, BBW, BBD, BR, PR, POST, POSTS, KEEP_LIMIT, FINGER_OFFSET, boxOf,
} from './engine.js';

// Marges autour du terrain (unités du terrain) : panneaux sur les côtés, cages et noms en haut et en bas
const MS = 16;
const MG = 36;
const VW = W + MS * 2;
const VH = H + MG * 2;
const TAU = Math.PI * 2;

/** Couleurs du prototype (stade de nuit) : le jeu reste sombre quel que soit le thème de l'app. */
export const COLORS = {
  night: '#05080a',
  stand: '#0c1512',
  fg: '#eef3ef',
  muted: '#9db0a6',
  turf: '#33b574',
  turfA: '#0f4a2b',
  turfB: '#0c4125',
  chalk: 'rgba(236, 248, 240, .86)',
  gold: '#ebc15e',
  goldDeep: '#b0802a',
  rival: '#86adff',
  rivalDeep: '#3d63c9',
  warn: '#ff9d4d',
  // Étoile du salon : même bleu que dans le fil (text-blue-500)
  star: '#3b82f6',
};

const BOARD_TEXT = "D'HOME BARBER  ·  DOUVAINE  ·  LA COUPE DU GANG  ·  ";
const font = (w, px) => `${w} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Pastille d'un joueur d'après son nom et son rôle (rôles envoyés par le serveur dans `start`) :
 * admin → « DHB » + étoile, barber → initiale + ciseaux, client → initiales (« Camille T. » → « CT »).
 */
export function playerBadge(name, role) {
  const clean = String(name || '').trim();
  if (role === 'admin') return { name: clean || "D'Home Barber", tag: 'DHB', star: true, scissors: false };
  const words = clean.split(/\s+/).filter(Boolean);
  const first = (words[0] || '?').charAt(0).toUpperCase();
  if (role === 'barber') return { name: clean || 'Barber', tag: first, star: false, scissors: true };
  const second = words[1] ? words[1].charAt(0).toUpperCase() : '';
  return { name: clean || 'Joueur', tag: `${first}${second}`, star: false, scissors: false };
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
  c.strokeStyle = 'rgba(4,8,6,.85)';
  c.stroke();
  c.restore();
}

/** Petits ciseaux (barber) : deux anneaux et deux lames croisées, dans une pastille sombre. */
function scissors(c, x, y, size, color) {
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(4,8,6,.9)';
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

/**
 * Crée le dessin sur `canvas`, dimensionné sur son parent (observé : rotation, clavier, fenêtre).
 * options : { reducedMotion } (animations réduites : ni tremblement, ni zoom, peu de lames).
 */
export function createRenderer(canvas, { reducedMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d');
  const host = canvas.parentElement || canvas;
  const view = { s: 1, ox: 0, oy: 0, cw: 0, ch: 0, dpr: 1 };
  let reduced = !!reducedMotion;
  let players = [playerBadge('Toi', 'user'), playerBadge('Adversaire', 'user')];
  let particles = [];
  let blades = [];
  let trail = [];
  let shake = 0;
  let clock = 0;
  let banner = null; // { t, scorer }
  let destroyed = false;

  function worldTransform(c, sx = 0, sy = 0) {
    c.setTransform(view.dpr * view.s, 0, 0, view.dpr * view.s,
      view.dpr * (view.ox + (MS + sx) * view.s), view.dpr * (view.oy + (MG + sy) * view.s));
  }

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

  // Calque du terrain : redessiné seulement au redimensionnement (et quand les polices arrivent)
  function buildPitch() {
    if (destroyed) return;
    layer.width = canvas.width;
    layer.height = canvas.height;
    const c = lctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
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
  }

  function resize() {
    if (destroyed) return;
    const r = host.getBoundingClientRect();
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    view.cw = r.width;
    view.ch = r.height;
    canvas.width = Math.max(1, Math.round(r.width * view.dpr));
    canvas.height = Math.max(1, Math.round(r.height * view.dpr));
    view.s = Math.max(0.01, Math.min(r.width / VW, r.height / VH));
    view.ox = (r.width - VW * view.s) / 2;
    view.oy = (r.height - VH * view.s) / 2;
    buildPitch();
  }

  // Panneaux lumineux qui défilent sur les deux bords (immobiles si animations réduites)
  function drawBoards() {
    const c = ctx;
    const bw = MS - 6;
    const len = H + 2 * MG - 8;
    c.save();
    c.font = font(700, 9);
    const tw = c.measureText(BOARD_TEXT).width || 1;
    const off = reduced ? 0 : (clock * 26) % tw;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -MS + 3 : W + 3;
      c.save();
      rrect(c, x0, -MG + 4, bw, len, 4);
      c.fillStyle = 'rgba(3,7,5,.92)';
      c.fill();
      c.clip();
      c.translate(x0 + bw / 2, 0);
      c.rotate(side < 0 ? -Math.PI / 2 : Math.PI / 2);
      c.fillStyle = COLORS.turf;
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      for (let u = -len - MG - off; u < len + MG; u += tw) c.fillText(BOARD_TEXT, u, 0.5);
      c.restore();
    }
    c.restore();
  }

  // Score au bord droit, à cheval sur la ligne médiane ; noms dans les marges, à droite des cages
  function drawLabels(score) {
    const c = ctx;
    c.save();
    rrect(c, W - 33, H / 2 - 46, 27, 92, 13.5);
    c.fillStyle = 'rgba(4,8,6,.76)';
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.14)';
    c.lineWidth = 1;
    c.stroke();
    c.font = font(800, 25);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = COLORS.gold;
    c.fillText(String(score[0]), W - 19.5, H / 2 + 22);
    c.fillStyle = COLORS.rival;
    c.fillText(String(score[1]), W - 19.5, H / 2 - 20);
    c.fillStyle = 'rgba(255,255,255,.25)';
    c.fillRect(W - 27, H / 2 - 0.5, 15, 1);
    c.font = font(700, 14);
    c.textBaseline = 'middle';
    c.textAlign = 'right';
    [[0, H + MG / 2 + 1, COLORS.gold], [1, -MG / 2 + 1, COLORS.rival]].forEach(([i, y, color]) => {
      const p = players[i];
      const label = p.name.toUpperCase();
      c.fillStyle = color;
      c.fillText(label, W, y);
      if (p.star) star(c, W - c.measureText(label).width - 9, y - 1, 5.5, COLORS.star);
    });
    c.restore();
  }

  function drawBoxFlash(flash) {
    if (!(flash > 0)) return;
    const b = boxOf(0);
    ctx.save();
    ctx.globalAlpha = Math.min(1, flash / 0.5);
    ctx.strokeStyle = COLORS.warn;
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x0, b.y0, SBW, SBD - 1);
    ctx.restore();
  }

  function updateTrail(frame) {
    const b = frame.ball;
    const speed = Math.sqrt((b.vx || 0) ** 2 + (b.vy || 0) ** 2);
    if (speed > 180 && frame.phase !== 'ready' && frame.phase !== 'count') {
      trail.unshift({ x: b.x, y: b.y });
      if (trail.length > 12) trail.pop();
    } else if (trail.length) trail.pop();
  }

  function drawBall(b) {
    const c = ctx;
    c.save();
    c.globalCompositeOperation = 'lighter';
    trail.forEach((t, k) => {
      const f = 1 - k / trail.length;
      c.fillStyle = `rgba(255,226,160,${0.2 * f})`;
      c.beginPath();
      c.arc(t.x, t.y, BR * (0.45 + 0.55 * f), 0, TAU);
      c.fill();
    });
    c.restore();
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
    const c = ctx;
    const badge = players[i];
    const ring = i === 0 ? [COLORS.gold, COLORS.goldDeep] : [COLORS.rival, COLORS.rivalDeep];
    c.fillStyle = 'rgba(0,0,0,.36)';
    c.beginPath();
    c.ellipse(p.x + 3, p.y + 6, PR, PR * 0.9, 0, 0, TAU);
    c.fill();
    const g = c.createLinearGradient(p.x - PR, p.y - PR, p.x + PR, p.y + PR);
    g.addColorStop(0, ring[0]);
    g.addColorStop(1, ring[1]);
    c.fillStyle = g;
    c.beginPath();
    c.arc(p.x, p.y, PR, 0, TAU);
    c.fill();
    const g2 = c.createRadialGradient(p.x - 6, p.y - 8, 2, p.x, p.y, PR - 4);
    g2.addColorStop(0, '#26322c');
    g2.addColorStop(1, '#0a0f0c');
    c.fillStyle = g2;
    c.beginPath();
    c.arc(p.x, p.y, PR - 4.5, 0, TAU);
    c.fill();
    c.save();
    c.fillStyle = ring[0];
    c.font = font(800, badge.tag.length > 2 ? 14 : badge.tag.length > 1 ? 16 : 19);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(badge.tag, p.x, p.y + 1);
    c.restore();
    c.save();
    c.globalAlpha = 0.2;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(p.x - 7, p.y - 10, 9, 4.5, -0.6, 0, TAU);
    c.fill();
    c.restore();
    // Marques du rôle, posées sur l'anneau : étoile bleue (salon) ou ciseaux (barber)
    if (badge.star) star(c, p.x + PR * 0.72, p.y - PR * 0.72, 7, COLORS.star);
    else if (badge.scissors) scissors(c, p.x + PR * 0.72, p.y + PR * 0.72, 7.5, ring[0]);
  }

  function drawParticles(dt) {
    if (!particles.length) return;
    const c = ctx;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    particles = particles.filter((q) => {
      q.life -= dt;
      if (q.life <= 0) return false;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.92;
      q.vy *= 0.92;
      const f = q.life / q.max;
      c.strokeStyle = q.gold ? `rgba(235,193,94,${f})` : `rgba(255,255,255,${f})`;
      c.lineWidth = 1.6 * f + 0.4;
      c.beginPath();
      c.moveTo(q.x, q.y);
      c.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03);
      c.stroke();
      return true;
    });
    c.restore();
  }

  // Anneau doré à l'engagement ; compte à rebours orange quand le ballon traîne dans une moitié
  function drawBallRing(frame) {
    const c = ctx;
    const b = frame.ball;
    if (frame.phase === 'ready') {
      const k = Math.min(1, Math.max(0, frame.phaseT / 0.8));
      c.strokeStyle = `rgba(235,193,94,${0.8 * (1 - k)})`;
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

  // Compte à rebours du coup d'envoi (phase `count`, 3 s)
  function drawCountdown(frame) {
    if (frame.phase !== 'count') return;
    const left = 3 - frame.phaseT;
    if (left <= 0) return;
    const n = Math.max(1, Math.ceil(left));
    const frac = n - left; // 0 → 1 pendant chaque seconde
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
    c.strokeStyle = 'rgba(4,8,6,.88)';
    c.strokeText(String(n), 0, -6);
    c.fillStyle = COLORS.gold;
    c.fillText(String(n), 0, -6);
    c.restore();
  }

  function drawBanner(score) {
    if (!banner) return;
    const t = banner.t;
    if (t > 1.9) { banner = null; return; }
    const c = ctx;
    const a = t < 1.5 ? 1 : Math.max(0, 1 - (t - 1.5) / 0.4);
    const k = t < 0.18 ? 0.5 + (t / 0.18) * 0.7 : t < 0.3 ? 1.2 - ((t - 0.18) / 0.12) * 0.2 : 1;
    const who = banner.scorer === 0 ? 'TU MARQUES' : `${players[1].name.toUpperCase()} MARQUE`;
    const line = `${score[0]} – ${score[1]}`;
    c.save();
    c.globalAlpha = a;
    c.translate(W / 2, H / 2);
    c.scale(reduced ? 1 : k, reduced ? 1 : k);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.font = font(800, 96);
    c.lineWidth = 9;
    c.strokeStyle = 'rgba(4,8,6,.88)';
    c.strokeText('BUT !', 0, -8);
    c.fillStyle = COLORS.gold;
    c.fillText('BUT !', 0, -8);
    c.font = font(700, 18);
    c.lineWidth = 5;
    c.strokeText(who, 0, 46);
    c.fillStyle = COLORS.fg;
    c.fillText(who, 0, 46);
    c.font = font(800, 26);
    c.strokeText(line, 0, 74);
    c.fillText(line, 0, 74);
    c.restore();
  }

  function drawBlades(dt) {
    const c = ctx;
    c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    blades = blades.filter((bl) => {
      bl.x += bl.vx * dt;
      bl.y += bl.vy * dt;
      bl.r += bl.vr * dt;
      c.save();
      c.translate(bl.x, bl.y);
      c.rotate(bl.r);
      c.scale(bl.s, bl.s);
      blade(c);
      c.restore();
      return bl.y < view.ch + 40;
    });
  }

  const IDLE_BALL = { x: W / 2, y: H / 2, vx: 0, vy: 0, roll: 0 };

  /**
   * Dessine une frame. `frame` = null : terrain seul (accueil). Sinon :
   * { ball: {x, y, vx, vy, roll}, paddles: [moi, adversaire|null], phase, phaseT, keepT,
   *   score: [moi, adversaire], flashBox }.
   */
  function render(frame, dt) {
    if (destroyed) return;
    clock += dt;
    if (banner) banner.t += dt;
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    let sx = 0;
    let sy = 0;
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 2.4);
      const a = shake * shake * 7;
      sx = rand(-a, a);
      sy = rand(-a, a);
    }
    c.drawImage(layer, sx * view.s * view.dpr, sy * view.s * view.dpr);
    worldTransform(c, sx, sy);
    drawBoards();
    if (!frame) {
      trail = [];
      drawBall(IDLE_BALL);
    } else {
      drawBoxFlash(frame.flashBox);
      drawLabels(frame.score);
      drawBallRing(frame);
      updateTrail(frame);
      drawBall(frame.ball);
      drawPaddle(0, frame.paddles[0]);
      drawPaddle(1, frame.paddles[1]);
      drawParticles(dt);
      drawBanner(frame.score);
      drawCountdown(frame);
    }
    if (blades.length) drawBlades(dt);
  }

  // Doigt → terrain (repère local, joueur en bas)
  function toWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left - view.ox) / view.s - MS, y: (clientY - r.top - view.oy) / view.s - MG };
  }

  // Cible du joueur : un peu au-dessus du doigt pour que le pouce ne le cache pas (rien à la souris)
  function fingerTarget(clientX, clientY, pointerType) {
    const w = toWorld(clientX, clientY);
    const off = pointerType === 'mouse' ? 0 : FINGER_OFFSET;
    return { x: w.x, y: w.y - off };
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
  // Polices chargées après le premier dessin : on refait le calque (« DHB » du rond central)
  try { document.fonts?.ready?.then(() => buildPitch()).catch(() => {}); } catch { /* sans API des polices */ }

  return {
    resize,
    toWorld,
    fingerTarget,
    /** Joueurs en repère local : [moi, adversaire], chacun { name, role }. */
    setPlayers(list) {
      players = [0, 1].map((i) => playerBadge(list?.[i]?.name, list?.[i]?.role));
    },
    setReducedMotion(on) { reduced = !!on; },
    burst,
    /** Frappe : étincelles au point de contact, d'autant plus nombreuses que la frappe est forte. */
    hit(v, x, y) {
      if (v > 250) burst(x, y, Math.min(14, 4 + ((v / 90) | 0)), false);
    },
    /** But (scorer 0 = moi) : bannière, tremblement, gerbe d'étincelles au fond de la cage. */
    goal(scorer) {
      banner = { t: 0, scorer };
      shake = reduced ? 0 : 1;
      burst(W / 2, scorer === 0 ? 0 : H, reduced ? 10 : 26, true);
    },
    /** Victoire : pluie de lames de rasoir. */
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
    /** Nouveau match ou engagement : on efface traînée, effets et bannière. */
    reset({ keepBlades = false } = {}) {
      trail = [];
      particles = [];
      banner = null;
      shake = 0;
      if (!keepBlades) blades = [];
    },
    resetTrail() { trail = []; },
    render,
    destroy() {
      destroyed = true;
      try { ro?.disconnect(); } catch { /* déjà débranché */ }
      ro = null;
    },
  };
}
