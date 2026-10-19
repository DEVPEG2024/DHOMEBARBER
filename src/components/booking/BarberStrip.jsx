/**
 * « Avec qui ? » (écran Créneau) : « Peu importe » puis chaque barber, photo au format portrait des
 * barbers (jamais de vignette ronde ou carrée). Choisir un barber met les heures à jour sur le même
 * écran. Le barber de la dernière visite porte « Habituel ».
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Users } from 'lucide-react';
import { BARBER_PHOTO_ASPECT, BARBER_PHOTO_BG } from '@/lib/barberPhoto';

const TILE = 'w-[72px] shrink-0 flex flex-col items-center gap-1.5 text-center';

function SelectedBadge() {
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 24 }}
      className="absolute -top-1.5 -right-1.5 w-[22px] h-[22px] rounded-full bg-primary text-primary-foreground border-2 border-background flex items-center justify-center"
      aria-hidden="true"
    >
      <Check className="w-3 h-3" strokeWidth={3} />
    </motion.span>
  );
}

export default function BarberStrip({ employees = [], anyBarber, selectedId, usualId = null, loading = false, onAny, onSelect }) {
  const reduceMotion = useReducedMotion();
  const tap = reduceMotion ? undefined : { scale: 0.95 };

  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 pt-2 pb-1" role="group" aria-label="Choix du barber">
      <motion.button type="button" whileTap={tap} onClick={onAny} aria-pressed={!!anyBarber} className={TILE}>
        <span
          className={`relative w-full rounded-[14px] flex items-center justify-center transition-colors duration-300 ${
            anyBarber ? 'border-2 border-primary bg-primary/15 text-primary' : 'border border-border bg-card text-muted-foreground'
          }`}
          style={{ aspectRatio: BARBER_PHOTO_ASPECT }}
        >
          <Users className="w-6 h-6" aria-hidden="true" />
          {anyBarber && <SelectedBadge />}
        </span>
        <span className={`text-xs leading-tight ${anyBarber ? 'font-bold text-primary' : 'font-semibold text-foreground'}`}>Peu importe</span>
      </motion.button>

      {employees.map((emp) => {
        const selected = !anyBarber && String(selectedId) === String(emp.id);
        const usual = usualId != null && String(usualId) === String(emp.id);
        return (
          <motion.button key={emp.id} type="button" whileTap={tap} onClick={() => onSelect(emp)} aria-pressed={selected} className={TILE}>
            <span
              className={`relative w-full rounded-[14px] transition-colors duration-300 ${selected ? 'border-2 border-primary' : 'border border-border'}`}
              style={{ aspectRatio: BARBER_PHOTO_ASPECT, background: BARBER_PHOTO_BG }}
            >
              <span className="absolute inset-0 rounded-[12px] overflow-hidden flex items-center justify-center">
                {emp.photo_url ? (
                  <img src={emp.photo_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display text-2xl font-bold text-muted-foreground">{String(emp.name || '?').charAt(0)}</span>
                )}
              </span>
              {selected && <SelectedBadge />}
            </span>
            <span className={`text-xs leading-tight truncate max-w-full ${selected ? 'font-bold text-primary' : 'font-semibold text-foreground'}`}>{emp.name}</span>
            {usual && <span className="-mt-1 text-[10px] leading-tight text-muted-foreground">Habituel</span>}
          </motion.button>
        );
      })}

      {/* Barbers en cours de chargement : cases d'attente plutôt qu'une rangée qui paraît vide */}
      {loading && [0, 1, 2].map(i => (
        <div key={`barber-skeleton-${i}`} aria-hidden="true" className={TILE}>
          <span className="w-full rounded-[14px] bg-card border border-border animate-pulse" style={{ aspectRatio: BARBER_PHOTO_ASPECT }} />
          <span className="h-3 w-12 rounded bg-card animate-pulse" />
        </div>
      ))}
    </div>
  );
}
