import React, { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Clock, ChevronDown, Flame, Sparkles } from 'lucide-react';
import { KINDS, EASE, formatDuration, formatPrice } from './serviceUtils';

const springy = { type: 'spring', stiffness: 520, damping: 26 };

/** Pastille d'icône d'une prestation (lucide ou emoji selon la nature). */
export function KindIcon({ kind, selected = false, size = 'md' }) {
  const meta = KINDS[kind] || KINDS.cut;
  const dim = size === 'lg' ? 'w-12 h-12 rounded-2xl' : size === 'sm' ? 'w-7 h-7 rounded-lg' : 'w-11 h-11 rounded-xl';
  const icon = size === 'lg' ? 'w-6 h-6' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <span
      aria-hidden="true"
      className={`${dim} shrink-0 inline-flex items-center justify-center transition-colors duration-300 ${
        selected ? 'bg-primary text-primary-foreground' : meta.tone
      }`}
    >
      {meta.emoji
        ? <span className={size === 'lg' ? 'text-2xl leading-none' : size === 'sm' ? 'text-base leading-none' : 'text-xl leading-none'}>{meta.emoji}</span>
        : <meta.Icon className={icon} />}
    </span>
  );
}

/** Badges « Populaire » / « Nouveau ». */
export function ServiceBadges({ popular, isNew, light = false }) {
  if (!popular && !isNew) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {popular && (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          light ? 'bg-amber-400/20 text-amber-200' : 'bg-amber-500/15 text-amber-400'
        }`}>
          <Flame className="w-3 h-3" aria-hidden="true" /> Populaire
        </span>
      )}
      {isNew && (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          light ? 'bg-white/15 text-white' : 'bg-primary/15 text-primary'
        }`}>
          <Sparkles className="w-3 h-3" aria-hidden="true" /> Nouveau
        </span>
      )}
    </span>
  );
}

/**
 * Carte de prestation de la page Prestations : icône par nature, nom, badges, durée en pastille,
 * prix en gros, description sur deux lignes puis « voir plus » (dépliage animé par `layout`),
 * coche à ressort et halo quand la carte est sélectionnée. Tout le bloc est un bouton à bascule
 * (`aria-pressed`), le « voir plus » est un bouton distinct qui n'y touche pas.
 */
export default function ServiceItemCard({ service, kind, selected, popular, isNew, onToggle, reduceMotion = false, index = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const descRef = useRef(null);
  const description = typeof service.description === 'string' ? service.description.trim() : '';

  // « voir plus » seulement si la description dépasse ses deux lignes (mesuré, recalculé au redimensionnement)
  useLayoutEffect(() => {
    const el = descRef.current;
    if (!el || !description) { setOverflows(false); return undefined; }
    const measure = () => {
      if (expanded) return;
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [description, expanded]);

  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle?.(service);
    }
  };

  const showToggle = description && (overflows || expanded);

  return (
    <motion.div
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: Math.min(index, 8) * 0.04, layout: { duration: 0.3, ease: EASE } }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onToggle?.(service)}
      onKeyDown={handleKey}
      className={`relative rounded-2xl border p-4 cursor-pointer select-none transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
        selected
          ? 'border-primary/50 bg-primary/10'
          : 'border-border bg-card/70 backdrop-blur-xl hover:border-primary/30'
      }`}
    >
      {/* Halo de sélection : ombre statique sur un calque dont seule l'opacité varie */}
      <motion.span
        aria-hidden="true"
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{ boxShadow: '0 0 0 1px hsl(var(--primary) / 0.35), 0 12px 32px -12px hsl(var(--primary) / 0.55)' }}
        initial={false}
        animate={{ opacity: selected ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />

      <div className="relative flex items-start gap-3">
        <KindIcon kind={kind} selected={selected} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-[15px] leading-snug text-foreground">{service.name}</h3>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <Clock className="w-3 h-3" aria-hidden="true" /> {formatDuration(service.duration)}
                </span>
                <ServiceBadges popular={popular} isNew={isNew} />
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className="font-fut text-2xl font-bold leading-none text-primary tabular-nums">{formatPrice(service.price)}</span>
              <span
                aria-hidden="true"
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-300 ${
                  selected ? 'bg-primary' : 'bg-secondary border border-border'
                }`}
              >
                <motion.span
                  initial={false}
                  animate={{ scale: selected ? 1 : 0, opacity: selected ? 1 : 0 }}
                  transition={reduceMotion ? { duration: 0 } : springy}
                  className="inline-flex"
                >
                  <Check className="w-4 h-4 text-primary-foreground" strokeWidth={3} />
                </motion.span>
              </span>
            </div>
          </div>

          {description && (
            <motion.div layout={!reduceMotion ? 'position' : false} className="mt-2">
              <p
                ref={descRef}
                className={`text-xs text-muted-foreground leading-relaxed whitespace-pre-line ${expanded ? '' : 'line-clamp-2'}`}
              >
                {description}
              </p>
              {showToggle && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
                  onKeyDown={(e) => e.stopPropagation()}
                  aria-expanded={expanded}
                  className="inline-flex items-center gap-1 min-h-[44px] -my-2.5 text-[11px] font-semibold text-primary/80 hover:text-primary"
                >
                  {expanded ? 'voir moins' : 'voir plus'}
                  <motion.span
                    aria-hidden="true"
                    className="inline-flex"
                    animate={{ rotate: expanded ? 180 : 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.25, ease: EASE }}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </motion.span>
                </button>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
