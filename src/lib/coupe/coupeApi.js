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
 *   useCoupeRulesV2()              → règlement v2 annoncé par le serveur (`features.coupeRulesV2`)
 *   useCoupeBlocks()               → `GET /coupe/blocks`
 *   useCoupeAdminOverview()        → `GET /coupe/admin/overview` (admin)
 * Envois (promesses) : setCoupeOptIn, setCoupeChallengeOptIn, setCoupeAvailability, blockCoupePlayer, unblockCoupePlayer,
 * reportCoupePlayer, setCoupeReportStatus, setCoupePlayerBanned, resetCoupePlayer (admin). Après
 * un envoi, `invalidateCoupe(queryClient)`.
 *
 * Tournois (3 nov. 2026, docs/fonctions/coupe-tournois-contrat.md, section 6) :
 *   useCoupeTournamentsFlag()      → true | false (`features.coupe` ET `features.coupeTournaments`)
 *   useCoupeTournamentsFlagQuery() → la requête du drapeau (true, false ou null = illisible)
 *   useTournaments()               → `GET /coupe/tournaments`
 *   useTournament(id)              → `GET /coupe/tournaments/:id` (relu 3 s ou 30 s)
 * Envois : registerTournament, unregisterTournament, checkinTournament, puis
 * `invalidateTournaments(queryClient)`.
 *
 * Spectateurs (4 nov. 2026, docs/fonctions/coupe-spectateurs-contrat.md, section 2) :
 *   useSpectatorsEnabled()         → true | false (`features.coupe` ET `features.coupeSpectators`)
 *   useSpectatorsFlagQuery()       → la requête du drapeau (true, false ou null = illisible)
 *   useCoupeLive({ enabled })      → `GET /coupe/live` (relu toutes les 15 s, page visible)
 * Envoi : setCoupeWatchOptIn (« Laisser regarder mes matchs », `watch_opt_in`), puis
 * `invalidateCoupe(queryClient)`. Liens vers un match regardé : `watchPath` de `./watch.js`.
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
// Drapeau `features.coupeRulesV2` (règlement v2) : sous `enabled` pour la même raison
export const COUPE_RULES_FLAG_KEY = ['coupe', 'enabled', 'rules'];
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

/**
 * Règlement v2 (31 oct. 2026, docs/fonctions/coupe-du-gang-regles-v2-contrat.md, section 8) :
 * premier à 5 buts, balles en feu et électrique, fautes et penalty, événements, but en or. Vrai
 * seulement si le serveur annonce `features.coupeRulesV2` (jeu ouvert et COUPE_RULES_V2 différent
 * de `off`) : un serveur plus ancien, ou la coupure d'urgence, garde la règle d'aujourd'hui (aussi
 * pour les matchs hors ligne). En ligne, c'est le serveur qui décide match par match (`start.rules`).
 * Rejette sur une panne.
 */
export async function fetchCoupeRulesV2() {
  const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
  if (!res.ok) throw new Error(`Paramètres publics : ${res.status}`);
  const data = await res.json();
  return data?.features?.coupeRulesV2 === true;
}

const rulesV2Query = { queryKey: COUPE_RULES_FLAG_KEY, queryFn: fetchCoupeRulesV2, staleTime: 5 * 60 * 1000, retry: 1 };

/** Règlement v2 annoncé ? Faux tant que rien n'est chargé ou si la lecture a échoué. */
export function useCoupeRulesV2() {
  const { data } = useQuery(rulesV2Query);
  return data === true;
}

/**
 * Règlement d'un match hors ligne, lu au lancement (écran de jeu) : la réponse déjà en cache (elle
 * est lue dès l'accueil de la Coupe), sinon une lecture attendue au plus `waitMs` ms (hors
 * connexion, la règle d'aujourd'hui : le jeu sans réseau ne doit jamais attendre le réseau).
 * Rend `{ now: true | false | null, later: Promise<boolean> }` : `now` non nul = sans attente.
 */
export function readCoupeRulesV2(queryClient, { waitMs = 1500 } = {}) {
  const cached = queryClient.getQueryData(COUPE_RULES_FLAG_KEY);
  if (cached === true || cached === false) return { now: cached, later: Promise.resolve(cached) };
  const read = queryClient.fetchQuery({ ...rulesV2Query, retry: 0 }).then((v) => v === true, () => false);
  const timeout = new Promise((resolve) => { setTimeout(() => resolve(false), waitMs); });
  return { now: null, later: Promise.race([read, timeout]) };
}

/** Le jeu est-il ouvert ? Faux tant que rien n'est chargé ou si la lecture a échoué (entrées cachées). */
export function useCoupeEnabled() {
  const { data } = useCoupeFlagQuery();
  return data === true;
}

// ─── Lectures ───────────────────────────────────────────────────────

/**
 * `{ season, season_ends_at, eligible, eligible_reason, opt_in, challenge_opt_in, banned,
 *    watch_opt_in (« Laisser regarder mes matchs » ; absent d'un serveur plus ancien : faux),
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

/**
 * Tout compte (client, barber, admin, compte exclu des classements compris) : « Laisser regarder
 * mes matchs » (`watch_opt_in`) → `{ opt_in, challenge_opt_in, watch_opt_in }`. Un match ordinaire
 * est regardable seulement si les deux joueurs l'ont allumé ; un match de tournoi l'est toujours.
 */
export const setCoupeWatchOptIn = (optIn) =>
  apiRequest('PATCH', apiUrl('/coupe/settings'), { watch_opt_in: !!optIn });

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

// ─── Tournois (docs/fonctions/coupe-tournois-contrat.md, section 6) ──

// Drapeau `features.coupeTournaments` : sous `enabled` pour échapper à invalidateCoupe comme le drapeau du jeu
export const COUPE_TOURNAMENTS_FLAG_KEY = ['coupe', 'enabled', 'tournaments'];
export const COUPE_TOURNAMENTS_KEY = ['coupe', 'tournaments'];
export const COUPE_TOURNAMENTS_LIST_KEY = ['coupe', 'tournaments', 'list'];
export const coupeTournamentKey = (id) => ['coupe', 'tournaments', 'one', String(id || '')];

/** Délais du contrat (section 1) : présence 15 min avant, tirage montré 30 s, 2 min pour rejoindre. */
export const TOURNAMENT_CHECKIN_MS = 15 * 60 * 1000;
export const TOURNAMENT_DRAW_SHOW_MS = 30 * 1000;
export const TOURNAMENT_JOIN_MS = 2 * 60 * 1000;

/** Adresse publique d'un tournoi à partager (jamais `window.location.origin`). */
export const coupeTournamentUrl = (id) => `https://dhomebarber.fr/coupe/tournoi/${encodeURIComponent(String(id || ''))}`;

/**
 * Drapeau des tournois. **Ne rejette jamais** : `true` seulement si le serveur annonce le jeu
 * (`features.coupe`) ET les tournois (`features.coupeTournaments`) ; `false` s'il dit non ;
 * `null` si la lecture a échoué (réseau, réponse non 2xx : illisible). Un serveur plus ancien ne
 * connaît pas les tournois : faux, rien des tournois dans l'app.
 */
export async function fetchCoupeTournamentsEnabled() {
  try {
    const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') return null;
    return data.features?.coupe === true && data.features?.coupeTournaments === true;
  } catch {
    return null;
  }
}

/**
 * Requête du drapeau (cache 5 min). Une lecture illisible (`null`) n'est pas gardée : relue au
 * prochain affichage et toutes les 20 s tant qu'un écran l'utilise (une panne ne cache pas les
 * tournois 5 min).
 */
export function useCoupeTournamentsFlagQuery() {
  return useQuery({
    queryKey: COUPE_TOURNAMENTS_FLAG_KEY,
    queryFn: fetchCoupeTournamentsEnabled,
    staleTime: (q) => (q.state.data == null ? 0 : 5 * 60 * 1000),
    refetchInterval: (q) => (q.state.data == null ? 20 * 1000 : false),
    retry: 0,
  });
}

/** Tournois ouverts ? Faux tant que rien n'est chargé, si le serveur dit non ou si la lecture a échoué. */
export function useCoupeTournamentsFlag() {
  const { data } = useCoupeTournamentsFlagQuery();
  return data === true;
}

/**
 * `{ items: [{ id, name, starts_at, size, status, registered, waiting,
 *              me: { registered, waiting, checked_in } }], server_now }` : à venir et en cours,
 * puis les 10 derniers finis ou annulés.
 */
export const fetchTournaments = () => apiRequest('GET', apiUrl('/coupe/tournaments'));

/**
 * `{ id, name, starts_at, size, status, cancel_reason, drawn_at, finished_at, server_now, checkin_from,
 *    players: [{ key_hash, name, role, me, waiting, checked_in, seed }],
 *    me: { registered, waiting, checked_in, status, match },
 *    rounds: [{ round, label, matches: [{ id, round, slot, p, status, ready_at, forfeit_at, sc, so, winner, reason, live }] }],
 *    champion, runner_up, thirds }` (contrat, section 3.4)
 */
export const fetchTournament = (id) => apiRequest('GET', apiUrl(`/coupe/tournaments/${encodeURIComponent(String(id))}`));

/** Heure du serveur estimée à partir d'une réponse (`server_now`) et de l'instant où elle est arrivée. */
export function serverNowOf(data, receivedAt, now = Date.now()) {
  const server = Date.parse(data?.server_now);
  if (!Number.isFinite(server) || !receivedAt) return now;
  return server + (now - receivedAt);
}

/** Relecture d'un tournoi : 3 s pendant la présence et le tournoi, 30 s sinon (jamais après la fin). */
export function tournamentRefetchMs(data, receivedAt, now = Date.now()) {
  if (!data || typeof data !== 'object') return 30 * 1000;
  if (data.status === 'finished' || data.status === 'cancelled') return false;
  if (data.status === 'running') return 3 * 1000;
  const serverNow = serverNowOf(data, receivedAt, now);
  const starts = Date.parse(data.starts_at);
  const from = Number.isFinite(Date.parse(data.checkin_from)) ? Date.parse(data.checkin_from) : starts - TOURNAMENT_CHECKIN_MS;
  if (Number.isFinite(from) && serverNow >= from) return 3 * 1000;
  // Avant la présence : 30 s, ou juste après son ouverture si elle arrive plus tôt
  if (Number.isFinite(from)) return Math.max(3 * 1000, Math.min(30 * 1000, from - serverNow + 500));
  return 30 * 1000;
}

/** Tournois de l'accueil de la Coupe (relus toutes les 30 s, onglet visible). */
export function useTournaments({ enabled = true } = {}) {
  return useQuery({
    queryKey: COUPE_TOURNAMENTS_LIST_KEY,
    queryFn: fetchTournaments,
    enabled,
    staleTime: 15 * 1000,
    refetchInterval: enabled ? 30 * 1000 : false,
  });
}

/**
 * Un tournoi, relu toutes les 3 s quand la présence est ouverte ou le tournoi en cours, 30 s sinon ;
 * onglet caché : pas de relecture (`refetchIntervalInBackground` faux, défaut de React Query).
 */
export function useTournament(id, { enabled = true } = {}) {
  return useQuery({
    queryKey: coupeTournamentKey(id),
    queryFn: () => fetchTournament(id),
    enabled: enabled && !!id,
    staleTime: 2 * 1000,
    refetchInterval: (q) => tournamentRefetchMs(q.state.data, q.state.dataUpdatedAt),
  });
}

/** S'inscrire (liste d'attente au-delà des places ; pendant la présence, vaut présence) → `{ ok, waiting }`. */
export const registerTournament = (id) =>
  apiRequest('POST', apiUrl(`/coupe/tournaments/${encodeURIComponent(String(id))}/register`), {});

/** Se désinscrire (avant le début) → `{ ok }`. */
export const unregisterTournament = (id) =>
  apiRequest('DELETE', apiUrl(`/coupe/tournaments/${encodeURIComponent(String(id))}/register`));

/** « Je suis là » (15 min avant le début) → `{ ok }`. */
export const checkinTournament = (id) =>
  apiRequest('POST', apiUrl(`/coupe/tournaments/${encodeURIComponent(String(id))}/checkin`), {});

/** Relit la liste et les tournois ouverts (le drapeau reste en cache). */
export const invalidateTournaments = (queryClient) =>
  queryClient.invalidateQueries({ queryKey: COUPE_TOURNAMENTS_KEY });

// ─── Spectateurs (docs/fonctions/coupe-spectateurs-contrat.md, section 2) ──

// Drapeau `features.coupeSpectators` : sous `enabled` pour échapper à invalidateCoupe comme le drapeau du jeu
export const COUPE_SPECTATORS_FLAG_KEY = ['coupe', 'enabled', 'spectators'];
export const COUPE_LIVE_KEY = ['coupe', 'live'];

/**
 * Drapeau des spectateurs. **Ne rejette jamais** : `true` seulement si le serveur annonce le jeu
 * (`features.coupe`) ET les spectateurs (`features.coupeSpectators`, faux avec
 * `COUPE_SPECTATEURS=off` ou `COUPE_WS=off`) ; `false` s'il dit non ; `null` si la lecture a échoué
 * (réseau, réponse non 2xx). Un serveur plus ancien ne connaît pas les spectateurs : faux, rien.
 */
export async function fetchSpectatorsEnabled() {
  try {
    const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') return null;
    return data.features?.coupe === true && data.features?.coupeSpectators === true;
  } catch {
    return null;
  }
}

/**
 * Requête du drapeau (cache 5 min). Une lecture illisible (`null`) n'est pas gardée : relue au
 * prochain affichage et toutes les 20 s tant qu'un écran l'utilise (comme celui des tournois).
 */
export function useSpectatorsFlagQuery() {
  return useQuery({
    queryKey: COUPE_SPECTATORS_FLAG_KEY,
    queryFn: fetchSpectatorsEnabled,
    staleTime: (q) => (q.state.data == null ? 0 : 5 * 60 * 1000),
    refetchInterval: (q) => (q.state.data == null ? 20 * 1000 : false),
    retry: 0,
  });
}

/** Regarder les matchs est-il ouvert ? Faux tant que rien n'est chargé, si le serveur dit non ou si la lecture a échoué. */
export function useSpectatorsEnabled() {
  const { data } = useSpectatorsFlagQuery();
  return data === true;
}

/**
 * `{ server_now, matches: [{ kind: 'tour' | 'room', id, names: [n0, n1], roles: [r0, r1], sc: [a, b],
 *    started_at, watchers, screen, tour: { tid, name, label } | null }] }` : les matchs commencés
 * que ce compte peut regarder (jamais le sien, jamais un joueur bloqué), tournoi d'abord, 20 au plus.
 */
export const fetchLive = () => apiRequest('GET', apiUrl('/coupe/live'));

/**
 * Matchs en direct de l'accueil de la Coupe : relus toutes les 15 s, jamais onglet caché
 * (`refetchIntervalInBackground` faux, défaut de React Query).
 */
export function useCoupeLive({ enabled = true } = {}) {
  return useQuery({
    queryKey: COUPE_LIVE_KEY,
    queryFn: fetchLive,
    enabled,
    staleTime: 10 * 1000,
    refetchInterval: enabled ? 15 * 1000 : false,
    // Un 404 `disabled` (spectateurs coupés pendant que la page est ouverte) ne se réessaie pas
    retry: (n, err) => err?.status !== 404 && n < 1,
  });
}

// ─── Retour du jeu vers le tableau d'un tournoi ──────────────────────
// Le jeu se ferme (Coupe.jsx) : le match quitté est retenu le temps de la session, pour que la page
// du tournoi n'affiche jamais « Jouer mon match » sur ce match avec le tableau d'avant le match
// (cache) : elle attend une relecture faite après le départ (CoupeTournoi.jsx).
const LEFT_TTL_MS = 2 * 60 * 1000;
const leftTournamentMatches = new Map();
const finishedTournamentMatches = new Set();

/** Le jeu a reçu la fin d'un match de tournoi (`onFinished`). */
export function noteTournamentMatchFinished(matchId) {
  if (matchId) finishedTournamentMatches.add(String(matchId));
}

/** Le jeu d'un match de tournoi se ferme (retour au tableau). */
export function noteTournamentMatchLeft(tournamentId, matchId) {
  if (!tournamentId || !matchId) return;
  const mid = String(matchId);
  leftTournamentMatches.set(String(tournamentId), { mid, at: Date.now(), finished: finishedTournamentMatches.has(mid) });
}

/** Dernier match quitté de ce tournoi (`{ mid, at, finished }`, 2 min au plus), ou null. */
export function lastLeftTournamentMatch(tournamentId) {
  const left = leftTournamentMatches.get(String(tournamentId || ''));
  if (!left || Date.now() - left.at > LEFT_TTL_MS) return null;
  return left;
}
