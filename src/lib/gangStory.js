/**
 * Carte Gang en story (1080 × 1920) : image PNG dessinée au canvas, sans
 * capture du DOM, puis partagée par le menu du téléphone (Instagram, Snapchat,
 * WhatsApp…) ou affichée pour être enregistrée à la main.
 *
 * La carte est redessinée à partir des mêmes données que le composant
 * (écusson GANG_SHIELD_PATH, palettes, positions de la maquette 300 × 440).
 */
import {
  GANG_CARD_WIDTH as W,
  GANG_CARD_HEIGHT as H,
  GANG_SHIELD_PATH,
  GANG_INNER_SCALE,
  GANG_BUST_PATHS,
  GANG_PHOTO_BOX,
  GANG_PHOTO_MASK,
  gangPhotoVeil,
  gangPhotoVeilStart,
  GANG_STAT_COLUMNS,
  GANG_LOW_COLOR,
  gangPalette,
  gangTierLabel,
  gangStatAbbr,
  gangStatValue,
  isGangStatLow,
  gangScore,
  GANG_SEASON_DECOR,
  GANG_BAT_PATH,
  GANG_STAR_PATH,
  GANG_BAT_FILL,
  GANG_BAT_STROKE,
} from '@/components/gang/gangTheme';

export const GANG_STORY_WIDTH = 1080;
export const GANG_STORY_HEIGHT = 1920;

const FUT = '"Barlow Condensed", "Arial Narrow", sans-serif';
const BODY = 'Inter, system-ui, -apple-system, sans-serif';
const LOGO_SRC = '/icons/icon-256.png';
const SALON_ADDRESS = '3 Rue du Bois Arquet · Douvaine';
const IMAGE_TIMEOUT_MS = 8000;
const FONT_TIMEOUT_MS = 3000;

// ── Utilitaires ─────────────────────────────────────────────────────────────

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);

/** Charge une image ; null si elle est absente, illisible ou refusée (CORS). */
function loadImage(src, { cors = false } = {}) {
  return new Promise((resolve) => {
    if (!src || typeof Image === 'undefined') return resolve(null);
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS);
    img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth ? img : null); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
}

/** Attend les polices de la carte (sinon le canvas dessinerait avec la police de repli). */
async function loadFonts() {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const faces = [
    `800 40px ${FUT}`, `700 40px ${FUT}`, `600 40px ${FUT}`,
    `500 36px ${BODY}`, `600 36px ${BODY}`,
  ];
  try {
    await withTimeout(Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null))), FONT_TIMEOUT_MS);
  } catch {
    // Police de repli : l'image reste lisible
  }
}

/** Dégradé linéaire orienté comme en CSS : ligne de longueur |w sin a| + |h cos a|, centrée sur la boîte. */
function cssLinear(ctx, angle, w, h) {
  const a = ((angle % 360) * Math.PI) / 180;
  const len = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
  const dx = (Math.sin(a) * len) / 2;
  const dy = (-Math.cos(a) * len) / 2;
  return ctx.createLinearGradient(w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy);
}

/** Dégradé de la palette (objet de gangTheme) → style canvas, dans une boîte w × h. */
function paint(ctx, g, w, h) {
  if (!g || typeof g === 'string') return g || 'transparent';
  let grad;
  if (g.type === 'conic' && typeof ctx.createConicGradient === 'function') {
    // CSS : 0° = en haut ; canvas : 0 rad = à droite
    grad = ctx.createConicGradient(((g.from - 90) * Math.PI) / 180, w / 2, h / 2);
  } else {
    grad = cssLinear(ctx, g.type === 'conic' ? 160 : g.angle, w, h); // conique indisponible : repli linéaire
  }
  g.stops.forEach(([c, p]) => grad.addColorStop(p, c));
  return grad;
}

/** Dégradé linéaire à arrêts francs (bandes diagonales) : segments [début, fin, couleur]. */
function hardStops(ctx, angle, w, h, segments) {
  const grad = cssLinear(ctx, angle, w, h);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  segments.forEach(([from, to, color]) => {
    grad.addColorStop(from, 'rgba(0,0,0,0)');
    grad.addColorStop(from, color);
    grad.addColorStop(to, color);
    grad.addColorStop(to, 'rgba(0,0,0,0)');
  });
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  return grad;
}

/** Ligne de base d'un texte centré verticalement dans une boîte de ligne (comme le CSS). */
function baselineIn(ctx, top, lineHeight, fontSize) {
  const m = ctx.measureText('0');
  const ascent = m.fontBoundingBoxAscent ?? fontSize * 0.9;
  const descent = m.fontBoundingBoxDescent ?? fontSize * 0.22;
  return top + (lineHeight - (ascent + descent)) / 2 + ascent;
}

/** Largeur d'un texte avec espacement des lettres (le CSS l'ajoute après chaque lettre). */
function spacedWidth(ctx, text, spacing) {
  if (!spacing) return ctx.measureText(text).width;
  return [...text].reduce((w, ch) => w + ctx.measureText(ch).width + spacing, 0);
}

/** Texte avec espacement des lettres, aligné à gauche / au centre / à droite de `x`. */
function drawText(ctx, text, x, baseline, { spacing = 0, align = 'left' } = {}) {
  const total = spacedWidth(ctx, text, spacing);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (!spacing) {
    ctx.fillText(text, cx, baseline);
    return total;
  }
  for (const ch of text) {
    ctx.fillText(ch, cx, baseline);
    cx += ctx.measureText(ch).width + spacing;
  }
  return total;
}

/** Plus grande taille de police (≤ max) pour que le texte tienne dans `maxWidth`. */
function fitFont(ctx, text, { weight, family, max, min, maxWidth, spacingEm = 0 }) {
  let size = max;
  for (; size > min; size -= 1) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (spacedWidth(ctx, text, size * spacingEm) <= maxWidth) break;
  }
  ctx.font = `${weight} ${size}px ${family}`;
  return size;
}

/** Texte tronqué avec « … » s'il dépasse. */
function ellipsize(ctx, text, maxWidth, spacing) {
  if (spacedWidth(ctx, text, spacing) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && spacedWidth(ctx, `${t}…`, spacing) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Logo rond : disque sombre de `size`, image recadrée en cercle avec 3 px de marge. */
function drawLogo(ctx, logo, x, y, size, ring) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fill();
  if (ring) {
    ctx.strokeStyle = ring;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 - 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (logo) {
    const inner = size - 6;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, inner / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, x + 3, y + 3, inner, inner);
  }
  ctx.restore();
}

/**
 * Zone photo (GANG_PHOTO_BOX, comme la carte) : photo en `cover` teintée aux couleurs du niveau,
 * ou silhouette, fondue en ovale doux sur tous les bords (GANG_PHOTO_MASK), dessinée hors écran à
 * la résolution `px` puis posée.
 */
function drawPhoto(ctx, p, photo, px) {
  const bw = GANG_PHOTO_BOX.width;
  const bh = GANG_PHOTO_BOX.height;
  const off = document.createElement('canvas');
  off.width = Math.ceil(bw * px);
  off.height = Math.ceil(bh * px);
  const o = off.getContext('2d');
  o.scale(px, px);
  if (photo) {
    const r = Math.max(bw / photo.naturalWidth, bh / photo.naturalHeight);
    const dw = photo.naturalWidth * r;
    const dh = photo.naturalHeight * r;
    o.filter = 'saturate(.88) contrast(1.06)';
    o.drawImage(photo, (bw - dw) * 0.5, (bh - dh) * 0.22, dw, dh);
    o.filter = 'none';
    // Teinte du niveau, comme sur la carte (soft-light, 40 %)
    o.globalCompositeOperation = 'soft-light';
    o.globalAlpha = 0.4;
    o.fillStyle = p.accent;
    o.fillRect(0, 0, bw, bh);
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
    // Voile du pourtour dans la couleur de la carte (comme la carte à l'écran)
    o.save();
    o.translate(0.54 * bw, 0.4 * bh);
    o.scale(1, (0.52 * bh) / (0.46 * bw));
    const veil = o.createRadialGradient(0, 0, 0, 0, 0, 0.46 * bw);
    veil.addColorStop(gangPhotoVeilStart(p), 'rgba(0,0,0,0)');
    veil.addColorStop(1, gangPhotoVeil(p));
    o.fillStyle = veil;
    o.fillRect(-bw * 2, -bh * 2, bw * 4, bh * 4);
    o.restore();
  } else {
    o.translate(17, 16);
    // Silhouette : buste à l'encre, opacité 0,5 → 0,18 sur sa hauteur (34 → 206)
    const tmp = document.createElement('canvas');
    tmp.width = off.width;
    tmp.height = off.height;
    const t = tmp.getContext('2d');
    t.scale(px, px);
    t.fillStyle = p.ink;
    t.fill(new Path2D(GANG_BUST_PATHS.body));
    t.globalCompositeOperation = 'destination-in';
    const fade = t.createLinearGradient(0, 34, 0, 206);
    fade.addColorStop(0, 'rgba(0,0,0,.5)');
    fade.addColorStop(1, 'rgba(0,0,0,.18)');
    t.fillStyle = fade;
    t.fillRect(0, 0, bw, bh);
    o.drawImage(tmp, 0, 0, bw, bh);
    o.globalAlpha = 0.32;
    o.fillStyle = p.ink;
    o.fill(new Path2D(GANG_BUST_PATHS.hair));
    o.globalAlpha = 0.55;
    o.fillStyle = p.accent;
    o.fill(new Path2D(GANG_BUST_PATHS.collar));
    o.globalAlpha = 1;
    o.translate(-17, -16);
  }
  // Fondu en ovale sur tous les bords (même masque que la carte)
  const m = GANG_PHOTO_MASK;
  o.globalCompositeOperation = 'destination-in';
  o.save();
  o.translate(m.cx * bw, m.cy * bh);
  o.scale(1, (m.ry * bh) / (m.rx * bw));
  const mask = o.createRadialGradient(0, 0, 0, 0, 0, m.rx * bw);
  for (const [at, a] of m.stops) mask.addColorStop(at, `rgba(0,0,0,${a})`);
  o.fillStyle = mask;
  o.fillRect(-bw * 2, -bh * 2, bw * 4, bh * 4);
  o.restore();
  ctx.drawImage(off, GANG_PHOTO_BOX.left, GANG_PHOTO_BOX.top, bw, bh);
}

/** Disque flou (dégradé radial) de centre (x, y) et de rayon r. */
function softDot(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  stops.forEach(([at, c]) => g.addColorStop(at, c));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Décor de saison immobile (mêmes positions que la carte à l'écran, GANG_SEASON_DECOR) :
 * flocons (Noël), chauves-souris et lucioles (Halloween), étoiles cuivre (Fête des pères),
 * soleil et rayons (Été). Dessiné sous la photo et le texte, dans le fond intérieur.
 */
function drawSeasonDecor(ctx, p, px = 2) {
  const d = GANG_SEASON_DECOR;
  ctx.save();
  if (p.decor === 'snow') {
    d.snow.forEach((f) => softDot(ctx, f.x, f.y, f.r, [[0, `rgba(255,255,255,${f.o})`], [0.4, `rgba(255,255,255,${f.o})`], [1, 'rgba(255,255,255,0)']]));
  } else if (p.decor === 'bats') {
    d.fireflies.forEach((f) => {
      ctx.globalAlpha = 0.6;
      softDot(ctx, f.x, f.y, f.r * 2, [[0, 'rgba(255,190,90,1)'], [0.22, 'rgba(255,190,90,1)'], [0.38, 'rgba(255,128,26,.45)'], [0.7, 'rgba(255,128,26,0)'], [1, 'rgba(255,128,26,0)']]);
    });
    ctx.globalAlpha = 1;
    const bat = new Path2D(GANG_BAT_PATH);
    d.bats.forEach((b) => {
      ctx.save();
      ctx.translate(b.x - 12 * b.s, b.y - 5 * b.s);
      ctx.scale(b.s, b.s);
      ctx.fillStyle = GANG_BAT_FILL;
      ctx.fill(bat);
      ctx.strokeStyle = GANG_BAT_STROKE;
      ctx.lineWidth = 0.6;
      ctx.stroke(bat);
      ctx.restore();
    });
  } else if (p.decor === 'stars') {
    const star = new Path2D(GANG_STAR_PATH);
    ctx.fillStyle = p.accent;
    ctx.globalAlpha = 0.45;
    d.stars.forEach((s) => {
      ctx.save();
      ctx.translate(s.x - s.s / 2, s.y - s.s / 2);
      ctx.scale(s.s / 10, s.s / 10);
      ctx.fill(star);
      ctx.restore();
    });
  } else if (p.decor === 'sun') {
    const { sun } = d;
    // Rayons : secteurs alternés, fondus vers l'extérieur par un masque radial
    const off = document.createElement('canvas');
    off.width = Math.ceil(W * px);
    off.height = Math.ceil(H * px);
    const o = off.getContext('2d');
    o.scale(px, px);
    const step = (Math.PI * 2) / sun.rays;
    o.fillStyle = `rgba(255,226,120,${sun.rayAlpha})`;
    for (let i = 0; i < sun.rays; i += 1) {
      // CSS : 0° en haut, sens horaire ; canvas : 0 rad à droite
      const a0 = i * step - Math.PI / 2;
      o.beginPath();
      o.moveTo(sun.cx, sun.cy);
      o.arc(sun.cx, sun.cy, sun.rayRadius, a0, a0 + step * 0.35);
      o.closePath();
      o.fill();
    }
    o.globalCompositeOperation = 'destination-in';
    const fade = o.createRadialGradient(sun.cx, sun.cy, 0, sun.cx, sun.cy, sun.rayRadius);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(0.18, 'rgba(0,0,0,1)');
    fade.addColorStop(0.55, 'rgba(0,0,0,.5)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    o.fillStyle = fade;
    o.fillRect(0, 0, W, H);
    ctx.drawImage(off, 0, 0, W, H);
    softDot(ctx, sun.cx, sun.cy, 70, [[0, 'rgba(255,230,140,.55)'], [0.45, 'rgba(255,190,80,.18)'], [0.7, 'rgba(255,190,80,0)'], [1, 'rgba(255,190,80,0)']]);
    ctx.fillStyle = p.accent;
    ctx.globalAlpha = 0.5;
    d.sparkles.forEach((s) => {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();
}

/**
 * Dessine la carte (recto) dans `ctx`, coin haut gauche en (x, y), à l'échelle
 * `scale` (1 = 300 × 440). `photo` et `logo` : images déjà chargées ou null.
 */
export function drawGangCard(ctx, card, { x = 0, y = 0, scale = 1, photo = null, logo = null, shadow = true } = {}) {
  const p = gangPalette(card);
  const shield = new Path2D(GANG_SHIELD_PATH);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Ombre portée (en pixels du canvas, non mise à l'échelle)
  if (shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = 70;
    ctx.shadowOffsetY = 40;
    ctx.fillStyle = '#000';
    ctx.fill(shield);
    ctx.restore();
  }

  // Liseré
  ctx.fillStyle = paint(ctx, p.grad.border, W, H);
  ctx.fill(shield);

  // Fond intérieur : écusson réduit autour de (50 %, 47 %)
  ctx.save();
  const ox = W * GANG_INNER_SCALE.originX;
  const oy = H * GANG_INNER_SCALE.originY;
  ctx.translate(ox, oy);
  ctx.scale(GANG_INNER_SCALE.x, GANG_INNER_SCALE.y);
  ctx.translate(-ox, -oy);
  ctx.clip(shield);
  ctx.fillStyle = paint(ctx, p.grad.bg, W, H);
  ctx.fillRect(0, 0, W, H);
  if (p.scanlines) {
    ctx.fillStyle = 'rgba(255,255,255,.03)';
    for (let yy = H - 1; yy >= 0; yy -= 4) ctx.fillRect(0, yy, W, 1);
  }
  // Bandes diagonales
  ctx.fillStyle = hardStops(ctx, 118, W, H, [[0.46, 0.52, p.band], [0.6, 0.63, p.band2]]);
  ctx.fillRect(0, 0, W, H);
  // Arcs (cercles centrés à 104 % / 30 %)
  ctx.strokeStyle = p.arc;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(W * 1.04, H * 0.3, 120.75, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = p.arc2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(W * 1.04, H * 0.3, 161.75, 0, Math.PI * 2);
  ctx.stroke();
  // Reflet blanc au repos (50 %, 25 %)
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  const glare = ctx.createRadialGradient(W / 2, H * 0.25, 0, W / 2, H * 0.25, 152);
  glare.addColorStop(0, `rgba(255,255,255,${p.glare})`);
  glare.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // Reflet irisé (or holo, icône, anniversaire)
  if (p.holo > 0 && typeof ctx.createConicGradient === 'function') {
    ctx.save();
    ctx.globalCompositeOperation = 'color-dodge';
    ctx.globalAlpha = p.holo;
    const holo = ctx.createConicGradient(-Math.PI / 2, W / 2, H * 0.3);
    ['#ff7ad9', '#7af0ff', '#b9ff7a', '#ffe27a', '#ff7ad9'].forEach((c, i) => holo.addColorStop(i / 4, c));
    ctx.fillStyle = holo;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Décor de saison (immobile), sous la photo et le texte
  if (p.decor) drawSeasonDecor(ctx, p, Math.max(1, scale * 1.5));

  // Photo ou silhouette
  drawPhoto(ctx, p, photo, Math.max(1, scale * 1.5));

  // Note, poste, pastille, logo (colonne de 62 px centrée en x = 61)
  const cx = 30 + 31;
  ctx.fillStyle = p.ink;
  ctx.font = `800 58px ${FUT}`;
  const score = gangScore(card);
  drawText(ctx, String(score ?? '–'), cx, baselineIn(ctx, 40, 46.4, 58), { align: 'center' });
  ctx.font = `700 21px ${FUT}`;
  drawText(ctx, String(card?.pos || ''), cx, baselineIn(ctx, 90.4, 21, 21), { align: 'center', spacing: 21 * 0.03 });
  ctx.font = `800 11px ${FUT}`;
  const gemW = Math.max(34, spacedWidth(ctx, p.code, 0.44) + 8);
  // Pastille du niveau, peinte dans son propre repère (dégradé à sa taille)
  ctx.save();
  ctx.translate(cx - gemW / 2, 121.4);
  roundRect(ctx, 0, 0, gemW, 22, 3);
  ctx.fillStyle = paint(ctx, p.grad.gem, gemW, 22);
  ctx.fill();
  roundRect(ctx, 0.5, 0.5, gemW - 1, 21, 2.5);
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = p.gemInk;
  drawText(ctx, p.code, cx, baselineIn(ctx, 121.4, 22, 11), { align: 'center', spacing: 0.44 });
  drawLogo(ctx, logo, cx - 18, 153.4, 36, 'rgba(255,255,255,.18)');

  // Nom (majuscules, réduit puis tronqué s'il est trop long)
  const name = String(card?.name || 'Client').toUpperCase();
  ctx.fillStyle = p.ink;
  const nameSize = fitFont(ctx, name, { weight: 800, family: FUT, max: 40, min: 30, maxWidth: 256, spacingEm: 0.02 });
  const shownName = ellipsize(ctx, name, 256, nameSize * 0.02);
  drawText(ctx, shownName, W / 2, baselineIn(ctx, 232, 40, nameSize), { align: 'center', spacing: nameSize * 0.02 });
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = p.accent;
  ctx.fillRect(W / 2 - 256 * 0.37, 280, 256 * 0.74, 1.5);
  ctx.restore();

  // Stats : deux colonnes de 87,25 px séparées par un filet
  const colX = [44, 44 + 87.25 + 18 + 1.5 + 18];
  GANG_STAT_COLUMNS.forEach((keys, col) => {
    keys.forEach((key, row) => {
      const top = 288 + row * (28 + 3);
      const v = gangStatValue(card, key);
      ctx.font = `700 25px ${FUT}`;
      const base = baselineIn(ctx, top, 28, 25);
      ctx.fillStyle = isGangStatLow(key, v) ? GANG_LOW_COLOR : p.ink;
      const txt = String(v ?? '–');
      const bw = Math.max(ctx.measureText(txt).width, 25 * 1.35);
      drawText(ctx, txt, colX[col], base);
      ctx.font = `600 20px ${FUT}`;
      ctx.fillStyle = p.accent;
      drawText(ctx, gangStatAbbr(key), colX[col] + bw + 10, base, { spacing: 0.4 });
    });
  });
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = p.accent;
  ctx.fillRect(44 + 87.25 + 18, 288, 1.5, 90);
  ctx.restore();

  // Niveau
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = p.accent;
  ctx.font = `700 13px ${FUT}`;
  drawText(ctx, gangTierLabel(p).toUpperCase(), W / 2, baselineIn(ctx, 392, 19.5, 13), { align: 'center', spacing: 13 * 0.22 });
  ctx.restore();

  ctx.restore(); // fond intérieur
  ctx.restore(); // repère de la carte
}

/** Fond de la story : ellipse bleu nuit (radial-gradient de la maquette). */
function drawBackground(ctx) {
  const w = GANG_STORY_WIDTH;
  const h = GANG_STORY_HEIGHT;
  ctx.fillStyle = '#050816';
  ctx.fillRect(0, 0, w, h);
  const rx = w * 0.9;
  const ry = h * 0.55;
  ctx.save();
  ctx.translate(w / 2, h * 0.42);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, '#1e3fa8');
  g.addColorStop(0.7, '#08113a');
  g.addColorStop(1, '#050816');
  ctx.fillStyle = g;
  ctx.fillRect(-w, -h / (ry / rx), w * 2, (h * 2) / (ry / rx));
  ctx.restore();
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image impossible à générer'))), 'image/png');
    } catch (err) {
      reject(err);
    }
  });
}

function drawStory(card, { photo, logo }) {
  const canvas = document.createElement('canvas');
  canvas.width = GANG_STORY_WIDTH;
  canvas.height = GANG_STORY_HEIGHT;
  const ctx = canvas.getContext('2d');
  const cw = GANG_STORY_WIDTH;
  const p = gangPalette(card);

  drawBackground(ctx);

  // En-tête : logo et « D'HOME BARBER · GANG »
  drawLogo(ctx, logo, cw / 2 - 56, 150, 112, 'rgba(255,255,255,.18)');
  ctx.fillStyle = '#c9d4ff';
  ctx.font = `600 34px ${BODY}`;
  drawText(ctx, "D'HOME BARBER · GANG", cw / 2, baselineIn(ctx, 300, 44, 34), { align: 'center', spacing: 34 * 0.22 });

  // La carte, au centre
  const scale = 2.2;
  drawGangCard(ctx, card, { x: (cw - W * scale) / 2, y: 400, scale, photo, logo });

  // Niveau en gros
  const level = (p.kind === 'edition' ? p.label : card?.tier_label || p.label).toUpperCase();
  ctx.fillStyle = '#ffffff';
  const size = fitFont(ctx, level, { weight: 800, family: FUT, max: 120, min: 60, maxWidth: 960, spacingEm: 0.01 });
  drawText(ctx, level, cw / 2, baselineIn(ctx, 1420, size, size), { align: 'center', spacing: size * 0.01 });

  // Adresse et invitation
  ctx.fillStyle = '#aab4d8';
  ctx.font = `500 36px ${BODY}`;
  drawText(ctx, SALON_ADDRESS, cw / 2, baselineIn(ctx, 1590, 50, 36), { align: 'center' });

  const cta = "Télécharge l'app D'Home Barber";
  ctx.font = `600 38px ${BODY}`;
  const pillW = ctx.measureText(cta).width + 96;
  roundRect(ctx, (cw - pillW) / 2, 1690, pillW, 96, 48);
  ctx.fillStyle = 'rgba(255,255,255,.1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.28)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  drawText(ctx, cta, cw / 2, baselineIn(ctx, 1690, 96, 38), { align: 'center' });

  return canvas;
}

/**
 * Image story de la carte : PNG 1080 × 1920.
 * La photo n'est utilisée que si elle se charge en CORS (sinon : silhouette).
 * @returns {Promise<Blob>}
 */
export async function renderGangStory(card) {
  const [photo, logo] = await Promise.all([
    loadImage(card?.photo_url, { cors: true }),
    loadImage(LOGO_SRC),
    loadFonts(),
  ]);
  try {
    return await toBlob(drawStory(card, { photo, logo }));
  } catch (err) {
    // Canvas « sali » par une image refusée : on refait sans la photo
    if (!photo) throw err;
    return toBlob(drawStory(card, { photo: null, logo }));
  }
}

/**
 * Partage la story par le menu du téléphone.
 * `blob` facultatif : image déjà générée (le partage doit suivre de près le
 * tap, sinon le navigateur refuse ; la générer à l'avance évite l'attente).
 * @returns {Promise<{ shared: true } | { cancelled: true } | { fallback: true, url: string }>}
 *   `fallback` : afficher l'image (`url`, à libérer par URL.revokeObjectURL)
 *   avec « Maintiens l'image pour l'enregistrer ».
 */
export async function shareGangStory(card, { blob } = {}) {
  const image = blob || (await renderGangStory(card));
  const fallback = () => ({ fallback: true, url: URL.createObjectURL(image) });
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof File === 'undefined') return fallback();

  const file = new File([image], 'carte-gang.png', { type: 'image/png' });
  const data = {
    files: [file],
    title: 'Ma carte Gang',
    text: "Ma carte Gang D'Home Barber · 3 Rue du Bois Arquet, Douvaine",
  };
  let accepted = false;
  try {
    accepted = typeof navigator.canShare === 'function' && navigator.canShare(data);
  } catch {
    accepted = false;
  }
  if (!accepted) return fallback();

  try {
    await navigator.share(data);
    return { shared: true };
  } catch (err) {
    if (err?.name === 'AbortError') return { cancelled: true };
    // NotAllowedError (geste trop ancien), échec de l'appli cible… : image à enregistrer
    return fallback();
  }
}
