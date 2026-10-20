/**
 * Devis reçu, en tête de la page Privatiser le salon (`view.needsAnswer`) : « À vous de répondre »,
 * prix du salon, prix par personne, message du salon, puis Accepter le devis / Une question ? /
 * Refuser. Règles reprises de l'ancienne page : refus en deux taps (« Refuser ce devis ? Le salon
 * sera prévenu. »), un seul envoi à la fois sur toute la page (`useQuoteAnswer` : deux taps à
 * quelques millisecondes d'écart n'envoient qu'une réponse ; boutons désactivés, roue sur le bouton
 * touché), devis d'une date passée non acceptable (lien pour appeler le salon).
 * Créneau privatisé entre-temps par un autre groupe (privatisations confirmées relues) : plus
 * d'« Accepter le devis », « appelez le salon » à la place ; le refus reste possible.
 *
 * Exporte aussi `SalonMessage`, `DeclinePanel`, `DetailLine`, `Spinner` et `useQuoteAnswer`, repris
 * par les cartes de « Mes demandes » (`RequestCard.jsx`).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { Check, MapPin, Phone, ThumbsDown } from 'lucide-react';
import AnimatedCounter from '@/components/motion/AnimatedCounter';
import { formatPrice } from '@/components/services/serviceUtils';
import { hapticFeedback } from '@/lib/capacitor';
import ProgressTracker from './ProgressTracker';
import {
  ANSWER_QUOTE_KEY, useAnswerQuote, useConfirmedEvents, useParisClock, useSalonPhone,
} from './usePrivatisation';
import {
  eventTypeIcon, eventTypeLabel, formatEventDate, pricePerPerson, requestAnchorId, slotOf, slotState,
} from './privatisationUtils';

/**
 * Verrou synchrone partagé par toutes les cartes de la page : `useIsMutating` et `isPending` ne
 * changent qu'au rendu suivant, trop tard pour un second tap 15 ms après le premier (deux envois,
 * deux toasts). Posé juste avant l'envoi, levé quand la mutation se termine (succès relu ou échec),
 * par la promesse de `mutateAsync` : le `onSettled` d'un appel à `mutate` n'est plus appelé une
 * fois la carte démontée (c'est le cas après une acceptation : le devis quitte la tête de page),
 * le verrou serait resté posé.
 */
let answerLocked = false;

/** Une réponse à un devis part déjà, depuis n'importe quelle carte (affichage : boutons grisés). */
export function useQuoteAnswerBusy() {
  return useIsMutating({ mutationKey: ANSWER_QUOTE_KEY }) > 0;
}

/**
 * Réponse à un devis depuis une carte : `{ answer, busy, send }`. `send({ id, status })` renvoie
 * `false` sans rien envoyer si une réponse est déjà partie (verrou, ou mutation en cours dans le
 * cache). Toasts et relectures : `useAnswerQuote`. Un 409 à l'acceptation (créneau privatisé
 * entre-temps par un autre groupe) relit aussi les créneaux pris : la carte remplace alors
 * « Accepter le devis » par « appelez le salon ».
 */
export function useQuoteAnswer() {
  const queryClient = useQueryClient();
  const answer = useAnswerQuote();
  const busy = useQuoteAnswerBusy() || answer.isPending;
  const { mutateAsync } = answer;
  const send = useCallback((variables) => {
    if (answerLocked || queryClient.isMutating({ mutationKey: ANSWER_QUOTE_KEY }) > 0) return false;
    answerLocked = true;
    const release = () => { answerLocked = false; };
    try {
      mutateAsync(variables)
        .catch((err) => {
          const status = err?.status ?? err?.response?.status;
          if (status === 409 && variables?.status === 'accepted') {
            queryClient.invalidateQueries({ queryKey: ['confirmedEvents'] });
          }
        })
        .finally(release);
    } catch (err) {
      release(); // jamais de verrou laissé posé si l'envoi n'a même pas pu partir
      throw err;
    }
    return true;
  }, [mutateAsync, queryClient]);
  return { answer, busy, send };
}

/** Roue d'envoi d'un bouton. */
export function Spinner({ className = 'border-white/30 border-t-white' }) {
  return <span aria-hidden="true" className={`h-4 w-4 animate-spin rounded-full border-2 ${className}`} />;
}

/** Bulle « Message du salon » (notes du devis, visibles par le client). */
export function SalonMessage({ text, compact = false }) {
  if (!String(text || '').trim()) return null;
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-xl bg-primary font-fut font-extrabold text-primary-foreground ${
          compact ? 'h-8 w-8 text-[13px]' : 'h-[34px] w-[34px] text-sm'
        }`}
      >
        DHB
      </span>
      <div className="min-w-0 flex-1 rounded-[4px_16px_16px_16px] border border-border bg-secondary px-3 py-2.5">
        <p className="text-[11px] font-semibold text-muted-foreground">Message du salon</p>
        <p className="mt-0.5 whitespace-pre-line break-words text-[13px] leading-snug text-foreground">{text}</p>
      </div>
    </div>
  );
}

/**
 * Confirmation du refus (deuxième tap) : « Non, garder » reçoit le focus à l'ouverture, « Oui,
 * refuser » affiche la roue pendant l'envoi.
 */
export function DeclinePanel({ onKeep, onConfirm, sending, disabled }) {
  const keepRef = useRef(null);
  useEffect(() => { keepRef.current?.focus(); }, []);
  return (
    <div role="group" aria-label="Confirmer le refus du devis" className="rounded-2xl border border-red-500/20 bg-red-500/5 p-3">
      <p className="mb-2 text-center text-xs text-foreground">Refuser ce devis ? Le salon sera prévenu.</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          ref={keepRef}
          type="button"
          onClick={onKeep}
          disabled={disabled}
          className="min-h-[44px] rounded-xl border border-border bg-secondary px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Non, garder
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled}
          aria-busy={sending || undefined}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-red-600 px-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {sending
            ? <><Spinner /><span className="sr-only">Envoi du refus…</span></>
            : <><ThumbsDown className="h-4 w-4" aria-hidden="true" />Oui, refuser</>}
        </button>
      </div>
    </div>
  );
}

/**
 * Ligne de détails « a · b · c » : chaque morceau reste d'un bloc (« 14h – 20h », « 8 pers. »),
 * la ligne ne passe à la ligne qu'entre deux morceaux, après le point (espace insécable avant :
 * jamais de ligne qui commence par « · »).
 */
export function DetailLine({ parts, className = '' }) {
  const items = (parts || []).filter(Boolean);
  return (
    <p className={`break-words ${className}`}>
      {items.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && ' · '}
          <span className="whitespace-nowrap">{part}</span>
        </React.Fragment>
      ))}
    </p>
  );
}

/** « Anniversaire · sam. 21 nov. · Journée · 8 pers. » */
function quoteDetails(event, key) {
  const guests = Number(event?.guest_count) > 0 ? `${event.guest_count} pers.` : '';
  return [eventTypeLabel(event?.event_type), formatEventDate(key, 'short'), slotOf(event?.time_slot)?.label || '', guests];
}

export default function QuoteCard({ event, view }) {
  const reduce = useReducedMotion();
  const { answer, busy, send } = useQuoteAnswer();
  const phone = useSalonPhone();
  const clock = useParisClock();
  const { index: blockedIndex } = useConfirmedEvents();
  const [confirming, setConfirming] = useState(false);
  // « Non, garder » : le focus revient sur « Refuser », remonté après l'animation de sortie du panneau
  const restoreFocus = useRef(false);
  const declineRef = (el) => {
    if (el && restoreFocus.current) {
      restoreFocus.current = false;
      el.focus();
    }
  };

  const Icon = eventTypeIcon(event?.event_type);
  const perPerson = pricePerPerson(view.price, event?.guest_count);
  // Créneau du devis privatisé entre-temps par un autre groupe (un créneau inconnu vaut la journée,
  // comme pour le serveur) : le serveur refuserait l'acceptation (409)
  const slotId = slotOf(event?.time_slot) ? event.time_slot : 'full_day';
  const slotTaken = view.canAccept && slotState(slotId, view.key, blockedIndex, clock) === 'taken';
  const mine = answer.isPending && String(answer.variables?.id) === String(event?.id);
  const sendingAccept = mine && answer.variables?.status === 'accepted';
  const sendingDecline = mine && answer.variables?.status === 'declined';
  const tap = reduce || busy ? undefined : { scale: 0.97 };

  const accept = () => {
    if (send({ id: event.id, status: 'accepted' })) hapticFeedback();
  };
  const decline = () => {
    send({ id: event.id, status: 'declined' });
  };

  return (
    <motion.section
      id={requestAnchorId(event?.id)}
      aria-labelledby={`${requestAnchorId(event?.id)}-title`}
      className="scroll-mt-24"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-amber-600 dark:text-amber-400">
        <span className="live-dot" aria-hidden="true" />
        À vous de répondre
      </p>

      <article className="relative overflow-hidden rounded-3xl border border-amber-500/35 bg-card ring-4 ring-amber-500/6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative p-4">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] border border-primary/25 bg-primary/15 text-primary">
              <Icon className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <h2 id={`${requestAnchorId(event?.id)}-title`} className="text-[17px] font-bold leading-tight text-foreground">
                Votre devis est prêt
              </h2>
              <DetailLine parts={quoteDetails(event, view.key)} className="mt-0.5 text-xs text-muted-foreground" />
            </div>
          </div>

          <ProgressTracker stage={2} currentLabel={'Accepté ?'} className="mt-4" />

          <div className="mt-[18px] text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Devis du salon</p>
            <p className="mt-1 break-words font-fut text-[52px] font-extrabold leading-none text-foreground min-[360px]:text-[64px]">
              <span className="sr-only">{formatPrice(view.price)}</span>
              <span aria-hidden="true">
                <AnimatedCounter
                  value={view.price}
                  format={(v) => formatPrice(v >= view.price ? view.price : Math.round(v))}
                />
              </span>
            </p>
            {perPerson != null && (
              <p className="mt-1.5 text-[13px] font-semibold text-primary">
                soit environ {formatPrice(perPerson)} par personne
              </p>
            )}
          </div>

          {event?.admin_notes && (
            <div className="mt-4">
              <SalonMessage text={event.admin_notes} />
            </div>
          )}

          <p className="mt-3.5 flex items-start justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <MapPin className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Rien à payer dans l'app : le règlement se fait au salon</span>
          </p>

          <div className="mt-3.5">
            <AnimatePresence mode="wait" initial={false}>
              {confirming ? (
                <motion.div
                  key="confirm"
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  <DeclinePanel
                    onKeep={() => { restoreFocus.current = true; setConfirming(false); }}
                    onConfirm={decline}
                    sending={sendingDecline}
                    disabled={busy}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="actions"
                  initial={reduce ? false : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  {slotTaken ? (
                    <div role="status" className="rounded-2xl border border-amber-500/35 bg-amber-500/8 p-3 text-center">
                      <p className="text-[13px] font-medium leading-snug text-foreground">
                        Ce créneau vient d'être privatisé par un autre groupe : appelez le salon.
                      </p>
                      <a
                        href={phone.href}
                        aria-label={`Appeler le salon au ${phone.display}`}
                        className="mt-2.5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground"
                      >
                        <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Appeler le salon
                      </a>
                    </div>
                  ) : view.canAccept ? (
                    <motion.button
                      type="button"
                      whileTap={tap}
                      onClick={accept}
                      disabled={busy}
                      aria-busy={sendingAccept || undefined}
                      className="flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground shadow-lg shadow-primary/30 transition-opacity disabled:opacity-60"
                    >
                      {sendingAccept
                        ? <><Spinner />Envoi…</>
                        : <><Check className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden="true" />Accepter le devis</>}
                    </motion.button>
                  ) : view.isPast && (
                    <a
                      href={phone.href}
                      className="flex min-h-[54px] w-full items-center justify-center rounded-2xl border border-border bg-secondary px-3 text-center text-sm font-semibold text-foreground"
                    >
                      Date passée : contactez le salon
                    </a>
                  )}
                  {/* Créneau pris : « Appeler le salon » remplace « Une question ? » (même numéro) */}
                  <div className={`mt-2 grid gap-2 ${slotTaken ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {!slotTaken && (
                      <a
                        href={phone.href}
                        aria-label={`Une question ? Appeler le salon au ${phone.display}`}
                        className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-[14px] border border-border px-2 text-center text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
                      >
                        <Phone className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
                        {'Une question ?'}
                      </a>
                    )}
                    {view.canDecline && (
                      <motion.button
                        ref={declineRef}
                        type="button"
                        whileTap={tap}
                        onClick={() => setConfirming(true)}
                        disabled={busy}
                        className="h-[46px] rounded-[14px] border border-border px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                      >
                        Refuser
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </article>
    </motion.section>
  );
}
