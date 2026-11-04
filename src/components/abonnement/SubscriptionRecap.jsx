/**
 * Récapitulatif avant l'envoi (planche 4) : formule, 4 RDV, « À régler au salon », puis les règles
 * (crédit sur la carte, validité d'un an, RDV annulé, délai de 24 h).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { KindIcon } from '@/components/services/KindIcon';
import { formatPrice } from '@/components/services/serviceUtils';
import { SALON_PHONE, SALON_PHONE_HREF } from '@/lib/cancellation';
import { perVisit } from './ProposedVisits';
import { dayLabel } from './visitLabels';

export default function SubscriptionRecap({ plan, lines, onEditPlan, error = null }) {
  const barbers = [...new Set(lines.map(l => l.employee?.name).filter(Boolean))];
  const oneBarber = barbers.length === 1 ? barbers[0] : null;
  return (
    <div className="space-y-4">
      {/* Refus qui ne se règle pas sur cet écran : le message du serveur, tel quel, et où agir */}
      {error && (
        <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[13px] leading-relaxed text-amber-200 break-words">
          {error.message}
          {error.link && (
            <>
              {' '}
              <Link to="/appointments" className="font-semibold text-primary underline underline-offset-2 whitespace-nowrap">Voir mes rendez-vous</Link>
            </>
          )}
        </div>
      )}

      <div className="rounded-[18px] border border-border bg-card overflow-hidden">
        <div className="p-3.5 border-b border-border flex items-center gap-3">
          <KindIcon kind="pack" />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-foreground break-words">{plan.name}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {oneBarber ? `avec ${oneBarber} · ` : ''}{perVisit(plan)}
            </p>
          </div>
          <button type="button" onClick={onEditPlan} aria-label="Modifier la formule"
            className="shrink-0 min-h-[44px] px-1.5 text-[13px] font-semibold text-primary hover:text-primary/80">
            Modifier
          </button>
        </div>
        <ul className="p-3.5 space-y-2.5">
          {lines.map(line => (
            <li key={line.date} className="flex items-center justify-between gap-3">
              <p className="text-sm text-foreground min-w-0 break-words">
                {dayLabel(line.date)}
                {!oneBarber && <span className="text-muted-foreground"> · {line.employee?.name}</span>}
              </p>
              <p className="text-sm font-bold text-foreground tabular-nums shrink-0">{line.time}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-[18px] border border-primary/45 bg-primary/10 p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold text-foreground">À régler au salon</p>
          <p className="text-2xl font-extrabold text-foreground whitespace-nowrap">{formatPrice(plan.price)}</p>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-foreground/85">
          Réglez au plus tard à votre premier rendez-vous. Vos créneaux sont réservés dès maintenant.
        </p>
      </div>

      <div className="space-y-2.5 px-0.5">
        <p className="text-[13px] leading-relaxed text-foreground/85">
          Une fois réglé, vos 4 coupes sont créditées sur votre carte. Elles restent valables 1 an.
        </p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Un RDV annulé garde sa coupe sur la carte. Moins de 24 h avant un RDV, appelez le salon au{' '}
          <a href={SALON_PHONE_HREF} className="font-semibold text-primary whitespace-nowrap">{SALON_PHONE}</a>.
        </p>
      </div>
    </div>
  );
}
