/**
 * Réservé, à régler au salon (planche 5) : frise en 3 étapes, puis chaque RDV tel que le serveur l'a
 * enregistré, avec son ajout au calendrier. La pluie de lames est celle de la réservation (décision
 * du propriétaire : succès en pluie de lames de rasoir), sans bloquer les boutons.
 */
import React, { useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { CalendarPlus, Check } from 'lucide-react';
import BladeBurst from '@/components/booking/BladeBurst';
import { formatPrice } from '@/components/services/serviceUtils';
import { calendarTargets, openCalendar } from '@/lib/calendarLinks';
import { hapticFeedback } from '@/lib/capacitor';
import { dayLabel, dayName, visitEvent, visitLabel } from './visitLabels';

/** « Ajouter au calendrier » d'un RDV : Google Agenda ou fichier .ics, comme Mes rendez-vous. */
export function VisitCalendar({ appointment, subscription }) {
  const [open, setOpen] = useState(false);
  const event = visitEvent(appointment, { visit: appointment.visit, duration: subscription?.service_duration, total: subscription?.visits });
  const targets = calendarTargets(event);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => { hapticFeedback(); setOpen(v => !v); }}
        className={`min-h-[44px] inline-flex items-center gap-1.5 text-xs font-semibold transition-colors ${open ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
        Ajouter au calendrier
      </button>
      {open && (
        <div className={`mt-1 grid ${targets.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
          {targets.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              onClick={() => { hapticFeedback(); openCalendar(kind, event); setOpen(false); }}
              className="min-h-[44px] px-2 flex items-center justify-center gap-1.5 rounded-xl bg-secondary border border-border text-xs font-semibold text-foreground hover:bg-secondary/70 transition-colors"
            >
              <CalendarPlus className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Coche et titre des écrans de succès (abonnement, reprise d'un RDV). */
export function SuccessHeading({ title, subtitle }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="relative flex flex-col items-center text-center gap-2.5">
      <BladeBurst reduceMotion={reduceMotion} />
      <span className="w-14 h-14 rounded-full bg-primary/15 text-primary flex items-center justify-center" aria-hidden="true">
        <Check className="w-7 h-7" strokeWidth={2.5} />
      </span>
      <h1 className="font-display text-[25px] leading-tight font-bold text-foreground">{title}</h1>
      <p className="text-sm text-foreground/85">{subtitle}</p>
    </div>
  );
}

export default function SubscriptionSuccess({ subscription }) {
  const visits = subscription.appointments || [];
  const first = visits[0] || null;
  const pending = subscription.status === 'pending';
  return (
    <div className="space-y-4">
      <SuccessHeading
        title={`Vos ${visits.length || subscription.visits} RDV sont réservés`}
        subtitle={pending ? 'Il reste à régler l\'abonnement au salon.' : 'Vos coupes sont sur votre carte.'}
      />

      <ol className="rounded-[18px] border border-border bg-card p-3.5 space-y-3.5">
        <li className="flex items-start gap-3">
          <span className="w-[26px] h-[26px] shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center" aria-hidden="true">
            <Check className="w-[15px] h-[15px]" strokeWidth={3} />
          </span>
          <p className="mt-0.5 text-sm text-foreground/85">{visits.length || subscription.visits} rendez-vous réservés</p>
        </li>
        <li className="flex items-start gap-3">
          <span className="w-[26px] h-[26px] shrink-0 rounded-full border-2 border-amber-500 text-amber-400 text-[13px] font-bold flex items-center justify-center" aria-hidden="true">2</span>
          <div className="min-w-0">
            <p className="mt-0.5 text-sm font-bold text-foreground">Régler {formatPrice(subscription.price)} au salon</p>
            {first && <p className="mt-0.5 text-[13px] text-muted-foreground">Au plus tard {dayName(first.date)}.</p>}
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span className="w-[26px] h-[26px] shrink-0 rounded-full border-2 border-border text-muted-foreground text-[13px] font-bold flex items-center justify-center" aria-hidden="true">3</span>
          <p className="mt-0.5 text-sm text-muted-foreground">{subscription.visits} coupes créditées sur votre carte</p>
        </li>
      </ol>

      <section aria-labelledby="abo-success-list">
        <h2 id="abo-success-list" className="text-sm font-bold text-foreground mb-2.5">Dans Mes rendez-vous</h2>
        <ul className="space-y-2">
          {visits.map((visit, i) => (
            <li key={visit.id} className="rounded-2xl border border-border bg-card px-3.5 pt-2.5 pb-1">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground break-words">{dayLabel(visit.date)} · {visit.start_time}</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{visitLabel(visit.visit, subscription.visits)} · {visit.employee_name}</p>
                </div>
                {i === 0 && pending && (
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-xs font-semibold">À régler</span>
                )}
              </div>
              <VisitCalendar appointment={visit} subscription={subscription} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
