/**
 * Mode AI ULTRA : traitement haute qualité côté serveur (segmentation HD + édition générative
 * limitée aux cheveux / barbe, fusion qui conserve chaque poil de l'original).
 * Voir dhomebarber-api/lib/hairUltra.js. Activé seulement si le serveur est configuré
 * (clé fal.ai) : `features.hairUltra` des paramètres publics.
 */
import { API_SERVER_URL, resolvedAppId } from '@/api/apiClient';

const API_BASE = `${API_SERVER_URL}/api/apps/${resolvedAppId}`;

let availablePromise = null;

/** Le mode AI ULTRA est-il activé sur le serveur ? (mémorisé pour la session) */
export function hairUltraAvailable() {
  if (!availablePromise) {
    availablePromise = fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) availablePromise = null;
        return !!data?.features?.hairUltra;
      })
      .catch(() => { availablePromise = null; return false; });
  }
  return availablePromise;
}

/**
 * Lance le traitement AI ULTRA. `imageDataUrl` : JPEG en data URL (≤ 6 Mo),
 * `target` : 'hair' | 'beard' | 'both', `color` : { hex, name }, `params` : réglages FAST.
 * Résout `{ image: dataURL, width, height, durationMs }`.
 */
export async function requestHairUltra({ imageDataUrl, target, color, params }) {
  const token = localStorage.getItem('base44_access_token') || localStorage.getItem('token') || '';
  let res;
  try {
    res = await fetch(`${API_BASE}/ai/hair-ultra`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ image: imageDataUrl, target, color: { hex: color.hex, name: color.name }, params }),
    });
  } catch (cause) {
    // Pas de réponse du serveur (hors ligne, coupure) : distingué d'un refus pour le message
    const err = new Error('Réseau indisponible');
    err.network = true;
    err.cause = cause;
    throw err;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.code;
    // Même signal que apiClient : AuthContext referme la session expirée et renvoie vers la connexion
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dhb:unauthorized'));
    }
    throw err;
  }
  return data;
}
