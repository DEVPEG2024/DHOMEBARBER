/**
 * Hooks React Query des événements du salon côté client : lecture de `GET /salon-events/mine`
 * (jamais de nouvelle tentative, erreur silencieuse : la page des privatisations doit rester
 * utilisable tant que le backend n'est pas déployé) et réponse à une invitation avec mise à jour
 * optimiste du cache, retour arrière et message du serveur en toast en cas d'erreur.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SALON_EVENTS_QUERY_KEY, fetchMySalonEvents, rsvpSalonEvent } from '@/lib/salonEventsApi';
import { errorMessage } from './salonEventUtils';

export function useMySalonEvents(options = {}) {
  return useQuery({
    queryKey: SALON_EVENTS_QUERY_KEY,
    queryFn: fetchMySalonEvents,
    staleTime: 60_000,
    retry: false,
    ...options,
  });
}

/** Applique `fn` à l'événement `eventId` de la réponse en cache (sans muter l'original). */
function patchEvent(data, eventId, fn) {
  if (!data || !Array.isArray(data.events)) return data;
  return {
    ...data,
    events: data.events.map(ev => (String(ev?.id) === String(eventId) ? fn(ev) : ev)),
  };
}

/** Projection optimiste d'une réponse : mon invitation, le compteur d'acceptations et le restant. */
function applyRsvp(ev, status, guests) {
  const prevMine = ev.my_invite?.status === 'accepted' ? Number(ev.my_invite.guests) || 0 : 0;
  const nextMine = status === 'accepted' ? guests : 0;
  const acceptedCount = Math.max(0, (Number(ev.accepted_count) || 0) - prevMine + nextMine);
  const capacity = Number(ev.capacity) || 0;
  return {
    ...ev,
    accepted_count: acceptedCount,
    spots_left: capacity > 0 ? Math.max(0, capacity - acceptedCount) : null,
    // Sur un événement ouvert à tous, la première réponse crée l'invitation
    invited_count: ev.my_invite ? ev.invited_count : (Number(ev.invited_count) || 0) + 1,
    my_invite: { ...(ev.my_invite || {}), status, guests, responded_at: new Date().toISOString() },
  };
}

export function useSalonEventRsvp() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: SALON_EVENTS_QUERY_KEY });

  const mutation = useMutation({
    mutationFn: ({ eventId, status, guests }) => rsvpSalonEvent(eventId, { status, guests }),
    onMutate: async ({ eventId, status, guests }) => {
      await queryClient.cancelQueries({ queryKey: SALON_EVENTS_QUERY_KEY });
      const prev = queryClient.getQueryData(SALON_EVENTS_QUERY_KEY);
      if (prev) queryClient.setQueryData(SALON_EVENTS_QUERY_KEY, patchEvent(prev, eventId, ev => applyRsvp(ev, status, guests)));
      return { prev };
    },
    onSuccess: (res, { eventId }) => {
      // Les compteurs du serveur font foi (d'autres invités ont pu répondre entre-temps)
      const current = queryClient.getQueryData(SALON_EVENTS_QUERY_KEY);
      if (!current || !res) return;
      queryClient.setQueryData(SALON_EVENTS_QUERY_KEY, patchEvent(current, eventId, ev => ({
        ...ev,
        ...(res.accepted_count != null ? { accepted_count: res.accepted_count } : {}),
        ...(res.spots_left !== undefined ? { spots_left: res.spots_left } : {}),
        ...(res.invite
          ? { my_invite: { ...(ev.my_invite || {}), status: res.invite.status, guests: res.invite.guests, responded_at: res.invite.responded_at } }
          : {}),
      })));
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(SALON_EVENTS_QUERY_KEY, ctx.prev);
      toast.error(errorMessage(err, 'Réponse impossible pour le moment'));
    },
    // Succès comme échec (409 « Complet » compris) : on recharge pour afficher le vrai restant
    onSettled: invalidate,
  });

  return {
    /** Répond à une invitation ; rejette avec l'erreur (déjà affichée en toast). */
    rsvp: (eventId, { status, guests = 1 }) => mutation.mutateAsync({ eventId, status, guests }),
    isPending: mutation.isPending,
    pendingEventId: mutation.isPending ? mutation.variables?.eventId ?? null : null,
  };
}
