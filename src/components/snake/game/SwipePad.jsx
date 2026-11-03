import React from 'react';
import { UP, RIGHT, DOWN, LEFT } from '@/lib/snake/engine';
import { SNAKE_COLORS as C } from '../palette';

/**
 * Zone « GLISSE » sous l'écran vert, à la place des touches 2 4 6 8 (demande du 3 nov. 2026) : le
 * pouce glisse ici sans cacher le serpent. Le geste est lu sur tout le téléphone (`useSwipe`),
 * cette zone ne fait que le montrer : décor seulement (`aria-hidden`), la flèche du virage lu
 * s'allume un instant (`flashArrow`).
 *
 * Hauteur selon l'écran : 104 px au plus petit, 176 px au plus grand.
 */
const ARROWS = [
  { dir: UP, d: 'M6 15l6-6 6 6', place: 'left-1/2 top-2 -translate-x-1/2' },
  { dir: RIGHT, d: 'M9 6l6 6-6 6', place: 'right-2.5 top-1/2 -translate-y-1/2' },
  { dir: DOWN, d: 'M6 9l6 6 6-6', place: 'bottom-2 left-1/2 -translate-x-1/2' },
  { dir: LEFT, d: 'M15 6l-6 6 6 6', place: 'left-2.5 top-1/2 -translate-y-1/2' },
];

const timers = new WeakMap();

/** Allume la flèche `dir` de la zone `pad` pendant 180 ms (opacité seulement). */
export function flashArrow(pad, dir) {
  const el = pad && pad.querySelector(`[data-swipe-dir="${dir}"]`);
  if (!el) return;
  clearTimeout(timers.get(el));
  el.setAttribute('data-on', '');
  timers.set(el, setTimeout(() => el.removeAttribute('data-on'), 180));
}

export default function SwipePad({ padRef }) {
  return (
    <div
      ref={padRef}
      aria-hidden="true"
      data-swipe-pad=""
      className="relative h-[clamp(104px,22vh,176px)] w-full shrink-0 rounded-[24px] border"
      style={{ background: C.cadreEcran, borderColor: C.corpsBord, boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.55)' }}
    >
      {ARROWS.map(({ dir, d, place }) => (
        <svg
          key={dir}
          data-swipe-dir={dir}
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke={C.vertTexte}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`absolute ${place} opacity-30 transition-opacity duration-150 motion-reduce:transition-none data-[on]:opacity-100`}
        >
          <path d={d} />
        </svg>
      ))}
      <span className="absolute inset-0 grid place-items-center font-pixel text-xs tracking-[0.24em]" style={{ color: C.logoTexte }}>
        GLISSE
      </span>
    </div>
  );
}
