import React, { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';

/**
 * Nombre qui monte de 0 à sa valeur quand il apparaît à l'écran (écrit directement dans le DOM,
 * sans rendu React à chaque image). `format` met en forme la valeur (prix, etc.).
 */
export default function AnimatedCounter({ value, format = (v) => String(Math.round(v)), duration = 1.1, delay = 0, className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -20px 0px' });
  const reduce = useReducedMotion();
  const target = Number(value) || 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (reduce || !inView) {
      el.textContent = format(reduce ? target : 0);
      return undefined;
    }
    const controls = animate(0, target, {
      duration,
      delay,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => { el.textContent = format(v); },
    });
    return () => controls.stop();
  }, [target, inView, reduce, duration, delay]);

  return <span ref={ref} className={`tabular-nums ${className}`}>{format(reduce ? target : 0)}</span>;
}
