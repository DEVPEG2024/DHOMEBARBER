/**
 * Données de la page Privatiser le salon : demandes du client, privatisations confirmées (créneaux
 * pris), barbers publics, téléphone du salon, envoi d'une demande et réponse à un devis.
 * Clés React Query reprises de l'ancienne page (`['myEvents', email]`, `['confirmedEvents']`) et
 * partagées avec le reste de l'app (`['employees']`, `['salonSettings']`).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { fetchPublicBarbers } from '@/lib/publicBarbers';
import { track } from '@/lib/analytics';
import { buildBlockedIndex, parisClock, phoneHref, SALON_PHONE_FALLBACK, serverMessage } from './privatisationUtils';

const CATALOG_STALE = 5 * 60 * 1000;

/** Demandes de privatisation du compte connecté (les 50 dernières). */
export function useMyEvents() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['myEvents', user?.email],
    queryFn: () => api.entities.Event.filter({ client_email: user?.email }, '-created_at', 50),
    enabled: !!user?.email,
  });
}

/**
 * Privatisations confirmées (le serveur ne rend à un client que id, date, time_slot, status) et
 * leur index de créneaux pris (`buildBlockedIndex`). En échec, l'index est vide : le serveur
 * refuse de toute façon une demande sur un créneau déjà privatisé (409, backend v142), la
 * demande revient alors à la date.
 */
export function useConfirmedEvents() {
  const query = useQuery({
    queryKey: ['confirmedEvents'],
    queryFn: () => api.entities.Event.filter({ status: 'confirmed' }, '-date', 200),
    staleTime: 60 * 1000,
  });
  const index = useMemo(() => buildBlockedIndex(query.data), [query.data]);
  return { ...query, index };
}

/** Barbers montrés aux clients (fiches de test retirées), même requête que l'accueil. */
export function usePublicBarbers() {
  const query = useQuery({
    queryKey: ['employees'],
    queryFn: fetchPublicBarbers,
    staleTime: CATALOG_STALE,
  });
  const barbers = useMemo(() => (query.data || []).filter(e => e && !e.is_hidden), [query.data]);
  return { ...query, barbers };
}

/** Téléphone du salon (Paramètres du salon, sinon 06 66 08 36 05) : `{ display, href }`. */
export function useSalonPhone() {
  const { data } = useQuery({
    queryKey: ['salonSettings'],
    queryFn: () => api.entities.SalonSettings.list(),
    staleTime: CATALOG_STALE,
  });
  const display = String((Array.isArray(data) ? data[0]?.phone : null) || '').trim() || SALON_PHONE_FALLBACK;
  return { display, href: phoneHref(display) };
}

/** Horloge de Paris rafraîchie chaque minute et au retour au premier plan. */
export function useParisClock(intervalMs = 60 * 1000) {
  const [clock, setClock] = useState(() => parisClock());
  useEffect(() => {
    const tick = () => setClock(prev => {
      const next = parisClock();
      return next.key === prev.key && next.minutes === prev.minutes ? prev : next;
    });
    const id = setInterval(tick, intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [intervalMs]);
  return clock;
}

/**
 * Envoi d'une demande. Pas de toast ici : la demande (`RequestSheet`) gère l'écran de succès et
 * les erreurs (`mutateAsync` + `serverMessage` / `isDateProblem`). Le serveur rend la même
 * demande sans la recréer si elle arrive deux fois (réponse perdue, double tap).
 */
export function useCreateRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.entities.Event.create(payload),
    onSuccess: (_data, payload) => {
      track('privatisation_request', { type: payload?.event_type || '' });
      queryClient.invalidateQueries({ queryKey: ['myEvents'] });
    },
    onError: (err) => {
      // Un créneau a pu être confirmé entre-temps : on recharge les créneaux pris
      const status = err?.status ?? err?.response?.status;
      if (status === 409 || status === 400) queryClient.invalidateQueries({ queryKey: ['confirmedEvents'] });
    },
  });
}

/** Clé des réponses aux devis (`useIsMutating({ mutationKey: ANSWER_QUOTE_KEY })`). */
export const ANSWER_QUOTE_KEY = ['answerQuote'];

/**
 * Réponse à un devis (`accepted` | `declined`), un seul envoi à la fois. Toasts compris ; en échec
 * le devis est relu (il a pu être modifié ou retiré par le salon entre-temps). Après un succès, la
 * mutation reste « en cours » jusqu'à la relecture des demandes : les boutons du devis ne
 * redeviennent jamais actifs sur une réponse déjà envoyée (un second tap recevait un 400).
 */
export function useAnswerQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ANSWER_QUOTE_KEY,
    mutationFn: ({ id, status }) => api.entities.Event.update(id, { status }),
    onSuccess: (data, { id, status }) => {
      // Cache mis à jour tout de suite : si la relecture échoue (réseau coupé), le devis ne
      // redevient jamais « à accepter » (un second tap recevait un 400 du serveur)
      const row = data && typeof data === 'object' && !Array.isArray(data) && String(data.id) === String(id) ? data : {};
      queryClient.setQueriesData({ queryKey: ['myEvents'] }, (old) => (Array.isArray(old)
        ? old.map(ev => (String(ev?.id) === String(id)
          ? { ...ev, ...row, status, answered_at: row.answered_at || ev.answered_at || new Date().toISOString() }
          : ev))
        : old));
      const keys = [['myEvents']];
      if (status === 'accepted') {
        keys.push(['confirmedEvents']);
        toast.success('Devis accepté ! Passez au salon pour régler, le salon confirmera ensuite votre date.');
      } else {
        toast.success('Devis refusé : le salon est prévenu.');
      }
      return Promise.all(keys.map(queryKey => queryClient.invalidateQueries({ queryKey })));
    },
    onError: (err) => {
      toast.error(serverMessage(err, "La réponse au devis n'a pas pu être envoyée, réessayez."));
      const status = err?.status ?? err?.response?.status;
      if (status) queryClient.invalidateQueries({ queryKey: ['myEvents'] });
      // 409 : le créneau a été privatisé par un autre groupe entre-temps (backend v142) ; la carte
      // du devis remplace alors « Accepter » par l'invitation à appeler le salon
      if (status === 409) queryClient.invalidateQueries({ queryKey: ['confirmedEvents'] });
    },
  });
}
