/**
 * Admin « Événements du salon » (/admin/salon-events) : événements organisés PAR le salon, sur
 * invitation ciblée ou ouverts à tous les clients. Distinct des privatisations demandées par les
 * clients (/admin/events, entité Event), inchangées.
 *
 * Données : la liste d'entité `SalonEvent` (clé EVENTS_KEY, brouillons compris — le serveur refuse
 * les non-staff) et toutes les invitations `SalonEventInvite` (clé INVITES_KEY), agrégées par
 * événement pour les jauges des cartes sans requête par événement. Le panneau Invités charge la
 * liste détaillée d'un événement (route /guests). Chaque mutation passe par `invalidateSalonEvents`.
 *
 * Droits : création / modification / publication / annulation / suppression = admin ; un barber voit
 * la liste et le panneau Invités (il peut inviter et relancer, pas retirer une invitation).
 */
import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CalendarClock, AlertTriangle, PartyPopper, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { eventPhase } from '@/lib/salonEventsApi';
import {
  EVENTS_KEY, INVITES_KEY, invalidateSalonEvents, statsByEvent, EMPTY_STATS, Spinner, EmptyState,
} from '@/components/salon-events-admin/shared';
import EventCard from '@/components/salon-events-admin/EventCard';
import EventDialog from '@/components/salon-events-admin/EventDialog';
import PublishDialog from '@/components/salon-events-admin/PublishDialog';
import GuestsDialog from '@/components/salon-events-admin/GuestsDialog';

const FILTERS = [
  { key: 'upcoming', label: 'À venir', empty: 'Aucun événement à venir', hint: 'Créez un événement, publiez-le, puis invitez vos clients.' },
  { key: 'past', label: 'Passés', empty: 'Aucun événement passé', hint: 'Les événements terminés ou dont la date est passée apparaîtront ici.' },
  { key: 'draft', label: 'Brouillons', empty: 'Aucun brouillon', hint: 'Un brouillon reste invisible des clients jusqu\'à sa publication.' },
  { key: 'cancelled', label: 'Annulés', empty: 'Aucun événement annulé', hint: undefined },
];

/** Onglet d'un événement : brouillon, annulé, passé (terminé ou date dépassée), sinon à venir. */
function bucketOf(event) {
  const phase = eventPhase(event);
  if (phase === 'draft' || phase === 'cancelled' || phase === 'past') return phase;
  return 'upcoming';
}

const startMs = (e) => {
  const t = new Date(e.starts_at).getTime();
  return Number.isNaN(t) ? Infinity : t;
};
/** À venir et brouillons : le plus proche d'abord ; passés et annulés : le plus récent d'abord. */
const sorterFor = (bucket) => (bucket === 'past' || bucket === 'cancelled'
  ? (a, b) => startMs(b) - startMs(a)
  : (a, b) => startMs(a) - startMs(b));

export default function AdminSalonEvents() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('filter');
  const filter = FILTERS.some((f) => f.key === requested) ? requested : 'upcoming';
  const setFilter = (key) => setSearchParams(key === 'upcoming' ? {} : { filter: key }, { replace: true });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [publishTarget, setPublishTarget] = useState(null);
  const [guestsTarget, setGuestsTarget] = useState(null); // { id, initialTab }

  const eventsQ = useQuery({ queryKey: EVENTS_KEY, queryFn: () => api.entities.SalonEvent.list('starts_at', 500) });
  const invitesQ = useQuery({ queryKey: INVITES_KEY, queryFn: () => api.entities.SalonEventInvite.list('-invited_at', 2000) });

  const events = useMemo(() => (Array.isArray(eventsQ.data) ? eventsQ.data : []), [eventsQ.data]);
  const stats = useMemo(() => statsByEvent(invitesQ.data), [invitesQ.data]);

  const buckets = useMemo(() => {
    const out = { upcoming: [], past: [], draft: [], cancelled: [] };
    events.forEach((e) => out[bucketOf(e)].push(e));
    Object.keys(out).forEach((k) => out[k].sort(sorterFor(k)));
    return out;
  }, [events]);
  const visible = buckets[filter];
  const current = FILTERS.find((f) => f.key === filter);

  // Le panneau Invités suit la ligne fraîche de la liste (statut mis à jour après publication…)
  const guestsEvent = guestsTarget ? events.find((e) => String(e.id) === String(guestsTarget.id)) || guestsTarget.snapshot : null;

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.entities.SalonEvent.update(id, { status }),
    onSuccess: (_data, { id, status, openInvites, snapshot }) => {
      invalidateSalonEvents(queryClient, id);
      setPublishTarget(null);
      if (status === 'published') {
        toast.success(openInvites ? 'Événement publié : envoyez maintenant les invitations' : 'Événement publié (personne n\'est prévenu tant que vous n\'invitez pas)');
        if (openInvites) setGuestsTarget({ id, initialTab: 'invite', snapshot: { ...snapshot, status: 'published' } });
      } else if (status === 'cancelled') {
        toast.success('Événement annulé : les invités qui n\'avaient pas refusé reçoivent un push');
      } else if (status === 'done') {
        toast.success('Événement terminé');
      } else {
        toast.success('Statut mis à jour');
      }
    },
    onError: (err) => toast.error(err?.message || 'Erreur lors du changement de statut'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.SalonEvent.delete(id),
    onSuccess: (_data, id) => {
      invalidateSalonEvents(queryClient, id);
      if (guestsTarget && String(guestsTarget.id) === String(id)) setGuestsTarget(null);
      toast.success('Événement supprimé');
    },
    onError: (err) => toast.error(err?.message || 'Erreur lors de la suppression'),
  });

  const openNew = () => { setEditingEvent(null); setDialogOpen(true); };
  const openEdit = (event) => { setEditingEvent(event); setDialogOpen(true); };
  const openGuests = (event, initialTab) => setGuestsTarget({ id: event.id, initialTab, snapshot: event });

  const busy = statusMutation.isPending || deleteMutation.isPending;
  const loading = events.length === 0 && eventsQ.isLoading;

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3">
        <div className="shrink-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Salon</p>
          <h1 className="font-display text-2xl font-bold">Événements du salon</h1>
        </div>
        {isAdmin ? (
          <Button onClick={openNew} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shrink-0">
            <Plus className="w-4 h-4 mr-1.5" /> Nouvel événement
          </Button>
        ) : (
          <p className="text-[11px] text-muted-foreground text-right max-w-[220px]">
            Lecture seule ; vous pouvez consulter les invités, inviter et relancer.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Soirées, ateliers, lancements organisés par le salon : invitation ciblée ou ouverts à tous les clients.
        Les privatisations demandées par les clients restent dans{' '}
        <Link to="/admin/events" className="text-primary hover:underline inline-flex items-center gap-0.5">Événements <ArrowUpRight className="w-3 h-3" /></Link>.
      </p>

      {/* Filtres */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = buckets[f.key].length;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all ${
                active ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
              {count > 0 && (
                <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                  active ? 'bg-primary-foreground/20' : f.key === 'draft' ? 'bg-amber-500/20 text-amber-400' : 'bg-secondary'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {eventsQ.error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Impossible de charger les événements : {eventsQ.error.message}</span>
        </div>
      )}
      {!eventsQ.error && invitesQ.error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Les jauges d'invités ne sont pas disponibles : {invitesQ.error.message}</span>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState icon={filter === 'upcoming' ? PartyPopper : CalendarClock} title={current.empty} hint={isAdmin ? current.hint : undefined} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((event, i) => (
            <EventCard
              key={event.id}
              event={event}
              index={i}
              stats={stats.get(String(event.id)) || EMPTY_STATS}
              isAdmin={isAdmin}
              busy={busy}
              onEdit={openEdit}
              onPublish={setPublishTarget}
              onGuests={(e) => openGuests(e)}
              onCancel={(e) => statusMutation.mutate({ id: e.id, status: 'cancelled' })}
              onDone={(e) => statusMutation.mutate({ id: e.id, status: 'done' })}
              onDelete={(e) => deleteMutation.mutate(e.id)}
            />
          ))}
        </div>
      )}

      <GuestsDialog
        event={guestsEvent}
        initialTab={guestsTarget?.initialTab}
        isAdmin={isAdmin}
        onClose={() => setGuestsTarget(null)}
      />

      {isAdmin && (
        <>
          <EventDialog open={dialogOpen} onOpenChange={setDialogOpen} event={editingEvent} />
          <PublishDialog
            event={publishTarget}
            onClose={() => setPublishTarget(null)}
            pending={statusMutation.isPending}
            onConfirm={(openInvites) => publishTarget && statusMutation.mutate({
              id: publishTarget.id, status: 'published', openInvites, snapshot: publishTarget,
            })}
          />
        </>
      )}
    </div>
  );
}
