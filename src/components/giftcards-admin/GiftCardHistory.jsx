import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { fetchGiftCardTransactions, giftCardTransactionsKey, formatEuro, formatParisDateTime } from '@/lib/giftCardDebit';

const KIND_LABELS = { debit: 'Débit', credit: 'Crédit', undo: 'Annulation' };

function describe(tx) {
  if (tx.note) return tx.note;
  const services = Array.isArray(tx.services) ? tx.services.map((s) => (typeof s === 'string' ? s : s?.name)).filter(Boolean) : [];
  if (services.length) return services.join(' + ');
  if (tx.appointment_id) return 'Rendez-vous';
  return '';
}

/**
 * Historique des mouvements d'une carte (`GET /gift-cards/:id/transactions`). Rien tant que la route
 * n'existe pas côté serveur (404) ou en cas d'erreur : l'historique est un complément.
 */
export default function GiftCardHistory({ cardId }) {
  const { data } = useQuery({
    queryKey: giftCardTransactionsKey(cardId),
    queryFn: () => fetchGiftCardTransactions(cardId),
    retry: false,
    staleTime: 30 * 1000,
  });

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
            return (
              <li key={tx.id} className="flex items-start justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
