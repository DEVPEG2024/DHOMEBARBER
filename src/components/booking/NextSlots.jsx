/**
 * « Prochaines disponibilités » (écran Créneau) : les premiers créneaux libres, deux par jour au
 * plus, choisis en un tap (jour, heure et barber d'un coup). Rien quand il n'y en a aucun.
 */
import React from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion, useReducedMotion } from 'framer-motion';
import { Zap } from 'lucide-react';

const upperFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default function NextSlots({ items = [], loading = false, todayKey, tomorrowKey, selectedKey, selectedTime, showBarber = true, onSelect }) {
  const reduceMotion = useReducedMotion();
  if (!loading && items.length === 0) return null;

  const dayLabel = (item) => {
    if (item.key === todayKey) return 'Aujourd\'hui';
    if (item.key === tomorrowKey) return 'Demain';
    return upperFirst(format(item.date, 'EEE d MMM', { locale: fr }));
  };

  return (
    <section aria-labelledby="next-slots-title">
      <div className="flex items-baseline justify-between gap-2 mb-2.5">
        <h2 id="next-slots-title" className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
          <Zap className="w-4 h-4 text-amber-400" aria-hidden="true" />
          Prochaines disponibilités
        </h2>
        <span className="text-xs text-muted-foreground shrink-0">en un tap</span>
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
        {loading
          ? [0, 1, 2].map(i => <div key={i} aria-hidden="true" className="w-[118px] h-[72px] shrink-0 rounded-[14px] bg-card border border-border animate-pulse" />)
          : items.map((item, i) => {
            const active = item.key === selectedKey && item.time === selectedTime;
            return (
              <motion.button
                key={`${item.key}-${item.time}`}
                type="button"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 6) * 0.04, duration: 0.25, ease: 'easeOut' }}
                whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                onClick={() => onSelect(item)}
                aria-pressed={active}
                aria-label={`${dayLabel(item)} à ${item.time}${showBarber && item.employee ? ` avec ${item.employee.name}` : ''}`}
                className={`w-[118px] min-h-[72px] shrink-0 rounded-[14px] border px-3 py-2.5 text-left transition-colors duration-300 ${
                  active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/40'
                }`}
              >
                <span className={`block text-[11px] truncate ${active ? 'text-primary-foreground/85' : 'text-muted-foreground'}`}>{dayLabel(item)}</span>
                <span className="block text-lg font-bold leading-tight tabular-nums mt-0.5">{item.time}</span>
                {showBarber && item.employee && (
                  <span className={`block text-[11px] truncate ${active ? 'text-primary-foreground/85' : 'text-muted-foreground'}`}>avec {item.employee.name}</span>
                )}
              </motion.button>
            );
          })}
      </div>
    </section>
  );
}
