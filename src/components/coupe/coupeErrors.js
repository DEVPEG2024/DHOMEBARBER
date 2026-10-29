/*
 * Messages d'erreur des écrans de La Coupe du Gang, au tutoiement comme tout le jeu (jamais
 * « Vérifiez… » à côté de « tes points ») ; jamais « Load failed » ni « HTTP 503 ».
 * Jeu coupé par le serveur (`COUPE_WS=off` : routes en 404 `{ code: 'disabled' }`, contrat,
 * section 2) : « La Coupe fait une pause », pas « Le serveur n'a pas répondu ».
 */
import { isNetworkError } from '@/components/shared/LoadError';

/** La Coupe est-elle coupée par le serveur (`COUPE_WS=off`) ? */
export const isCoupeClosed = (error) => error?.status === 404 && error?.data?.code === 'disabled';

export const COUPE_PAUSED = 'La Coupe fait une pause';
export const COUPE_PAUSED_TEXT = 'La Coupe fait une pause : reviens un peu plus tard.';
/** Compte exclu des classements (`banned` de `GET /coupe/me`, 403 `banned` de l'interrupteur). */
export const COUPE_BANNED_TEXT = 'Le salon t’a retiré du classement. Contacte-le si tu penses que c’est une erreur.';

/**
 * Texte d'un envoi raté (interrupteur, signalement, blocage…), pour un toast ou une alerte.
 * Réponse du serveur : son message tel quel (déjà en français, au tutoiement : « Le salon t'a
 * retiré du classement… » pour un compte exclu) ; réseau, délai, panne : un texte de l'app.
 */
export function coupeErrorText(err, fallback) {
  if (isCoupeClosed(err)) return COUPE_PAUSED_TEXT;
  // Compte exclu sans message du serveur (le serveur en donne un, affiché tel quel)
  if (err?.data?.code === 'banned' && !err?.data?.error) return COUPE_BANNED_TEXT;
  if (isNetworkError(err)) return 'Pas de connexion internet : vérifie ton réseau, puis réessaie.';
  if (err?.timeout) return 'Le serveur met trop de temps à répondre : réessaie dans un instant.';
  const status = err?.status || err?.response?.status;
  const serverMsg = err?.data?.error || err?.data?.message;
  if (status && serverMsg) return String(serverMsg);
  if (status === 429) return 'Trop de demandes : réessaie un peu plus tard.';
  if (status >= 500) return 'Le serveur ne répond pas : réessaie dans un instant.';
  if (!status) return 'Pas de connexion internet : vérifie ton réseau, puis réessaie.';
  return fallback;
}
