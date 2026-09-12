import React from 'react';
import { motion } from 'framer-motion';
import { Gift, Clock, Check } from 'lucide-react';
import { ServiceBadges } from './ServiceItemCard';
import { EASE, formatDuration, formatPrice } from './serviceUtils';

const springy = { type: 'spring', stiffness: 520, damping: 26 };

/**
 * Vitrine des formules (prestations dont le nom contient « formule » / « pack ») en tête de page :
 * cartes sombres à défilement horizontal, sélectionnables comme les autres. Rien si aucune formule.
 */
export default function FormulasBlock({ formulas, selectedIds, popularIds, newIds, onToggle, reduceMotion = false }) {
  if (!formulas || formulas.length === 0) return null;

  return (
    <section aria-label="Formules" className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 inline-flex items-center justify-center">
          <Gift className="w-4 h-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold leading-tight text-foreground">Formules</h2>
          <p className="text-[11px] text-muted-foreground">Plusieurs prestations, un seul prix malin.</p>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-2 scrollbar-hide">
        {formulas.map((service, i) => {
          const id = String(service.id);
          const selected = selectedIds.has(id);
          return (
            <motion.div
              key={id}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              onClick={() => onToggle(service)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(service); } }}
              initial={reduceMotion ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: Math.min(i, 5) * 0.06 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              className={`relative snap-start shrink-0 w-[248px] min-h-[150px] rounded-2xl border p-4 text-white cursor-pointer select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary/70 transition-colors duration-300 ${
                selected ? 'border-primary/70' : 'border-white/10'
              }`}
              style={{ background: 'linear-gradient(135deg, #12211a 0%, #0a0f0d 60%, #07090c 100%)' }}
            >
              <span aria-hidden="true" className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-primary/20 blur-2xl pointer-events-none" />
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{ boxShadow: 'inset 0 0 0 1px hsl(var(--primary) / 0.6), 0 14px 36px -14px hsl(var(--primary) / 0.7)' }}
                initial={false}
                animate={{ opacity: selected ? 1 : 0 }}
                transition={{ duration: 0.3 }}
              />

              <div className="relative flex flex-col h-full">
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                    <Gift className="w-3 h-3" aria-hidden="true" /> Formule
                  </span>
                  <span
                    aria-hidden="true"
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-300 ${selected ? 'bg-primary' : 'bg-white/10 border border-white/20'}`}
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

                <h3 className="font-fut text-2xl font-extrabold uppercase leading-none mt-3 line-clamp-2">{service.name}</h3>
                {service.description && (
                  <p className="text-[11px] text-white/65 leading-relaxed line-clamp-2 mt-1.5 whitespace-pre-line">{service.description}</p>
                )}

                <div className="mt-auto pt-3 flex items-end justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/80">
                      <Clock className="w-3 h-3" aria-hidden="true" /> {formatDuration(service.duration)}
                    </span>
                    <ServiceBadges popular={popularIds.has(id)} isNew={newIds.has(id)} light />
                  </div>
                  <span className="font-fut text-3xl font-bold leading-none text-primary tabular-nums">{formatPrice(service.price)}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
