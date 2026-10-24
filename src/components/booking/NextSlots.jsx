/**
 * « Prochaines disponibilités » (écran Créneau) : les premiers créneaux libres, deux par jour au
 * plus, choisis en un tap (jour, heure et barber d'un coup). Carrousel animé (`SnapCarousel` de
 * l'accueil) : défilement automatique, cartes voisines réduites, reflet qui passe ; en pause dès
 * que le client le touche, hors de l'écran ou avec le mouvement réduit. Rien sans créneau.
 * Ordinateur (souris, écran large) : flèches précédent / suivant dans l'en-tête, comme le carrousel
 * Last Minute de l'accueil ; le carrousel se glisse aussi à la souris et suit la molette.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import SnapCarousel from '@/components/motion/SnapCarousel';

const upperFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** Défilement automatique du carrousel (ms). */
const AUTOPLAY_MS = 3200;
/** Espace entre deux cartes (px). */
const GAP = 10;
/** Flèches seulement à la souris sur écran large (mêmes conditions que LastMinuteSection). */
const DESKTOP_ONLY = 'hidden [@media(hover:hover)_and_(pointer:fine)_and_(min-width:768px)]:inline-flex';

export default function NextSlots({ items = [], loading = false, todayKey, tomorrowKey, selectedKey, selectedTime, showBarber = true, onSelect }) {
  const sectionRef = useRef(null);
  const [edges, setEdges] = useState({ prev: false, next: true });
  // Zone qui défile : celle du carrousel (SnapCarousel), retrouvée par son rôle
  const scroller = useCallback(() => sectionRef.current?.querySelector('[aria-roledescription="carrousel"]') || null, []);
  const shown = !loading && items.length > 0;
  useEffect(() => {
    const el = scroller();
    if (!el) return undefined;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ prev: el.scrollLeft > 4, next: el.scrollLeft < max - 4 });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [scroller, shown, items.length]);

  if (!loading && items.length === 0) return null;

  const go = (dir) => {
    const el = scroller();
    const card = el?.querySelector('[data-carousel-item]');
    if (!el || !card) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * (card.offsetWidth + GAP), behavior: reduce ? 'auto' : 'smooth' });
  };
  const arrowClass = 'w-8 h-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground hover:border-primary/40 disabled:opacity-35 disabled:cursor-default transition-colors';

  const dayLabel = (item) => {
    if (item.key === todayKey) return 'Aujourd\'hui';
    if (item.key === tomorrowKey) return 'Demain';
    return upperFirst(format(item.date, 'EEE d MMM', { locale: fr }));
  };

  return (
    <section ref={sectionRef} aria-labelledby="next-slots-title">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 id="next-slots-title" className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
          <Zap className="w-4 h-4 text-amber-400 float-soft" aria-hidden="true" />
          Prochaines disponibilités
        </h2>
        <span className="shrink-0 inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="live-dot text-primary" aria-hidden="true" />
            en direct
          </span>
          {shown && items.length > 1 && (
            <span className={`${DESKTOP_ONLY} items-center gap-1.5`}>
              <button type="button" onClick={() => go(-1)} disabled={!edges.prev} aria-label="Disponibilités précédentes" className={`inline-flex ${arrowClass}`}>
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => go(1)} disabled={!edges.next} aria-label="Disponibilités suivantes" className={`inline-flex ${arrowClass}`}>
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </span>
          )}
        </span>
      </div>
      {loading ? (
        <div className="flex gap-3 overflow-hidden -mx-4 px-4 py-2" aria-busy="true" aria-label="Recherche des prochaines disponibilités">
          {[0, 1, 2].map(i => <div key={i} aria-hidden="true" className="w-[42%] h-[78px] shrink-0 rounded-[14px] bg-card border border-border animate-pulse" />)}
        </div>
      ) : (
        <SnapCarousel itemWidth="42%" gap={GAP} autoplay={AUTOPLAY_MS} label="Créneaux proposés">
          {items.map((item, i) => {
            const active = item.key === selectedKey && item.time === selectedTime;
            return (
              <button
                key={`${item.key}-${item.time}`}
                type="button"
                onClick={() => onSelect(item)}
                aria-pressed={active}
                aria-label={`${dayLabel(item)} à ${item.time}${showBarber && item.employee ? ` avec ${item.employee.name}` : ''}`}
                className={`shine-sweep ${i % 3 === 1 ? 'shine-delay-1' : i % 3 === 2 ? 'shine-delay-2' : ''} w-full min-h-[78px] rounded-[14px] border px-3 py-2.5 text-left transition-colors duration-300 ${
                  active ? 'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25' : 'border-border bg-card text-foreground hover:border-primary/40'
                }`}
              >
                <span className={`block text-[11px] truncate ${active ? 'text-primary-foreground/85' : 'text-muted-foreground'}`}>{dayLabel(item)}</span>
                <span className="block text-xl font-bold leading-tight tabular-nums mt-0.5">{item.time}</span>
                {showBarber && item.employee && (
                  <span className={`block text-[11px] truncate ${active ? 'text-primary-foreground/85' : 'text-muted-foreground'}`}>avec {item.employee.name}</span>
                )}
              </button>
            );
          })}
        </SnapCarousel>
      )}
    </section>
  );
}
