/**
 * « Les plus demandées » : prestations les plus réservées, calculées par le serveur sur les vrais
 * rendez-vous et publiées dans ses paramètres publics
 * (`GET /api/apps/public/prod/public-settings/by-id/prod` → `popular_services`, tableau d'ids en
 * chaîne, la plus réservée d'abord).
 *
 * Un client ne peut pas les calculer lui-même : le serveur ne lui renvoie que les créneaux des
 * autres, sans leurs prestations. L'ancien repli (premières prestations de `sort_order`) affichait
 * donc un faux « Populaire » : sans liste du serveur, l'app n'affiche plus rien.
 *
 * Ne rejette jamais : champ absent, serveur injoignable ou réponse illisible → `[]`.
 */
import { useQuery } from '@tanstack/react-query';
import { API_SERVER_URL, resolvedAppId } from '@/api/apiClient';

export const POPULAR_SERVICES_QUERY_KEY = ['popularServices', 'public'];
/** Le bloc n'en affiche que 4 ; on garde un peu de marge pour les prestations désactivées. */
const MAX_IDS = 20;
const EMPTY = Object.freeze([]);

/** Ids des prestations les plus réservées (chaînes, sans doublon), `[]` en cas d'échec. */
export async function fetchPopularServiceIds() {
  try {
    const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    const raw = data?.popular_services;
    if (!Array.isArray(raw)) return [];
    const out = [];
    const seen = new Set();
    for (const value of raw) {
      const id = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= MAX_IDS) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Ids des prestations les plus réservées, mis en cache 10 min ; `[]` tant que rien n'est chargé. */
export function usePopularServiceIds() {
  const { data } = useQuery({
    queryKey: POPULAR_SERVICES_QUERY_KEY,
    queryFn: fetchPopularServiceIds,
    staleTime: 10 * 60 * 1000,
  });
  return data ?? EMPTY;
}

export default usePopularServiceIds;
