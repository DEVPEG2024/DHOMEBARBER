/**
 * Heures libres d'un jour, rangées en Matin / Après-midi / Soir (grille de quatre). En « peu
 * importe », le prénom du premier barber libre s'affiche sous chaque heure.
 */
import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Moon, Sun, Sunset } from 'lucide-react';
import { dayPart } from '@/lib/availability';

const PARTS = [
  { key: 'morning', label: 'Matin', Icon: Sun },
  { key: 'afternoon', label: 'Après-midi', Icon: Sunset },
  { key: 'evening', label: 'Soir', Icon: Moon },
];

export default function SlotGroups({ options = [], selectedTime, selectedEmployeeId, showBarber = false, onSelect }) {
  const reduceMotion = useReducedMotion();
  const groups = useMemo(() => {
    const byPart = new Map(PARTS.map(p => [p.key, []]));
    for (const option of options) byPart.get(dayPart(option.time)).push(option);
    return PARTS.map(p => ({ ...p, options: byPart.get(p.key) })).filter(g => g.options.length > 0);
  }, [options]);

  let index = 0;
  return (
    <div className="space-y-4">
      {groups.map(({ key, label, Icon, options: list }) => (
        <div key={key} role="group" aria-label={label}>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {list.map((option) => {
              const active = selectedTime === option.time
                && (!showBarber || !selectedEmployeeId || String(option.employee?.id) === String(selectedEmployeeId));
              const i = index++;
              return (
                <motion.button
                  key={option.time}
                  type="button"
                  initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: Math.min(i, 14) * 0.02, duration: 0.25, ease: 'easeOut' }}
                  whileTap={reduceMotion ? undefined : { scale: 0.94 }}
                  onClick={() => onSelect(option)}
                  aria-pressed={active}
                  aria-label={`${option.time}${showBarber && option.employee ? ` avec ${option.employee.name}` : ''}`}
                  className={`min-w-0 min-h-[52px] rounded-xl border px-1 py-1.5 transition-colors duration-300 ${
                    active
                      ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/25'
                      : 'bg-card border-border text-foreground hover:border-primary/40'
                  }`}
                >
                  <span className="block text-[15px] font-semibold tabular-nums leading-tight">{option.time}</span>
                  {showBarber && option.employee && (
                    <span className={`block text-[11px] leading-tight truncate ${active ? 'text-primary-foreground/85' : 'text-muted-foreground'}`}>
                      {option.employee.name}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
