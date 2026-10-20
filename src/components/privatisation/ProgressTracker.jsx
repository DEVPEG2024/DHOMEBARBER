/**
 * Frise d'avancement d'une demande de privatisation : Envoyée → Devis → Accepté → Confirmé
 * (`STAGES`). Étapes faites = pastille verte cochée ; étape en cours (`index === stage`) = anneau
 * ambre avec un halo qui respire ; à venir = anneau gris. La ligne se remplit en vert jusqu'à
 * l'étape en cours ; `stage === 4` = tout est fait.
 *
 *   <ProgressTracker stage={2} currentLabel="Accepté ?" />
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { STAGES } from './privatisationUtils';

const STATE_TEXT = { done: 'terminée', current: 'en cours', todo: 'à venir' };

export default function ProgressTracker({ stage, currentLabel, className = '' }) {
  const reduce = useReducedMotion();
  const total = STAGES.length;
  const current = Math.max(0, Math.min(total, Number(stage) || 0));
  // Ligne verte : du centre de la 1re colonne jusqu'au centre de l'étape en cours (25 % par étape)
  const fill = Math.min(current, total - 1) / total;

  return (
    <div className={`relative ${className}`}>
      <span aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-[11px] h-0.5 rounded-full bg-border" />
      {fill > 0 && (
        <motion.span
          aria-hidden="true"
          className="absolute left-[12.5%] top-[11px] h-0.5 rounded-full bg-primary origin-left"
          style={{ width: `${fill * 100}%` }}
          initial={{ scaleX: reduce ? 1 : 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: reduce ? 0 : 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        />
      )}
      <ol role="list" aria-label="Avancement de la demande" className="relative grid grid-cols-4">
        {STAGES.map((s, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo';
          const label = state === 'current' && currentLabel ? currentLabel : s.label;
          return (
            <li
              key={s.id}
              aria-current={state === 'current' ? 'step' : undefined}
              className="relative flex min-w-0 flex-col items-center gap-1.5"
            >
              <StepDot state={state} reduce={reduce} delay={i * 0.08} />
              <span
                aria-hidden="true"
                className={`max-w-full px-0.5 text-center text-[11px] leading-tight break-words ${
                  state === 'current'
                    ? 'font-semibold text-amber-600 dark:text-amber-400'
                    : state === 'done' ? 'text-foreground/80' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
              <span className="sr-only">{`Étape ${i + 1} sur ${total}, ${s.label} : ${STATE_TEXT[state]}`}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepDot({ state, reduce, delay }) {
  if (state === 'done') {
    return (
      <motion.span
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
        initial={reduce ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22, delay }}
      >
        <Check className="h-[13px] w-[13px]" strokeWidth={3} />
      </motion.span>
    );
  }
  if (state === 'current') {
    return (
      <span aria-hidden="true" className="relative flex h-6 w-6 items-center justify-center">
        {/* Halo : fixe en réduction des mouvements, sinon il respire doucement */}
        {reduce ? (
          <span className="absolute -inset-[5px] rounded-full bg-amber-500/15" />
        ) : (
          <motion.span
            className="absolute -inset-[5px] rounded-full bg-amber-500/20"
            initial={{ scale: 0.85, opacity: 0.5 }}
            animate={{ scale: [0.85, 1.12, 0.85], opacity: [0.5, 0.95, 0.5] }}
            transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
          />
        )}
        <span className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-amber-500 bg-card">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
        </span>
      </span>
    );
  }
  return <span aria-hidden="true" className="h-6 w-6 rounded-full border-2 border-muted-foreground/35 bg-card" />;
}
