/**
 * Lectures des créneaux des écrans d'abonnement : exactement celles de la réservation (mêmes clés et
 * même cache que `Booking.jsx`) : barbers, congés, lignes de chaque semaine pour tous les barbers
 * (`blocksClient` dit lesquelles occupent un créneau, le client ne reçoit que les colonnes de créneau)
 * et privatisations confirmées. Aucune règle de créneau ici : `analyzeDay` (lib/slots.js).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { fetchPublicBarbers } from '@/lib/publicBarbers';
import { rowsByDate, weekDays } from '@/lib/availability';
import { blocksClient } from '@/lib/reschedule';
import { parisDay } from '@/lib/slots';

const EMPTY_LIST = [];

/**
 * Requête en pause hors connexion : ni chargement ni erreur pour React Query, mais aucune donnée.
 * Traitée comme un échec (sinon un squelette sans fin), comme à la réservation.
 */
export const isPausedQuery = (q) => q.isPending && q.fetchStatus === 'paused';

/**
 * Jour de Paris et horloge à la minute : une heure passée pendant que la page reste ouverte n'est
 * plus proposée, l'app laissée ouverte la veille ne propose plus la date d'hier. Au retour au premier
 * plan (minuteries suspendues sur iOS), créneaux et privatisations sont relus.
 */
export function useParisClock() {
  const queryClient = useQueryClient();
  const [todayKey, setTodayKey] = useState(() => parisDay(0).key);
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const key = parisDay(0).key;
      setTodayKey(prev => (prev === key ? prev : key));
      setNowTick(Date.now());
      queryClient.invalidateQueries({ queryKey: ['appointments-day'] });
      queryClient.invalidateQueries({ queryKey: ['privateEvents'] });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  return { todayKey, nowTick };
}

/**
 * @param {string[]} weekKeys  lundis (`yyyy-MM-dd`) des semaines à lire
 * @returns {object} `employees`, `timeOffs`, lignes par jour (`blockingByDate`, `privatesByDate`) et à
 *   plat (`rows`, `privateRows`), `weekState(clé)` : 'loading' | 'failed' | 'ready', `failedQuery(clé)`,
 *   `retry(clés)`, `stamp` (empreinte des données, pour les `useMemo`)
 */
export function useSlotData(weekKeys) {
  const employeesQuery = useQuery({
    queryKey: ['employees'],
    staleTime: 5 * 60 * 1000, // catalogue : change rarement
    queryFn: fetchPublicBarbers,
  });
  const timeOffsQuery = useQuery({
    queryKey: ['timeOffs'],
    queryFn: () => api.entities.TimeOff.list('-start_date', 200),
    refetchOnMount: 'always',
  });
  const weekQueries = useQueries({
    queries: weekKeys.map(weekKey => ({
      queryKey: ['appointments-day', 'week', weekKey],
      // Limite explicite : la limite par défaut du serveur pourrait tronquer la semaine
      queryFn: () => api.entities.Appointment.filter({ date: weekDays(weekKey).map(d => d.key) }, 'start_time', 2000),
      staleTime: 30 * 1000,
    })),
  });
  // Un échec de lecture ne bloque pas le choix : le serveur revérifie et refuse (`slot_unavailable`)
  const privateQueries = useQueries({
    queries: weekKeys.map(weekKey => ({
      queryKey: ['privateEvents', 'week', weekKey],
      queryFn: () => api.entities.Event.filter({ date: weekDays(weekKey).map(d => d.key), status: 'confirmed' }, 'date', 50),
      staleTime: 60 * 1000,
    })),
  });

  const weekStamp = `${weekKeys.join(',')}#${weekQueries.map(q => q.dataUpdatedAt).join(',')}`;
  const privateStamp = `${weekKeys.join(',')}#${privateQueries.map(q => q.dataUpdatedAt).join(',')}`;
  const rows = useMemo(
    () => weekQueries.flatMap(q => (Array.isArray(q.data) ? q.data : [])).filter(blocksClient),
    [weekStamp],
  );
  const privateRows = useMemo(
    () => privateQueries.flatMap(q => (Array.isArray(q.data) ? q.data : [])),
    [privateStamp],
  );
  const blockingByDate = useMemo(() => rowsByDate(rows), [rows]);
  const privatesByDate = useMemo(() => rowsByDate(privateRows), [privateRows]);

  const baseQueries = [timeOffsQuery, employeesQuery];
  const failedOf = (queries) => queries.find(q => q && ((q.isError && q.data === undefined) || isPausedQuery(q))) || null;
  const weekQueryOf = (weekKey) => weekQueries[weekKeys.indexOf(weekKey)] || null;
  const privateQueryOf = (weekKey) => privateQueries[weekKeys.indexOf(weekKey)] || null;

  const weekState = (weekKey) => {
    const rowsQuery = weekQueryOf(weekKey);
    const privQuery = privateQueryOf(weekKey);
    if (!rowsQuery) return 'loading';
    const queries = [rowsQuery, ...baseQueries];
    if (queries.some(q => q.isPending && !isPausedQuery(q)) || (privQuery && privQuery.isPending && privQuery.fetchStatus !== 'paused')) return 'loading';
    return failedOf(queries) ? 'failed' : 'ready';
  };
  const failedQuery = (weekKey) => failedOf([weekQueryOf(weekKey), ...baseQueries]);
  const retry = (keys = weekKeys) => {
    for (const q of [...keys.flatMap(k => [weekQueryOf(k), privateQueryOf(k)]), ...baseQueries]) {
      if (q && (q.isError || q.data === undefined)) q.refetch();
    }
  };

  return {
    employeesQuery,
    employees: employeesQuery.data || EMPTY_LIST,
    timeOffs: timeOffsQuery.data || EMPTY_LIST,
    rows,
    privateRows,
    blockingByDate,
    privatesByDate,
    weekState,
    failedQuery,
    retry,
    retrying: [...weekQueries, ...baseQueries].some(q => q.isFetching),
    stamp: `${weekStamp}|${privateStamp}|${timeOffsQuery.dataUpdatedAt}|${employeesQuery.dataUpdatedAt}`,
  };
}
