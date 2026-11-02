import React from 'react';
import { SNAKE_COLORS as C } from '../palette';

/**
 * Interrupteur des pages du Snake du Gang (planche « Vitesse et options ») : piste de 52 × 32 px,
 * vert allumé, gris éteint ; zone de toucher de 60 × 44 px. Nommé par `labelledBy` (id du libellé
 * à côté) ou `label`. Le rond glisse par `transform` seulement (rien quand on réduit les animations).
 */
export default function SnakeSwitch({ checked, onChange, disabled = false, labelledBy, describedBy, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked ? 'true' : 'false'}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="grid h-11 w-[60px] shrink-0 place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3DBE7E]"
    >
      <span
        aria-hidden="true"
        className="flex h-8 w-[52px] items-center rounded-full p-[3px] motion-safe:transition-colors"
        style={{ background: checked ? C.vert : C.piste }}
      >
        <span
          className="h-[26px] w-[26px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] motion-safe:transition-transform"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </span>
    </button>
  );
}
