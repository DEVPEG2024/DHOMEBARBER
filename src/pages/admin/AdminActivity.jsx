/**
 * Admin « Activité clients » (/admin/activity, admin seulement) : chronologie de toutes les actions
 * menées par les clients (RDV, annulations, commandes, avis, cartes cadeau, privatisations,
 * textile, événements du salon, retours, inscriptions, signalements), agrégée côté client par
 * `src/lib/adminActivity.js` depuis les entités que l'admin lit déjà. Compteurs du jour, filtres
 * par type, « Non lus », recherche par client ; tout est marqué comme lu en quittant la page.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCheck, RefreshCw, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { useAdminActivity, useUnreadActivity, markActivitySeen } from '@/lib/adminActivity';
import ActivityStats from '@/components/admin-activity/ActivityStats';
import ActivityFilters from '@/components/admin-activity/ActivityFilters';
import ActivityRow, { ActivityRowSkeleton } from '@/components/admin-activity/ActivityRow';
import { groupByDay, normalizeSearch } from '@/components/admin-activity/activityUi';

export default function AdminActivity() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const activityQ = useAdminActivity();
  const { unread, count: unreadCount, markAllSeen } = useUnreadActivity();

  const [typeFilter, setTypeFilter] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState('');

  // Tout est marqué comme lu en quittant la page : les points « non lu » restent visibles pendant la consultation.
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;
  useEffect(() => () => {
    if (userIdRef.current != null) markActivitySeen(userIdRef.current);
  }, []);

  const events = useMemo(() => (Array.isArray(activityQ.data?.events) ? activityQ.data.events : []), [activityQ.data]);
  const failedSources = Array.isArray(activityQ.data?.failedSources) ? activityQ.data.failedSources : [];
  const unreadIds = useMemo(() => new Set((unread || []).map(e => String(e.id))), [unread]);

  const searched = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return events;
    return events.filter(e => normalizeSearch(`${e.clientName || ''} ${e.clientEmail || ''}`).includes(q));
  }, [events, search]);

  const typeCounts = useMemo(() => {
    const counts = {};
    for (const e of searched) {
      if (unreadOnly && !unreadIds.has(String(e.id))) continue;
      counts[e.type] = (counts[e.type] || 0) + 1;
    }
    return counts;
  }, [searched, unreadOnly, unreadIds]);

  const filtered = useMemo(() => searched.filter(e => {
    if (unreadOnly && !unreadIds.has(String(e.id))) return false;
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    return true;
  }), [searched, unreadOnly, unreadIds, typeFilter]);

  // « Tout » remet aussi « Non lus » à zéro : son compte porte donc sur toutes les actions.
  const totalForChips = searched.length;
  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  const openEvent = (event) => {
    if (event?.link) navigate(event.link);
  };

  if (user && !isAdmin) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Cette page est réservée à l'administrateur.
      </div>
    );
  }

  const loading = activityQ.isLoading;
  const hasFilters = typeFilter !== 'all' || unreadOnly || search.trim();

  return (
    <div className="min-w-0">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Clients</p>
          <h1 className="font-display text-2xl font-bold">Activité clients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? 'Chargement…' : unreadCount === 0 ? 'Aucune action non lue.' : `${unreadCount} action${unreadCount > 1 ? 's' : ''} non lue${unreadCount > 1 ? 's' : ''}.`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => activityQ.refetch()}
            disabled={activityQ.isFetching}
            aria-label="Actualiser"
            className="text-muted-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${activityQ.isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" variant="outline" onClick={markAllSeen} disabled={unreadCount === 0} className="whitespace-nowrap">
            <CheckCheck className="w-4 h-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Tout marquer comme lu</span>
            <span className="sr-only sm:hidden">Tout marquer comme lu</span>
          </Button>
        </div>
      </div>

      {failedSources.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          <p className="min-w-0 break-words">Certaines sources n'ont pas pu être chargées : {failedSources.join(', ')}.</p>
        </div>
      )}

      {activityQ.isError && !activityQ.data && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 flex gap-2 items-center justify-between">
          <span>Impossible de charger l'activité.</span>
          <Button size="sm" variant="ghost" onClick={() => activityQ.refetch()}>Réessayer</Button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-5">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-[76px] rounded-2xl border border-border bg-card animate-pulse" />)}
        </div>
      ) : (
        <ActivityStats events={events} />
      )}

      <ActivityFilters
        typeFilter={typeFilter}
        onTypeChange={setTypeFilter}
        typeCounts={typeCounts}
        total={totalForChips}
        unreadOnly={unreadOnly}
        onUnreadOnlyChange={setUnreadOnly}
        unreadCount={unreadCount}
        search={search}
        onSearchChange={setSearch}
      />

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => <ActivityRowSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <Inbox className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-semibold text-foreground">
            {hasFilters ? 'Aucune action ne correspond aux filtres.' : 'Aucune action client sur les 14 derniers jours.'}
          </p>
          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => { setTypeFilter('all'); setUnreadOnly(false); setSearch(''); }}
            >
              Effacer les filtres
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(group => (
            <section key={group.key || 'unknown'}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {group.label} <span className="font-normal normal-case tracking-normal">· {group.events.length}</span>
              </h2>
              <div className="space-y-2">
                {group.events.map(ev => (
                  <ActivityRow key={ev.id} event={ev} unread={unreadIds.has(String(ev.id))} onOpen={openEvent} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
