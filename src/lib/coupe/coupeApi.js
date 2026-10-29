/**
 * La Coupe du Gang : client des routes REST `/coupe` du serveur (routes/coupe.js) et drapeau
 * `features.coupe` (contrat : docs/fonctions/coupe-du-gang-contrat.md, sections 2 et 5).
 *
 * Crochets React Query, clés sous le préfixe `['coupe', …]` (une invalidation de `['coupe']`
 * relit tout) :
 *   useCoupeEnabled()              → true | false (drapeau du serveur, faux tant que rien n'est chargé)
 *   useCoupeMe()                   → `GET /coupe/me`
 *   useCoupeLeaderboard(scope)     → `GET /coupe/leaderboard?scope=season|total`
 *   useCoupeBarbers()              → `GET /coupe/barbers` (relu toutes les 30 s)
 *   useCoupeBlocks()               → `GET /coupe/blocks`
 *   useCoupeAdminOverview()        → `GET /coupe/admin/overview` (admin)
 * Envois (promesses) : setCoupeOptIn, setCoupeAvailability, blockCoupePlayer, unblockCoupePlayer,
 * reportCoupePlayer, setCoupeReportStatus. Après un envoi, `invalidateCoupe(queryClient)`.
 */
import { useQuery } from '@tanstack/react-query';
import { API_SERVER_URL, resolvedAppId, apiRequest, apiUrl } from '@/api/apiClient';

export const COUPE_KEY = ['coupe'];
export const COUPE_ENABLED_KEY = ['coupe', 'enabled'];
export const COUPE_ME_KEY = ['coupe', 'me'];
export const coupeLeaderboardKey = (scope) => ['coupe', 'leaderboard', scope === 'total' ? 'total' : 'season'];
export const COUPE_BARBERS_KEY = ['coupe', 'barbers'];
export const COUPE_BLOCKS_KEY = ['coupe', 'blocks'];
export const COUPE_ADMIN_KEY = ['coupe', 'admin'];

/** Adresse publique d'un défi à partager (jamais `window.location.origin` : capacitor://localhost dans les apps). */
export const coupeChallengeUrl = (link) => `https://dhomebarber.fr/coupe?defi=${encodeURIComponent(String(link || ''))}`;

/** Motifs d'un signalement (`POST /coupe/report`). */
export const COUPE_REPORT_REASONS = [
  { value: 'name', label: 'Nom choquant' },
  { value: 'behavior', label: 'Comportement' },
  { value: 'cheating', label: 'Triche' },
  { value: 'other', label: 'Autre' },
];

/** Drapeau du serveur. Ne rejette jamais : en cas d'échec, faux (jeu caché). */
export async function fetchCoupeEnabled() {
  try {
    const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data?.features?.coupe === true;
  } catch {
    return false;
  }
}

/** Le jeu est-il ouvert ? (cache 5 min ; faux tant que rien n'est chargé) */
export function useCoupeEnabled() {
  const { data } = useQuery({
    queryKey: COUPE_ENABLED_KEY,
    queryFn: fetchCoupeEnabled,
    staleTime: 5 * 60 * 1000,
  });
  return data === true;
}

// ─── Lectures ───────────────────────────────────────────────────────

/**
 * `{ season, season_ends_at, eligible, eligible_reason, opt_in,
 *    season_stats: { points, rank, wins, losses, matches },
 *    total_stats: { points, rank, wins, losses, matches },
 *    recent: [{ ended_at, won, cancelled, score: [moi, adversaire], opponent: { name, role }, delta, ranked }] }`
 */
export const fetchCoupeMe = () => apiRequest('GET', apiUrl('/coupe/me'));

/**
 * `{ scope, season, season_ends_at,
 *    rows: [{ rank, key_hash, name, role: 'user'|'barber'|'salon', avatar_url, employee_id, points, wins, losses, matches, me }],
 *    me: { rank, points, wins, losses, matches, opt_in } }`
 */
export const fetchCoupeLeaderboard = (scope = 'season') =>
  apiRequest('GET', apiUrl(`/coupe/leaderboard?scope=${scope === 'total' ? 'total' : 'season'}`));

/** `[{ employee_id, name, photo_url, available, busy }]` */
export const fetchCoupeBarbers = () => apiRequest('GET', apiUrl('/coupe/barbers'));

/** `{ name, role, season_stats, total_stats }` */
export const fetchCoupePlayer = (keyHash) => apiRequest('GET', apiUrl(`/coupe/player/${encodeURIComponent(keyHash)}`));

/** `[{ key_hash, name }]` */
export const fetchCoupeBlocks = () => apiRequest('GET', apiUrl('/coupe/blocks'));

/**
 * Admin : `{ today: { matches, players }, season: { matches, players, ranked },
 *            top_pairs: [{ a, b, matches, ranked }], reports: [{ id, reported_name, reason, details, created_at, status }] }`
 */
export const fetchCoupeAdminOverview = () => apiRequest('GET', apiUrl('/coupe/admin/overview'));

export function useCoupeMe({ enabled = true } = {}) {
  return useQuery({ queryKey: COUPE_ME_KEY, queryFn: fetchCoupeMe, enabled, staleTime: 30 * 1000 });
}

export function useCoupeLeaderboard(scope = 'season', { enabled = true } = {}) {
  return useQuery({
    queryKey: coupeLeaderboardKey(scope),
    queryFn: () => fetchCoupeLeaderboard(scope),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useCoupeBarbers({ enabled = true } = {}) {
  return useQuery({
    queryKey: COUPE_BARBERS_KEY,
    queryFn: fetchCoupeBarbers,
    enabled,
    staleTime: 15 * 1000,
    refetchInterval: enabled ? 30 * 1000 : false,
  });
}

export function useCoupeBlocks({ enabled = true } = {}) {
  return useQuery({ queryKey: COUPE_BLOCKS_KEY, queryFn: fetchCoupeBlocks, enabled, staleTime: 60 * 1000 });
}

export function useCoupeAdminOverview({ enabled = true } = {}) {
  return useQuery({ queryKey: COUPE_ADMIN_KEY, queryFn: fetchCoupeAdminOverview, enabled, staleTime: 30 * 1000 });
}

// ─── Envois ─────────────────────────────────────────────────────────

/** Apparaître (ou non) dans le classement de la Coupe (interrupteur à part de celui de la carte Gang). */
export const setCoupeOptIn = (optIn) => apiRequest('PATCH', apiUrl('/coupe/settings'), { opt_in: !!optIn });

/** Barber : « Dispo pour un match ». */
export const setCoupeAvailability = (available) =>
  apiRequest('PATCH', apiUrl('/coupe/availability'), { available: !!available });

export const blockCoupePlayer = (keyHash) => apiRequest('POST', apiUrl('/coupe/block'), { key_hash: String(keyHash) });
export const unblockCoupePlayer = (keyHash) =>
  apiRequest('DELETE', apiUrl(`/coupe/block/${encodeURIComponent(keyHash)}`));

/** `reason` ∈ COUPE_REPORT_REASONS ; `details` 500 caractères au plus. */
export const reportCoupePlayer = ({ keyHash, roomCode, reason, details }) =>
  apiRequest('POST', apiUrl('/coupe/report'), {
    key_hash: String(keyHash),
    ...(roomCode ? { room_code: String(roomCode) } : {}),
    reason,
    ...(details ? { details: String(details).slice(0, 500) } : {}),
  });

/** Admin : signalement traité (`handled`) ou ignoré (`dismissed`). */
export const setCoupeReportStatus = (id, status) =>
  apiRequest('PATCH', apiUrl(`/coupe/admin/reports/${encodeURIComponent(id)}`), { status });

/** Relit tout ce qui touche à la Coupe (points, classement, barbers, blocages). */
export const invalidateCoupe = (queryClient) => queryClient.invalidateQueries({ queryKey: COUPE_KEY });
