import React from 'react';
import { visitsLeftLabel } from '@/components/subscriptions-admin/subscriptionAdmin';

/** Barre d'une carte d'abonnement : un segment par coupe, ceux déjà utilisés en gris (à gauche). */
export default function VisitSegments({ left, total, className = '' }) {
  const used = Math.max(0, total - left);
  return (
    <div role="img" aria-label={`${visitsLeftLabel(left)} sur ${total}`} className={`flex gap-1.5 ${className}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-full ${i < used ? 'bg-white/15' : 'bg-primary'}`} />
      ))}
    </div>
  );
}
