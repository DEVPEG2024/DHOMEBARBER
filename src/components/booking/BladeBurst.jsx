/**
 * Pluie de lames de rasoir des écrans de succès (réservation, abonnement) : éclatement radial depuis
 * la coche, culbute 3D, retombée, fondu. Sortie de `Booking.jsx` le 4 nov. 2026, sans changement.
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

/** Nombre de lames. */
const BLADE_COUNT = 30;
/** Instant de l'éclatement (s). */
export const BURST_AT = 0.35;

/** Lame de rasoir métallique (double tranchant), rendu acier brossé avec reflet. */
function SteelBlade({ width = 32 }) {
  return (
    <svg width={width} height={width * 0.46} viewBox="0 0 100 46" aria-hidden="true" style={{ display: 'block' }}>
      <rect x="1.5" y="1.5" width="97" height="43" rx="5" fill="url(#sb-steel)" stroke="#5f6772" strokeWidth="1" />
      <rect x="1.5" y="1.5" width="97" height="43" rx="5" fill="url(#sb-shine)" />
      {/* tranchants */}
      <path d="M6,3.2 H94" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1" strokeLinecap="round" />
      <path d="M6,42.8 H94" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1" strokeLinecap="round" />
      {/* découpe centrale */}
      <circle cx="17" cy="23" r="4" fill="#0a0d11" />
      <circle cx="83" cy="23" r="4" fill="#0a0d11" />
      <rect x="28" y="19" width="44" height="8" rx="3" fill="#0a0d11" />
      <rect x="42" y="11" width="16" height="24" rx="3" fill="#0a0d11" />
      <rect x="35" y="15" width="8" height="16" rx="2.5" fill="#0a0d11" />
      <rect x="57" y="15" width="8" height="16" rx="2.5" fill="#0a0d11" />
    </svg>
  );
}

/** Pluie de lames : éclatement radial depuis la coche, culbute 3D, retombée, fondu. */
export default function BladeBurst({ reduceMotion }) {
  const blades = useMemo(() => Array.from({ length: BLADE_COUNT }, (_, i) => {
    const wave = i % 3;
    const angle = (i / BLADE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const dist = 130 + wave * 30 + Math.random() * 90;
    return {
      id: i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist * 0.85,
      fall: 70 + Math.random() * 60,
      rotate: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
      flip: 360 + Math.random() * 540,
      width: 22 + Math.random() * 18,
      delay: BURST_AT + wave * 0.12 + Math.random() * 0.1,
      duration: 1.9 + Math.random() * 0.5,
    };
  }), []);
  if (reduceMotion) return null;

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center" aria-hidden="true" style={{ perspective: 700 }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="sb-steel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f6f8fa" />
            <stop offset="40%" stopColor="#b7bfca" />
            <stop offset="65%" stopColor="#e4e8ed" />
            <stop offset="100%" stopColor="#8c95a1" />
          </linearGradient>
          <linearGradient id="sb-shine" x1="0" y1="0" x2="1" y2="0.3">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.45" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      {blades.map(b => (
        <motion.span
          key={b.id}
          initial={{ x: 0, y: 0, scale: 0.2, opacity: 1, rotate: 0, rotateX: 0 }}
          animate={{ x: b.x, y: b.y + b.fall, scale: 1, opacity: 0, rotate: b.rotate, rotateX: b.flip }}
          transition={{
            duration: b.duration,
            delay: b.delay,
            ease: [0.16, 1, 0.3, 1],
            y: { duration: b.duration, delay: b.delay, ease: [0.2, 0.9, 0.4, 1] },
            rotate: { duration: b.duration, delay: b.delay, ease: 'linear' },
            rotateX: { duration: b.duration, delay: b.delay, ease: 'linear' },
            opacity: { duration: 0.6, delay: b.delay + b.duration - 0.7, ease: 'easeOut' },
          }}
          className="absolute"
          style={{ transformStyle: 'preserve-3d', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.55))' }}
        >
          <SteelBlade width={b.width} />
        </motion.span>
      ))}
    </div>
  );
}
