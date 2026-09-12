/**
 * Événements du salon (organisés PAR le salon, sur invitation ou ouverts aux clients) : client des
 * routes dédiées `routes/salonEvents.js` et constantes partagées entre la page Événements, la carte
 * de l'accueil et l'admin. Distinct des privatisations (`Event`, demandes des clients).
 */
import { apiRequest, apiUrl } from '@/api/apiClient';

export const SALON_EVENTS_QUERY_KEY = ['salonEvents', 'mine'];

export const fetchMySalonEvents = () => apiRequest('GET', apiUrl('/salon-events/mine'));

export const rsvpSalonEvent = (eventId, { status, guests = 1 }) =>
  apiRequest('POST', apiUrl(`/salon-events/${eventId}/rsvp`), { status, guests });

/** Staff : invitations (liste d'emails ou tous les clients) avec message facultatif. */
export const inviteToSalonEvent = (eventId, { emails = [], all = false, message = '' } = {}) =>
  apiRequest('POST', apiUrl(`/salon-events/${eventId}/invite`), { emails, all, message });

export const fetchSalonEventGuests = (eventId) => apiRequest('GET', apiUrl(`/salon-events/${eventId}/guests`));

export const remindSalonEvent = (eventId, { audience = 'accepted', message = '' } = {}) =>
  apiRequest('POST', apiUrl(`/salon-events/${eventId}/remind`), { audience, message });

// ─── Constantes ───
export const SALON_EVENT_STATUSES = [
  { value: 'draft', label: 'Brouillon', hint: 'Invisible des clients' },
  { value: 'published', label: 'Publié', hint: 'Visible des invités (ou de tous si ouvert)' },
  { value: 'cancelled', label: 'Annulé', hint: 'Les invités sont prévenus' },
  { value: 'done', label: 'Terminé', hint: 'Archivé' },
];
export const salonEventStatusLabel = (v) => SALON_EVENT_STATUSES.find(s => s.value === v)?.label || v;

export const SALON_EVENT_VISIBILITIES = [
  { value: 'invite', label: 'Sur invitation', hint: 'Seuls les clients invités le voient' },
  { value: 'public', label: 'Ouvert à tous', hint: 'Tous les clients le voient et peuvent s\'inscrire' },
];

export const INVITE_STATUSES = [
  { value: 'invited', label: 'Invité' },
  { value: 'accepted', label: 'Vient' },
  { value: 'declined', label: 'Ne vient pas' },
];
export const inviteStatusLabel = (v) => INVITE_STATUSES.find(s => s.value === v)?.label || v;

export const MAX_GUESTS = 4;

// ─── Helpers ───
export const isFree = (event) => !(Number(event?.price) > 0);

export const formatPrice = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 'Offert';
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')}€`;
};

/** « sam. 12 sept. · 19:00 » (heure de Paris) ; avec `withYear`, ajoute l'année. */
export function formatEventDate(iso, { withYear = false, long = false } = {}) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('fr-FR', {
    weekday: long ? 'long' : 'short', day: 'numeric', month: long ? 'long' : 'short',
    ...(withYear ? { year: 'numeric' } : {}), timeZone: 'Europe/Paris',
  });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  return `${date} · ${time}`;
}

/** 'upcoming' | 'today' | 'past' | 'cancelled' | 'draft' selon le statut et la date. */
export function eventPhase(event, nowMs = Date.now()) {
  if (!event) return 'past';
  if (event.status === 'cancelled') return 'cancelled';
  if (event.status === 'draft') return 'draft';
  if (event.status === 'done') return 'past';
  const t = new Date(event.starts_at).getTime();
  if (Number.isNaN(t)) return 'upcoming';
  const end = event.ends_at ? new Date(event.ends_at).getTime() : t + 3 * 3600 * 1000;
  if (end < nowMs) return 'past';
  const sameDay = new Date(t).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
    === new Date(nowMs).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  return sameDay ? 'today' : 'upcoming';
}

/** Places restantes : null si illimité. */
export function spotsLeft(event) {
  if (event?.spots_left !== undefined) return event.spots_left;
  if (!event?.capacity) return null;
  return Math.max(0, Number(event.capacity) - (Number(event.accepted_count) || 0));
}
