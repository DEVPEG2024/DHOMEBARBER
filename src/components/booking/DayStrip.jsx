/**
 * Jours de l'écran Créneau : bande qui défile au doigt sur tout l'horizon de réservation (comme
 * « Prochaines disponibilités »), avec des raccourcis par mois qui suivent le défilement. Chaque
 * jour montre le nombre de créneaux libres (orange quand il en reste peu) ou pourquoi il n'y en a
 * pas (complet, repos, fermé…). Un jour sans place reste touchable : la page explique pourquoi.
 * Les places se calculent au fil du défilement : `onVisibleRange` dit à la page quels jours sont
 * à l'écran, elle charge leurs semaines (en attendant, un trait pulse sous le numéro).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion, useReducedMotion } from 'framer-motion';
import { emptyDayLabel } from '@/lib/availability';
import { hapticFeedback } from '@/lib/capacitor';

/** En dessous de ce nombre de créneaux libres, le jour est « presque complet ». */
export const LOW_SLOTS = 3;
/** Marge gauche de la bande (`px-4`), retirée des défilements programmés. */
const PAD = 16;

const upperFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function dayAriaLabel(day) {
  const name = format(day.date, 'EEEE d MMMM', { locale: fr });
  if (day.status === 'past') return `${name} : passé`;
  if (day.status === 'loading') return `${name} : chargement`;
  if (day.status === 'unknown') return `${name} : places inconnues (connexion)`;
  if (day.status === 'open') return `${name} : ${day.count} créneau${day.count > 1 ? 'x' : ''} libre${day.count > 1 ? 's' : ''}`;
  return `${name} : ${emptyDayLabel(day.reason)}`;
}

export default function DayStrip({ days = [], selectedKey, onSelect, onVisibleRange }) {
  const reduceMotion = useReducedMotion();
  const stripRef = useRef(null);
  const dayRefs = useRef(new Map());
  const frame = useRef(0);
  const lastRange = useRef('');
  const firstScroll = useRef(true);
  const [visibleMonth, setVisibleMonth] = useState(() => days[0]?.key.slice(0, 7) || '');

  // Premier jour de chaque mois de l'horizon (raccourcis)
  const months = useMemo(() => days.reduce((acc, day, i) => {
    const key = day.key.slice(0, 7);
    if (!acc.length || acc[acc.length - 1].key !== key) {
      acc.push({ key, index: i, label: upperFirst(format(day.date, 'LLLL', { locale: fr })) });
    }
    return acc;
  }, []), [days]);

  // Jours à l'écran : mois affiché et semaines à charger (signalés seulement quand ils changent)
  const measure = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const left = strip.scrollLeft + PAD;
    const right = strip.scrollLeft + strip.clientWidth - PAD;
    const middle = (left + right) / 2;
    let first = null;
    let last = null;
    let center = null;
    for (const day of days) {
      const el = dayRefs.current.get(day.key);
      if (!el) continue;
      if (first === null && el.offsetLeft + el.offsetWidth / 2 >= left) first = day.key;
      if (center === null && el.offsetLeft + el.offsetWidth >= middle) center = day.key;
      if (el.offsetLeft <= right) last = day.key;
    }
    if (!first || !last) return;
    // Mois affiché : celui du jour au milieu de la bande (le premier jour visible est souvent la fin du mois d'avant)
    const month = (center || first).slice(0, 7);
    setVisibleMonth(prev => (prev === month ? prev : month));
    const signature = `${first}|${last}`;
    if (signature !== lastRange.current) {
      lastRange.current = signature;
      onVisibleRange?.({ firstKey: first, lastKey: last });
    }
  }, [days, onVisibleRange]);

  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(measure);
  };

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('resize', measure); cancelAnimationFrame(frame.current); };
  }, [measure]);

  /** Amène un jour en tête de bande (un jour avant lui reste visible pour le repère). */
  const scrollToIndex = (index, smooth) => {
    const strip = stripRef.current;
    const day = days[Math.max(0, index)];
    const el = day && dayRefs.current.get(day.key);
    if (!strip || !el) return;
    strip.scrollTo({ left: Math.max(0, el.offsetLeft - PAD), behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
  };

  // Jour choisi depuis ailleurs (jour proposé d'office, prochaine disponibilité, lien) : ramené à
  // l'écran s'il n'y est pas déjà ; la première fois sans animation
  useEffect(() => {
    if (!selectedKey) return;
    const strip = stripRef.current;
    const el = dayRefs.current.get(selectedKey);
    if (!strip || !el) return;
    const visible = el.offsetLeft - PAD >= strip.scrollLeft
      && el.offsetLeft + el.offsetWidth + PAD <= strip.scrollLeft + strip.clientWidth;
    if (!visible) {
      const index = days.findIndex(d => d.key === selectedKey);
      scrollToIndex(Math.max(0, index - 1), !firstScroll.current);
    }
    firstScroll.current = false;
  }, [selectedKey]);

  return (
    <section id="day-strip" aria-label="Choix du jour" className="scroll-mt-3">
      <div className="flex gap-2 mb-2.5 overflow-x-auto -mx-4 px-4 scrollbar-hide" role="group" aria-label="Aller au mois">
        {months.map(m => {
          const active = m.key === visibleMonth;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => { hapticFeedback(); setVisibleMonth(m.key); scrollToIndex(m.index, true); }}
              aria-pressed={active}
              className={`shrink-0 h-9 px-3.5 rounded-full text-xs font-semibold transition-colors duration-300 ${
                active ? 'bg-primary/15 text-primary border border-primary/40' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <div
        ref={stripRef}
        onScroll={onScroll}
        className="relative flex gap-2 overflow-x-auto snap-x snap-proximity scrollbar-hide -mx-4 px-4 pb-1 overscroll-x-contain"
        style={{ scrollPaddingLeft: PAD }}
      >
        {days.map((day, i) => {
          const selected = day.key === selectedKey;
          const disabled = day.status === 'past';
          const open = day.status === 'open';
          const low = open && day.count <= LOW_SLOTS;
          const dim = !selected && (disabled || day.status === 'empty');
          return (
            <motion.button
              key={day.key}
              ref={el => { if (el) dayRefs.current.set(day.key, el); else dayRefs.current.delete(day.key); }}
              type="button"
              initial={reduceMotion || i > 10 ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.03, duration: 0.28, ease: 'easeOut' }}
              whileTap={disabled || reduceMotion ? undefined : { scale: 0.94 }}
              onClick={() => !disabled && onSelect(day)}
              disabled={disabled}
              aria-pressed={selected}
              aria-label={dayAriaLabel(day)}
              className={`snap-start shrink-0 w-[60px] h-[78px] rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition-colors duration-300 ${
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
              <span className={`text-[18px] font-bold leading-none tabular-nums ${day.status === 'empty' && !selected ? 'line-through decoration-1' : ''}`}>
                {format(day.date, 'd')}
              </span>
              <span className={`text-[10px] leading-tight max-w-full truncate px-0.5 ${
                open ? `font-bold ${selected ? '' : low ? 'text-amber-400' : 'text-primary'}` : ''
              }`}>
                {day.status === 'loading'
                  ? <span className="inline-block w-4 h-1.5 rounded-full bg-current opacity-30 animate-pulse align-middle" />
                  : open ? day.count
                  : day.status === 'past' ? 'passé'
                  : day.status === 'unknown' ? '—'
                  : emptyDayLabel(day.reason)}
              </span>
            </motion.button>
          );
        })}
        {/* Fin de piste : le dernier jour peut venir en tête comme les autres */}
        <div aria-hidden="true" className="shrink-0" style={{ width: 1 }} />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Glissez pour voir les autres jours. Le chiffre = créneaux libres ; <span className="text-amber-400">en orange</span> : presque complet.
      </p>
    </section>
  );
}
