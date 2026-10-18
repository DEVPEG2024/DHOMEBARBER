/**
 * Admin « Cartes Gang » (/admin/gang-cards, admin seulement). En tête les chiffres et la
 * répartition par niveau, puis trois onglets (`?tab=`) :
 * - Collection (par défaut) : toutes les cartes des clients sur une page, recherche, filtres,
 *   tri ; un tap ouvre la fiche du client (carte, parcours daté, écussons datés, visites…) ;
 * - À relancer : habitués qui perdent leur fraîcheur (appel ou relance push) ;
 * - Saison et écussons : top des 90 derniers jours, écussons débloqués.
 * Données : `GET /gang-card/admin/overview`, `/admin/cards`, `/admin/client/:id`.
 * Composants dans src/components/gang-admin/.
 */
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, IdCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import LoadError, { queryFailed } from '@/components/shared/LoadError';
import { useGangAdminOverview, useGangAdminCards, GANG_ADMIN_CARDS_QUERY_KEY } from '@/lib/gangCardApi';
import GangAdminTotals, { GangAdminTotalsSkeleton } from '@/components/gang-admin/GangAdminTotals';
import GangFadingList from '@/components/gang-admin/GangFadingList';
import { GangTopSeason, GangBadgeStats } from '@/components/gang-admin/GangTopSeason';
import GangCollection from '@/components/gang-admin/GangCollection';
import GangClientSheet from '@/components/gang-admin/GangClientSheet';

const TABS = [
  { key: 'collection', label: 'Collection' },
  { key: 'relance', label: 'À relancer' },
  { key: 'saison', label: 'Saison et écussons' },
];

function formatUpdated(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  try {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  } catch {
    return null;
  }
}

export default function AdminGangCards() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const query = useGangAdminOverview({ enabled: isAdmin });
  const { data, isPending, error, refetch, isFetching } = query;
  const cardsQuery = useGangAdminCards({ enabled: isAdmin });
  // Hors connexion, React Query met la requête en pause (isPending sans erreur) : écran
  // « Pas de connexion » au lieu d'un chargement sans fin
  const failed = queryFailed(query);
  const cardsFailed = queryFailed(cardsQuery);
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'collection';
  const setTab = (key) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (key === 'collection') next.delete('tab'); else next.set('tab', key);
    return next;
  }, { replace: true });
  const [openEntry, setOpenEntry] = useState(null);
  const refreshAll = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: GANG_ADMIN_CARDS_QUERY_KEY });
  };

  if (user && !isAdmin) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Cette page est réservée à l'administrateur.
      </div>
    );
  }

  const withCard = Number(data?.totals?.with_card) || 0;
  const updated = formatUpdated(data?.generated_at);

  return (
    <div className="min-w-0 max-w-5xl">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Clients</p>
          <h1 className="font-display text-2xl font-bold">Cartes Gang</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isPending && !failed ? 'Chargement…' : updated ? `Mis à jour à ${updated}` : 'Les cartes de collection de vos clients.'}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={refreshAll}
          disabled={isFetching || cardsQuery.isFetching}
          aria-label="Actualiser"
          className="text-muted-foreground shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching || cardsQuery.isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isPending && !failed && (
        <div className="space-y-4">
          <GangAdminTotalsSkeleton />
          <div className="h-[260px] rounded-2xl border border-border bg-card animate-pulse" />
        </div>
      )}

      {failed && (
        <LoadError what="les cartes Gang" error={error} onRetry={refetch} retrying={isFetching} />
      )}

      {data && withCard === 0 && (
        <div className="space-y-4">
          <GangAdminTotals totals={data.totals} />
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <IdCard className="w-8 h-8 mx-auto text-muted-foreground mb-2" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">Aucune carte pour l’instant</p>
            <p className="text-xs text-muted-foreground mt-1">
              Un client reçoit sa carte après sa première visite terminée.
            </p>
          </div>
        </div>
      )}

      {data && withCard > 0 && (
        <div className="space-y-4">
          <GangAdminTotals totals={data.totals} />

          {/* Onglets */}
          <div className="flex gap-1 rounded-2xl bg-secondary/60 p-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Vues des cartes Gang">
            {TABS.map((t) => {
              const active = tab === t.key;
              const n = t.key === 'relance' ? (data.fading || []).length : t.key === 'collection' ? withCard : null;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  className={`flex-1 shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {t.label}{n != null ? <span className="ml-1 tabular-nums opacity-60">{n}</span> : null}
                </button>
              );
            })}
          </div>

          {tab === 'collection' && (
            cardsQuery.isPending && !cardsFailed ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3" aria-hidden="true">
                {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-[230px] rounded-2xl bg-card animate-pulse" />)}
              </div>
            ) : cardsFailed ? (
              <LoadError what="la collection des cartes" error={cardsQuery.error} onRetry={cardsQuery.refetch} retrying={cardsQuery.isFetching} />
            ) : (
              <GangCollection cards={cardsQuery.data?.cards} onOpen={setOpenEntry} />
            )
          )}
          {tab === 'relance' && <GangFadingList fading={data.fading} />}
          {tab === 'saison' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <GangTopSeason rows={data.top_season} days={data.season?.days || 90} />
              <GangBadgeStats badges={data.badges} withCard={withCard} />
            </div>
          )}
        </div>
      )}

      <GangClientSheet entry={openEntry} onClose={() => setOpenEntry(null)} />
    </div>
  );
}
