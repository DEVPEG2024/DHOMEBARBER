/**
 * Fichiers de page périmés après un déploiement. Les pages chargées à la demande
 * (React.lazy : admin, Favoris, Textile, Bons plans, Carte Gang…) portent un hash dans leur
 * nom (/assets/Agenda-<hash>.js). Après un nouveau déploiement sur Vercel, l'ancien fichier
 * n'existe plus : un onglet ouvert avant la mise à jour ne peut plus charger la page demandée.
 * On recharge alors l'app une fois pour récupérer le nouvel index.html et ses nouveaux fichiers.
 * Les apps natives chargent leur bundle local et ne sont pas concernées.
 */
const CHUNK_RELOAD_KEY = 'dhb-chunk-reload';

/** Délai minimal entre deux rechargements : empêche une boucle si le fichier manque vraiment. */
const RELOAD_GAP_MS = 15000;

/** Rechargement déjà lancé par cette page (la navigation n'est pas encore partie). */
let reloadPending = false;

/** Messages des navigateurs quand un import dynamique échoue (Chrome, Safari, Firefox, React.lazy). */
export const STALE_CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|is not a valid JavaScript MIME type|Expected the result of a dynamic import/i;

/**
 * Recharge la page une seule fois (au plus une fois toutes les 15 s, horodatage plutôt
 * qu'effacement du repère : une mise à jour plus tard dans la même session sera aussi rattrapée).
 * Hors ligne ou sans sessionStorage, ne fait rien et renvoie faux : l'écran d'erreur s'affiche.
 */
export function reloadOnceForStaleChunk() {
  try {
    if (!navigator.onLine) return false;
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_GAP_MS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  reloadPending = true;
  window.location.reload();
  return true;
}

/**
 * Vrai entre l'appel de `window.location.reload()` et le départ de la page. Quand
 * `vite:preloadError` a été intercepté, l'import résout `undefined` et React.lazy lève en
 * production une TypeError (« Cannot read properties of undefined (reading 'default') ») que
 * le motif ci-dessus ne reconnaît pas : l'ErrorBoundary s'appuie alors sur ce repère.
 */
export function isReloadPending() {
  return reloadPending;
}

/** L'erreur vient-elle d'un fichier de page introuvable ? */
export function isStaleChunkError(error) {
  const message = typeof error === 'string' ? error : error?.message;
  return !!message && STALE_CHUNK_ERROR.test(message);
}
