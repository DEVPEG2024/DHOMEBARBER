import React from 'react';
import { KINDS } from './serviceUtils';

/** Pastille d'icône d'une prestation ou d'une rubrique (lucide ou emoji selon la nature, `KINDS`). */
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
        : <meta.Icon className={`${icon} ${meta.iconClass || ''}`} />}
    </span>
  );
}

export default KindIcon;
