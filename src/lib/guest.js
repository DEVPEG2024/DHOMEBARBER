/**
 * Réservation pour un proche sans compte (fils, frère, père…), demande du salon du 24 oct. 2026.
 *
 * Le rendez-vous reste sur le compte du parent (email, téléphone, rappels, annulation, carte Gang)
 * et porte le prénom de la personne qui vient : `appointments.guest_name` (NULL = le titulaire).
 * Mêmes écriture, contrôle et comparaison que `dhomebarber-api/lib/guestName.js`.
 *
 * Le serveur annonce `features.guestBooking` quand il accepte la colonne. Tant que le drapeau est
 * absent (serveur pas encore déployé), « Pour qui ? » n'apparaît pas et rien n'est envoyé.
 */
import { useQuery } from '@tanstack/react-query';
import { API_SERVER_URL, resolvedAppId } from '@/api/apiClient';
import { hasObjectionableName, OBJECTIONABLE_MESSAGE } from '@/lib/contentFilter';

export const GUEST_NAME_MAX = 40;
// Lettres (accents compris), espaces, trait d'union, apostrophe et point ; ni chiffre ni @
const GUEST_NAME_RE = /^\p{L}[\p{L}\p{M}' .-]*$/u;
/** Proches proposés en raccourci (« Pour qui ? »), les plus récents d'abord. */
const KNOWN_GUESTS_MAX = 6;

/** Prénom tapé, nettoyé comme le serveur (espaces réduits, apostrophe droite) ; '' si vide. */
export function normalizeGuestName(value) {
  return String(value ?? '').normalize('NFC').replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * Message d'erreur du prénom d'un proche, ou `null` s'il est accepté (même règle que le serveur).
 * `filter: false` pour l'équipe (le serveur ne lui applique pas le filtre des noms).
 */
export function guestNameError(value, { filter = true } = {}) {
  const s = normalizeGuestName(value);
  if (!s) return 'Indiquez le prénom de votre proche.';
  if ([...s].length > GUEST_NAME_MAX) return `${GUEST_NAME_MAX} caractères au plus.`;
  if (!GUEST_NAME_RE.test(s)) return 'Lettres seulement (ni chiffre ni symbole).';
  if (filter && hasObjectionableName(s)) return OBJECTIONABLE_MESSAGE;
  return null;
}

/** Clé de comparaison : « Léo », « leo » et « LÉO » sont la même personne ; '' = le titulaire. */
export function guestKey(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

export function samePerson(a, b) {
  return guestKey(a) === guestKey(b);
}

/** Prénom du proche d'un rendez-vous, ou '' (rendez-vous du titulaire). */
export function guestOf(apt) {
  return apt && typeof apt.guest_name === 'string' ? apt.guest_name.trim() : '';
}

/** « de Léo », « d'Antoine », « d'Hugo » (élision devant une voyelle ou un h). */
export function ofName(name) {
  const s = String(name || '').trim();
  return /^[aeiouyhàâäéèêëîïôöùûüœæ]/i.test(s) ? `d'${s}` : `de ${s}`;
}

/** Nom montré à l'équipe : « Léo (Marc Dupont) » ; sans proche, le nom du client (même texte que les pushs du serveur). */
export function staffClientLabel(apt, fallback = 'Client') {
  const guest = guestOf(apt);
  const client = String(apt?.client_name || '').trim();
  if (!guest) return client || fallback;
  return client ? `${guest} (${client})` : guest;
}

/** Nom court des cartes de l'agenda et de l'accueil du barber : « Léo (Marc) ». */
export function agendaClientName(apt, fallback = 'Client') {
  const guest = guestOf(apt);
  const client = String(apt?.client_name || '').trim();
  if (!guest) return client || fallback;
  const first = client.split(/\s+/)[0];
  return first ? `${guest} (${first})` : guest;
}

/**
 * Proches déjà venus avec ce compte (rendez-vous chargés de Mes rendez-vous), les plus récents
 * d'abord, sans doublon (« Léo » et « leo » : le plus récent garde son écriture).
 */
export function knownGuests(appointments) {
  const seen = new Set();
  const out = [];
  const sorted = [...(appointments || [])]
    .filter(a => guestOf(a))
    .sort((a, b) => `${b.date || ''} ${b.start_time || ''}`.localeCompare(`${a.date || ''} ${a.start_time || ''}`));
  for (const apt of sorted) {
    const name = guestOf(apt);
    const key = guestKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= KNOWN_GUESTS_MAX) break;
  }
  return out;
}

export const GUEST_FEATURES_QUERY_KEY = ['guestFeatures'];

/** Drapeau du serveur. Ne rejette jamais : en cas d'échec, éteint. */
export async function fetchGuestBooking() {
  try {
    const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data?.features?.guestBooking === true;
  } catch {
    return false;
  }
}

/** « Pour qui ? » proposé : drapeau mis en cache 5 min, éteint tant que rien n'est chargé. */
export function useGuestBooking() {
  const { data } = useQuery({
    queryKey: GUEST_FEATURES_QUERY_KEY,
    queryFn: fetchGuestBooking,
    staleTime: 5 * 60 * 1000,
  });
  return data === true;
}
