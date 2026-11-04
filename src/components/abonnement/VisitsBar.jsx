/** Coupes restantes d'une carte d'abonnement : une barre de `total` segments, `left` remplis. */
import React from 'react';
import { visitsWord } from '@/lib/subscriptions';

export default function VisitsBar({ left, total, className = '' }) {
  return (
    <div role="img" aria-label={`${visitsWord(left)} sur ${total}`} className={`flex justify-center gap-1.5 ${className}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`w-8 h-1.5 rounded-full ${i < left ? 'bg-primary' : 'bg-white/15'}`} />
      ))}
    </div>
  );
}
