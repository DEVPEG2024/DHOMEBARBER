/**
 * Admin des tournois de La Coupe du Gang : routes `/coupe/admin/tournaments…` (contrat :
 * docs/fonctions/coupe-tournois-contrat.md, section 3.4). Les lectures publiques (`useTournament`,
 * `invalidateTournaments`…) restent dans src/lib/coupe/coupeApi.js.
 *
 * Clé de la liste sous `['coupe', 'tournaments', …]` : `invalidateTournaments` la relit aussi.
 */
import { useQuery } from '@tanstack/react-query';
import { apiRequest, apiUrl } from '@/api/apiClient';
import { TOURNAMENT_CHECKIN_MS } from '@/lib/coupe/coupeApi';

export const COUPE_ADMIN_TOURNAMENTS_KEY = ['coupe', 'tournaments', 'admin'];

const enc = (v) => encodeURIComponent(String(v ?? ''));

/**
 * `{ items: [{ id, name, starts_at, size, status, registered, waiting, me, players_count, present_count }] }`
 */
export const fetchAdminTournaments = () => apiRequest('GET', apiUrl('/coupe/admin/tournaments'));

/**
 * Relecture de la liste : 5 s quand un tournoi est en cours ou dans sa présence (chiffres qui
 * bougent), 30 s sinon. Onglet caché : rien (défaut de React Query).
 */
export function adminListRefetchMs(data, now = Date.now()) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const busy = items.some((t) => {
    if (t?.status === 'running') return true;
    if (t?.status !== 'open') return false;
    const starts = Date.parse(t.starts_at);
    return Number.isFinite(starts) && now >= starts - TOURNAMENT_CHECKIN_MS;
  });
  return busy ? 5 * 1000 : 30 * 1000;
}

export function useAdminTournaments({ enabled = true } = {}) {
  return useQuery({
    queryKey: COUPE_ADMIN_TOURNAMENTS_KEY,
    queryFn: fetchAdminTournaments,
    enabled,
    staleTime: 5 * 1000,
    refetchInterval: (q) => (enabled ? adminListRefetchMs(q.state.data) : false),
  });
}

/** Créer : `{ name, starts_at: 'AAAA-MM-JJTHH:mm' (heure de Paris), size: 8 | 16, notify }` → Tournoi. */
export const createTournament = ({ name, startsAt, size, notify }) =>
  apiRequest('POST', apiUrl('/coupe/admin/tournaments'), {
    name: String(name || '').trim(),
    starts_at: startsAt,
    size: Number(size) === 16 ? 16 : 8,
    notify: !!notify,
  });

/** Modifier le nom ou l'heure (tournoi ouvert seulement) : seuls les champs changés partent. */
export const updateTournament = (id, { name, startsAt } = {}) =>
  apiRequest('PATCH', apiUrl(`/coupe/admin/tournaments/${enc(id)}`), {
    ...(name !== undefined ? { name: String(name).trim() } : {}),
    ...(startsAt !== undefined ? { starts_at: startsAt } : {}),
  });

export const cancelTournament = (id) =>
  apiRequest('POST', apiUrl(`/coupe/admin/tournaments/${enc(id)}/cancel`), {});

/** Forfait déclaré : `side` (0 ou 1) = le joueur qui passe. */
export const declareMatchWinner = (id, matchId, side) =>
  apiRequest('POST', apiUrl(`/coupe/admin/tournaments/${enc(id)}/matches/${enc(matchId)}/winner`), { side: side === 1 ? 1 : 0 });

/** Faire rejouer un match fini (le match suivant n'a pas commencé). */
export const replayMatch = (id, matchId) =>
  apiRequest('POST', apiUrl(`/coupe/admin/tournaments/${enc(id)}/matches/${enc(matchId)}/replay`), {});

/** Retirer un joueur : avant le tirage, sa place ; après, forfait de son match en cours. */
export const removeTournamentPlayer = (id, keyHash) =>
  apiRequest('POST', apiUrl(`/coupe/admin/tournaments/${enc(id)}/players/${enc(keyHash)}/remove`), {});
