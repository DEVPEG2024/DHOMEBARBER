/**
 * Privatiser le salon : « Pour quelle occasion ? ». Grille 2 × 2 des occasions (`EVENT_TYPES`) ; un
 * tap ouvre la demande de devis avec l'occasion déjà choisie (`onPick(type.id)`).
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { hapticFeedback } from '@/lib/capacitor';
import Reveal, { RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { EVENT_TYPES } from './privatisationUtils';

function OccasionCard({ type, onPick }) {
  const reduce = useReducedMotion();
  const Icon = type.icon;
  return (
    <motion.button
      type="button"
      whileTap={reduce ? undefined : { scale: 0.97 }}
      onClick={() => { hapticFeedback(); onPick?.(type.id); }}
      aria-label={`Demander un devis : ${type.label}`}
      className="relative overflow-hidden h-full w-full min-h-[156px] rounded-[20px] bg-card border border-border p-3.5 flex flex-col items-start text-left text-foreground hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span aria-hidden="true" className="w-[42px] h-[42px] rounded-[14px] bg-primary/15 border border-primary/25 text-primary flex items-center justify-center">
        <Icon className="w-5 h-5" strokeWidth={1.8} />
      </span>
      {/* Taille réduite sur petit écran : « Anniversaire » tient sur une ligne à 320 px */}
      <span className="mt-3 max-w-full font-fut text-[clamp(19px,6.2vw,26px)] font-extrabold leading-none uppercase [overflow-wrap:anywhere]">
        {type.label}
      </span>
      <span className="mt-1 max-w-full text-xs leading-snug text-muted-foreground">{type.pitch}</span>
      <span aria-hidden="true" className="absolute right-3 top-3.5 w-7 h-7 rounded-full bg-foreground/5 text-muted-foreground flex items-center justify-center">
        <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
      </span>
    </motion.button>
  );
}

export default function OccasionGrid({ onPick }) {
  return (
    <Reveal as="section" aria-labelledby="privat-occasions-title">
      <h2 id="privat-occasions-title" className="font-display text-[22px] font-bold text-foreground">
        Pour quelle occasion ?
      </h2>
      <p className="mt-1 mb-3 text-[13px] text-muted-foreground">
        Touchez une carte : la demande s'ouvre avec l'occasion choisie.
      </p>
      <RevealGroup className="grid grid-cols-2 gap-3">
        {EVENT_TYPES.map(type => (
          <RevealItem key={type.id} className="min-w-0">
            <OccasionCard type={type} onPick={onPick} />
          </RevealItem>
        ))}
      </RevealGroup>
    </Reveal>
  );
}
