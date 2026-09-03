/**
 * Essayage de couleur de cheveux et de barbe, tout sur l'appareil.
 *
 * Détection :
 * - cheveux : modèle « hair segmenter » de MediaPipe (segmentation par pixel) ;
 * - barbe : le modèle cheveux ne la voit pas. On délimite la zone barbe + moustache avec les
 *   478 points du visage (Face Landmarker de MediaPipe : joues, mâchoire, menton, sous le nez,
 *   lèvres exclues), puis, pixel par pixel dans cette zone, on ne garde que ce qui est plus
 *   sombre que la peau de référence (joues) : la barbe, pas la peau.
 * Les deux modèles tournent dans le navigateur (WebAssembly + WebGL). Rien n'est envoyé.
 * Le moteur (WASM) vient du CDN jsDelivr, les modèles du stockage de Google.
 *
 * Rendu : shader WebGL (`hairGl.js`) qui conserve texture, mèches et reflets ; repli canvas 2D
 * (`renderHairColor2D`) si WebGL est indisponible.
 */
import { FilesetResolver, ImageSegmenter, FaceLandmarker } from '@mediapipe/tasks-vision';

const TASKS_VISION_VERSION = '1.0.1'; // = version installée (package.json), le WASM doit correspondre
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const HAIR_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite';
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const luma = ({ r, g, b }) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/**
 * Palette. `tone` pilote le réalisme du shader :
 * - light : la luminosité des cheveux est fortement remontée vers la cible (blond sur brun) ;
 * - dark : descendue (noir sur blond) ;
 * - natural : déplacement modéré, teinte naturelle ;
 * - vivid : la luminosité d'origine est surtout conservée, la teinte vive prend le dessus.
 */
const TONES = {
  light: { lift: 0.9, contrast: 1.15 },
  dark: { lift: 0.8, contrast: 0.95 },
  natural: { lift: 0.65, contrast: 1.0 },
  vivid: { lift: 0.5, contrast: 1.05 },
};
// ---------------------------------------------------------------------------
// Oklab (espace perceptuel) : mêmes formules que le shader (hairGl.js)
// ---------------------------------------------------------------------------
const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
/** Oklab [L, a, b] d'une couleur sRGB 0..255. */
export function rgbToOklab(r, g, b) {
  const lr = SRGB_TO_LINEAR[r];
  const lg = SRGB_TO_LINEAR[g];
  const lb = SRGB_TO_LINEAR[b];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/** Ton d'une couleur (pilote le réalisme) déduit de sa clarté et de son chroma Oklab. */
function toneOf(lab) {
  const chroma = Math.hypot(lab[1], lab[2]);
  if (chroma > 0.11) return 'vivid';
  if (lab[0] > 0.78) return 'light';
  if (lab[0] < 0.36) return 'dark';
  return 'natural';
}

/** Couleur complète (rgb, Oklab, ton, paramètres) depuis un hexadécimal : préréglages et couleur personnalisée. */
export function makeColor({ id, name, hex, tone }) {
  const rgb = hexToRgb(hex);
  const lab = rgbToOklab(rgb.r, rgb.g, rgb.b);
  const t = tone || toneOf(lab);
  return { id, name, hex, tone: t, rgb, lab, targetL: luma(rgb), ...TONES[t], light: t === 'light', dark: t === 'dark' };
}

export const HAIR_COLORS = [
  { id: 'platine', name: 'Blond platine', hex: '#f1e6c8', tone: 'light' },
  { id: 'blond', name: 'Blond doré', hex: '#d8ae5a', tone: 'light' },
  { id: 'chatain', name: 'Châtain', hex: '#7a5230', tone: 'natural' },
  { id: 'brun', name: 'Brun', hex: '#3b2617', tone: 'dark' },
  { id: 'noir', name: 'Noir', hex: '#0d0d10', tone: 'dark' },
  { id: 'roux', name: 'Roux', hex: '#b9491d', tone: 'natural' },
  { id: 'gris', name: 'Gris argent', hex: '#b9bec6', tone: 'light' },
  { id: 'blanc', name: 'Blanc', hex: '#f4f4f4', tone: 'light' },
  { id: 'bleu-nuit', name: 'Bleu nuit', hex: '#233c93', tone: 'vivid' },
  { id: 'bleu', name: 'Bleu électrique', hex: '#1e88e5', tone: 'vivid' },
  { id: 'violet', name: 'Violet', hex: '#7b3fbf', tone: 'vivid' },
  { id: 'rose', name: 'Rose', hex: '#e0529b', tone: 'vivid' },
  { id: 'rouge', name: 'Rouge', hex: '#c62828', tone: 'vivid' },
  { id: 'vert', name: 'Vert émeraude', hex: '#1f8a5b', tone: 'vivid' },
].map(makeColor);

let modelsPromise = null;
let currentMode = null;

/**
 * Charge (une seule fois par session) le moteur et les deux modèles.
 * `onProgress('wasm' | 'hair' | 'face')`. GPU (WebGL) d'abord, repli CPU.
 */
export function loadModels(onProgress) {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      onProgress?.('wasm');
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
      const withFallback = async (create) => {
        try { return await create('GPU'); } catch { return create('CPU'); }
      };
      onProgress?.('hair');
      const segmenter = await withFallback((delegate) => ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: HAIR_MODEL_URL, delegate },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      }));
      onProgress?.('face');
      let landmarker = null;
      try {
        landmarker = await withFallback((delegate) => FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        }));
      } catch {
        landmarker = null; // sans visage : cheveux seulement
      }
      currentMode = 'VIDEO';
      return { segmenter, landmarker };
    })().catch((err) => {
      modelsPromise = null; // permet de réessayer (connexion revenue)
      throw err;
    });
  }
  return modelsPromise;
}

/** Bascule VIDEO (flux caméra) / IMAGE (photo) des deux modèles sans les recharger. */
export async function setModelsMode(models, mode) {
  if (currentMode === mode) return;
  await models.segmenter.setOptions({ runningMode: mode });
  if (models.landmarker) await models.landmarker.setOptions({ runningMode: mode });
  currentMode = mode;
}

/** Masque « cheveux » du résultat (index 1 = cheveux, 0 = fond). */
export function hairMaskOf(result) {
  const masks = result?.confidenceMasks;
  if (!masks || masks.length === 0) return null;
  return masks.length > 1 ? masks[1] : masks[0];
}

/** Probabilités 0..1 d'un masque, quel que soit son format interne (float32 ou uint8). */
export function maskProbabilities(mask) {
  if (typeof mask.hasFloat32Array === 'function' && !mask.hasFloat32Array() && typeof mask.getAsUint8Array === 'function') {
    const u8 = mask.getAsUint8Array();
    const out = new Float32Array(u8.length);
    for (let i = 0; i < u8.length; i++) out[i] = u8[i] / 255;
    return out;
  }
  return mask.getAsFloat32Array();
}

/**
 * Probabilités (Float32 0..1) → alpha 0..255 avec rampe douce sur les bords,
 * lissé dans le temps avec le masque précédent (moins de scintillement en vidéo).
 * Réutilise `prev` en place quand les dimensions correspondent.
 */
export function maskToAlpha(probabilities, prev) {
  const n = probabilities.length;
  const reuse = prev && prev.length === n;
  const out = reuse ? prev : new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    let a = (probabilities[i] - 0.3) / 0.4;
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    const v = a * 255;
    out[i] = reuse ? out[i] * 0.45 + v * 0.55 : v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Barbe : zone délimitée par les points du visage, affinée par contraste avec la peau
// ---------------------------------------------------------------------------

// Contour bas du visage (ovale MediaPipe, de l'oreille droite au menton puis à l'oreille gauche)
const JAW = [454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234];
// Bord haut de la zone barbe : joue gauche, sous le nez, joue droite (inclut la moustache)
const BEARD_TOP = [50, 2, 280];
// Lèvres (contour extérieur), exclues de la zone
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
// Références de peau (joues et front)
const SKIN_POINTS = [50, 280, 10, 116, 345];

/** Flou séparable en place sur un tableau alpha (bords doux). */
function boxBlur(src, w, h, radius) {
  if (radius <= 0) return src;
  const tmp = new Float32Array(w * h);
  const out = new Uint8ClampedArray(w * h);
  const span = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -radius; x <= radius; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / span;
      const add = Math.min(w - 1, x + radius + 1);
      const sub = Math.max(0, x - radius);
      acc += src[row + add] - src[row + sub];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / span;
      const add = Math.min(h - 1, y + radius + 1);
      const sub = Math.max(0, y - radius);
      acc += tmp[add * w + x] - tmp[sub * w + x];
    }
  }
  return out;
}

function pathFromPoints(ctx, landmarks, indices, w, h) {
  ctx.beginPath();
  indices.forEach((idx, i) => {
    const p = landmarks[idx];
    if (!p) return;
    if (i === 0) ctx.moveTo(p.x * w, p.y * h);
    else ctx.lineTo(p.x * w, p.y * h);
  });
  ctx.closePath();
}

/** Luminosité 0..1 d'un pixel RGBA. */
const pixelLuma = (d, j) => (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) / 255;

/** Luminosité moyenne de la peau autour des points de référence (fenêtres 5 × 5). */
function skinLuminance(pixels, w, h, landmarks) {
  let sum = 0;
  let n = 0;
  for (const idx of SKIN_POINTS) {
    const p = landmarks[idx];
    if (!p) continue;
    const cx = Math.round(p.x * w);
    const cy = Math.round(p.y * h);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        sum += pixelLuma(pixels, (y * w + x) * 4);
        n++;
      }
    }
  }
  return n ? sum / n : 0.5;
}

/**
 * Masque barbe (alpha 0..255, `w` × `h`) à partir des points du visage et des pixels analysés.
 * Renvoie aussi `zone` (la zone barbe sans le filtre de peau, pour l'exclure du masque cheveux).
 * `scratch` : canvas hors écran réutilisé. `prev` : masque précédent pour le lissage temporel.
 */
export function computeBeardAlpha({ landmarks, pixels, w, h, scratch, prev }) {
  const n = w * h;
  if (!landmarks || landmarks.length < 470) {
    return { alpha: prev ? prev.fill(0) : new Uint8ClampedArray(n), zone: null };
  }
  if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  pathFromPoints(ctx, landmarks, [...JAW, ...BEARD_TOP], w, h);
  ctx.fill();
  // Lèvres retirées, avec une marge
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = Math.max(3, w * 0.02);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff';
  pathFromPoints(ctx, landmarks, LIPS, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';

  const zoneData = ctx.getImageData(0, 0, w, h).data;
  const zoneRaw = new Uint8ClampedArray(n);
  for (let i = 0, j = 3; i < n; i++, j += 4) zoneRaw[i] = zoneData[j];
  const zone = boxBlur(zoneRaw, w, h, Math.max(2, Math.round(w / 90)));

  // Dans la zone, on garde ce qui est nettement plus sombre que la peau (la barbe) et peu
  // saturé : la peau dans l'ombre reste orangée, les poils sont neutres
  const skinL = skinLuminance(pixels, w, h, landmarks);
  const lo = 0.06;
  const hi = 0.28;
  const out = prev && prev.length === n ? prev : new Uint8ClampedArray(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const z = zone[i];
    let v = 0;
    if (z > 2) {
      const d = skinL - pixelLuma(pixels, j);
      let b = (d - lo) / (hi - lo);
      b = b < 0 ? 0 : b > 1 ? 1 : b;
      if (b > 0) {
        const r = pixels[j];
        const g = pixels[j + 1];
        const bl = pixels[j + 2];
        const mx = Math.max(r, g, bl);
        const sat = mx > 0 ? (mx - Math.min(r, g, bl)) / mx : 0;
        // saturation 0,3 → plein, 0,75 → tiers : rejette la peau ombrée (orangée)
        let k = 1.4 - sat * 1.4;
        k = k < 0.35 ? 0.35 : k > 1 ? 1 : k;
        b = Math.pow(b * k, 1.1); // poils épars légèrement atténués
      }
      v = (z / 255) * b * 255;
    }
    out[i] = prev && prev.length === n ? out[i] * 0.45 + v * 0.55 : v;
  }
  return { alpha: out, zone };
}

/** Retire la zone barbe du masque cheveux (le modèle cheveux englobe parfois la barbe). */
export function subtractZone(alpha, zone) {
  if (!alpha || !zone || alpha.length !== zone.length) return;
  for (let i = 0; i < alpha.length; i++) {
    if (zone[i]) alpha[i] = alpha[i] * (1 - (zone[i] / 255) * 0.95);
  }
}

/** Clarté Oklab moyenne (0..1) des pixels pondérée par un masque alpha (même échelle que le shader). */
export function meanLuminance(pixels, alpha) {
  if (!alpha) return null;
  let sum = 0;
  let wsum = 0;
  for (let i = 0, j = 0; i < alpha.length; i++, j += 4) {
    const a = alpha[i];
    if (a < 8) continue;
    // Clarté achromatique : racine cubique de la luminance linéaire (≈ L d'Oklab)
    const y = 0.2126 * SRGB_TO_LINEAR[pixels[j]] + 0.7152 * SRGB_TO_LINEAR[pixels[j + 1]] + 0.0722 * SRGB_TO_LINEAR[pixels[j + 2]];
    sum += Math.cbrt(y) * a;
    wsum += a;
  }
  return wsum > 0 ? sum / wsum : null;
}

// Ovale complet du visage (points MediaPipe), pour situer la ligne des cheveux
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

/**
 * Masque « racines » (alpha 0..255) : bande des cheveux qui longe la ligne des cheveux
 * (proximité de l'ovale du visage, dilaté et adouci), pondérée par le masque cheveux.
 * Sans visage : null (pas d'effet racines).
 */
export function computeRootsAlpha({ landmarks, hairAlpha, w, h, scratch }) {
  if (!landmarks || landmarks.length < 470 || !hairAlpha || hairAlpha.length !== w * h) return null;
  if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  pathFromPoints(ctx, landmarks, FACE_OVAL, w, h);
  ctx.fill();
  const data = ctx.getImageData(0, 0, w, h).data;
  const face = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 3; i < face.length; i++, j += 4) face[i] = data[j];
  // Dilatation douce : la bande racine s'étend sur ~8 % de la largeur depuis la peau
  const near = boxBlur(face, w, h, Math.max(4, Math.round(w / 12)));
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < out.length; i++) {
    const n = near[i] / 255;
    // 0 loin du visage, 1 au contact : rampe, puis pondération par la présence de cheveux
    const band = n < 0.08 ? 0 : n > 0.5 ? 1 : (n - 0.08) / 0.42;
    out[i] = band * (hairAlpha[i] / 255) * 255;
  }
  return boxBlur(out, w, h, 2);
}

// ---------------------------------------------------------------------------
// Repli canvas 2D (sans WebGL) : calque de couleur composé par modes de fusion
// ---------------------------------------------------------------------------
export function renderHairColor2D({ ctx, width, height, source, alphas, maskWidth, maskHeight, color, strength, overlayCanvas }) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(source, 0, 0, width, height);
  const list = (alphas || []).filter(Boolean);
  if (list.length === 0 || !color || strength <= 0 || !maskWidth || !maskHeight) {
    ctx.restore();
    return;
  }
  const oc = overlayCanvas;
  if (oc.width !== maskWidth || oc.height !== maskHeight) { oc.width = maskWidth; oc.height = maskHeight; }
  const octx = oc.getContext('2d');
  const img = octx.createImageData(maskWidth, maskHeight);
  const d = img.data;
  const { r, g, b } = color.rgb;
  for (let i = 0, j = 0; i < list[0].length; i++, j += 4) {
    let a = 0;
    for (const arr of list) if (arr[i] > a) a = arr[i];
    d[j] = r;
    d[j + 1] = g;
    d[j + 2] = b;
    d[j + 3] = a;
  }
  octx.putImageData(img, 0, 0);
  ctx.globalAlpha = strength;
  ctx.globalCompositeOperation = 'color';
  ctx.drawImage(oc, 0, 0, width, height);
  if (color.light) {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = strength * 0.55;
  } else if (color.dark) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = strength * 0.6;
  } else {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = strength * 0.5;
  }
  ctx.drawImage(oc, 0, 0, width, height);
  ctx.restore();
}
