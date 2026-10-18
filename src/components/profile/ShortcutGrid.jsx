import React from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { hapticFeedback } from '@/lib/capacitor';
import { RevealGroup, RevealItem } from '@/components/motion/Reveal';

/**
 * Raccourcis du tableau de bord, style « verre sombre, icône verte » (choix du propriétaire,
 * 18 oct. 2026 : planche https://claude.ai/artifact/YJCkjiLhicxT5i3rEz8fX8, option B animée).
 * Une seule couleur, le vert du salon : pastille en verre teinté, icône fine verte.
 * Animations (`.tile-chip` dans index.css) : flottement doux, vague de lumière qui parcourt la
 * grille tuile après tuile, halo qui respire sur une tuile à pastille, rebond de l'icône au tap.
 * `items` : [{ to, label, icon, badge }].
 */
export default function ShortcutGrid({ items }) {
  const reduce = useReducedMotion();
  return (
    <RevealGroup className="grid grid-cols-3 gap-2.5" stagger={0.045}>
      {items.map((item, i) => {
        const hot = item.badge > 0;
        return (
          <RevealItem key={item.to} className="h-full">
            <Link to={item.to} onClick={() => hapticFeedback()} className="block h-full">
              <motion.div whileTap="tap" initial="rest" animate="rest"
                variants={{ rest: { scale: 1 }, tap: { scale: 0.94 } }}
                className="relative rounded-2xl border border-white/8 bg-white/[0.04] backdrop-blur-xl px-2 pt-4 pb-3 text-center h-full">
                <div className={`float-soft float-delay-${i % 3} mx-auto w-11 h-11`}>
                  <div className={`tile-chip ${hot ? 'tile-chip-hot' : ''} w-11 h-11 rounded-2xl flex items-center justify-center`}
                    style={{ '--wave-delay': `${i * 0.35}s` }}>
                    <motion.span
                      variants={reduce ? undefined : { rest: { scale: 1, rotate: 0 }, tap: { scale: 1.18, rotate: -8 } }}
                      transition={{ type: 'spring', stiffness: 520, damping: 14 }}
                      className="relative z-[1] flex"
                    >
                      <item.icon className="w-5 h-5 text-primary" strokeWidth={1.8} />
                    </motion.span>
                  </div>
                </div>
                <p className="text-[11px] font-semibold text-foreground mt-2.5 leading-tight">{item.label}</p>
                <AnimatePresence>
                  {hot && (
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
        );
      })}
    </RevealGroup>
  );
}
