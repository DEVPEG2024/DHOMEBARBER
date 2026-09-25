/**
 * « Les bons plans du Gang » : partenaires du salon (commerces, restos, salles de sport…) et leurs
 * offres réservées aux clients, éventuellement un pourcentage sur certaines de leurs prestations.
 * Entité générique `Partner` (table `partners`, voir docs/backend-partners.md) : lecture publique
 * des partenaires actifs, écriture réservée à l'admin.
 */
import { api } from '@/api/apiClient';

export const PARTNERS_QUERY_KEY = ['partners'];
export const PARTNERS_ADMIN_QUERY_KEY = ['partners', 'all'];

export const PARTNER_CATEGORIES = [
  { value: 'food', label: 'Restos & cafés', emoji: '🍔' },
  { value: 'sport', label: 'Sport', emoji: '🏋️' },
  { value: 'style', label: 'Mode & style', emoji: '👟' },
  { value: 'beauty', label: 'Bien-être', emoji: '💆' },
  { value: 'auto', label: 'Auto & moto', emoji: '🚗' },
  { value: 'leisure', label: 'Loisirs', emoji: '🎮' },
  { value: 'services', label: 'Services', emoji: '🛠️' },
  { value: 'other', label: 'Autre', emoji: '✨' },
];
export const partnerCategory = (value) =>
  PARTNER_CATEGORIES.find(c => c.value === value) || PARTNER_CATEGORIES[PARTNER_CATEGORIES.length - 1];

export const MAX_OFFERS = 8;

/**
 * Tant que le serveur ne connaît pas l'entité (backend pas encore déployé : 400 / 404), la section
 * se comporte comme vide au lieu d'afficher une erreur aux clients.
 */
function emptyIfUnknown(err) {
  if (err?.status === 400 || err?.status === 404) return [];
  throw err;
}

export const fetchPartners = () =>
  api.entities.Partner.filter({ is_active: true }, 'sort_order', 100).catch(emptyIfUnknown);

export const fetchAllPartners = () => api.entities.Partner.list('sort_order', 200);

// ─── Helpers ───

/** Pourcentage exploitable (1..100) ou null : une offre peut ne pas en avoir (« café offert »). */
export function offerPercent(offer) {
  const n = Math.round(Number(offer?.percent));
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
}

export function partnerOffers(partner) {
  return (Array.isArray(partner?.offers) ? partner.offers : []).filter(o => o && String(o.title || '').trim());
}

/** Meilleure réduction du partenaire, pour le badge « jusqu'à -20 % ». */
export function bestPercent(partner) {
  return partnerOffers(partner).reduce((best, o) => Math.max(best, offerPercent(o) || 0), 0) || null;
}

/** `valid_until` (YYYY-MM-DD) dépassée, comparée à la date du jour à Paris. */
export function isExpired(partner, now = new Date()) {
  if (!partner?.valid_until) return false;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now);
  return String(partner.valid_until).slice(0, 10) < today;
}

export function formatValidUntil(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Partenaires visibles côté client : actifs, non expirés, mis en avant d'abord puis `sort_order`. */
export function visiblePartners(partners) {
  return (Array.isArray(partners) ? partners : [])
    .filter(p => p && p.is_active !== false && !isExpired(p))
    .sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/** Lien externe sûr : https ajouté si absent, tout autre schéma refusé. */
export function safeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/** « @compte », « instagram.com/compte » ou URL complète → URL du profil Instagram. */
export function instagramUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/instagram\.com/i.test(raw)) return safeUrl(raw);
  const handle = raw.replace(/^@/, '').replace(/[^\w.]/g, '');
  return handle ? `https://instagram.com/${handle}` : '';
}

export const mapsUrl = (address) =>
  address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : '';

export const telUrl = (phone) => {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
};

/** Initiales pour la pastille quand le partenaire n'a pas de logo. */
export const partnerInitials = (name) =>
  String(name || '?').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
