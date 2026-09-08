import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Timer } from 'lucide-react';
import { formatCountdown, splitDuration } from '@/lib/textileApi';
import { EASE } from './textileUtils';

const pad = (n) => String(Math.max(0, n)).padStart(2, '0');

/**
 * Un chiffre du compte à rebours : à chaque changement de valeur, l'ancien glisse vers le haut
 * et le nouveau arrive par le bas (transform / opacity seulement, dans une boîte à hauteur fixe).
 */
function Unit({ value, label, reduceMotion, size = 'lg' }) {
  const text = pad(value);
  const box = size === 'lg' ? 'h-12 min-w-[3.1rem] text-4xl' : 'h-8 min-w-[2.2rem] text-2xl';
  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${box} overflow-hidden rounded-xl bg-white/6 border border-white/10 px-2 font-fut font-bold text-white tabular-nums`}>
        {reduceMotion ? (
          <span className="absolute inset-0 flex items-center justify-center">{text}</span>
        ) : (
          <AnimatePresence initial={false}>
            <motion.span
              key={text}
              initial={{ y: '70%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '-70%', opacity: 0 }}
              transition={{ duration: 0.32, ease: EASE }}
              className="absolute inset-0 flex items-center justify-center"
            >
              {text}
            </motion.span>
          </AnimatePresence>
        )}
      </div>
      <span className="mt-1 text-[9px] uppercase tracking-[0.2em] text-white/45 font-medium">{label}</span>
    </div>
  );
}

/** Compte à rebours J / H / M / S en grand (drop en vedette). */
export default function Countdown({ ms, reduceMotion = false, size = 'lg' }) {
  const { days, hours, minutes, seconds } = splitDuration(ms);
  const sep = <span className={`font-fut font-bold text-white/30 ${size === 'lg' ? 'text-3xl pb-4' : 'text-xl pb-3'}`}>:</span>;
  return (
    <div className="flex items-center justify-center gap-1.5" role="timer" aria-live="off">
      <Unit value={days} label="Jours" reduceMotion={reduceMotion} size={size} />
      {sep}
      <Unit value={hours} label="Heures" reduceMotion={reduceMotion} size={size} />
      {sep}
      <Unit value={minutes} label="Min" reduceMotion={reduceMotion} size={size} />
      {sep}
      <Unit value={seconds} label="Sec" reduceMotion={reduceMotion} size={size} />
    </div>
  );
}

/** Version compacte sur une ligne : « J-3 · 14h05 » ou « 02:14:09 ». */
export function CompactCountdown({ ms, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-fut font-bold tabular-nums ${className}`}>
      <Timer className="w-3.5 h-3.5 text-primary shrink-0" />
      {formatCountdown(ms)}
    </span>
  );
}
