/*
 * Messages d'erreur des écrans du Snake du Gang, au tutoiement comme tout le jeu ; jamais
 * « Load failed » ni « HTTP 503 ». Jeu coupé par le serveur (`SNAKE=off` : routes en 404
 * `{ code: 'disabled' }`) : « Le Snake fait une pause ».
 */
import { isNetworkError } from '@/components/shared/LoadError';

/** Le Snake est-il coupé par le serveur (`SNAKE=off`) ? */
export const isSnakeClosed = (error) => error?.status === 404 && error?.data?.code === 'disabled';

export const SNAKE_PAUSED_TEXT = 'Le Snake fait une pause : reviens un peu plus tard.';
/** Compte exclu des classements (`banned` de `GET /snake/me`, 403 `banned` de l'interrupteur). */
export const SNAKE_BANNED_TEXT = 'Le salon t’a retiré du classement. Contacte-le si tu penses que c’est une erreur.';

/**
 * Texte d'un envoi raté (interrupteur du classement, score…), pour un toast ou une alerte.
 * Réponse du serveur : son message tel quel (déjà en français, au tutoiement) ; réseau, délai,
 * panne : un texte de l'app.
 */
export function snakeErrorText(err, fallback = 'Ça n’a pas marché : réessaie dans un instant.') {
  if (isSnakeClosed(err)) return SNAKE_PAUSED_TEXT;
  if (err?.data?.code === 'banned' && !err?.data?.error) return SNAKE_BANNED_TEXT;
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
