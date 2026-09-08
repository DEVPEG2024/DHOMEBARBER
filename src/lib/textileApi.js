/**
 * Textile & drops : client des routes dédiées du backend (routes/textile.js) et constantes
 * partagées entre la page client (pages/Textile.jsx), la carte de l'accueil et l'admin
 * (pages/admin/AdminTextile.jsx). Les entités génériques (TextileDrop, TextileConcept,
 * TextileReservation) restent accessibles par `api.entities.*` pour l'édition admin.
 */
import { apiRequest, apiUrl } from '@/api/apiClient';

/** Clé React Query de la vue d'ensemble (drops + concepts + « moi »). */
export const TEXTILE_QUERY_KEY = ['textile', 'overview'];

export const fetchTextileOverview = () => apiRequest('GET', apiUrl('/textile/overview'));

export const voteConcept = (conceptId, size) =>
  apiRequest('POST', apiUrl(`/textile/concepts/${conceptId}/vote`), { size: size ?? null });
export const unvoteConcept = (conceptId) =>
  apiRequest('DELETE', apiUrl(`/textile/concepts/${conceptId}/vote`));

export const subscribeDropAlert = (dropId) =>
  apiRequest('POST', apiUrl(`/textile/drops/${dropId}/alert`));
export const unsubscribeDropAlert = (dropId) =>
  apiRequest('DELETE', apiUrl(`/textile/drops/${dropId}/alert`));

export const reserveConcept = (conceptId, { size, quantity }) =>
  apiRequest('POST', apiUrl(`/textile/concepts/${conceptId}/reserve`), { size, quantity });
export const cancelReservation = (reservationId) =>
  apiRequest('POST', apiUrl(`/textile/reservations/${reservationId}/cancel`));

/** Staff : push d'ouverture aux abonnés du drop (ou à tous les clients avec `everyone`). */
export const notifyDrop = (dropId, { everyone = false, message = '' } = {}) =>
  apiRequest('POST', apiUrl(`/textile/drops/${dropId}/notify`), { everyone, message });

// ─── Constantes partagées ───
export const TEXTILE_CATEGORIES = [
  { value: 'tshirt', label: 'T-shirt', emoji: '👕' },
  { value: 'hoodie', label: 'Hoodie', emoji: '🧥' },
  { value: 'sweat', label: 'Sweat', emoji: '🥋' },
  { value: 'cap', label: 'Casquette', emoji: '🧢' },
  { value: 'beanie', label: 'Bonnet', emoji: '🎿' },
  { value: 'jacket', label: 'Veste', emoji: '🧥' },
  { value: 'accessory', label: 'Accessoire', emoji: '🧦' },
];
export const categoryLabel = (value) => TEXTILE_CATEGORIES.find(c => c.value === value)?.label || value || 'Pièce';
export const categoryEmoji = (value) => TEXTILE_CATEGORIES.find(c => c.value === value)?.emoji || '👕';

export const DROP_STATUSES = [
  { value: 'draft', label: 'Brouillon', hint: 'Invisible des clients' },
  { value: 'teasing', label: 'Annoncé', hint: 'Compte à rebours, votes et alertes' },
  { value: 'live', label: 'Ouvert', hint: 'Réservations ouvertes' },
  { value: 'ended', label: 'Terminé', hint: 'Archivé' },
];

export const RESERVATION_STATUSES = [
  { value: 'reserved', label: 'Réservée' },
  { value: 'paid', label: 'Payée' },
  { value: 'picked_up', label: 'Retirée' },
  { value: 'cancelled', label: 'Annulée' },
  { value: 'expired', label: 'Expirée' },
];
export const reservationStatusLabel = (value) => RESERVATION_STATUSES.find(s => s.value === value)?.label || value;
/** Statuts qui « prennent » du stock. */
export const ACTIVE_RESERVATION_STATUSES = ['reserved', 'paid', 'picked_up'];

export const DEFAULT_SIZES = ['S', 'M', 'L', 'XL'];
export const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Unique'];

// ─── Helpers ───
/**
 * Phase d'un drop à l'instant `nowMs` : 'upcoming' (annoncé, avant l'ouverture), 'live', 'ended'
 * ou 'draft'. Le statut serveur fait foi ; le compte à rebours côté client peut atteindre zéro
 * quelques secondes avant que le job serveur ne bascule le statut, d'où `opensSoon`.
 */
export function dropPhase(drop, nowMs = Date.now()) {
  if (!drop) return 'ended';
  if (drop.status === 'draft') return 'draft';
  if (drop.status === 'ended') return 'ended';
  if (drop.status === 'live') return 'live';
  return 'upcoming';
}

/** Millisecondes avant l'ouverture (≥ 0), ou null sans date. */
export function msUntilOpen(drop, nowMs = Date.now()) {
  if (!drop?.starts_at) return null;
  const t = new Date(drop.starts_at).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, t - nowMs);
}

/** Décompose une durée en { days, hours, minutes, seconds } (entiers). */
export function splitDuration(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** « J-3 · 14h » / « 02:14:09 » pour un compte à rebours compact. */
export function formatCountdown(ms) {
  const { days, hours, minutes, seconds } = splitDuration(ms);
  const pad = (n) => String(n).padStart(2, '0');
  if (days > 0) return `J-${days} · ${pad(hours)}h${pad(minutes)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Disponibilité d'une taille : { tracked, remaining, soldOut }.
 * `stock[size]` absent → taille non suivie (illimitée).
 */
export function conceptAvailability(concept, size) {
  const stock = concept?.stock && typeof concept.stock === 'object' ? concept.stock : {};
  const reserved = concept?.reserved && typeof concept.reserved === 'object' ? concept.reserved : {};
  if (size === undefined || size === null) {
    const tracked = Object.keys(stock).length > 0;
    if (!tracked) return { tracked: false, remaining: null, soldOut: false };
    const remaining = Object.entries(stock).reduce((sum, [s, q]) => sum + Math.max(0, (Number(q) || 0) - (Number(reserved[s]) || 0)), 0);
    return { tracked: true, remaining, soldOut: remaining <= 0 };
  }
  if (!(size in stock)) return { tracked: false, remaining: null, soldOut: false };
  const remaining = Math.max(0, (Number(stock[size]) || 0) - (Number(reserved[size]) || 0));
  return { tracked: true, remaining, soldOut: remaining <= 0 };
}

/** Date/heure courte en heure de Paris : « sam. 12 sept. · 18:00 ». */
export function formatDropDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  return `${date} · ${time}`;
}

export const formatPrice = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')}€`;
};
