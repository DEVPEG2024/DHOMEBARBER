/**
 * Filtres Snap : configuration Camera Kit (jeton d'API client + groupe de lentilles) lue dans les
 * paramètres publics du serveur (`snap: { apiToken, lensGroupId }`, présents seulement si les
 * variables `SNAP_CAMERA_KIT_API_TOKEN` et `SNAP_LENS_GROUP_ID` sont définies sur Heroku).
 * Le jeton Camera Kit est un jeton client public, fait pour être embarqué dans l'app.
 */
import { API_SERVER_URL, resolvedAppId } from '@/api/apiClient';

let configPromise = null;

/** `{ apiToken, lensGroupId }` ou null si les filtres Snap ne sont pas configurés. */
export function snapConfig() {
  if (!configPromise) {
    configPromise = fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => (data?.snap?.apiToken && data?.snap?.lensGroupId ? data.snap : null))
      .catch(() => null);
  }
  return configPromise;
}

/** Le navigateur peut-il faire tourner Camera Kit ? (WebGL2 + caméra) */
export function snapSupported() {
  if (typeof window === 'undefined') return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
