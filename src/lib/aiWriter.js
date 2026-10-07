/**
 * Assistant IA de rédaction des notifications (Admin → Notifications) : Claude rédige trois
 * propositions à partir d'une consigne, ou retouche le titre et le message en place.
 * Voir dhomebarber-api/lib/aiWriter.js. Activé seulement si le serveur est configuré
 * (clé Anthropic) : `features.aiWriter` des paramètres publics.
 */
import { API_SERVER_URL, resolvedAppId, apiRequest, apiUrl } from '@/api/apiClient';

/** Retouches proposées sur un message existant (clés partagées avec le serveur). */
export const AI_REWRITES = [
  { key: 'improve', label: 'Améliorer' },
  { key: 'shorter', label: 'Plus court' },
  { key: 'warmer', label: 'Plus chaleureux' },
  { key: 'fun', label: 'Plus fun' },
  { key: 'pro', label: 'Plus sobre' },
  { key: 'fix', label: 'Corriger les fautes' },
];

let availablePromise = null;

/** L'assistant est-il activé sur le serveur ? (mémorisé pour la session) */
export function aiWriterAvailable() {
  if (!availablePromise) {
    availablePromise = fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => !!data?.features?.aiWriter)
      .catch(() => false);
  }
  return availablePromise;
}

/**
 * `write` : `{ mode: 'write', brief, address, audience }` → trois propositions ;
 * `rewrite` : `{ mode: 'rewrite', style, subject, message, address, audience }` → une proposition.
 * Résout `[{ subject, message }]` ; en cas d'échec, l'erreur porte le message du serveur.
 */
export async function draftNotification(payload) {
  const data = await apiRequest('POST', apiUrl('/ai/notification-draft'), payload);
  return Array.isArray(data?.proposals) ? data.proposals : [];
}
