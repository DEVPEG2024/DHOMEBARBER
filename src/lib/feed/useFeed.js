/**
 * Fil « New Gang » v2 (30 oct. 2026) : publications du fil et gestes (réagir, voter, supprimer).
 * Contrat : docs/fonctions/fil-new-gang-contrat.md, section 5.
 *
 *   const feed = useFeed('all', { focusId });
 *   feed.items, feed.query, feed.fetchNextPage, feed.hasNextPage, feed.isFetchingNextPage,
 *   feed.react(item, '🔥' | null), feed.vote(item, 'a'), feed.remove(item), feed.legacy
 *
 * Deux sources selon le drapeau du serveur (`features.feedV2`, `useFeedV2Query`) :
 * - vrai : `GET /feed` par curseur (`FEED_KEYS.list(filter)`), une publication = un `item` complet ;
 * - faux (serveur plus ancien) : l'ancien fil par les entités Post / PostLike / PostComment, assemblé
 *   par `legacyItem` (sans formats, réponses, ❤️ de commentaire ni activité) ;
 * - drapeau en chargement : chargement ; drapeau en échec : `query` en échec (LoadError, jamais
 *   l'ancien fil par erreur).
 *
 * Réagir et voter s'affichent tout de suite (`updateFeedItem`), le serveur confirme derrière ; refus
 * → retour à l'état d'avant et toast. Un geste à la fois par publication (pas de doublon d'envoi).
 * Publications Last Minute : seulement tant que le créneau est libre (`lastMinuteSlot` posé sur
 * l'item, comme la carte de l'accueil).
 */
import { useCallback, useMemo, useRef } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiRequest, apiUrl } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { isNetworkError } from '@/components/shared/LoadError';
import { fetchPublicBarbers } from '@/lib/publicBarbers';
import { lastMinutePostStillOpen, lastMinuteSlotOfPost, useOpenLastMinutes } from '@/lib/lastMinute';
import {
  FEED_KEYS, useFeedV2Query, fetchFeedPage, fetchFeedPost, reactToPost, votePoll,
} from '@/lib/feed/feedApi';
import { updateFeedItem, removeFeedItem } from '@/lib/feed/feedCache';
import { applyReaction, applyVote, itemsOfPages, legacyItem, safeReaction } from '@/lib/feed/rules';

/**
 * Message à afficher pour une erreur d'API : celui du serveur s'il en donne un, sinon le repli.
 * Jamais « Load failed » ni « HTTP 500 » (vouvoiement des messages d'erreur génériques).
 */
export function feedErrorText(err, fallback) {
  if (isNetworkError(err)) return 'Pas de connexion internet. Réessayez dans un instant.';
  if (err?.timeout) return 'Le serveur met trop de temps à répondre. Réessayez dans un instant.';
  // Erreur de programmation (TypeError…) : son texte anglais n'a rien à faire à l'écran
  if (err && err.name && err.name !== 'Error' && !err.status) return fallback;
  const msg = err?.message;
  return msg && !/^HTTP \d+$/.test(msg) ? msg : fallback;
}

// ─── Ancien fil (serveur sans `features.feedV2`) ───

// 20 publications par page (`skip` = OFFSET côté serveur)
const LEGACY_PAGE_SIZE = 20;
// Le filtre `post_id IN (...)` part dans l'URL : découpé pour ne pas fabriquer une adresse démesurée
const ID_CHUNK = 60;
const lower = (v) => String(v || '').toLowerCase();

/** Réactions / commentaires des seules publications affichées. */
async function fetchForPosts(entity, postIds, sort, perPost) {
  const groups = [];
  for (let i = 0; i < postIds.length; i += ID_CHUNK) groups.push(postIds.slice(i, i + ID_CHUNK));
  const results = await Promise.all(
    groups.map((ids) => entity.filter({ post_id: ids }, sort, Math.min(2000, ids.length * perPost))),
  );
  return results.flat();
}

function groupByPost(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const k = String(r.post_id);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

/** Ma ligne PostLike remplacée (ou retirée) dans la liste en cache : affichage immédiat. */
function patchLegacyLikes(rows, item, emoji, user) {
  const mine = String(item.my_like_id || '');
  const out = (rows || []).filter((l) => !(mine && String(l.id) === mine));
  if (emoji) {
    out.unshift({
      id: item.my_like_id || `tmp-${item.id}`,
      post_id: item.id,
      user_key: user?.public_key || undefined,
      user_email: user?.email,
      reaction: emoji,
    });
  }
  return out;
}

function useLegacyFeed(enabled, user) {
  const qc = useQueryClient();
  const postsQuery = useInfiniteQuery({
    queryKey: ['posts'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.entities.Post.list('-created_at', LEGACY_PAGE_SIZE, pageParam),
    // On ne s'arrête que sur une page vide : le serveur retire les auteurs bloqués APRÈS l'OFFSET,
    // une page de 19 n'est donc pas forcément la dernière
    getNextPageParam: (lastPage, allPages) => (lastPage?.length ? allPages.length * LEGACY_PAGE_SIZE : undefined),
    enabled,
  });

  // Une publication arrivée pendant le défilement décale l'OFFSET : première occurrence gardée
  const posts = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const p of postsQuery.data?.pages.flat() ?? []) {
      const k = String(p.id);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    return out;
  }, [postsQuery.data]);

  const postIds = useMemo(() => posts.map((p) => p.id), [posts]);
  const idsKey = postIds.join(',');
  const likesKey = useMemo(() => ['postLikes', idsKey], [idsKey]);

  const likesQuery = useQuery({
    queryKey: likesKey,
    queryFn: () => fetchForPosts(api.entities.PostLike, postIds, '-created_at', 30),
    enabled: enabled && postIds.length > 0,
    placeholderData: (prev) => prev,
  });
  const commentsQuery = useQuery({
    queryKey: ['postComments', idsKey],
    queryFn: () => fetchForPosts(api.entities.PostComment, postIds, 'created_at', 25),
    enabled: enabled && postIds.length > 0,
    placeholderData: (prev) => prev,
  });
  // Seulement MES blocages (le serveur filtre déjà par blocker_email, admin compris)
  const blocksQuery = useQuery({
    queryKey: ['userBlocks'],
    queryFn: () => api.entities.UserBlock.list('-created_at', 200),
    enabled: enabled && !!user,
  });
  // Admin : nombre de clients qui ont vu chaque publication (mesure d'audience)
  const viewIds = enabled && user?.role === 'admin' ? postIds.map(String).slice(0, 200) : [];
  const viewsQuery = useQuery({
    queryKey: ['postViewCounts', viewIds.join(',')],
    enabled: viewIds.length > 0,
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const data = await apiRequest('GET', apiUrl(`/analytics/post-views?ids=${viewIds.join(',')}`));
      return data?.counts || {};
    },
  });

  // En échec sans donnée : jamais « aucune réaction » (un tap créerait un doublon refusé)
  const likesFailed = likesQuery.isError && !likesQuery.data;
  const commentsFailed = commentsQuery.isError && !commentsQuery.data;

  const items = useMemo(() => {
    if (!enabled) return [];
    const myEmail = lower(user?.email);
    const blocks = (blocksQuery.data ?? []).filter((b) => lower(b.blocker_email) === myEmail);
    // Blocages par clé publique (l'email n'est plus renvoyé aux clients), email en repli
    const blockedKeys = new Set(blocks.map((b) => b.blocked_key).filter(Boolean));
    const blockedEmails = new Set(blocks.map((b) => lower(b.blocked_email)).filter(Boolean));
    const isBlocked = (row) => (!!row.author_key && blockedKeys.has(row.author_key))
      || (!!row.author_email && blockedEmails.has(lower(row.author_email)));
    const likes = groupByPost(likesQuery.data);
    const comments = groupByPost((commentsQuery.data ?? []).filter((c) => !isBlocked(c)));
    const views = viewsQuery.data;
    return posts.filter((p) => !isBlocked(p)).map((p) => {
      const id = String(p.id);
      const it = legacyItem(p, likes.get(id), comments.get(id), user);
      return {
        ...it,
        views: views ? (views[id]?.clients ?? 0) : null,
        reactions_pending: !likesQuery.data && !likesFailed,
        reactions_unavailable: likesFailed,
        comments_unavailable: commentsFailed,
      };
    });
  }, [enabled, user, posts, likesQuery.data, commentsQuery.data, blocksQuery.data, viewsQuery.data, likesFailed, commentsFailed]);

  // Réaction : pas encore de réaction → création ; `null` → retrait ; autre emoji → changement
  // (PostLike.update : `UNIQUE(post_id, user_email)` interdit une seconde ligne)
  const react = useCallback(async (item, emoji) => {
    // Réactions non chargées : impossible de savoir si j'ai déjà réagi, on recharge d'abord
    if (!likesQuery.data) { if (likesFailed) likesQuery.refetch(); return false; }
    if (String(item.my_like_id || '').startsWith('tmp-')) return false;
    const before = likesQuery.data;
    qc.setQueryData(likesKey, patchLegacyLikes(before, item, emoji, user));
    try {
      if (!emoji) { if (item.my_like_id) await api.entities.PostLike.delete(item.my_like_id); }
      else if (item.my_like_id) await api.entities.PostLike.update(item.my_like_id, { reaction: emoji });
      else await api.entities.PostLike.create({ post_id: item.id, user_email: user.email, reaction: emoji });
      return true;
    } catch (err) {
      qc.setQueryData(likesKey, before);
      // Ma réaction existait déjà (liste pas à jour) : pas de « Cet élément existe déjà »
      if (err?.status === 409 && !item.my_like_id) toast('Ta réaction était déjà enregistrée');
      else if (!(err?.status === 404 && !emoji)) toast.error(feedErrorText(err, "Impossible d'enregistrer ta réaction"));
      return false;
    } finally {
      // Succès comme échec : on resynchronise, et on attend pour qu'un tap suivant parte de l'état à jour
      await qc.invalidateQueries({ queryKey: ['postLikes'] }).catch(() => {});
    }
  }, [qc, likesKey, likesQuery, likesFailed, user]);

  return {
    query: postsQuery,
    items,
    react,
    retryReactions: likesQuery.refetch,
    retryComments: commentsQuery.refetch,
    reactionsRetrying: likesQuery.isFetching,
    commentsRetrying: commentsQuery.isFetching,
  };
}

// ─── Fil v2 ───

/** `fn` seulement si aucun geste `key` n'est en cours (sinon `false`, rien n'est envoyé). */
async function runOnce(set, key, fn) {
  if (set.has(key)) return false;
  set.add(key);
  try { return await fn(); } finally { set.delete(key); }
}

const reactionFields = (it) => ({ reactions: it.reactions || {}, reactions_total: it.reactions_total || 0, my_reaction: it.my_reaction || null });

/**
 * @param {'all'|'salon'|'looks'|'polls'} filter
 * @param {{ focusId?: string|null, onGone?: (id: string) => void }} [opts]
 *   `focusId` : publication montrée seule en tête (`?post=<id>`) ; `onGone` : appelée quand une
 *   publication n'existe plus (supprimée, 404 sur un geste), AVANT qu'elle sorte du cache (la page
 *   vide alors son focus : ni roue ni second toast)
 */
export function useFeed(filter = 'all', { focusId = null, onGone = null } = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const goneRef = useRef(onGone);
  goneRef.current = onGone;
  const flag = useFeedV2Query();
  const v2 = flag.data === true;
  const legacy = flag.data === false;

  const v2Query = useInfiniteQuery({
    queryKey: FEED_KEYS.list(filter),
    queryFn: ({ pageParam }) => fetchFeedPage({ cursor: pageParam, filter }),
    initialPageParam: null,
    getNextPageParam: (last) => last?.next_cursor || undefined,
    enabled: v2,
  });
  const old = useLegacyFeed(legacy, user);

  const focusQuery = useQuery({
    queryKey: FEED_KEYS.post(focusId || ''),
    queryFn: () => fetchFeedPost(focusId),
    enabled: v2 && !!focusId,
    // Publication supprimée ou auteur bloqué (404) : inutile de réessayer
    retry: (n, err) => err?.status !== 404 && n < 1,
  });

  const rawItems = useMemo(
    () => (v2 ? itemsOfPages(v2Query.data) : legacy ? old.items : []),
    [v2, legacy, v2Query.data, old.items],
  );
  const rawFocus = v2
    ? focusQuery.data?.item || null
    : (focusId && rawItems.find((it) => String(it.id) === String(focusId))) || null;

  // Publications Last Minute : seulement tant que le créneau est à venir et libre. La liste des
  // créneaux libres de l'accueil (relue chaque minute, et tout de suite après une réservation)
  // retire aussi la carte d'un créneau pris entre-temps
  const hasLastMinute = rawItems.some((it) => it.kind === 'last_minute') || rawFocus?.kind === 'last_minute';
  const openLastMinutes = useOpenLastMinutes({ enabled: hasLastMinute });
  const employeesQuery = useQuery({
    queryKey: ['employees'],
    staleTime: 5 * 60 * 1000,
    queryFn: fetchPublicBarbers,
  });
  const employees = useMemo(() => employeesQuery.data || [], [employeesQuery.data]);
  const { openIds, complete, now: lastMinuteNow } = openLastMinutes;

  const items = useMemo(() => {
    const open = { openIds, complete };
    const out = [];
    for (const it of rawItems) {
      if (it.kind !== 'last_minute') { out.push(it); continue; }
      const slot = lastMinutePostStillOpen(it, open) ? lastMinuteSlotOfPost(it, employees, lastMinuteNow) : null;
      if (slot) out.push({ ...it, lastMinuteSlot: slot });
    }
    return out;
  }, [rawItems, openIds, complete, employees, lastMinuteNow]);

  // Publication ouverte par un lien : même règle que la liste pour un Last Minute (créneau pris,
  // commencé ou d'un autre jour : jamais « Réserver »), `focusClosed` pour le dire à la page
  const focusSlot = useMemo(() => {
    if (!rawFocus || rawFocus.kind !== 'last_minute') return null;
    return lastMinutePostStillOpen(rawFocus, { openIds, complete })
      ? lastMinuteSlotOfPost(rawFocus, employees, lastMinuteNow) : null;
  }, [rawFocus, openIds, complete, employees, lastMinuteNow]);
  // Barbers pas encore lus : rien ne se décide (sans eux aucun créneau n'est « ouvert »)
  const focusIsLastMinute = !!rawFocus && rawFocus.kind === 'last_minute';
  const focusPending = focusIsLastMinute && !focusSlot && !employeesQuery.isSuccess && !employeesQuery.isError;
  const focusClosed = focusIsLastMinute && !focusSlot && !focusPending;
  const focusedItem = useMemo(() => {
    if (!rawFocus || (rawFocus.kind === 'last_minute' && !focusSlot)) return null;
    return rawFocus.kind === 'last_minute' ? { ...rawFocus, lastMinuteSlot: focusSlot } : rawFocus;
  }, [rawFocus, focusSlot]);

  // Publication disparue : la page d'abord (focus vidé), le cache ensuite
  const dropItem = useCallback((id) => {
    goneRef.current?.(String(id));
    removeFeedItem(qc, id);
  }, [qc]);

  // ─── Gestes ───

  // Un geste à la fois par publication : un second tap pendant l'envoi créerait un doublon
  const busy = useRef(new Set());

  const oldReact = old.react;
  const react = useCallback((item, emoji) => {
    if (!item || !user) return Promise.resolve(false);
    const next = emoji ? safeReaction(emoji) : null;
    return runOnce(busy.current, `react:${item.id}`, async () => {
      if (!v2) return legacy ? oldReact(item, next) : false;
      // État d'avant lu dans le cache (pas dans la carte, qui peut avoir un rendu de retard)
      let before = null;
      updateFeedItem(qc, item.id, (it) => {
        if (!before) before = reactionFields(it);
        return applyReaction(it, next);
      });
      try {
        const r = await reactToPost(item.id, next);
        if (r && typeof r === 'object' && r.reactions) {
          updateFeedItem(qc, item.id, (it) => ({ ...it, ...reactionFields(r) }));
        }
        return true;
      } catch (err) {
        // Retour en arrière de cette publication seulement (un geste sur une autre reste affiché)
        const prev = before || reactionFields(item);
        updateFeedItem(qc, item.id, (it) => ({ ...it, ...prev }));
        if (err?.status === 404) {
          dropItem(item.id);
          toast("Cette publication n'existe plus");
        } else {
          toast.error(feedErrorText(err, "Impossible d'enregistrer ta réaction"));
        }
        return false;
      }
    });
  }, [qc, user, v2, legacy, oldReact, dropItem]);

  const vote = useCallback((item, optionId) => {
    if (!item || !user || !v2 || !item.poll) return Promise.resolve(false);
    return runOnce(busy.current, `vote:${item.id}`, async () => {
      let before;
      updateFeedItem(qc, item.id, (it) => {
        if (before === undefined) before = it.poll;
        return applyVote(it, optionId);
      });
      try {
        const r = await votePoll(item.id, optionId);
        if (r?.poll) updateFeedItem(qc, item.id, (it) => ({ ...it, poll: r.poll }));
        return true;
      } catch (err) {
        const prev = before === undefined ? item.poll : before;
        updateFeedItem(qc, item.id, (it) => ({ ...it, poll: prev }));
        if (err?.status === 409 || err?.data?.code === 'poll_closed') {
          // Sondage terminé entre-temps : les résultats finaux s'affichent
          updateFeedItem(qc, item.id, (it) => (it.poll ? { ...it, poll: { ...it.poll, closed: true } } : it));
          qc.invalidateQueries({ queryKey: FEED_KEYS.post(item.id) });
          toast(feedErrorText(err, 'Ce sondage est terminé'));
        } else if (err?.status === 404) {
          dropItem(item.id);
          toast("Cette publication n'existe plus");
        } else {
          toast.error(feedErrorText(err, "Impossible d'enregistrer ton vote"));
        }
        return false;
      }
    });
  }, [qc, user, v2, dropItem]);

  // Appelée après la confirmation de la carte ; `true` si la publication n'existe plus
  const remove = useCallback(async (item) => {
    const gone = () => {
      dropItem(item.id);
      // Ancien fil et dernière publication de l'accueil (['posts', 'latest'])
      qc.invalidateQueries({ queryKey: ['posts'] });
    };
    try {
      await api.entities.Post.delete(item.id);
      gone();
      toast.success('Publication supprimée');
      return true;
    } catch (err) {
      if (err?.status === 404) {
        gone();
        toast.success('Publication déjà supprimée');
        return true;
      }
      toast.error(feedErrorText(err, 'Erreur lors de la suppression'));
      return false;
    }
  }, [qc, dropItem]);

  // « N nouvelles publications » : on repart de la première page, relue
  const listKey = useMemo(() => (v2 ? FEED_KEYS.list(filter) : ['posts']), [v2, filter]);
  const refresh = useCallback(() => {
    qc.setQueryData(listKey, (d) => (d && Array.isArray(d.pages) && d.pages.length > 1
      ? { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) } : d));
    return qc.refetchQueries({ queryKey: listKey, exact: true });
  }, [qc, listKey]);

  // ─── État de la liste ───

  let query;
  if (v2) query = v2Query;
  else if (legacy) query = old.query;
  else {
    // Drapeau pas encore lu (chargement, hors connexion) ou en échec : même forme qu'une requête
    query = {
      data: undefined,
      error: flag.error,
      isError: flag.isError,
      isPending: true,
      isLoading: flag.isLoading,
      isFetching: flag.isFetching,
      isPlaceholderData: false,
      fetchStatus: flag.fetchStatus,
      refetch: flag.refetch,
    };
  }
  const active = v2 ? v2Query : legacy ? old.query : null;

  return {
    items,
    query,
    fetchNextPage: active ? active.fetchNextPage : () => {},
    hasNextPage: !!active?.hasNextPage,
    isFetchingNextPage: !!active?.isFetchingNextPage,
    react,
    vote,
    remove,
    refresh,
    legacy,
    v2,
    flagReady: v2 || legacy,
    lastMinuteNow,
    focused: {
      item: focusedItem,
      query: focusQuery,
      notFound: v2 && !!focusId && focusQuery.error?.status === 404,
      // Last Minute ouvert par un lien : barbers en lecture (`pending`), créneau plus libre (`closed`)
      pending: focusPending,
      closed: focusClosed,
    },
    // Ancien fil : réactions ou commentaires en échec (« Réessayer » sur la carte)
    retryReactions: old.retryReactions,
    retryComments: old.retryComments,
    reactionsRetrying: old.reactionsRetrying,
    commentsRetrying: old.commentsRetrying,
  };
}

export default useFeed;
