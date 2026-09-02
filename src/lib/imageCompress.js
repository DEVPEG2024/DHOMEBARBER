/**
 * Compression d'image côté client, appliquée avant chaque upload.
 *
 * Le backend stocke les images en base64 dans PostgreSQL et les renvoie inline
 * dans chaque liste : une photo de téléphone non compressée (2 à 5 Mo) pèse sur
 * toutes les pages qui l'affichent. On redimensionne donc l'image (côté le plus
 * long ≤ maxDimension) et on l'exporte en JPEG en visant maxBytes.
 *
 * compressImage ne lève jamais : en cas d'échec (décodage impossible, API
 * absente, etc.) le fichier d'origine est renvoyé tel quel.
 */

const QUALITY_STEPS = [0.72, 0.62, 0.5];
const DIMENSION_STEPS = [1024, 800];
const ONE_MB = 1024 * 1024;

function isImageFile(file) {
  return !!file && typeof file === 'object' && typeof file.type === 'string' && file.type.startsWith('image/');
}

/** Fichiers renvoyés tels quels : non-image, SVG, GIF léger (animation préservée). */
function shouldPassThrough(file) {
  if (!isImageFile(file)) return true;
  if (file.type === 'image/svg+xml') return true;
  if (file.type === 'image/gif' && file.size < ONE_MB) return true;
  return false;
}

function decodeWithImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image decoding failed'));
    };
    img.src = url;
  });
}

/** Décode le fichier en ImageBitmap (orientation EXIF appliquée) ou en <img>. */
async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        // on retombe sur <img>
      }
    }
  }
  return decodeWithImageElement(file);
}

function sourceSize(source) {
  const width = source.naturalWidth || source.width || 0;
  const height = source.naturalHeight || source.height || 0;
  return { width, height };
}

function scaledSize(width, height, maxDimension) {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const ratio = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function drawToCanvas(source, width, height, { whiteBackground }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  if (whiteBackground) {
    // Un JPEG n'a pas de transparence : fond blanc plutôt que noir.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
      type,
      quality
    );
  });
}

function baseName(file) {
  const name = typeof file.name === 'string' && file.name ? file.name : 'image';
  return name.replace(/\.[^.]+$/, '') || 'image';
}

function toFile(blob, name, type) {
  return new File([blob], name, { type, lastModified: Date.now() });
}

/**
 * @param {File} file
 * @param {{ maxDimension?: number, quality?: number, maxBytes?: number }} [options]
 * @returns {Promise<File>} le fichier compressé (JPEG) ou le fichier d'origine
 */
export async function compressImage(file, { maxDimension = 1280, quality = 0.82, maxBytes = 400_000 } = {}) {
  try {
    if (shouldPassThrough(file)) return file;

    const source = await decodeImage(file);
    try {
      const { width, height } = sourceSize(source);
      if (!width || !height) return file;

      const fitsAlready = file.size <= maxBytes && Math.max(width, height) <= maxDimension;
      if (fitsAlready) return file;

      const isPng = file.type === 'image/png';
      const name = baseName(file);

      // PNG déjà léger mais trop grand : on le réduit en conservant le PNG
      // (transparence) si le résultat tient dans maxBytes.
      if (isPng && file.size <= maxBytes) {
        const { width: w, height: h } = scaledSize(width, height, maxDimension);
        const canvas = drawToCanvas(source, w, h, { whiteBackground: false });
        const pngBlob = await canvasToBlob(canvas, 'image/png');
        if (pngBlob.size <= maxBytes) return toFile(pngBlob, `${name}.png`, 'image/png');
      }

      // JPEG : qualité décroissante, puis dimension décroissante.
      const dimensions = [maxDimension, ...DIMENSION_STEPS.filter((d) => d < maxDimension)];
      let best = null;
      for (let i = 0; i < dimensions.length; i++) {
        const dim = dimensions[i];
        const { width: w, height: h } = scaledSize(width, height, dim);
        // Inutile de « réduire » à une taille que l'image n'atteint pas déjà.
        if (i > 0 && Math.max(width, height) <= dim) continue;

        const canvas = drawToCanvas(source, w, h, { whiteBackground: true });
        const qualities = i === 0 ? [quality, ...QUALITY_STEPS.filter((q) => q < quality)] : QUALITY_STEPS;
        for (const q of qualities) {
          const blob = await canvasToBlob(canvas, 'image/jpeg', q);
          if (!best || blob.size < best.size) best = blob;
          if (blob.size <= maxBytes) {
            return toFile(blob, `${name}.jpg`, 'image/jpeg');
          }
        }
      }

      // Aucun essai sous maxBytes : on garde le plus petit s'il améliore l'original.
      if (best && best.size < file.size) return toFile(best, `${name}.jpg`, 'image/jpeg');
      return file;
    } finally {
      if (typeof source.close === 'function') source.close();
    }
  } catch {
    return file;
  }
}

export default compressImage;
