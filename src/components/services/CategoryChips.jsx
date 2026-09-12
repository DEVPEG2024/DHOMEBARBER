import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

/**
 * Chips de catégories collantes (fond flouté), « Tout » en tête, compteur par catégorie.
 * Le fond de la chip active glisse d'une chip à l'autre (`layoutId`), et la chip active est
 * ramenée au centre de la rangée quand elle change (défilement de la page ou tap).
 * Hauteur visible 40 px, zone de tap étendue à 48 px par un pseudo-élément.
 */
export default function CategoryChips({ items, activeId, onSelect, reduceMotion = false, barRef }) {
  const rowRef = useRef(null);
  const chipRefs = useRef({});

  useEffect(() => {
    const row = rowRef.current;
    const chip = chipRefs.current[activeId];
    if (!row || !chip) return;
    const left = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [activeId, reduceMotion]);

  return (
    <div
      ref={barRef}
      className="sticky z-30 -mx-4 py-2 bg-background/85 backdrop-blur-xl border-b border-border/60"
      style={{ top: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* La barre est déjà en pleine largeur (-mx-4) : la rangée ne fait que remettre le retrait */}
      <div ref={rowRef} role="tablist" aria-label="Catégories" className="flex gap-2 overflow-x-auto scrollbar-hide px-4">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              ref={el => { chipRefs.current[item.id] = el; }}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(item.id)}
              className={`relative shrink-0 h-10 px-4 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors duration-300 before:content-[''] before:absolute before:inset-x-0 before:-inset-y-1 ${
                active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="services-chip-active"
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-primary shadow-lg shadow-primary/25"
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                />
              )}
              {!active && <span aria-hidden="true" className="absolute inset-0 rounded-full bg-card border border-border" />}
              <span className="relative">{item.label}</span>
              {typeof item.count === 'number' && (
                <span className={`relative text-[10px] font-bold tabular-nums ${active ? 'opacity-80' : 'opacity-60'}`}>{item.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
