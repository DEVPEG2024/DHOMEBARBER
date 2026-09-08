/**
 * Hooks React Query de la section Textile : lecture de la vue d'ensemble et actions
 * (vote, alerte, réservation, annulation) avec mise à jour optimiste du cache pour
 * les toggles, et invalidation systématique de `TEXTILE_QUERY_KEY` après chaque mutation.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  TEXTILE_QUERY_KEY,
  fetchTextileOverview,
  voteConcept,
  unvoteConcept,
  subscribeDropAlert,
  unsubscribeDropAlert,
  reserveConcept,
  cancelReservation,
} from '@/lib/textileApi';
import { isPushSupported, isSubscribed, subscribeToPush } from '@/lib/pushNotifications';
import { hapticFeedback } from '@/lib/capacitor';
import { errorMessage } from './textileUtils';

export function useTextileOverview(options = {}) {
  return useQuery({
    queryKey: TEXTILE_QUERY_KEY,
    queryFn: fetchTextileOverview,
    staleTime: 60_000,
    ...options,
  });
}

/**
 * Meilleur effort : l'alerte d'un drop part en push, on s'assure donc que l'appareil est abonné.
 * Silencieux si non supporté / refusé (l'abonnement à l'alerte reste enregistré côté serveur).
 * Résout `null` si la vérification n'aboutit pas dans les temps : `navigator.serviceWorker.ready`
 * ne se résout jamais sans service worker enregistré, il ne faut pas rester suspendu dessus.
 */
async function ensurePushSubscription(timeoutMs = 8000) {
  const check = (async () => {
    try {
      if (!isPushSupported()) return false;
      if (await isSubscribed()) return true;
      await subscribeToPush();
      return true;
    } catch {
      return false;
    }
  })();
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([check, timeout]);
}

export function useTextileActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: TEXTILE_QUERY_KEY });

  const patchCache = (fn) => {
    const prev = queryClient.getQueryData(TEXTILE_QUERY_KEY);
    if (prev) queryClient.setQueryData(TEXTILE_QUERY_KEY, fn(prev));
    return prev;
  };
  const rollback = (ctx) => {
    if (ctx?.prev) queryClient.setQueryData(TEXTILE_QUERY_KEY, ctx.prev);
  };

  // ─── Vote « Je le veux » (toggle) ou mise à jour de la taille (sondage) ───
  const vote = useMutation({
    mutationFn: ({ conceptId, size, remove }) => (remove ? unvoteConcept(conceptId) : voteConcept(conceptId, size ?? null)),
    onMutate: async ({ conceptId, size, remove }) => {
      await queryClient.cancelQueries({ queryKey: TEXTILE_QUERY_KEY });
      const prev = patchCache(old => {
        const votes = { ...(old.me?.votes || {}) };
        const had = Boolean(votes[conceptId]);
        if (remove) delete votes[conceptId];
        else votes[conceptId] = { size: size ?? null };
        const delta = remove ? (had ? -1 : 0) : (had ? 0 : 1);
        return {
          ...old,
          me: { ...(old.me || {}), votes },
          concepts: (old.concepts || []).map(c => (
            String(c.id) === String(conceptId)
              ? { ...c, votes_count: Math.max(0, (Number(c.votes_count) || 0) + delta) }
              : c
          )),
        };
      });
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      rollback(ctx);
      toast.error(errorMessage(err, 'Vote impossible pour le moment'));
    },
    onSettled: invalidate,
  });

  // ─── Alerte d'ouverture d'un drop (toggle) ───
  const alertMutation = useMutation({
    mutationFn: ({ dropId, remove }) => (remove ? unsubscribeDropAlert(dropId) : subscribeDropAlert(dropId)),
    onMutate: async ({ dropId, remove }) => {
      await queryClient.cancelQueries({ queryKey: TEXTILE_QUERY_KEY });
      const prev = patchCache(old => {
        const alerts = new Set((old.me?.alerts || []).map(String));
        const had = alerts.has(String(dropId));
        if (remove) alerts.delete(String(dropId));
        else alerts.add(String(dropId));
        const delta = remove ? (had ? -1 : 0) : (had ? 0 : 1);
        return {
          ...old,
          me: { ...(old.me || {}), alerts: [...alerts] },
          drops: (old.drops || []).map(d => (
            String(d.id) === String(dropId)
              ? { ...d, alerts_count: Math.max(0, (Number(d.alerts_count) || 0) + delta) }
              : d
          )),
        };
      });
      return { prev };
    },
    onSuccess: (_res, { remove }) => {
      if (remove) {
        toast.success('Alerte désactivée');
        return;
      }
      toast.success('Alerte activée : tu seras prévenu à l\'ouverture');
      // Sans attendre : la mutation ne doit pas rester « en cours » le temps de la permission push
      ensurePushSubscription().then(ok => {
        if (ok === false) {
          toast.info('Notifications désactivées', { description: 'Autorise-les dans Paramètres pour recevoir l\'alerte sur ton téléphone.' });
        }
      });
    },
    onError: (err, _vars, ctx) => {
      rollback(ctx);
      toast.error(errorMessage(err, 'Impossible de modifier l\'alerte'));
    },
    onSettled: invalidate,
  });

  // ─── Réservation d'une pièce (drop ouvert) ───
  const reserve = useMutation({
    mutationFn: ({ conceptId, size, quantity }) => reserveConcept(conceptId, { size, quantity }),
    onSuccess: () => {
      hapticFeedback();
      invalidate();
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Réservation impossible'));
      // Stock pris entre-temps (409) : on recharge pour afficher le vrai restant
      if (err?.status === 409) invalidate();
    },
  });

  // ─── Annulation d'une réservation (statut reserved) ───
  const cancel = useMutation({
    mutationFn: (reservationId) => cancelReservation(reservationId),
    onSuccess: () => {
      hapticFeedback();
      toast.success('Réservation annulée');
      invalidate();
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Annulation impossible'));
      invalidate();
    },
  });

  return {
    /** Toggle du vote ; `size` optionnelle (sondage de taille). */
    toggleVote: (conceptId, { voted, size = null }) => {
      hapticFeedback();
      return vote.mutate({ conceptId, size, remove: voted });
    },
    /** Met à jour la taille du vote existant (ou vote avec cette taille). */
    setVoteSize: (conceptId, size) => vote.mutate({ conceptId, size, remove: false }),
    toggleAlert: (dropId, { subscribed }) => {
      hapticFeedback();
      return alertMutation.mutate({ dropId, remove: subscribed });
    },
    reserve: (conceptId, { size, quantity }) => reserve.mutateAsync({ conceptId, size, quantity }),
    cancel: (reservationId) => cancel.mutateAsync(reservationId),
    pending: {
      vote: vote.isPending,
      alert: alertMutation.isPending,
      reserve: reserve.isPending,
      cancel: cancel.isPending,
      cancelId: cancel.isPending ? cancel.variables : null,
    },
  };
}
