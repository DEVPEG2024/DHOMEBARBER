/**
 * Abonnements au mois, écrans du salon : ce que disent une ligne et une fenêtre, en fonctions pures.
 * Jour et heure de Paris, quel que soit le fuseau de l'ordinateur. Contrat : docs/fonctions/abonnements-contrat.md.
 */
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { parisInstant } from '@/lib/calendarLinks';
import { noonOf, parisClock } from '@/lib/dashboardStats';
import { daysBetween, visitsWord } from '@/lib/subscriptions';

const HOURS_48 = 48 * 60 * 60 * 1000;

/** « 3 coupes restantes », « 1 coupe restante », « 0 coupe restante ». */
export const visitsLeftLabel = (n) => `${visitsWord(n)} restante${n > 1 ? 's' : ''}`;

const dayOf = (a) => String(a?.date || '').slice(0, 10);
const timeOf = (a) => String(a?.start_time || '').slice(0, 5);
const instantOf = (a) => parisInstant(dayOf(a), timeOf(a));

/** RDV de la vue, du plus tôt au plus tard. */
export const visitsOf = (view) => [...(view?.appointments || [])]
  .sort((a, b) => `${dayOf(a)} ${timeOf(a)}`.localeCompare(`${dayOf(b)} ${timeOf(b)}`));

/** Ni encaissé, ni débité, ni annulé, ni absent : un RDV que le client doit encore honorer. */
export const isOpenVisit = (a) => ['confirmed', 'pending'].includes(a?.status) && !a?.payment_method && !a?.paid_by_card;

/** RDV ouverts d'un abonnement : ceux qu'une annulation emporte. */
export const openVisitsOf = (view) => visitsOf(view).filter(isOpenVisit);

/** Prochain RDV à honorer (pas encore commencé), `null` s'il n'y en a plus. */
export const nextVisitOf = (view, nowMs = Date.now()) => openVisitsOf(view).find((a) => instantOf(a) > nowMs) || null;

/** RDV ouvert qui suit celui-là, juste après un débit. */
export const visitAfter = (view, apt) => {
  const after = `${dayOf(apt)} ${timeOf(apt)}`;
  return openVisitsOf(view).find((a) => String(a.id) !== String(apt?.id) && `${dayOf(a)} ${timeOf(a)}` > after) || null;
};

/** Barbers d'un abonnement, sans doublon : « Kevin », « Kevin, Dom ». */
export const barbersOf = (view) => [...new Set(visitsOf(view).map((a) => a.employee_name).filter(Boolean))].join(', ');

const upperFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** « jeudi 12 novembre » ; `upper` : « Jeudi 12 novembre ». */
export function longDay(key, { upper = false } = {}) {
  const text = key ? format(noonOf(key), 'EEEE d MMMM', { locale: fr }) : '';
  return upper ? upperFirst(text) : text;
}

/** « aujourd'hui », « demain », sinon « jeudi 12 novembre ». */
function nearDay(key, nowMs) {
  const delta = daysBetween(parisClock(nowMs).today, key);
  if (delta === 0) return "aujourd'hui";
  if (delta === 1) return 'demain';
  return longDay(key);
}

/** « demain à 10:30 », « jeudi 12 novembre à 17:00 ». */
export const whenOf = (a, nowMs = Date.now()) => `${nearDay(dayOf(a), nowMs)} à ${timeOf(a)}`;

/** « hier », « aujourd'hui », sinon « le jeudi 12 novembre ». */
function pastDay(key, nowMs) {
  const delta = daysBetween(key, parisClock(nowMs).today);
  if (delta === 0) return "aujourd'hui";
  if (delta === 1) return 'hier';
  return `le ${longDay(key)}`;
}

/**
 * Ce que dit la ligne d'un abonnement à régler :
 *  - `overdue` : un RDV est déjà passé, l'argent n'est toujours pas rentré (pastille rouge « Pas réglé ») ;
 *  - `soon` : le premier RDV est dans moins de 48 h (pastille orange) ;
 *  - `first` : le premier RDV ; `text` : la phrase affichée.
 *
 * @param {object} view  vue équipe de l'abonnement
 * @param {number} [nowMs]
 * @param {(n: number) => string} money  montant écrit
 */
export function pendingStateOf(view, nowMs = Date.now(), money = String) {
  const visits = visitsOf(view);
  const first = visits[0] || null;
  if (!first) return { overdue: false, soon: false, first: null, text: 'Aucun RDV réservé' };
  const passed = visits.filter((a) => instantOf(a) <= nowMs);
  if (passed.length > 0) {
    return { overdue: true, soon: false, first, text: `Premier RDV passé ${pastDay(dayOf(first), nowMs)}, ${money(view.price)} non réglés.` };
  }
  return { overdue: false, soon: instantOf(first) - nowMs < HOURS_48, first, text: `Premier RDV ${whenOf(first, nowMs)}` };
}

/**
 * Onglet d'un abonnement : À valider, En cours, ou Terminés (terminés + annulés).
 * @returns {'pending'|'active'|'done'}
 */
export function tabOf(view) {
  if (view.display_status === 'pending') return 'pending';
  if (view.display_status === 'active') return 'active';
  return 'done';
}

/** Tri d'un onglet : le plus urgent d'abord ; les terminés, du plus récent au plus ancien. */
export function sortForTab(list, tab, nowMs = Date.now()) {
  const key = (view) => {
    const next = tab === 'active' ? nextVisitOf(view, nowMs) : visitsOf(view)[0];
    return next ? `${dayOf(next)} ${timeOf(next)}` : '9999';
  };
  if (tab === 'done') {
    const at = (v) => String(v.cancelled_at || v.validated_at || v.created_at || '');
    return [...list].sort((a, b) => at(b).localeCompare(at(a)));
  }
  return [...list].sort((a, b) => key(a).localeCompare(key(b)));
}

/** Annulation demandée : « Annuler l'abonnement et ses 4 RDV », « et son RDV », ou sans RDV ouvert. */
export function cancelLabel(openCount) {
  if (openCount > 1) return `Annuler l'abonnement et ses ${openCount} RDV`;
  return openCount === 1 ? "Annuler l'abonnement et son RDV" : "Annuler l'abonnement";
}

/** Abonnement payé sans plus aucune coupe : ses RDV encore ouverts s'encaissent normalement. */
export const hasNoVisitLeft = (sub) => sub?.status === 'active' && (Number(sub.visits_left) || 0) <= 0;

/**
 * Ce que devient la coupe d'un RDV manqué : « sur la carte » une fois l'abonnement réglé, « sur
 * l'abonnement » tant que la carte n'existe pas (ou que l'état n'est pas lu) ; '' s'il n'y a plus rien à garder.
 */
export function visitKeptMessage(sub) {
  if (sub?.status === 'cancelled' || hasNoVisitLeft(sub)) return '';
  return sub?.status === 'active' ? 'La coupe reste sur la carte.' : "La coupe reste sur l'abonnement.";
}

/** Solde qui reste sur la carte : à rembourser à la main si l'abonnement payé est annulé. */
export function refundOf(view) {
  if (view?.status !== 'active' || !view.card || view.card.status === 'expired') return 0;
  return Number(view.card.remaining_balance != null ? view.card.remaining_balance : view.card.amount) || 0;
}
