/**
 * En-tête de la réservation : bouton retour (dès la 2e étape) et progression en trois segments
 * (Prestation → Créneau → Confirmation), le segment de l'étape en cours se remplit.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';

export const BOOKING_STEP_LABELS = ['Prestation', 'Créneau', 'Confirmation'];

export default function BookingSteps({ step, onBack, backDisabled = false }) {
  const reduceMotion = useReducedMotion();
  return (
    // `pr-9` : le bouton musique (32 px, en haut à droite de la page) ne chevauche pas la progression
    <div className="flex items-center gap-3 pr-9">
      {step > 0 && onBack ? (
        <motion.button
          type="button"
          whileTap={reduceMotion ? undefined : { scale: 0.92 }}
          onClick={onBack}
          disabled={backDisabled}
          aria-label="Étape précédente"
          className="w-11 h-11 shrink-0 rounded-full border border-border bg-card flex items-center justify-center text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <ChevronLeft className="w-5 h-5" />
        </motion.button>
      ) : null}
      <ol className="flex-1 grid grid-cols-3 gap-1.5" aria-label={`Étape ${step + 1} sur 3`}>
        {BOOKING_STEP_LABELS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={label} aria-current={active ? 'step' : undefined} className="min-w-0">
              <span className="block h-1 rounded-full bg-border overflow-hidden">
                <motion.span
                  className="block h-full w-full bg-primary origin-left"
                  initial={false}
                  animate={{ scaleX: done || active ? 1 : 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.4, 0, 0.2, 1] }}
                />
              </span>
              <span className={`mt-1.5 block text-[11px] truncate ${active ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>
                {label}{done ? ' ✓' : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
