import React, { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { EASE } from './serviceUtils';

/**
 * Nombre qui glisse de l'ancienne valeur à la nouvelle, écrit dans le DOM sans re-render
 * (même mécanique que la réservation). `format` met en forme la valeur intermédiaire arrondie
 * puis la valeur finale exacte.
 */
export default function AnimatedNumber({ value, format = (v) => String(v), className }) {
  const ref = useRef(null);
  const previous = useRef(value);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const from = previous.current;
    previous.current = value;
    if (reduceMotion || from === value) { el.textContent = format(value); return undefined; }
    const controls = animate(from, value, {
      duration: 0.6,
      ease: EASE,
      onUpdate: (v) => { el.textContent = format(Math.round(v)); },
      onComplete: () => { el.textContent = format(value); },
    });
    return () => controls.stop();
  }, [value, format, reduceMotion]);

  return <span ref={ref} className={className}>{format(value)}</span>;
}
