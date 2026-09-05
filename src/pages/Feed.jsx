import React, { useState, useRef, useMemo, useEffect } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { Send, Heart, Trash2, Loader2, Camera, MessageCircle, Plus, X, MoreHorizontal, Flag, Ban, ShieldAlert, Check } from 'lucide-react';
import LegalLink from '@/components/shared/LegalLink';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { hapticFeedback } from '@/lib/capacitor';

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function getRoleBadge(role) {
  if (role === 'admin') return { label: 'Admin', color: '#ef4444' };
  if (role === 'barber') return { label: 'Barber', color: '#3fcf8e' };
  return null;
}

// 20 publications par page : le fil en chargeait 100 d'un coup (des dizaines de Mo d'images)
const POSTS_PAGE_SIZE = 20;
// Le filtre `post_id IN (...)` part dans l'URL : on le découpe pour ne pas fabriquer
// une adresse démesurée quand beaucoup de pages sont affichées
const ID_CHUNK = 60;

/** Réactions / commentaires des seules publications affichées */
async function fetchForPosts(entity, postIds, sort, perPost) {
  const groups = [];
  for (let i = 0; i < postIds.length; i += ID_CHUNK) groups.push(postIds.slice(i, i + ID_CHUNK));
  const results = await Promise.all(
    groups.map(ids => entity.filter({ post_id: ids }, sort, Math.min(2000, ids.length * perPost)))
  );
  return results.flat();
}

/**
 * Le serveur ne renvoie plus l'email des auteurs aux clients : les publications et les
 * commentaires portent `author_key` (les réactions `user_key`), et chacun reçoit la sienne
 * dans `user.public_key` via /me. On compare d'abord les clés, et on retombe sur l'email
 * pour le staff (qui le reçoit toujours) et pour d'anciennes réponses encore en cache.
 */
function isMine(row, user, keyField = 'author_key', emailField = 'author_email') {
  if (!row || !user) return false;
  const key = row[keyField];
  if (key && user.public_key) return key === user.public_key;
  const email = row[emailField];
  if (!email || !user.email) return false;
  return String(email).toLowerCase() === String(user.email).toLowerCase();
}

function CommentItem({ comment, currentUser, onDelete, onOpenMenu }) {
  const badge = getRoleBadge(comment.author_role);
  const initials = comment.author_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?';
  const isOwner = currentUser?.role === 'admin' || isMine(comment, currentUser);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2.5"
    >
      <div className="w-7 h-7 rounded-full overflow-hidden bg-secondary border border-border flex items-center justify-center flex-shrink-0">
        {comment.author_photo_url ? (
          <img src={comment.author_photo_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] font-bold text-muted-foreground">{initials}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-secondary/50 rounded-xl px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground">{comment.author_name}</span>
            {badge && (
              <span className="text-[9px] font-bold px-1 py-0.5 rounded-full" style={{ backgroundColor: badge.color + '20', color: badge.color }}>
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-xs text-foreground/80 mt-0.5 whitespace-pre-wrap">{comment.content}</p>
        </div>
        <div className="flex items-center gap-3 mt-1 px-1">
          <span className="text-[10px] text-muted-foreground">{timeAgo(comment.created_at)}</span>
          {isOwner && (
            <button onClick={() => onDelete(comment.id)} className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors">
              Supprimer
            </button>
          )}
          {!isOwner && currentUser && (
            <button
              onClick={() => onOpenMenu({ type: 'comment', id: comment.id, authorKey: comment.author_key, authorEmail: comment.author_email, authorName: comment.author_name, content: comment.content })}
              className="text-[10px] text-muted-foreground hover:text-amber-400 transition-colors"
            >
              Signaler
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function GlassCard({ children }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const x1 = useTransform(scrollYProgress, [0, 0.5, 1], [-40, 30, -40]);
  const x2 = useTransform(scrollYProgress, [0, 0.5, 1], [30, -25, 30]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.7, 1.2, 0.7]);
  const opacity = useTransform(scrollYProgress, [0, 0.25, 0.5, 0.75, 1], [0, 0.9, 1, 0.9, 0]);
  const rotate = useTransform(scrollYProgress, [0, 0.5, 1], [-3, 2, -3]);
  const glowOpacity = useTransform(scrollYProgress, [0, 0.4, 0.6, 1], [0, 0.4, 0.4, 0]);

  return (
    <div ref={ref} className="relative py-1">
      <motion.div
        className="absolute -bottom-4 inset-x-2 h-20 rounded-3xl pointer-events-none"
        style={{
          x: x1, scale, opacity, rotate,
          background: 'radial-gradient(ellipse at 40% 50%, rgba(34,197,94,0.5) 0%, rgba(16,185,129,0.3) 35%, rgba(5,150,105,0.15) 60%, transparent 80%)',
          filter: 'blur(20px)',
        }}
      />
      <motion.div
        className="absolute -bottom-3 inset-x-8 h-14 rounded-3xl pointer-events-none"
        style={{
          x: x2, scale, opacity,
          background: 'radial-gradient(ellipse at 60% 50%, rgba(52,211,153,0.45) 0%, rgba(16,185,129,0.25) 40%, transparent 75%)',
          filter: 'blur(14px)',
        }}
      />
      <motion.div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          opacity: glowOpacity,
          boxShadow: '0 0 20px 2px rgba(34,197,94,0.15), inset 0 0 20px 0 rgba(34,197,94,0.03)',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

const REACTIONS = ['❤️', '🔥', '💪', '😂', '👏', '💈'];

// Explosion d'emojis au moment de réagir : particules en transform / opacity uniquement
function EmojiBurst({ emoji, onDone }) {
  const parts = useMemo(() => Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i - 4.5) * 0.26 + (Math.random() - 0.5) * 0.2;
    const dist = 44 + Math.random() * 44;
    return {
      id: i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      scale: 0.7 + Math.random() * 0.7,
      rotate: (Math.random() - 0.5) * 70,
      delay: Math.random() * 0.08,
    };
  }), []);

  return (
    <span className="absolute left-8 bottom-6 pointer-events-none z-10" aria-hidden="true">
      {parts.map(p => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: p.y, scale: p.scale, opacity: 0, rotate: p.rotate }}
          transition={{ duration: 0.9, delay: p.delay, ease: [0.16, 1, 0.3, 1], opacity: { duration: 0.45, delay: p.delay + 0.45 } }}
          onAnimationComplete={p.id === 0 ? onDone : undefined}
          className="absolute text-lg leading-none"
        >
          {emoji}
        </motion.span>
      ))}
    </span>
  );
}

function PostCard({ post, currentUser, onLike, onDelete, likes, comments, onComment, onDeleteComment, getAuthorPhoto, onOpenMenu }) {
  const [showComments, setShowComments] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Animations de réaction : explosion d'emojis, gros cœur au double tap sur la photo
  const [burst, setBurst] = useState(null);
  const [heartPop, setHeartPop] = useState(null);

  const postLikes = likes.filter(l => l.post_id === post.id);
  const userLike = currentUser ? postLikes.find(l => isMine(l, currentUser, 'user_key', 'user_email')) : undefined;
  const likeCount = postLikes.length;

  // Group reactions by emoji
  const reactionCounts = {};
  postLikes.forEach(l => {
    const r = l.reaction || '❤️';
    reactionCounts[r] = (reactionCounts[r] || 0) + 1;
  });
  const postComments = comments.filter(c => c.post_id === post.id);
  const commentCount = postComments.length;
  const badge = getRoleBadge(post.author_role);
  const initials = post.author_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?';
  const isOwner = currentUser?.role === 'admin' || isMine(post, currentUser);

  const react = (emoji) => {
    setBurst({ emoji, key: Date.now() });
    hapticFeedback();
    onLike(post.id, !!userLike, emoji);
  };

  const handleImageDoubleTap = () => {
    if (!currentUser) return;
    setHeartPop(Date.now());
    hapticFeedback();
    if (!userLike) onLike(post.id, false, '❤️');
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    await onComment(post.id, commentText.trim());
    setCommentText('');
    setSubmitting(false);
    setShowComments(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-card border border-border rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-2">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-secondary border border-border flex items-center justify-center flex-shrink-0">
          {post.author_photo_url ? (
            <img src={post.author_photo_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-muted-foreground">{initials}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{post.author_name}</p>
            {badge && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: badge.color + '20', color: badge.color }}>
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{timeAgo(post.created_at)}</p>
        </div>
        {isOwner ? (
          <button onClick={() => onDelete(post.id)} className="text-muted-foreground/40 hover:text-red-400 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        ) : currentUser ? (
          <button
            onClick={() => onOpenMenu({ type: 'post', id: post.id, authorKey: post.author_key, authorEmail: post.author_email, authorName: post.author_name, content: post.content })}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Signaler ou bloquer"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {/* Content */}
      {post.content && (
        <p className="px-4 pb-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap">{post.content}</p>
      )}

      {/* Image - 4:5 vertical format (1080x1350) */}
      {post.image_url && (
        <div className="px-4 pb-3">
          <div className="relative w-full rounded-xl overflow-hidden select-none" style={{ aspectRatio: '4/5' }} onDoubleClick={handleImageDoubleTap}>
            <img src={post.image_url} alt="" draggable={false} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
            <AnimatePresence>
              {heartPop && (
                <motion.span
                  key={heartPop}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 1] }}
                  exit={{ scale: 1.5, opacity: 0 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                  onAnimationComplete={() => setTimeout(() => setHeartPop(null), 400)}
                  className="absolute inset-0 flex items-center justify-center text-7xl pointer-events-none"
                  style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.45))' }}
                >
                  ❤️
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Reaction summary */}
      {likeCount > 0 && (
        <div className="flex items-center gap-1 px-4 py-1.5">
          <div className="flex -space-x-1">
            {Object.entries(reactionCounts).slice(0, 3).map(([emoji]) => (
              <span key={emoji} className="text-sm">{emoji}</span>
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-1">{likeCount}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 px-4 py-2.5 border-t border-border relative">
        {/* Reaction picker */}
        <AnimatePresence>
          {showReactions && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              className="absolute bottom-full left-3 mb-2 flex gap-1 bg-card border border-border rounded-2xl px-2 py-1.5 shadow-xl"
            >
              {REACTIONS.map(emoji => (
                <motion.button
                  key={emoji}
                  whileHover={{ scale: 1.3 }}
                  whileTap={{ scale: 0.8 }}
                  onClick={() => {
                    react(emoji);
                    setShowReactions(false);
                  }}
                  className={`text-xl w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary transition-colors ${
                    userLike?.reaction === emoji ? 'bg-primary/15' : ''
                  }`}
                >
                  {emoji}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {burst && <EmojiBurst key={burst.key} emoji={burst.emoji} onDone={() => setBurst(null)} />}
        </AnimatePresence>

        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => userLike ? onLike(post.id, true, userLike.reaction) : setShowReactions(!showReactions)}
          onDoubleClick={() => setShowReactions(!showReactions)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-secondary transition-colors"
        >
          {userLike ? (
            <motion.span
              key={userLike.reaction || '❤️'}
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              className="text-lg inline-block"
            >
              {userLike.reaction || '❤️'}
            </motion.span>
          ) : (
            <Heart className="w-5 h-5 text-muted-foreground" />
          )}
          <span className={`text-xs font-medium ${userLike ? 'text-foreground' : 'text-muted-foreground'}`}>
            {userLike ? 'Aimé' : 'J\'aime'}
          </span>
        </motion.button>

        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-xs font-medium">
            {commentCount > 0 ? `${commentCount}` : 'Commenter'}
          </span>
        </button>
      </div>

      {/* Comments section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              {/* Comment list */}
              {postComments.map(comment => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentUser={currentUser}
                  onDelete={onDeleteComment}
                  onOpenMenu={onOpenMenu}
                />
              ))}
              {postComments.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">Aucun commentaire</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comment input - always visible */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
        <div className="w-7 h-7 rounded-full overflow-hidden bg-secondary border border-border flex items-center justify-center flex-shrink-0">
          {getAuthorPhoto() ? (
            <img src={getAuthorPhoto()} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] font-bold text-muted-foreground">{currentUser?.full_name?.charAt(0) || '?'}</span>
          )}
        </div>
        <Input
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitComment(); } }}
          placeholder="Écrire un commentaire..."
          className="bg-secondary/50 border-border text-xs h-8 flex-1"
        />
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={handleSubmitComment}
          disabled={submitting || !commentText.trim()}
          className="text-primary disabled:text-muted-foreground/30 transition-colors"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </motion.button>
      </div>
    </motion.div>
  );
}

export default function Feed() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const fileInputRef = useRef(null);

  // Modération : menu Signaler / Bloquer, formulaire de signalement, confirmation de blocage
  const [menuTarget, setMenuTarget] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSending, setReportSending] = useState(false);
  const [blockTarget, setBlockTarget] = useState(null);
  const [blocking, setBlocking] = useState(false);
  const [handlingReport, setHandlingReport] = useState(null);

  // Défilement infini : 20 publications par page (`skip` = OFFSET côté serveur).
  // À la création ou à la suppression d'une publication les offsets bougent :
  // invalider ['posts'] recharge toutes les pages déjà affichées, donc le fil reste cohérent.
  const {
    data: postsPages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['posts'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.entities.Post.list('-created_at', POSTS_PAGE_SIZE, pageParam),
    getNextPageParam: (lastPage, allPages) =>
      (lastPage?.length || 0) < POSTS_PAGE_SIZE ? undefined : allPages.length * POSTS_PAGE_SIZE,
  });

  const posts = useMemo(() => postsPages?.pages.flat() ?? [], [postsPages]);

  // Réactions et commentaires : uniquement ceux des publications affichées (post_id IN (...)),
  // au lieu des 500 derniers du salon. La clé contient les ids pour que le cache suive les pages.
  const postIds = useMemo(() => posts.map(p => p.id), [posts]);
  const postIdsKey = postIds.join(',');

  const { data: likes = [] } = useQuery({
    queryKey: ['postLikes', postIdsKey],
    queryFn: () => fetchForPosts(api.entities.PostLike, postIds, '-created_at', 30),
    enabled: postIds.length > 0,
    placeholderData: (prev) => prev,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ['postComments', postIdsKey],
    queryFn: () => fetchForPosts(api.entities.PostComment, postIds, 'created_at', 25),
    enabled: postIds.length > 0,
    placeholderData: (prev) => prev,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    staleTime: 5 * 60 * 1000, // catalogue : change rarement
    queryFn: () => api.entities.Employee.filter({ is_active: true }, 'sort_order', 50),
  });

  // Utilisateurs que j'ai bloqués : leurs contenus sont masqués (le serveur filtre aussi)
  const { data: blocks = [] } = useQuery({
    queryKey: ['userBlocks'],
    queryFn: () => api.entities.UserBlock.list('-created_at', 200),
    enabled: !!user,
  });

  // Admin : signalements en attente
  const { data: reports = [] } = useQuery({
    queryKey: ['postReports'],
    queryFn: () => api.entities.PostReport.filter({ status: 'pending' }, '-created_at', 50),
    enabled: user?.role === 'admin',
  });

  // Les blocages portent désormais sur la clé publique (l'email n'est plus renvoyé aux clients),
  // mais on garde la comparaison par email pour le staff et les blocages déjà enregistrés.
  const blockedKeys = new Set(blocks.map(b => b.blocked_key).filter(Boolean));
  const blockedEmails = new Set(blocks.map(b => (b.blocked_email || '').toLowerCase()).filter(Boolean));
  const isBlocked = (row) =>
    (!!row.author_key && blockedKeys.has(row.author_key)) ||
    (!!row.author_email && blockedEmails.has(String(row.author_email).toLowerCase()));
  const visiblePosts = posts.filter(p => !isBlocked(p));
  const visibleComments = comments.filter(c => !isBlocked(c));

  // La clé publique arrive par /me : si l'objet utilisateur ne l'a pas encore
  // (inscription, session ouverte avant le déploiement), on le rafraîchit une fois.
  const keyRefreshed = useRef(false);
  useEffect(() => {
    if (user && !user.public_key && !keyRefreshed.current && refreshUser) {
      keyRefreshed.current = true;
      refreshUser();
    }
  }, [user, refreshUser]);

  // Défilement infini : on charge la page suivante quand la sentinelle approche du viewport
  const loadMoreRef = useRef(null);
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const getAuthorPhoto = () => {
    if (user?.role === 'barber' || user?.role === 'admin') {
      const emp = employees.find(e => e.id === user?.employee_id);
      return emp?.photo_url || user?.photo_url || '';
    }
    return user?.photo_url || '';
  };

  const createPost = async () => {
    if (!content.trim() && !imageUrl) return;
    setPosting(true);
    try {
      await api.entities.Post.create({
        author_email: user.email,
        author_name: user.full_name || user.email,
        author_role: user.role || 'user',
        author_photo_url: getAuthorPhoto(),
        content: content.trim(),
        image_url: imageUrl || null,
      });
      setContent('');
      setImageUrl('');
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Publication envoyée 🎉');
    } catch {
      toast.error('Erreur lors de la publication');
    } finally {
      setPosting(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      setImageUrl(file_url);
    } catch {
      toast.error("Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const handleLike = async (postId, alreadyLiked, reaction = '❤️') => {
    try {
      if (alreadyLiked) {
        const like = likes.find(l => l.post_id === postId && isMine(l, user, 'user_key', 'user_email'));
        if (like) await api.entities.PostLike.delete(like.id);
      } else {
        await api.entities.PostLike.create({ post_id: postId, user_email: user.email, reaction });
      }
      queryClient.invalidateQueries({ queryKey: ['postLikes'] });
    } catch {}
  };

  const handleComment = async (postId, text) => {
    try {
      await api.entities.PostComment.create({
        post_id: postId,
        author_email: user.email,
        author_name: user.full_name || user.email,
        author_role: user.role || 'user',
        author_photo_url: getAuthorPhoto(),
        content: text,
      });
      queryClient.invalidateQueries({ queryKey: ['postComments'] });
    } catch {
      toast.error('Erreur lors du commentaire');
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await api.entities.PostComment.delete(commentId);
      queryClient.invalidateQueries({ queryKey: ['postComments'] });
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleDelete = async (postId) => {
    try {
      await api.entities.Post.delete(postId);
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Publication supprimée');
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const REPORT_REASONS = ['Contenu inapproprié', 'Harcèlement ou propos haineux', 'Spam ou publicité', 'Autre'];

  const openReport = (target) => {
    setMenuTarget(null);
    setReportReason('');
    setReportDetails('');
    setReportTarget(target);
  };

  const submitReport = async () => {
    if (!reportTarget || !reportReason) return;
    setReportSending(true);
    try {
      await api.entities.PostReport.create({
        post_id: reportTarget.type === 'post' ? reportTarget.id : null,
        comment_id: reportTarget.type === 'comment' ? reportTarget.id : null,
        reporter_name: user.full_name || user.email,
        reason: reportReason,
        details: reportDetails.trim() || null,
      });
      setReportTarget(null);
      toast.success('Signalement envoyé. Notre équipe le traite sous 24 h.');
    } catch (err) {
      toast.error(err?.message || "Erreur lors de l'envoi du signalement");
    } finally {
      setReportSending(false);
    }
  };

  const confirmBlock = async () => {
    if (!blockTarget) return;
    // On bloque sur la clé publique de l'auteur ; l'email ne sert plus que de repli
    // (staff, ou contenu venant d'une réponse mise en cache avant le déploiement).
    const payload = blockTarget.key
      ? { blocked_key: blockTarget.key, blocked_name: blockTarget.name }
      : blockTarget.email
        ? { blocked_email: blockTarget.email, blocked_name: blockTarget.name }
        : null;
    if (!payload) {
      toast.error('Impossible de bloquer cet utilisateur');
      setBlockTarget(null);
      return;
    }
    setBlocking(true);
    try {
      await api.entities.UserBlock.create(payload);
      queryClient.invalidateQueries({ queryKey: ['userBlocks'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['postComments'] });
      toast.success(`${blockTarget.name || 'Utilisateur'} bloqué. Vous ne verrez plus ses publications.`);
      setBlockTarget(null);
    } catch (err) {
      toast.error(err?.message || 'Erreur lors du blocage');
    } finally {
      setBlocking(false);
    }
  };

  // Admin : traiter un signalement (supprimer le contenu ou l'ignorer)
  const handleReport = async (report, action) => {
    setHandlingReport(report.id);
    try {
      await api.entities.PostReport.update(report.id, {
        status: action === 'delete' ? 'handled' : 'dismissed',
        handled_by: user.email,
        handled_at: new Date().toISOString(),
      });
      if (action === 'delete') {
        try {
          if (report.comment_id) await api.entities.PostComment.delete(report.comment_id);
          else if (report.post_id) await api.entities.Post.delete(report.post_id);
        } catch (err) {
          if (err?.status !== 404) throw err; // déjà supprimé : rien à faire
        }
      }
      queryClient.invalidateQueries({ queryKey: ['postReports'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['postComments'] });
      toast.success(action === 'delete' ? 'Contenu supprimé' : 'Signalement ignoré');
    } catch (err) {
      toast.error(err?.message || 'Erreur lors du traitement');
    } finally {
      setHandlingReport(null);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Communauté</p>
        <h1 className="font-sans text-2xl font-bold">Ca dit quoi le Gang ?</h1>
      </div>

      {/* Floating publish button */}
      <motion.button
        onClick={() => setShowComposer(true)}
        className="fixed bottom-24 right-5 z-50 w-14 h-14 rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30 flex items-center justify-center"
        animate={{ boxShadow: ['0 0 0 0 rgba(34,197,94,0.4)', '0 0 0 12px rgba(34,197,94,0)', '0 0 0 0 rgba(34,197,94,0.4)'] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        whileTap={{ scale: 0.9 }}
      >
        <Plus className="w-6 h-6" />
      </motion.button>

      {/* Composer drawer */}
      <AnimatePresence>
        {showComposer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/60"
              onClick={() => setShowComposer(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border-t border-border bg-background p-5"
            >
              <div className="flex justify-center mb-3">
                <div className="w-10 h-1 rounded-full bg-muted" />
              </div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-bold">Nouvelle publication</h3>
                <button onClick={() => setShowComposer(false)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {getAuthorPhoto() ? (
                    <img src={getAuthorPhoto()} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-muted-foreground">
                      {user?.full_name?.charAt(0) || '?'}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Quoi de neuf ? Partagez un moment, une photo..."
                    className="bg-secondary/50 border-border text-sm resize-none min-h-[80px]"
                    rows={3}
                    autoFocus
                  />
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground mt-2 ml-[52px] leading-relaxed">
                Respect et bienveillance : pas de propos offensants ni de contenu inapproprié. En publiant, vous acceptez les{' '}
                <LegalLink path="/cgu.html" className="text-primary underline">règles de la communauté</LegalLink>.
              </p>

              {imageUrl && (
                <div className="relative mt-3 ml-[52px] w-32">
                  <div className="rounded-xl overflow-hidden" style={{ aspectRatio: '4/5' }}>
                    <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                  <button
                    onClick={() => setImageUrl('')}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white text-xs"
                  >
                    ×
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between mt-4 ml-[52px]">
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    Photo
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </div>
                <Button
                  onClick={async () => { await createPost(); setShowComposer(false); }}
                  disabled={posting || (!content.trim() && !imageUrl)}
                  size="sm"
                  className="bg-primary text-primary-foreground text-xs rounded-full px-4"
                >
                  {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                  Publier
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Admin : signalements en attente */}
      {user?.role === 'admin' && reports.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-500/20">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-semibold text-foreground">Signalements en attente ({reports.length})</p>
          </div>
          <div className="divide-y divide-border">
            {reports.map(r => (
              <div key={r.id} className="px-4 py-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{r.reporter_name || r.reporter_email}</span>
                  {' '}a signalé {r.comment_id ? 'un commentaire' : 'une publication'} de{' '}
                  <span className="font-semibold text-foreground">{r.reported_name || r.reported_email || 'inconnu'}</span>
                  {' '}· {timeAgo(r.created_at)}
                </p>
                <p className="text-xs font-semibold text-amber-400">{r.reason}{r.details ? ` — ${r.details}` : ''}</p>
                {r.content_snapshot && (
                  <p className="text-xs text-foreground/80 bg-secondary/50 rounded-lg px-3 py-2 whitespace-pre-wrap line-clamp-4">{r.content_snapshot}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleReport(r, 'delete')}
                    disabled={handlingReport === r.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/15 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Supprimer le contenu
                  </button>
                  <button
                    onClick={() => handleReport(r, 'dismiss')}
                    disabled={handlingReport === r.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-muted-foreground text-xs font-semibold hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" /> Ignorer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Menu Signaler / Bloquer (feuille en bas d'écran) */}
      <AnimatePresence>
        {menuTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/60"
              onClick={() => setMenuTarget(null)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border-t border-border bg-background p-4 pb-8"
            >
              <div className="flex justify-center mb-3">
                <div className="w-10 h-1 rounded-full bg-muted" />
              </div>
              <p className="text-xs text-muted-foreground text-center mb-3">
                {menuTarget.type === 'comment' ? 'Commentaire' : 'Publication'} de {menuTarget.authorName || 'un membre'}
              </p>
              <button
                onClick={() => openReport(menuTarget)}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-secondary/60 hover:bg-secondary text-sm font-semibold text-foreground transition-colors"
              >
                <Flag className="w-4 h-4 text-amber-400" />
                Signaler {menuTarget.type === 'comment' ? 'ce commentaire' : 'cette publication'}
              </button>
              <button
                onClick={() => { setMenuTarget(null); setBlockTarget({ key: menuTarget.authorKey, email: menuTarget.authorEmail, name: menuTarget.authorName }); }}
                className="flex items-center gap-3 w-full px-4 py-3.5 mt-2 rounded-xl bg-secondary/60 hover:bg-secondary text-sm font-semibold text-red-400 transition-colors"
              >
                <Ban className="w-4 h-4" />
                Bloquer {menuTarget.authorName || 'cet utilisateur'}
              </button>
              <button onClick={() => setMenuTarget(null)} className="w-full px-4 py-3 mt-3 text-sm font-medium text-muted-foreground">
                Annuler
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Formulaire de signalement */}
      <AnimatePresence>
        {reportTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/60"
              onClick={() => !reportSending && setReportTarget(null)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border-t border-border bg-background p-5 pb-8 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-center mb-3">
                <div className="w-10 h-1 rounded-full bg-muted" />
              </div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-display text-base font-bold flex items-center gap-2">
                  <Flag className="w-4 h-4 text-amber-400" /> Signaler
                </h3>
                <button onClick={() => setReportTarget(null)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Pourquoi signalez-vous {reportTarget.type === 'comment' ? 'ce commentaire' : 'cette publication'} ? Notre équipe examine chaque signalement sous 24 h.
              </p>
              {reportTarget.content && (
                <p className="text-xs text-foreground/70 bg-secondary/50 rounded-lg px-3 py-2 mb-3 line-clamp-3 whitespace-pre-wrap">{reportTarget.content}</p>
              )}
              <div className="space-y-2">
                {REPORT_REASONS.map(reason => (
                  <button
                    key={reason}
                    onClick={() => setReportReason(reason)}
                    className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border text-sm transition-colors ${
                      reportReason === reason ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-secondary/40 text-muted-foreground'
                    }`}
                  >
                    {reason}
                    {reportReason === reason && <Check className="w-4 h-4 text-primary" />}
                  </button>
                ))}
              </div>
              <Textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Précisions (optionnel)"
                className="bg-secondary/50 border-border text-sm resize-none mt-3"
                rows={2}
              />
              <Button
                onClick={submitReport}
                disabled={!reportReason || reportSending}
                className="w-full mt-4 bg-primary text-primary-foreground rounded-full"
              >
                {reportSending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Envoyer le signalement'}
              </Button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirmation de blocage */}
      <AnimatePresence>
        {blockTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/60"
              onClick={() => !blocking && setBlockTarget(null)}
            />
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-5 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 pointer-events-auto"
              >
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
                  <Ban className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="font-display text-base font-bold text-center">Bloquer {blockTarget.name || 'cet utilisateur'} ?</h3>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Vous ne verrez plus ses publications ni ses commentaires. Vous pourrez le débloquer depuis vos Paramètres.
                </p>
                <div className="flex gap-2 mt-5">
                  <button
                    onClick={() => setBlockTarget(null)}
                    disabled={blocking}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-secondary text-foreground"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={confirmBlock}
                    disabled={blocking}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-red-500 text-white disabled:opacity-60 flex items-center justify-center"
                  >
                    {blocking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Bloquer'}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Posts */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : visiblePosts.length === 0 && !hasNextPage ? (
        <div className="text-center py-16">
          <MessageCircle className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aucune publication pour le moment</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Soyez le premier à publier !</p>
        </div>
      ) : (
        <div className="space-y-6">
          <AnimatePresence>
            {visiblePosts.map(post => (
              <GlassCard key={post.id}>
                <PostCard
                  post={post}
                  currentUser={user}
                  likes={likes}
                  comments={visibleComments}
                  onLike={handleLike}
                  onComment={handleComment}
                  onDelete={handleDelete}
                  onDeleteComment={handleDeleteComment}
                  getAuthorPhoto={getAuthorPhoto}
                  onOpenMenu={setMenuTarget}
                />
              </GlassCard>
            ))}
          </AnimatePresence>

          {/* Sentinelle du défilement infini (+ bouton de repli si l'observateur ne se déclenche pas) */}
          {hasNextPage && (
            <div ref={loadMoreRef} className="flex justify-center py-4">
              {isFetchingNextPage ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              ) : (
                <button
                  onClick={() => fetchNextPage()}
                  className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors px-4 py-2 rounded-full bg-secondary/60"
                >
                  Voir plus
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
