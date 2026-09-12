/**
 * Utilitaires communs à la page admin « Événements du salon » (pages/admin/AdminSalonEvents.jsx) :
 * clés React Query, invalidation, styles des statuts, agrégats d'invitations, adresse par défaut.
 *
 * Le gabarit visuel (boutons deux taps, pastilles, champs, dates, upload) est celui de l'admin
 * Textile : on le réexporte depuis `components/textile-admin/shared` pour que les composants de ce
 * dossier n'importent que d'ici. Si ces briques sont un jour extraites dans un module commun, ce
 * fichier est le seul à retoucher.
 */
import {
  SALON_EVENTS_QUERY_KEY, SALON_EVENT_STATUSES, INVITE_STATUSES, salonEventStatusLabel, inviteStatusLabel,
} from '@/lib/salonEventsApi';

export {
  TwoTapButton, ActionButton, StatusPill, Spinner, EmptyState, Field, INPUT_CLASS,
  formatParisDateTime, toLocalInputValue, fromLocalInputValue, uploadImageFile, clampInt, formatEuros,
} from '@/components/textile-admin/shared';

// ─── Clés React Query ───
/** Liste admin complète (brouillons compris) : préfixe `salonEvents`, comme la vue client `['salonEvents','mine']`. */
export const EVENTS_KEY = ['salonEvents', 'all'];
/** Toutes les invitations (staff) : sert aux jauges des cartes sans requête par événement. */
export const INVITES_KEY = ['salonEvents', 'invites'];
/** Liste des invités d'un événement (route dédiée /guests). */
export const guestsKey = (eventId) => ['salonEventGuests', eventId];
/** Clients invitables (comptes `role = user`). */
export const CLIENTS_KEY = ['salonEventClients'];

/**
 * Invalide tout ce qui dépend des événements : la liste admin, les invitations agrégées, la vue
 * client (`SALON_EVENTS_QUERY_KEY`, même préfixe `salonEvents`) et la liste des invités de
 * l'événement passé (toutes si aucun id).
 */
export function invalidateSalonEvents(queryClient, eventId) {
  queryClient.invalidateQueries({ queryKey: EVENTS_KEY });
  queryClient.invalidateQueries({ queryKey: INVITES_KEY });
  queryClient.invalidateQueries({ queryKey: SALON_EVENTS_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: eventId ? guestsKey(eventId) : ['salonEventGuests'] });
}

// ─── Statuts ───
export const EVENT_STATUS_STYLES = {
  draft: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25',
  published: 'bg-green-500/15 text-green-400 border-green-500/25',
  cancelled: 'bg-red-500/15 text-red-400 border-red-500/25',
  done: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
};
export const eventStatusLabel = (value) => salonEventStatusLabel(value) || '—';
export const eventStatusHint = (value) => SALON_EVENT_STATUSES.find((s) => s.value === value)?.hint || '';

export const INVITE_STATUS_STYLES = {
  invited: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  accepted: 'bg-green-500/15 text-green-400 border-green-500/25',
  declined: 'bg-red-500/15 text-red-400 border-red-500/25',
};
export const inviteLabel = (value) => inviteStatusLabel(value) || '—';
export { INVITE_STATUSES };

// ─── Adresse du salon (lieu pré-rempli) ───
export const SALON_ADDRESS = 'Sur le côté gauche du bâtiment Odyssée, 3 Rue du Bois Arquet, 74140 Douvaine';

export const MAX_IMAGES = 8;
export const INVITE_MESSAGE_MAX = 300;
export const REMIND_MESSAGE_MAX = 200;

// ─── Agrégats d'invitations ───
export const EMPTY_STATS = Object.freeze({ total: 0, pending: 0, accepted: 0, declined: 0, seats: 0 });

/**
 * Compte les invitations d'une liste (lignes `salon_event_invites`) : total, sans réponse, viennent,
 * ne viennent pas, places prises (somme des `guests` des acceptés — c'est contre cette somme que le
 * serveur compare la capacité).
 */
export function summarizeInvites(invites) {
  const s = { ...EMPTY_STATS };
  (Array.isArray(invites) ? invites : []).forEach((inv) => {
    s.total += 1;
    if (inv.status === 'accepted') {
      s.accepted += 1;
      s.seats += Math.max(1, Number(inv.guests) || 1);
    } else if (inv.status === 'declined') {
      s.declined += 1;
    } else {
      s.pending += 1;
    }
  });
  return s;
}

/** Map event_id → agrégats, à partir de toutes les invitations. */
export function statsByEvent(invites) {
  const groups = new Map();
  (Array.isArray(invites) ? invites : []).forEach((inv) => {
    const key = String(inv.event_id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(inv);
  });
  const out = new Map();
  groups.forEach((list, key) => out.set(key, summarizeInvites(list)));
  return out;
}

// ─── Divers ───
export const plural = (n, one, many = `${one}s`) => (Number(n) === 1 || Number(n) === 0 ? one : many);

/** « 12 clients » / « 1 client » / « 0 client ». */
export const countLabel = (n, one, many) => `${Number(n) || 0} ${plural(n, one, many)}`;

/** Fusionne couverture + galerie en une seule liste dédoublonnée (la première = couverture). */
export function mergeImages(coverUrl, images) {
  const seen = new Set();
  const out = [];
  [coverUrl, ...(Array.isArray(images) ? images : [])].forEach((url) => {
    const u = typeof url === 'string' ? url.trim() : '';
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  });
  return out.slice(0, MAX_IMAGES);
}

/** Nom de fichier sûr pour un export (« soiree-dhb-12-09 »). */
export function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'evenement';
}

/** Téléphone cliquable : espaces retirés. */
export const telHref = (phone) => `tel:${String(phone || '').replace(/\s+/g, '')}`;
