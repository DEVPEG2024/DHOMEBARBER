/**
 * Bugs et suggestions des clients (entité `Feedback`, table `feedbacks`, voir
 * `docs/backend-feedback.md`). Le client envoie depuis Paramètres et suit ses envois ; l'admin
 * traite tout sur /admin/feedback (statut, réponse envoyée au client par push).
 */
import { api } from '@/api/apiClient';
import { isNative, platform } from '@/lib/capacitor';

export const FEEDBACK_QUERY_KEY = ['feedback'];
export const FEEDBACK_ADMIN_QUERY_KEY = ['feedback', 'all'];

export const MESSAGE_MAX = 2000;

export const FEEDBACK_TYPES = {
  bug: { label: 'Bug', title: 'Signaler un bug', emoji: '🐞', placeholder: 'Que s’est-il passé ? Qu’attendais-tu à la place ?' },
  idea: { label: 'Suggestion', title: 'Proposer une amélioration', emoji: '💡', placeholder: 'Ton idée pour rendre l’app encore meilleure…' },
};

export const FEEDBACK_STATUSES = {
  new: { label: 'Reçu', className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  in_progress: { label: 'En cours', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  done: { label: 'Traité', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  dismissed: { label: 'Classé', className: 'bg-white/10 text-muted-foreground border-white/15' },
};

/** Endroit de l'app concerné (facultatif) : aide l'admin à reproduire un bug. */
export const FEEDBACK_AREAS = [
  { value: '', label: 'Je ne sais pas / partout' },
  { value: 'home', label: 'Accueil' },
  { value: 'booking', label: 'Réservation' },
  { value: 'appointments', label: 'Mes rendez-vous' },
  { value: 'shop', label: 'Boutique' },
  { value: 'feed', label: 'Fil du Gang' },
  { value: 'textile', label: 'Textile & Drops' },
  { value: 'gift-cards', label: 'Cartes cadeau' },
  { value: 'partners', label: 'Bons plans' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'account', label: 'Compte / connexion' },
  { value: 'other', label: 'Autre' },
];

export const areaLabel = (value) => FEEDBACK_AREAS.find(a => a.value === value)?.label || null;

/** Le serveur ne connaît pas encore l'entité (backend pas déployé). */
export const isBackendMissing = (err) => err?.status === 400 || err?.status === 404;

export async function fetchMyFeedback() {
  try {
    return await api.entities.Feedback.list('-created_at', 50);
  } catch (err) {
    if (isBackendMissing(err)) return [];
    throw err;
  }
}

export const fetchAllFeedback = () => api.entities.Feedback.list('-created_at', 500);

/** Contexte technique joint à l'envoi : plateforme, version de l'app, écran, navigateur. */
export async function collectContext() {
  const context = {
    platform,
    screen: typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : null,
    user_agent: typeof navigator !== 'undefined' ? String(navigator.userAgent).slice(0, 300) : null,
  };
  if (isNative) {
    try {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      context.app_version = `${info.version} (${info.build})`;
    } catch { /* plugin indisponible */ }
  } else {
    context.app_version = 'web';
  }
  return context;
}

export function formatFeedbackDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' });
}
