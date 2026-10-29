/**
 * La Coupe du Gang : client des routes REST `/coupe` du serveur (routes/coupe.js) et drapeau
 * `features.coupe` (contrat : docs/fonctions/coupe-du-gang-contrat.md, sections 2 et 5).
 *
 * Crochets React Query, clés sous le préfixe `['coupe', …]` (une invalidation de `['coupe']`
 * relit tout) :
 *   useCoupeEnabled()              → true | false (drapeau du serveur, faux tant que rien n'est chargé)
 *   useCoupeMe()                   → `GET /coupe/me`
 *   useCoupeLeaderboard(scope)     → `GET /coupe/leaderboard?scope=season|total`
 *   useCoupeFlagQuery()            → requête du drapeau (chargement, erreur) pour la garde de `/coupe`
 *   useCoupeBarbers({ poll })      → `GET /coupe/barbers` (relu toutes les 30 s avec `poll`)
 *   useCoupePlayersEnabled()       → liste « Défier un joueur » connue du serveur (`features.coupePlayers`)
 *   useCoupePlayers({ poll })      → `GET /coupe/players` (relu toutes les 30 s avec `poll`)
 *   useCoupeBlocks()               → `GET /coupe/blocks`
 *   useCoupeAdminOverview()        → `GET /coupe/admin/overview` (admin)
 * Envois (promesses) : setCoupeOptIn, setCoupeChallengeOptIn, setCoupeAvailability, blockCoupePlayer, unblockCoupePlayer,
 * reportCoupePlayer, setCoupeReportStatus, setCoupePlayerBanned, resetCoupePlayer (admin). Après
 * un envoi, `invalidateCoupe(queryClient)`.
 */
import { useQuery } from '@tanstack/react-query';
import { API_SERVER_URL, resolvedAppId, apiRequest, apiUrl } from '@/api/apiClient';

export const COUPE_KEY = ['coupe'];
export const COUPE_ENABLED_KEY = ['coupe', 'enabled'];
export const COUPE_ME_KEY = ['coupe', 'me'];
export const coupeLeaderboardKey = (scope) => ['coupe', 'leaderboard', scope === 'total' ? 'total' : 'season'];
export const COUPE_BARBERS_KEY = ['coupe', 'barbers'];
export const COUPE_PLAYERS_KEY = ['coupe', 'players'];
// Drapeau `features.coupePlayers` : sous `enabled` pour échapper à invalidateCoupe comme le drapeau du jeu
export const COUPE_PLAYERS_FLAG_KEY = ['coupe', 'enabled', 'players'];
export const COUPE_BLOCKS_KEY = ['coupe', 'blocks'];
export const COUPE_ADMIN_KEY = ['coupe', 'admin'];
export const COUPE_MUSIC_KEY = ['coupe', 'music'];

/** Adresse publique d'un défi à partager (jamais `window.location.origin` : capacitor://localhost dans les apps). */
export const coupeChallengeUrl = (link) => `https://dhomebarber.fr/coupe?defi=${encodeURIComponent(String(link || ''))}`;

/** Motifs d'un signalement (`POST /coupe/report`). */
export const COUPE_REPORT_REASONS = [
  { value: 'name', label: 'Nom choquant' },
  { value: 'behavior', label: 'Comportement' },
  { value: 'cheating', label: 'Triche' },
  { value: 'other', label: 'Autre' },
];

/**
 * Drapeau du serveur. **Rejette** sur une panne (réseau, réponse non 2xx) : seule une réponse qui dit
 * faux vaut « jeu fermé ». Avant, une panne valait faux et restait 5 min en cache : un lien de défi
 * ouvert pendant un 503 renvoyait à l'accueil sans un mot et le jeu disparaissait partout.
 */
export async function fetchCoupeEnabled() {
  const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
  if (!res.ok) throw new Error(`Paramètres publics : ${res.status}`);
  const data = await res.json();
  return data?.features?.coupe === true;
}

/** Requête du drapeau (cache 5 min) : `{ data, isLoading, isError, refetch }` pour la garde de `/coupe`. */
export function useCoupeFlagQuery() {
  return useQuery({
    queryKey: COUPE_ENABLED_KEY,
    queryFn: fetchCoupeEnabled,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

/**
 * Musique de tribune pendant le jeu (`features.coupeMusic`) : coupée côté serveur par
 * COUPE_MUSIC=off, sans nouveau build des apps. Vraie sauf si le serveur dit faux (un serveur plus
 * ancien ne la connaît pas). Rejette sur une panne.
 */
export async function fetchCoupeMusic() {
  const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
  if (!res.ok) throw new Error(`Paramètres publics : ${res.status}`);
  const data = await res.json();
  return data?.features?.coupeMusic !== false;
}

/** Musique permise ? Faux tant que rien n'est chargé ou si la lecture a échoué. */
export function useCoupeMusic() {
  const { data } = useQuery({ queryKey: COUPE_MUSIC_KEY, queryFn: fetchCoupeMusic, staleTime: 5 * 60 * 1000, retry: 1 });
  return data === true;
}

/**
 * Liste « Défier un joueur » (29 oct. 2026) : vraie seulement si le serveur annonce
 * `features.coupePlayers` (un serveur plus ancien n'a ni la liste ni le défi par `key_hash`).
 * Rejette sur une panne.
 */
export async function fetchCoupePlayersEnabled() {
  const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
  if (!res.ok) throw new Error(`Paramètres publics : ${res.status}`);
  const data = await res.json();
  return data?.features?.coupePlayers === true;
}

/** Liste des joueurs à défier proposée ? Faux tant que rien n'est chargé ou si la lecture a échoué. */
export function useCoupePlayersEnabled() {
  const { data } = useQuery({ queryKey: COUPE_PLAYERS_FLAG_KEY, queryFn: fetchCoupePlayersEnabled, staleTime: 5 * 60 * 1000, retry: 1 });
  return data === true;
}

/** Le jeu est-il ouvert ? Faux tant que rien n'est chargé ou si la lecture a échoué (entrées cachées). */
export function useCoupeEnabled() {
  const { data } = useCoupeFlagQuery();
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

/**
 * Liste « Défier un joueur » : `[{ key_hash, name, photo_url, reachable }]`, les clients qui ont
 * accepté d'y figurer, joignables d'abord (`reachable` : le défi les préviendra maintenant).
 */
export const fetchCoupePlayers = () => apiRequest('GET', apiUrl('/coupe/players'));

/** `{ name, role, season_stats, total_stats }` */
export const fetchCoupePlayer = (keyHash) => apiRequest('GET', apiUrl(`/coupe/player/${encodeURIComponent(keyHash)}`));

/** `[{ key_hash, name }]` */
export const fetchCoupeBlocks = () => apiRequest('GET', apiUrl('/coupe/blocks'));

/**
 * Admin : `{ today: { matches, players }, season: { matches, players, ranked },
 *            top_pairs: [{ a, b, matches, ranked }],
 *            reports: [{ id, reported_name, reason, details, created_at, status,
 *                        reported_user_id, reported_email, reported_key_hash, reported_banned? }] }`
 * (`reported_*` : compte signalé, null pour un compte supprimé ; `reported_key_hash` sert aux
 * actions Exclure / Réintégrer / Remettre à zéro)
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

/** `poll` : relire toutes les 30 s (accueil de la Coupe seulement ; ailleurs une lecture suffit). */
export function useCoupeBarbers({ enabled = true, poll = false } = {}) {
  return useQuery({
    queryKey: COUPE_BARBERS_KEY,
    queryFn: fetchCoupeBarbers,
    enabled,
    staleTime: 15 * 1000,
    refetchInterval: enabled && poll ? 30 * 1000 : false,
  });
}

/** `poll` : relire toutes les 30 s (accueil de la Coupe : « joignable » change pendant qu'on regarde). */
export function useCoupePlayers({ enabled = true, poll = false } = {}) {
  return useQuery({
    queryKey: COUPE_PLAYERS_KEY,
    queryFn: fetchCoupePlayers,
    enabled,
    staleTime: 15 * 1000,
    refetchInterval: enabled && poll ? 30 * 1000 : false,
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

/** Client : figurer (ou non) dans la liste « Défier un joueur » → `{ opt_in, challenge_opt_in }`. */
export const setCoupeChallengeOptIn = (optIn) =>
  apiRequest('PATCH', apiUrl('/coupe/settings'), { challenge_opt_in: !!optIn });

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

/**
 * Admin : exclure un joueur de tous les classements de la Coupe (`banned` vrai) ou l'y réintégrer
 * (contrat, section 7 : `POST` / `DELETE /coupe/admin/players/:keyHash/ban`) → `{ ok: true }`.
 */
export const setCoupePlayerBanned = (keyHash, banned) =>
  apiRequest(banned ? 'POST' : 'DELETE', apiUrl(`/coupe/admin/players/${encodeURIComponent(keyHash)}/ban`), banned ? {} : undefined);

/** Admin : points de la saison et du classement général remis à zéro → `{ ok: true }`. */
export const resetCoupePlayer = (keyHash) =>
  apiRequest('POST', apiUrl(`/coupe/admin/players/${encodeURIComponent(keyHash)}/reset`), {});

/**
 * Relit tout ce qui touche à la Coupe (points, classement, barbers, blocages), **sauf le drapeau** :
 * une relecture ratée en fin de match cachait le jeu partout.
 */
export const invalidateCoupe = (queryClient) =>
  queryClient.invalidateQueries({ queryKey: COUPE_KEY, predicate: (q) => q.queryKey[1] !== 'enabled' });
