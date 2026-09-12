import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, History, PartyPopper } from 'lucide-react';
import { hapticFeedback } from '@/lib/capacitor';
import { useMySalonEvents, useSalonEventRsvp } from './useSalonEvents';
import { splitSalonEvents, useNow } from './salonEventUtils';
import SalonEventCard from './SalonEventCard';
import SalonEventSheet from './SalonEventSheet';

/**
 * « Vos invitations » en tête de la page Événements : cartes des événements du salon à venir
 * (invitation nominative ou ouvert à tous), fiche en bottom sheet avec RSVP, et événements passés
 * / annulés repliés. Rend `null` sans aucun événement, pendant le chargement, ou si la route
 * `/salon-events/mine` échoue : la page des privatisations reste utilisable quoi qu'il arrive.
 */
export default function SalonEventsSection() {
  const reduceMotion = useReducedMotion();
  const { data, isError } = useMySalonEvents();
  const nowMs = useNow(60_000);
  const view = useMemo(() => splitSalonEvents(data, nowMs), [data, nowMs]);
  const { rsvp, pendingEventId } = useSalonEventRsvp();
  const [selectedId, setSelectedId] = useState(null);
  const [showPast, setShowPast] = useState(false);

  // La fiche lit toujours l'événement du cache (réponse optimiste, restant rechargé)
  const selected = useMemo(() => {
    if (selectedId == null) return null;
    return [...view.upcoming, ...view.past].find(e => String(e.id) === String(selectedId)) || null;
  }, [selectedId, view]);

  useEffect(() => {
    if (selectedId != null && !selected) setSelectedId(null);
  }, [selectedId, selected]);

  if (!data || isError || view.isEmpty) return null;

  const open = (event) => {
    hapticFeedback();
    setSelectedId(event.id);
  };
  const pendingCount = view.upcoming.filter(e => !e.my_invite || e.my_invite.status === 'invited').length;

  return (
    <section className="mb-8" aria-labelledby="salon-events-title">
      <div className="flex items-end justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-0.5 inline-flex items-center gap-1.5">
            <PartyPopper className="w-3.5 h-3.5" /> Le salon vous invite
          </p>
          <h2 id="salon-events-title" className="font-display text-2xl font-bold leading-tight">Vos invitations</h2>
        </div>
        {pendingCount > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/12 border border-amber-500/25 text-[11px] font-semibold text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            {pendingCount} à répondre
          </span>
        )}
      </div>

      {view.upcoming.length > 0 ? (
        <div className="space-y-4">
          {view.upcoming.map((event, i) => (
            <SalonEventCard key={event.id} event={event} index={i} onOpen={() => open(event)} reduceMotion={reduceMotion} />
          ))}
        </div>
      ) : (
        <div className="glass rounded-2xl p-4 text-center">
          <p className="text-xs text-muted-foreground">
            Aucun événement à venir pour le moment. On te prévient dès que le salon organise quelque chose.
          </p>
        </div>
      )}

      {view.past.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            aria-expanded={showPast}
            onClick={() => { hapticFeedback(); setShowPast(o => !o); }}
            className="w-full flex items-center justify-between gap-2 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="inline-flex items-center gap-2">
              <History className="w-3.5 h-3.5" />
              Événements passés · {view.past.length}
            </span>
            <motion.span animate={{ rotate: showPast ? 180 : 0 }} transition={{ duration: 0.2 }} className="inline-flex">
              <ChevronDown className="w-4 h-4" />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {showPast && (
              <motion.div
                key="past"
                initial={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="space-y-3 mt-1"
              >
                {view.past.map((event, i) => (
                  <SalonEventCard key={event.id} event={event} index={i} onOpen={() => open(event)} reduceMotion={reduceMotion} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="border-t border-border mt-8" />

      <AnimatePresence>
        {selected && (
          <SalonEventSheet
            key={selected.id}
            event={selected}
            onClose={() => setSelectedId(null)}
            onRsvp={rsvp}
            pending={pendingEventId != null && String(pendingEventId) === String(selected.id)}
            reduceMotion={reduceMotion}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
