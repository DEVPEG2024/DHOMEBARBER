import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Link2, X } from 'lucide-react';
import { toast } from 'sonner';
import LoadError, { isNetworkError } from '@/components/shared/LoadError';
import {
  fetchGiftCardTransactions, giftCardTransactionsKey, formatEuro, formatParisDateTime,
  canUndoTransaction, runGiftCardUndo, attachGiftCardDebit, fetchRecentAppointmentsToCash,
  giftCardRecentAppointmentsKey, parisToday, appointmentDue, appointmentPrice, appointmentServicesLabel, formatDay,
  closeAppointmentWithGiftCard, friendlyGiftCardError, round2, fetchAppointmentById,
  invalidateGiftCardQueries, ATTACH_NETWORK_MESSAGE,
} from '@/lib/giftCardDebit';

const lower = (v) => String(v || '').trim().toLowerCase();

/**
 * Rattacher un débit fait sans RDV (« Prestations », « Montant libre ») à un RDV des 7 derniers
 * jours encore à encaisser : la part carte est portée sur le RDV (sinon il était encaissé une
 * seconde fois en CB / espèces). Panneau dans la fiche, fermé par « Fermer ».
 */
function AttachPanel({ card, tx, onClose, onDone }) {
  const queryClient = useQueryClient();
  const today = parisToday();
  const [sendingId, setSendingId] = useState(null);
  const [attached, setAttached] = useState(null); // RDV rattaché, entièrement couvert : proposer la clôture
  const q = useQuery({
    queryKey: giftCardRecentAppointmentsKey(today),
    queryFn: () => fetchRecentAppointmentsToCash(7, today),
    staleTime: 30 * 1000,
  });
  const owner = [lower(card?.recipient_email), lower(card?.sender_email), lower(card?.recipient_name), lower(card?.sender_name)].filter(Boolean);
  const isOwner = (a) => owner.includes(lower(a.client_email)) || owner.includes(lower(a.client_name));
  const list = (Array.isArray(q.data) ? q.data : [])
    .filter((a) => appointmentDue(a) + 0.005 >= Number(tx.amount))
    .sort((a, b) => Number(isOwner(b)) - Number(isOwner(a)));

  const attach = async (apt) => {
    if (sendingId) return;
    setSendingId(apt.id);
    try {
      const data = await attachGiftCardDebit(card, tx.id, apt.id, queryClient);
      if (data?.already) {
        // Déjà rattaché à ce RDV (première réponse perdue) : la part carte du RDV est relue, la
        // liste chargée pouvant la compter ou non
        toast.success(`Débit déjà rattaché au RDV de ${apt.client_name || 'ce client'}`);
        let fresh = null;
        try { fresh = await fetchAppointmentById(apt.id); } catch { /* relecture au mieux */ }
        const open = fresh && !fresh.payment_method && fresh.status === 'confirmed' && fresh.payment_status !== 'paid';
        if (open && appointmentPrice(fresh) > 0 && appointmentDue(fresh) <= 0) setAttached(fresh);
        else { onDone?.(); onClose(); }
        return;
      }
      toast.success(`${formatEuro(tx.amount)} rattachés au RDV de ${apt.client_name || 'ce client'}`);
      if (round2(appointmentDue(apt) - Number(tx.amount)) <= 0) setAttached({ ...apt, gift_card_amount: round2((Number(apt.gift_card_amount) || 0) + Number(tx.amount)) });
      else { onDone?.(); onClose(); }
    } catch (err) {
      const noAnswer = isNetworkError(err) || (!err?.status && err?.name === 'TypeError');
      if (err?.data?.code === 'already_attached') {
        // Ancien serveur, ou rattaché ailleurs entre-temps : l'historique montre l'état réel
        toast.error('Ce débit est déjà rattaché', { description: 'Vérifiez le RDV dans l\'agenda.' });
        onDone?.();
        onClose();
        return;
      }
      if (noAnswer) {
        toast.error('Rattachement incertain', { description: ATTACH_NETWORK_MESSAGE, duration: 12000 });
        invalidateGiftCardQueries(queryClient, card.id);
        onDone?.();
      } else {
        toast.error('Rattachement impossible', { description: friendlyGiftCardError(err) });
      }
      q.refetch();
    } finally {
      setSendingId(null);
    }
  };
  const close = async () => {
    try {
      await closeAppointmentWithGiftCard(attached, card, tx.amount, queryClient);
      toast.success('RDV clôturé (carte cadeau)');
    } catch (err) {
      toast.error('Clôture impossible : faites-la dans l\'agenda', { description: friendlyGiftCardError(err) });
    }
    onDone?.();
    onClose();
  };

  return (
    <div className="mt-2 rounded-xl border border-primary/25 bg-primary/5 p-2.5 space-y-2" data-testid="gc-attach">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-foreground">Rattacher {formatEuro(tx.amount)} à un rendez-vous</p>
        <button type="button" onClick={onClose} aria-label="Fermer" className="p-1 rounded-lg text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {attached ? (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">Le RDV est entièrement réglé par carte cadeau : le clôturer maintenant ?</p>
          <div className="flex gap-2">
            <button type="button" onClick={close} className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold text-white bg-primary">Clôturer le RDV</button>
            <button type="button" onClick={() => { onDone?.(); onClose(); }} className="flex-1 py-1.5 rounded-lg text-[11px] text-muted-foreground bg-white/5 border border-white/10">Plus tard</button>
          </div>
        </div>
      ) : q.isError && !q.data ? (
        <LoadError compact what="les rendez-vous à encaisser" error={q.error} onRetry={q.refetch} retrying={q.isFetching} />
      ) : q.isPending ? (
        <p className="text-[11px] text-muted-foreground">Chargement…</p>
      ) : list.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Aucun rendez-vous des 7 derniers jours à encaisser pour ce montant.</p>
      ) : (
        <ul className="space-y-1.5 max-h-56 overflow-y-auto">
          {list.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => attach(a)} disabled={!!sendingId}
                className={`w-full text-left rounded-lg border px-2.5 py-2 text-[11px] disabled:opacity-60 ${isOwner(a) ? 'border-primary/40 bg-primary/10' : 'border-white/10 bg-white/5'}`}>
                <span className="block font-semibold text-foreground break-words">{a.client_name || 'Client'}{isOwner(a) ? ' · titulaire de la carte' : ''}</span>
                <span className="block text-muted-foreground break-words">
                  {formatDay(a.date)} · {String(a.start_time || '').slice(0, 5)}{a.employee_name ? ` · ${a.employee_name}` : ''}
                  {appointmentServicesLabel(a) ? ` · ${appointmentServicesLabel(a)}` : ''} · reste {formatEuro(appointmentDue(a))}
                </span>
                {sendingId === a.id && <span className="block text-primary">Rattachement…</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const KIND_LABELS = { debit: 'Débit', credit: 'Crédit', undo: 'Annulation' };

function describe(tx) {
  if (tx.note) return tx.note;
  const services = Array.isArray(tx.services) ? tx.services.map((s) => (typeof s === 'string' ? s : s?.name)).filter(Boolean) : [];
  if (services.length) return services.join(' + ');
  if (tx.appointment_id) return 'Rendez-vous';
  return '';
}

/**
 * Historique des mouvements d'une carte (`GET /gift-cards/:id/transactions`). Rien seulement si la
 * route n'existe pas (null) ; en cas d'échec, LoadError (jamais rien : l'admin croirait la carte
 * jamais débitée). Un débit de moins de 24 h s'annule ici, en deux taps.
 */
export default function GiftCardHistory({ cardId, card, onCardChange }) {
  const queryClient = useQueryClient();
  const { data, isError, error, refetch, isFetching } = useQuery({
    queryKey: giftCardTransactionsKey(cardId),
    queryFn: () => fetchGiftCardTransactions(cardId),
    retry: false,
    staleTime: 30 * 1000,
  });
  // Débit dont l'annulation attend sa confirmation, et celui en cours d'envoi
  const [confirmId, setConfirmId] = useState(null);
  const [undoingId, setUndoingId] = useState(null);
  const [attachId, setAttachId] = useState(null);
  const undoingRef = useRef(false);

  const undo = async (tx) => {
    if (undoingRef.current || !card) return;
    undoingRef.current = true;
    setUndoingId(tx.id);
    try {
      await runGiftCardUndo({ card, transaction: tx, previousApt: null, queryClient, onCardChange });
    } finally {
      undoingRef.current = false;
      setUndoingId(null);
      setConfirmId(null);
      // Refus du serveur (trop tard, déjà annulé, rien à rendre) : l'historique montre l'état réel
      refetch();
    }
  };

  if (isError && !Array.isArray(data)) {
    return (
      <div className="mt-4" data-testid="gc-history-error">
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
          <History className="w-3.5 h-3.5 text-muted-foreground" /> Historique
        </p>
        <LoadError compact what="l'historique de la carte" error={error} onRetry={refetch} retrying={isFetching} />
      </div>
    );
  }
  if (!Array.isArray(data)) return null;

  return (
    <div className="mt-4" data-testid="gc-history">
      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
        <History className="w-3.5 h-3.5 text-muted-foreground" /> Historique
      </p>
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun mouvement pour l'instant.</p>
      ) : (
        <ul className="space-y-1.5">
          {data.slice(0, 20).map((tx) => {
            const isOut = tx.kind === 'debit';
            const undone = !!tx.undone_at;
            const who = tx.staff_name || tx.staff_email;
            const text = describe(tx);
            const undoable = canUndoTransaction(tx, card);
            const busy = undoingId === tx.id;
            return (
              <li key={tx.id} className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {KIND_LABELS[tx.kind] || 'Mouvement'}
                      <span className="text-muted-foreground font-normal"> · {formatParisDateTime(tx.created_at)}</span>
                    </p>
                    {text && <p className="text-[11px] text-muted-foreground break-words">{text}</p>}
                    {who && <p className="text-[10px] text-muted-foreground/70 truncate">par {who}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${undone ? 'line-through text-muted-foreground' : isOut ? 'text-red-400' : 'text-green-400'}`}>
                      {isOut ? '−' : '+'}{formatEuro(tx.amount)}
                    </p>
                    {tx.balance_after != null && <p className="text-[10px] text-muted-foreground">solde {formatEuro(tx.balance_after)}</p>}
                    {undone && <p className="text-[10px] text-amber-400">annulé</p>}
                  </div>
                </div>
                {isOut && !undone && !tx.appointment_id && tx.id && card?.status !== 'expired' && attachId !== tx.id && (
                  <div className="mt-1.5 flex justify-end">
                    <button type="button" onClick={() => { setAttachId(tx.id); setConfirmId(null); }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80">
                      <Link2 className="w-3 h-3" /> Rattacher à un RDV
                    </button>
                  </div>
                )}
                {attachId === tx.id && (
                  <AttachPanel card={card} tx={tx} onClose={() => setAttachId(null)} onDone={() => refetch()} />
                )}
                {undoable && (
                  <div className="mt-1.5 flex flex-wrap items-center justify-end gap-2">
                    {confirmId !== tx.id ? (
                      <button type="button" onClick={() => setConfirmId(tx.id)} disabled={!!undoingId}
                        className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 disabled:opacity-50">
                        Annuler ce débit
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => undo(tx)} disabled={!!undoingId}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60">
                          {busy ? 'Annulation…' : 'Confirmer'}
                        </button>
                        <button type="button" onClick={() => setConfirmId(null)} disabled={!!undoingId}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-muted-foreground bg-white/5 border border-white/10 disabled:opacity-50">
                          Non
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
