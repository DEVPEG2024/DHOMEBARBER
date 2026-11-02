/**
 * Snake du Gang : client des routes REST `/snake` du serveur (routes/snake.js) et drapeau
 * `features.snake` (contrat : docs/fonctions/snake-du-gang-contrat.md, sections 2 et 4).
 *
 * Crochets React Query, clés sous le préfixe `['snake', …]` (une invalidation de `['snake']` relit
 * tout, sauf le drapeau : `invalidateSnake`) :
 *   useSnakeFlagQuery()          → requête du drapeau (garde des routes, page Jeux)
 *   useSnakeEnabled()            → true | false (faux tant que rien n'est chargé)
 *   useSnakeMe()                 → `GET /snake/me`
 *   useSnakeLeaderboard(season)  → `GET /snake/leaderboard?season=YYYY-MM` (mois en cours sans `season`)
 * Envois (promesses) : startSnakeGame, finishSnakeGame, setSnakeOptIn.
 */
import { useQuery } from '@tanstack/react-query';
import { API_SERVER_URL, resolvedAppId, apiRequest, apiUrl } from '@/api/apiClient';
import { SNAKE_RULES } from './engine';

export const SNAKE_KEY = ['snake'];
export const SNAKE_ENABLED_KEY = ['snake', 'enabled'];
export const SNAKE_ME_KEY = ['snake', 'me'];
export const snakeLeaderboardKey = (season) => ['snake', 'leaderboard', season || 'current'];

/** Adresse publique du jeu, pour un partage (jamais `window.location.origin` : capacitor://localhost dans les apps). */
export const SNAKE_PUBLIC_URL = 'https://dhomebarber.fr/snake';

/**
 * Drapeau du serveur. **Rejette** sur une panne (réseau, réponse non 2xx) : seule une réponse qui
 * dit faux vaut « jeu fermé » (même règle que la Coupe).
 */
export async function fetchSnakeEnabled() {
  const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
  if (!res.ok) throw new Error(`Paramètres publics : ${res.status}`);
  const data = await res.json();
  return data?.features?.snake === true;
}

/** Requête du drapeau (cache 5 min) : `{ data, isLoading, isError, refetch }`. */
export function useSnakeFlagQuery() {
  return useQuery({
    queryKey: SNAKE_ENABLED_KEY,
    queryFn: fetchSnakeEnabled,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

/** Le jeu est-il ouvert ? Faux tant que rien n'est chargé ou si la lecture a échoué (entrées cachées). */
export function useSnakeEnabled() {
  const { data } = useSnakeFlagQuery();
  return data === true;
}

// ─── Lectures ───────────────────────────────────────────────────────

/**
 * `{ season, season_ends_at, opt_in, rankable, banned,
 *    record: { score, level, eaten, at } | null, season_best: { … } | null,
 *    rank, players, games }`
 */
export const fetchSnakeMe = () => apiRequest('GET', apiUrl('/snake/me'));

/**
 * `{ season, season_ends_at, players,
 *    rows: [{ rank, name, role: 'user'|'barber', score, level, me }], me: { rank, score, level } | null, opt_in }`
 */
export const fetchSnakeLeaderboard = (season) =>
  apiRequest('GET', apiUrl(`/snake/leaderboard${season ? `?season=${encodeURIComponent(season)}` : ''}`));

export function useSnakeMe({ enabled = true } = {}) {
  return useQuery({ queryKey: SNAKE_ME_KEY, queryFn: fetchSnakeMe, enabled, staleTime: 30 * 1000 });
}

export function useSnakeLeaderboard(season, { enabled = true } = {}) {
  return useQuery({
    queryKey: snakeLeaderboardKey(season),
    queryFn: () => fetchSnakeLeaderboard(season),
    enabled,
    staleTime: 60 * 1000,
  });
}

// ─── Envois ─────────────────────────────────────────────────────────

/**
 * Ticket de partie → `{ id, seed, level, rules, expires_at }`. Envoie la version des règles du
 * moteur de ce bundle : un serveur aux autres règles répond 409 `update_required` (partie jouée
 * sans classement, jamais un rejeu avec le mauvais moteur).
 */
export const startSnakeGame = (level) => apiRequest('POST', apiUrl('/snake/games'), { level, rules: SNAKE_RULES });

/**
 * Fin de partie → `{ score, eaten, bonuses, level, ranked, record, previous_record, season_best,
 * rank, players, duplicate? }`. Les mêmes données peuvent être renvoyées après une erreur réseau
 * (même id) : le serveur rend la même réponse.
 * @param {string} id  ticket de `startSnakeGame`
 * @param {{ moves: number[], ticks: number, end: 'bite'|'full'|'quit', score: number }} result
 */
export const finishSnakeGame = (id, { moves, ticks, end, score }) =>
  apiRequest('POST', apiUrl(`/snake/games/${encodeURIComponent(id)}/finish`), { moves, ticks, end, score });

/** Figurer (ou non) au classement du Snake → `{ opt_in }`. */
export const setSnakeOptIn = (optIn) => apiRequest('PATCH', apiUrl('/snake/settings'), { opt_in: !!optIn });

/** Relit tout ce qui touche au Snake (record, classement), **sauf le drapeau**. */
export const invalidateSnake = (queryClient) =>
  queryClient.invalidateQueries({ queryKey: SNAKE_KEY, predicate: (q) => q.queryKey[1] !== 'enabled' });
