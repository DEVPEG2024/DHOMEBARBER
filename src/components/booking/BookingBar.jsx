/**
 * Barre de la réservation fixée au-dessus de la barre du bas : ce qui est choisi (titre + détail)
 * et le bouton de l'étape (« Continuer », « Confirmer le rendez-vous »), toujours à l'écran.
 * Sans titre, le bouton prend toute la largeur. Masquée quand le clavier est ouvert dans l'app
 * (`body.keyboard-open .booking-bar`, index.css) : elle recouvrirait le champ de la note.
 * `pulse-cta` est posé sur un `<span>` autour du bouton, jamais sur le `motion.button` (une
 * animation CSS sur transform écraserait son `whileTap`).
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export default function BookingBar({
  title = null, subtitle = null, actionLabel, onAction, disabled = false, pulse = false, icon: Icon = ArrowRight,
}) {
  const reduceMotion = useReducedMotion();
  const button = (
    <motion.button
      type="button"
      whileTap={disabled || reduceMotion ? undefined : { scale: 0.97 }}
      onClick={onAction}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-[14px] text-sm font-bold transition-colors duration-300 ${
        title ? 'h-12 px-4' : 'w-full h-[52px] px-5'
      } ${
        disabled
          ? 'bg-secondary text-muted-foreground cursor-not-allowed'
          : 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90'
      }`}
    >
      <span className="truncate">{actionLabel}</span>
      {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
    </motion.button>
  );

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { y: 120, opacity: 0 }}
      transition={{ type: 'spring', damping: 24, stiffness: 280 }}
      className="booking-bar fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] left-3 right-3 max-w-lg mx-auto z-40"
      role="region"
      aria-label="Votre réservation"
    >
      <div className={`rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/30 flex items-center gap-3 ${title ? 'p-2 pl-4' : 'p-2'}`}>
        {title && (
          <div className="flex-1 min-w-0 leading-tight" aria-live="polite">
            <p className="text-sm font-bold text-foreground truncate first-letter:uppercase">{title}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
          </div>
        )}
        {pulse && !disabled
          ? <span className={`pulse-cta rounded-[14px] ${title ? 'shrink-0' : 'w-full'}`}>{button}</span>
          : <span className={title ? 'shrink-0' : 'w-full'}>{button}</span>}
      </div>
    </motion.div>
  );
}
