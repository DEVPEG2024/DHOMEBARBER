import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Heart } from 'lucide-react';

/**
 * Cœur « favori » : bouton autonome (ne déclenche jamais le clic de la carte qui le contient),
 * zone de tap de 40 px, petit rebond quand il se remplit.
 * `variant="overlay"` : pastille sombre pour une photo (Boutique).
 */
export default function FavoriteButton({ active, onToggle, label = 'favoris', variant = 'plain', className = '' }) {
  const reduceMotion = useReducedMotion();
  const stop = (e) => { e.stopPropagation(); };
  const base = variant === 'overlay'
    ? 'bg-black/45 backdrop-blur-sm border border-white/15'
    : 'bg-secondary/70 border border-border';
  return (
    <button
      type="button"
      aria-pressed={!!active}
      aria-label={active ? `Retirer des ${label}` : `Ajouter aux ${label}`}
      onClick={(e) => { stop(e); onToggle?.(); }}
      onKeyDown={stop}
      onPointerDown={stop}
      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${base} ${className}`}
    >
      <motion.span
        key={active ? 'on' : 'off'}
        initial={reduceMotion || !active ? false : { scale: 0.4 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 14 }}
        className="inline-flex"
      >
        <Heart
          className={`w-[18px] h-[18px] transition-colors ${active ? 'fill-rose-500 text-rose-500' : variant === 'overlay' ? 'text-white' : 'text-muted-foreground'}`}
          strokeWidth={2.2}
        />
      </motion.span>
    </button>
  );
}
