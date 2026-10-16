/**
 * Admin « Cartes Gang » (/admin/gang-cards, admin seulement) : vue d'ensemble des cartes de
 * collection des clients (`GET /gang-card/admin/overview`) — chiffres, répartition par niveau,
 * habitués qui perdent leur fraîcheur (appel ou relance push), top de la saison, écussons.
 * Composants dans src/components/gang-admin/.
 */
import React from 'react';
import { RefreshCw, IdCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import LoadError from '@/components/shared/LoadError';
import { useGangAdminOverview } from '@/lib/gangCardApi';
import GangAdminTotals, { GangAdminTotalsSkeleton } from '@/components/gang-admin/GangAdminTotals';
import GangFadingList from '@/components/gang-admin/GangFadingList';
import { GangTopSeason, GangBadgeStats } from '@/components/gang-admin/GangTopSeason';

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
  const { data, isPending, isError, error, refetch, isFetching } = query;

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
            {isPending ? 'Chargement…' : updated ? `Mis à jour à ${updated}` : 'Les cartes de collection de vos clients.'}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Actualiser"
          className="text-muted-foreground shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isPending && (
        <div className="space-y-4">
          <GangAdminTotalsSkeleton />
          <div className="h-[260px] rounded-2xl border border-border bg-card animate-pulse" />
        </div>
      )}

      {!isPending && isError && !data && (
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
          <GangFadingList fading={data.fading} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <GangTopSeason rows={data.top_season} days={data.season?.days || 90} />
            <GangBadgeStats badges={data.badges} withCard={withCard} />
          </div>
        </div>
      )}
    </div>
  );
}
