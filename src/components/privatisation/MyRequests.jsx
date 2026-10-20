/**
 * « Mes demandes » de la page Privatiser le salon : demandes en cours (devis en préparation, devis
 * accepté) avec leur frise d'avancement, puis « Demandes passées » repliables. Les devis à
 * accepter et les privatisations confirmées sont en tête de page (`QuoteCard`, `ConfirmedTicket`),
 * pas ici.
 *
 *   const query = useMyEvents();
 *   const groups = groupRequests(query.data, clock);
 *   <MyRequests query={query} groups={groups} />
 *
 * Chargement : squelette ; échec : `LoadError` à la place de la liste (une liste en échec n'est
 * pas une liste vide), sauf avec `showError={false}` : la page l'affiche alors elle-même en haut
 * (un client qui arrive par la notification « devis prêt » le voit tout de suite) et la section
 * ne montre rien ; aucune demande en cours ni passée : rien. Titre : `#my-requests-title` (la page
 * y fait défiler en repli après l'envoi d'une demande).
 */
import React, { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import LoadError, { queryFailed } from '@/components/shared/LoadError';
import RequestCard from './RequestCard';

export default function MyRequests({ query, groups, showError = true }) {
  const reduce = useReducedMotion();
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyId = useId();

  if (query?.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Chargement de vos demandes">
        <div className="h-6 w-40 animate-pulse rounded-lg bg-secondary" />
        {[0, 1].map(i => (
          <div key={i} className="h-36 animate-pulse rounded-[20px] border border-border bg-card" />
        ))}
      </div>
    );
  }

  if (queryFailed(query)) {
    if (!showError) return null;
    return (
      <LoadError
        what="vos demandes"
        error={query.error}
        onRetry={query.refetch}
        retrying={query.isFetching}
        compact
      />
    );
  }

  const active = groups?.active || [];
  const history = groups?.history || [];
  if (active.length === 0 && history.length === 0) return null;

  const enter = (i) => ({
    initial: reduce ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, ease: 'easeOut', delay: reduce ? 0 : Math.min(i, 6) * 0.06 },
  });

  return (
    <section aria-labelledby="my-requests-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="my-requests-title" className="font-display text-[22px] font-bold text-foreground">Mes demandes</h2>
        {active.length > 0 && (
          <span className="text-xs text-muted-foreground">{active.length} en cours</span>
        )}
      </div>

      {active.length > 0 && (
        <ul role="list" className="space-y-3">
          {active.map(({ event, view }, i) => (
            <motion.li key={event.id} {...enter(i)}>
              <RequestCard event={event} view={view} />
            </motion.li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <div className={active.length > 0 ? 'mt-4' : ''}>
          <button
            type="button"
            aria-expanded={historyOpen}
            aria-controls={historyId}
            onClick={() => setHistoryOpen(open => !open)}
            className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 px-4 text-left text-sm font-semibold text-foreground/85 transition-colors hover:bg-card"
          >
            <span className="min-w-0">Demandes passées ({history.length})</span>
            <ChevronDown
              aria-hidden="true"
              className={`h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform duration-200 ${historyOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <div id={historyId}>
            <AnimatePresence initial={false}>
              {historyOpen && (
                <motion.ul
                  key="history"
                  role="list"
                  className="mt-3 space-y-3"
                  initial={{ opacity: 0, y: reduce ? 0 : -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduce ? 0 : -6 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  {history.map(({ event, view }, i) => (
                    <motion.li key={event.id} {...enter(i)}>
                      <RequestCard event={event} view={view} past />
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </section>
  );
}
