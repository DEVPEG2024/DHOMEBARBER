/**
 * Tableau de bord, « Mois passés » (demande du propriétaire, 4 nov. 2026) : les chiffres de chaque mois
 * passé, en fonctions pures.
 *
 * Aucune règle de comptage ici : `computeDashboard` et `computeChannels` reçoivent l'horloge posée à la
 * dernière minute du mois demandé et comptent ce mois comme s'il était le mois en cours. Un mois passé
 * vaut donc toujours ce qu'affichait « Chiffres » à la fin de ce mois, avec les clôtures faites depuis.
 */
import { parisInstant } from '@/lib/calendarLinks';
import { computeDashboard, daysInMonth, prevMonthKey } from '@/lib/dashboardStats';
import { computeChannels, parisDayOf } from '@/lib/salesChannels';

// Mois montrés avant « Voir les N mois plus anciens » (et seuls lus jusque-là)
export const PAST_MONTHS_SHOWN = 6;
// Garde-fou : une date aberrante en base ne déclenche pas des centaines de lectures
export const MAX_PAST_MONTHS = 60;

const MONTH_KEY = /^\d{4}-\d{2}$/;

/** Dernière minute du mois `yyyy-MM`, heure de Paris. */
export const endOfMonthMs = (monthKey) => parisInstant(`${monthKey}-${String(daysInMonth(monthKey)).padStart(2, '0')}`, '23:59');

/** Mois passés du plus récent au plus ancien : du mois qui précède `currentKey` jusqu'à `firstKey`. */
export function pastMonthKeys(firstKey, currentKey, max = MAX_PAST_MONTHS) {
  const out = [];
  if (!MONTH_KEY.test(String(firstKey || ''))) return out;
  for (let key = prevMonthKey(currentKey); key >= firstKey && out.length < max; key = prevMonthKey(key)) out.push(key);
  return out;
}

/**
 * Premier mois qui a quelque chose à montrer : le premier RDV (`firstDate`) ou la première vente lue.
 * Une vente pas encore encaissée peut faire apparaître un mois à 0 € : sans conséquence.
 * @returns {string} `yyyy-MM`, '' si rien n'est connu
 */
export function firstMonthOf(firstDate, { orders = [], giftCards = [], events = [], reservations = [] } = {}) {
  const days = [
    String(firstDate || '').slice(0, 10),
    ...orders.map((o) => parisDayOf(o.created_date)),
    ...giftCards.map((c) => parisDayOf(c.created_at)),
    ...events.map((e) => parisDayOf(e.date)),
    ...reservations.map((r) => parisDayOf(r.created_at)),
  ].filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d));
  return days.length ? days.reduce((min, d) => (d < min ? d : min)).slice(0, 7) : '';
}

/**
 * Tous les chiffres d'un mois passé.
 * @param {object} p
 * @param {string} p.monthKey  `yyyy-MM`
 * @param {Array} p.rows       RDV lus de ce mois
 * @param {object} p.source    `{ orders, giftCards, events, textile, reservations, employees }` (useDashboardData)
 * @param {boolean} [p.canEvents]  privatisations lues (admin)
 * @returns {{ key: string, stats: ReturnType<typeof computeDashboard>, sales: ReturnType<typeof computeChannels>, total: number }}
 */
export function computeMonthReport({ monthKey, rows = [], source = {}, canEvents = false }) {
  const nowMs = endOfMonthMs(monthKey);
  const stats = computeDashboard({ rows, nowMs, employees: source.employees || [] });
  const sales = computeChannels({
    orders: source.orders || [],
    giftCards: source.giftCards || [],
    events: source.events || [],
    textile: source.textile || null,
    reservations: source.reservations || [],
    nowMs,
    canEvents,
    rdv: { month: stats.month.money.revenue, toClose: stats.month.toClose.amount },
  });
  return { key: monthKey, stats, sales, total: sales.totals.month };
}
