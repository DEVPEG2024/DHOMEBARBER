import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Heart, Loader2, MessageCircle, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import FeedSheet from '@/components/feed/FeedSheet';
import { AuthorAvatar, AuthorName } from '@/components/feed/AuthorLine';
import LoadError, { friendlyError, queryFailed } from '@/components/shared/LoadError';
import { BARBER_PHOTO_BG, BARBER_PHOTO_RATIO } from '@/lib/barberPhoto';
import { contentFilterError } from '@/lib/contentFilter';
import { FEED_KEYS, fetchComments, likeComment, postComment } from '@/lib/feed/feedApi';
import { invalidateFeed, updateFeedItem } from '@/lib/feed/feedCache';
import {
  applyCommentLike, initialsOf, isMine, REACTION_LABELS, SALON_NAME, threadComments, timeAgo,
} from '@/lib/feed/rules';

const COMMENT_MAX = 1000;
// Emojis rapides du pied (planche du 30 oct. 2026)
const QUICK_EMOJIS = ['🔥', '💈', '👏', '❤️', '😂'];

/** Message d'erreur affichable : celui du serveur, jamais « Load failed » ni un texte anglais. */
const errorText = (err, fallback) => friendlyError(err, fallback, { foreign: fallback });

// Zone de tap d'au moins 40 px autour des petits liens texte (28 px de haut), sans changer le
// dessin : un pseudo-élément transparent déborde de 6 px en haut et en bas, 8 px sur les côtés
// (les liens voisins sont à 16 px : leurs zones se touchent sans se chevaucher)
const TAP = 'relative after:absolute after:-inset-x-2 after:-inset-y-1.5';

/** Avatar d'un commentaire : rond (client, salon), portrait pour un barber (jamais rond). */
function CommentAvatar({ comment, size }) {
  if (comment.author_role === 'barber') {
    return (
      <span
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border"
        style={{ width: Math.round(size * BARBER_PHOTO_RATIO), height: size, backgroundColor: BARBER_PHOTO_BG }}
      >
        {comment.author_photo_url
          ? <img src={comment.author_photo_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          : <span className="text-[9px] font-bold text-muted-foreground">{initialsOf(comment.author_name)}</span>}
      </span>
    );
  }
  return <AuthorAvatar name={comment.author_name} photoUrl={comment.author_photo_url} size={size} />;
}

/** Un commentaire (racine ou réponse) : auteur, temps, texte, Répondre / Supprimer / Signaler, ❤️. */
function CommentRow({ comment, user, isReply, legacy, onReply, onLike, onDelete, onOpenMenu }) {
  const reduce = useReducedMotion();
  const mine = isMine(comment, user);
  const isAdmin = user?.role === 'admin';
  const canDelete = mine || isAdmin;
  // Suppression en deux taps : un tap involontaire effaçait pour de bon
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (!confirm || deleting) return undefined;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm, deleting]);
  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const ok = await onDelete(comment);
    if (!ok) { setDeleting(false); setConfirm(false); }
  };
  const likes = Math.max(0, Number(comment.likes) || 0);
  const liked = !!comment.my_like;

  return (
    <div data-comment-id={comment.id} className="flex min-w-0 gap-2.5">
      <CommentAvatar comment={comment} size={isReply ? 26 : 32} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 leading-snug">
          <AuthorName name={comment.author_name} role={comment.author_role} className="text-[13px] font-bold text-foreground" starClassName="w-3 h-3" />
          <span className="shrink-0 text-xs text-muted-foreground">· {timeAgo(comment.created_at)}</span>
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">{comment.content}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          {!legacy && (
            <button type="button" onClick={() => onReply(comment)} className={`${TAP} min-h-[28px] text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground`}>
              Répondre
            </button>
          )}
          {canDelete && !confirm && (
            <button type="button" onClick={() => setConfirm(true)} className={`${TAP} min-h-[28px] text-xs text-muted-foreground transition-colors hover:text-red-400`}>
              Supprimer
            </button>
          )}
          {canDelete && confirm && (
            // « Oui » et « Non » sont courts : zone élargie de 12 px de chaque côté, d'où 24 px entre eux
            <span className="inline-flex min-h-[28px] items-center gap-6 text-xs">
              <span className="text-muted-foreground">Supprimer ?</span>
              <button type="button" onClick={confirmDelete} disabled={deleting} className="relative min-h-[28px] font-semibold text-red-400 after:absolute after:-inset-x-3 after:-inset-y-1.5 hover:text-red-300 disabled:opacity-50">
                {deleting ? '…' : 'Oui'}
              </button>
              <button type="button" onClick={() => setConfirm(false)} disabled={deleting} className="relative min-h-[28px] text-muted-foreground after:absolute after:-inset-x-3 after:-inset-y-1.5 hover:text-foreground disabled:opacity-50">
                Non
              </button>
            </span>
          )}
          {!canDelete && user && (
            <button
              type="button"
              onClick={() => onOpenMenu?.({
                type: 'comment',
                id: comment.id,
                authorKey: comment.author_key,
                authorEmail: comment.author_email,
                authorName: comment.author_name,
                content: comment.content,
              })}
              className={`${TAP} min-h-[28px] text-xs text-muted-foreground transition-colors hover:text-amber-400`}
            >
              Signaler
            </button>
          )}
        </div>
      </div>
      {!legacy && (
        <button
          type="button"
          onClick={() => onLike(comment)}
          aria-pressed={liked}
          aria-label={`${liked ? 'Retirer mon cœur' : 'Aimer ce commentaire'}${likes ? `, ${likes}` : ''}`}
          // Zone de tap de 44 × 44 px (le cœur seul fait 36 × 20 px)
          className={`relative flex w-9 shrink-0 flex-col items-center gap-0.5 self-start pt-1 text-[11px] font-semibold transition-colors after:absolute after:-inset-x-1 after:-inset-y-3 ${liked ? 'text-red-400' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <motion.span
            key={liked ? 'on' : 'off'}
            initial={reduce || !liked ? false : { scale: 0.6 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 16 }}
            className="inline-flex"
          >
            <Heart className={`h-4 w-4 ${liked ? 'fill-red-400' : ''}`} aria-hidden="true" />
          </motion.span>
          {likes > 0 && <span aria-hidden="true" className="tabular-nums">{likes}</span>}
        </button>
      )}
    </div>
  );
}

/**
 * Fenêtre des commentaires d'une publication (fil v2, contrat section 5) : fils d'un niveau,
 * Répondre (« Réponse à Kevin » + annuler), ❤️ par commentaire, Supprimer en deux taps sur les miens
 * (l'admin : tous), Signaler sur ceux des autres, emojis rapides et champ en pied.
 *
 * Fil v2 : `GET /feed/:id/comments` (`FEED_KEYS.comments`), écrit par `postComment` / `likeComment`
 * / `PostComment.delete`, puis met la carte du fil à jour (`comments_count`, `comments_preview` = 2
 * derniers) par `updateFeedItem`. Ancien fil (`legacy`, serveur sans `features.feedV2`) : les
 * commentaires portés par la publication (`item.legacy_comments`), sans réponses ni ❤️, création
 * par `PostComment.create`.
 *
 * @param {object} props
 * @param {object} props.item
 * @param {object} props.user
 * @param {() => void} props.onClose
 * @param {(target: object) => void} [props.onOpenMenu]  Signaler / Bloquer (F1, `layer="top"`) :
 *   `{ type: 'comment', id, authorKey, authorEmail, authorName, content }`
 * @param {(count: number) => void} [props.onCountChange]  nombre de commentaires après un changement
 * @param {boolean} [props.legacy]
 */
export default function CommentsSheet({ item, user, onClose, onOpenMenu, onCountChange, legacy = false }) {
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const postId = item?.id;
  const key = FEED_KEYS.comments(postId);
  const isAdmin = user?.role === 'admin';
  const isStaff = isAdmin || user?.role === 'barber';

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchComments(postId),
    enabled: !legacy && !!postId,
    // Toujours relue à l'ouverture (le cache s'affiche en attendant)
    staleTime: 0,
  });

  // Ancien fil : commentaires de la publication, plus ceux écrits ou supprimés ici en attendant
  // que le fil soit relu
  const [legacyAdded, setLegacyAdded] = useState([]);
  const [legacyGone, setLegacyGone] = useState(() => new Set());
  const list = useMemo(() => {
    if (!legacy) return Array.isArray(query.data?.comments) ? query.data.comments : [];
    const base = Array.isArray(item?.legacy_comments) ? item.legacy_comments : (item?.comments_preview || []);
    const seen = new Set(base.map((c) => String(c.id)));
    return [...base, ...legacyAdded.filter((c) => !seen.has(String(c.id)))]
      .filter((c) => !legacyGone.has(String(c.id)));
  }, [legacy, query.data, item?.legacy_comments, item?.comments_preview, legacyAdded, legacyGone]);
  const threads = useMemo(() => threadComments(list), [list]);
  const count = legacy
    ? list.length
    : query.data
      ? Math.max(Number(query.data.total) || 0, list.length)
      : Math.max(0, Number(item?.comments_count) || 0);

  // Carte du fil tenue à jour (nombre + 2 derniers) à chaque lecture ou écriture de la liste
  const countRef = useRef(onCountChange);
  countRef.current = onCountChange;
  useEffect(() => {
    if (legacy || !query.data || !postId) return;
    const preview = list.slice(-2);
    updateFeedItem(qc, postId, (it) => ({ ...it, comments_count: count, comments_preview: preview }));
    countRef.current?.(count);
    // `list` et `count` dérivent de `query.data`
  }, [legacy, query.data, postId, qc]);

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);
  const [scrollTo, setScrollTo] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const likingRef = useRef(new Set());

  // Commentaire qu'on vient d'écrire : amené dans la zone visible
  useEffect(() => {
    if (!scrollTo) return;
    const el = listRef.current?.querySelector(`[data-comment-id="${scrollTo}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
      setScrollTo(null);
    }
  }, [scrollTo, list, reduce]);

  const patchComment = (id, fn) => qc.setQueryData(key, (d) => (d && Array.isArray(d.comments)
    ? { ...d, comments: d.comments.map((c) => (String(c.id) === String(id) ? fn(c) : c)) }
    : d));

  const refreshLegacy = () => {
    invalidateFeed(qc);
    qc.invalidateQueries({ queryKey: ['postComments'] });
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || !postId) return;
    // Filtre des contenus : jamais pour l'équipe (le serveur ne filtre pas non plus)
    if (!isStaff) {
      const filtered = contentFilterError(text);
      if (filtered) { toast.error(filtered); return; }
    }
    setSending(true);
    try {
      if (legacy) {
        const row = await api.entities.PostComment.create({ post_id: postId, content: text });
        if (row && row.id) setLegacyAdded((l) => [...l, { ...row, parent_id: null, is_mine: true, likes: 0, my_like: false }]);
        countRef.current?.(count + 1);
        if (row && row.id) setScrollTo(String(row.id));
        refreshLegacy();
      } else {
        const res = await postComment(postId, { content: text, replyTo: replyTo?.id || null });
        const comment = res?.comment;
        const serverCount = Number(res?.comments_count);
        qc.setQueryData(key, (d) => {
          const cur = Array.isArray(d?.comments) ? d.comments : [];
          const known = !comment || cur.some((c) => String(c.id) === String(comment.id));
          const comments = known ? cur : [...cur, comment];
          const total = Number.isFinite(serverCount)
            ? serverCount
            : Math.max(Number(d?.total) || 0, cur.length) + (known ? 0 : 1);
          return { ...(d || {}), comments, total };
        });
        if (comment?.id) setScrollTo(String(comment.id));
        qc.invalidateQueries({ queryKey: key });
      }
      setDraft('');
      setReplyTo(null);
    } catch (err) {
      // Le texte reste dans le champ : rien n'est perdu
      if (!legacy && err?.data?.code === 'bad_reply') {
        // Commentaire répondu supprimé entre-temps : sans ce retrait, chaque nouvel essai échouait
        setReplyTo(null);
        qc.invalidateQueries({ queryKey: key });
        toast.error("Ce commentaire n'existe plus : ta réponse n'est pas partie. Renvoie-la comme commentaire.");
        return;
      }
      toast.error(errorText(err, "Erreur lors de l'envoi du commentaire"));
    } finally {
      setSending(false);
    }
  };

  const toggleLike = async (comment) => {
    const id = String(comment.id);
    if (likingRef.current.has(id)) return;
    likingRef.current.add(id);
    const liked = !comment.my_like;
    patchComment(id, (c) => applyCommentLike(c, liked));
    try {
      const r = await likeComment(id, liked);
      if (r && Number.isFinite(Number(r.likes))) {
        patchComment(id, (c) => ({ ...c, likes: Number(r.likes), my_like: !!r.my_like }));
        updateFeedItem(qc, postId, (it) => (Array.isArray(it.comments_preview)
          ? { ...it, comments_preview: it.comments_preview.map((c) => (String(c.id) === id ? { ...c, likes: Number(r.likes), my_like: !!r.my_like } : c)) }
          : it));
      }
    } catch (err) {
      patchComment(id, (c) => applyCommentLike(c, !liked));
      if (err?.status === 404) {
        toast.error('Ce commentaire a été supprimé');
        qc.invalidateQueries({ queryKey: key });
      } else {
        toast.error(errorText(err, "Impossible d'enregistrer votre réaction"));
      }
    } finally {
      likingRef.current.delete(id);
    }
  };

  // Rend `true` si le commentaire n'existe plus (supprimé maintenant ou déjà supprimé)
  const removeComment = async (comment) => {
    try {
      await api.entities.PostComment.delete(comment.id);
      toast.success('Commentaire supprimé');
    } catch (err) {
      // Double tap sur un réseau lent : le premier envoi l'a déjà supprimé
      if (err?.status === 404) toast.success('Commentaire déjà supprimé');
      else { toast.error(errorText(err, 'Erreur lors de la suppression')); return false; }
    }
    // Ses réponses partent avec lui (ON DELETE CASCADE)
    const gone = new Set([String(comment.id)]);
    if (!comment.parent_id) for (const c of list) if (String(c.parent_id) === String(comment.id)) gone.add(String(c.id));
    if (replyTo && gone.has(String(replyTo.id))) setReplyTo(null);
    if (legacy) {
      setLegacyGone((s) => new Set([...s, ...gone]));
      countRef.current?.(Math.max(0, count - gone.size));
      refreshLegacy();
    } else {
      qc.setQueryData(key, (d) => (d && Array.isArray(d.comments)
        ? {
          ...d,
          comments: d.comments.filter((c) => !gone.has(String(c.id))),
          total: Math.max(0, Math.max(Number(d.total) || 0, d.comments.length) - gone.size),
        }
        : d));
      qc.invalidateQueries({ queryKey: key });
    }
    return true;
  };

  const startReply = (comment) => {
    setReplyTo({ id: String(comment.id), name: String(comment.author_name || '').trim() || 'Membre du Gang' });
    inputRef.current?.focus();
  };

  const addEmoji = (emoji) => {
    setDraft((d) => {
      const sep = d && !/\s$/.test(d) ? ' ' : '';
      const next = `${d}${sep}${emoji}`;
      return next.length > COMMENT_MAX ? d : next;
    });
  };

  const placeholder = isAdmin ? `Répondre au nom de ${SALON_NAME}...` : 'Écris un commentaire…';

  const footer = (
    <div className="space-y-2.5">
      <div role="group" aria-label="Emojis rapides" className="flex gap-2">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => addEmoji(emoji)}
            aria-label={`Ajouter ${String(REACTION_LABELS[emoji] || emoji).toLowerCase()}`}
            className="flex h-9 w-11 items-center justify-center rounded-[10px] border border-border bg-secondary/60 text-[17px] transition-colors hover:bg-secondary"
          >
            {emoji}
          </button>
        ))}
      </div>
      <div>
        {replyTo && (
          <div className="flex h-[30px] items-center justify-between gap-2 rounded-t-[10px] border border-b-0 border-primary/30 bg-primary/12 pl-3 pr-1 text-xs text-[#b6ecd0]">
            <span className="min-w-0 truncate">Réponse à <span className="font-bold">{replyTo.name}</span></span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label="Annuler la réponse"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-primary/15"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Ton commentaire</span>
            <input
              ref={inputRef}
              type="text"
              value={draft}
              maxLength={COMMENT_MAX}
              enterKeyHint="send"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
              }}
              placeholder={placeholder}
              className={`h-11 w-full min-w-0 border bg-secondary/60 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                replyTo ? 'rounded-b-xl rounded-t-none border-primary/30' : 'rounded-xl border-border'
              }`}
            />
          </label>
          <button
            type="button"
            onClick={send}
            disabled={sending || !draft.trim()}
            aria-label="Envoyer"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : <Send className="h-[18px] w-[18px]" aria-hidden="true" />}
          </button>
        </div>
        {draft.length >= COMMENT_MAX - 100 && (
          <p className="mt-1 text-right text-[10px] text-muted-foreground">{draft.length} / {COMMENT_MAX}</p>
        )}
      </div>
    </div>
  );

  const rowProps = { user, legacy, onReply: startReply, onLike: toggleLike, onDelete: removeComment, onOpenMenu };

  let body;
  if (!legacy && !query.data && query.error?.status === 404) {
    // Publication supprimée (ou auteur bloqué) pendant que la fenêtre s'ouvrait
    body = (
      <div role="alert" className="py-12 text-center">
        <p className="text-sm font-semibold text-foreground">Cette publication n&apos;existe plus</p>
        <p className="mt-1 text-xs text-muted-foreground">Elle a été supprimée par son auteur ou par le salon.</p>
      </div>
    );
  } else if (!legacy && queryFailed(query)) {
    body = (
      <LoadError compact className="mt-2" what="les commentaires" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />
    );
  } else if (!legacy && query.isPending) {
    body = (
      <div className="flex items-center justify-center py-12 text-muted-foreground" role="status">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span className="sr-only">Chargement des commentaires</span>
      </div>
    );
  } else if (!threads.length) {
    body = (
      <div className="flex flex-col items-center py-12 text-center">
        <MessageCircle className="mb-2 h-7 w-7 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">Aucun commentaire pour l&apos;instant</p>
        <p className="mt-1 text-xs text-muted-foreground">Lance la discussion !</p>
      </div>
    );
  } else {
    body = (
      <ul ref={listRef} className="flex flex-col gap-4 pt-2" aria-label="Commentaires">
        {threads.map((root) => (
          <li key={root.id}>
            <CommentRow comment={root} isReply={false} {...rowProps} />
            {root.replies.length > 0 && (
              <ul className="ml-[42px] mt-3 flex flex-col gap-3" aria-label={`Réponses à ${root.author_name || 'ce commentaire'}`}>
                {root.replies.map((reply) => (
                  <li key={reply.id}>
                    <CommentRow comment={reply} isReply {...rowProps} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <FeedSheet title={`Commentaires · ${count}`} onClose={onClose} size="tall" footer={footer}>
      {body}
    </FeedSheet>
  );
}
