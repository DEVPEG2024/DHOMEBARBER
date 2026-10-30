/**
 * Fil « New Gang » (/feed, et /admin/feed dans l'admin) : v2 du 30 oct. 2026.
 * Contrat : docs/fonctions/fil-new-gang-contrat.md (section 5).
 *
 * La page assemble : en-tête et cloche de l'activité, carte « Quoi de neuf », puces de filtre (v2),
 * Team of the Season et « Jeux » (côté client), signalements à traiter (admin), « N nouvelles
 * publications », cartes (PostCard) avec défilement infini, bouton flottant « Nouvelle
 * publication », et les fenêtres : composeur, commentaires, Signaler / Bloquer.
 *
 * Données et gestes : `useFeed` (src/lib/feed/useFeed.js), qui lit le fil v2 ou l'ancien fil selon
 * `features.feedV2` du serveur.
 *
 * Adresse : `?post=<id>` montre cette publication en tête, entourée (`&comments=1` ouvre ses
 * commentaires) ; `?compose=look&visit=<id>` ouvre le composeur en « Mon look » sur cette visite
 * (push « Ta coupe est toute fraîche »). Les paramètres sont retirés de l'adresse une fois lus.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2, MessageCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import LoadError, { queryFailed } from '@/components/shared/LoadError';
import GangLeaderboard from '@/components/gang/GangLeaderboard';
import { GamesFeedEntry } from '@/components/home/GamesSection';
import { markFeedSeen } from '@/lib/feed/feedApi';
import { updateFeedItem } from '@/lib/feed/feedCache';
import { useFeed } from '@/lib/feed/useFeed';
import FeedHeader, { WhatsNewCard, FeedFilters } from '@/components/feed/FeedHeader';
import NewPostsButton from '@/components/feed/NewPostsButton';
import ModerationPanel from '@/components/feed/ModerationPanel';
import PostCard from '@/components/feed/PostCard';
import PostMenu, { BlockConfirm } from '@/components/feed/PostMenu';
import ReportSheet from '@/components/feed/ReportSheet';
import CommentsSheet from '@/components/feed/CommentsSheet';
import Composer from '@/components/feed/Composer';

/** Formats que ce compte peut publier (look et avant / après : client ; sondage : admin). */
function canCompose(kind, role, legacy) {
  if (legacy) return kind === 'post';
  if (kind === 'look' || kind === 'before_after') return role === 'user';
  if (kind === 'poll') return role === 'admin';
  return kind === 'post';
}

const EMPTY_HINTS = {
  all: 'Sois le premier à publier !',
  salon: "Le salon n'a encore rien publié ici.",
  looks: "Aucun look partagé pour l'instant.",
  polls: "Aucun sondage pour l'instant.",
};

export default function Feed() {
  const { user, refreshUser } = useAuth();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const inAdmin = useLocation().pathname.startsWith('/admin');
  const [params, setParams] = useSearchParams();
  const role = user?.role || 'user';

  const [filter, setFilter] = useState('all');
  // Publication ouverte par un lien : `{ id, comments }` (`comments` : ouvrir ses commentaires)
  const [focus, setFocus] = useState(null);
  // Fenêtres : composeur `{ kind, visitId }`, commentaires `{ id, snap }`, Signaler / Bloquer
  const [composer, setComposer] = useState(null);
  const [comments, setComments] = useState(null);
  const [menu, setMenu] = useState(null);
  const [report, setReport] = useState(null);
  const [block, setBlock] = useState(null);
  // « N nouvelles publications » touché : caché jusqu'à la relecture du fil
  const [dismissedSince, setDismissedSince] = useState(null);

  // Publication supprimée (ou 404 sur un geste) : focus et commentaires vidés AVANT qu'elle sorte du
  // cache, sinon sa requête se relançait (roue) et un second toast « n'existe plus » suivait
  const onGone = (id) => {
    setFocus((f) => (f && String(f.id) === id ? null : f));
    setComments((c) => (c && c.id === id ? null : c));
  };
  const feed = useFeed(filter, { focusId: focus?.id || null, onGone });
  const { items, v2, legacy } = feed;
  const focusedItem = feed.focused.item;

  // Page Activité (cloche) chargée à la demande : préchargée dès que le fil s'affiche, sinon hors
  // connexion la cloche ouvrait « Une erreur est survenue »
  useEffect(() => { import('@/pages/FeedActivity').catch(() => {}); }, []);

  // La clé publique arrive par /me : si l'objet utilisateur ne l'a pas encore (inscription,
  // session ouverte avant le déploiement), on le rafraîchit une fois
  const keyRefreshed = useRef(false);
  useEffect(() => {
    if (user && !user.public_key && !keyRefreshed.current && refreshUser) {
      keyRefreshed.current = true;
      refreshUser();
    }
  }, [user, refreshUser]);

  // Fil vu (v2) : pastille de l'onglet et « nouvelles publications » remises à zéro
  const seenSent = useRef(false);
  useEffect(() => {
    if (!v2 || !user || seenSent.current) return;
    seenSent.current = true;
    markFeedSeen().then(() => qc.invalidateQueries({ queryKey: ['feed', 'unread'] }), () => {});
  }, [v2, user, qc]);

  // Paramètres d'adresse (lien d'un push, d'un partage, de l'écran Activité), retirés une fois lus
  const flagReady = feed.flagReady;
  useEffect(() => {
    const postId = params.get('post');
    const compose = params.get('compose');
    if (!postId && !compose) return;
    // Le composeur attend de savoir quel fil le serveur sert (formats v2 ou publication simple)
    if (compose && !flagReady) return;
    const next = new URLSearchParams(params);
    if (postId) {
      setFocus({ id: String(postId), comments: params.get('comments') === '1' });
      setFilter('all');
      next.delete('post');
      next.delete('comments');
      window.scrollTo({ top: 0 });
    }
    if (compose) {
      if (user && canCompose(compose, role, legacy)) setComposer({ kind: compose, visitId: params.get('visit') || null });
      next.delete('compose');
      next.delete('visit');
    }
    setParams(next, { replace: true });
  }, [params, setParams, flagReady, legacy, role, user]);

  // `&comments=1` : les commentaires s'ouvrent dès que la publication est là
  useEffect(() => {
    if (!focus?.comments || !focusedItem) return;
    setComments({ id: String(focusedItem.id), snap: focusedItem });
    setFocus((f) => (f ? { ...f, comments: false } : f));
  }, [focus, focusedItem]);

  // Publication supprimée, ou auteur bloqué : rien à montrer
  const focusNotFound = feed.focused.notFound;
  useEffect(() => {
    if (!focusNotFound) return;
    toast("Cette publication n'existe plus");
    setFocus(null);
  }, [focusNotFound]);

  // Last Minute ouvert par un lien dont le créneau est pris, commencé ou d'un autre jour
  const focusClosed = feed.focused.closed;
  useEffect(() => {
    if (!focusClosed) return;
    toast("Ce créneau n'est plus disponible");
    setFocus(null);
  }, [focusClosed]);

  // Bloquer l'auteur de la publication ouverte par un lien : elle part avant la relecture
  const onBlocked = (target) => {
    const it = focusedItem;
    if (!it) return;
    const sameKey = target.key && it.author_key === target.key;
    const sameEmail = target.email && it.author_email && String(it.author_email).toLowerCase() === String(target.email).toLowerCase();
    if (sameKey || sameEmail) setFocus(null);
  };

  // Défilement infini : page suivante quand la sentinelle approche de l'écran
  const loadMoreRef = useRef(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const scrollTop = () => window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });

  // « N nouvelles publications » : relire le fil, remonter en haut, fil vu
  const since = items[0]?.created_at || null;
  const showNewPosts = async () => {
    setDismissedSince(since);
    setFocus(null);
    scrollTop();
    await feed.refresh().catch(() => {});
    markFeedSeen().catch(() => {}).finally(() => qc.invalidateQueries({ queryKey: ['feed', 'unread'] }));
  };

  const findItem = (id) => {
    if (focusedItem && String(focusedItem.id) === id) return focusedItem;
    return items.find((it) => String(it.id) === id) || null;
  };
  // Toujours la publication à jour du cache (aperçu, nombre) ; sa copie si elle vient d'en sortir
  const commentsItem = comments ? findItem(comments.id) || comments.snap : null;
  const openComments = (item) => setComments({ id: String(item.id), snap: item });
  const onCountChange = (n) => {
    if (!commentsItem || !Number.isFinite(n)) return;
    if (legacy) qc.invalidateQueries({ queryKey: ['postComments'] });
    else updateFeedItem(qc, commentsItem.id, (it) => (it.comments_count === n ? it : { ...it, comments_count: n }));
  };

  const onPublished = () => {
    setComposer(null);
    setFocus(null);
    // Sa publication est en tête du fil « Tout »
    if (filter !== 'all') setFilter('all');
    if (legacy) qc.invalidateQueries({ queryKey: ['posts'] });
    scrollTop();
  };

  const cardProps = {
    user,
    now: feed.lastMinuteNow,
    onReact: feed.react,
    onVote: feed.vote,
    onRemove: feed.remove,
    onOpenComments: openComments,
    onOpenMenu: (target) => setMenu({ target, layer: 'base' }),
    onRetryReactions: feed.retryReactions,
    onRetryComments: feed.retryComments,
    reactionsRetrying: feed.reactionsRetrying,
    commentsRetrying: feed.commentsRetrying,
  };

  const listItems = focus ? items.filter((it) => String(it.id) !== String(focus.id)) : items;
  const focusQuery = feed.focused.query;
  let focusBlock = null;
  if (focus && v2 && !focusedItem) {
    if (focusQuery.isLoading || feed.focused.pending) {
      focusBlock = (
        <div className="flex justify-center py-6 rounded-2xl border border-primary/40 bg-card">
          <Loader2 className="w-5 h-5 animate-spin text-primary" aria-label="Chargement de la publication" />
        </div>
      );
    } else if (queryFailed(focusQuery) && !focusNotFound) {
      focusBlock = <LoadError compact what="la publication" error={focusQuery.error} onRetry={focusQuery.refetch} retrying={focusQuery.isFetching} />;
    }
  } else if (focus && focusedItem) {
    focusBlock = <PostCard key={`focus-${focusedItem.id}`} item={focusedItem} focused {...cardProps} />;
  }

  let list;
  if (feed.query.isLoading) {
    list = (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" aria-label="Chargement du fil" />
      </div>
    );
  } else if (queryFailed(feed.query)) {
    // Hors connexion ou en échec : jamais « Aucune publication »
    list = <LoadError what="le fil" error={feed.query.error} onRetry={() => feed.query.refetch()} retrying={feed.query.isFetching} />;
  } else if (listItems.length === 0 && !hasNextPage && !focusBlock) {
    list = (
      <div className="text-center py-16">
        <MessageCircle className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Aucune publication pour le moment</p>
        <p className="text-xs text-muted-foreground/60 mt-1">{EMPTY_HINTS[filter] || EMPTY_HINTS.all}</p>
      </div>
    );
  } else {
    list = (
      <div className="flex flex-col gap-4">
        {focusBlock}
        <AnimatePresence initial={false}>
          {listItems.map((item) => <PostCard key={item.id} item={item} {...cardProps} />)}
        </AnimatePresence>
        {/* Sentinelle du défilement infini (+ bouton de repli si l'observateur ne se déclenche pas) */}
        {hasNextPage && (
          <div ref={loadMoreRef} className="flex justify-center py-4">
            {isFetchingNextPage ? (
              <Loader2 className="w-5 h-5 animate-spin text-primary" aria-label="Chargement" />
            ) : (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors px-4 py-2 rounded-full bg-secondary/60"
              >
                Voir plus
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    // Côté client, mêmes marges que les autres pages (16 px) ; dans l'admin (/admin/feed), le
    // <main> d'AdminLayout fournit déjà les siennes
    <div className={`max-w-lg mx-auto ${inAdmin ? '' : 'px-4 py-6'}`}>
      <div className="flex flex-col gap-4 mb-6">
        <FeedHeader inAdmin={inAdmin} v2={v2} />
        {user && feed.flagReady && (
          <WhatsNewCard user={user} legacy={legacy} onCompose={(kind) => setComposer({ kind, visitId: null })} />
        )}
        {v2 && <FeedFilters value={filter} onChange={setFilter} />}
      </div>

      {/* Team of the Season (côté client seulement) : rien tant que personne n'y figure */}
      {!inAdmin && <GangLeaderboard variant="feed" />}

      {/* « Jeux » : entrée compacte vers la page des jeux, sous la Team of the Season ; rien sans
          jeu ouvert ni quand l'admin a masqué la catégorie « Jeux » de l'accueil */}
      {!inAdmin && <GamesFeedEntry className="mb-6" />}

      {/* Admin : signalements en attente (en échec : LoadError, jamais un panneau absent) */}
      <ModerationPanel user={user} />

      <NewPostsButton
        since={since}
        enabled={!!user && v2 && filter === 'all' && !!since && since !== dismissedSince}
        inAdmin={inAdmin}
        onShow={showNewPosts}
      />

      {list}

      {/* Bouton flottant : le composeur, publication simple (une fois le drapeau lu, comme la carte
          « Quoi de neuf » : le composeur doit savoir quel fil le serveur sert). Calé sur le bord droit
          de la colonne du fil (max-w-lg = 32rem) sur un grand écran, à 1,25rem du bord sur téléphone ;
          admin à partir de lg : la colonne est à droite du menu (260 px) */}
      {user && feed.flagReady && (
        <motion.button
          type="button"
          aria-label="Nouvelle publication"
          onClick={() => setComposer({ kind: 'post', visitId: null })}
          whileTap={reduce ? undefined : { scale: 0.9 }}
          className={`fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/40 flex items-center justify-center ${
            inAdmin
              ? 'right-[max(1.25rem,calc(50%-16rem+1.25rem))] lg:right-[max(1.25rem,calc((100%-260px)/2-16rem+1.25rem))]'
              : 'right-[max(1.25rem,calc(50%-16rem+1.25rem))]'
          }`}
        >
          {!reduce && (
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-primary/50 pointer-events-none"
              animate={{ scale: [1, 1.45], opacity: [0.5, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
          <Plus className="relative w-6 h-6" aria-hidden="true" />
        </motion.button>
      )}

      {/* Fenêtres (portail dans body, fermées par la croix) */}
      <AnimatePresence>
        {composer && user && (
          <Composer
            key="composer"
            user={user}
            initialKind={composer.kind}
            initialVisitId={composer.visitId}
            legacy={legacy}
            onClose={() => setComposer(null)}
            onPublished={onPublished}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {commentsItem && (
          <CommentsSheet
            key={`comments-${commentsItem.id}`}
            item={commentsItem}
            user={user}
            legacy={legacy}
            onClose={() => setComments(null)}
            onOpenMenu={(target) => setMenu({ target, layer: 'top' })}
            onCountChange={onCountChange}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menu && (
          <PostMenu
            key="menu"
            target={menu.target}
            layer={menu.layer}
            onClose={() => setMenu(null)}
            onReport={(target) => { setMenu(null); setReport({ target, layer: menu.layer }); }}
            onBlock={(target) => { setMenu(null); setBlock({ target, layer: menu.layer }); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {report && <ReportSheet key="report" target={report.target} user={user} layer={report.layer} onClose={() => setReport(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {block && <BlockConfirm key="block" target={block.target} layer={block.layer} onBlocked={onBlocked} onClose={() => setBlock(null)} />}
      </AnimatePresence>
    </div>
  );
}
