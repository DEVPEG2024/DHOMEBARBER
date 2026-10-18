import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/apiClient';
import { fetchPublicBarbers } from '@/lib/publicBarbers';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Star, MessageSquare, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import LoadError, { isNetworkError } from '@/components/shared/LoadError';
import { contentFilterError } from '@/lib/contentFilter';
import { openExternalUrl } from '@/lib/capacitor';
import LegalLink from '@/components/shared/LegalLink';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const GOOGLE_PLACE_ID = 'ChIJm6cgTFprjEcRZsuEqhCEPXY';
const GOOGLE_REVIEW_URL = `https://search.google.com/local/writereview?placeid=${GOOGLE_PLACE_ID}`;
// Le client est passé par le lien Google depuis la fenêtre : on ne la lui remontre plus
const googleDoneKey = (userId) => `dhb-google-review-done:${userId || 'guest'}`;
const readGoogleDone = (userId) => {
  try { return localStorage.getItem(googleDoneKey(userId)) === '1'; } catch { return false; }
};

/**
 * Après un avis (quelle que soit la note : solliciter seulement les avis positifs est interdit par
 * le règlement des contenus de Google Maps) : « Publiez-le aussi sur Google ». Le commentaire est copié dans le
 * presse-papiers (à coller sur Google, qui n'accepte pas de texte prérempli), puis la page
 * d'avis Google du salon s'ouvre. Fermeture par la croix ou « Plus tard ».
 */
function GoogleReviewPrompt({ open, comment, userId, onClose }) {
  const [busy, setBusy] = useState(false);
  const goToGoogle = async () => {
    setBusy(true);
    // Copie et ouverture lancées dans le même geste, sans attente entre les deux : Safari
    // bloque un window.open qui suit un await
    let copying = null;
    try { copying = comment && navigator.clipboard ? navigator.clipboard.writeText(comment) : null; } catch { copying = null; }
    const opening = openExternalUrl(GOOGLE_REVIEW_URL);
    try { localStorage.setItem(googleDoneKey(userId), '1'); } catch { /* navigation privée */ }
    if (copying) {
      try {
        await copying;
        toast.success('Votre commentaire est copié : collez-le sur Google');
      } catch { /* presse-papiers refusé : le client retapera son texte */ }
    }
    await opening;
    setBusy(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-sm rounded-2xl">
        <DialogHeader>
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <Star className="w-6 h-6 text-primary fill-primary" />
          </div>
          <DialogTitle className="font-display text-center">Merci pour votre avis !</DialogTitle>
          <DialogDescription className="text-center">
            Un avis sur Google aide énormément le salon à se faire connaître. Ça prend 30 secondes.
            {comment ? ' Votre commentaire sera copié, il suffira de le coller.' : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 pt-1">
          <button type="button" onClick={goToGoogle} disabled={busy}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
            Publier aussi sur Google
            <ExternalLink className="w-4 h-4" />
          </button>
          <button type="button" onClick={onClose}
            className="w-full py-2.5 rounded-xl text-xs font-medium text-muted-foreground">
            Plus tard
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StarSelect({ rating, onRate }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} onClick={() => onRate(i)}>
          <Star className={`w-5 h-5 transition-colors ${i <= rating ? 'text-primary fill-primary' : 'text-muted-foreground/30'}`} />
        </button>
      ))}
    </div>
  );
}

// Plafond serveur : 5 avis par compte (au-delà, refus). Commentaire borné côté client.
const MAX_REVIEWS = 5;
const MAX_COMMENT = 1000;

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('fr-FR') : '');

/** Carte d'un avis : nom (onglet « Tous les avis »), étoiles, date, barber éventuel, commentaire. */
function ReviewCard({ review, index, showAuthor }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.04 }}
      className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {showAuthor && (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-sm font-bold text-primary border border-primary/20 shrink-0">
              {(review.client_name || 'C').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            {showAuthor && <p className="text-sm font-semibold text-foreground truncate">{review.client_name || 'Client'}</p>}
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} className={`w-3.5 h-3.5 ${s <= review.rating ? 'text-primary fill-primary' : 'text-muted-foreground/20'}`} />
              ))}
            </div>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDate(review.created_date)}</span>
      </div>
      {review.employee_name && <p className="text-[11px] text-primary/80 mb-1">avec {review.employee_name}</p>}
      {review.comment && <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line break-words">{review.comment}</p>}
      {/* Avis masqué par le salon (œil dans Admin → Avis) : son auteur le voit encore dans « Mes avis » */}
      {review.is_visible === false && (
        <div className="mt-2.5 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2">
          <p className="text-[11px] font-semibold text-amber-400">Masqué par le salon</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Cet avis n'est plus visible publiquement (contraire aux CGU, section 6). Contactez le salon pour en savoir plus.
          </p>
        </div>
      )}
    </motion.div>
  );
}

const TABS = [
  { key: 'all', label: 'Tous les avis' },
  { key: 'mine', label: 'Mes avis' },
];

/**
 * Avis (/reviews) : « Tous les avis » publiés (onglet par défaut, celui du « Voir tout » de
 * l'accueil) et « Mes avis » (menu Profil, `?tab=mine`). Avant, la page ne montrait que les avis
 * du client connecté : depuis l'accueil, on tombait sur « Aucun avis » alors que la section en
 * affichait.
 */
export default function MyReviews() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'mine' ? 'mine' : 'all';
  const setTab = (key) => setSearchParams(key === 'all' ? {} : { tab: key }, { replace: true });
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  // Les avis sont réservés aux clients : un compte du salon publierait un faux avis « Client »
  const canWrite = user?.role === 'user';
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  // Barber concerné (facultatif) : son nom part en `employee_name`, affiché « avec … » sur l'avis
  const [barberId, setBarberId] = useState('');
  // Fenêtre « aussi sur Google » après un avis : null = fermée, sinon le commentaire envoyé
  const [googlePrompt, setGooglePrompt] = useState(null);

  // Même requête et même clé que l'accueil (dédupliquée par React Query)
  const {
    data: allReviews = [], isLoading: allLoading, isError: allFailed, error: allError,
    refetch: refetchAll, isFetching: allFetching, isPending: allPending, fetchStatus: allFetchStatus,
  } = useQuery({
    queryKey: ['reviews'],
    queryFn: () => api.entities.Review.filter({ is_visible: true }, '-created_date', 500),
  });
  const stats = useMemo(() => {
    const rated = allReviews.filter(r => Number(r.rating) > 0);
    if (rated.length === 0) return null;
    const avg = rated.reduce((sum, r) => sum + Number(r.rating), 0) / rated.length;
    return { avg: avg.toFixed(1).replace('.', ','), count: rated.length };
  }, [allReviews]);

  const {
    data: myReviewsData, isLoading, isError: mineFailed, error: mineError,
    refetch: refetchMine, isFetching: mineFetching, isPending: minePending, fetchStatus: mineFetchStatus,
  } = useQuery({
    queryKey: ['myReviews', user?.email],
    queryFn: () => api.entities.Review.filter({ client_email: user?.email }, '-created_date', 50),
    enabled: !!user?.email,
  });
  const reviews = myReviewsData || [];
  // Liste reçue au moins une fois (un rechargement en échec garde les données, donc le plafond)
  const reviewsLoaded = myReviewsData !== undefined;
  // Hors connexion, une requête jamais chargée se met en pause (ni erreur ni chargement) : échec,
  // pas « Pas encore d'avis ». Une requête désactivée (sans email) reste « idle ».
  const allLoadFailed = (allFailed && allReviews.length === 0) || (allPending && allFetchStatus === 'paused');
  const mineLoadFailed = (mineFailed && !reviewsLoaded) || (minePending && mineFetchStatus === 'paused');
  // Plafond atteint seulement quand la liste est réellement chargée (une erreur ne bloque pas l'envoi)
  const limitReached = reviewsLoaded && reviews.length >= MAX_REVIEWS;

  // Lien de la demande d'avis (push / email) : /reviews?tab=mine&write=1 ouvre le formulaire
  // dès que mes avis sont chargés (au plafond, le bandeau existant suffit), puis retire `write`
  // pour qu'un rechargement ou un retour arrière ne le rouvre pas.
  const wantsWrite = searchParams.get('write') === '1';
  useEffect(() => {
    if (!wantsWrite || !reviewsLoaded) return;
    if (!limitReached && canWrite) setShowForm(true);
    setSearchParams({ tab: 'mine' }, { replace: true });
  }, [wantsWrite, reviewsLoaded, limitReached, setSearchParams]);

  // Même requête et même clé que l'accueil et le profil barber (barbers actifs)
  const { data: barbers = [] } = useQuery({
    queryKey: ['employees'],
    staleTime: 5 * 60 * 1000, // catalogue : change rarement
    queryFn: fetchPublicBarbers,
  });

  const createReview = useMutation({
    // `employee_name` n'est peut-être pas dans les champs acceptés à la création : sur un 400,
    // on renvoie l'avis sans le barber plutôt que de bloquer le client (un 400 d'une autre
    // cause échoue de nouveau et son message s'affiche)
    mutationFn: async (data) => {
      try {
        return await api.entities.Review.create(data);
      } catch (err) {
        if (err?.status !== 400 || !data.employee_name) throw err;
        const { employee_name: _ignored, ...rest } = data;
        return api.entities.Review.create(rest);
      }
    },
    onSuccess: (_created, sent) => {
      queryClient.invalidateQueries({ queryKey: ['myReviews'] });
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      // Proposée après tout avis, pas seulement les 5 étoiles (pas de sollicitation sélective)
      if (!readGoogleDone(user?.id)) {
        setGooglePrompt({ comment: sent.comment || '' });
      } else {
        toast.success('Merci pour votre avis !');
      }
      setShowForm(false);
      setRating(0);
      setComment('');
      setBarberId('');
      setTab('mine');
    },
    onError: (err) => {
      if (isNetworkError(err)) return toast.error('Pas de connexion internet. Réessayez dans un instant.');
      const msg = err?.message;
      toast.error(msg && !/^HTTP \d+$/.test(msg) && !(err instanceof TypeError) ? msg : 'Erreur lors de l\'envoi de votre avis');
    },
  });

  const handleSubmit = () => {
    if (rating === 0) return toast.error('Veuillez donner une note');
    if (limitReached) return toast.error(`Vous avez déjà publié ${MAX_REVIEWS} avis`);
    const filtered = contentFilterError(comment);
    if (filtered) return toast.error(filtered);
    // Nom, email et visibilité sont fixés par le serveur depuis le jeton : on n'envoie que l'avis
    const barber = barberId ? barbers.find(b => String(b.id) === String(barberId)) : null;
    const data = { rating, comment: comment.trim().slice(0, MAX_COMMENT) };
    if (barber?.name) data.employee_name = barber.name;
    createReview.mutate(data);
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 pt-8 pb-28">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-7">
          <p className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold mb-1">Témoignages</p>
          <h1 className="font-display text-3xl font-bold text-foreground">Avis clients</h1>
          <div className="h-0.5 w-12 mt-2 rounded-full bg-gradient-to-r from-primary to-primary/30" />
          <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
            Avis publiés par des clients connectés, sans vérification de visite. Classés du plus récent au plus ancien.
            Le salon peut retirer un avis contraire aux{' '}
            <LegalLink path="/cgu.html#avis" className="underline underline-offset-2 hover:text-primary">CGU</LegalLink>.
          </p>
        </motion.div>

        {stats && (
          <div className="flex items-center gap-3 mb-5">
            <span className="font-display text-4xl font-bold text-foreground">{stats.avg}</span>
            <div>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className={`w-4 h-4 ${s <= Math.round(Number(stats.avg.replace(',', '.'))) ? 'text-primary fill-primary' : 'text-muted-foreground/20'}`} />
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{stats.count} avis</p>
            </div>
          </div>
        )}

        <div className="flex p-1 rounded-2xl bg-white/4 border border-white/8 mb-6">
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`relative flex-1 h-10 rounded-xl text-xs font-semibold transition-colors ${tab === t.key ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
              {tab === t.key && <motion.span layoutId="reviews-tab" className="absolute inset-0 rounded-xl bg-primary" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <span className="relative">{t.label}{t.key === 'mine' && reviews.length > 0 ? ` (${reviews.length})` : ''}</span>
            </button>
          ))}
        </div>

        {tab === 'all' ? (
          allLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />)}
            </div>
          ) : allLoadFailed ? (
            <LoadError what="les avis" error={allError} onRetry={refetchAll} retrying={allFetching} />
          ) : allReviews.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/8 flex items-center justify-center mx-auto mb-5">
                <MessageSquare className="w-8 h-8 text-muted-foreground/25" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">Pas encore d'avis</p>
              <p className="text-xs text-muted-foreground mb-5">Soyez le premier à partager votre expérience.</p>
              {canWrite && (
                <button type="button" onClick={() => { setTab('mine'); setShowForm(true); }}
                  className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">
                  Écrire un avis
                </button>
              )}
            </div>
          ) : (
            <>
              {canWrite && (
                <button type="button" onClick={() => { setTab('mine'); setShowForm(true); }}
                  className="w-full py-3 rounded-2xl border border-primary/20 bg-primary/5 text-primary text-sm font-semibold mb-4 hover:bg-primary/10 transition-colors">
                  Écrire un avis
                </button>
              )}
              <div className="space-y-3">
                {allReviews.map((review, i) => <ReviewCard key={review.id} review={review} index={i} showAuthor />)}
              </div>
            </>
          )
        ) : (
        <>
        {/* Google Review CTA */}
        <motion.a
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          href={GOOGLE_REVIEW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5 mb-6 hover:bg-blue-500/10 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <Star className="w-5 h-5 text-blue-400 fill-blue-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Laisser un avis Google</p>
            <p className="text-[11px] text-muted-foreground">Aidez-nous en partageant votre expérience</p>
          </div>
          <ExternalLink className="w-4 h-4 text-blue-400 shrink-0" />
        </motion.a>

        {/* Write review */}
        {reviewsLoaded && (
          <p className="text-[11px] text-muted-foreground text-center -mt-3 mb-4">
            {Math.min(reviews.length, MAX_REVIEWS)}/{MAX_REVIEWS} avis publiés
          </p>
        )}
        {!canWrite ? (
          <div className="w-full py-3 px-4 rounded-2xl border border-white/8 bg-white/4 text-center text-xs text-muted-foreground mb-6">
            Les avis sont réservés aux clients ; gérez-les dans Admin → Avis.
          </div>
        ) : limitReached ? (
          <div className="w-full py-3 px-4 rounded-2xl border border-white/8 bg-white/4 text-center text-xs text-muted-foreground mb-6">
            Vous avez publié {MAX_REVIEWS} avis, le maximum par compte. Merci pour vos retours !
          </div>
        ) : !showForm ? (
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            onClick={() => setShowForm(true)}
            className="w-full py-3 rounded-2xl border border-primary/20 bg-primary/5 text-primary text-sm font-semibold mb-6 hover:bg-primary/10 transition-colors"
          >
            Écrire un avis sur l'app
          </motion.button>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl p-4 mb-6 space-y-4">
            <p className="text-sm font-semibold">Votre avis</p>
            <StarSelect rating={rating} onRate={setRating} />
            {barbers.length > 0 && (
              <select
                value={barberId}
                onChange={(e) => setBarberId(e.target.value)}
                aria-label="Barber (facultatif)"
                className="w-full h-10 bg-white/5 border border-white/10 rounded-xl px-3 text-sm text-foreground focus:outline-none focus:border-primary/40"
              >
                <option value="" className="bg-background text-foreground">Barber (facultatif)</option>
                {barbers.map(b => (
                  <option key={b.id} value={String(b.id)} className="bg-background text-foreground">{b.name}</option>
                ))}
              </select>
            )}
            <div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Partagez votre expérience..."
                rows={3}
                maxLength={MAX_COMMENT}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 resize-none"
              />
              {comment.length > MAX_COMMENT - 200 && (
                <p className="text-[10px] text-muted-foreground text-right mt-1">{comment.length}/{MAX_COMMENT}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 text-muted-foreground">
                Annuler
              </button>
              <button onClick={handleSubmit} disabled={createReview.isPending}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-primary text-primary-foreground disabled:opacity-60">
                {createReview.isPending ? 'Envoi...' : 'Envoyer'}
              </button>
            </div>
          </motion.div>
        )}

        {/* My reviews list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />)}
          </div>
        ) : mineLoadFailed ? (
          <LoadError what="vos avis" error={mineError} onRetry={refetchMine} retrying={mineFetching} />
        ) : reviews.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/8 flex items-center justify-center mx-auto mb-5">
              <MessageSquare className="w-8 h-8 text-muted-foreground/25" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">Vous n'avez pas encore laissé d'avis</p>
            <p className="text-xs text-muted-foreground">Partagez votre expérience après votre visite</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review, i) => <ReviewCard key={review.id} review={review} index={i} />)}
          </div>
        )}
        </>
        )}
      </div>

      <GoogleReviewPrompt
        open={!!googlePrompt}
        comment={googlePrompt?.comment || ''}
        userId={user?.id}
        onClose={() => setGooglePrompt(null)}
      />
    </div>
  );
}
