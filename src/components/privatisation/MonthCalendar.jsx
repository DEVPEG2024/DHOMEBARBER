/**
 * Calendrier du mois de la demande de privatisation (étape Date de `RequestSheet`) : flèches de
 * mois, initiales des jours (lundi d'abord), une case-bouton par jour avec son état (passé,
 * complet, demi-journée déjà prise, libre) et la légende. Le mois affiché suit la date choisie ;
 * il ne remonte jamais avant le mois en cours ni ne dépasse `MAX_MONTHS_AHEAD` mois.
 *
 * Cases d'au moins 44 × 44 px (cible tactile) : la grille fait toujours 308 px de large au moins
 * (7 × 44). Sous 334 px de largeur disponible, le cadre perd sa marge intérieure puis déborde un
 * peu dans les marges de la page (`CARD_FIT`), sans jamais dépasser de l'écran.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { hapticFeedback } from '@/lib/capacitor';
import {
  MAX_MONTHS_AHEAD, WEEKDAY_INITIALS, addMonths, dateOfKey, dayState, monthGrid, monthOfKey, monthTitle,
  monthsBetween, parisClock,
} from '@/components/privatisation/privatisationUtils';

/** État d'un jour lu par un lecteur d'écran, après la date. */
const STATE_TEXT = {
  free: 'disponible',
  partial: 'une demi-journée déjà prise',
  full: 'complet',
  past: 'passé',
};

// Le mois glisse dans le sens de la navigation (suivant → entre par la droite). Le mois qui sort
// ne reçoit plus aucun tap : invisible mais encore posé au-dessus, il ferait choisir un de ses jours.
const monthVariants = {
  enter: ({ dir, reduce }) => (reduce ? { opacity: 0 } : { opacity: 0, x: dir > 0 ? 32 : dir < 0 ? -32 : 0 }),
  center: { opacity: 1, x: 0, pointerEvents: 'auto' },
  exit: ({ dir, reduce }) => (reduce
    ? { opacity: 0, pointerEvents: 'none' }
    : { opacity: 0, x: dir > 0 ? -32 : dir < 0 ? 32 : 0, pointerEvents: 'none' }),
};

/**
 * Largeur du cadre : 7 cases de 44 px + 2 px de bordure = 310 px au moins. Les pourcentages des
 * marges et des marges intérieures se rapportent à la largeur du parent : au-delà de 334 px de
 * parent, marge intérieure de 12 px comme avant ; en dessous, elle fond jusqu'à 0, puis le cadre
 * s'étend dans les marges de la page (11 px de chaque côté à 320 px d'écran, il reste 5 px au bord).
 */
const CARD_FIT = {
  marginInline: 'min(0px, calc((100% - 310px) / 2))',
  paddingInline: 'clamp(0px, calc((100% - 310px) / 2), 12px)',
};

/** Ramène un mois dans la plage proposée : du mois en cours à `MAX_MONTHS_AHEAD` mois plus tard. */
function clampMonth(month, minMonth) {
  const offset = monthsBetween(minMonth, month);
  if (offset < 0) return { year: minMonth.year, month: minMonth.month };
  if (offset > MAX_MONTHS_AHEAD) return addMonths(minMonth, MAX_MONTHS_AHEAD);
  return { year: month.year, month: month.month };
}

export default function MonthCalendar({ value, onChange, index, clock }) {
  const reduceMotion = useReducedMotion();
  const now = clock || parisClock();
  const minMonth = monthOfKey(now.key);
  // Lu par l'effet « suivre la date » sans en dépendre (l'horloge change chaque minute)
  const minRef = useRef(minMonth);
  minRef.current = minMonth;

  // `dir` : sens du dernier changement de mois (1 suivant, -1 précédent, 0 aucun)
  const [view, setView] = useState(() => ({ ...clampMonth(monthOfKey(value || now.key), minMonth), dir: 0 }));

  // La date choisie passe dans un autre mois (choisie ailleurs, brouillon repris) : on la suit
  useEffect(() => {
    if (!value) return;
    const target = clampMonth(monthOfKey(value), minRef.current);
    setView(prev => {
      const delta = monthsBetween(prev, target);
      return delta === 0 ? prev : { ...target, dir: delta > 0 ? 1 : -1 };
    });
  }, [value]);

  // Passage à un nouveau jour (minuit, retour au premier plan) : le mois affiché reste dans la plage
  useEffect(() => {
    const min = monthOfKey(now.key);
    setView(prev => {
      const next = clampMonth(prev, min);
      const delta = monthsBetween(prev, next);
      return delta === 0 ? prev : { ...next, dir: delta > 0 ? 1 : -1 };
    });
  }, [now.key]);

  const offset = monthsBetween(minMonth, view);
  const canPrev = offset > 0;
  const canNext = offset < MAX_MONTHS_AHEAD;

  const go = (delta) => {
    if ((delta < 0 && !canPrev) || (delta > 0 && !canNext)) return;
    hapticFeedback();
    setView(prev => {
      const next = addMonths(prev, delta);
      const off = monthsBetween(minRef.current, next);
      if (off < 0 || off > MAX_MONTHS_AHEAD) return prev;
      return { ...next, dir: delta };
    });
  };

  const cells = useMemo(() => monthGrid({ year: view.year, month: view.month }).flat(), [view.year, view.month]);
  const title = monthTitle(view);

  const pick = (key) => {
    hapticFeedback();
    onChange?.(key);
  };

  return (
    <div className="rounded-[20px] border border-border bg-card pb-3 pt-2.5" style={CARD_FIT}>
      <div className="flex items-center justify-between px-0.5">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={!canPrev}
          aria-label="Mois précédent"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-foreground/80 transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        <p className="font-fut text-xl font-bold uppercase tracking-[0.04em] text-foreground" aria-live="polite">
          {title}
        </p>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={!canNext}
          aria-label="Mois suivant"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-foreground/80 transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>

      <div className="mb-1 mt-0.5 grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground" aria-hidden="true">
        {WEEKDAY_INITIALS.map((d, i) => <span key={i}>{d}</span>)}
      </div>

      {/* Marges négatives : l'ombre du jour choisi n'est pas coupée par le cadre du glissement */}
      <div className="relative -mx-1.5 -my-1.5 overflow-hidden px-1.5 py-1.5">
        <AnimatePresence mode="popLayout" initial={false} custom={{ dir: view.dir, reduce: reduceMotion }}>
          <motion.div
            key={`${view.year}-${view.month}`}
            role="group"
            aria-label={title}
            custom={{ dir: view.dir, reduce: reduceMotion }}
            variants={monthVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={reduceMotion
              ? { duration: 0.12 }
              : { x: { type: 'spring', stiffness: 380, damping: 34 }, opacity: { duration: 0.18 } }}
            className="grid grid-cols-7 gap-y-0.5"
          >
            {cells.map((cell, i) => {
              if (!cell) return <span key={`vide-${i}`} aria-hidden="true" />;
              const state = dayState(cell.key, index, now);
              const unavailable = state === 'past' || state === 'full';
              const selected = cell.key === value;
              const isToday = cell.key === now.key;
              const label = `${format(dateOfKey(cell.key), 'EEEE d MMMM yyyy', { locale: fr })}${isToday ? ", aujourd'hui" : ''}, ${STATE_TEXT[state]}`;
              let look;
              if (selected && !unavailable) {
                look = 'bg-primary font-bold text-primary-foreground shadow-[0_6px_16px_hsl(var(--primary)/0.4)]';
              } else if (state === 'past') {
                look = 'cursor-not-allowed text-muted-foreground/40';
              } else if (state === 'full') {
                look = 'cursor-not-allowed text-muted-foreground/50 line-through';
              } else {
                look = 'text-foreground hover:bg-secondary';
              }
              // Jour choisi devenu indisponible (créneaux rechargés) : encadré, état visible
              const ring = selected && unavailable
                ? 'ring-2 ring-primary/60'
                : (isToday && !selected ? 'ring-1 ring-primary/40' : '');
              return (
                <button
                  key={cell.key}
                  type="button"
                  disabled={unavailable}
                  aria-pressed={selected}
                  aria-label={label}
                  onClick={() => pick(cell.key)}
                  className={`relative mx-auto flex h-11 w-full min-w-[44px] max-w-[48px] items-center justify-center rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${look} ${ring}`}
                >
                  {cell.day}
                  {state === 'partial' && (
                    <span
                      className={`absolute bottom-[3px] left-1/2 -ml-[2.5px] h-[5px] w-[5px] rounded-full ${selected ? 'bg-primary-foreground/80' : 'bg-amber-400'}`}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mx-1.5 mt-1.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/70 px-0.5 pt-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
          Une demi-journée déjà prise
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-muted-foreground/60 line-through" aria-hidden="true">14</span>
          Complet
        </span>
      </div>
    </div>
  );
}
