import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

/**
 * Carte qui s'incline sous le doigt ou la souris (3D légère) avec un reflet qui suit le pointeur,
 * puis revient en place au relâchement. Le défilement de la page reste libre : on ne capture pas
 * le pointeur et `touch-action` n'est pas modifié.
 *
 * `max` : inclinaison maximale en degrés. `glare` : reflet blanc qui suit le pointeur.
 */
export default function TiltCard({ children, className = '', max = 8, glare = true, style, ...rest }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 220, damping: 20, mass: 0.6 };
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), spring);
  const rotateX = useSpring(useTransform(py, [0, 1], [max, -max]), spring);
  const glareX = useTransform(px, [0, 1], ['0%', '100%']);
  const glareY = useTransform(py, [0, 1], ['0%', '100%']);
  const glareOpacity = useSpring(0, spring);
  const glareBg = useTransform([glareX, glareY], ([x, y]) =>
    `radial-gradient(circle at ${x} ${y}, rgba(255,255,255,0.22), transparent 55%)`);

  if (reduce) return <div className={className} style={style} {...rest}>{children}</div>;

  const move = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    px.set(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
    py.set(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
    glareOpacity.set(1);
  };
  const leave = () => {
    px.set(0.5);
    py.set(0.5);
    glareOpacity.set(0);
  };

  return (
    <div style={{ perspective: 900 }} className="h-full">
      <motion.div
        ref={ref}
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={leave}
        onPointerUp={leave}
        onPointerCancel={leave}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d', ...style }}
        className={`relative h-full ${className}`}
        {...rest}
      >
        {children}
        {glare && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{ opacity: glareOpacity, background: glareBg }}
          />
        )}
      </motion.div>
    </div>
  );
}
