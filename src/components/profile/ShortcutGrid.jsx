import React from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { hapticFeedback } from '@/lib/capacitor';
import { RevealGroup, RevealItem } from '@/components/motion/Reveal';

/**
 * Raccourcis du tableau de bord : tuiles en grille de 3, icône sur fond dégradé qui flotte
 * doucement, pastille de compteur (RDV à venir, commandes en cours, non lues…) qui apparaît
 * avec un rebond. `items` : [{ to, label, icon, tint: 'from-… to-…', badge }].
 */
export default function ShortcutGrid({ items }) {
  return (
    <RevealGroup className="grid grid-cols-3 gap-2.5" stagger={0.045}>
      {items.map((item, i) => (
        <RevealItem key={item.to} className="h-full">
          <Link to={item.to} onClick={() => hapticFeedback()} className="block h-full">
            <motion.div whileTap={{ scale: 0.93 }}
              className="relative rounded-2xl border border-white/8 bg-white/[0.04] backdrop-blur-xl px-2 pt-4 pb-3 text-center h-full">
              <div className={`float-soft float-delay-${i % 3} w-11 h-11 mx-auto rounded-2xl bg-gradient-to-br ${item.tint} flex items-center justify-center shadow-lg shadow-black/20`}>
                <item.icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-[11px] font-semibold text-foreground mt-2.5 leading-tight">{item.label}</p>
              <AnimatePresence>
                {item.badge > 0 && (
                  <motion.span
                    key={item.badge}
                    initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                    className="absolute top-2 right-2 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-md shadow-primary/30"
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          </Link>
        </RevealItem>
      ))}
    </RevealGroup>
  );
}
