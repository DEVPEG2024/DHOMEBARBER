import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Flame, Check, Store, Clock, Minus, Plus, Lock, Sparkles, Timer, Ruler } from 'lucide-react';
import { categoryLabel, categoryEmoji, conceptAvailability, formatDropDate, formatPrice, msUntilOpen } from '@/lib/textileApi';
import { hapticFeedback } from '@/lib/capacitor';
import EmojiBurst from './EmojiBurst';
import { ColorSwatches } from './ConceptCard';
import { CompactCountdown } from './Countdown';
import { EASE, formatReservationWindow } from './textileUtils';

const SWIPE_OFFSET = 50;
const SWIPE_VELOCITY = 400;

/** Carrousel d'images : glissement au doigt (drag x), flèches et points. Une image = un élément
 *  absolu qui entre / sort dans le sens du geste, donc aucune mesure de largeur nécessaire. */
function ImageCarousel({ images, name, category, reduceMotion }) {
  const [[index, direction], setPage] = useState([0, 0]);
  const count = images.length;
  const go = (next) => {
    if (count <= 1) return;
    const clamped = ((next % count) + count) % count;
    setPage([clamped, next > index ? 1 : -1]);
  };
  const variants = {
    enter: (dir) => ({ x: reduceMotion ? 0 : dir > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: reduceMotion ? 0 : dir < 0 ? '100%' : '-100%', opacity: 0 }),
  };

  if (count === 0) {
    return (
      <div className="relative aspect-square bg-gradient-to-br from-[#171a19] to-[#0b0d0c] flex items-center justify-center">
        <span className="text-7xl opacity-70" aria-hidden="true">{categoryEmoji(category)}</span>
      </div>
    );
  }

  return (
    <div className="relative aspect-square bg-secondary overflow-hidden select-none">
      <AnimatePresence initial={false} custom={direction}>
        <motion.img
          key={`${index}-${images[index]}`}
          src={images[index]}
          alt={`${name} — image ${index + 1} sur ${count}`}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ x: { type: 'spring', stiffness: 320, damping: 32 }, opacity: { duration: 0.2 } }}
          drag={count > 1 ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.7}
          onDragEnd={(_e, info) => {
            if (info.offset.x < -SWIPE_OFFSET || info.velocity.x < -SWIPE_VELOCITY) go(index + 1);
            else if (info.offset.x > SWIPE_OFFSET || info.velocity.x > SWIPE_VELOCITY) go(index - 1);
          }}
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover touch-pan-y"
        />
      </AnimatePresence>

      {count > 1 && (
        <>
          <button type="button" onClick={() => go(index - 1)} aria-label="Image précédente"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center backdrop-blur-sm">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Image suivante"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center backdrop-blur-sm">
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
            {images.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                aria-label={`Image ${i + 1}`}
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/45'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Écran de succès de la réservation : ondes, coche qui se dessine, rappel du retrait. */
function ReserveSuccess({ concept, reservation, size, quantity, onShowReservations, onClose, reduceMotion }) {
  const expires = reservation?.expires_at ? formatDropDate(reservation.expires_at) : null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 70% 55% at 50% 45%, #0f1a15 0%, #07090c 70%)' }}
      role="dialog"
      aria-live="polite"
    >
      {!reduceMotion && [0, 0.18].map(d => (
        <motion.div
          key={d}
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{ scale: 6, opacity: [0, 0.6, 0] }}
          transition={{ duration: 1.4, delay: 0.25 + d, ease: EASE, opacity: { duration: 1.4, delay: 0.25 + d, times: [0, 0.15, 1] } }}
          className="absolute w-24 h-24 rounded-full border border-primary/70 pointer-events-none"
        />
      ))}

      <div className="relative flex flex-col items-center text-center px-8 max-w-sm">
        <div className="relative w-28 h-28 flex items-center justify-center">
          <motion.svg
            viewBox="0 0 120 120"
            className="absolute inset-0 w-full h-full"
            initial={{ rotate: 0, opacity: 0 }}
            animate={{ rotate: reduceMotion ? 0 : 360, opacity: 1 }}
            transition={{ rotate: { duration: 14, repeat: Infinity, ease: 'linear' }, opacity: { duration: 0.6, delay: 0.2 } }}
          >
            <circle cx="60" cy="60" r="56" fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="2 6" strokeLinecap="round" />
          </motion.svg>
          <motion.div
            initial={{ scale: reduceMotion ? 1 : 0 }}
            animate={{ scale: reduceMotion ? 1 : [0, 1.12, 1] }}
            transition={{ duration: 0.55, delay: 0.1, ease: EASE }}
            className="relative w-[88px] h-[88px] rounded-full bg-primary flex items-center justify-center"
            style={{ boxShadow: '0 0 0 6px hsl(var(--primary) / 0.15), 0 18px 40px -10px hsl(var(--primary) / 0.7)' }}
          >
            <svg viewBox="0 0 48 48" className="w-11 h-11" aria-hidden="true">
              <motion.path
                d="M12 25 L21 34 L37 16"
                fill="none"
                stroke="hsl(var(--primary-foreground))"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ pathLength: { duration: 0.5, delay: 0.4, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.1, delay: 0.4 } }}
              />
            </svg>
          </motion.div>
        </div>

        <motion.h2
          initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5, ease: EASE }}
          className="font-fut text-4xl font-extrabold uppercase text-white mt-7"
        >
          C'est réservé !
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.5, ease: EASE }}
          className="text-sm text-white/70 mt-2"
        >
          {concept.name}{size ? ` · Taille ${size}` : ''} × {quantity}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5, ease: EASE }}
          className="mt-4 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-left flex items-start gap-3"
        >
          <Store className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-white/80 leading-relaxed">
            Retrait et paiement au salon{expires ? <> avant le <span className="font-semibold text-white">{expires}</span></> : ''}.
            Passé ce délai, la pièce est remise en vente.
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.05, duration: 0.45, ease: EASE }}
          className="mt-6 w-full flex flex-col items-center gap-2"
        >
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={onShowReservations}
            className="w-full h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/30"
          >
            Voir mes réservations
          </motion.button>
          <button type="button" onClick={onClose} className="text-xs text-white/50 hover:text-white/80 py-2">
            Continuer à parcourir
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

/**
 * Fiche détail d'une pièce en bottom sheet : carrousel d'images, description, couleurs,
 * sélecteur de taille (restant par taille sur un drop ouvert, sondage de taille pour le vote),
 * vote « Je le veux », et sur un drop ouvert : quantité + « Réserver · prix ».
 */
export default function ConceptSheet({
  concept,
  drop = null,
  phase = null,
  nowMs,
  myVote,
  myActiveQty = 0,
  reserving = false,
  onClose,
  onToggleVote,
  onSetVoteSize,
  onReserve,
  onShowReservations,
  reduceMotion = false,
}) {
  const sizes = useMemo(() => (Array.isArray(concept.sizes) ? concept.sizes.filter(Boolean) : []), [concept.sizes]);
  const images = useMemo(() => (Array.isArray(concept.images) ? concept.images.filter(Boolean) : []), [concept.images]);
  const [selectedSize, setSelectedSize] = useState(() => (myVote?.size && sizes.includes(myVote.size) ? myVote.size : null));
  const [quantity, setQuantity] = useState(1);
  const [burst, setBurst] = useState(null);
  const [success, setSuccess] = useState(null);

  const voted = Boolean(myVote);
  const live = phase === 'live';
  const ended = phase === 'ended';
  const upcoming = phase === 'upcoming';
  const isLab = !concept.drop_id;
  const canVote = !ended;
  const votes = Number(concept.votes_count) || 0;
  const maxPerClient = Math.max(1, Number(concept.max_per_client) || 1);
  const availability = conceptAvailability(concept, selectedSize ?? undefined);
  const globalAvailability = conceptAvailability(concept);
  const soldOut = Boolean(concept.sold_out) || (globalAvailability.tracked && globalAvailability.soldOut);
  const sizeSoldOut = selectedSize != null && availability.tracked && availability.soldOut;

  let maxQty = Math.max(0, maxPerClient - myActiveQty);
  if (selectedSize != null && availability.tracked) maxQty = Math.min(maxQty, availability.remaining);
  useEffect(() => { setQuantity(q => Math.min(Math.max(1, q), Math.max(1, maxQty))); }, [maxQty]);

  const needsSize = sizes.length > 0 && selectedSize == null;
  const quotaReached = maxPerClient - myActiveQty <= 0;
  const canReserve = live && !soldOut && !sizeSoldOut && !needsSize && !quotaReached && maxQty >= 1 && !reserving;
  const total = (Number(concept.price) || 0) * quantity;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pickSize = (size) => {
    hapticFeedback();
    setSelectedSize(size);
    // Sondage de taille : un vote déjà posé se met à jour avec la taille choisie
    if (voted && canVote && myVote?.size !== size) onSetVoteSize?.(concept.id, size);
  };

  const handleVote = () => {
    if (!canVote) return;
    if (!voted && !reduceMotion) setBurst(Date.now());
    onToggleVote?.(concept, voted, selectedSize);
  };

  const handleReserve = async () => {
    if (!canReserve) return;
    hapticFeedback();
    try {
      const res = await onReserve(concept.id, { size: selectedSize ?? null, quantity });
      setSuccess({ reservation: res?.reservation || null, size: selectedSize, quantity });
    } catch {
      // Le message du serveur est déjà affiché en toast par le hook ; sur 409 le restant est rechargé.
    }
  };

  const remainingLabel = (size) => {
    if (!live) return null;
    const a = conceptAvailability(concept, size);
    if (!a.tracked) return null;
    if (a.soldOut) return 'Épuisé';
    return `${a.remaining} restant${a.remaining > 1 ? 's' : ''}`;
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/65"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={concept.name}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-[60] max-h-[92vh] rounded-t-3xl border-t border-border bg-background flex flex-col overflow-hidden"
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted" />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-sm"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <ImageCarousel images={images} name={concept.name} category={concept.category} reduceMotion={reduceMotion} />

          <div className="px-5 pt-4 pb-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-semibold">
                  {categoryLabel(concept.category)}{drop ? ` · ${drop.name}` : ' · Le Labo'}
                </p>
                <h2 className="font-fut text-3xl font-extrabold uppercase leading-none text-foreground mt-1">{concept.name}</h2>
              </div>
              <p className="font-fut text-3xl font-bold text-primary leading-none shrink-0">{formatPrice(concept.price)}</p>
            </div>

            {concept.description && (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{concept.description}</p>
            )}

            {Array.isArray(concept.colors) && concept.colors.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-2">Couleurs</p>
                <div className="flex flex-wrap items-center gap-2">
                  {concept.colors.filter(c => c && c.hex).map((c, i) => (
                    <span key={`${c.hex}-${i}`} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-secondary text-xs text-foreground">
                      <ColorSwatches colors={[c]} size="md" max={1} />
                      {c.name || c.hex}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {sizes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium inline-flex items-center gap-1.5">
                    <Ruler className="w-3.5 h-3.5" /> Ta taille ?
                  </p>
                  {!live && canVote && <p className="text-[10px] text-muted-foreground">Ton vote guide les quantités</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {sizes.map(size => {
                    const label = remainingLabel(size);
                    const disabled = live && label === 'Épuisé';
                    const active = selectedSize === size;
                    return (
                      <motion.button
                        key={size}
                        type="button"
                        whileTap={disabled ? undefined : { scale: 0.94 }}
                        disabled={disabled}
                        onClick={() => pickSize(size)}
                        aria-pressed={active}
                        className={`min-w-[3.25rem] px-3 py-2 rounded-xl border text-sm font-semibold flex flex-col items-center transition-colors ${
                          active
                            ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/25'
                            : disabled
                              ? 'bg-secondary/60 text-muted-foreground border-border opacity-50'
                              : 'bg-secondary text-foreground border-border hover:border-primary/50'
                        }`}
                      >
                        <span className={disabled ? 'line-through' : ''}>{size}</span>
                        {label && <span className={`text-[9px] font-medium ${active ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{label}</span>}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Vote */}
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-card border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
                  <Flame className={`w-4 h-4 ${votes > 0 ? 'text-orange-400' : 'text-muted-foreground'}`} />
                  {votes} {votes > 1 ? 'personnes le veulent' : 'personne le veut'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {ended ? 'Les votes sont clos pour ce drop.' : isLab ? 'Les pièces les plus votées passent en drop.' : 'Vote pour dire ce que tu attends.'}
                </p>
              </div>
              <span className="relative shrink-0">
                <motion.button
                  type="button"
                  whileTap={canVote ? { scale: 0.93 } : undefined}
                  onClick={handleVote}
                  disabled={!canVote}
                  aria-pressed={voted}
                  className={`inline-flex items-center gap-1.5 px-3.5 h-10 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 ${
                    voted ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30' : 'bg-secondary text-foreground hover:bg-primary/15'
                  }`}
                >
                  {voted ? <Check className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
                  Je le veux
                </motion.button>
                {burst && <EmojiBurst key={burst} emoji="🔥" onDone={() => setBurst(null)} />}
              </span>
            </div>

            {/* Contexte hors drop ouvert */}
            {upcoming && drop && (
              <div className="rounded-2xl bg-card border border-border p-3 flex items-center gap-3">
                <Timer className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0 text-xs">
                  <p className="font-semibold text-foreground">Réservable à l'ouverture du drop</p>
                  <p className="text-muted-foreground mt-0.5">
                    {msUntilOpen(drop, nowMs) != null
                      ? <>Dans <CompactCountdown ms={msUntilOpen(drop, nowMs)} className="text-foreground" /> · {formatDropDate(drop.starts_at)}</>
                      : 'Date bientôt annoncée'}
                  </p>
                </div>
              </div>
            )}
            {ended && (
              <div className="rounded-2xl bg-card border border-border p-3 flex items-center gap-3 text-xs text-muted-foreground">
                <Lock className="w-4 h-4 shrink-0" />
                Ce drop est terminé, cette pièce n'est plus réservable.
              </div>
            )}
            {isLab && (
              <div className="rounded-2xl bg-card border border-border p-3 flex items-center gap-3 text-xs text-muted-foreground">
                <Sparkles className="w-4 h-4 text-primary shrink-0" />
                Pièce du Labo : elle sortira dans un prochain drop si le Gang la plébiscite.
              </div>
            )}
            {live && myActiveQty > 0 && (
              <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Tu as déjà réservé {myActiveQty} pièce{myActiveQty > 1 ? 's' : ''} sur ce modèle (max {maxPerClient}).
              </p>
            )}
          </div>
        </div>

        {/* Pied : réservation (drop ouvert) */}
        {live && (
          <div className="border-t border-border px-5 pt-3 pb-6 shrink-0 bg-background space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground flex items-start gap-1.5 min-w-0">
                <Store className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Retrait et paiement au salon
                  {drop?.reservation_hours ? ` · sous ${formatReservationWindow(drop.reservation_hours)}` : ''}
                </span>
              </p>
              {!soldOut && !quotaReached && (
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Moins" onClick={() => setQuantity(q => Math.max(1, q - 1))} disabled={quantity <= 1}
                    className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center active:scale-95 disabled:opacity-40">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-fut text-xl font-bold w-6 text-center tabular-nums">{quantity}</span>
                  <button type="button" aria-label="Plus" onClick={() => setQuantity(q => Math.min(Math.max(1, maxQty), q + 1))} disabled={quantity >= maxQty}
                    className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 disabled:opacity-40">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* La pulsation est sur le conteneur, jamais sur l'élément motion (son transform inline serait écrasé) */}
            <div className={`w-full rounded-2xl ${canReserve && !reduceMotion ? 'pulse-cta' : ''}`}>
              <motion.button
                type="button"
                whileTap={canReserve ? { scale: 0.97 } : undefined}
                onClick={handleReserve}
                disabled={!canReserve}
                className="w-full h-[3.25rem] rounded-2xl bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/25 disabled:opacity-50 disabled:shadow-none inline-flex items-center justify-center gap-2"
              >
                {reserving
                  ? 'Réservation…'
                  : soldOut
                    ? 'Épuisé'
                    : quotaReached
                      ? `Maximum ${maxPerClient} par personne`
                      : sizeSoldOut
                        ? `Épuisé en ${selectedSize}`
                        : needsSize
                          ? 'Choisis ta taille'
                          : <>Réserver · <span className="font-fut text-lg">{formatPrice(total)}</span></>}
              </motion.button>
            </div>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {success && (
          <ReserveSuccess
            key="success"
            concept={concept}
            reservation={success.reservation}
            size={success.size}
            quantity={success.quantity}
            reduceMotion={reduceMotion}
            onShowReservations={() => { setSuccess(null); onShowReservations?.(); }}
            onClose={() => { setSuccess(null); onClose?.(); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
