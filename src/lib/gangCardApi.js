/**
 * Carte Gang : client des routes /gang-card du serveur (lib/gangCard.js, routes/gangCard.js).
 *
 * `GET /gang-card/me` → `{ card, seen_tier, level_up, leaderboard_opt_in, tiers, seen_badges, new_badges }`
 *   - `seen_badges` : clés des écussons déjà montés au client (animation passée)
 *   - `new_badges`  : écussons débloqués et pas encore vus → animation `GangBadgeUnlock` (GangLevelUp)
 *
 * Forme d'une carte (`card`, null tant que le client n'a aucune visite) :
 * { tier: 'bronze'|'argent'|'or'|'orrare'|'tots'|'icone', tier_label,
 *   edition: null|'anniv'|'halloween'|'noel'|'fete_peres'|'ete'|'first'|'drop'
 *            (priorité anniv > saison > first > drop, décidée par le serveur à la date de Paris),
 *   name: 'Yanis K.', photo_url, serial (numéro de collection ou null), pos: 'DÉG'|'BRB'|'RAS'|'CLA'|'COL'|'JR',
 *   score, stats: { FID, REG, PON, STY, GNG, FRA }, visits, first_visit, last_visit (AAAA-MM-JJ),
 *   days_since_last, barber, favorite, next: null | { tier, label, visits_needed, progress (0–100) },
 *   badges: [{ key, emoji, label, description, unlocked, progress: { current, target } | null }] }
 * `badges` est la liste COMPLÈTE dans un ordre fixe (verrouillés compris) : premiere_coupe,
 * premiere_barbe, degrade_10, fidele_barber, leve_tot, anniv_salon, drop.
 * Aucun avantage n'est lié aux niveaux ni aux écussons (choix du salon).
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, apiUrl } from '@/api/apiClient';

export const GANG_CARD_QUERY_KEY = ['gangCard'];
export const GANG_LEADERBOARD_QUERY_KEY = ['gangLeaderboard'];

/** Niveaux dans l'ordre (le serveur renvoie aussi `tiers` avec leurs règles). */
export const GANG_TIER_ORDER = ['bronze', 'argent', 'or', 'orrare', 'tots', 'icone'];

/** `{ card, seen_tier, level_up, leaderboard_opt_in, tiers }` */
export const fetchGangCard = () => apiRequest('GET', apiUrl('/gang-card/me'));
export const fetchGangLeaderboard = () => apiRequest('GET', apiUrl('/gang-card/leaderboard'));
/**
 * Révélation vue : niveau et / ou écussons (clés), fusionnés côté serveur dans
 * `users.gang_seen_tier` / `users.gang_seen_badges`. Au moins l'un des deux, sinon 400.
 */
export function markGangSeen({ tier, badges } = {}) {
  const body = {};
  if (tier) body.tier = tier;
  if (Array.isArray(badges) && badges.length) body.badges = badges.map(String);
  if (!body.tier && !body.badges) return Promise.resolve(null);
  return apiRequest('POST', apiUrl('/gang-card/seen'), body);
}
/** La révélation du niveau a été vue : elle ne repassera plus. */
export const markGangTierSeen = (tier) => markGangSeen({ tier });
/** Apparaître (ou non) dans le classement Team of the Season. */
export const setGangLeaderboardOptIn = (optIn) => apiRequest('PUT', apiUrl('/gang-card/me'), { leaderboard_opt_in: !!optIn });
/** Staff : `{ email: { tier, tier_label, visits } }` pour les fiches de l'agenda. */
export const fetchGangSummaries = (emails) =>
  apiRequest('GET', apiUrl(`/gang-card/summary?emails=${encodeURIComponent(emails.join(','))}`));

/**
 * Admin : vue d'ensemble des cartes (`GET /gang-card/admin/overview`, admin seulement)
 * { generated_at, season: { since, days: 90 },
 *   totals: { clients, with_card, by_tier: { bronze, argent, or, orrare, tots, icone } },
 *   fading: [{ user_id, email, name, full_name, phone, tier, tier_label, visits, days_since_last,
 *              last_visit, barber, barber_id, nudged_at }],   // ≥ 3 visites, ≥ 35 j sans venir, 50 max
 *   top_season: [{ email, name, full_name, tier, tier_label, season_visits, visits }],   // 10 max
 *   badges: { premiere_coupe: n, … } }
 */
export const GANG_ADMIN_OVERVIEW_QUERY_KEY = ['gangAdminOverview'];
export const fetchGangAdminOverview = () => apiRequest('GET', apiUrl('/gang-card/admin/overview'));
/**
 * Admin : relance push « Ta carte Gang perd de la fraîcheur » → `{ sent, devices, nudged_at }`
 * (`devices` = 0 : le client n'a pas activé les notifications). 409 si relancé il y a moins de 7 jours.
 */
export const nudgeGangClient = (email) => apiRequest('POST', apiUrl('/gang-card/admin/nudge'), { email });

export function useGangAdminOverview({ enabled = true } = {}) {
  return useQuery({
    queryKey: GANG_ADMIN_OVERVIEW_QUERY_KEY,
    queryFn: fetchGangAdminOverview,
    enabled,
    staleTime: 60 * 1000,
  });
}

/** Clés des écussons, dans l'ordre fixe du serveur. */
export const GANG_BADGE_ORDER = ['premiere_coupe', 'premiere_barbe', 'degrade_10', 'fidele_barber', 'leve_tot', 'anniv_salon', 'drop'];
/** Libellés de repli (l'admin ne reçoit que des comptes par clé). */
export const GANG_BADGE_INFO = {
  premiere_coupe: { emoji: '🎉', label: 'Première coupe' },
  premiere_barbe: { emoji: '🧔', label: 'Première barbe' },
  degrade_10: { emoji: '✂️', label: '10 dégradés' },
  fidele_barber: { emoji: '💈', label: 'Fidèle d’un barber' },
  leve_tot: { emoji: '🌅', label: 'Lève-tôt' },
  anniv_salon: { emoji: '🎂', label: 'Anniversaire au salon' },
  drop: { emoji: '👕', label: 'Drop' },
};

/**
 * Éditions de saison (contrat §2) : libellé et dernier jour inclus, pour le bandeau de la page.
 * Le serveur décide seul si l'édition est active ; ici on ne fait qu'afficher la fin.
 */
export const GANG_SEASONS = {
  halloween: { label: 'Halloween', code: 'HWN' },
  noel: { label: 'Noël', code: 'XMAS' },
  fete_peres: { label: 'Fête des pères', code: 'PAPA' },
  ete: { label: 'Été', code: 'SUN' },
};
export const isGangSeason = (edition) => !!GANG_SEASONS[edition];

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dayLabel = (d, m) => `${d === 1 ? '1er' : d} ${MONTHS[m - 1]}`;

/** « jusqu'au 1er novembre » pour une édition de saison (année courante à Paris), null sinon. */
export function gangSeasonUntil(edition, now = new Date()) {
  if (!isGangSeason(edition)) return null;
  if (edition === 'halloween') return dayLabel(1, 11);
  if (edition === 'noel') return dayLabel(31, 12);
  if (edition === 'ete') return dayLabel(30, 6);
  // Fête des pères : 3e dimanche de juin (le dimanche clôt l'édition)
  let year = now.getFullYear();
  try {
    year = Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric' }).format(now)) || year;
  } catch { /* année locale */ }
  const firstDow = new Date(Date.UTC(year, 5, 1)).getUTCDay(); // 0 = dimanche
  const firstSunday = 1 + ((7 - firstDow) % 7);
  return dayLabel(firstSunday + 14, 6);
}

/** Carte du compte connecté (clients). Ne rejette pas l'interface : `isError` à gérer par l'écran. */
export function useGangCard({ enabled = true } = {}) {
  return useQuery({ queryKey: GANG_CARD_QUERY_KEY, queryFn: fetchGangCard, enabled, staleTime: 60 * 1000 });
}

export function useGangLeaderboard({ enabled = true } = {}) {
  return useQuery({ queryKey: GANG_LEADERBOARD_QUERY_KEY, queryFn: fetchGangLeaderboard, enabled, staleTime: 5 * 60 * 1000 });
}

/** Staff : niveaux de plusieurs clients, une requête (≤ 100 emails). */
export function useGangSummaries(emails, { enabled = true } = {}) {
  const list = [...new Set((emails || []).filter(Boolean).map((e) => String(e).toLowerCase()))].sort().slice(0, 100);
  return useQuery({
    queryKey: ['gangSummaries', ...list],
    queryFn: () => fetchGangSummaries(list),
    enabled: enabled && list.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/** Invalide la carte et le classement (après une visite, un choix de classement…). */
export function useInvalidateGang() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: GANG_CARD_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: GANG_LEADERBOARD_QUERY_KEY });
  }, [queryClient]);
}
