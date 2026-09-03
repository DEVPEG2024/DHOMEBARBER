/**
 * Essayage de couleur de cheveux, tout sur l'appareil.
 *
 * Détection des cheveux : modèle « hair segmenter » de MediaPipe (Google), exécuté dans le
 * navigateur (WebAssembly + WebGL). Rien n'est envoyé : ni la vidéo, ni les photos.
 * Le moteur (WASM) est chargé depuis le CDN jsDelivr, le modèle depuis le stockage de Google.
 * Rendu : le masque de confiance (probabilité « cheveux » par pixel) devient un calque de
 * couleur composé sur l'image avec les modes de fusion du canvas 2D (`color` garde la lumière
 * naturelle des cheveux, `screen` éclaircit pour les teintes claires, `multiply` assombrit).
 */
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

const TASKS_VISION_VERSION = '1.0.1'; // = version installée (package.json), le WASM doit correspondre
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite';

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Palette : `light` éclaircit les cheveux foncés, `dark` assombrit. */
export const HAIR_COLORS = [
  { id: 'platine', name: 'Blond platine', hex: '#f1e6c8', light: true },
  { id: 'blond', name: 'Blond doré', hex: '#d8ae5a', light: true },
  { id: 'chatain', name: 'Châtain', hex: '#7a5230' },
  { id: 'brun', name: 'Brun', hex: '#3b2617', dark: true },
  { id: 'noir', name: 'Noir', hex: '#0d0d10', dark: true },
  { id: 'roux', name: 'Roux', hex: '#b9491d' },
  { id: 'gris', name: 'Gris argent', hex: '#b9bec6', light: true },
  { id: 'blanc', name: 'Blanc', hex: '#f4f4f4', light: true },
  { id: 'bleu-nuit', name: 'Bleu nuit', hex: '#233c93' },
  { id: 'bleu', name: 'Bleu électrique', hex: '#1e88e5' },
  { id: 'violet', name: 'Violet', hex: '#7b3fbf' },
  { id: 'rose', name: 'Rose', hex: '#e0529b' },
  { id: 'rouge', name: 'Rouge', hex: '#c62828' },
  { id: 'vert', name: 'Vert émeraude', hex: '#1f8a5b' },
].map((c) => ({ ...c, rgb: hexToRgb(c.hex) }));

let segmenterPromise = null;
let currentMode = null;

/**
 * Charge (une seule fois par session) le moteur et le modèle. `onProgress('wasm' | 'model')`.
 * GPU (WebGL) d'abord, repli CPU si le contexte est refusé.
 */
export function loadHairSegmenter(onProgress) {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      onProgress?.('wasm');
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
      onProgress?.('model');
      const create = (delegate) => ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
      let segmenter;
      try {
        segmenter = await create('GPU');
      } catch {
        segmenter = await create('CPU');
      }
      currentMode = 'VIDEO';
      return segmenter;
    })().catch((err) => {
      segmenterPromise = null; // permet de réessayer (connexion revenue)
      throw err;
    });
  }
  return segmenterPromise;
}

/** Bascule VIDEO (flux caméra) / IMAGE (photo) sans recharger le modèle. */
export async function setSegmenterMode(segmenter, mode) {
  if (currentMode === mode) return;
  await segmenter.setOptions({ runningMode: mode });
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

/**
 * Dessine `source` (vidéo, image ou canvas) dans `ctx` puis recolore les cheveux.
 * `alpha` a les dimensions `maskWidth` × `maskHeight` (celles de l'image analysée) ;
 * `overlayCanvas` est un canvas hors écran réutilisé entre les images.
 */
export function renderHairColor({ ctx, width, height, source, alpha, maskWidth, maskHeight, color, strength, overlayCanvas }) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(source, 0, 0, width, height);
  if (!alpha || !color || strength <= 0 || !maskWidth || !maskHeight) {
    ctx.restore();
    return;
  }

  // Calque : la couleur choisie là où il y a des cheveux (alpha = masque)
  const oc = overlayCanvas;
  if (oc.width !== maskWidth || oc.height !== maskHeight) {
    oc.width = maskWidth;
    oc.height = maskHeight;
  }
  const octx = oc.getContext('2d');
  const img = octx.createImageData(maskWidth, maskHeight);
  const d = img.data;
  const { r, g, b } = color.rgb;
  for (let i = 0, j = 0; i < alpha.length; i++, j += 4) {
    d[j] = r;
    d[j + 1] = g;
    d[j + 2] = b;
    d[j + 3] = alpha[i];
  }
  octx.putImageData(img, 0, 0);

  // Teinte : garde la lumière naturelle des cheveux, applique la couleur
  ctx.globalAlpha = strength;
  ctx.globalCompositeOperation = 'color';
  ctx.drawImage(oc, 0, 0, width, height);
  // Correction de luminosité selon la teinte
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
