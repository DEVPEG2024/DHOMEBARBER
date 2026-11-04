/**
 * Tableau de bord : toutes les lectures, l'horloge de Paris et la mise à jour automatique.
 *
 * - Chaque lecture est relue toutes les minutes quand l'onglet est visible, et au retour sur
 *   l'onglet (avant : chiffres figés jusqu'au changement de page, jour d'hier après minuit).
 * - Toutes les lectures partent ensemble au montage (avant : les ventes attendaient les RDV).
 * - Rendez-vous lus par mois entier (mois précédent, mois en cours) et les jours de la semaine à
 *   venir qui passent sur le mois suivant : une requête par paquet, sous le plafond de 2000 lignes.
 * - Clés sous `adminAppointments` : couvertes par `invalidateAppointmentQueries` (agenda, encaissement).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_SERVER_URL, resolvedAppId, apiRequest, apiUrl } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { fetchAppointmentsForDates } from '@/components/agenda/agendaUtils';
import { fetchPublicBarbers } from '@/lib/publicBarbers';
import { TEXTILE_QUERY_KEY, fetchTextileOverview } from '@/lib/textileApi';
import { queryFailed } from '@/components/shared/LoadError';
import {
  APPOINTMENTS_LIMIT, parisClock, prevMonthKey, monthDays, addDaysKey, computeDashboard, buildUpcoming, computeFill,
} from '@/lib/dashboardStats';
import { computeChannels, CHANNEL_LIMITS } from '@/lib/salesChannels';
import { PAST_MONTHS_SHOWN, computeMonthReport, firstMonthOf, pastMonthKeys } from '@/lib/pastMonths';

export const DASHBOARD_REFRESH_MS = 60 * 1000;
// Relu chaque minute (onglet visible seulement : React Query ne relit pas un onglet caché), au retour
// sur l'onglet, et gardé 30 min en cache (au retour sur la page : les derniers chiffres, puis relus).
// Ce qui bouge peu (mois précédent, CA à venir, congés) : toutes les 10 min ; ventes : 2 min
const LIVE = { refetchInterval: DASHBOARD_REFRESH_MS, refetchOnWindowFocus: true, gcTime: 30 * 60 * 1000 };
const SLOW = { ...LIVE, refetchInterval: 10 * DASHBOARD_REFRESH_MS };
const SALES = { ...LIVE, refetchInterval: 2 * DASHBOARD_REFRESH_MS };

// Un mois de RDV en deux lectures (jours 1-16, puis 17-31) : depuis les Last Minute automatiques, un
// mois chargé approche le plafond de 2000 lignes, et une lecture coupée perdrait les fins de journée
const DAYS_PER_READ = 16;
async function fetchDays(dates) {
  if (!dates.length) return { rows: [], truncated: false };
  const chunks = [];
  for (let i = 0; i < dates.length; i += DAYS_PER_READ) chunks.push(dates.slice(i, i + DAYS_PER_READ));
  const pages = await Promise.all(chunks.map((c) => fetchAppointmentsForDates(c)));
  return { rows: pages.flat(), truncated: pages.some((p) => p.length >= APPOINTMENTS_LIMIT) };
}

// ─── Droits ───────────────────────────────────────────────────────────

/**
 * Ce que ce compte peut ouvrir depuis le tableau de bord (mêmes règles que le menu d'AdminLayout).
 * Sans compte chargé : comme l'admin (la page est déjà gardée par la route).
 */
export function dashboardAccess(user) {
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  const isAdmin = !user || user.role === 'admin';
  const can = (perm) => isAdmin || perms.includes(perm);
  return {
    isAdmin,
    canAgenda: can('agenda'),
    canOrders: can('orders'),
    canTextile: can('products'),
    canGift: isAdmin,
    canEvents: isAdmin,
    canLeave: isAdmin,
  };
}

// ─── Drapeaux du serveur ──────────────────────────────────────────────

export const DEFAULT_DASHBOARD_FEATURES = { paidAt: false, revenueGoal: false, analyticsLive: false };

/**
 * `features.paidAt` (jour d'encaissement), `revenueGoal` (objectif du mois), `analyticsLive`
 * (compteur « en ce moment »). Ne rejette jamais : en cas d'échec, tout éteint.
 */
export async function fetchDashboardFeatures() {
  try {
    const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
    if (!res.ok) return { ...DEFAULT_DASHBOARD_FEATURES };
    const data = await res.json().catch(() => null);
    const f = data?.features || {};
    return { paidAt: f.paidAt === true, revenueGoal: f.revenueGoal === true, analyticsLive: f.analyticsLive === true };
  } catch {
    return { ...DEFAULT_DASHBOARD_FEATURES };
  }
}

// ─── Lectures ─────────────────────────────────────────────────────────

// « CA à venir, tous les mois » (31 oct. 2026) : RDV confirmés d'aujourd'hui au dernier RDV confirmé
// de la base, 24 mois au plus. Le serveur ne filtre que par égalité ou par liste : paquets de 62 jours.
export const UPCOMING_MAX_MONTHS = 24;
export const DATES_PER_REQUEST = 62;

/** `{ rows, incomplete, beyond }` : `beyond` = dernier jour lu quand des RDV confirmés vont plus loin. */
export async function fetchUpcomingConfirmed(fromDay) {
  // Tri décroissant : PostgreSQL met les dates vides en tête. Le premier RDV daté des 5 premiers ;
  // aucun daté alors que des RDV confirmés existent : la borne de 24 mois (jamais « aucun RDV à venir »)
  const head = await api.entities.Appointment.filter({ status: 'confirmed' }, '-date', 5);
  if (!head.length) return { rows: [], incomplete: false, beyond: null };
  const dated = head.find((a) => /^\d{4}-\d{2}-\d{2}/.test(String(a.date || '')));
  const cap = addMonthsKey(fromDay, UPCOMING_MAX_MONTHS);
  const lastDay = dated ? String(dated.date).slice(0, 10) : cap;
  if (lastDay < fromDay) return { rows: [], incomplete: false, beyond: null };
  const end = lastDay < cap ? lastDay : cap;
  const dates = [];
  for (let d = fromDay; d <= end; d = addDaysKey(d, 1)) dates.push(d);
  const chunks = [];
  for (let i = 0; i < dates.length; i += DATES_PER_REQUEST) chunks.push(dates.slice(i, i + DATES_PER_REQUEST));
  const pages = await Promise.all(chunks.map((c) =>
    api.entities.Appointment.filter({ date: c, status: 'confirmed' }, 'start_time', APPOINTMENTS_LIMIT)));
  return {
    rows: pages.flat(),
    incomplete: pages.some((p) => p.length >= APPOINTMENTS_LIMIT),
    beyond: lastDay > cap ? cap : null,
  };
}

function addMonthsKey(dayKey, months) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}

/** Instant présent, renouvelé chaque minute et au retour sur l'onglet (jour de Paris à minuit, « à clôturer »…). */
export function useNow(stepMs = 30 * 1000) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const id = setInterval(tick, stepMs);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [stepMs]);
  return nowMs;
}

const SETTINGS_KEY = ['salonSettings'];

/**
 * Toutes les données du tableau de bord, calculées.
 * @returns {{
 *   access: ReturnType<typeof dashboardAccess>, features: typeof DEFAULT_DASHBOARD_FEATURES, nowMs: number,
 *   stats: ReturnType<typeof computeDashboard>, upcoming: ReturnType<typeof buildUpcoming> & { incomplete: boolean, beyond: string|null },
 *   fill: ReturnType<typeof computeFill>, sales: ReturnType<typeof computeChannels>,
 *   settings: object|null, liveCount: number|null, pendingLeaves: number,
 *   state: object, rows: Array, loadedMonths: string[], refreshAll: () => Promise<void>,
 * }}
 */
export function useDashboardData() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const access = dashboardAccess(user);
  const nowMs = useNow();
  const minute = Math.floor(nowMs / 60000);
  const clock = parisClock(nowMs);
  const monthKey = clock.monthKey;
  const prevKey = prevMonthKey(monthKey);
  // Semaine à venir (remplissage) : les jours qui passent sur le mois suivant, lus à part
  const nextDates = useMemo(() => {
    const out = [];
    for (let i = 1; i <= 6; i++) {
      const d = addDaysKey(clock.today, i);
      if (!d.startsWith(monthKey)) out.push(d);
    }
    return out;
  }, [clock.today, monthKey]);

  const featuresQ = useQuery({ queryKey: ['dashboardFeatures'], queryFn: fetchDashboardFeatures, staleTime: 5 * 60 * 1000 });
  const features = featuresQ.data ?? DEFAULT_DASHBOARD_FEATURES;

  const monthQ = useQuery({
    queryKey: ['adminAppointments', 'dashboard', 'month', monthKey],
    queryFn: () => fetchDays(monthDays(monthKey)),
    ...LIVE,
  });
  const prevQ = useQuery({
    queryKey: ['adminAppointments', 'dashboard', 'month', prevKey],
    queryFn: () => fetchDays(monthDays(prevKey)),
    // Mois passé : il ne bouge plus guère, sauf le 1er (clôtures de la veille)
    ...(clock.today.endsWith('-01') ? LIVE : SLOW),
  });
  const nextQ = useQuery({
    queryKey: ['adminAppointments', 'dashboard', 'next', nextDates[0] || 'none', nextDates.length],
    queryFn: () => fetchDays(nextDates),
    enabled: nextDates.length > 0,
    ...LIVE,
  });
  const upcomingQ = useQuery({
    queryKey: ['adminAppointments', 'upcoming', clock.today],
    queryFn: () => fetchUpcomingConfirmed(clock.today),
    ...SLOW,
  });
  // Clé partagée ['employees'] = fetchPublicBarbers (accueil, réservation)
  const employeesQ = useQuery({ queryKey: ['employees'], queryFn: fetchPublicBarbers });
  const timeOffsQ = useQuery({
    queryKey: ['timeOffs'],
    queryFn: () => api.entities.TimeOff.list('-start_date', 200),
    ...SLOW,
  });
  // Même lecture que la pastille « Congés » d'AdminLayout (clé partagée)
  const pendingLeavesQ = useQuery({
    queryKey: ['timeOffs', 'pending'],
    queryFn: () => api.entities.TimeOff.filter({ status: 'pending' }, '-created_at', 100),
    enabled: access.canLeave,
    refetchInterval: DASHBOARD_REFRESH_MS,
    staleTime: DASHBOARD_REFRESH_MS,
  });

  const ordersQ = useQuery({ queryKey: ['dashboard', 'orders'], queryFn: () => api.entities.Order.list('-created_date', CHANNEL_LIMITS.orders), ...SALES });
  const giftCardsQ = useQuery({ queryKey: ['dashboard', 'giftCards'], queryFn: () => api.entities.GiftCard.list('-created_at', CHANNEL_LIMITS.giftCards), ...SALES });
  // Privatisations : page et données réservées à l'admin (le serveur ne renvoie à un barber que les
  // créneaux, sans prix) : ni requête ni canal pour un barber
  const eventsQ = useQuery({
    queryKey: ['dashboard', 'events'],
    queryFn: () => api.entities.Event.list('-created_at', CHANNEL_LIMITS.events),
    enabled: access.canEvents,
    ...SALES,
  });
  // Remplissage, côté barber : les privatisations confirmées (le serveur ne lui renvoie que les
  // créneaux, sans prix ni client) ; l'admin a déjà la liste complète
  const privateSlotsQ = useQuery({
    queryKey: ['dashboard', 'privateSlots'],
    queryFn: () => api.entities.Event.filter({ status: 'confirmed' }, '-created_at', CHANNEL_LIMITS.events),
    enabled: !access.canEvents,
    ...SLOW,
  });
  const textileQ = useQuery({ queryKey: TEXTILE_QUERY_KEY, queryFn: fetchTextileOverview, ...SALES });
  const resQ = useQuery({
    queryKey: ['textileReservations', 'all'],
    queryFn: () => api.entities.TextileReservation.list('-created_at', CHANNEL_LIMITS.reservations),
    ...SALES,
  });

  const settingsQ = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => api.entities.SalonSettings.list('-created_date', 1), staleTime: 5 * 60 * 1000 });
  // Clients sur l'app en ce moment (5 dernières minutes, comme Admin → Trafic) : admin seulement
  const liveQ = useQuery({
    queryKey: ['dashboard', 'live'],
    queryFn: () => apiRequest('GET', apiUrl('/analytics/live')),
    enabled: access.isAdmin && features.analyticsLive,
    refetchInterval: DASHBOARD_REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const employees = useMemo(() => (Array.isArray(employeesQ.data) ? employeesQ.data : []), [employeesQ.data]);
  const rows = useMemo(
    () => [...(prevQ.data?.rows || []), ...(monthQ.data?.rows || []), ...(nextQ.data?.rows || [])],
    [prevQ.data, monthQ.data, nextQ.data],
  );
  const timeOffs = useMemo(() => (Array.isArray(timeOffsQ.data) ? timeOffsQ.data : []), [timeOffsQ.data]);

  // Recalculé quand les données changent ou que la minute passe
  const stats = useMemo(() => computeDashboard({ rows, nowMs, employees }),
    [rows, employees, minute]);
  const upcoming = useMemo(() => ({
    ...buildUpcoming(upcomingQ.data?.rows || [], nowMs),
    incomplete: !!upcomingQ.data?.incomplete,
    beyond: upcomingQ.data?.beyond || null,
  }), [upcomingQ.data, minute]);
  const privateEvents = access.canEvents ? eventsQ.data : privateSlotsQ.data;
  const fill = useMemo(() => computeFill({ rows, employees, timeOffs, privateEvents: Array.isArray(privateEvents) ? privateEvents : [], nowMs }),
    [rows, employees, timeOffs, privateEvents, minute]);
  const sales = useMemo(() => computeChannels({
    orders: ordersQ.data || [],
    giftCards: giftCardsQ.data || [],
    events: eventsQ.data || [],
    textile: textileQ.data || null,
    reservations: resQ.data || [],
    nowMs,
    rdv: {
      today: stats.today.money.revenue,
      month: stats.month.money.revenue,
      prevSameDay: stats.prevMonth.revenueSameDay,
      prevTotal: stats.prevMonth.revenueTotal,
      toClose: stats.month.toClose.amount,
      upcoming: stats.month.upcoming.amount,
    },
    prevCutoffDay: stats.prevMonth.cutoffDay,
    canEvents: access.canEvents,
  }), [ordersQ.data, giftCardsQ.data, eventsQ.data, textileQ.data, resQ.data, stats, access.canEvents]);

  // Listes lues, reprises telles quelles pour les mois passés (usePastMonths)
  const source = useMemo(() => ({
    orders: ordersQ.data || [],
    giftCards: giftCardsQ.data || [],
    events: eventsQ.data || [],
    textile: textileQ.data || null,
    reservations: resQ.data || [],
    employees,
  }), [ordersQ.data, giftCardsQ.data, eventsQ.data, textileQ.data, resQ.data, employees]);

  // Canal dont la source n'a pas pu se charger : « — », jamais « 0 € » ; « … » au premier chargement
  const salesFailed = {
    boutique: queryFailed(ordersQ),
    cartes: queryFailed(giftCardsQ),
    privatisations: access.canEvents && queryFailed(eventsQ),
    textile: queryFailed(textileQ) || queryFailed(resQ),
  };
  const salesLoading = {
    boutique: !salesFailed.boutique && ordersQ.isPending,
    cartes: !salesFailed.cartes && giftCardsQ.isPending,
    privatisations: access.canEvents && !salesFailed.privatisations && eventsQ.isPending,
    textile: !salesFailed.textile && (textileQ.isPending || resQ.isPending),
  };
  const salesQueries = [ordersQ, giftCardsQ, ...(access.canEvents ? [eventsQ] : []), textileQ, resQ];

  const apptFailed = queryFailed(monthQ);
  const settings = Array.isArray(settingsQ.data) ? settingsQ.data[0] || null : null;
  const liveCount = liveQ.isSuccess && Number.isFinite(Number(liveQ.data?.sessions)) ? Number(liveQ.data.sessions) : null;

  const refreshAll = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['adminAppointments'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: TEXTILE_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: ['textileReservations'] }),
    queryClient.invalidateQueries({ queryKey: ['timeOffs'] }),
    queryClient.invalidateQueries({ queryKey: ['employees'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboardFeatures'] }),
  ]);

  return {
    access,
    features,
    nowMs,
    stats,
    upcoming,
    fill,
    sales,
    settings,
    liveCount,
    pendingLeaves: access.canLeave && Array.isArray(pendingLeavesQ.data) ? pendingLeavesQ.data.length : 0,
    state: {
      // Rendez-vous du mois en cours : base de presque tous les blocs
      // Réessayer relit toutes les lectures de RDV (mois précédent, jours suivants, CA à venir compris)
      appointments: {
        failed: apptFailed, loading: !apptFailed && monthQ.isPending, error: monthQ.error,
        retry: () => Promise.all([monthQ, prevQ, upcomingQ, ...(nextDates.length ? [nextQ] : []), ...(queryFailed(employeesQ) ? [employeesQ] : [])].map((q) => q.refetch())),
        retrying: monthQ.isFetching,
      },
      // Mois précédent : comparaison, « à clôturer » des jours d'avant le 1er
      prevMonth: { failed: queryFailed(prevQ), loading: !queryFailed(prevQ) && prevQ.isPending, retry: prevQ.refetch },
      nextDays: { failed: queryFailed(nextQ), loading: nextDates.length > 0 && !queryFailed(nextQ) && nextQ.isPending, retry: nextQ.refetch },
      upcoming: { failed: queryFailed(upcomingQ), loading: !queryFailed(upcomingQ) && upcomingQ.isPending, error: upcomingQ.error, retry: upcomingQ.refetch, retrying: upcomingQ.isFetching },
      employees: { failed: queryFailed(employeesQ), loading: !queryFailed(employeesQ) && employeesQ.isPending, retry: employeesQ.refetch },
      timeOffs: { failed: queryFailed(timeOffsQ), loading: !queryFailed(timeOffsQ) && timeOffsQ.isPending },
      sales: {
        failed: salesFailed,
        loading: salesLoading,
        retry: () => Promise.all(salesQueries.filter(queryFailed).map((q) => q.refetch())),
        retrying: salesQueries.some((q) => q.isFetching),
      },
      // Lecture coupée au plafond du serveur : chiffres peut-être incomplets
      truncated: {
        appointments: [monthQ, prevQ, nextQ].some((q) => !!q.data?.truncated),
        ...computeTruncated(sales),
      },
      // Heure de la dernière lecture réussie des RDV du mois (« mis à jour à HH:MM »)
      updatedAt: monthQ.dataUpdatedAt || 0,
      // Relecture en échec alors que des chiffres sont affichés : signaler qu'ils datent
      stale: [monthQ, prevQ, nextQ, upcomingQ, ordersQ, giftCardsQ, eventsQ, textileQ, resQ].some((q) => q.data && q.isError),
      refreshing: monthQ.isFetching || prevQ.isFetching,
    },
    // Lignes lues (mois précédent, mois en cours, jours suivants) et mois lus en entier : l'export
    // comptable s'en sert pour un mois déjà chargé
    rows,
    loadedMonths: [prevQ.data && !prevQ.data.truncated ? prevKey : null, monthQ.data && !monthQ.data.truncated ? monthKey : null].filter(Boolean),
    source,
    refreshAll,
  };
}

const computeTruncated = (sales) => ({
  orders: !!sales.truncated.orders,
  giftCards: !!sales.truncated.giftCards,
  events: !!sales.truncated.events,
  reservations: !!sales.truncated.reservations,
});

// ─── Mois passés ──────────────────────────────────────────────────────

// Un mois plus ancien que le mois précédent ne bouge presque plus : relu au plus toutes les 30 min, et
// par « Actualiser » (préfixe `dashboard` de `refreshAll`). Hors du préfixe `adminAppointments` : chaque
// écriture de l'agenda ferait relire tous les mois au retour sur la page.
const PAST_MONTH_OPTIONS = { staleTime: 30 * DASHBOARD_REFRESH_MS, gcTime: 2 * 60 * DASHBOARD_REFRESH_MS, refetchOnWindowFocus: false };

/**
 * Chiffres des mois passés, du plus récent au plus ancien. Lit les `PAST_MONTHS_SHOWN` derniers mois,
 * les autres seulement avec `showAll` (un mois = deux requêtes). Le mois précédent est la lecture du
 * tableau de bord (même clé, relue par l'agenda).
 * @param {ReturnType<typeof useDashboardData>} d
 * @returns {{
 *   entries: Array<{ key: string, report: ReturnType<typeof computeMonthReport>|null, failed: boolean, loading: boolean, truncated: boolean }>,
 *   total: number, listFailed: boolean, listError: Error|null, listLoading: boolean,
 *   retry: () => Promise<unknown>, retrying: boolean,
 * }}
 */
export function usePastMonths(d, { showAll = false } = {}) {
  const { source, access, stats } = d;
  const { monthKey, prevMonthKey: prevKey } = stats.clock;
  const firstQ = useQuery({
    queryKey: ['dashboard', 'firstAppointment'],
    queryFn: () => api.entities.Appointment.list('date', 1),
    ...PAST_MONTH_OPTIONS,
  });
  const firstDate = Array.isArray(firstQ.data) ? firstQ.data[0]?.date : null;
  const firstKey = useMemo(() => firstMonthOf(firstDate, source), [firstDate, source]);
  const months = useMemo(() => pastMonthKeys(firstKey, monthKey), [firstKey, monthKey]);
  const shown = useMemo(() => (showAll ? months : months.slice(0, PAST_MONTHS_SHOWN)), [months, showAll]);

  const queries = useQueries({
    queries: shown.map((key) => (key === prevKey
      ? { queryKey: ['adminAppointments', 'dashboard', 'month', key], queryFn: () => fetchDays(monthDays(key)) }
      : { queryKey: ['dashboard', 'pastMonth', key], queryFn: () => fetchDays(monthDays(key)), ...PAST_MONTH_OPTIONS })),
  });
  // Recalculé quand une lecture revient (ou quand les ventes changent), pas à chaque minute
  const readAt = queries.map((q) => q.dataUpdatedAt).join();
  const reports = useMemo(() => shown.map((key, i) => (queries[i]?.data
    ? computeMonthReport({ monthKey: key, rows: queries[i].data.rows, source, canEvents: access.canEvents })
    : null)), [readAt, shown, source, access.canEvents]);

  return {
    entries: shown.map((key, i) => {
      const failed = queryFailed(queries[i]);
      return { key, report: reports[i] || null, failed, loading: !failed && !!queries[i]?.isPending, truncated: !!queries[i]?.data?.truncated };
    }),
    total: months.length,
    listFailed: queryFailed(firstQ),
    listError: firstQ.error,
    listLoading: !queryFailed(firstQ) && firstQ.isPending,
    retry: () => Promise.all([firstQ, ...queries].filter(queryFailed).map((q) => q.refetch())),
    retrying: firstQ.isFetching || queries.some((q) => q.isFetching),
  };
}

/**
 * Objectif de CA du mois (`salon_settings.monthly_revenue_goal`, `features.revenueGoal`) : admin seulement.
 * `null` = pas d'objectif. N'envoie que ce champ (jamais les autres paramètres du salon).
 */
export function useSaveRevenueGoal(settings) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (goal) => {
      if (!settings?.id) throw new Error('Paramètres du salon introuvables');
      return api.entities.SalonSettings.update(settings.id, { monthly_revenue_goal: goal });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}
