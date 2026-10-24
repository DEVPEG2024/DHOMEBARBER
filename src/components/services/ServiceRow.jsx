import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import ServiceActionButton from './ServiceActionButton';
import { descriptionLead, formatDuration, formatPrice } from './serviceUtils';

/**
 * Ligne compacte d'une prestation, dans la liste groupée d'une rubrique : nom (deux lignes au plus),
 * « durée · début de la description » sur une ligne, prix, puis le bouton d'action à droite.
 * La zone texte + prix est un vrai bouton qui ouvre la fiche ; l'action est un second bouton à côté.
 * Une prestation choisie est soulignée d'un fond vert léger (couleur seulement, rien ne bouge).
 */
export default function ServiceRow({ service, selected = false, replaces, isNew = false, mode, pickLabel, onOpen, onAction, reduceMotion = false }) {
  const name = String(service?.name || '').trim();
  const lead = descriptionLead(service);
  return (
    <li className={`flex items-center gap-2 pl-3.5 pr-3 transition-colors duration-300 ${selected ? 'bg-primary/10' : ''}`}>
      <motion.button
        type="button"
        onClick={() => onOpen?.(service)}
        aria-haspopup="dialog"
        whileTap={reduceMotion ? undefined : { scale: 0.985 }}
        className="flex-1 min-w-0 min-h-[60px] py-2.5 flex items-center gap-2.5 text-left rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold leading-snug text-foreground line-clamp-2 break-words">{name}</span>
          <span className="flex items-center gap-1.5 mt-0.5 min-w-0 text-xs text-muted-foreground">
            {isNew && (
              <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-primary">
                <Sparkles className="w-2.5 h-2.5" aria-hidden="true" /> Nouveau
              </span>
            )}
            <span className="truncate">
              {formatDuration(service?.duration)}{lead ? ` · ${lead}` : ''}
            </span>
          </span>
        </span>
        <span className="shrink-0 min-w-[2.5rem] text-right font-fut text-[21px] font-bold leading-none text-primary tabular-nums">
          {formatPrice(service?.price)}
        </span>
      </motion.button>
      <ServiceActionButton
        mode={mode}
        pickLabel={pickLabel}
        selected={selected}
        replaces={replaces}
        serviceName={name}
        onClick={() => onAction?.(service)}
        reduceMotion={reduceMotion}
      />
    </li>
  );
}
