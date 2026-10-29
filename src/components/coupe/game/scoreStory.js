/*
 * Score d'un match de La Coupe du Gang en story (1080 × 1920, maquette « Fin du match » :
 * « Partager en story ») : image PNG dessinée au canvas, sans capture du DOM, partagée par le menu
 * du téléphone (Instagram, Snapchat, WhatsApp…) ou affichée pour être enregistrée à la main.
 * Même logique de partage que la carte Gang (src/lib/gangStory.js) : l'image est préparée dès
 * l'écran de fin (un partage lancé trop longtemps après le tap est refusé sur iPhone).
 *
 * Thème stade (docs/fonctions/coupe-du-gang-stade.md) : en fond, le stade du jeu assombri (fond
 * noir si l'image ne charge pas), son logo D'Home Barber visible dans la tribune du haut ;
 * « VICTOIRE » en or ombré de rouge et quelques lames de rasoir, « DÉFAITE » en blanc sur une
 * bande noire soulignée de rouge, match nul en blanc ; invitation sur un bouton rouge.
 *
 * `story` : { key, title, win, tone?, score: [toi, adversaire], names: [toi, adversaire], eyebrow,
 *             points: { delta, total, rank } | null, season, note }
 * `tone` (facultatif, celui d'`endTexts`) : 'victoire' | 'defaite' | 'neutre' ; sinon déduit de
 * `win` et du titre. Rien sur l'adversaire au-delà de son nom affiché (prénom + initiale, contrat
 * section 0).
 */
import { isNative } from '@/lib/capacitor';
import { STADIUM_URL } from '@/lib/coupe/stadiumImage';
import { COUPE_COLORS as C } from '@/components/coupe/palette';
import { coupePointsLabel } from './format';

export const SCORE_STORY_WIDTH = 1080;
export const SCORE_STORY_HEIGHT = 1920;

export const FUT = '"Barlow Condensed", "Arial Narrow", sans-serif';
export const BODY = 'Inter, system-ui, -apple-system, sans-serif';
const SALON_ADDRESS = '3 Rue du Bois Arquet · Douvaine';
const SHARE_TEXT = "Mon match à la Coupe du Gang · D'Home Barber, Douvaine";
const IMAGE_TIMEOUT_MS = 8000;
const FONT_TIMEOUT_MS = 3000;
/** Noir des fonds (`C.noir`) avec une opacité. */
export const NOIR = (alpha) => `rgba(11, 11, 12, ${alpha})`;

// Lames de rasoir d'une victoire (maquette « Après-match : victoire »), posées une fois pour toutes
// hors des textes, du logo de la tribune et des bannières « LA COUPE DU GANG » des côtés
// (y 725 à 1090) : x, y, angle, taille, teinte
const BLADES = [
  [215, 300, -24, 1.45, C.blancCasse], [860, 265, 58, 1.55, C.or], [330, 800, 14, 1, C.rouge],
  [760, 815, -40, 1.05, C.or], [75, 520, 80, 1.25, C.rouge], [1012, 450, -12, 1.3, C.blancCasse],
  [80, 1222, 32, 1.15, C.or], [1010, 1215, 22, 1.1, C.rouge],
];

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);

export function loadImage(src) {
  return new Promise((resolve) => {
    if (!src || typeof Image === 'undefined') return resolve(null);
    const img = new Image();
    const timer = setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS);
    img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth ? img : null); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
}

export async function loadFonts() {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const faces = [`800 40px ${FUT}`, `700 40px ${FUT}`, `500 36px ${BODY}`, `600 36px ${BODY}`];
  try {
    await withTimeout(Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null))), FONT_TIMEOUT_MS);
  } catch {
    // Police de repli : l'image reste lisible
  }
}

/** Ton de la story : celui d'`endTexts` s'il est fourni, sinon victoire, match nul / annulé, défaite. */
function storyTone(story) {
  if (story?.tone === 'victoire' || story?.tone === 'defaite' || story?.tone === 'neutre') return story.tone;
  if (story?.win) return 'victoire';
  return /^match\b/i.test(String(story?.title || '')) ? 'neutre' : 'defaite';
}

function spacedWidth(ctx, text, spacing) {
  if (!spacing) return ctx.measureText(text).width;
  return [...text].reduce((w, ch) => w + ctx.measureText(ch).width + spacing, 0);
}

/** Texte (espacement des lettres possible) aligné à gauche / au centre / à droite de `x`. */
export function drawText(ctx, text, x, baseline, { spacing = 0, align = 'left' } = {}) {
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

/** Une ligne en plusieurs couleurs (« LA COUPE DU GANG », « COUPE » en or), même espacement. */
export function drawSegments(ctx, segments, x, baseline, { spacing = 0, align = 'center' } = {}) {
  const total = segments.reduce((w, s) => w + spacedWidth(ctx, s.text, spacing), 0);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  for (const s of segments) {
    ctx.fillStyle = s.color;
    cx += drawText(ctx, s.text, cx, baseline, { spacing });
  }
}

/** Ombre portée le temps d'un dessin (lisibilité des textes posés sur le terrain). */
export function withShadow(ctx, { color = 'rgba(0, 0, 0, .85)', blur = 14, x = 0, y = 2 }, draw) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = x;
  ctx.shadowOffsetY = y;
  draw();
  ctx.restore();
}

/** Plus grande taille de police (≤ max) pour que le texte tienne dans `maxWidth`. */
export function fitFont(ctx, text, { weight, family, max, min, maxWidth, spacingEm = 0 }) {
  let size = max;
  for (; size > min; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (spacedWidth(ctx, text, size * spacingEm) <= maxWidth) break;
  }
  ctx.font = `${weight} ${size}px ${family}`;
  return size;
}

export function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Lame à double tranchant (même dessin que la pluie de l'écran de fin et celle du terrain). */
function drawBlade(ctx, x, y, angle, scale, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.scale(scale * 2.2, scale * 2.2);
  ctx.globalAlpha = 0.95;
  roundRect(ctx, -15, -6.5, 30, 13, 2.5);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, .45)';
  ctx.lineWidth = 0.9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-11.5, -5.1);
  ctx.lineTo(11.5, -5.1);
  ctx.stroke();
  ctx.fillStyle = C.noir;
  roundRect(ctx, -9, -1.6, 18, 3.2, 1.6);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-9, 0, 2.2, 0, Math.PI * 2);
  ctx.arc(9, 0, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-2.5, -6.5);
  ctx.lineTo(0, -4);
  ctx.lineTo(2.5, -6.5);
  ctx.moveTo(-2.5, 6.5);
  ctx.lineTo(0, 4);
  ctx.lineTo(2.5, 6.5);
  ctx.fill();
  ctx.restore();
}

/**
 * Fond : le stade en entier (rogné de quelques pixels sur les côtés), voile plus léger sur la
 * tribune du logo, noir en haut sous l'en-tête et en bas sous les points, l'adresse et l'invitation.
 */
function drawBackground(ctx, stadium, tone) {
  const w = SCORE_STORY_WIDTH;
  const h = SCORE_STORY_HEIGHT;
  ctx.fillStyle = C.noir;
  ctx.fillRect(0, 0, w, h);
  if (stadium) {
    const s = Math.max(w / stadium.naturalWidth, h / stadium.naturalHeight);
    const dw = stadium.naturalWidth * s;
    const dh = stadium.naturalHeight * s;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(stadium, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  // Défaite : stade plus sombre, comme sur l'écran de fin
  const k = tone === 'defaite' ? 0.1 : 0;
  const veil = ctx.createLinearGradient(0, 0, 0, h);
  veil.addColorStop(0, NOIR(0.3 + k));
  veil.addColorStop(0.2, NOIR(0.3 + k));
  veil.addColorStop(0.27, NOIR(0.52 + k));
  veil.addColorStop(1, NOIR(0.52 + k));
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, w, h);
  const top = ctx.createLinearGradient(0, 0, 0, 210);
  top.addColorStop(0, NOIR(1));
  top.addColorStop(0.45, NOIR(0.92));
  top.addColorStop(1, NOIR(0));
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, 210);
  const bottom = ctx.createLinearGradient(0, 1140, 0, 1560);
  bottom.addColorStop(0, NOIR(0));
  bottom.addColorStop(1, NOIR(1));
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 1140, w, h - 1140);
  if (tone === 'victoire') for (const b of BLADES) drawBlade(ctx, ...b);
}

/** Résultat en très grand : or ombré de rouge (victoire), blanc sur bande noire (défaite), blanc (nul). */
function drawTitle(ctx, story, tone, cx) {
  const title = String(story.title || '').toUpperCase();
  const band = tone === 'defaite';
  const size = fitFont(ctx, title, { weight: 800, family: FUT, max: 250, min: 120, maxWidth: band ? 860 : 960, spacingEm: 0.01 });
  const spacing = size * 0.01;
  const baseline = 520 + size * 0.82;
  if (band) {
    const tw = spacedWidth(ctx, title, spacing);
    const padX = size * 0.26;
    const top = baseline - size * 0.86;
    const height = size * 0.96;
    ctx.fillStyle = C.noir;
    ctx.fillRect(cx - tw / 2 - padX, top, tw + padX * 2, height);
    ctx.fillStyle = C.rouge;
    ctx.fillRect(cx - tw / 2 - padX, top + height, tw + padX * 2, Math.round(size * 0.05));
    ctx.fillStyle = C.blanc;
    drawText(ctx, title, cx, baseline, { align: 'center', spacing });
    return;
  }
  const shade = Math.round(size * (tone === 'victoire' ? 0.07 : 0.06));
  // Ombre décalée (rouge pour une victoire, noire sinon) avec un halo sombre, puis le titre
  withShadow(ctx, { color: 'rgba(0, 0, 0, .55)', blur: 40, y: 0 }, () => {
    ctx.fillStyle = tone === 'victoire' ? C.rouge : NOIR(0.85);
    drawText(ctx, title, cx, baseline + shade, { align: 'center', spacing });
  });
  ctx.fillStyle = tone === 'victoire' ? C.or : C.blanc;
  drawText(ctx, title, cx, baseline, { align: 'center', spacing });
}

/** Gain du match (en ligne, match qui compte) : carte bordée d'or quand il rapporte. */
function drawPoints(ctx, story) {
  const cw = SCORE_STORY_WIDTH;
  const p = story.points;
  const d = Math.round(Number(p.delta));
  const gain = d > 0;
  const top = 1250;
  const x = 150;
  const width = cw - 300;
  const height = 200;
  roundRect(ctx, x, top, width, height, 30);
  ctx.fillStyle = 'rgba(20, 20, 22, .94)';
  ctx.fill();
  if (gain) {
    ctx.save();
    roundRect(ctx, x, top, width, height, 30);
    ctx.clip();
    const glow = ctx.createLinearGradient(x, 0, x + width, 0);
    glow.addColorStop(0, 'rgba(235, 193, 94, .16)');
    glow.addColorStop(1, 'rgba(235, 193, 94, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x, top, width, height);
    ctx.restore();
  }
  roundRect(ctx, x, top, width, height, 30);
  ctx.strokeStyle = gain ? 'rgba(235, 193, 94, .55)' : 'rgba(255, 255, 255, .22)';
  ctx.lineWidth = 3;
  ctx.stroke();
  const delta = d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : '0';
  ctx.fillStyle = gain ? C.or : C.blanc;
  ctx.font = `800 120px ${FUT}`;
  drawText(ctx, delta, 210, top + 128);
  ctx.fillStyle = C.grisClair;
  ctx.font = `500 32px ${BODY}`;
  drawText(ctx, coupePointsLabel(d), 212, top + 172);
  ctx.fillStyle = C.gris;
  ctx.font = `500 32px ${BODY}`;
  drawText(ctx, String(story.season || 'Saison'), cw - 210, top + 78, { align: 'right' });
  if (p.rank) {
    ctx.fillStyle = C.blanc;
    ctx.font = `800 64px ${FUT}`;
    drawText(ctx, `${p.rank}${Number(p.rank) === 1 ? 're' : 'e'} place`, cw - 210, top + 150, { align: 'right' });
  } else if (p.total != null) {
    ctx.fillStyle = C.blanc;
    ctx.font = `800 64px ${FUT}`;
    drawText(ctx, `${p.total} pts`, cw - 210, top + 150, { align: 'right' });
  }
}

function drawStory(story, { stadium }) {
  const canvas = document.createElement('canvas');
  canvas.width = SCORE_STORY_WIDTH;
  canvas.height = SCORE_STORY_HEIGHT;
  const ctx = canvas.getContext('2d');
  const cw = SCORE_STORY_WIDTH;
  const cx = cw / 2;
  const tone = storyTone(story);

  drawBackground(ctx, stadium, tone);

  // En-tête : « D'HOME BARBER · LA COUPE DU GANG », « COUPE » en or (le logo est dans la tribune)
  ctx.font = `600 30px ${BODY}`;
  withShadow(ctx, { blur: 10, y: 1 }, () => {
    drawSegments(ctx, [
      { text: "D'HOME BARBER · LA ", color: C.blanc },
      { text: 'COUPE', color: C.or },
      { text: ' DU GANG', color: C.blanc },
    ], cx, 130, { align: 'center', spacing: 30 * 0.2 });
  });

  // Mode et adversaire
  ctx.font = `600 34px ${BODY}`;
  const eyebrow = ellipsize(ctx, String(story.eyebrow || '').toUpperCase(), 940);
  withShadow(ctx, {}, () => {
    ctx.fillStyle = C.grisClair;
    drawText(ctx, eyebrow, cx, 478, { align: 'center', spacing: 34 * 0.12 });
  });

  // Résultat en très grand
  drawTitle(ctx, story, tone, cx);

  // Score, posé sur le rond central
  const [a, b] = Array.isArray(story.score) ? story.score : [0, 0];
  ctx.font = `800 300px ${FUT}`;
  withShadow(ctx, { color: 'rgba(0, 0, 0, .6)', blur: 36, y: 4 }, () => {
    ctx.fillStyle = C.blanc;
    drawText(ctx, `${a} – ${b}`, cx, 1080, { align: 'center' });
  });

  // Les deux joueurs
  const [me, opp] = Array.isArray(story.names) ? story.names : ['Toi', 'Adversaire'];
  ctx.font = `600 46px ${BODY}`;
  const left = ellipsize(ctx, String(me || 'Toi'), 400);
  const right = ellipsize(ctx, String(opp || 'Adversaire'), 400);
  withShadow(ctx, {}, () => {
    ctx.fillStyle = C.blanc;
    drawText(ctx, left, cx - 60, 1170, { align: 'right' });
    drawText(ctx, right, cx + 60, 1170, { align: 'left' });
    ctx.fillStyle = C.grisClair;
    ctx.font = `500 34px ${BODY}`;
    drawText(ctx, 'contre', cx, 1166, { align: 'center' });
  });

  // Points de Coupe (match en ligne qui compte), sinon la note du match
  if (story.points && Number.isFinite(Number(story.points.delta))) {
    drawPoints(ctx, story);
  } else if (story.note) {
    ctx.font = `500 36px ${BODY}`;
    const note = ellipsize(ctx, String(story.note), 900);
    withShadow(ctx, {}, () => {
      ctx.fillStyle = C.grisClair;
      drawText(ctx, note, cx, 1340, { align: 'center' });
    });
  }

  // Adresse et invitation (bouton rouge, comme « Jouer » et « Revanche »)
  ctx.fillStyle = C.grisClair;
  ctx.font = `500 36px ${BODY}`;
  drawText(ctx, SALON_ADDRESS, cx, 1620, { align: 'center' });
  const cta = "Télécharge l'app D'Home Barber";
  ctx.font = `600 38px ${BODY}`;
  const pillW = ctx.measureText(cta).width + 96;
  roundRect(ctx, (cw - pillW) / 2, 1690, pillW, 96, 48);
  ctx.fillStyle = C.rouge;
  ctx.fill();
  ctx.fillStyle = C.blanc;
  drawText(ctx, cta, cx, 1752, { align: 'center' });

  return canvas;
}

export function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      // JPEG (fond toujours opaque) : environ 400 Ko au lieu de 2,5 Mo en PNG avec la photo du stade
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image impossible à générer'))), 'image/jpeg', 0.9);
    } catch (err) {
      reject(err);
    }
  });
}

/** Image story du score : JPEG 1080 × 1920. @returns {Promise<Blob>} */
export async function renderScoreStory(story) {
  const [stadium] = await Promise.all([loadImage(STADIUM_URL), loadFonts()]);
  return toBlob(drawStory(story, { stadium }));
}

/** Contenu base64 d'un blob, sans le préfixe `data:…;base64,` (format attendu par Filesystem). */
export function blobToBase64(blob) {
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

  // Apps iOS / Android : image écrite dans le cache, puis feuille de partage du système (la WebView
  // Android n'a pas navigator.share)
  if (isNative) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const data = await blobToBase64(image);
      const { uri } = await Filesystem.writeFile({ path: 'coupe-du-gang-dhomebarber.jpg', data, directory: Directory.Cache });
      await Share.share({ title: 'La Coupe du Gang', text: SHARE_TEXT, files: [uri], dialogTitle: 'Partager le score' });
      return { shared: true };
    } catch (err) {
      if (/cancel/i.test(String(err?.message || err))) return { cancelled: true };
      return fallback();
    }
  }

  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof File === 'undefined') return fallback();
  const file = new File([image], 'coupe-du-gang.jpg', { type: 'image/jpeg' });
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
