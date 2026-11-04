/**
 * Choix de la formule (planche 1) : les formules du serveur (`GET /subscriptions/plans`) et
 * « Comment ça marche » en trois lignes. Le bouton de la barre du bas est porté par la page.
 */
import React from 'react';
import { KindIcon } from '@/components/services/KindIcon';
import { formatDuration, formatPrice } from '@/components/services/serviceUtils';
import { hapticFeedback } from '@/lib/capacitor';
import StepHeader from './StepHeader';
import { unitLabel } from './visitLabels';

const HOW_IT_WORKS = [
  'Vous choisissez vos 4 rendez-vous.',
  'Vous réglez l\'abonnement au salon.',
  'Vos 4 coupes arrivent sur votre carte. Le salon scanne son QR code à chaque visite.',
];

export default function PlanChoice({ plans, selectedId, onSelect, onBack, missing = false, notice = null }) {
  return (
    <div className="space-y-4">
      <StepHeader title="Abonnements" onBack={onBack} />

      <div className="flex items-center gap-3">
        <KindIcon kind="pack" />
        <p className="text-[13px] text-muted-foreground">4 rendez-vous réservés d'un coup, réglés au salon.</p>
      </div>

      {notice}

      {missing && (
        <p role="status" className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-200/90">
          Cet abonnement n'est plus proposé : choisissez-en un autre.
        </p>
      )}

      <div className="space-y-2.5" role="group" aria-label="Choix de la formule">
        {plans.map((plan) => {
          const active = String(plan.service_id) === String(selectedId);
          return (
            <button
              key={plan.service_id}
              type="button"
              aria-pressed={active}
              onClick={() => { hapticFeedback(); onSelect(plan); }}
              className={`w-full min-h-[72px] px-3.5 py-3 rounded-2xl text-left flex items-center justify-between gap-3 transition-colors duration-300 ${
                active ? 'border-2 border-primary bg-primary/10' : 'border border-border bg-card hover:border-primary/40'
              }`}
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-foreground break-words">{plan.name}</span>
                <span className="block mt-0.5 text-[13px] text-muted-foreground">
                  {unitLabel(plan)} · {formatDuration(plan.duration)} par visite
                </span>
              </span>
              <span className="shrink-0 text-lg font-extrabold text-foreground whitespace-nowrap">{formatPrice(plan.price)}</span>
            </button>
          );
        })}
      </div>

      <section aria-labelledby="abo-how-title" className="rounded-2xl border border-border bg-card p-3.5 space-y-3">
        <h2 id="abo-how-title" className="text-sm font-bold text-foreground">Comment ça marche</h2>
        <ol className="space-y-3">
          {HOW_IT_WORKS.map((line, i) => (
            <li key={line} className="flex items-start gap-2.5">
              <span className="w-6 h-6 shrink-0 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center" aria-hidden="true">{i + 1}</span>
              <p className="mt-0.5 text-[13px] leading-snug text-foreground/85">{line}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
