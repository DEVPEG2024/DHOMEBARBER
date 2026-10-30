/**
 * Fil « New Gang » v2 (30 oct. 2026) : drapeau du serveur, clés de cache et appels de l'API.
 * Contrat complet : docs/fonctions/fil-new-gang-contrat.md.
 *
 * Le serveur annonce `features.feedV2` dans ses paramètres publics quand il sert `GET /feed` et
 * les routes qui vont avec. Absent (serveur plus ancien) : l'app lit le fil par les entités
 * Post / PostLike / PostComment comme avant (`legacyItem`, src/lib/feed/rules.js), sans les
 * nouveautés (formats, réponses, activité, pastille). La lecture du drapeau REJETTE sur une panne :
 * le fil affiche alors « Pas de connexion » et Réessayer, jamais l'ancien fil par erreur.
 */
import { useQuery } from '@tanstack/react-query';
import { API_SERVER_URL, resolvedAppId, apiRequest, apiUrl } from '@/api/apiClient';

export const FEED_KEYS = {
  /** Préfixe de tout le fil v2 : invalider `FEED_KEYS.all` relit tout. */
  all: ['feed'],
  /** Pages du fil (useInfiniteQuery), par filtre : `all`, `salon`, `looks`, `polls`. */
  list: (filter = 'all') => ['feed', 'list', filter],
  /** Une publication seule (lien d'un push, d'un partage, de l'écran Activité). */
  post: (id) => ['feed', 'post', String(id)],
  comments: (id) => ['feed', 'comments', String(id)],
  activity: ['feed', 'activity'],
  /** Pastille de l'onglet et « N nouvelles publications » (`since` : plus récente affichée). */
  unread: (since = null) => ['feed', 'unread', since || 'nav'],
  prefs: ['feed', 'prefs'],
  visits: ['feed', 'visits'],
  flag: ['feed', 'flag'],
};

/** Vrai si le serveur sert le fil v2. Rejette sur une panne (jamais « ancien fil » par erreur). */
export async function fetchFeedV2() {
  const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
  if (!res.ok) throw new Error(`Paramètres publics : ${res.status}`);
  const data = await res.json();
  return data?.features?.feedV2 === true;
}

/** Requête du drapeau (cache 5 min) : `{ data, isLoading, isError, refetch, fetchStatus }`. */
export function useFeedV2Query() {
  return useQuery({ queryKey: FEED_KEYS.flag, queryFn: fetchFeedV2, staleTime: 5 * 60 * 1000, retry: 2 });
}

/** `true` seulement quand le serveur l'a dit (faux pendant le chargement et sur une panne). */
export function useFeedV2() {
  return useFeedV2Query().data === true;
}

const enc = encodeURIComponent;

/** `GET /feed` : `{ items, next_cursor }` (20 publications, curseur de la suivante ou null). */
export function fetchFeedPage({ cursor = null, filter = 'all', limit } = {}) {
  const q = new URLSearchParams();
  if (cursor) q.set('before', cursor);
  if (filter && filter !== 'all') q.set('filter', filter);
  if (limit) q.set('limit', String(limit));
  const qs = q.toString();
  return apiRequest('GET', apiUrl(`/feed${qs ? `?${qs}` : ''}`));
}

/** `GET /feed/:id` : `{ item }` (404 : supprimée ou auteur bloqué). */
export function fetchFeedPost(id) {
  return apiRequest('GET', apiUrl(`/feed/${enc(id)}`));
}

/** `GET /feed/:id/comments` : `{ comments, total }` (ordre chronologique, réponses comprises). */
export function fetchComments(postId) {
  return apiRequest('GET', apiUrl(`/feed/${enc(postId)}/comments`));
}

/** `POST /feed/:id/react` : `reaction` = emoji, ou null pour retirer. Rend `{ reactions, reactions_total, my_reaction }`. */
export function reactToPost(postId, reaction) {
  return apiRequest('POST', apiUrl(`/feed/${enc(postId)}/react`), { reaction: reaction || null });
}

/** `POST /feed/:id/comments` : `{ content, reply_to? }` → `{ comment, comments_count }`. */
export function postComment(postId, { content, replyTo = null }) {
  return apiRequest('POST', apiUrl(`/feed/${enc(postId)}/comments`), { content, ...(replyTo ? { reply_to: replyTo } : {}) });
}

/** `POST /feed/comments/:id/like` : `{ liked }` → `{ likes, my_like }`. */
export function likeComment(commentId, liked) {
  return apiRequest('POST', apiUrl(`/feed/comments/${enc(commentId)}/like`), { liked: !!liked });
}

/** `POST /feed/:id/vote` : `{ option_id }` → `{ poll }`. */
export function votePoll(postId, optionId) {
  return apiRequest('POST', apiUrl(`/feed/${enc(postId)}/vote`), { option_id: optionId });
}

/**
 * `POST /feed/posts` → `{ item }`. Corps : `{ kind: 'post'|'look'|'poll'|'before_after', content,
 * images, visit_id, bookable, poll: { question, options, days }, before, after }`.
 */
export function createFeedPost(payload) {
  return apiRequest('POST', apiUrl('/feed/posts'), payload);
}

/** `GET /feed/visits` : visites du compte qu'il peut montrer en « Mon look » → `{ visits }`. */
export function fetchLookVisits() {
  return apiRequest('GET', apiUrl('/feed/visits'));
}

/** `GET /feed/activity` → `{ items, unread_count, polls }`. */
export function fetchActivity() {
  return apiRequest('GET', apiUrl('/feed/activity'));
}

/** `POST /feed/activity/read` : `ids` (lignes d'un ou plusieurs groupes) ; sans `ids` : tout. */
export function markActivityRead(ids = null) {
  return apiRequest('POST', apiUrl('/feed/activity/read'), Array.isArray(ids) ? { ids } : {});
}

/** `GET /feed/unread` → `{ activity, posts }` ; `since` : publications plus récentes que cette date. */
export function fetchUnread(since = null) {
  return apiRequest('GET', apiUrl(`/feed/unread${since ? `?since=${enc(since)}` : ''}`));
}

/** `POST /feed/seen` : le fil vient d'être vu (pastille et « nouvelles publications » remises à zéro). */
export function markFeedSeen() {
  return apiRequest('POST', apiUrl('/feed/seen'), {});
}

/** `GET /feed/prefs` → `{ reactions, comments, salon, visit }`. */
export function fetchFeedPrefs() {
  return apiRequest('GET', apiUrl('/feed/prefs'));
}

/** `PUT /feed/prefs` : changement partiel → réglages complets. */
export function saveFeedPrefs(patch) {
  return apiRequest('PUT', apiUrl('/feed/prefs'), patch);
}
