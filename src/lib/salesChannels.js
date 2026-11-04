/**
 * Tableau de bord : ventes de tous les canaux, pas seulement les rendez-vous (fonctions pures).
 *
 * Canaux et règle de comptage (demande du client, 9 sept. 2026) :
 *  - Prestations : CA des rendez-vous encaissés hors pourboire et hors part carte cadeau (calculé par
 *    `computeDashboard`, reçu tel quel) : la part carte est déjà comptée à la vente de la carte ;
 *  - Boutique : commandes `delivered` (payées au retrait, date `delivered_at`, sinon `created_date`) ;
 *    en cours = pending / confirmed / ready ;
 *  - Cartes cadeau : cartes `validated` / `used` (l'argent entre à la validation, date `validated_at`) ;
 *    en attente = `pending` ; solde en circulation = reste des cartes validées encore valables ;
 *    un abonnement payé est une carte comme les autres (`subscription_id`) : compté au mois du paiement,
 *    avec la précision « dont abonnements », les visites ne recomptent rien ;
 *  - Privatisations : événements `confirmed` (payés au salon) avec un prix, à la date de l'événement ;
 *    `accepted` (devis accepté, pas encore payé) = à encaisser ; `pending` = devis à envoyer ;
 *    `quoted` = réponse du client attendue ;
 *  - Textile (précommandes) : réservations `paid` / `ready` / `picked_up` (prix × quantité) ;
 *    à payer = `reserved`, prêtes à retirer = `ready`.
 * Les dates suivent le jour de Paris ; sans horodatage d'encaissement (anciennes commandes sans
 * `delivered_at`, textile), la date de création : approximation assumée.
 */
import { isValidityPassed } from '@/lib/giftCardDebit';
import { ACTIVE_RESERVATION_STATUSES } from '@/lib/textileApi';
import { round2 } from '@/lib/revenue';
import { parisClock } from '@/lib/dashboardStats';
import { cardVisits, isSubscriptionCard } from '@/lib/subscriptions';

export const ORDER_OPEN = ['pending', 'confirmed', 'ready'];
const EVENT_WON = ['confirmed'];
const EVENT_UPCOMING = ['accepted', 'confirmed'];
const TEXTILE_PAID = ACTIVE_RESERVATION_STATUSES.filter((s) => s !== 'reserved'); // paid, ready, picked_up

// Plafonds des lectures du tableau de bord (useDashboardData) : une liste pleine est signalée
export const CHANNEL_LIMITS = { orders: 500, giftCards: 500, events: 300, reservations: 500 };

export const CHANNEL_COLORS = {
  prestations: '#3fcf8e',
  boutique: '#a78bfa',
  cartes: '#f59e0b',
  privatisations: '#f472b6',
  textile: '#60a5fa',
};

/** Jour de Paris `yyyy-MM-dd` d'une valeur ISO / `yyyy-MM-dd` ; '' si illisible. */
export function parisDayOf(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const t = Date.parse(value);
  return Number.isFinite(t) ? parisClock(t).today : '';
}

const sum = (rows, fn) => round2(rows.reduce((s, r) => s + (Number(fn(r)) || 0), 0));

/** Abonnements à valider (`GET /subscriptions?status=pending`) : nombre et montant à encaisser. */
export const pendingSubscriptionsOf = (rows = []) => ({ count: rows.length, amount: sum(rows, (s) => s.price) });

/**
 * @param {object} p
 * @param {Array} [p.orders] @param {Array} [p.giftCards] @param {Array} [p.events] @param {object} [p.textile]
 * @param {Array} [p.reservations]
 * @param {number} p.nowMs
 * @param {{ today: number, month: number, prevSameDay: number, prevTotal: number, toClose?: number, upcoming?: number }} p.rdv
 *   CA RDV hors carte ; `toClose` / `upcoming` : RDV du mois terminés à clôturer et confirmés à venir
 * @param {string} p.prevCutoffDay  dernier jour compté du mois précédent (« à la même date »)
 * @param {boolean} [p.canEvents]  privatisations lues (admin)
 * @returns {{
 *   channels: Array<{ key, label, today, month, prevSameDay, prevTotal, color }>,
 *   totals: { today, month, prevSameDay, prevTotal, projection },
 *   boutique, cartes, subscriptions: { running, visitsLeft, toHonor }, privatisations, textile,
 *   todo: { ordersToPrepare, ordersReady, cardsToValidate, quotesToSend, quotesAwaitingClient, acceptedToCash, textileToPay, textileReady },
 *   cashToday: { cardsCB, cardsCash, cardsOther, boutique, textile },
 *   truncated: { orders, giftCards, events, reservations },
 * }}
 */
export function computeChannels({ orders = [], giftCards = [], events = [], textile = null, reservations = [], nowMs, rdv, prevCutoffDay, canEvents = false }) {
  const { today, monthKey } = parisClock(nowMs);
  const prevKey = String(prevCutoffDay || '').slice(0, 7);
  const isToday = (v) => parisDayOf(v) === today;
  const isMonth = (v) => parisDayOf(v).startsWith(monthKey);
  const isPrevMonth = (v) => !!prevKey && parisDayOf(v).startsWith(prevKey);
  // Mois précédent jusqu'au même jour (jour compris : les canaux n'ont pas d'heure de RDV)
  const isPrevSameDay = (v) => isPrevMonth(v) && parisDayOf(v) <= prevCutoffDay;

  // ─── Boutique ───
  const delivered = orders.filter((o) => o.status === 'delivered' || o.status === 'completed');
  const deliveredDate = (o) => o.delivered_at || o.created_date;
  const openOrders = orders.filter((o) => ORDER_OPEN.includes(o.status));
  const boutique = {
    today: sum(delivered.filter((o) => isToday(deliveredDate(o))), (o) => o.total_price),
    month: sum(delivered.filter((o) => isMonth(deliveredDate(o))), (o) => o.total_price),
    prevSameDay: sum(delivered.filter((o) => isPrevSameDay(deliveredDate(o))), (o) => o.total_price),
    prevTotal: sum(delivered.filter((o) => isPrevMonth(deliveredDate(o))), (o) => o.total_price),
    monthCount: delivered.filter((o) => isMonth(deliveredDate(o))).length,
    openCount: openOrders.length,
    openAmount: sum(openOrders, (o) => o.total_price),
    toPrepareCount: orders.filter((o) => o.status === 'pending' || o.status === 'confirmed').length,
    readyCount: orders.filter((o) => o.status === 'ready').length,
  };

  // ─── Cartes cadeau ───
  // Toute carte payée (validated_at), même annulée depuis : la vente reste comptée dans son mois
  const sold = giftCards.filter((c) => c.validated_at || c.status === 'validated' || c.status === 'used');
  const soldDate = (c) => c.validated_at || c.created_at;
  const pendingCards = giftCards.filter((c) => c.status === 'pending');
  const validatedCards = giftCards.filter((c) => c.status === 'validated');
  const cardBalance = (c) => (c.remaining_balance != null ? c.remaining_balance : c.amount);
  // Moyen de paiement noté à la validation (cb / especes) ; les cartes d'avant : « non renseigné »
  const byPayment = (list) => ({
    cb: sum(list.filter((c) => c.payment_method === 'cb'), (c) => c.amount),
    especes: sum(list.filter((c) => c.payment_method === 'especes'), (c) => c.amount),
    other: sum(list.filter((c) => c.payment_method !== 'cb' && c.payment_method !== 'especes'), (c) => c.amount),
  });
  const soldToday = sold.filter((c) => isToday(soldDate(c)));
  const soldMonth = sold.filter((c) => isMonth(soldDate(c)));
  const cartes = {
    today: sum(soldToday, (c) => c.amount),
    month: sum(soldMonth, (c) => c.amount),
    prevSameDay: sum(sold.filter((c) => isPrevSameDay(soldDate(c))), (c) => c.amount),
    prevTotal: sum(sold.filter((c) => isPrevMonth(soldDate(c))), (c) => c.amount),
    todayBy: byPayment(soldToday),
    monthBy: byPayment(soldMonth),
    monthCount: soldMonth.length,
    pendingCount: pendingCards.length,
    pendingAmount: sum(pendingCards, (c) => c.amount),
    // Une carte dont la validité est passée n'est plus débitable : hors du solde à honorer
    balance: sum(validatedCards.filter((c) => !isValidityPassed(c, today)), cardBalance),
    outdatedBalance: sum(validatedCards.filter((c) => isValidityPassed(c, today)), cardBalance),
    // « dont abonnements » : déjà comptés dans `today` et `month`, jamais en plus
    todaySubscriptions: sum(soldToday.filter(isSubscriptionCard), (c) => c.amount),
    monthSubscriptions: sum(soldMonth.filter(isSubscriptionCard), (c) => c.amount),
  };
  // Abonnements en cours, sur les cartes lues : encore valables, au moins une coupe à faire
  const runningCards = validatedCards.filter((c) => isSubscriptionCard(c) && !isValidityPassed(c, today) && cardVisits(c).left > 0);
  const subscriptions = {
    running: runningCards.length,
    visitsLeft: runningCards.reduce((n, c) => n + cardVisits(c).left, 0),
    toHonor: sum(runningCards, cardBalance),
  };

  // ─── Privatisations ───
  const won = events.filter((e) => EVENT_WON.includes(e.status) && Number(e.price) > 0);
  const upcoming = events.filter((e) => EVENT_UPCOMING.includes(e.status) && parisDayOf(e.date) >= today);
  const acceptedEvents = events.filter((e) => e.status === 'accepted' && Number(e.price) > 0);
  // Ce mois : seulement les privatisations déjà passées (ou du jour) ; les confirmées à venir du mois
  // vont dans la fin de mois prévue (sinon le CA « encaissé » et la comparaison au mois dernier gonflent)
  const wonMonthDone = won.filter((e) => isMonth(e.date) && parisDayOf(e.date) <= today);
  const privatisations = {
    today: sum(won.filter((e) => isToday(e.date)), (e) => e.price),
    month: sum(wonMonthDone, (e) => e.price),
    monthUpcoming: sum(won.filter((e) => isMonth(e.date) && parisDayOf(e.date) > today), (e) => e.price),
    prevSameDay: sum(won.filter((e) => isPrevSameDay(e.date)), (e) => e.price),
    prevTotal: sum(won.filter((e) => isPrevMonth(e.date)), (e) => e.price),
    monthCount: wonMonthDone.length,
    toQuoteCount: events.filter((e) => e.status === 'pending').length,
    quotedCount: events.filter((e) => e.status === 'quoted').length,
    quotedAmount: sum(events.filter((e) => e.status === 'quoted'), (e) => e.price),
    upcomingCount: upcoming.length,
    upcomingAmount: sum(upcoming, (e) => e.price),
    acceptedCount: acceptedEvents.length,
    acceptedAmount: sum(acceptedEvents, (e) => e.price),
  };

  // ─── Textile (précommandes) ───
  const amount = (r) => (Number(r.unit_price) || 0) * (Number(r.quantity) || 1);
  const paid = reservations.filter((r) => TEXTILE_PAID.includes(r.status));
  const toPay = reservations.filter((r) => r.status === 'reserved');
  const drops = Array.isArray(textile?.drops) ? textile.drops : [];
  const concepts = Array.isArray(textile?.concepts) ? textile.concepts : [];
  const currentDrop = drops.find((d) => d.status === 'live') || drops.find((d) => d.status === 'teasing') || null;
  const textileStats = {
    today: sum(paid.filter((r) => isToday(r.created_at)), amount),
    month: sum(paid.filter((r) => isMonth(r.created_at)), amount),
    prevSameDay: sum(paid.filter((r) => isPrevSameDay(r.created_at)), amount),
    prevTotal: sum(paid.filter((r) => isPrevMonth(r.created_at)), amount),
    total: sum(paid, amount),
    paidCount: paid.length,
    toPayCount: toPay.length,
    toPayAmount: sum(toPay, amount),
    readyCount: reservations.filter((r) => r.status === 'ready').length,
    currentDrop,
    currentDropPieces: currentDrop ? concepts.filter((c) => String(c.drop_id) === String(currentDrop.id)).length : 0,
    labVotes: concepts.filter((c) => !c.drop_id).reduce((s, c) => s + (Number(c.votes_count) || 0), 0),
  };

  const r = rdv || {};
  const channels = [
    { key: 'prestations', label: 'Rendez-vous (prestations et produits)', today: Number(r.today) || 0, month: Number(r.month) || 0,
      prevSameDay: Number(r.prevSameDay) || 0, prevTotal: Number(r.prevTotal) || 0, color: CHANNEL_COLORS.prestations },
    { key: 'boutique', label: 'Boutique (commandes retirées)', ...pick(boutique), color: CHANNEL_COLORS.boutique },
    { key: 'cartes', label: 'Cartes cadeau vendues', ...pick(cartes), color: CHANNEL_COLORS.cartes },
    ...(canEvents ? [{ key: 'privatisations', label: 'Privatisations', ...pick(privatisations), color: CHANNEL_COLORS.privatisations }] : []),
    { key: 'textile', label: 'Textile (précommandes payées)', ...pick(textileStats), color: CHANNEL_COLORS.textile },
  ];
  const totals = {
    today: sum(channels, (c) => c.today),
    month: sum(channels, (c) => c.month),
    prevSameDay: sum(channels, (c) => c.prevSameDay),
    prevTotal: sum(channels, (c) => c.prevTotal),
  };
  // Fin de mois prévue : encaissé tous canaux + RDV du mois terminés à clôturer + RDV confirmés à venir
  // + privatisations confirmées à venir du mois
  totals.projection = round2(totals.month + (Number(r.toClose) || 0) + (Number(r.upcoming) || 0)
    + (canEvents ? privatisations.monthUpcoming : 0));

  return {
    channels,
    totals,
    boutique,
    cartes,
    subscriptions,
    privatisations,
    textile: textileStats,
    todo: {
      ordersToPrepare: boutique.toPrepareCount,
      ordersReady: boutique.readyCount,
      cardsToValidate: cartes.pendingCount,
      quotesToSend: canEvents ? privatisations.toQuoteCount : 0,
      quotesAwaitingClient: canEvents ? privatisations.quotedCount : 0,
      acceptedToCash: canEvents ? privatisations.acceptedCount : 0,
      textileToPay: textileStats.toPayCount,
      textileReady: textileStats.readyCount,
    },
    // Caisse du jour, hors rendez-vous : cartes vendues par moyen ; boutique et textile n'ont pas de
    // moyen de paiement noté
    cashToday: {
      cardsCB: cartes.todayBy.cb, cardsCash: cartes.todayBy.especes, cardsOther: cartes.todayBy.other,
      boutique: boutique.today, textile: textileStats.today,
    },
    truncated: {
      orders: orders.length >= CHANNEL_LIMITS.orders,
      giftCards: giftCards.length >= CHANNEL_LIMITS.giftCards,
      events: canEvents && events.length >= CHANNEL_LIMITS.events,
      reservations: reservations.length >= CHANNEL_LIMITS.reservations,
    },
  };
}

const pick = (s) => ({ today: s.today, month: s.month, prevSameDay: s.prevSameDay, prevTotal: s.prevTotal });
