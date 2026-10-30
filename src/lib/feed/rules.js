/**
 * Fil « New Gang » v2 (30 oct. 2026) : règles pures de l'app (aucun appel réseau, aucun React).
 * Forme d'une publication (`item`) et d'un commentaire : docs/fonctions/fil-new-gang-contrat.md.
 *
 * Réactions et votes s'affichent tout de suite (`applyReaction`, `applyVote`), le serveur confirme
 * derrière et l'app revient à l'état d'avant s'il refuse (src/lib/feed/feedCache.js).
 */

/** Réactions proposées (liste fermée, même ordre que FEED_REACTIONS du serveur). */
export const REACTIONS = ['❤️', '🔥', '💪', '😂', '👏', '💈'];
/** Noms lus par les lecteurs d'écran. */
export const REACTION_LABELS = {
  '❤️': 'Cœur', '🔥': 'Feu', '💪': 'Force', '😂': 'Rire', '👏': 'Applaudissements', '💈': 'Enseigne de barbier',
};
/** Réaction hors de la liste (texte d'avant la liste fermée du serveur) : affichée en ❤️. */
export const safeReaction = (r) => (REACTIONS.includes(r) ? r : '❤️');

// L'admin publie et commente au nom du salon (26 oct. 2026) : « D'Home Barber » et ce logo,
// petite étoile bleue à côté du nom (rôle posé par le serveur, jamais par l'app)
export const SALON_NAME = "D'Home Barber";
export const SALON_LOGO = '/icons/icon-192.png';
/** Lien public d'une publication (partage) : jamais `window.location.origin` (capacitor://localhost). */
export const PUBLIC_SITE = 'https://dhomebarber.fr';
export const MAX_IMAGES = 4;
export const FEED_FILTERS = [
  { id: 'all', label: 'Tout' },
  { id: 'salon', label: 'Le salon' },
  { id: 'looks', label: 'Les looks' },
  { id: 'polls', label: 'Sondages' },
];

/** Étoile bleue du salon (`star`) ou badge « Barber ». */
export function getRoleBadge(role) {
  if (role === 'admin') return { star: true };
  if (role === 'barber') return { label: 'Barber', color: '#3fcf8e' };
  return null;
}

export function timeAgo(dateStr, now = Date.now()) {
  const date = new Date(dateStr);
  const diff = Math.floor((now - date.getTime()) / 1000);
  if (!Number.isFinite(diff)) return '';
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
}

export const initialsOf = (name) => String(name || '').split(/\s+/).filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';

/**
 * Contenu à moi ? Le serveur le dit (`is_mine`) dans le fil v2 ; repli des anciennes lignes : clé
 * publique (`author_key` / `user_key`, la mienne dans `user.public_key` via /me), puis email.
 */
export function isMine(row, user, keyField = 'author_key', emailField = 'author_email') {
  if (!row || !user) return false;
  if (typeof row.is_mine === 'boolean') return row.is_mine;
  const key = row[keyField];
  if (key && user.public_key) return key === user.public_key;
  const email = row[emailField];
  if (!email || !user.email) return false;
  return String(email).toLowerCase() === String(user.email).toLowerCase();
}

/** Photos d'une publication (1 à 4 ; avant / après : [avant, après]). */
export function imagesOf(item) {
  if (item && Array.isArray(item.images) && item.images.length) return item.images.slice(0, MAX_IMAGES);
  return item && item.image_url ? [item.image_url] : [];
}

// ─── Réactions ───

/** Ma réaction remplacée (ou retirée avec `null`) : compteurs recalculés, sans muter `item`. */
export function applyReaction(item, emoji) {
  const next = emoji ? safeReaction(emoji) : null;
  const prev = item.my_reaction || null;
  if (prev === next) return item;
  const reactions = { ...(item.reactions || {}) };
  if (prev) {
    reactions[prev] = Math.max(0, (reactions[prev] || 0) - 1);
    if (!reactions[prev]) delete reactions[prev];
  }
  if (next) reactions[next] = (reactions[next] || 0) + 1;
  const total = Math.max(0, (item.reactions_total || 0) + (next ? 1 : 0) - (prev ? 1 : 0));
  return { ...item, reactions, reactions_total: total, my_reaction: next };
}

/** Réactions de la publication, la plus fréquente d'abord (ordre de REACTIONS à égalité). */
export function sortedReactions(item) {
  return Object.entries(item?.reactions || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || REACTIONS.indexOf(a[0]) - REACTIONS.indexOf(b[0]));
}

// ─── Sondages ───

/** Mon vote posé (ou changé) : compteurs recalculés, sans muter `item`. */
export function applyVote(item, optionId) {
  const poll = item?.poll;
  if (!poll || poll.closed || poll.my_vote === optionId) return item;
  if (!poll.options.some((o) => o.id === optionId)) return item;
  const prev = poll.my_vote;
  const options = poll.options.map((o) => {
    let votes = o.votes;
    if (o.id === prev) votes = Math.max(0, votes - 1);
    if (o.id === optionId) votes += 1;
    return { ...o, votes };
  });
  return { ...item, poll: { ...poll, options, total: options.reduce((s, o) => s + o.votes, 0), my_vote: optionId } };
}

/** Pourcentage entier d'une réponse (0 sans vote). */
export const pollPercent = (votes, total) => (total > 0 ? Math.round((votes / total) * 100) : 0);

/** « encore 2 jours », « encore 5 h », « dernière heure », « terminé ». */
export function pollRemaining(endsAt, now = Date.now()) {
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end) || end <= now) return 'terminé';
  const h = Math.floor((end - now) / 3600000);
  if (h >= 48) return `encore ${Math.floor(h / 24)} jours`;
  if (h >= 24) return 'encore 1 jour';
  if (h >= 1) return `encore ${h} h`;
  return 'dernière heure';
}

// ─── Commentaires ───

/**
 * Liste plate (ordre chronologique) → fils d'un niveau : `[{ ...racine, replies: [...] }]`.
 * Une réponse dont la racine manque (supprimée, auteur bloqué) est montrée comme une racine.
 */
export function threadComments(list) {
  const roots = [];
  const byId = new Map();
  for (const c of list || []) if (!c.parent_id) {
    const root = { ...c, replies: [] };
    roots.push(root);
    byId.set(String(c.id), root);
  }
  for (const c of list || []) if (c.parent_id) {
    const root = byId.get(String(c.parent_id));
    if (root) root.replies.push(c);
    else roots.push({ ...c, replies: [] });
  }
  return roots;
}

/** Mon ❤️ sur un commentaire posé ou retiré (sans muter). */
export function applyCommentLike(comment, liked) {
  if (!!comment.my_like === !!liked) return comment;
  return { ...comment, my_like: !!liked, likes: Math.max(0, (comment.likes || 0) + (liked ? 1 : -1)) };
}

// ─── Activité ───

/** « Kevin », « Kevin et Yanis », « Kevin et 4 autres » (même règle que lib/feedRules.js du serveur). */
export function actorLabel(names, count) {
  const list = (names || []).map((n) => String(n || '').trim() || 'Un membre').slice(0, 2);
  const total = Math.max(Number(count) || 0, list.length);
  if (!list.length) return 'Un membre';
  if (total === 1) return list[0];
  if (total === 2 && list.length === 2) return `${list[0]} et ${list[1]}`;
  const others = total - 1;
  return `${list[0]} et ${others} autre${others > 1 ? 's' : ''}`;
}

/**
 * Phrase d'un élément de l'écran Activité : `{ who, text }` (« Kevin et 3 autres » / « ont réagi 🔥
 * à ta photo »). Tutoiement, comme les pushs.
 */
export function activityLine(group) {
  const who = actorLabel((group.actors || []).map((a) => a.name), group.actors_count);
  const many = (group.actors_count || 0) > 1;
  const what = group.post_kind === 'look' ? 'ton look' : group.post_kind === 'moment' ? 'ton Moment du Gang'
    : group.post_image_url ? 'ta photo' : 'ta publication';
  const quote = group.excerpt ? ` : « ${group.excerpt} »` : '';
  switch (group.type) {
    case 'reaction': return { who, text: `${many ? 'ont' : 'a'} réagi ${group.emoji || ''} à ${what}`.replace(/\s+/g, ' ') };
    case 'comment': return { who, text: `${many ? 'ont' : 'a'} commenté ${what}${many ? '' : quote}` };
    case 'reply': return { who, text: `a répondu à ton commentaire${quote}` };
    case 'comment_like': return { who, text: `${many ? 'ont' : 'a'} aimé ton commentaire` };
    case 'moment': return { who: 'Ton Moment du Gang', text: 'est dans le fil : le Gang peut te féliciter' };
    case 'visit_invite': return { who: 'Ta coupe est toute fraîche', text: 'montre-la au Gang' };
    default: return { who, text: 'a réagi' };
  }
}

// ─── Cache des pages (useInfiniteQuery) ───

/** Applique `fn` à la publication `postId` dans les pages d'un fil (données useInfiniteQuery). */
export function patchPages(data, postId, fn) {
  if (!data || !Array.isArray(data.pages)) return data;
  let changed = false;
  const pages = data.pages.map((page) => {
    if (!page || !Array.isArray(page.items)) return page;
    let hit = false;
    const items = page.items.map((it) => {
      if (String(it.id) !== String(postId)) return it;
      hit = true;
      return fn(it);
    });
    if (!hit) return page;
    changed = true;
    return { ...page, items };
  });
  return changed ? { ...data, pages } : data;
}

/** Retire la publication `postId` des pages. */
export function removeFromPages(data, postId) {
  if (!data || !Array.isArray(data.pages)) return data;
  return { ...data, pages: data.pages.map((page) => (page && Array.isArray(page.items)
    ? { ...page, items: page.items.filter((it) => String(it.id) !== String(postId)) } : page)) };
}

/** Ajoute `item` en tête de la première page (publication qu'on vient d'écrire), sans doublon. */
export function prependToPages(data, item) {
  if (!data || !Array.isArray(data.pages) || !data.pages.length) return data;
  const cleaned = removeFromPages(data, item.id);
  const [first, ...rest] = cleaned.pages;
  return { ...cleaned, pages: [{ ...first, items: [item, ...(first.items || [])] }, ...rest] };
}

/** Publications des pages, sans doublon (première occurrence gardée). */
export function itemsOfPages(data) {
  const seen = new Set();
  const out = [];
  for (const page of data?.pages || []) for (const it of page?.items || []) {
    const k = String(it.id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

// ─── Ancien fil (serveur sans `features.feedV2`) ───

/**
 * Publication lue par les entités (Post + ses PostLike + ses PostComment) → forme du fil v2.
 * Sans réponses, sans ❤️ de commentaire, sans vues ; les formats v2 n'existent pas encore.
 */
export function legacyItem(post, likes, comments, user) {
  const reactions = {};
  let mine = null;
  for (const l of likes || []) {
    const r = safeReaction(l.reaction);
    reactions[r] = (reactions[r] || 0) + 1;
    if (!mine && isMine(l, user, 'user_key', 'user_email')) mine = l;
  }
  const list = (comments || []).map((c) => ({
    ...c, parent_id: null, is_mine: isMine(c, user), likes: 0, my_like: false,
  }));
  return {
    ...post,
    kind: post.kind === 'last_minute' ? 'last_minute' : 'post',
    is_mine: isMine(post, user),
    images: post.image_url ? [post.image_url] : [],
    meta: post.kind === 'last_minute' ? post.meta || {} : {},
    reactions,
    reactions_total: (likes || []).length,
    my_reaction: mine ? safeReaction(mine.reaction) : null,
    // Ligne PostLike à moi : l'ancien fil la modifie ou la supprime (PostLike.update / delete)
    my_like_id: mine ? mine.id : null,
    comments_count: list.length,
    comments_preview: list.slice(-2),
    legacy_comments: list,
    poll: null,
    views: null,
  };
}

/** Lien public d'une publication (partage). */
export const postShareUrl = (postId) => `${PUBLIC_SITE}/feed?post=${encodeURIComponent(postId)}`;
