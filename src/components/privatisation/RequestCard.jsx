/**
 * Carte d'une demande de privatisation dans « Mes demandes » (`MyRequests.jsx`).
 * - en cours (`past` faux) : occasion, date, créneau, groupe, statut, frise d'avancement, prix
 *   d'un devis accepté, message du salon, phrase d'explication (`view.hint`) ;
 * - passée (`past` vrai, carte atténuée) : statut (Passée, Date passée, Devis refusé, Non retenue,
 *   Annulée), motif d'une annulation, message du salon ; devis d'une date passée : son montant,
 *   puis appeler le salon (plus d'acceptation en ligne) ou le refuser en deux taps, comme sur
 *   l'ancienne page.
 * En-tête : l'occasion n'est jamais coupée au milieu d'un mot ; quand la place manque (320 px),
 * la pastille de statut passe sous le titre.
 */
import React, { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Phone } from 'lucide-react';
import { formatPrice } from '@/components/services/serviceUtils';
import ProgressTracker from './ProgressTracker';
import { DeclinePanel, DetailLine, SalonMessage, useQuoteAnswer } from './QuoteCard';
import { useSalonPhone } from './usePrivatisation';
import { eventTypeIcon, eventTypeLabel, formatEventDate, requestAnchorId, slotOf } from './privatisationUtils';

const TONE_PILL = {
  amber: 'border-amber-500/30 bg-amber-500/12 text-amber-600 dark:text-amber-400',
  green: 'border-primary/30 bg-primary/10 text-primary',
  red: 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400',
  muted: 'border-border bg-secondary text-muted-foreground',
};

/** « Sam. 21 nov. · Journée · 9h – 20h · 8 pers. » (même texte que `slotLabel`, en morceaux insécables) */
function requestDetails(event, key) {
  const slot = slotOf(event?.time_slot);
  const guests = Number(event?.guest_count) > 0 ? `${event.guest_count} pers.` : '';
  return [formatEventDate(key, 'medium'), slot?.label, slot?.hours, guests];
}

export function StatusPill({ view }) {
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${TONE_PILL[view.tone] || TONE_PILL.muted}`}>
      {view.statusLabel}
    </span>
  );
}

/** « Devis accepté : 500 € » / « Devis du salon : 250 € » */
function PriceLine({ label, price, muted = false }) {
  return (
    <p className="mt-3.5 flex flex-wrap items-baseline gap-x-1.5 text-sm text-muted-foreground">
      {label}
      <span className={`whitespace-nowrap font-fut text-xl font-bold leading-none ${muted ? 'text-foreground/80' : 'text-foreground'}`}>
        {formatPrice(price)}
      </span>
    </p>
  );
}

export default function RequestCard({ event, view, past = false }) {
  const Icon = eventTypeIcon(event?.event_type);
  const reason = String(event?.cancellation_reason || '').trim();
  const showDecline = past && view.kind === 'expired' && view.canDecline;

  return (
    <article
      id={requestAnchorId(event?.id)}
      className={`scroll-mt-24 rounded-[20px] border p-4 ${past ? 'border-border/70 bg-card/60' : 'border-border bg-card'}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`flex shrink-0 items-center justify-center rounded-[14px] border ${
            past
              ? 'h-10 w-10 border-border bg-secondary text-muted-foreground'
              : 'h-[42px] w-[42px] border-primary/25 bg-primary/15 text-primary'
          }`}
        >
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          {/* Titre et pastille sur une ligne s'il y a la place, sinon la pastille passe dessous :
              le titre garde sa largeur de mot (jamais « Anniversair / e ») */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <h3 className={`break-normal text-[15px] font-semibold leading-tight ${past ? 'text-foreground/80' : 'text-foreground'}`}>
              {eventTypeLabel(event?.event_type)}
            </h3>
            <StatusPill view={view} />
          </div>
          <DetailLine parts={requestDetails(event, view.key)} className="mt-1 text-xs text-muted-foreground" />
        </div>
      </div>

      {!past && view.stage != null && <ProgressTracker stage={view.stage} className="mt-4" />}

      {view.kind === 'accepted' && view.price > 0 && (
        <PriceLine label="Devis accepté :" price={view.price} />
      )}

      {/* Devis jamais accepté dont la date est passée : son montant reste lisible (ancienne page) */}
      {showDecline && view.price > 0 && (
        <PriceLine label="Devis du salon :" price={view.price} muted />
      )}

      {past && view.kind === 'cancelled' && reason && (
        <p className="mt-3 break-words text-xs text-muted-foreground">Motif : {reason}</p>
      )}

      {event?.admin_notes && (
        <div className="mt-3">
          <SalonMessage text={event.admin_notes} compact />
        </div>
      )}

      {showDecline ? (
        <ExpiredQuoteActions event={event} view={view} />
      ) : view.hint ? (
        <p className="mt-3.5 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">{view.hint}</p>
      ) : null}
    </article>
  );
}

/** Devis jamais accepté dont la date est passée : appeler le salon, ou refuser en deux taps. */
function ExpiredQuoteActions({ event, view }) {
  const reduce = useReducedMotion();
  const { answer, busy, send } = useQuoteAnswer();
  const phone = useSalonPhone();
  const [confirming, setConfirming] = useState(false);
  const restoreFocus = useRef(false);
  const declineRef = (el) => {
    if (el && restoreFocus.current) {
      restoreFocus.current = false;
      el.focus();
    }
  };
  const sending = answer.isPending && String(answer.variables?.id) === String(event?.id);

  return (
    <div className="mt-3.5 border-t border-border pt-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {view.hint || 'La date est passée : contactez le salon.'}
      </p>
      <div className="mt-2.5">
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
                onConfirm={() => { send({ id: event.id, status: 'declined' }); }}
                sending={sending}
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
              className="grid grid-cols-2 gap-2"
            >
              <a
                href={phone.href}
                aria-label={`Contactez le salon au ${phone.display}`}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary px-2 text-center text-xs font-semibold text-foreground"
              >
                <Phone className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                Contactez le salon
              </a>
              <button
                ref={declineRef}
                type="button"
                onClick={() => setConfirming(true)}
                disabled={busy}
                className="min-h-[44px] rounded-xl border border-border px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                Refuser le devis
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
