/**
 * Fenêtre d'un abonnement (Abonnements, et « Encaisser l'abonnement » de la fiche d'un RDV) :
 *  - à régler : valider le paiement (CB ou espèces, aucun choix par défaut), puis le code de la carte créée ;
 *  - payé : coupes restantes, RDV, carte ;
 *  - annulation en deux temps : ce qui reste à rembourser à la main est annoncé avant et après.
 * Fermée par la croix. Valider et annuler sont rejouables par le serveur : un double clic ou une réponse
 * perdue ne crée jamais une seconde carte.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Banknote, Ban, CheckCircle2, CreditCard, Gift, Phone, Repeat } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { friendlyError } from '@/components/shared/LoadError';
import { euro } from '@/lib/euro';
import { formatDay, invalidateGiftCardQueries } from '@/lib/giftCardDebit';
import { cancelSubscription, invalidateSubscriptionQueries, validateSubscription } from '@/lib/subscriptions';
import {
  barbersOf, cancelLabel, longDay, openVisitsOf, refundOf, visitsLeftLabel, visitsOf,
} from '@/components/subscriptions-admin/subscriptionAdmin';
import VisitSegments from '@/components/subscriptions-admin/VisitSegments';

const PAYMENT_LABELS = { cb: 'CB', especes: 'Espèces' };
const PAYMENTS = [
  { value: 'cb', label: 'CB', icon: CreditCard },
  { value: 'especes', label: 'Espèces', icon: Banknote },
];

/** `tel:` d'un numéro saisi librement. */
const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

const visitNote = (a) => {
  if (a.status === 'no_show') return 'Absent';
  if (a.paid_by_card || a.payment_method) return 'Débité';
  return '';
};

/** Les RDV de l'abonnement, un par ligne ; le barber n'est écrit que s'ils ne sont pas tous chez le même. */
function VisitList({ view }) {
  const visits = visitsOf(view);
  const severalBarbers = new Set(visits.map((a) => a.employee_name)).size > 1;
  if (visits.length === 0) {
    return <p className="rounded-xl border border-border bg-background/40 px-3 py-3 text-xs text-muted-foreground">Aucun RDV réservé.</p>;
  }
  return (
    <ul className="space-y-1.5 rounded-xl border border-border bg-background/40 px-3 py-2.5">
      {visits.map((a) => (
        <li key={a.id} className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="min-w-0 break-words text-foreground">
            {longDay(String(a.date).slice(0, 10), { upper: true })}
            {severalBarbers && a.employee_name && <span className="text-muted-foreground"> · {a.employee_name}</span>}
          </span>
          <span className="flex shrink-0 items-baseline gap-2">
            {visitNote(a) && <span className="text-[11px] font-semibold text-muted-foreground">{visitNote(a)}</span>}
            <span className="font-semibold tabular-nums text-foreground">{String(a.start_time).slice(0, 5)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Client et formule, en tête de chaque écran de la fenêtre. */
function Header({ view }) {
  return (
    <div className="min-w-0">
      <p className="text-base font-bold text-foreground break-words">{view.client_name || 'Client'}</p>
      <p className="mt-0.5 text-[13px] text-muted-foreground break-words">
        {[view.service_name, barbersOf(view)].filter(Boolean).join(' · ')}
      </p>
      {view.client_phone && (
        <a href={telHref(view.client_phone)} className="mt-1 inline-flex min-h-8 items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline">
          <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {view.client_phone}
        </a>
      )}
    </div>
  );
}

/** Écran d'après une validation : le code de la carte créée, et « Ouvrir la carte ». */
function ValidatedScreen({ view, aptId, onClose }) {
  const code = view.card?.code;
  const search = new URLSearchParams();
  if (code) search.set('scan', code);
  if (aptId) search.set('apt', String(aptId));
  return (
    <div className="space-y-4" data-testid="abo-valide">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="text-lg font-bold text-foreground">Carte créée</p>
        <p className="text-sm text-muted-foreground">
          {view.visits} coupes créditées pour {view.client_name || 'ce client'}
          {PAYMENT_LABELS[view.payment_method] ? ` · payé en ${PAYMENT_LABELS[view.payment_method]}` : ''}
        </p>
      </div>
      {code && (
        <div className="rounded-xl border border-border bg-background/40 px-3 py-3 text-center">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Code de la carte</p>
          <p className="mt-0.5 font-mono text-base font-semibold text-foreground break-all" data-testid="abo-code">{code}</p>
          {view.valid_until && <p className="mt-1 text-[11px] text-muted-foreground">Valable jusqu'au {formatDay(view.valid_until)}</p>}
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        {code && (
          <Link
            to={`/admin/gift-cards?${search.toString()}`}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Gift className="h-4 w-4 shrink-0" aria-hidden="true" />
            Ouvrir la carte
          </Link>
        )}
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 flex-1 rounded-xl border border-border bg-white/5 px-3 text-sm font-medium text-foreground hover:bg-white/10"
        >
          Terminer
        </button>
      </div>
    </div>
  );
}

/** Écran d'après une annulation : RDV libérés et montant à rembourser à la main. */
function CancelledScreen({ view, result, onClose }) {
  const count = Number(result.cancelled_appointments) || 0;
  const refund = Number(result.refund_due) || 0;
  // Renvoi (réponse perdue, ou annulé ailleurs) : le serveur rend le montant de la première annulation
  const replayed = !!result.replayed;
  return (
    <div className="space-y-4" data-testid="abo-annule">
      <div className="min-w-0 text-center">
        <p className="text-lg font-bold text-foreground">{replayed ? 'Déjà annulé' : 'Abonnement annulé'}</p>
        <p className="mt-1 text-sm text-muted-foreground break-words">
          {view.client_name || 'Client'}
          {!replayed && ` · ${count > 1 ? `${count} RDV annulés` : count === 1 ? '1 RDV annulé' : 'Aucun RDV à annuler'}`}
        </p>
      </div>
      {refund > 0 ? (
        <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-center">
          <p className="text-xs text-amber-200">À rembourser à la main au client</p>
          <p className="mt-0.5 text-2xl font-black tabular-nums text-amber-100">{euro(refund)}</p>
        </div>
      ) : (
        <p className="rounded-xl border border-border bg-background/40 px-3 py-3 text-center text-sm text-muted-foreground">Rien à rembourser.</p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="min-h-12 w-full rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Terminer
      </button>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object|null} props.subscription  vue équipe, `null` : fenêtre fermée
 * @param {() => void} props.onClose
 * @param {boolean} [props.startWithCancel]  ouverte directement sur la confirmation d'annulation
 * @param {string} [props.aptId]  RDV de l'agenda d'où l'on vient : présélectionné en ouvrant la carte
 */
export default function SubscriptionDialog({ subscription, onClose, startWithCancel = false, aptId = null }) {
  const queryClient = useQueryClient();
  const [paymentMethod, setPaymentMethod] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(startWithCancel);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // Écran de fin : gardé même si la liste relue change l'abonnement (une validation le fait passer « en cours »)
  const [validated, setValidated] = useState(null);
  const [cancelled, setCancelled] = useState(null);
  // Refus du serveur (RDV passé pas clôturé…) : dans la confirmation, la fenêtre reste ouverte
  const [cancelRefusal, setCancelRefusal] = useState('');

  const subscriptionId = subscription?.id;
  useEffect(() => {
    setPaymentMethod('');
    setValidated(null);
    setCancelled(null);
    setCancelRefusal('');
    setConfirmCancel(startWithCancel);
  }, [subscriptionId, startWithCancel]);

  const refresh = () => {
    invalidateSubscriptionQueries(queryClient);
    invalidateGiftCardQueries(queryClient);
  };

  const handleValidate = async () => {
    if (busyRef.current || !paymentMethod) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const data = await validateSubscription(subscription.id, paymentMethod);
      setValidated(data.subscription);
      toast.success(data.replayed ? 'Abonnement déjà validé : aucune seconde carte' : 'Abonnement validé');
      refresh();
    } catch (err) {
      toast.error(friendlyError(err, 'Validation impossible'));
      if (err?.status === 409 || err?.status === 404) refresh();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setCancelRefusal('');
    try {
      const data = await cancelSubscription(subscription.id);
      setCancelled(data);
      toast.success(data.replayed ? 'Abonnement déjà annulé' : 'Abonnement annulé');
      refresh();
    } catch (err) {
      if (err?.status === 409) setCancelRefusal(friendlyError(err, 'Annulation impossible'));
      else toast.error(friendlyError(err, 'Annulation impossible'));
      if (err?.status === 409 || err?.status === 404) refresh();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const view = subscription;
  const isPending = view?.status === 'pending';
  const isActive = view?.status === 'active';
  const openCount = view ? openVisitsOf(view).length : 0;
  const refund = refundOf(view);
  const canCancel = (isPending || view?.display_status === 'active') && !validated && !cancelled;
  const left = Number(view?.visits_left) || 0;
  const title = validated || (isPending && !cancelled) ? "Valider l'abonnement" : 'Abonnement';

  return (
    <Dialog open={!!subscription} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent aria-describedby={undefined} className="bg-card border-border max-w-md max-h-[90dvh] overflow-y-auto">
        {view && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2 pr-6 text-left">
                <Repeat className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {title}
              </DialogTitle>
            </DialogHeader>

            {validated ? (
              <ValidatedScreen view={validated} aptId={aptId} onClose={onClose} />
            ) : cancelled ? (
              <CancelledScreen view={view} result={cancelled} onClose={onClose} />
            ) : (
              <div className="space-y-4 min-w-0">
                <Header view={view} />
                <VisitList view={view} />

                {isPending && (
                  <>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm text-muted-foreground">Montant à encaisser</p>
                      <p className="text-3xl font-black tabular-nums text-foreground" data-testid="abo-montant">{euro(view.price)}</p>
                    </div>
                    <div>
                      <p className="mb-2 text-[13px] font-semibold text-foreground">Payé en</p>
                      <div className="grid grid-cols-2 gap-2">
                        {PAYMENTS.map(({ value, label, icon: Icon }) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={paymentMethod === value}
                            onClick={() => setPaymentMethod(value)}
                            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors ${
                              paymentMethod === value ? 'bg-primary text-primary-foreground' : 'border border-white/10 bg-white/5 text-foreground hover:bg-white/10'
                            }`}
                          >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      Une fois validé, une carte de {view.visits} coupes est créée pour ce client. Il la voit dans l'app et reçoit une notification.
                    </p>
                    {!confirmCancel && (
                      <button
                        type="button"
                        onClick={handleValidate}
                        disabled={busy || !paymentMethod}
                        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {busy ? 'Validation…' : `Encaissé : créditer les ${view.visits} coupes`}
                      </button>
                    )}
                  </>
                )}

                {isActive && view.card && (
                  <div className="rounded-xl border border-border bg-background/40 p-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-base font-bold text-foreground">{visitsLeftLabel(left)}</p>
                      <p className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">solde {euro(view.card.remaining_balance)}</p>
                    </div>
                    <VisitSegments left={left} total={Number(view.visits) || left} className="mt-2" />
                    <p className="mt-2 text-[11px] text-muted-foreground break-words">
                      {PAYMENT_LABELS[view.payment_method] ? `Payé en ${PAYMENT_LABELS[view.payment_method]}` : 'Payé'}
                      {view.validated_at ? ` le ${formatDay(view.validated_at)}` : ''}
                      {view.valid_until ? ` · valable jusqu'au ${formatDay(view.valid_until)}` : ''}
                    </p>
                    {view.to_rebook > 0 && (
                      <p className="mt-1 text-xs text-amber-300">
                        {view.to_rebook > 1 ? `${view.to_rebook} coupes à reprogrammer` : '1 coupe à reprogrammer'} par le client.
                      </p>
                    )}
                    {view.card.code && (
                      <Link
                        to={`/admin/gift-cards?scan=${encodeURIComponent(view.card.code)}${aptId ? `&apt=${encodeURIComponent(aptId)}` : ''}`}
                        className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-foreground hover:bg-white/10"
                      >
                        <Gift className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Ouvrir la carte
                      </Link>
                    )}
                  </div>
                )}

                {view.status === 'cancelled' && (
                  <p className="rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2.5 text-xs text-muted-foreground break-words">
                    Annulé{view.cancelled_at ? ` le ${formatDay(view.cancelled_at)}` : ''}{view.cancellation_reason ? ` · ${view.cancellation_reason}` : ''}
                  </p>
                )}

                {canCancel && (confirmCancel ? (
                  <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 space-y-2.5 min-w-0">
                    <p className="flex items-start gap-2 text-sm font-semibold text-red-300">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 break-words">{cancelLabel(openCount)} ?</span>
                    </p>
                    <p className="text-xs leading-relaxed text-red-100/90">
                      {openCount > 0 ? 'Les créneaux sont libérés et le client est prévenu. ' : ''}
                      {isPending ? "Rien n'a été encaissé : rien à rembourser." : refund > 0 ? '' : 'Rien à rembourser.'}
                    </p>
                    {refund > 0 && (
                      <p className="text-sm font-bold text-amber-200" data-testid="abo-remboursement">À rembourser à la main : {euro(refund)}</p>
                    )}
                    {cancelRefusal && (
                      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs font-semibold text-amber-200 break-words" data-testid="abo-annulation-refus">
                        {cancelRefusal}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setConfirmCancel(false); setCancelRefusal(''); }}
                        disabled={busy}
                        className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/5 text-xs font-medium text-foreground hover:bg-white/10 disabled:opacity-50"
                      >
                        Garder
                      </button>
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={busy}
                        className="min-h-11 flex-1 rounded-xl bg-red-500 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                      >
                        {busy ? 'Annulation…' : "Confirmer l'annulation"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(true)}
                      disabled={busy}
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <Ban className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {cancelLabel(openCount)}
                    </button>
                    <p className="text-center text-[11px] text-muted-foreground">Annuler : administrateur seulement.</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
