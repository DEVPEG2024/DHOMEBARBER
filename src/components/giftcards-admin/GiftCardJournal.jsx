import React, { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { History, ArrowDownLeft, ArrowUpRight, Undo2, ChevronRight } from 'lucide-react';
import LoadError, { queryFailed } from '@/components/shared/LoadError';
import { lifecycleRow } from '@/components/giftcards-admin/GiftCardHistory';
import { fetchGiftCardJournal, giftCardJournalKey, formatEuro } from '@/lib/giftCardDebit';

const TZ = 'Europe/Paris';
const PAGE = 100;

const FILTERS = [
  { key: 'all', label: 'Tout', types: null },
  { key: 'sales', label: 'Ventes', types: ['validated'] },
  { key: 'uses', label: 'Utilisations', types: ['debit', 'undo', 'credit'] },
  { key: 'ends', label: 'Annulations', types: ['cancelled', 'rejected'] },
  { key: 'orders', label: 'Commandes', types: ['created'] },
];

/** Jour de Paris (`AAAA-MM-JJ`) d'un horodatage, pour regrouper les lignes. */
function parisDayKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function dayTitle(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const s = d.toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function parisTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

function describeTx(entry) {
  if (entry.note) return entry.note;
  const services = Array.isArray(entry.services) ? entry.services.map((s) => (typeof s === 'string' ? s : s?.name)).filter(Boolean) : [];
  if (services.length) return services.join(' + ');
  if (entry.appointment_id) return 'Rendez-vous';
  return '';
}

/** Libellé, détail, montant et couleurs d'une ligne du journal. */
function journalRow(entry) {
  if (entry.type === 'debit') {
    const undone = !!entry.undone_at;
    return {
      icon: ArrowDownLeft, tone: 'text-red-400', label: undone ? 'Débit (annulé)' : 'Débit',
      detail: [describeTx(entry), entry.balance_after != null ? `solde ${formatEuro(entry.balance_after)}` : ''].filter(Boolean).join(' · '),
      amount: `−${formatEuro(entry.amount)}`, amountTone: undone ? 'line-through text-muted-foreground' : 'text-red-400',
      who: entry.staff_name,
    };
  }
  if (entry.type === 'undo' || entry.type === 'credit') {
    return {
      icon: entry.type === 'undo' ? Undo2 : ArrowUpRight, tone: 'text-green-400',
      label: entry.type === 'undo' ? 'Débit annulé' : 'Rendu sur la carte',
      detail: [describeTx(entry), entry.balance_after != null ? `solde ${formatEuro(entry.balance_after)}` : ''].filter(Boolean).join(' · '),
      amount: `+${formatEuro(entry.amount)}`, amountTone: 'text-green-400', who: entry.staff_name,
    };
  }
  // Vie de la carte : mêmes libellés que l'historique de la fiche
  const row = lifecycleRow({
    type: entry.type, amount: entry.amount, who: entry.type === 'created' ? entry.card?.sender_name : entry.staff_name,
    payment_method: entry.payment_method, detail: entry.detail,
  });
  return { ...row, who: null };
}

/**
 * Journal de toutes les cartes cadeau (Admin → Cartes cadeau → Historique) : commandes, ventes,
 * débits, annulations, prolongations, regroupés par jour (heure de Paris). Un tap ouvre la fiche
 * de la carte. Pages de 100 lignes (« Voir plus »).
 */
export default function GiftCardJournal({ onOpenCard }) {
  const [filter, setFilter] = useState('all');
  const q = useInfiniteQuery({
    queryKey: giftCardJournalKey,
    queryFn: ({ pageParam }) => fetchGiftCardJournal({ before: pageParam, limit: PAGE }),
    initialPageParam: null,
    getNextPageParam: (last) => {
      const entries = last?.entries || [];
      return last?.has_more && entries.length ? entries[entries.length - 1].at : undefined;
    },
    staleTime: 30 * 1000,
  });

  const pages = q.data?.pages || [];
  const missingRoute = pages.length > 0 && pages[0] === null;
  const all = pages.flatMap((p) => (p?.entries || []));
  const types = FILTERS.find((f) => f.key === filter)?.types;
  const entries = types ? all.filter((e) => types.includes(e.type)) : all;

  const groups = [];
  for (const e of entries) {
    const key = parisDayKey(e.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(e);
    else groups.push({ key, title: dayTitle(e.at), items: [e] });
  }

  return (
    <div data-testid="gc-journal">
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {queryFailed(q) || (q.isError && !all.length) ? (
        <LoadError what="l'historique des cartes cadeau" error={q.error} onRetry={q.refetch} retrying={q.isFetching} />
      ) : q.isPending ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : missingRoute ? (
        <p className="text-center text-sm text-muted-foreground py-16">Historique pas encore disponible sur le serveur.</p>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{filter === 'all' ? 'Aucune opération pour l\'instant' : 'Aucune opération de ce type'}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{g.title}</h3>
              <ul className="space-y-1.5">
                {g.items.map((e) => {
                  const row = journalRow(e);
                  const Icon = row.icon;
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => onOpenCard?.(e.card)}
                        className="w-full text-left bg-card rounded-2xl border border-border px-3.5 py-3 hover:border-primary/20 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                            <Icon className={`w-4 h-4 ${row.tone}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-foreground">
                              {row.label}
                              <span className="text-muted-foreground font-normal"> · {parisTime(e.at)}</span>
                            </p>
                            <p className="text-[11px] text-muted-foreground break-words">
                              <span className="font-mono text-[10px]">{e.card?.code}</span>
                              {e.card?.recipient_name ? ` · pour ${e.card.recipient_name}` : ''}
                            </p>
                            {row.detail && <p className="text-[11px] text-muted-foreground break-words">{row.detail}</p>}
                            {row.who && <p className="text-[10px] text-muted-foreground/70 truncate">par {row.who}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {row.amount && <span className={`text-sm font-bold whitespace-nowrap ${row.amountTone}`}>{row.amount}</span>}
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {q.hasNextPage && (
            <button
              type="button"
              onClick={() => q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
              className="w-full py-2.5 rounded-xl text-xs font-semibold text-muted-foreground bg-card border border-border hover:text-foreground disabled:opacity-60"
            >
              {q.isFetchingNextPage ? 'Chargement…' : 'Voir les opérations plus anciennes'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
