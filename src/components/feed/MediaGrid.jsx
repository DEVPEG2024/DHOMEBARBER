import React, { useRef } from 'react';

// Double tap au doigt : deux relâchés à moins de 300 ms et 30 px l'un de l'autre. La WebView de
// l'iPhone n'envoie pas toujours `dblclick` au doigt ; la souris garde `dblclick`.
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;

/**
 * Photos d'une publication (1 à 4), au format 4:5 des photos du fil (1080 × 1350) : 1 photo en
 * grand, 2 côte à côte, 3 = une grande + deux, 4 = grille 2 × 2. `onDoubleTap` : double tap sur
 * une photo (❤️) ; `overlay` : posé par-dessus la première photo (badge « Mon look »…).
 */
export default function MediaGrid({ images, onDoubleTap, overlay = null, rounded = 'rounded-xl' }) {
  const lastTap = useRef(null);
  const touchFiredAt = useRef(-Infinity);
  const list = (images || []).slice(0, 4);
  if (!list.length) return null;
  const onPointerUp = (e) => {
    if (!onDoubleTap || e.pointerType !== 'touch') return;
    const prev = lastTap.current;
    if (prev && e.timeStamp - prev.t < DOUBLE_TAP_MS
      && Math.abs(e.clientX - prev.x) < DOUBLE_TAP_PX && Math.abs(e.clientY - prev.y) < DOUBLE_TAP_PX) {
      lastTap.current = null;
      touchFiredAt.current = e.timeStamp;
      onDoubleTap(e);
    } else {
      lastTap.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    }
  };
  // Le `dblclick` qui suit parfois le double tap au doigt ne doit pas réagir une seconde fois
  const onDoubleClick = (e) => {
    if (!onDoubleTap || e.timeStamp - touchFiredAt.current < 800) return;
    onDoubleTap(e);
  };
  // `relative` jamais avec `absolute` : déclaré après dans le CSS de Tailwind, il l'emportait et la
  // photo seule (case `absolute inset-0`) n'avait plus de hauteur
  const cell = (src, i, extra = '') => (
    <div key={`${src}-${i}`} className={`${/\babsolute\b/.test(extra) ? '' : 'relative '}overflow-hidden bg-secondary touch-manipulation ${extra}`} onDoubleClick={onDoubleClick} onPointerUp={onPointerUp}>
      <img src={src} alt="" draggable={false} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover select-none" />
      {i === 0 && overlay}
    </div>
  );
  if (list.length === 1) {
    return <div className={`relative w-full ${rounded} overflow-hidden select-none`} style={{ aspectRatio: '4/5' }}>{cell(list[0], 0, 'absolute inset-0')}</div>;
  }
  if (list.length === 2) {
    return (
      <div className={`grid grid-cols-2 gap-1 w-full ${rounded} overflow-hidden select-none`}>
        {list.map((src, i) => cell(src, i, 'aspect-[4/5]'))}
      </div>
    );
  }
  if (list.length === 3) {
    return (
      <div className={`grid grid-cols-2 grid-rows-2 gap-1 w-full ${rounded} overflow-hidden select-none`} style={{ aspectRatio: '4/5' }}>
        {cell(list[0], 0, 'row-span-2')}
        {cell(list[1], 1)}
        {cell(list[2], 2)}
      </div>
    );
  }
  return (
    <div className={`grid grid-cols-2 gap-1 w-full ${rounded} overflow-hidden select-none`}>
      {list.map((src, i) => cell(src, i, 'aspect-[4/5]'))}
    </div>
  );
}
