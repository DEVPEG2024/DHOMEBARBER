/**
 * Abonnements au mois (Admin, 4 nov. 2026, contrat : docs/fonctions/abonnements-contrat.md).
 *
 * Écran de l'ordinateur du salon : trois onglets (À valider, En cours, Terminés), une grille de lignes
 * sur grand écran, une colonne sur téléphone. Une ligne ouvre la fenêtre de l'abonnement (valider le
 * paiement, annuler). Un abonnement à régler dont un RDV est déjà passé garde ses deux actions sur la
 * ligne : jamais d'annulation automatique, c'est au salon de décider.
 * Drapeau `features.subscriptions` faux : retour au tableau de bord ; illisible (panne, hors connexion) :
 * Réessayer, jamais l'attente sans fin ni « Aucun abonnement ».
 */
import React, { useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Repeat, ScanLine } from 'lucide-react';
import LoadError, { queryFailed } from '@/components/shared/LoadError';
import { useNow } from '@/lib/useDashboardData';
import { euro } from '@/lib/euro';
import { formatDay } from '@/lib/giftCardDebit';
import { fetchAllSubscriptions, subscriptionKeys, useSubscriptionsFeatureState } from '@/lib/subscriptions';
import {
  barbersOf, nextVisitOf, pendingStateOf, sortForTab, tabOf, visitsLeftLabel, whenOf,
} from '@/components/subscriptions-admin/subscriptionAdmin';
import SubscriptionDialog from '@/components/subscriptions-admin/SubscriptionDialog';

// Plafond du serveur par statut (`GET /subscriptions?status=`) : une liste pleine est signalée
const LIST_LIMIT = 300;
const TABS = [
  { key: 'pending', label: 'À valider', empty: 'Aucun abonnement à valider.' },
  { key: 'active', label: 'En cours', empty: 'Aucun abonnement en cours.' },
  { key: 'done', label: 'Terminés', empty: 'Aucun abonnement terminé.' },
];

/** Tous les abonnements, lus par statut : une longue histoire d'abonnements finis ne cache jamais ceux à régler. */
async function fetchEverySubscription() {
  const lists = await Promise.all(['pending', 'active', 'cancelled'].map((s) => fetchAllSubscriptions(s)));
  return { rows: lists.flat(), truncated: lists.some((l) => l.length >= LIST_LIMIT) };
}

const Chip = ({ tone, children }) => {
  const tones = {
    amber: 'bg-amber-500/15 text-amber-300',
    red: 'bg-red-500/15 text-red-300',
    green: 'bg-green-500/15 text-green-300',
    muted: 'bg-white/5 text-muted-foreground',
  };
  return <span className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone] || tones.muted}`}>{children}</span>;
};

/** Ligne à bouton unique (tout le haut de la carte), avec ses actions éventuelles en dessous. */
function RowShell({ tone = '', urgency = 'normal', onOpen, children, actions = null }) {
  return (
    <li data-urgence={urgency} className={`min-w-0 rounded-2xl border bg-card transition-colors ${tone || 'border-border hover:border-primary/30'}`}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full min-h-[76px] items-start gap-2 rounded-2xl p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span className="min-w-0 flex-1 space-y-1">{children}</span>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {actions}
    </li>
  );
}

const Title = ({ name, right }) => (
  <span className="flex items-baseline justify-between gap-3">
    <span className="min-w-0 truncate text-[15px] font-bold text-foreground">{name || 'Client'}</span>
    <span className="shrink-0">{right}</span>
  </span>
);
const Amount = ({ value }) => <span className="text-[15px] font-black tabular-nums text-foreground whitespace-nowrap">{euro(value)}</span>;
const Sub = ({ view }) => (
  <span className="block truncate text-[13px] text-muted-foreground">{[view.service_name, barbersOf(view)].filter(Boolean).join(' · ')}</span>
);

function PendingRow({ view, nowMs, onOpen, onCancel }) {
  const st = pendingStateOf(view, nowMs, euro);
  if (st.overdue) {
    return (
      <RowShell
        tone="border-red-500/40"
        urgency="pas-regle"
        onOpen={onOpen}
        actions={(
          <div className="flex gap-2 px-4 pb-4">
            <button
              type="button"
              onClick={onOpen}
              className="min-h-11 flex-1 rounded-xl bg-primary text-[13px] font-bold text-primary-foreground hover:bg-primary/90"
            >
              Valider
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 flex-1 rounded-xl border border-border text-[13px] font-semibold text-red-300 hover:bg-red-500/10"
            >
              Annuler les RDV
            </button>
          </div>
        )}
      >
        <Title name={view.client_name} right={<Chip tone="red">Pas réglé</Chip>} />
        <Sub view={view} />
        <span className="block text-[13px] text-red-300/90">{st.text}</span>
      </RowShell>
    );
  }
  return (
    <RowShell tone={st.soon ? 'border-amber-500/55 hover:border-amber-400' : ''} urgency={st.soon ? 'bientot' : 'normal'} onOpen={onOpen}>
      <Title name={view.client_name} right={<Amount value={view.price} />} />
      <Sub view={view} />
      {st.soon
        ? <span className="block pt-1"><Chip tone="amber">{st.text}</Chip></span>
        : <span className="block pt-0.5 text-xs text-muted-foreground">{st.text}</span>}
    </RowShell>
  );
}

function ActiveRow({ view, nowMs, onOpen }) {
  const next = nextVisitOf(view, nowMs);
  return (
    <RowShell onOpen={onOpen}>
      <Title name={view.client_name} right={<Amount value={view.price} />} />
      <Sub view={view} />
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
        <span className="text-xs font-semibold text-foreground">{visitsLeftLabel(view.visits_left)}</span>
        <span className="text-xs text-muted-foreground">{next ? `Prochain RDV ${whenOf(next, nowMs)}` : 'Aucun RDV à venir'}</span>
        {view.to_rebook > 0 && <Chip tone="amber">{view.to_rebook} à reprogrammer</Chip>}
        {view.outdated && <Chip tone="red">Validité dépassée</Chip>}
      </span>
    </RowShell>
  );
}

function DoneRow({ view, onOpen }) {
  const cancelled = view.status === 'cancelled';
  return (
    <RowShell onOpen={onOpen}>
      <Title name={view.client_name} right={<Chip tone={cancelled ? 'red' : 'green'}>{cancelled ? 'Annulé' : 'Terminé'}</Chip>} />
      <Sub view={view} />
      <span className="block pt-0.5 text-xs text-muted-foreground">
        {euro(view.price)}{cancelled && view.cancelled_at ? ` · annulé le ${formatDay(view.cancelled_at)}` : ''}
      </span>
    </RowShell>
  );
}

export default function AdminSubscriptions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [openState, setOpenState] = useState(null); // { id, cancel }
  const nowMs = useNow();
  // Pas `useSubscriptionsFeature` : il dit faux pendant la lecture du drapeau, la page repartirait aussitôt
  const flag = useSubscriptionsFeatureState();
  const listQ = useQuery({
    queryKey: subscriptionKeys.all(),
    queryFn: fetchEverySubscription,
    enabled: flag.enabled,
  });

  const rows = useMemo(() => listQ.data?.rows || [], [listQ.data]);
  const byTab = useMemo(() => {
    const out = { pending: [], active: [], done: [] };
    for (const view of rows) out[tabOf(view)].push(view);
    return out;
  }, [rows]);

  const tabParam = searchParams.get('tab');
  const tab = TABS.some((t) => t.key === tabParam) ? tabParam : 'pending';
  const setTab = (key) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (key === 'pending') next.delete('tab');
    else next.set('tab', key);
    return next;
  }, { replace: true });

  if (flag.disabled) return <Navigate to="/admin" replace />;

  const failed = flag.failed || queryFailed(listQ);
  const failedQuery = flag.failed ? flag.query : listQ;
  const loading = !failed && (flag.pending || listQ.isPending);
  const list = sortForTab(byTab[tab], tab, nowMs);
  const current = TABS.find((t) => t.key === tab);
  const opened = openState ? rows.find((v) => String(v.id) === String(openState.id)) || null : null;
  const known = !failed && !loading;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Repeat className="h-5 w-5 text-primary" aria-hidden="true" />
            Abonnements
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">À valider au paiement, puis une coupe débitée à chaque RDV</p>
        </div>
        <Link
          to="/admin/gift-cards?open=scanner"
          className="flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
        >
          <ScanLine className="h-4 w-4" aria-hidden="true" />
          Scanner une carte
        </Link>
      </div>

      <div role="tablist" aria-label="Abonnements" className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = known ? byTab[t.key].length : null;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`min-h-11 rounded-full px-4 text-[13px] font-semibold transition-colors ${
                tab === t.key ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}{count != null && t.key !== 'done' ? ` (${count})` : ''}
            </button>
          );
        })}
      </div>

      {listQ.data?.truncated && (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Seuls les {LIST_LIMIT} derniers abonnements de chaque statut sont affichés.
        </p>
      )}

      {failed ? (
        <LoadError what="les abonnements" error={failedQuery.error} onRetry={failedQuery.refetch} retrying={failedQuery.isFetching} />
      ) : loading ? (
        <div className="flex justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : list.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Repeat className="mx-auto mb-2 h-10 w-10 opacity-30" aria-hidden="true" />
          <p className="text-sm">{current.empty}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {list.map((view) => {
            const open = () => setOpenState({ id: view.id, cancel: false });
            if (tab === 'pending') {
              return (
                <PendingRow
                  key={view.id}
                  view={view}
                  nowMs={nowMs}
                  onOpen={open}
                  onCancel={() => setOpenState({ id: view.id, cancel: true })}
                />
              );
            }
            return tab === 'active'
              ? <ActiveRow key={view.id} view={view} nowMs={nowMs} onOpen={open} />
              : <DoneRow key={view.id} view={view} onOpen={open} />;
          })}
        </ul>
      )}

      <SubscriptionDialog
        subscription={opened}
        startWithCancel={!!openState?.cancel}
        onClose={() => setOpenState(null)}
      />
    </div>
  );
}
