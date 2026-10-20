/**
 * Privatiser le salon : barre fixée au-dessus de la barre du bas, qui garde « Demander un devis » à
 * portée de pouce quand le bouton du haut de page est sorti de l'écran (`visible` décidé par la
 * page). Même allure et même position que la barre de la réservation (`BookingBar`) ; classe
 * `booking-bar` : masquée quand le clavier est ouvert dans l'app (index.css).
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { hapticFeedback } from '@/lib/capacitor';

export default function StickyRequestBar({ visible, onRequest }) {
  const reduce = useReducedMotion();
  const handleRequest = () => {
    hapticFeedback();
    onRequest?.();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="privat-request-bar"
          initial={reduce ? { opacity: 0 } : { y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: 120, opacity: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 280 }}
          className="booking-bar fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] left-3 right-3 max-w-lg mx-auto z-40"
          role="region"
          aria-label="Privatisation"
        >
          <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/30 flex items-center gap-3 p-2 pl-4">
            <div className="flex-1 min-w-0 leading-tight">
              <p className="text-sm font-bold text-foreground">Privatiser le salon</p>
              {/* Sous 360 px, seul le titre reste : le bouton garde son libellé entier. Texte court :
                  « Devis gratuit, sans engagement » était tronqué à 390 px */}
              <p className="hidden min-[360px]:block text-xs text-muted-foreground mt-0.5 truncate">
                Devis gratuit
              </p>
            </div>
            <motion.button
              type="button"
              whileTap={reduce ? undefined : { scale: 0.97 }}
              onClick={handleRequest}
              className="shrink-0 inline-flex items-center justify-center gap-2 h-12 px-3.5 min-[360px]:px-4 rounded-[14px] bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/25 hover:bg-primary/90 transition-colors"
            >
              <span className="whitespace-nowrap">Demander un devis</span>
              <ArrowRight aria-hidden="true" className="hidden min-[360px]:block w-4 h-4 shrink-0" />
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
