/**
 * Abonnements au mois (4 nov. 2026) : lectures, écritures et calculs partagés par le parcours du
 * client et les écrans du salon. Contrat : docs/fonctions/abonnements-contrat.md.
 *
 * Le solde d'une carte d'abonnement reste en euros (débit, annulation, Wallet et CA des cartes cadeau),
 * l'app le compte en coupes : `cardVisits`. Aucune règle de créneau ici : `analyzeDay` (lib/slots.js).
 */
import { useQuery } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { API_SERVER_URL, resolvedAppId, apiRequest, apiUrl } from '@/api/apiClient';
import { invalidateAppointmentQueries } from '@/components/agenda/agendaUtils';
import { analyzeDay } from '@/lib/slots';
import { dateFromKey } from '@/lib/availability';

export const SUBSCRIPTION_VISITS = 4;
// Mêmes bornes que cleanSlots (dhomebarber-api/lib/subscriptions.js), le serveur a le dernier mot
export const MIN_GAP_DAYS = 3;
export const MAX_SPAN_DAYS = 35;

export const subscriptionKeys = {
  feature: ['subscriptionFeature'],
  plans: ['subscriptionPlans'],
  mine: ['subscriptions', 'mine'],
  all: (status = 'all') => ['subscriptions', 'all', status],
  one: (id) => ['subscriptions', 'one', String(id)],
};

// ─── Drapeau ──────────────────────────────────────────────────────────

/**
 * `features.subscriptions` : vrai seulement si le serveur l'annonce. Rejette sur une panne ou une
 * coupure : « je ne sais pas » n'est jamais « pas d'abonnement » (l'écran aurait proposé une seule visite
 * au prix de l'abonnement, ou annulé une carte à part, pendant 5 minutes). Faux : réponse lue qui ne
 * l'annonce pas (serveur plus ancien, SUBSCRIPTIONS=off).
 */
export async function fetchSubscriptionsFeature() {
  const res = await fetch(`${API_SERVER_URL}/api/apps/public/prod/public-settings/by-id/${resolvedAppId}`);
  if (!res.ok) throw new Error(`Paramètres publics : ${res.status}`);
  const data = await res.json();
  return data?.features?.subscriptions === true;
}

/**
 * Drapeau avec son état : `enabled` (annoncé), `disabled` (réponse lue, pas annoncé), `pending`
 * (premier chargement), `failed` (illisible) et `query` (`LoadError`, Réessayer). La dernière réponse lue
 * reste valable pendant une panne.
 */
export function useSubscriptionsFeatureState() {
  const query = useQuery({ queryKey: subscriptionKeys.feature, queryFn: fetchSubscriptionsFeature, staleTime: 5 * 60 * 1000, retry: 2 });
  const known = query.data === true || query.data === false;
  return {
    enabled: query.data === true,
    disabled: query.data === false,
    pending: !known && query.isPending && query.fetchStatus !== 'paused',
    failed: !known && (query.isError || query.fetchStatus === 'paused'),
    query,
  };
}

export function useSubscriptionsFeature() {
  return useSubscriptionsFeatureState().enabled;
}

// ─── Lectures ─────────────────────────────────────────────────────────

export const fetchPlans = async () => (await apiRequest('GET', apiUrl('/subscriptions/plans')))?.plans || [];
export const fetchMySubscriptions = async () => (await apiRequest('GET', apiUrl('/subscriptions/mine')))?.subscriptions || [];
export const fetchAllSubscriptions = async (status = null) => (await apiRequest('GET', apiUrl(`/subscriptions${status ? `?status=${encodeURIComponent(status)}` : ''}`)))?.subscriptions || [];
export const fetchSubscription = async (id) => (await apiRequest('GET', apiUrl(`/subscriptions/${encodeURIComponent(id)}`)))?.subscription || null;

/**
 * Formules ouvertes : `plans` (liste du serveur), `isPlanId(id)` pour reconnaître une prestation du
 * catalogue. Vide tant que le drapeau est faux : le catalogue reste alors comme avant.
 */
export function useSubscriptionPlans() {
  const feature = useSubscriptionsFeatureState();
  const { enabled } = feature;
  const query = useQuery({ queryKey: subscriptionKeys.plans, queryFn: fetchPlans, enabled, staleTime: 5 * 60 * 1000 });
  const plans = enabled && Array.isArray(query.data) ? query.data : [];
  return { enabled, feature, plans, query, isPlanId: (id) => plans.some((p) => String(p.service_id) === String(id)) };
}

// ─── Écritures ────────────────────────────────────────────────────────

/** Clé d'essai : gardée après une erreur réseau, rejouée sans créer un second abonnement. */
export function newRequestKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `abo-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** `{ subscription, duplicate }` ; erreurs `code` : voir le contrat (`slot_unavailable` porte `slot`). */
export const createSubscription = ({ serviceId, slots, requestKey }) => apiRequest('POST', apiUrl('/subscriptions'), {
  service_id: serviceId,
  request_key: requestKey,
  slots: slots.map((s) => ({ employee_id: s.employeeId, date: s.date, start_time: s.time })),
});

export const rebookVisit = (id, { employeeId, date, time }) => apiRequest('POST', apiUrl(`/subscriptions/${encodeURIComponent(id)}/rebook`), {
  employee_id: employeeId, date, start_time: time,
});

/** Paiement reçu au salon (`cb` ou `especes`) : crée la carte. Rejouable sans seconde carte. */
export const validateSubscription = (id, paymentMethod) => apiRequest('POST', apiUrl(`/subscriptions/${encodeURIComponent(id)}/validate`), {
  payment_method: paymentMethod,
});

/** `{ subscription, refund_due, cancelled_appointments }` : `refund_due` à rembourser à la main. */
export const cancelSubscription = (id) => apiRequest('POST', apiUrl(`/subscriptions/${encodeURIComponent(id)}/cancel`), {});

/** Après toute écriture : abonnements, cartes et rendez-vous de toute l'app. */
export function invalidateSubscriptionQueries(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
  queryClient.invalidateQueries({ queryKey: ['appointments-day'] });
  queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
  queryClient.invalidateQueries({ queryKey: ['giftCards'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  invalidateAppointmentQueries(queryClient);
}

// ─── Cartes d'abonnement ──────────────────────────────────────────────

export const isSubscriptionCard = (card) => !!card?.subscription_id;
/** Ligne de la coupe d'un RDV d'abonnement : même règle que le serveur (`isPlanName`), jamais retirée. */
export const isVisitLine = (service) => /^\s*4\s*coupes\b/i.test(String(service?.name || ''));

/**
 * Coupes d'une carte d'abonnement : `{ left, total, unit }`. Une coupe entamée (débit libre) ne compte
 * plus, comme au serveur (`visitsLeftOf`).
 */
export function cardVisits(card) {
  const unit = Number(card?.subscription_unit_price) || 0;
  const total = Number(card?.subscription_visits) || SUBSCRIPTION_VISITS;
  if (card?.status === 'expired' || unit <= 0) return { left: 0, total, unit };
  const balance = Number(card?.remaining_balance != null ? card.remaining_balance : card?.amount) || 0;
  return { left: Math.floor(Math.round(balance * 100) / Math.round(unit * 100)), total, unit };
}

/** « 1 coupe », « 3 coupes », « 0 coupe ». */
export const visitsWord = (n) => `${n} coupe${n > 1 ? 's' : ''}`;

// ─── Calendrier ───────────────────────────────────────────────────────

const dayNumber = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
export const daysBetween = (a, b) => dayNumber(b) - dayNumber(a);
const keyOf = (date) => format(date, 'yyyy-MM-dd');
const addDaysKey = (key, n) => keyOf(addDays(dateFromKey(key), n));

/**
 * Ce qui empêche une liste de créneaux d'être acceptée : `too_close`, `too_far` ou null.
 * @param {Array<{ date: string }>} slots
 */
export function slotsIssue(slots) {
  const days = slots.map((s) => s.date).sort();
  for (let i = 1; i < days.length; i++) {
    if (daysBetween(days[i - 1], days[i]) < MIN_GAP_DAYS) return 'too_close';
  }
  return days.length > 1 && daysBetween(days[0], days[days.length - 1]) > MAX_SPAN_DAYS ? 'too_far' : null;
}

/**
 * Heures libres d'un barber un jour donné, pour la durée d'une visite.
 * @param {object} p
 * @param {object} p.employee
 * @param {string} p.date                 `yyyy-MM-dd`
 * @param {Array} p.rows                  lignes lues (`blocks_client` déjà filtré), tous barbers et jours
 * @param {Array} [p.timeOffs]
 * @param {Array} [p.privateEvents]
 * @param {number} p.duration
 */
export function freeTimes({ employee, date, rows = [], timeOffs = [], privateEvents = [], duration }) {
  const own = rows.filter((r) => String(r.employee_id) === String(employee.id) && String(r.date).slice(0, 10) === date);
  const privates = privateEvents.filter((e) => String(e.date).slice(0, 10) === date);
  return analyzeDay(employee, dateFromKey(date), own, timeOffs, duration, duration, privates).slots;
}

/** L'heure libre la plus proche de `time` (à égalité, la plus tôt) ; null si aucune. */
export function closestTime(times, time) {
  const toMin = (t) => {
    const [h, m] = String(t).split(':').map(Number);
    return h * 60 + m;
  };
  let best = null;
  for (const t of times) {
    if (best === null || Math.abs(toMin(t) - toMin(time)) < Math.abs(toMin(best) - toMin(time))) best = t;
  }
  return best;
}

/**
 * Les RDV 2, 3 et 4 proposés après le premier : même jour de la semaine et même heure chaque semaine.
 * Heure prise : la plus proche ce jour-là (`note: 'time'`). Jour sans place : le jour libre le plus
 * proche qui garde l'écart et la limite des 5 semaines (`note: 'day'`). Rien de possible : `time: null`,
 * le client choisit à la main. Le barber est le même partout.
 *
 * @param {object} p
 * @param {{ date: string, time: string }} p.first
 * @param {object} p.employee
 * @param {Array} p.rows
 * @param {Array} [p.timeOffs]
 * @param {Array} [p.privateEvents]
 * @param {number} p.duration
 * @returns {Array<{ date: string, time: string|null, note: null|'time'|'day' }>} 3 lignes
 */
export function proposeNextSlots({ first, employee, rows, timeOffs = [], privateEvents = [], duration }) {
  const out = [];
  let previous = first.date;
  for (let week = 1; week < SUBSCRIPTION_VISITS; week++) {
    const target = addDaysKey(first.date, 7 * week);
    const times = (date) => freeTimes({ employee, date, rows, timeOffs, privateEvents, duration });
    const sameDay = times(target);
    if (sameDay.includes(first.time)) out.push({ date: target, time: first.time, note: null });
    else if (sameDay.length) out.push({ date: target, time: closestTime(sameDay, first.time), note: 'time' });
    else {
      // Du plus proche au plus loin autour du jour visé
      let found = null;
      for (let delta = 1; delta <= 3 && !found; delta++) {
        for (const date of [addDaysKey(target, delta), addDaysKey(target, -delta)]) {
          if (daysBetween(previous, date) < MIN_GAP_DAYS || daysBetween(first.date, date) > MAX_SPAN_DAYS) continue;
          const free = times(date);
          if (free.length) { found = { date, time: closestTime(free, first.time), note: 'day' }; break; }
        }
      }
      out.push(found || { date: target, time: null, note: 'day' });
    }
    previous = out[out.length - 1].date;
  }
  return out;
}
