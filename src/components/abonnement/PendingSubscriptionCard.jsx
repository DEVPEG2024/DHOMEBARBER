/**
 * Abonnement pas encore réglé, sur la page des cartes : ce qu'il reste à payer et les RDV réservés,
 * sans QR (la carte n'existe qu'une fois le paiement validé par le salon).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { formatPrice } from '@/components/services/serviceUtils';
import { dayLabel, visitLabel } from './visitLabels';

export default function PendingSubscriptionCard({ subscription }) {
  const visits = subscription.appointments || [];
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-400" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">À régler au salon</p>
            <p className="text-xs text-muted-foreground break-words">{subscription.service_name}</p>
          </div>
        </div>
        <p className="text-lg font-bold text-foreground shrink-0">{formatPrice(subscription.price)}</p>
      </div>
      <p className="mt-2.5 text-[13px] leading-relaxed text-foreground/85">
        Réglez au plus tard à votre premier rendez-vous. Vos {subscription.visits} coupes arriveront ensuite ici, sur votre carte.
      </p>
      {visits.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {visits.map(visit => (
            <li key={visit.id} className="text-[13px] leading-snug text-foreground/85 break-words">
              <span className="font-semibold">{visitLabel(visit.visit, subscription.visits)}</span>
              {' · '}{dayLabel(visit.date)} · {visit.start_time} · {visit.employee_name}
            </li>
          ))}
        </ul>
      )}
      {subscription.to_rebook > 0 && (
        <Link
          to={`/abonnement?reprendre=${encodeURIComponent(subscription.id)}`}
          className="mt-3 min-h-[44px] flex items-center justify-center rounded-xl border border-primary/40 bg-primary/10 text-sm font-semibold text-primary hover:bg-primary/15 transition-colors"
        >
          Reprendre un RDV
        </Link>
      )}
    </div>
  );
}
