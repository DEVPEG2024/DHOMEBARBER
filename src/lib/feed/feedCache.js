/**
 * Fil v2 : mise à jour du cache React Query d'une publication partout où elle est affichée (pages
 * de chaque filtre, publication seule), pour les gestes affichés tout de suite (réaction, vote,
 * commentaire) et leur retour en arrière si le serveur refuse.
 *
 * Usage d'un geste optimiste :
 *   const undo = updateFeedItem(qc, id, (it) => applyReaction(it, '🔥'));
 *   try { const r = await reactToPost(id, '🔥'); updateFeedItem(qc, id, (it) => ({ ...it, ...r })); }
 *   catch (e) { undo(); toast.error(…); }
 */
import { FEED_KEYS } from '@/lib/feed/feedApi';
import { patchPages, removeFromPages, prependToPages } from '@/lib/feed/rules';

const isListKey = (key) => Array.isArray(key) && key[0] === 'feed' && key[1] === 'list';

/**
 * Applique `fn` à la publication `postId` dans tous les caches du fil. Rend une fonction qui remet
 * exactement les données d'avant (retour en arrière si le serveur refuse).
 */
export function updateFeedItem(queryClient, postId, fn) {
  const saved = [];
  for (const [key, data] of queryClient.getQueriesData({ queryKey: FEED_KEYS.all })) {
    if (!data) continue;
    if (isListKey(key)) {
      const next = patchPages(data, postId, fn);
      if (next !== data) {
        saved.push([key, data]);
        queryClient.setQueryData(key, next);
      }
    } else if (key[1] === 'post' && key[2] === String(postId) && data.item) {
      saved.push([key, data]);
      queryClient.setQueryData(key, { ...data, item: fn(data.item) });
    }
  }
  return () => { for (const [key, data] of saved) queryClient.setQueryData(key, data); };
}

/** Retire la publication de toutes les pages (supprimée, auteur bloqué). */
export function removeFeedItem(queryClient, postId) {
  for (const [key, data] of queryClient.getQueriesData({ queryKey: FEED_KEYS.all })) {
    if (data && isListKey(key)) queryClient.setQueryData(key, removeFromPages(data, postId));
  }
  queryClient.removeQueries({ queryKey: FEED_KEYS.post(postId) });
}

/** Publication qu'on vient d'écrire : en tête du fil « Tout » (et du filtre donné), sans attendre. */
export function prependFeedItem(queryClient, item, filters = ['all']) {
  for (const f of filters) {
    const key = FEED_KEYS.list(f);
    const data = queryClient.getQueryData(key);
    if (data) queryClient.setQueryData(key, prependToPages(data, item));
  }
}

/** Relit tout le fil (pages, publication seule, commentaires, activité, non-lus). */
export function invalidateFeed(queryClient) {
  return queryClient.invalidateQueries({ queryKey: FEED_KEYS.all });
}
