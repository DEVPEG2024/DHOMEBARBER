import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

/**
 * Explosion d'emojis au moment de voter (même mécanique que le fil « Ça dit quoi le Gang ? ») :
 * particules en transform / opacity uniquement, centrées sur le parent (à poser en `relative`).
 */
export default function EmojiBurst({ emoji = '🔥', count = 10, onDone }) {
  const parts = useMemo(() => Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i - (count - 1) / 2) * 0.26 + (Math.random() - 0.5) * 0.2;
    const dist = 40 + Math.random() * 44;
    return {
      id: i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      scale: 0.7 + Math.random() * 0.7,
      rotate: (Math.random() - 0.5) * 70,
      delay: Math.random() * 0.08,
    };
  }), [count]);

  return (
    <span className="absolute left-1/2 top-1/2 pointer-events-none z-20" aria-hidden="true">
      {parts.map(p => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: p.y, scale: p.scale, opacity: 0, rotate: p.rotate }}
          transition={{ duration: 0.9, delay: p.delay, ease: [0.16, 1, 0.3, 1], opacity: { duration: 0.45, delay: p.delay + 0.45 } }}
          onAnimationComplete={p.id === 0 ? onDone : undefined}
          className="absolute -translate-x-1/2 -translate-y-1/2 text-lg leading-none"
        >
          {emoji}
        </motion.span>
      ))}
    </span>
  );
}
