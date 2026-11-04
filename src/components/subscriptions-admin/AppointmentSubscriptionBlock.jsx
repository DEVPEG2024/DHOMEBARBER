/**
 * Fiche d'un RDV de l'agenda : ce que dit l'abonnement auquel il appartient (« Coupe 1 sur 4 », payé ou
 * pas encore réglé) et ce qu'il reste à faire. La coupe se débite en scannant la carte sur l'ordinateur
 * du salon, connecté en admin : un barber lit l'état, sans bouton d'encaissement.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Keyboard, Repeat, ScanLine } from 'lucide-react';
import LoadError, { queryFailed } from '@/components/shared/LoadError';
import { euro } from '@/lib/euro';
import { SUBSCRIPTION_VISITS, fetchSubscription, subscriptionKeys } from '@/lib/subscriptions';
import { hasNoVisitLeft, visitKeptMessage, visitsLeftLabel } from '@/components/subscriptions-admin/subscriptionAdmin';
import SubscriptionDialog from '@/components/subscriptions-admin/SubscriptionDialog';

/** Abonnement d'un RDV, relu à chaque ouverture de sa fiche. `enabled` faux : RDV ordinaire. */
export function useAppointmentSubscription(appointment, enabled) {
  const id = appointment?.subscription_id;
  return useQuery({
    queryKey: subscriptionKeys.one(id),
    queryFn: () => fetchSubscription(id),
    enabled: enabled && !!id,
    staleTime: 15 * 1000,
  });
}

export default function AppointmentSubscriptionBlock({ appointment, isAdmin, query }) {
  const [showValidate, setShowValidate] = useState(false);
  const sub = query.data;
  const debited = (Number(appointment.gift_card_amount) || 0) > 0;
  const closedOut = ['cancelled', 'no_show'].includes(appointment.status);
  const paid = sub?.status === 'active';
  const pending = sub?.status === 'pending';
  const visit = appointment.subscription_visit;
  const open = !debited && !appointment.payment_method && !closedOut;
  // Plus aucune coupe (le serveur laisse alors encaisser normalement) : rien à scanner
  const noVisit = hasNoVisitLeft(sub);
  // La coupe reste à débiter : RDV ouvert, abonnement réglé, au moins une coupe
  const toDebit = paid && open && !noVisit;
  const kept = closedOut && !debited ? visitKeptMessage(sub) : '';
  const apt = encodeURIComponent(appointment.id);

  return (
    <div className="rounded-2xl border border-primary/40 bg-primary/5 p-3 space-y-2.5 min-w-0" data-testid="rdv-abonnement">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Repeat className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 break-words">Abonnement{visit ? ` · Coupe ${visit} sur ${SUBSCRIPTION_VISITS}` : ''}</span>
        </p>
        {sub?.service_name && <p className="mt-0.5 text-xs text-muted-foreground break-words">{sub.service_name}</p>}
      </div>

      {queryFailed(query) ? (
        <LoadError compact what="l'abonnement" error={query.error} onRetry={query.refetch} retrying={query.isFetching} />
      ) : query.isPending ? (
        <div className="h-5 w-40 rounded bg-white/5 motion-safe:animate-pulse" />
      ) : sub?.status === 'cancelled' ? (
        <p className="text-[13px] font-semibold text-red-300">Abonnement annulé</p>
      ) : paid ? (
        <p className="text-[13px] font-semibold text-green-300">Payé · {visitsLeftLabel(sub.visits_left)}</p>
      ) : pending ? (
        <p className="text-[13px] font-semibold text-amber-300">Pas encore réglé : {euro(sub.price)}</p>
      ) : null}

      {/* Un absent, un RDV annulé : rien n'est débité */}
      {sub && kept && <p className="text-xs text-muted-foreground">{kept}</p>}
      {noVisit && open && (
        <p className="text-xs font-medium text-foreground" data-testid="rdv-plus-de-coupe">Plus aucune coupe sur la carte : ce RDV s'encaisse normalement.</p>
      )}
      {debited && <p className="text-xs text-muted-foreground">Coupe débitée, réglée par la carte.</p>}

      {!isAdmin && (toDebit || (pending && !closedOut)) && (
        <p className="text-xs font-medium text-foreground">À débiter sur l'ordinateur du salon</p>
      )}

      {isAdmin && toDebit && (
        <div className="space-y-2">
          <Link
            to={`/admin/gift-cards?apt=${apt}&open=scanner`}
            className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-primary px-3 text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <ScanLine className="h-5 w-5 shrink-0" aria-hidden="true" />
            Scanner le QR de la carte
          </Link>
          <Link
            to={`/admin/gift-cards?apt=${apt}&open=code`}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-foreground transition-colors hover:bg-white/5"
          >
            <Keyboard className="h-4 w-4 shrink-0" aria-hidden="true" />
            Saisir le code de la carte
          </Link>
        </div>
      )}

      {isAdmin && pending && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowValidate(true)}
            className="min-h-11 w-full rounded-xl bg-amber-500 px-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
          >
            Encaisser l'abonnement
          </button>
          <p className="text-[11px] text-muted-foreground">Le scan est proposé juste après.</p>
        </div>
      )}

      {isAdmin && (
        <SubscriptionDialog
          subscription={showValidate ? sub : null}
          aptId={closedOut ? null : appointment.id}
          onClose={() => setShowValidate(false)}
        />
      )}
    </div>
  );
}
