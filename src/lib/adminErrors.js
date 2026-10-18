import { isNetworkError } from '@/components/shared/LoadError';

/**
 * Message d'erreur des écrans admin (Textile, Événements du salon, Bons plans) : jamais « Load
 * failed », « Failed to fetch » ni « HTTP 500 ». Pour un envoi de notification (`sending`), une
 * coupure réseau ne veut pas dire que rien n'est parti : on le dit, sinon un second envoi faisait
 * recevoir le push deux fois aux clients.
 *
 *   toast.error(adminErrorMessage(err, 'Enregistrement impossible'));
 */
export function adminErrorMessage(err, fallback, { sending = false } = {}) {
  if (isNetworkError(err) || err?.timeout || (!err?.status && err?.name === 'TypeError')) {
    return sending
      ? "Pas de connexion internet : l'envoi a peut-être déjà eu lieu. Vérifiez avant de renvoyer (les clients le recevraient deux fois)."
      : 'Pas de connexion internet : vérifiez le réseau puis réessayez.';
  }
  const msg = typeof err?.message === 'string' ? err.message.trim() : '';
  if (msg && !/^HTTP \d+/.test(msg)) return msg;
  return fallback;
}

/** Vrai si l'échec d'un envoi vient du réseau (envoi peut-être passé : avertir, ne rien réinitialiser). */
export const isUncertainSend = (err) => isNetworkError(err) || !!err?.timeout || (!err?.status && err?.name === 'TypeError');
