/**
 * Semaine de l'écran Créneau : sept jours (lundi → dimanche) avec, pour chacun, le nombre de
 * créneaux libres pour les prestations et le barber choisis (en orange quand il en reste peu), ou
 * pourquoi il n'y en a pas (complet, repos, fermé…). Flèches pour changer de semaine dans l'horizon
 * de réservation. Un jour sans place reste touchable : la page explique alors pourquoi.
 */
import React from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { emptyDayLabel } from '@/lib/availability';

/** En dessous de ce nombre de créneaux libres, le jour est « presque complet ». */
export const LOW_SLOTS = 3;

function dayAriaLabel(day) {
  const name = format(day.date, 'EEEE d MMMM', { locale: fr });
  if (day.status === 'past') return `${name} : passé`;
  if (day.status === 'beyond') return `${name} : pas encore ouvert à la réservation`;
  if (day.status === 'loading') return `${name} : chargement`;
  if (day.status === 'unknown') return `${name} : places inconnues (connexion)`;
  if (day.status === 'open') return `${name} : ${day.count} créneau${day.count > 1 ? 'x' : ''} libre${day.count > 1 ? 's' : ''}`;
  return `${name} : ${emptyDayLabel(day.reason)}`;
}

export default function WeekCalendar({ days = [], selectedKey, label, canPrev, canNext, onPrev, onNext, onSelect }) {
  const reduceMotion = useReducedMotion();
  return (
    // `id` + marge : cible du défilement quand un jour est touché (Booking.jsx, `chooseDay`)
    <section id="week-calendar" aria-labelledby="week-calendar-title" className="scroll-mt-3">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h2 id="week-calendar-title" className="text-[15px] font-semibold text-foreground first-letter:uppercase">{label}</h2>
        <div className="flex gap-1.5">
          <button type="button" onClick={onPrev} disabled={!canPrev} aria-label="Semaine précédente"
            className="w-11 h-11 rounded-xl border border-border bg-card flex items-center justify-center text-foreground disabled:text-muted-foreground/40 disabled:cursor-not-allowed hover:bg-secondary transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={onNext} disabled={!canNext} aria-label="Semaine suivante"
            className="w-11 h-11 rounded-xl border border-border bg-card flex items-center justify-center text-foreground disabled:text-muted-foreground/40 disabled:cursor-not-allowed hover:bg-secondary transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const selected = day.key === selectedKey;
          const disabled = day.status === 'past' || day.status === 'beyond';
          const open = day.status === 'open';
          const low = open && day.count <= LOW_SLOTS;
          const dim = !selected && (disabled || day.status === 'empty');
          return (
            <motion.button
              key={day.key}
              type="button"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.025, duration: 0.25, ease: 'easeOut' }}
              whileTap={disabled || reduceMotion ? undefined : { scale: 0.94 }}
              onClick={() => !disabled && onSelect(day)}
              disabled={disabled}
              aria-pressed={selected}
              aria-label={dayAriaLabel(day)}
              className={`min-w-0 h-[74px] rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-colors duration-300 ${
                selected
                  ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/25'
                  : dim
                    ? 'border-border/50 bg-transparent text-muted-foreground'
                    : 'border-border bg-card text-foreground hover:border-primary/40'
              } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <span className={`text-[10px] uppercase ${selected ? 'text-primary-foreground/85' : 'text-muted-foreground'}`}>
                {format(day.date, 'EEE', { locale: fr }).replace('.', '')}
              </span>
              <span className={`text-[17px] font-bold leading-none tabular-nums ${day.status === 'empty' && !selected ? 'line-through decoration-1' : ''}`}>
                {format(day.date, 'd')}
              </span>
              <span className={`text-[10px] leading-tight max-w-full truncate px-0.5 ${
                open
                  ? `font-bold ${selected ? '' : low ? 'text-amber-400' : 'text-primary'}`
                  : ''
              }`}>
                {day.status === 'loading'
                  ? <span className="inline-block w-4 h-2 rounded bg-current opacity-30 animate-pulse align-middle" />
                  : open ? day.count
                  : day.status === 'past' ? 'passé'
                  : day.status === 'beyond' || day.status === 'unknown' ? '—'
                  : emptyDayLabel(day.reason)}
              </span>
            </motion.button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Le chiffre = créneaux libres ce jour-là. <span className="text-amber-400">En orange</span> : presque complet.
      </p>
    </section>
  );
}
