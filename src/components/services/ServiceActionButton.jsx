import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

/**
 * Bouton d'action d'une prestation (ligne du catalogue, carte « Les plus demandées ») :
 * - `mode="pick"` : action principale (« Réserver », « Choisir ») ;
 * - `mode="toggle"` : bascule « Ajouter » / « Ajouté ✓ » quand le client compose plusieurs prestations ;
 *   « Remplacer » quand la prestation ferait doublon avec la sélection (`replaces` : noms des
 *   prestations qu'elle remplace, voir `replacedBy` de serviceUtils.js).
 * Toujours un bouton distinct de la zone qui ouvre la fiche (jamais de bouton dans un bouton).
 * Hauteur visible 36 px, zone de tap étendue à 48 px par un pseudo-élément.
 * `variant="solid"` : posé sur une carte sombre (« Les plus demandées »).
 */
export default function ServiceActionButton({ mode, pickLabel, selected = false, replaces = [], onClick, serviceName = '', variant = 'soft', reduceMotion = false }) {
  const toggle = mode === 'toggle';
  const on = toggle && selected;
  const replace = toggle && !selected && replaces.length > 0;
  const label = replace ? 'Remplacer' : toggle ? (on ? 'Ajouté' : 'Ajouter') : pickLabel;
  const ariaLabel = replace
    ? `Remplacer ${replaces.join(' et ')} par ${serviceName}`
    : toggle ? `Ajouter ${serviceName} à ma sélection` : `${pickLabel} : ${serviceName}`;

  let colors;
  if (on) colors = 'bg-primary text-primary-foreground border border-primary shadow-md shadow-primary/25';
  else if (variant === 'solid' && !toggle) colors = 'bg-primary text-primary-foreground border border-primary hover:bg-primary/90';
  else colors = 'border border-primary/50 bg-primary/10 text-primary hover:bg-primary/15';
  const shape = variant === 'solid' ? 'h-9 px-2.5 rounded-[10px]' : 'h-9 px-3 rounded-full';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={toggle && !replace ? on : undefined}
      aria-label={ariaLabel}
      whileTap={reduceMotion ? undefined : { scale: 0.94 }}
      className={`relative shrink-0 inline-flex items-center justify-center gap-1 whitespace-nowrap text-xs font-semibold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/60 before:content-[''] before:absolute before:-inset-x-1 before:-inset-y-1.5 ${shape} ${colors}`}
    >
      {label}
      {on && (
        <motion.span
          initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 22 }}
          className="inline-flex"
          aria-hidden="true"
        >
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        </motion.span>
      )}
    </motion.button>
  );
}
