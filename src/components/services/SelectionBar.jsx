import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import AnimatedNumber from './AnimatedNumber';
import { formatDuration, formatPrice } from './serviceUtils';

const formatCount = (n) => `${n} prestation${n > 1 ? 's' : ''}`;

/**
 * Barre de résumé de la sélection, fixée au-dessus de la barre du bas : nombre de prestations,
 * durée totale et prix total qui comptent, bouton « Réserver » vers la réservation pré-remplie.
 * L'anneau orbital (`orbit-wrap`) est sur le `<Link>`, jamais sur le `motion.button` : une
 * animation CSS sur transform écraserait son `whileTap`.
 */
export default function SelectionBar({ count, totalDuration, totalPrice, ids, onClear, reduceMotion = false }) {
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { y: 120, opacity: 0 }}
      transition={{ type: 'spring', damping: 22, stiffness: 260 }}
      className="fixed bottom-24 left-4 right-4 max-w-lg mx-auto z-40"
      role="region"
      aria-label="Ta sélection"
    >
      <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/30 p-2 pl-1 flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          aria-label="Vider la sélection"
          className="w-11 h-11 shrink-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0 leading-tight">
          <p className="text-xs font-bold text-foreground truncate">
            <AnimatedNumber value={count} format={formatCount} />
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            <AnimatedNumber value={totalDuration} format={formatDuration} className="tabular-nums" />
            <span aria-hidden="true"> · </span>
            <AnimatedNumber value={totalPrice} format={formatPrice} className="font-fut text-base font-bold text-primary tabular-nums" />
          </p>
        </div>

        <Link
          to={`/booking?services=${ids.join(',')}`}
          className="orbit-wrap rounded-2xl shadow-lg shadow-primary/25 shrink-0"
          aria-label={`Réserver ${formatCount(count)}`}
        >
          <motion.button
            type="button"
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-[14px] bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            Réserver
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </motion.button>
        </Link>
      </div>
    </motion.div>
  );
}
