import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Eye, Loader2, MessageCircle, MoreHorizontal, Share2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { trackPostView } from '@/lib/analytics';
import { hapticFeedback } from '@/lib/capacitor';
import { shareLastMinute } from '@/lib/lastMinute';
import { LastMinuteCard } from '@/components/home/LastMinuteSection';
import { AuthorAvatar, AuthorName } from '@/components/feed/AuthorLine';
import MediaGrid from '@/components/feed/MediaGrid';
import ReactionBar from '@/components/feed/ReactionBar';
import CommentPreview from '@/components/feed/CommentPreview';
import LookCard from '@/components/feed/LookCard';
import PollCard from '@/components/feed/PollCard';
import BeforeAfter from '@/components/feed/BeforeAfter';
import MomentCard from '@/components/feed/MomentCard';
import { imagesOf, initialsOf, timeAgo } from '@/lib/feed/rules';
import { sharePost } from '@/lib/feed/share';

/**
 * Avatar d'une personne du fil : un barber en portrait, avec ou sans photo (jamais rond ni carré,
 * format des photos de l'équipe), sinon rond (photo ou initiales, `AuthorAvatar`). `size` = hauteur
 * de l'avatar rond, en pixels.
 */
export function PersonAvatar({ name, photoUrl, role, size = 40 }) {
  if (role === 'barber') {
    const h = Math.round(size * 1.15);
    const w = Math.round(h * 0.705);
    return (
      <span className="rounded-lg overflow-hidden bg-secondary border border-border flex items-center justify-center flex-shrink-0" style={{ width: w, height: h }}>
        {photoUrl ? (
          <img src={photoUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <span className="font-bold text-muted-foreground" style={{ fontSize: Math.max(10, Math.round(size * 0.3)) }}>{initialsOf(name)}</span>
        )}
      </span>
    );
  }
  return <AuthorAvatar name={name} photoUrl={photoUrl} size={size} />;
}

/**
 * Publication vue (mesure d'audience, Admin → Trafic, et « N vues » de l'auteur) : au moins 60 % à
 * l'écran pendant 1 s, une fois par session et par publication (src/lib/analytics.js).
 */
function usePostSeen(ref, postId) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !postId || typeof IntersectionObserver === 'undefined') return undefined;
    let timer = null;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
        if (!timer) timer = setTimeout(() => { trackPostView(postId); io.disconnect(); }, 1000);
      } else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }, { threshold: [0, 0.6, 1] });
    io.observe(el);
    return () => { if (timer) clearTimeout(timer); io.disconnect(); };
  }, [ref, postId]);
}

/** Gros ❤️ au double tap sur une photo (fondu seul quand les animations sont réduites). */
function HeartPop({ stamp, onDone }) {
  const reduce = useReducedMotion();
  const timer = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  // Minuterie de disparition nettoyée au démontage (carte supprimée, fil quitté)
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <AnimatePresence>
      {stamp && (
        <motion.span
          key={stamp}
          aria-hidden="true"
          initial={reduce ? { opacity: 0 } : { scale: 0, opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { scale: [0, 1.3, 1], opacity: [0, 1, 1] }}
          exit={reduce ? { opacity: 0 } : { scale: 1.5, opacity: 0 }}
          transition={{ duration: reduce ? 0.2 : 0.45, ease: 'easeOut' }}
          onAnimationComplete={() => {
            clearTimeout(timer.current);
            timer.current = setTimeout(() => doneRef.current?.(), 400);
          }}
          className="absolute inset-0 flex items-center justify-center text-7xl pointer-events-none z-10"
          style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.45))' }}
        >
          ❤️
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/**
 * Corbeille en deux taps (mes publications ; l'admin : toutes) ou « … » (Signaler ou bloquer) sur
 * celles des autres. Rien au premier tap de la corbeille : elle demande confirmation.
 */
function CardActions({ item, user, onRemove, onOpenMenu }) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!user) return null;
  const canDelete = user.role === 'admin' || item.is_mine === true;

  if (canDelete) {
    if (!confirm) {
      return (
        <button
          type="button"
          onClick={() => { hapticFeedback(); setConfirm(true); }}
          aria-label="Supprimer la publication"
          className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground/50 hover:text-red-400 transition-colors flex-shrink-0"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      );
    }
    const confirmAndDelete = async () => {
      setDeleting(true);
      hapticFeedback();
      const ok = await onRemove?.(item);
      // Supprimée : la carte disparaît du cache. Échec : on revient à la corbeille.
      if (!ok) { setDeleting(false); setConfirm(false); }
    };
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => setConfirm(false)}
          disabled={deleting}
          aria-label="Garder la publication"
          className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={confirmAndDelete}
          disabled={deleting}
          className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-red-500 text-white text-xs font-semibold disabled:opacity-60"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
          Supprimer
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenMenu?.({
        type: 'post', id: item.id, authorKey: item.author_key, authorEmail: item.author_email,
        authorName: item.author_name, content: item.content,
      })}
      aria-label="Signaler ou bloquer"
      className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0"
    >
      <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}

const KIND_LABELS = { poll: 'Sondage', before_after: 'Avant / Après' };

/**
 * Une publication du fil (v2, et l'ancien fil assemblé par `legacyItem`) : en-tête auteur (avatar,
 * nom, étoile du salon / badge Barber, temps, « N vues » sur mes publications et pour l'admin),
 * corps selon le format, barre de réactions, 2 commentaires en aperçu, rangée Commenter / Partager.
 * Moment du Gang : la carte dorée (MomentCard) remplace l'en-tête et le cadre.
 *
 * @param {object} props
 * @param {object} props.item                         publication (forme du contrat)
 * @param {object} props.user                         compte connecté
 * @param {number} [props.now]                        horloge des cartes Last Minute
 * @param {boolean} [props.focused]                   publication ouverte par un lien (liseré vert)
 * @param {(item, emoji: string|null) => void} props.onReact
 * @param {(item, optionId: string) => void} props.onVote
 * @param {(item) => Promise<boolean>} props.onRemove
 * @param {(item) => void} props.onOpenComments
 * @param {(target) => void} props.onOpenMenu         Signaler / Bloquer (`target` de PostMenu)
 * @param {() => void} [props.onRetryReactions]       ancien fil : réactions en échec
 * @param {() => void} [props.onRetryComments]        ancien fil : commentaires en échec
 * @param {boolean} [props.reactionsRetrying]
 * @param {boolean} [props.commentsRetrying]
 */
export default function PostCard({
  item, user, now = Date.now(), focused = false,
  onReact, onVote, onRemove, onOpenComments, onOpenMenu,
  onRetryReactions, onRetryComments, reactionsRetrying = false, commentsRetrying = false,
}) {
  const cardRef = useRef(null);
  usePostSeen(cardRef, item.id);
  const reduce = useReducedMotion();
  const [heartPop, setHeartPop] = useState(null);
  const isAdmin = user?.role === 'admin';

  const react = (emoji) => onReact?.(item, emoji);

  // Double tap sur une photo : gros ❤️, et ❤️ posé si je n'ai pas encore réagi
  const handleDoubleTap = () => {
    if (!user) return;
    // Réactions non chargées (ancien fil) : on ne sait pas si j'ai déjà réagi, on recharge
    if (item.reactions_unavailable) { onRetryReactions?.(); return; }
    if (item.reactions_pending) return;
    setHeartPop(Date.now());
    hapticFeedback();
    if (!item.my_reaction) react('❤️');
  };

  const share = async () => {
    // Aucune attente avant le partage du navigateur (Safari le refuse hors du geste)
    const res = item.kind === 'last_minute' && item.lastMinuteSlot
      ? await shareLastMinute(item.lastMinuteSlot, now)
      : await sharePost(item);
    if (res === 'copied') toast.success('Lien copié');
    else if (res === 'failed') toast.error('Impossible de partager ce lien');
  };

  const openComments = () => onOpenComments?.(item);
  const enter = reduce ? { opacity: 0 } : { opacity: 0, y: 12 };

  // ─── Moment du Gang : la carte dorée seule (Commenter et Partager dedans, MomentCard) ───
  if (item.kind === 'moment') {
    return (
      <motion.div
        ref={cardRef}
        initial={enter}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className={`relative ${focused ? 'rounded-[18px] ring-2 ring-primary/70' : ''}`}
        data-post-id={item.id}
      >
        <MomentCard
          item={item}
          onCongratulate={(next) => react(next || null)}
          onComment={openComments}
          onShare={share}
          commentsCount={Number(item.comments_count) || 0}
        />
        <div className="absolute top-1.5 right-1.5 z-10">
          <CardActions item={item} user={user} onRemove={onRemove} onOpenMenu={onOpenMenu} />
        </div>
      </motion.div>
    );
  }

  // ─── Corps selon le format ───
  const text = String(item.content || '').trim();
  const textBlock = text ? (
    <p className="px-4 pb-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">{text}</p>
  ) : null;
  let body;
  switch (item.kind) {
    case 'last_minute':
      // Publication Last Minute du salon (posée par le serveur) : la carte de l'accueil, avec
      // Réserver et Envoyer à un ami, à la place du texte (gardé pour les apps plus anciennes)
      body = item.lastMinuteSlot
        ? <div className="px-4 pb-1"><LastMinuteCard slot={item.lastMinuteSlot} now={now} from="feed" /></div>
        : textBlock;
      break;
    case 'look':
      body = (
        <div className="px-4 relative">
          <LookCard item={item} onDoubleTap={handleDoubleTap} />
          <HeartPop stamp={heartPop} onDone={() => setHeartPop(null)} />
        </div>
      );
      break;
    case 'poll':
      body = (
        <div className="px-4">
          <PollCard
            item={item}
            onVote={(optionId) => onVote?.(item, optionId)}
            canSeeResults={isAdmin || !!item.is_mine || !!item.poll?.my_vote || !!item.poll?.closed}
          />
        </div>
      );
      break;
    case 'before_after':
      body = <div className="px-4"><BeforeAfter item={item} /></div>;
      break;
    default: {
      const images = imagesOf(item);
      body = (
        <>
          {textBlock}
          {images.length > 0 && (
            <div className="px-4">
              {/* Photos au format 4:5 (1080 × 1350) */}
              <div className="relative">
                <MediaGrid images={images} onDoubleTap={handleDoubleTap} />
                <HeartPop stamp={heartPop} onDone={() => setHeartPop(null)} />
              </div>
            </div>
          )}
        </>
      );
    }
  }

  const sub = [timeAgo(item.created_at), KIND_LABELS[item.kind]].filter(Boolean).join(' · ');
  const views = item.views == null ? null : Math.max(0, Number(item.views) || 0);

  return (
    <motion.div
      ref={cardRef}
      initial={enter}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      data-post-id={item.id}
      className={`bg-card border rounded-2xl overflow-hidden ${focused ? 'border-primary ring-2 ring-primary/35' : 'border-border'}`}
    >
      {/* En-tête auteur */}
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5">
        <PersonAvatar name={item.author_name} photoUrl={item.author_photo_url} role={item.author_role} size={38} />
        <div className="flex-1 min-w-0">
          <AuthorName name={item.author_name} role={item.author_role} />
          <p className="text-[11px] text-muted-foreground">
            {sub}
            {/* Mes publications (et l'admin : toutes) : membres qui l'ont vue */}
            {views != null && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-primary" data-testid="post-views" title="Membres qui ont vu cette publication">
                · <Eye className="w-3 h-3" aria-hidden="true" /> {views} vue{views > 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <CardActions item={item} user={user} onRemove={onRemove} onOpenMenu={onOpenMenu} />
      </div>

      {body}

      <ReactionBar
        item={item}
        onReact={react}
        disabled={!user || !!item.reactions_pending}
        unavailable={!!item.reactions_unavailable}
        onRetry={onRetryReactions}
        retrying={reactionsRetrying}
      />

      <CommentPreview
        item={item}
        onOpen={openComments}
        unavailable={!!item.comments_unavailable}
        onRetry={onRetryComments}
        retrying={commentsRetrying}
      />

      {/* Plus de champ de commentaire sous la carte : on écrit dans la fenêtre des commentaires */}
      <div className="grid grid-cols-2 border-t border-border mt-3">
        <button
          type="button"
          onClick={openComments}
          className="h-[46px] inline-flex items-center justify-center gap-2 text-[13px] font-semibold text-foreground/80 hover:text-foreground hover:bg-secondary/40 transition-colors"
        >
          <MessageCircle className="w-[18px] h-[18px]" aria-hidden="true" />
          Commenter
        </button>
        <button
          type="button"
          onClick={share}
          className="h-[46px] border-l border-border inline-flex items-center justify-center gap-2 text-[13px] font-semibold text-foreground/80 hover:text-foreground hover:bg-secondary/40 transition-colors"
        >
          <Share2 className="w-[18px] h-[18px]" aria-hidden="true" />
          Partager
        </button>
      </div>
    </motion.div>
  );
}
