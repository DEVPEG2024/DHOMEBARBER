/**
 * En-tête des écrans d'abonnement : retour, titre, rappel de la formule. `pr-10` : le bouton musique
 * (32 px, en haut à droite de la page) ne chevauche rien. `VisitProgress` : barre de 4 segments.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { SUBSCRIPTION_VISITS } from '@/lib/subscriptions';

export default function StepHeader({ title, subtitle = null, onBack = null, backDisabled = false }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex items-center gap-3 pr-10">
      {onBack && (
        <motion.button
          type="button"
          whileTap={reduceMotion ? undefined : { scale: 0.92 }}
          onClick={onBack}
          disabled={backDisabled}
          aria-label="Retour"
          className="w-11 h-11 shrink-0 rounded-full border border-border bg-card flex items-center justify-center text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <ChevronLeft className="w-5 h-5" />
        </motion.button>
      )}
      <div className="min-w-0">
        <h1 className="font-display text-[22px] leading-tight font-bold text-foreground break-words">{title}</h1>
        {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5 break-words">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Rendez-vous déjà choisis sur 4. */
export function VisitProgress({ done, total = SUBSCRIPTION_VISITS, label, caption = null }) {
  return (
    <div>
      <div role="img" aria-label={label} className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`flex-1 h-1.5 rounded-full transition-colors duration-300 ${i < done ? 'bg-primary' : 'bg-border'}`} />
        ))}
      </div>
      {caption && <p className="mt-1.5 text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}
