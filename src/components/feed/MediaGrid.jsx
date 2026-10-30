import React from 'react';

/**
 * Photos d'une publication (1 à 4), au format 4:5 des photos du fil (1080 × 1350) : 1 photo en
 * grand, 2 côte à côte, 3 = une grande + deux, 4 = grille 2 × 2. `onDoubleTap` : double tap sur
 * une photo (❤️) ; `overlay` : posé par-dessus la première photo (badge « Mon look »…).
 */
export default function MediaGrid({ images, onDoubleTap, overlay = null, rounded = 'rounded-xl' }) {
  const list = (images || []).slice(0, 4);
  if (!list.length) return null;
  const cell = (src, i, extra = '') => (
    <div key={`${src}-${i}`} className={`relative overflow-hidden bg-secondary ${extra}`} onDoubleClick={onDoubleTap}>
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
