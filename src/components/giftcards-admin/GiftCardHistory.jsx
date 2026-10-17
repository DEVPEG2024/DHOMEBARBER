import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History } from 'lucide-react';
import LoadError from '@/components/shared/LoadError';
import {
  fetchGiftCardTransactions, giftCardTransactionsKey, formatEuro, formatParisDateTime,
  canUndoTransaction, runGiftCardUndo,
} from '@/lib/giftCardDebit';

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
