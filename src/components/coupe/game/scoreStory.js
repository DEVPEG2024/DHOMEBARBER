/*
 * Score d'un match de La Coupe du Gang en story (1080 × 1920, maquette « Fin du match » :
 * « Partager en story ») : image PNG dessinée au canvas, sans capture du DOM, partagée par le menu
 * du téléphone (Instagram, Snapchat, WhatsApp…) ou affichée pour être enregistrée à la main.
 * Même logique de partage que la carte Gang (src/lib/gangStory.js) : l'image est préparée dès
 * l'écran de fin (un partage lancé trop longtemps après le tap est refusé sur iPhone).
 *
 * `story` : { key, title, win, score: [toi, adversaire], names: [toi, adversaire], eyebrow,
 *             points: { delta, total, rank } | null, season, note }
 * Rien sur l'adversaire au-delà de son nom affiché (prénom + initiale, contrat section 0).
 */
import { isNative } from '@/lib/capacitor';

export const SCORE_STORY_WIDTH = 1080;
export const SCORE_STORY_HEIGHT = 1920;

const FUT = '"Barlow Condensed", "Arial Narrow", sans-serif';
const BODY = 'Inter, system-ui, -apple-system, sans-serif';
const LOGO_SRC = '/icons/icon-256.png';
const SALON_ADDRESS = '3 Rue du Bois Arquet · Douvaine';
const SHARE_TEXT = "Mon match à la Coupe du Gang · D'Home Barber, Douvaine";
const IMAGE_TIMEOUT_MS = 8000;
const FONT_TIMEOUT_MS = 3000;
const GOLD = '#ebc15e';
const GOLD_SOFT = '#c9b27a';
const FG = '#eef3ef';
const MUTED = '#9db0a6';

// Lames de rasoir de la maquette (fin du match), posées une fois pour toutes : x, y, angle, taille, teinte
const BLADES = [
  [90, 520, -24, 1.5, '#d9dfe4'], [420, 400, 14, 1.2, '#b9c2c9'], [880, 560, 58, 1.6, '#eef2f5'],
  [760, 860, -40, 1.1, '#c8d0d6'], [180, 930, 80, 1.3, '#e3e8ec'], [960, 1080, -12, 1.35, '#aab4bc'],
  [60, 1240, 32, 1.2, '#d0d7dc'], [930, 1500, 22, 1.1, '#c8d0d6'],
];

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src || typeof Image === 'undefined') return resolve(null);
    const img = new Image();
    const timer = setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS);
    img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth ? img : null); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
}

async function loadFonts() {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const faces = [`800 40px ${FUT}`, `700 40px ${FUT}`, `500 36px ${BODY}`, `600 36px ${BODY}`];
  try {
    await withTimeout(Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null))), FONT_TIMEOUT_MS);
  } catch {
    // Police de repli : l'image reste lisible
  }
}

function spacedWidth(ctx, text, spacing) {
  if (!spacing) return ctx.measureText(text).width;
  return [...text].reduce((w, ch) => w + ctx.measureText(ch).width + spacing, 0);
}

/** Texte (espacement des lettres possible) aligné à gauche / au centre / à droite de `x`. */
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
  for (; size > min; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (spacedWidth(ctx, text, size * spacingEm) <= maxWidth) break;
  }
  ctx.font = `${weight} ${size}px ${family}`;
  return size;
}

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
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

function drawLogo(ctx, logo, cx, top, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, top + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(235,193,94,.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (logo) {
    const inner = size - 8;
    ctx.beginPath();
    ctx.arc(cx, top + size / 2, inner / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, cx - inner / 2, top + 4, inner, inner);
  }
  ctx.restore();
}

function drawBlade(ctx, x, y, angle, scale, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.scale(scale * 1.6, scale * 1.6);
  ctx.globalAlpha = 0.55;
  roundRect(ctx, -15, -6.5, 30, 13, 2.5);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = '#0b0d0c';
  roundRect(ctx, -9, -1.5, 18, 3.2, 1.6);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Fond de la fin du match : stade de nuit, halo doré, lignes du terrain très discrètes. */
function drawBackground(ctx) {
  const w = SCORE_STORY_WIDTH;
  const h = SCORE_STORY_HEIGHT;
  ctx.fillStyle = '#05080a';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h * 0.38);
  ctx.scale(1, 0.7);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
  g.addColorStop(0, '#2a2410');
  g.addColorStop(0.72, '#07090b');
  g.addColorStop(1, '#05080a');
  ctx.fillStyle = g;
  ctx.fillRect(-w, -h, w * 2, h * 2);
  ctx.restore();
  // Terrain
  ctx.save();
  ctx.strokeStyle = 'rgba(235,193,94,.08)';
  ctx.lineWidth = 4;
  roundRect(ctx, 70, 380, w - 140, 1150, 28);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(70, 955);
  ctx.lineTo(w - 70, 955);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, 955, 150, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(w / 2 - 230, 380, 460, 170);
  ctx.strokeRect(w / 2 - 230, 1360, 460, 170);
  ctx.restore();
  for (const b of BLADES) drawBlade(ctx, ...b);
}

function drawStory(story, { logo }) {
  const canvas = document.createElement('canvas');
  canvas.width = SCORE_STORY_WIDTH;
  canvas.height = SCORE_STORY_HEIGHT;
  const ctx = canvas.getContext('2d');
  const cw = SCORE_STORY_WIDTH;
  const cx = cw / 2;

  drawBackground(ctx);

  // En-tête : logo et « D'HOME BARBER · LA COUPE DU GANG »
  drawLogo(ctx, logo, cx, 120, 120);
  ctx.fillStyle = GOLD_SOFT;
  ctx.font = `600 30px ${BODY}`;
  drawText(ctx, "D'HOME BARBER · LA COUPE DU GANG", cx, 310, { align: 'center', spacing: 30 * 0.2 });

  // Mode et adversaire
  ctx.fillStyle = MUTED;
  ctx.font = `600 34px ${BODY}`;
  const eyebrow = ellipsize(ctx, String(story.eyebrow || '').toUpperCase(), 940);
  drawText(ctx, eyebrow, cx, 470, { align: 'center', spacing: 34 * 0.12 });

  // Résultat en très grand
  const title = String(story.title || '').toUpperCase();
  ctx.fillStyle = story.win ? GOLD : FG;
  const tSize = fitFont(ctx, title, { weight: 800, family: FUT, max: 250, min: 120, maxWidth: 960, spacingEm: 0.01 });
  drawText(ctx, title, cx, 520 + tSize * 0.82, { align: 'center', spacing: tSize * 0.01 });

  // Score
  const [a, b] = Array.isArray(story.score) ? story.score : [0, 0];
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 300px ${FUT}`;
  drawText(ctx, `${a} – ${b}`, cx, 1080, { align: 'center' });

  // Les deux joueurs
  const [me, opp] = Array.isArray(story.names) ? story.names : ['Toi', 'Adversaire'];
  ctx.font = `600 46px ${BODY}`;
  const left = ellipsize(ctx, String(me || 'Toi'), 400);
  const right = ellipsize(ctx, String(opp || 'Adversaire'), 400);
  ctx.fillStyle = '#ffffff';
  drawText(ctx, left, cx - 60, 1170, { align: 'right' });
  drawText(ctx, right, cx + 60, 1170, { align: 'left' });
  ctx.fillStyle = MUTED;
  ctx.font = `500 34px ${BODY}`;
  drawText(ctx, 'contre', cx, 1166, { align: 'center' });

  // Points de Coupe (match en ligne qui compte), sinon la note du match
  const p = story.points;
  if (p && Number.isFinite(Number(p.delta))) {
    const top = 1250;
    roundRect(ctx, 150, top, cw - 300, 200, 30);
    ctx.fillStyle = 'rgba(18,22,26,.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(235,193,94,.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
    const d = Math.round(Number(p.delta));
    const delta = d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : '0';
    ctx.fillStyle = d > 0 ? GOLD : FG;
    ctx.font = `800 120px ${FUT}`;
    drawText(ctx, delta, 210, top + 128);
    ctx.fillStyle = GOLD_SOFT;
    ctx.font = `500 32px ${BODY}`;
    drawText(ctx, 'Points de Coupe', 212, top + 172);
    ctx.fillStyle = MUTED;
    ctx.font = `500 32px ${BODY}`;
    drawText(ctx, String(story.season || 'Saison'), cw - 210, top + 78, { align: 'right' });
    if (p.rank) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 64px ${FUT}`;
      drawText(ctx, `${p.rank}${Number(p.rank) === 1 ? 're' : 'e'} place`, cw - 210, top + 150, { align: 'right' });
    } else if (p.total != null) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 64px ${FUT}`;
      drawText(ctx, `${p.total} pts`, cw - 210, top + 150, { align: 'right' });
    }
  } else if (story.note) {
    ctx.fillStyle = MUTED;
    ctx.font = `500 36px ${BODY}`;
    drawText(ctx, ellipsize(ctx, String(story.note), 900), cx, 1340, { align: 'center' });
  }

  // Adresse et invitation
  ctx.fillStyle = '#aab4d8';
  ctx.font = `500 36px ${BODY}`;
  drawText(ctx, SALON_ADDRESS, cx, 1620, { align: 'center' });
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
  drawText(ctx, cta, cx, 1752, { align: 'center' });

  return canvas;
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

/** Image story du score : PNG 1080 × 1920. @returns {Promise<Blob>} */
export async function renderScoreStory(story) {
  const [logo] = await Promise.all([loadImage(LOGO_SRC), loadFonts()]);
  return toBlob(drawStory(story, { logo }));
}

/** Contenu base64 d'un blob, sans le préfixe `data:…;base64,` (format attendu par Filesystem). */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Lecture de l’image impossible'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Partage la story du score par le menu du téléphone. `blob` : image déjà préparée.
 * @returns {Promise<{ shared: true } | { cancelled: true } | { fallback: true, url: string }>}
 *   `fallback` : afficher l'image (`url`, à libérer par URL.revokeObjectURL) pour l'enregistrer.
 */
export async function shareScoreStory(story, { blob } = {}) {
  const image = blob || (await renderScoreStory(story));
  const fallback = () => ({ fallback: true, url: URL.createObjectURL(image) });

  // Apps iOS / Android : PNG écrit dans le cache, puis feuille de partage du système (la WebView
  // Android n'a pas navigator.share)
  if (isNative) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const data = await blobToBase64(image);
      const { uri } = await Filesystem.writeFile({ path: 'coupe-du-gang-dhomebarber.png', data, directory: Directory.Cache });
      await Share.share({ title: 'La Coupe du Gang', text: SHARE_TEXT, files: [uri], dialogTitle: 'Partager le score' });
      return { shared: true };
    } catch (err) {
      if (/cancel/i.test(String(err?.message || err))) return { cancelled: true };
      return fallback();
    }
  }

  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof File === 'undefined') return fallback();
  const file = new File([image], 'coupe-du-gang.png', { type: 'image/png' });
  const data = { files: [file], title: 'La Coupe du Gang', text: SHARE_TEXT };
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
    return fallback();
  }
}
