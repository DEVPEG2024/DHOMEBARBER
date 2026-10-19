import React from 'react';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import ServiceActionButton from './ServiceActionButton';
import { EASE, formatDuration, formatPrice } from './serviceUtils';

/**
 * « Les plus demandées » en tête du catalogue : grille 2 × 2 de cartes sombres (même dégradé que
 * l'ancienne vitrine des formules), pastille N°1 à N°4, nom sur deux lignes, durée, prix et bouton
 * d'action. Le haut de la carte (pastille, nom, durée) est un bouton qui ouvre la fiche, l'action
 * est un second bouton. L'appelant ne la monte qu'avec au moins deux prestations.
 */
export default function PopularServicesBlock({ services, selectedIds, mode, pickLabel, onOpen, onAction, reduceMotion = false }) {
  if (!services || services.length < 2) return null;
  return (
    <section aria-labelledby="popular-services" className="mb-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-[30px] h-[30px] rounded-[9px] bg-amber-500/15 text-amber-400 inline-flex items-center justify-center shrink-0">
          <Flame className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="popular-services" className="font-display text-[19px] font-bold leading-tight text-foreground">Les plus demandées</h2>
          <p className="text-xs text-muted-foreground">Ce que les clients du salon réservent le plus</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {services.map((service, i) => {
          const id = String(service.id);
          const selected = selectedIds.has(id);
          const name = String(service.name || '').trim();
          return (
            <motion.div
              key={id}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: i * 0.05 }}
              className={`relative rounded-2xl border p-3 text-white overflow-hidden flex flex-col transition-colors duration-300 ${
                selected ? 'border-primary/70' : 'border-white/10'
              }`}
              style={{ background: 'linear-gradient(135deg, #12211a 0%, #0a0f0d 60%, #07090c 100%)' }}
            >
              <span aria-hidden="true" className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-primary/15 blur-2xl pointer-events-none" />
              <motion.button
                type="button"
                onClick={() => onOpen?.(service)}
                aria-haspopup="dialog"
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                className="relative flex flex-col items-start gap-1.5 text-left rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                  i === 0 ? 'bg-amber-400/20 text-amber-200' : 'bg-white/10 text-white/80'
                }`}>
                  N°{i + 1}
                </span>
                <span className="text-sm font-semibold leading-snug line-clamp-2 min-h-[2.6rem] break-words">{name}</span>
                <span className="text-xs text-white/60">{formatDuration(service.duration)}</span>
              </motion.button>
              <div className="relative mt-auto pt-2 flex items-center justify-between gap-1">
                <span className="font-fut text-[26px] font-bold leading-none text-primary tabular-nums whitespace-nowrap">{formatPrice(service.price)}</span>
                <ServiceActionButton
                  mode={mode}
                  pickLabel={pickLabel}
                  selected={selected}
                  serviceName={name}
                  variant="solid"
                  onClick={() => onAction?.(service)}
                  reduceMotion={reduceMotion}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
