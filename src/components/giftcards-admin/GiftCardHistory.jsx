import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Link2, X, Undo2, ShoppingBag, CheckCircle2, Ban, XCircle, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import LoadError, { isNetworkError } from '@/components/shared/LoadError';
import {
  fetchGiftCardHistory, buildGiftCardTimeline, giftCardTransactionsKey, formatEuro, formatParisDateTime,
  canUndoTransaction, runGiftCardUndo, attachGiftCardDebit, fetchRecentAppointmentsToCash,
  giftCardRecentAppointmentsKey, parisToday, appointmentDue, appointmentPrice, appointmentServicesLabel, formatDay,
  closeAppointmentWithGiftCard, friendlyGiftCardError, round2, fetchAppointmentById,
  invalidateGiftCardQueries, ATTACH_NETWORK_MESSAGE,
  fetchRecentPaidAppointments, giftCardRecentPaidKey, creditGiftCard,
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
  // RDV déjà validé en CB / espèces, payé finalement par la carte (tour 7) : repliés, confirmation
  const [showPaid, setShowPaid] = useState(false);
  const [confirmPaidId, setConfirmPaidId] = useState(null);
  const paidQ = useQuery({
    queryKey: giftCardRecentPaidKey(today),
    queryFn: () => fetchRecentPaidAppointments(7, today),
    enabled: showPaid,
    staleTime: 30 * 1000,
  });
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

  const paidList = (Array.isArray(paidQ.data) ? paidQ.data : [])
    .filter((a) => appointmentDue(a) + 0.005 >= Number(tx.amount))
    .sort((a, b) => Number(isOwner(b)) - Number(isOwner(a)));

  const attach = async (apt, { correctPaid = false } = {}) => {
    if (sendingId) return;
    setSendingId(apt.id);
    try {
      const data = await attachGiftCardDebit(card, tx.id, apt.id, queryClient, { correctPaid });
      if (correctPaid) {
        toast.success(`${formatEuro(tx.amount)} rattachés au RDV de ${apt.client_name || 'ce client'}`, {
          description: 'Payé par carte : cette part est retirée du CB / espèces au tableau de bord.',
        });
        onDone?.();
        onClose();
        return;
      }
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
      {!attached && (
        <div className="border-t border-white/10 pt-2">
          <button type="button" onClick={() => setShowPaid((v) => !v)} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground">
            {showPaid ? '▾' : '▸'} Déjà encaissés en CB / espèces (corriger)
          </button>
          {showPaid && (
            paidQ.isError && !paidQ.data ? (
              <LoadError compact what="les rendez-vous encaissés" error={paidQ.error} onRetry={paidQ.refetch} retrying={paidQ.isFetching} />
            ) : paidQ.isPending ? (
              <p className="text-[11px] text-muted-foreground mt-1">Chargement…</p>
            ) : paidList.length === 0 ? (
              <p className="text-[11px] text-muted-foreground mt-1">Aucun rendez-vous encaissé en CB / espèces ces 7 derniers jours pour ce montant.</p>
            ) : (
              <ul className="space-y-1.5 mt-1.5 max-h-56 overflow-y-auto">
                {paidList.map((a) => (
                  <li key={a.id} className={`rounded-lg border px-2.5 py-2 text-[11px] ${isOwner(a) ? 'border-primary/40 bg-primary/10' : 'border-white/10 bg-white/5'}`}>
                    <span className="block font-semibold text-foreground break-words">{a.client_name || 'Client'}{isOwner(a) ? ' · titulaire de la carte' : ''}</span>
                    <span className="block text-muted-foreground break-words">
                      {formatDay(a.date)} · {String(a.start_time || '').slice(0, 5)}{a.employee_name ? ` · ${a.employee_name}` : ''} · encaissé {a.payment_method === 'cb' ? 'CB' : a.payment_method === 'mixte' ? 'CB + espèces' : 'espèces'} {formatEuro(appointmentPrice(a))}
                    </span>
                    {confirmPaidId !== a.id ? (
                      <button type="button" onClick={() => setConfirmPaidId(a.id)} disabled={!!sendingId}
                        className="mt-1 font-semibold text-primary disabled:opacity-60">
                        Payé par cette carte ?
                      </button>
                    ) : (
                      <div className="mt-1 space-y-1">
                        <p className="text-amber-300 break-words">
                          {formatEuro(tx.amount)} seront comptés « carte cadeau » et retirés du {a.payment_method === 'especes' ? 'espèces' : 'CB'} de ce RDV au tableau de bord. Rendez cette somme au client si elle avait été encaissée.
                        </p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => attach(a, { correctPaid: true })} disabled={!!sendingId}
                            className="flex-1 py-1.5 rounded-lg font-semibold text-white bg-primary disabled:opacity-60">
                            {sendingId === a.id ? 'Rattachement…' : 'Confirmer'}
                          </button>
                          <button type="button" onClick={() => setConfirmPaidId(null)} disabled={!!sendingId}
                            className="flex-1 py-1.5 rounded-lg text-muted-foreground bg-white/5 border border-white/10">
                            Non
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}
    </div>
  );
}

/**
 * « Rendre sur la carte » (tour 7) : part d'un débit de RDV payée en trop (prix baissé, prestation
 * retirée), rendue même après les 24 h de l'annulation. Plafond calculé par le serveur.
 */
function CreditPanel({ card, tx, max, onClose, onDone }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(() => (max > 0 ? String(max).replace('.', ',') : ''));
  const [sending, setSending] = useState(false);
  const value = round2(Number(String(amount).replace(',', '.')));
  const valid = value > 0 && value <= max + 0.005;
  const send = async () => {
    if (!valid || sending) return;
    setSending(true);
    try {
      const data = await creditGiftCard(card, { appointmentId: tx.appointment_id, amount: value, note: 'Rendu sur la carte (prix corrigé)' }, queryClient);
      toast.success(`${formatEuro(data?.returned ?? value)} rendus sur la carte`);
      onDone?.(data);
      onClose();
    } catch (err) {
      toast.error('Impossible de rendre sur la carte', { description: err?.data?.error || friendlyGiftCardError(err) });
      onDone?.();
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="mt-2 rounded-xl border border-green-500/25 bg-green-500/5 p-2.5 space-y-2" data-testid="gc-credit">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-foreground">Rendre sur la carte (au plus {formatEuro(max)})</p>
        <button type="button" onClick={onClose} aria-label="Fermer" className="p-1 rounded-lg text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
          aria-label="Montant à rendre"
          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-foreground" />
        <button type="button" onClick={send} disabled={!valid || sending}
          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-black bg-green-400 disabled:opacity-50">
          {sending ? 'Envoi…' : 'Rendre'}
        </button>
      </div>
    </div>
  );
}

const KIND_LABELS = { debit: 'Débit', credit: 'Rendu sur la carte', undo: 'Débit annulé' };
const PAYMENT_LABELS = { cb: 'CB', especes: 'espèces' };
const VISIBLE_ROWS = 15;

function describe(tx) {
  if (tx.note) return tx.note;
  const services = Array.isArray(tx.services) ? tx.services.map((s) => (typeof s === 'string' ? s : s?.name)).filter(Boolean) : [];
  if (services.length) return services.join(' + ');
  if (tx.appointment_id) return 'Rendez-vous';
  return '';
}

/** Ligne de la vie de la carte (commande, vente, rejet, annulation, prolongation) : libellé, détail, montant. */
export function lifecycleRow(entry) {
  const amount = entry.amount != null ? formatEuro(entry.amount) : null;
  switch (entry.type) {
    case 'created':
      return { icon: ShoppingBag, tone: 'text-muted-foreground', label: 'Commandée', detail: entry.who ? `par ${entry.who}` : '', amount, amountTone: 'text-foreground' };
    case 'validated':
      return {
        icon: CheckCircle2, tone: 'text-green-400', label: 'Payée et validée',
        detail: [PAYMENT_LABELS[entry.payment_method] ? `réglée en ${PAYMENT_LABELS[entry.payment_method]}` : '', entry.who ? `par ${entry.who}` : ''].filter(Boolean).join(' · '),
        amount, amountTone: 'text-green-400',
      };
    case 'rejected':
      return { icon: Ban, tone: 'text-red-400', label: 'Demande rejetée', detail: entry.who ? `par ${entry.who}` : '', amount: null };
    case 'cancelled':
      return {
        icon: XCircle, tone: 'text-red-400', label: 'Carte annulée',
        detail: [entry.amount ? `solde perdu ${formatEuro(entry.amount)}` : '', entry.who ? `par ${entry.who}` : ''].filter(Boolean).join(' · '),
        amount: null,
      };
    case 'extended':
      return {
        icon: CalendarClock, tone: 'text-primary', label: 'Validité prolongée',
        detail: [entry.detail?.to ? `jusqu'au ${formatDay(entry.detail.to)}${entry.detail?.from ? ` (au lieu du ${formatDay(entry.detail.from)})` : ''}` : '', entry.who ? `par ${entry.who}` : ''].filter(Boolean).join(' · '),
        amount: null,
      };
    default:
      return { icon: History, tone: 'text-muted-foreground', label: 'Opération', detail: '', amount };
  }
}

/**
 * Historique complet d'une carte : commande, vente, mouvements de solde, rejet, annulation,
 * prolongation (`GET /gift-cards/:id/transactions`). Rien seulement si la route n'existe pas
 * (null) ; en cas d'échec, LoadError (jamais rien : l'admin croirait la carte jamais débitée). Un
 * débit de moins de 24 h s'annule ici, en deux taps.
 */
export default function GiftCardHistory({ cardId, card, onCardChange }) {
  const queryClient = useQueryClient();
  const { data: history, isError, error, refetch, isFetching } = useQuery({
    queryKey: giftCardTransactionsKey(cardId),
    queryFn: () => fetchGiftCardHistory(cardId),
    retry: false,
    staleTime: 30 * 1000,
  });
  const data = history ? history.transactions : history;
  const [showAll, setShowAll] = useState(false);
  // Débit dont l'annulation attend sa confirmation, et celui en cours d'envoi
  const [confirmId, setConfirmId] = useState(null);
  const [undoingId, setUndoingId] = useState(null);
  const [attachId, setAttachId] = useState(null);
  const [creditId, setCreditId] = useState(null);
  const undoingRef = useRef(false);
  // Net encore débité par cette carte sur un RDV (débits non annulés − crédits) : plafond du « Rendre »
  const netByAppointment = new Map();
  for (const t of Array.isArray(data) ? data : []) {
    if (!t.appointment_id) continue;
    const k = String(t.appointment_id);
    const v = t.kind === 'debit' && !t.undone_at ? Number(t.amount) || 0 : t.kind === 'credit' ? -(Number(t.amount) || 0) : 0;
    netByAppointment.set(k, round2((netByAppointment.get(k) || 0) + v));
  }
  const room = round2((Number(card?.amount) || 0) - (Number(card?.remaining_balance) || 0));

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
  if (history === null) return null;
  if (!Array.isArray(data)) {
    return (
      <div className="mt-4" data-testid="gc-history-loading">
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
          <History className="w-3.5 h-3.5 text-muted-foreground" /> Historique
        </p>
        <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
      </div>
    );
  }

  const timeline = buildGiftCardTimeline(card, data, history.events);
  const rows = showAll ? timeline : timeline.slice(0, VISIBLE_ROWS);

  return (
    <div className="mt-4" data-testid="gc-history">
      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
        <History className="w-3.5 h-3.5 text-muted-foreground" /> Historique
      </p>
      {timeline.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune opération pour l'instant.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((entry) => {
            if (!entry.tx) {
              const row = lifecycleRow(entry);
              const Icon = row.icon;
              return (
                <li key={entry.key} className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2" data-testid={`gc-history-${entry.type}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-2">
                      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${row.tone}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">
                          {row.label}
                          <span className="text-muted-foreground font-normal"> · {entry.at ? formatParisDateTime(entry.at) : 'date non notée'}</span>
                        </p>
                        {row.detail && <p className="text-[11px] text-muted-foreground break-words">{row.detail}</p>}
                      </div>
                    </div>
                    {row.amount && <p className={`text-sm font-bold shrink-0 ${row.amountTone}`}>{row.amount}</p>}
                  </div>
                </li>
              );
            }
            const tx = entry.tx;
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
                {(() => {
                  const max = isOut && !undone && tx.appointment_id && tx.id && card && card.status !== 'expired'
                    ? Math.max(0, Math.min(netByAppointment.get(String(tx.appointment_id)) || 0, room)) : 0;
                  if (max <= 0) return null;
                  if (creditId === tx.id) {
                    return (
                      <CreditPanel card={card} tx={tx} max={max} onClose={() => setCreditId(null)}
                        onDone={(res) => { if (res?.card) onCardChange?.(res.card); refetch(); }} />
                    );
                  }
                  return (
                    <div className="mt-1.5 flex justify-end">
                      <button type="button" onClick={() => { setCreditId(tx.id); setConfirmId(null); setAttachId(null); }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-400 hover:text-green-300">
                        <Undo2 className="w-3 h-3" /> Rendre sur la carte
                      </button>
                    </div>
                  );
                })()}
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
      {timeline.length > VISIBLE_ROWS && (
        <button type="button" onClick={() => setShowAll((v) => !v)}
          className="mt-2 w-full py-2 rounded-xl text-[11px] font-semibold text-muted-foreground hover:text-foreground bg-white/5">
          {showAll ? 'Afficher moins' : `Afficher tout l'historique (${timeline.length})`}
        </button>
      )}
    </div>
  );
}
