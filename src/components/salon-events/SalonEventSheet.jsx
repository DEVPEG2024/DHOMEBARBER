import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  X, ChevronLeft, ChevronRight, Calendar, CalendarPlus, MapPin, Shirt, Ticket, Users, Clock,
  Check, Ban, Minus, Plus, PartyPopper, Sparkles,
} from 'lucide-react';
import { formatEventDate, formatPrice, isFree } from '@/lib/salonEventsApi';
import { openCalendar } from '@/lib/calendarLinks';
import { hapticFeedback } from '@/lib/capacitor';
import { CapacityGauge } from './SalonEventCard';
import {
  ACTIVE_PHASES, CALENDAR_TARGETS, EASE, RESPONSE_STYLE, buildSalonCalendarEvent, capacityInfo,
  eventImages, formatEventEnd, maxGuestsFor, myResponse, phaseLabel,
} from './salonEventUtils';

const SWIPE_OFFSET = 50;
const SWIPE_VELOCITY = 400;

/** Galerie : couverture puis photos, glissement au doigt, flèches et points (comme la fiche textile). */
function EventGallery({ images, title, reduceMotion }) {
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
      <div className="relative aspect-[4/3] bg-gradient-to-br from-[#171a19] to-[#0b0d0c] flex items-center justify-center overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-primary/20 to-transparent rounded-bl-full" />
        <PartyPopper className="w-20 h-20 text-white/10" strokeWidth={1} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/3] bg-secondary overflow-hidden select-none">
      <AnimatePresence initial={false} custom={direction}>
        <motion.img
          key={`${index}-${images[index]}`}
          src={images[index]}
          alt={`${title} — image ${index + 1} sur ${count}`}
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

/** Deux boutons Google Agenda / Apple-Outlook (mêmes cibles que Mes rendez-vous). */
function CalendarButtons({ onPick, dark = false }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {CALENDAR_TARGETS.map(({ kind, label }) => (
        <motion.button
          key={kind}
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => onPick(kind)}
          className={`flex items-center justify-center gap-1.5 h-10 rounded-xl border text-[11px] font-semibold transition-colors ${
            dark ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-secondary border-border text-foreground hover:bg-white/10'
          }`}
        >
          <CalendarPlus className="w-3.5 h-3.5 text-primary" />
          {label}
        </motion.button>
      ))}
    </div>
  );
}

/** Confirmation de l'acceptation : ondes, coche qui se dessine, « C'est noté ! », date, calendrier. */
function RsvpSuccess({ event, guests, onCalendar, onClose, reduceMotion }) {
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

      <div className="relative flex flex-col items-center text-center px-8 max-w-sm w-full">
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
          C'est noté !
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.5, ease: EASE }}
          className="text-sm text-white/70 mt-2"
        >
          {event.title}{guests > 1 ? ` · ${guests} places` : ''}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5, ease: EASE }}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-2 text-xs text-white"
        >
          <Calendar className="w-3.5 h-3.5 text-primary" />
          {formatEventDate(event.starts_at, { long: true })}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.05, duration: 0.45, ease: EASE }}
          className="mt-6 w-full flex flex-col items-center gap-3"
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/50 font-medium inline-flex items-center gap-1.5">
            <CalendarPlus className="w-3.5 h-3.5" /> Ajouter au calendrier
          </p>
          <div className="w-full">
            <CalendarButtons onPick={onCalendar} dark />
          </div>
          <button type="button" onClick={onClose} className="text-xs text-white/50 hover:text-white/80 py-2">
            Fermer
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function InfoRow({ icon: Icon, children, tone = '' }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone || 'text-primary'}`} />
      <div className="min-w-0 text-foreground">{children}</div>
    </div>
  );
}

/**
 * Fiche d'un événement du salon en bottom sheet : galerie, titre, prix, infos (date, fin, lieu,
 * prix, tenue, jauge), description complète, ma réponse, « Ajouter au calendrier » si j'ai
 * accepté, et RSVP tant que l'événement est à venir : « Je viens » avec sélecteur de places
 * (1..MAX_GUESTS, borné par le restant) / « Je ne peux pas ». Fermeture par la croix (ou Échap) :
 * jamais au tap sur le fond.
 */
export default function SalonEventSheet({ event, onClose, onRsvp, pending = false, reduceMotion = false }) {
  const images = useMemo(() => eventImages(event), [event]);
  const phase = event.phase || 'upcoming';
  const response = myResponse(event);
  const accepted = response === 'accepted';
  const declined = response === 'declined';
  const cap = capacityInfo(event);
  const canRespond = ACTIVE_PHASES.includes(phase) && event.status === 'published';
  const maxGuests = maxGuestsFor(event);
  const myGuests = accepted ? Math.max(1, Number(event.my_invite?.guests) || 1) : 1;
  const full = cap.full && !accepted;
  const end = formatEventEnd(event);
  const style = RESPONSE_STYLE[response];

  const [guests, setGuests] = useState(() => Math.min(Math.max(1, myGuests), Math.max(1, maxGuests)));
  const [success, setSuccess] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);

  // Mes places (après réponse ou rechargement) et le restant bornent le sélecteur
  useEffect(() => { setGuests(myGuests); }, [myGuests]);
  useEffect(() => { setGuests(g => Math.min(Math.max(1, g), Math.max(1, maxGuests))); }, [maxGuests]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const guestsChanged = accepted && guests !== myGuests;
  const canAccept = canRespond && !pending && maxGuests >= 1 && guests >= 1 && (!accepted || guestsChanged);

  const addToCalendar = (kind) => {
    hapticFeedback();
    const calendarEvent = buildSalonCalendarEvent(event);
    if (calendarEvent) openCalendar(kind, calendarEvent);
    setCalendarOpen(false);
  };

  const handleAccept = async () => {
    if (!canAccept) return;
    hapticFeedback();
    try {
      await onRsvp(event.id, { status: 'accepted', guests });
      if (accepted) {
        toast.success(`Places mises à jour : ${guests}`);
      } else {
        hapticFeedback();
        setSuccess({ guests });
      }
    } catch {
      // Le message du serveur est déjà en toast (hook) ; sur 409 le restant est rechargé.
    }
  };

  const handleDecline = async () => {
    if (!canRespond || pending) return;
    hapticFeedback();
    try {
      await onRsvp(event.id, { status: 'declined', guests: 1 });
      setConfirmDecline(false);
      toast.success("C'est noté, à une prochaine fois !");
    } catch {
      // idem
    }
  };

  const guestsLabel = (n) => `${n} place${n > 1 ? 's' : ''}`;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/65"
        aria-hidden="true"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
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
          <EventGallery images={images} title={event.title} reduceMotion={reduceMotion} />

          <div className="px-5 pt-4 pb-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-semibold inline-flex items-center gap-1.5">
                  {phase === 'cancelled' ? <Ban className="w-3 h-3 text-red-400" /> : <Sparkles className="w-3 h-3" />}
                  <span className={phase === 'cancelled' ? 'text-red-400' : ''}>{phaseLabel(phase)}</span>
                  <span className="text-muted-foreground">· {event.visibility === 'public' ? 'Ouvert à tous' : 'Sur invitation'}</span>
                </p>
                <h2 className="font-fut text-3xl font-extrabold uppercase leading-none text-foreground mt-1">{event.title}</h2>
              </div>
              <p className="font-fut text-3xl font-bold text-primary leading-none shrink-0">{formatPrice(event.price)}</p>
            </div>

            <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
              <InfoRow icon={Calendar}>
                <p className="font-semibold capitalize">{formatEventDate(event.starts_at, { long: true, withYear: true })}</p>
                {end && <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1"><Clock className="w-3 h-3" /> jusqu'à {end}</p>}
              </InfoRow>
              {event.location && (
                <InfoRow icon={MapPin}><p className="whitespace-pre-line">{event.location}</p></InfoRow>
              )}
              <InfoRow icon={Ticket}>
                <p>
                  {isFree(event) ? 'Offert par le salon' : <>{formatPrice(event.price)} <span className="text-xs text-muted-foreground">par personne, à régler au salon</span></>}
                </p>
              </InfoRow>
              {event.dress_code && (
                <InfoRow icon={Shirt}><p>Tenue : <span className="font-semibold">{event.dress_code}</span></p></InfoRow>
              )}
              {cap.capacity != null && (
                <div className="pt-1">
                  <CapacityGauge event={event} reduceMotion={reduceMotion} />
                </div>
              )}
            </div>

            {event.description && (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{event.description}</p>
            )}

            {/* Ma réponse */}
            {phase === 'cancelled' ? (
              <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-3 flex items-center gap-3 text-xs text-red-300">
                <Ban className="w-4 h-4 shrink-0 text-red-400" />
                Cet événement a été annulé par le salon.
              </div>
            ) : accepted ? (
              <div className="rounded-2xl bg-green-500/10 border border-green-500/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-green-400 inline-flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    {phase === 'past' ? 'Tu y étais' : 'Tu viens'} · {guestsLabel(myGuests)}
                  </p>
                  {phase !== 'past' && (
                    <button
                      type="button"
                      aria-expanded={calendarOpen}
                      onClick={() => { hapticFeedback(); setCalendarOpen(o => !o); }}
                      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold transition-colors ${calendarOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      Ajouter au calendrier
                    </button>
                  )}
                </div>
                <AnimatePresence initial={false}>
                  {calendarOpen && (
                    <motion.div
                      key="calendar-menu"
                      initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                    >
                      <CalendarButtons onPick={addToCalendar} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : declined ? (
              <div className="rounded-2xl bg-card border border-border p-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                {phase === 'past'
                  ? "Tu avais répondu que tu ne pouvais pas venir."
                  : "Tu as répondu que tu ne pouvais pas venir. Tu peux changer d'avis tant que l'événement n'a pas commencé."}
              </div>
            ) : phase === 'past' ? (
              <div className="rounded-2xl bg-card border border-border p-3 flex items-center gap-3 text-xs text-muted-foreground">
                <Clock className="w-4 h-4 shrink-0" />
                Cet événement est terminé.
              </div>
            ) : (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3 flex items-center gap-3 text-xs text-amber-200/90">
                <Users className="w-4 h-4 shrink-0 text-amber-400" />
                {response === 'open'
                  ? 'Ouvert à tous les clients du salon : inscris-toi ci-dessous.'
                  : 'Le salon attend ta réponse. Tu peux venir accompagné.'}
              </div>
            )}
          </div>
        </div>

        {/* Pied : RSVP (événement à venir) */}
        {canRespond && (
          <div className="border-t border-border px-5 pt-3 pb-6 shrink-0 bg-background space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{accepted ? 'Tes places' : 'Combien de places ?'}</p>
                <p className="text-[11px] text-muted-foreground">
                  {full
                    ? 'Complet, plus aucune place disponible'
                    : maxGuests >= 1
                      ? `Toi compris · ${maxGuests} max${cap.capacity != null && cap.left != null && !accepted ? ` (${cap.left} restante${cap.left > 1 ? 's' : ''})` : ''}`
                      : 'Aucune place disponible'}
                </p>
              </div>
              {!full && maxGuests >= 1 && (
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Moins de places" onClick={() => setGuests(g => Math.max(1, g - 1))} disabled={guests <= 1 || pending}
                    className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center active:scale-95 disabled:opacity-40">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-fut text-2xl font-bold w-7 text-center tabular-nums">{guests}</span>
                  <button type="button" aria-label="Plus de places" onClick={() => setGuests(g => Math.min(maxGuests, g + 1))} disabled={guests >= maxGuests || pending}
                    className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 disabled:opacity-40">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {(!accepted || guestsChanged) && (
              /* La pulsation est sur le conteneur, jamais sur l'élément motion (son transform inline serait écrasé) */
              <div className={`w-full rounded-2xl ${canAccept && !reduceMotion ? 'pulse-cta' : ''}`}>
                <motion.button
                  type="button"
                  whileTap={canAccept ? { scale: 0.97 } : undefined}
                  onClick={handleAccept}
                  disabled={!canAccept}
                  className="w-full h-[3.25rem] rounded-2xl bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/25 disabled:opacity-50 disabled:shadow-none inline-flex items-center justify-center gap-2"
                >
                  {pending
                    ? 'Envoi…'
                    : full
                      ? 'Complet'
                      : accepted
                        ? <><Check className="w-4 h-4" /> Mettre à jour · {guestsLabel(guests)}</>
                        : <><Check className="w-4 h-4" /> Je viens{guests > 1 ? ` · ${guestsLabel(guests)}` : ''}</>}
                </motion.button>
              </div>
            )}

            {!declined && (
              !confirmDecline ? (
                <button
                  type="button"
                  onClick={() => (accepted ? setConfirmDecline(true) : handleDecline())}
                  disabled={pending}
                  className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl text-sm font-medium text-muted-foreground bg-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  <Ban className="w-4 h-4" /> {accepted ? 'Je ne peux plus venir' : 'Je ne peux pas'}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDecline(false)}
                    disabled={pending}
                    className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-2xl text-xs font-medium text-muted-foreground bg-secondary hover:bg-white/10 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Non, je viens
                  </button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={handleDecline}
                    disabled={pending}
                    className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-2xl text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    <Ban className="w-3.5 h-3.5" /> {pending ? 'Envoi…' : 'Confirmer'}
                  </motion.button>
                </div>
              )
            )}
            {declined && (
              <p className="text-center text-[11px] text-muted-foreground">
                Tu peux revenir sur ta réponse avec « Je viens ».
              </p>
            )}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {success && (
          <RsvpSuccess
            key="success"
            event={event}
            guests={success.guests}
            reduceMotion={reduceMotion}
            onCalendar={addToCalendar}
            onClose={() => { setSuccess(null); onClose?.(); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
