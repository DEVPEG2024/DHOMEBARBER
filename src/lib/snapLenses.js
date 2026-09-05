/**
 * Filtres Snap : configuration Camera Kit (jeton d'API client + groupe de lentilles) lue dans les
 * paramètres publics du serveur (`snap: { apiToken, lensGroupId }`, présents seulement si les
 * variables `SNAP_CAMERA_KIT_API_TOKEN` et `SNAP_LENS_GROUP_ID` sont définies sur Heroku).
 * Le jeton Camera Kit est un jeton client public, fait pour être embarqué dans l'app.
 */
import { API_SERVER_URL, resolvedAppId } from '@/api/apiClient';

let settingsPromise = null;

/** Paramètres publics du serveur, chargés une seule fois par session. */
function publicSettings() {
  if (!settingsPromise) {
    settingsPromise = fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return settingsPromise;
}

/** `{ apiToken, lensGroupId }` ou null si les filtres Snap ne sont pas configurés. */
export function snapConfig() {
  return publicSettings().then((data) => (data?.snap?.apiToken && data?.snap?.lensGroupId ? data.snap : null));
}

/**
 * Le salon a-t-il allumé les filtres Snap ? (interrupteur dans Paramètres du salon, combiné à
 * la configuration Camera Kit côté serveur). Sert à masquer l'entrée de l'accueil : proposer
 * une carte qui mène à « bientôt disponibles » ne rend service à personne.
 */
export function snapFeatureEnabled() {
  return publicSettings().then((data) => data?.features?.snapLenses === true);
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
