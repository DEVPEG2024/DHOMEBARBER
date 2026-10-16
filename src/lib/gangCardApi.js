/**
 * Carte Gang : client des routes /gang-card du serveur (lib/gangCard.js, routes/gangCard.js).
 *
 * Forme d'une carte (`card`, null tant que le client n'a aucune visite) :
 * { tier: 'bronze'|'argent'|'or'|'orrare'|'tots'|'icone', tier_label, edition: null|'first'|'anniv'|'drop',
 *   name: 'Yanis K.', photo_url, serial (numéro de collection ou null), pos: 'DÉG'|'BRB'|'RAS'|'CLA'|'COL'|'JR',
 *   score, stats: { FID, REG, PON, STY, GNG, FRA }, visits, first_visit, last_visit (AAAA-MM-JJ),
 *   days_since_last, barber, favorite, next: null | { tier, label, visits_needed, progress (0–100) } }
 * Aucun avantage n'est lié aux niveaux (choix du salon).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, apiUrl } from '@/api/apiClient';

export const GANG_CARD_QUERY_KEY = ['gangCard'];
export const GANG_LEADERBOARD_QUERY_KEY = ['gangLeaderboard'];

/** Niveaux dans l'ordre (le serveur renvoie aussi `tiers` avec leurs règles). */
export const GANG_TIER_ORDER = ['bronze', 'argent', 'or', 'orrare', 'tots', 'icone'];

/** `{ card, seen_tier, level_up, leaderboard_opt_in, tiers }` */
export const fetchGangCard = () => apiRequest('GET', apiUrl('/gang-card/me'));
export const fetchGangLeaderboard = () => apiRequest('GET', apiUrl('/gang-card/leaderboard'));
/** La révélation du niveau a été vue : elle ne repassera plus. */
export const markGangTierSeen = (tier) => apiRequest('POST', apiUrl('/gang-card/seen'), { tier });
/** Apparaître (ou non) dans le classement Team of the Season. */
export const setGangLeaderboardOptIn = (optIn) => apiRequest('PUT', apiUrl('/gang-card/me'), { leaderboard_opt_in: !!optIn });
/** Staff : `{ email: { tier, tier_label, visits } }` pour les fiches de l'agenda. */
export const fetchGangSummaries = (emails) =>
  apiRequest('GET', apiUrl(`/gang-card/summary?emails=${encodeURIComponent(emails.join(','))}`));

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
  return () => {
    queryClient.invalidateQueries({ queryKey: GANG_CARD_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: GANG_LEADERBOARD_QUERY_KEY });
  };
}
