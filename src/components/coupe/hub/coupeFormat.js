/**
 * La Coupe du Gang, accueil et classement : petits calculs d'affichage, sans React (saison, rang,
 * fin de saison, initiales, couleur d'un avatar). Toujours l'heure de Paris.
 */
const TZ = 'Europe/Paris';
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' });
const SEASON_RE = /^(\d{4})-(\d{2})$/;

/** Rôles affichés (contrat, section 0) : un client, un barber, le salon (« D'Home Barber »). */
export const ROLE_USER = 'user';
export const ROLE_BARBER = 'barber';
export const ROLE_SALON = 'salon';

/** Niveaux du salon (mode « Contre le salon »), dans l'ordre de difficulté ; `bars` : jauge de 1 à 3. */
export const BOT_LEVELS = [
  { value: 'apprenti', label: 'Apprenti', hint: 'Pour découvrir le jeu', bars: 1 },
  { value: 'barber', label: 'Barber', hint: 'Le salon défend et contre-attaque', bars: 2 },
  { value: 'boss', label: 'Boss', hint: 'Rapide et précis : bon courage', bars: 3 },
];

/** Jour de Paris d'un instant, `AAAA-MM-JJ` (jamais `toISOString()`). */
export function parisDayKey(instant = new Date()) {
  return DAY_KEY.format(instant);
}

/** Saison en cours : mois de Paris, `AAAA-MM`. */
export function currentSeason(now = new Date()) {
  return parisDayKey(now).slice(0, 7);
}

/** « novembre » pour `2026-11` ; '' si illisible. */
export function seasonMonth(season) {
  const m = SEASON_RE.exec(String(season || ''));
  if (!m) return '';
  return MONTH.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)));
}

/** Nombre de jours de calendrier entre deux clés `AAAA-MM-JJ`. */
function daysBetween(fromKey, toKey) {
  const [y1, m1, d1] = fromKey.split('-').map(Number);
  const [y2, m2, d2] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * Jours restants avant la fin de la saison, en jours du calendrier de Paris (une saison = un mois
 * de Paris, elle finit le 1er du mois suivant à minuit) : 1 = elle finit ce soir. La clé de saison
 * d'abord (sans ambiguïté), `season_ends_at` du serveur sinon ; null si rien n'est lisible.
 */
export function seasonDaysLeft({ season, seasonEndsAt }, now = new Date()) {
  let endKey = null;
  const m = SEASON_RE.exec(String(season || ''));
  if (m) {
    // 1er du mois suivant : date du calendrier (UTC sans heure), pas un instant
    endKey = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1)).toISOString().slice(0, 10);
  } else if (seasonEndsAt) {
    const end = new Date(seasonEndsAt);
    if (!Number.isNaN(end.getTime())) endKey = parisDayKey(end);
  }
  if (!endKey) return null;
  return daysBetween(parisDayKey(now), endKey);
}

/** Phrase de fin de saison ; '' quand la saison du serveur est déjà finie ou illisible. */
export function seasonEndText(days) {
  if (days == null || days < 1) return '';
  if (days === 1) return 'Fin de la saison ce soir à minuit.';
  return `Fin de la saison dans ${days} jours.`;
}

/** Suffixe d'un rang : 1er, 2e, 3e… */
export const rankSuffix = (rank) => (Number(rank) === 1 ? 'er' : 'e');

/** Nombre entier affichable (0 pour une valeur absente). */
export const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

/** Initiales d'un nom affiché (« Lucas M. » → « LM »), « ? » si rien de lisible. */
export function initialsOf(name) {
  const letters = String(name || '')
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, '').charAt(0))
    .filter(Boolean);
  return (letters.slice(0, 2).join('') || '?').toUpperCase();
}

// Fonds des avatars sans photo, choisis d'après la clé publique du joueur : gris et rouges très
// sombres du thème stade (ni vert ni bleu), initiales blanches lisibles sur chacun (≥ 11:1)
const AVATAR_TONES = ['#2a2b2f', '#3a1517', '#34363b', '#4a1c1f', '#232427', '#3e2022'];

export function avatarTone(seed) {
  let h = 0;
  for (const c of String(seed || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/** Rôle d'un compte connecté, au sens du classement (l'admin joue sous « D'Home Barber »). */
export function roleOfUser(user) {
  if (user?.role === 'admin') return ROLE_SALON;
  if (user?.role === 'barber') return ROLE_BARBER;
  return ROLE_USER;
}

/**
 * La Coupe est-elle coupée par le serveur (`COUPE_WS=off`) ? Les routes répondent alors
 * 404 `{ code: 'disabled' }` (contrat, section 2).
 */
export { isCoupeClosed } from '../coupeErrors';

/** Arrivée directe (lien, notification) ou page précédente dans l'app ? */
export const hasAppHistory = () => (typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0);

/** Page d'arrivée du rôle (bouton « Retour » quand on est arrivé ici directement). */
export function homeFor(user) {
  if (user?.role === 'admin') return '/admin';
  if (user?.role === 'barber') return '/admin/me';
  return '/';
}
