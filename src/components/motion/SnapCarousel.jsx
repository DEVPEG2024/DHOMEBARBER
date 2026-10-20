import React, { Children, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, useReducedMotion } from 'framer-motion';

/**
 * Carrousel horizontal à défilement natif (glissé fluide, aimanté sur chaque carte) :
 * - la carte au centre est à taille réelle, ses voisines légèrement réduites et atténuées ;
 * - points de position sous le carrousel (tap = aller à la carte) ;
 * - défilement automatique facultatif (`autoplay` en ms) : en pause dès que le client touche
 *   le carrousel (8 s), quand il est hors de l'écran, onglet caché ou mouvement réduit ;
 * - couleur du point actif : `activeDotClass` (vert du salon par défaut, orange pour le Last Minute).
 *
 * Le carrousel déborde jusqu'aux bords de l'écran (`-mx-4 px-4`, la page a 16 px de marge) ;
 * la page n'en défile pas pour autant : la zone de défilement est le carrousel lui-même.
 */
export default function SnapCarousel({ children, itemWidth = '78%', gap = 12, autoplay = 0, dots = true, className = '', label, activeDotClass = 'bg-primary' }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const scrollX = useMotionValue(0);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(1);
  const items = Children.toArray(children).filter(Boolean);
  const count = items.length;
  const pausedUntil = useRef(0);
  const visible = useRef(true);

  // Pas = largeur d'une carte + espace, mesuré sur le DOM (change avec la largeur de l'écran)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const first = el.querySelector('[data-carousel-item]');
      // offsetWidth et non getBoundingClientRect : la carte peut être réduite (scale) au moment de
      // la mesure, le pas serait faux et la carte au centre ne serait plus à taille réelle
      if (first) setStep(first.offsetWidth + gap);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [gap, count]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    scrollX.set(el.scrollLeft);
    setIndex(Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / step))));
  };

  const goTo = useCallback((i, smooth = true) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: i * step, behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }, [step, reduce]);

  const pause = () => { pausedUntil.current = Date.now() + 8000; };

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => { visible.current = entry.isIntersecting; }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!autoplay || reduce || count < 2) return undefined;
    const id = setInterval(() => {
      if (Date.now() < pausedUntil.current || !visible.current || document.hidden) return;
      goTo(index + 1 >= count ? 0 : index + 1);
    }, autoplay);
    return () => clearInterval(id);
  }, [autoplay, reduce, count, index, goTo]);

  if (count === 0) return null;

  return (
    <div className={className}>
      <div
        ref={ref}
        onScroll={onScroll}
        onPointerDown={pause}
        onWheel={pause}
        role="region"
        aria-roledescription="carrousel"
        aria-label={label}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 py-2 overscroll-x-contain"
        style={{ gap, scrollPaddingLeft: 16 }}
      >
        {items.map((child, i) => (
          <CarouselItem key={child.key ?? i} i={i} step={step} scrollX={scrollX} width={itemWidth} reduce={reduce}>
            {child}
          </CarouselItem>
        ))}
        {/* Fin de piste : la dernière carte peut venir à gauche comme les autres */}
        <div aria-hidden="true" className="shrink-0" style={{ width: 1 }} />
      </div>
      {dots && count > 1 && (
        <div className="flex justify-center gap-1.5 mt-2" aria-hidden="true">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              onClick={() => { pause(); goTo(i); }}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? `w-5 ${activeDotClass}` : 'w-1.5 bg-foreground/20'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CarouselItem({ children, i, step, scrollX, width, reduce }) {
  // Distance (en cartes) entre cette carte et la position de défilement : 0 = au centre
  const dist = useTransform(scrollX, (x) => Math.min(1, Math.abs(i * step - x) / step));
  const scale = useTransform(dist, [0, 1], [1, 0.92]);
  const opacity = useTransform(dist, [0, 1], [1, 0.55]);
  // L'aimantation se calcule sur le cadre transformé de l'élément aimanté : la réduction est donc
  // portée par un élément intérieur. Posée sur le cadre aimanté, elle faisait arrêter le carrousel
  // 12 px trop loin (cadre de la carte suivante encore réduite, relevé le 20 oct. 2026).
  return (
    <div data-carousel-item className="snap-start shrink-0" style={{ width }}>
      <motion.div
        className="h-full"
        style={reduce ? undefined : { scale, opacity, transformOrigin: 'center center' }}
      >
        {children}
      </motion.div>
    </div>
  );
}
