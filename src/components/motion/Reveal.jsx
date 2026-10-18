import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Apparition au défilement : le bloc monte et se dévoile quand il entre à l'écran (une fois).
 * Règle des animations de l'app : transform et opacity seulement ; sans mouvement si
 * l'utilisateur l'a demandé (prefers-reduced-motion), le bloc est simplement affiché.
 */
export default function Reveal({ children, delay = 0, y = 22, className = '', as = 'div', ...rest }) {
  const reduce = useReducedMotion();
  const Comp = motion[as] || motion.div;
  if (reduce) return <Comp className={className} {...rest}>{children}</Comp>;
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </Comp>
  );
}

/** Variante pour une liste : chaque enfant `<RevealItem>` arrive en cascade. */
export function RevealGroup({ children, className = '', stagger = 0.06 }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -30px 0px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className = '', ...rest }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className} {...rest}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 16, scale: 0.96 },
        show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 24 } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
