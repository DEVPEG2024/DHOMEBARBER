/**
 * Débit d'une carte cadeau au comptoir (admin) : scan du QR code au dos de la carte, choix de ce
 * qu'elle paie (RDV du jour, prestations du catalogue ou montant libre), débit, annulation.
 *
 * Route serveur visée (docs/backend-gift-card-debit.md) :
 *   POST /gift-cards/:id/debit { amount, appointment_id?, services?, note? } → { card, transaction }
 *   POST /gift-cards/:id/debit/:transactionId/undo                          → { card, transaction }
 *   GET  /gift-cards/:id/transactions                                       → { transactions: [...] }
 * Le serveur verrouille la carte (`SELECT … FOR UPDATE`) : deux débits simultanés ne peuvent pas
 * dépasser le solde.
 *
 * Les routes sont en production : plus de repli sur l'entité générique `GiftCard.update` (le
 * serveur refuse désormais d'y modifier le solde, qui ne bouge que par un débit verrouillé et
 * historisé). Un débit porte une référence (`client_ref`) : rejoué après une réponse perdue, il
 * n'est pas refait.
 */
import { toast } from 'sonner';
import { api, apiRequest, apiUrl } from '@/api/apiClient';
import { isNetworkError } from '@/components/shared/LoadError';
import { invalidateAppointmentQueries } from '@/components/agenda/agendaUtils';

const TZ = 'Europe/Paris';

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** « 35 € », « 12,50 € » (même format que la boutique). */
export function formatEuro(value) {
  const n = round2(value);
  if (Number.isInteger(n)) return `${n} €`;
  return `${n.toFixed(2).replace('.', ',')} €`;
}

/** Solde restant d'une carte (montant initial tant que le solde n'a jamais été posé). */
export function giftCardBalance(card) {
  if (!card) return 0;
  return round2(card.remaining_balance != null ? card.remaining_balance : card.amount);
}

/** Date du jour à Paris, `YYYY-MM-DD`. */
export function parisToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * « 17 oct. 2026 ». Une date `YYYY-MM-DD` (validité) est lue comme un jour du calendrier ; un
 * horodatage (`created_at`, `used_at`) est ramené au jour de Paris (une carte achetée le 17 à
 * 1 h 30 n'affiche plus « 16 oct. »). `''` si la valeur est illisible.
 */
export function formatDay(value) {
  if (!value) return '';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    return new Date(y, m - 1, d, 12).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
}

/** « 17 oct., 14:32 » à l'heure de Paris pour un horodatage. */
export function formatParisDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Validité dépassée (`valid_until` antérieure au jour de Paris). */
export function isValidityPassed(card, today = parisToday()) {
  if (!card?.valid_until) return false;
  return String(card.valid_until).slice(0, 10) < today;
}

/**
 * Ce que l'admin peut faire de la carte :
 *  - `pending`   : pas encore payée, à valider avant tout débit ;
 *  - `debitable` : validée, dans sa validité, solde > 0 ;
 *  - `used`      : solde épuisé ;
 *  - `expired`   : annulée / rejetée (statut `expired`) ;
 *  - `outdated`  : validée mais date de validité passée (heure de Paris).
 */
export function giftCardState(card, today = parisToday()) {
  if (!card) return 'unknown';
  if (card.status === 'pending') return 'pending';
  if (card.status === 'expired') return 'expired';
  if (card.status === 'used' || giftCardBalance(card) <= 0) return 'used';
  if (card.status === 'validated') return isValidityPassed(card, today) ? 'outdated' : 'debitable';
  return 'unknown';
}

/** Vrai si le serveur ne connaît pas la route (pas encore déployée), pas un refus métier. */
export function isMissingRoute(err) {
  if (!err || ![404, 405, 501].includes(err.status)) return false;
  if (err.status !== 404) return true;
  const data = err.data;
  if (!data || typeof data !== 'object') return true; // page HTML « Cannot POST … »
  if (data.code) return false; // 404 métier (`gift_card_not_found`…)
  const msg = String(data.error || data.message || '').trim();
  return !msg || /^HTTP \d+$/.test(msg) || /cannot (get|post|put|patch|delete)/i.test(msg) || /^not found$/i.test(msg) || /route/i.test(msg);
}

/** Erreur → message en français pour le toast. */
export function friendlyGiftCardError(err, fallback = 'Opération impossible pour le moment.') {
  if (!err) return fallback;
  if (err.local) return err.message;
  if (isNetworkError(err) || (!err.status && err.name === 'TypeError')) return 'Pas de connexion internet : vérifiez le réseau puis réessayez.';
  const raw = err.data?.error || err.data?.message || err.message;
  const serverMsg = typeof raw === 'string' && raw.trim() && !/^HTTP \d+$/.test(raw.trim()) ? raw.trim() : '';
  if (err.status === 401) return 'Votre session a expiré : reconnectez-vous.';
  if (err.status === 403) return "Réservé à l'administrateur.";
  if (err.status === 409 || err.status === 400 || err.status === 422) return serverMsg || fallback;
  if (err.status === 404) return serverMsg || 'Carte introuvable.';
  if (err.status === 429) return serverMsg || 'Trop de demandes : réessayez dans un moment.';
  return serverMsg || fallback;
}

/** Pas de réponse du serveur pendant un débit : il est peut-être passé (jamais « réessayez »). */
export const DEBIT_NETWORK_MESSAGE = 'Pas de réponse du serveur : le débit est peut-être passé. Vérifiez le solde et l\'historique avant de réessayer.';
/** Pas de réponse pendant une annulation : elle est peut-être passée (un nouvel essai la termine sans risque). */
export const UNDO_NETWORK_MESSAGE = 'Pas de réponse du serveur : l\'annulation est peut-être passée. Vérifiez l\'historique avant de réessayer.';
/** Pas de réponse pendant un rattachement : il est peut-être passé. */
export const ATTACH_NETWORK_MESSAGE = 'Pas de réponse du serveur : le rattachement est peut-être passé. Vérifiez l\'historique avant de réessayer.';

/** Référence d'un débit (`client_ref`) : la même tant que l'admin retente le même débit. */
export function newClientRef() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* repli ci-dessous */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Erreur « métier » produite côté client, message prêt à afficher. */
function localError(message) {
  const err = new Error(message);
  err.local = true;
  return err;
}

/** Relit la carte (solde à jour) ; `null` si elle n'existe plus. */
export async function fetchGiftCard(id) {
  const rows = await api.entities.GiftCard.filter({ id }, null, 1);
  const list = Array.isArray(rows) ? rows : rows?.data || rows?.items || [];
  return list.find((c) => String(c.id) === String(id)) || null;
}

/** Recherche par code (scan d'une carte absente de la liste chargée). */
export async function fetchGiftCardByCode(code) {
  const rows = await api.entities.GiftCard.filter({ code }, null, 1);
  const list = Array.isArray(rows) ? rows : rows?.data || rows?.items || [];
  return list.find((c) => String(c.code || '').toUpperCase() === String(code).toUpperCase()) || null;
}

/**
 * Débite `amount` de la carte. Résout `{ card, transaction, viaServer }` :
 *  - `card` : la carte à jour (solde, statut) ;
 *  - `transaction` : `{ id, amount, balance_after, previous_balance, previous_status, local? }`,
 *    à repasser tel quel à `undoGiftCardDebit`.
 * Les erreurs sont lancées telles quelles (`friendlyGiftCardError` pour le message).
 */
export async function debitGiftCard(card, { amount, appointmentId = null, services = [], note = '', clientRef = null, correctPaid = false } = {}) {
  const value = round2(amount);
  if (!(value > 0)) throw localError('Montant invalide.');
  const body = { amount: value };
  if (appointmentId) body.appointment_id = appointmentId;
  // RDV déjà validé en CB / espèces que le client paie finalement par carte (tour 7) : la part carte
  // est rattachée sans rouvrir le RDV, le tableau de bord la retire du CB / espèces
  if (appointmentId && correctPaid) body.correct_paid = true;
  if (services.length) body.services = services;
  if (note) body.note = String(note).slice(0, 300);
  // Même référence pour un nouvel essai du même débit : le serveur renvoie le débit déjà fait
  if (clientRef) body.client_ref = clientRef;

  const data = await apiRequest('POST', apiUrl(`/gift-cards/${encodeURIComponent(card.id)}/debit`), body);
  const fresh = data?.card || null;
  const tx = data?.transaction || {};
  const balanceAfter = tx.balance_after != null ? round2(tx.balance_after) : giftCardBalance(fresh);
  return {
    card: fresh || { ...card, remaining_balance: balanceAfter, status: balanceAfter <= 0 ? 'used' : card.status },
    transaction: {
      ...tx,
      amount: tx.amount != null ? round2(tx.amount) : value,
      balance_after: balanceAfter,
      previous_balance: round2(balanceAfter + value),
      previous_status: 'validated',
    },
    replayed: !!data?.replayed,
    viaServer: true,
  };
}

/**
 * Annulation côté serveur. Résout la réponse entière : `card`, et selon le serveur `returned`
 * (montant réellement rendu) et `appointment` ({ closed, payment_method, … } du RDV rattaché).
 */
async function undoGiftCardDebitRaw(card, transaction) {
  if (!transaction || transaction.local || !transaction.id) throw localError('Ce débit ne peut pas être annulé ici.');
  return apiRequest(
    'POST',
    apiUrl(`/gift-cards/${encodeURIComponent(card.id)}/debit/${encodeURIComponent(transaction.id)}/undo`),
    {},
  );
}

/** Annule un débit (route serveur, 24 h au plus). Résout la carte à jour. */
export async function undoGiftCardDebit(card, transaction) {
  const data = await undoGiftCardDebitRaw(card, transaction);
  return data?.card || null;
}

/**
 * Rattache à un RDV un débit fait sans RDV (modes « Prestations » / « Montant libre ») : la part
 * carte est portée sur le RDV, qui ne sera plus encaissé une seconde fois en CB / espèces.
 */
export async function attachGiftCardDebit(card, transactionId, appointmentId, queryClient, { correctPaid = false } = {}) {
  const data = await apiRequest(
    'POST',
    apiUrl(`/gift-cards/${encodeURIComponent(card.id)}/debit/${encodeURIComponent(transactionId)}/attach`),
    { appointment_id: appointmentId, ...(correctPaid ? { correct_paid: true } : {}) },
  );
  if (queryClient) {
    invalidateGiftCardQueries(queryClient, card.id);
    queryClient.invalidateQueries({ queryKey: ['giftCardTodayAppointments'] });
    invalidateAppointmentQueries(queryClient);
  }
  return data;
}

// RDV des derniers jours encore à encaisser (rattachement d'un débit fait sans RDV)
export const giftCardRecentAppointmentsKey = (day) => ['giftCardTodayAppointments', 'recent', day];
export async function fetchRecentAppointmentsToCash(days = 7, today = parisToday()) {
  const [y, m, d] = today.split('-').map(Number);
  const keys = Array.from({ length: days }, (_, i) => new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
  const rows = await api.entities.Appointment.filter({ date: keys, status: 'confirmed' }, '-date', 300);
  return (Array.isArray(rows) ? rows : []).filter((a) => {
    if (a.payment_method) return false;
    if (appointmentGiftPaid(a) > 0 && appointmentDue(a) <= 0) return false;
    const name = String(a.client_name || '').trim();
    return !!(a.client_email || (name && name !== 'Last Minute'));
  });
}

// RDV des derniers jours déjà encaissés en CB / espèces (le client sort sa carte après coup, tour 7)
export const giftCardRecentPaidKey = (day) => ['giftCardTodayAppointments', 'paid', day];
export async function fetchRecentPaidAppointments(days = 7, today = parisToday()) {
  const [y, m, d] = today.split('-').map(Number);
  const keys = Array.from({ length: days }, (_, i) => new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
  const rows = await api.entities.Appointment.filter({ date: keys, status: 'completed' }, '-date', 300);
  return (Array.isArray(rows) ? rows : []).filter((a) => ['cb', 'especes'].includes(a.payment_method)
    && appointmentDue(a) > 0);
}

/**
 * Rend sur la carte une part débitée en trop pour un RDV (prix baissé, prestation retirée), à tout
 * moment, même après 24 h (tour 7). Résout { card, transaction, returned, appointment }.
 */
export async function creditGiftCard(card, { appointmentId, amount, note = '' }, queryClient) {
  const value = round2(amount);
  if (!(value > 0)) throw localError('Montant invalide.');
  const body = { appointment_id: appointmentId, amount: value };
  if (note) body.note = String(note).slice(0, 300);
  const data = await apiRequest('POST', apiUrl(`/gift-cards/${encodeURIComponent(card.id)}/credit`), body);
  if (queryClient) {
    invalidateGiftCardQueries(queryClient, card.id);
    if (data?.card) patchGiftCardCache(queryClient, data.card);
    queryClient.invalidateQueries({ queryKey: ['giftCardTodayAppointments'] });
    invalidateAppointmentQueries(queryClient);
  }
  return data;
}

/** Délai pendant lequel le serveur accepte l'annulation d'un débit. */
export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Ce débit de l'historique peut-il encore être annulé (moins de 24 h, pas déjà annulé, carte non annulée) ? */
export function canUndoTransaction(tx, card, now = Date.now()) {
  if (!tx || tx.kind !== 'debit' || tx.undone_at || !tx.id || tx.local) return false;
  if (card?.status === 'expired') return false;
  const created = Date.parse(tx.created_at);
  return Number.isFinite(created) && now - created < UNDO_WINDOW_MS;
}

/**
 * Historique des mouvements de la carte (plus récent en tête). `null` si la route n'existe pas
 * encore : la section n'est alors pas affichée.
 */
export async function fetchGiftCardTransactions(cardId) {
  try {
    const data = await apiRequest('GET', apiUrl(`/gift-cards/${encodeURIComponent(cardId)}/transactions`));
    const list = Array.isArray(data) ? data : data?.transactions || [];
    return [...list].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  } catch (err) {
    if (isMissingRoute(err)) return null;
    throw err;
  }
}

export const giftCardTransactionsKey = (cardId) => ['giftCardTransactions', String(cardId)];

const byNewest = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));

/**
 * Historique complet d'une carte pour l'admin : mouvements de solde et vie de la carte (rejet,
 * annulation, prolongation, depuis le 18 oct. 2026). `null` si la route n'existe pas.
 */
export async function fetchGiftCardHistory(cardId) {
  try {
    const data = await apiRequest('GET', apiUrl(`/gift-cards/${encodeURIComponent(cardId)}/transactions`));
    const transactions = Array.isArray(data) ? data : data?.transactions || [];
    const events = Array.isArray(data?.events) ? data.events : [];
    return { transactions: [...transactions].sort(byNewest), events: [...events].sort(byNewest) };
  } catch (err) {
    if (isMissingRoute(err)) return null;
    throw err;
  }
}

/**
 * Lignes de l'historique d'une carte, plus récente d'abord : commande, vente (validation),
 * mouvements (`tx` : la transaction d'origine, avec ses actions), rejet, annulation, prolongation.
 * Une carte annulée avant le 18 oct. 2026 n'a pas d'événement daté : ligne « date non notée » en tête.
 */
export function buildGiftCardTimeline(card, transactions = [], events = []) {
  if (!card) return [];
  const out = [];
  if (card.created_at) {
    out.push({ key: `created:${card.id}`, type: 'created', at: card.created_at, amount: Number(card.amount) || 0, who: card.sender_name || null });
  }
  if (card.validated_at) {
    out.push({
      key: `validated:${card.id}`, type: 'validated', at: card.validated_at, amount: Number(card.amount) || 0,
      who: card.validated_by || null, payment_method: card.payment_method || null,
    });
  }
  for (const tx of transactions) {
    out.push({ key: `tx:${tx.id}`, type: tx.kind, at: tx.created_at, amount: Number(tx.amount) || 0, who: tx.staff_name || tx.staff_email || null, tx });
  }
  for (const ev of events) {
    out.push({
      key: `ev:${ev.id}`, type: ev.kind, at: ev.created_at, amount: ev.amount == null ? null : Number(ev.amount),
      who: ev.staff_name || null, detail: ev.detail || null,
    });
  }
  out.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  if (card.status === 'expired' && !events.some((e) => e.kind === 'cancelled' || e.kind === 'rejected')) {
    out.unshift({ key: `end:${card.id}`, type: card.validated_at ? 'cancelled' : 'rejected', at: null, amount: null, who: null });
  }
  return out;
}

// ─── Journal de toutes les cartes (Admin → Cartes cadeau → Historique) ───
export const giftCardJournalKey = ['giftCardJournal'];

/** Une page du journal : `{ entries, has_more }` ; `null` si la route n'existe pas encore. */
export async function fetchGiftCardJournal({ before = null, limit = 100 } = {}) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (before) qs.set('before', before);
  try {
    const data = await apiRequest('GET', apiUrl(`/gift-cards/journal?${qs}`));
    return { entries: Array.isArray(data?.entries) ? data.entries : [], has_more: !!data?.has_more };
  } catch (err) {
    if (isMissingRoute(err)) return null;
    throw err;
  }
}

// ─── Suppression définitive ───
/**
 * Ce que la suppression effacerait : `{ card, transactions, events, sale, appointments }`.
 * `null` si le serveur ne connaît pas encore la route.
 */
export async function fetchGiftCardDeletionPreview(cardId) {
  try {
    return await apiRequest('GET', apiUrl(`/gift-cards/${encodeURIComponent(cardId)}/deletion`));
  } catch (err) {
    if (isMissingRoute(err)) return null;
    throw err;
  }
}

/**
 * Supprime la carte, ses mouvements et son historique (part carte retirée des RDV, RDV clôturé par
 * elle rouvert). `expect` = nombre de mouvements vus dans l'aperçu : 409 `changed` s'il a bougé.
 */
export async function deleteGiftCardForever(cardId, expect, queryClient) {
  const qs = expect == null ? '' : `?expect=${encodeURIComponent(String(expect))}`;
  const data = await apiRequest('DELETE', apiUrl(`/gift-cards/${encodeURIComponent(cardId)}${qs}`));
  if (queryClient) {
    queryClient.setQueryData(['adminGiftCards'], (list) =>
      Array.isArray(list) ? list.filter((c) => String(c.id) !== String(cardId)) : list);
    invalidateGiftCardQueries(queryClient, cardId);
    if (data?.appointments?.length) {
      invalidateAppointmentQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['giftCardTodayAppointments'] });
    }
  }
  return data;
}

/** Après un débit / une annulation : listes de cartes, tableau de bord, activité, historique. */
export function invalidateGiftCardQueries(queryClient, cardId) {
  for (const queryKey of [['adminGiftCards'], ['dashboard', 'giftCards'], ['adminActivity'], ['giftCards'], giftCardJournalKey]) {
    queryClient.invalidateQueries({ queryKey });
  }
  if (cardId != null) queryClient.invalidateQueries({ queryKey: giftCardTransactionsKey(cardId) });
}

/** Met la carte à jour tout de suite dans la liste admin (avant le rechargement). */
export function patchGiftCardCache(queryClient, card) {
  if (!card?.id) return;
  queryClient.setQueryData(['adminGiftCards'], (list) =>
    Array.isArray(list) ? list.map((c) => (String(c.id) === String(card.id) ? { ...c, ...card } : c)) : list,
  );
}

// ─── Rendez-vous du jour ───

export const giftCardTodayAppointmentsKey = (day) => ['giftCardTodayAppointments', day];

/** RDV du jour (Paris) confirmés, sans moyen de paiement, avec un client : à encaisser. */
export async function fetchTodayAppointmentsToCash(day = parisToday()) {
  const rows = await api.entities.Appointment.filter({ date: day, status: 'confirmed' }, 'start_time', 200);
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((a) => {
    if (a.payment_method) return false;
    // Déjà entièrement réglé par carte(s) cadeau (clôture échouée après le débit) : plus rien à débiter
    if (appointmentGiftPaid(a) > 0 && appointmentDue(a) <= 0) return false;
    const name = String(a.client_name || '').trim();
    return !!(a.client_email || (name && name !== 'Last Minute'));
  });
}

/** Prix encaissé d'un RDV : prestations (+ produit vendu pendant le RDV s'il y en a un). */
export function appointmentPrice(apt) {
  return round2((Number(apt?.total_price) || 0) + (Number(apt?.product_price) || 0));
}

/** Part du RDV déjà payée par carte cadeau (débits au comptoir, `gift_card_amount`). */
export const appointmentGiftPaid = (apt) => round2(Number(apt?.gift_card_amount) || 0);

/**
 * Reste dû sur un RDV : prix moins la part déjà payée par carte. C'est ce qu'un nouveau débit peut
 * couvrir (le serveur refuse au-delà) ; `appointmentPrice` reste le CA (grand_total à la clôture).
 */
export function appointmentDue(apt) {
  return round2(Math.max(0, appointmentPrice(apt) - appointmentGiftPaid(apt)));
}

const toMinutes = (t) => {
  const [h = 0, m = 0] = String(t || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Minutes écoulées depuis minuit à Paris. */
export function parisMinutesNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return get('hour') * 60 + get('minute');
}

/** Id du RDV le plus proche de maintenant (en cours, sinon début ou fin la plus proche). */
export function closestAppointmentId(appointments, nowMinutes = parisMinutesNow()) {
  let best = null;
  let bestDistance = Infinity;
  for (const a of appointments) {
    const start = toMinutes(a.start_time);
    const end = a.end_time ? toMinutes(a.end_time) : start + 30;
    const distance = nowMinutes >= start && nowMinutes <= end ? 0 : Math.min(Math.abs(nowMinutes - start), Math.abs(nowMinutes - end));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = a.id;
    }
  }
  return best;
}

/** Prestations d'un RDV en texte (« Coupe + Barbe »). */
export function appointmentServicesLabel(apt) {
  const list = Array.isArray(apt?.services) ? apt.services : [];
  return list.map((s) => s?.name).filter(Boolean).join(' + ');
}

/** Repère posé dans la note interne du RDV payé par carte cadeau. */
export function giftCardNoteTag(code, amount) {
  return `[Carte cadeau ${code} : ${formatEuro(amount)}]`;
}

/**
 * Clôture d'un RDV entièrement payé par la carte, avec les champs de « Valider la prestation »
 * (AppointmentDetailModal) : moyen de paiement `carte_cadeau`, sans pourboire. La note interne
 * existante est conservée, le repère de la carte ajouté à la suite. Résout les valeurs d'avant
 * (pour l'annulation).
 */
export async function closeAppointmentWithGiftCard(apt, card, amount, queryClient) {
  const previous = {
    id: apt.id,
    status: apt.status,
    payment_method: apt.payment_method ?? null,
    payment_status: apt.payment_status ?? null,
    tip: apt.tip ?? 0,
    tip_method: apt.tip_method ?? '',
    product_sold: apt.product_sold ?? '',
    product_price: apt.product_price ?? 0,
    grand_total: apt.grand_total ?? null,
    internal_notes: apt.internal_notes ?? '',
  };
  const notes = String(apt.internal_notes || '').trim();
  const tag = giftCardNoteTag(card.code, amount);
  await api.entities.Appointment.update(apt.id, {
    payment_method: 'carte_cadeau',
    payment_status: 'paid',
    status: 'completed',
    tip: 0,
    tip_method: '',
    product_sold: apt.product_sold || '',
    product_price: Number(apt.product_price) || 0,
    grand_total: appointmentPrice(apt),
    internal_notes: notes ? `${notes} ${tag}` : tag,
  });
  if (queryClient) invalidateAppointmentQueries(queryClient);
  return previous;
}

/** Relit un RDV (compte de l'équipe : `gift_card_amount` compris) ; `null` s'il n'existe plus. */
export async function fetchAppointmentById(id) {
  const rows = await api.entities.Appointment.filter({ id }, null, 1);
  return (Array.isArray(rows) ? rows : []).find((a) => String(a.id) === String(id)) || null;
}

/** Remet un RDV clôturé par la carte dans son état d'avant (annulation du débit). */
export async function reopenAppointment(previous, queryClient) {
  const { id, ...fields } = previous;
  await api.entities.Appointment.update(id, fields);
  if (queryClient) invalidateAppointmentQueries(queryClient);
}

/**
 * Annulation d'un débit depuis l'historique (état d'avant inconnu) : le RDV n'est rouvert que s'il
 * a bien été clôturé par ce débit (payé par carte cadeau, repère exact de la carte et du montant
 * dans la note interne). Résout l'état : 'reopened' (rouvert), 'missing' (introuvable), 'open'
 * (pas encaissé : débit partiel normal), ou { state: 'closed_other', apt } (encaissé autrement :
 * CB, espèces, ou clôturé par une autre carte) : l'argent rendu reste alors à encaisser.
 */
export async function reopenAppointmentAfterUndo(appointmentId, card, amount, queryClient) {
  const rows = await api.entities.Appointment.filter({ id: appointmentId }, null, 1);
  const apt = (Array.isArray(rows) ? rows : []).find((a) => String(a.id) === String(appointmentId));
  if (!apt) return 'missing';
  const tag = giftCardNoteTag(card.code, amount);
  const notes = String(apt.internal_notes || '');
  const cashed = !!apt.payment_method || apt.status === 'completed' || apt.payment_status === 'paid';
  if (!cashed) return 'open';
  const hasTag = notes.includes(tag);
  // Clôture « Carte cadeau » faite dans l'agenda (giftCovered) : pas de repère, mais la part carte
  // relue (déjà diminuée par le serveur) ne couvre plus le prix : c'était bien ce débit, on rouvre.
  // Clôturé par une autre carte : son débit garde la part au niveau du prix → « closed_other ».
  const giftLeft = Math.round((Number(apt.gift_card_amount) || 0) * 100);
  const uncovered = apt.payment_method === 'carte_cadeau' && giftLeft < Math.round(appointmentPrice(apt) * 100);
  if (apt.payment_method !== 'carte_cadeau' || (!hasTag && !uncovered)) return { state: 'closed_other', apt };
  await api.entities.Appointment.update(apt.id, {
    status: 'confirmed',
    payment_method: null,
    payment_status: null,
    grand_total: null,
    internal_notes: hasTag ? notes.replace(tag, '').replace(/\s{2,}/g, ' ').trim() : notes,
  });
  if (queryClient) invalidateAppointmentQueries(queryClient);
  return 'reopened';
}

const PAYMENT_LABEL = { cb: 'en CB', especes: 'en espèces', carte_cadeau: 'par une autre carte cadeau' };

/**
 * Annule un débit et remet tout d'aplomb : solde (serveur), RDV clôturé par ce débit rouvert,
 * listes et historique rechargés, toasts. Partagé par l'écran de succès et l'historique.
 * `previousApt` : état exact du RDV avant clôture (écran de succès), sinon `null`.
 * Résout vrai si l'annulation a réussi.
 */
export async function runGiftCardUndo({ card, transaction, previousApt = null, queryClient, onCardChange }) {
  let data;
  let alreadyUndone = false;
  try {
    data = await undoGiftCardDebitRaw(card, transaction);
  } catch (err) {
    if (err?.status === 409 && err?.data?.code === 'already_undone') {
      // Déjà annulé (première réponse perdue : réseau coupé) : le serveur a rendu le solde, mais
      // le RDV n'a jamais été rouvert. On relit la carte et on finit le travail ci-dessous.
      alreadyUndone = true;
      let fresh = null;
      try { fresh = await fetchGiftCard(card.id); } catch { /* relecture au mieux */ }
      data = { card: fresh, returned: transaction?.amount };
    } else {
      const noAnswer = isNetworkError(err) || (!err?.status && err?.name === 'TypeError');
      if (noAnswer) {
        // Pas de réponse : l'annulation est peut-être passée. On relit la carte ET l'historique ;
        // si ce débit y est marqué annulé, le serveur a bien tout fait (solde rendu, part carte du
        // RDV remise à 0) : on finit le travail ci-dessous (réouverture vérifiée du RDV), sinon le
        // bouton « Annuler ce débit » disparaît de l'historique et le RDV resterait « payé carte ».
        let fresh = null;
        try { fresh = await fetchGiftCard(card.id); } catch { /* relecture au mieux */ }
        let list = null;
        try { list = await fetchGiftCardTransactions(card.id); } catch { /* relecture au mieux */ }
        const done = Array.isArray(list) ? list.find((t) => String(t.id) === String(transaction?.id)) : null;
        if (done?.undone_at) {
          alreadyUndone = true;
          const undoRow = list.find((t) => t.kind === 'undo' && String(t.reverses_id) === String(transaction?.id));
          data = { card: fresh, returned: undoRow?.amount ?? transaction?.amount };
        } else {
          toast.error("Impossible d'annuler le débit", { description: UNDO_NETWORK_MESSAGE, duration: 12000 });
          // Jamais « réessayez » : solde et historique relus
          if (fresh) {
            patchGiftCardCache(queryClient, fresh);
            onCardChange?.(fresh);
          }
          queryClient.invalidateQueries({ queryKey: giftCardTransactionsKey(card.id) });
          return false;
        }
      } else {
        toast.error("Impossible d'annuler le débit", { description: friendlyGiftCardError(err) });
        return false;
      }
    }
  }
  try {
    const fresh = data?.card || null;
    // Montant réellement rendu (plafonné au montant initial de la carte)
    const returned = data?.returned != null ? round2(data.returned)
      : (fresh ? round2(giftCardBalance(fresh) - giftCardBalance(card)) : round2(transaction?.amount));
    let reopenFailed = false;
    let closedOther = null;
    try {
      // Après « déjà annulé », jamais l'état d'avant écrit à l'aveugle (une correction faite
      // entre-temps serait écrasée) : la réouverture vérifie le repère / la part carte du RDV
      if (previousApt && !alreadyUndone) await reopenAppointment(previousApt, queryClient);
      else if (transaction?.appointment_id) {
        const state = await reopenAppointmentAfterUndo(transaction.appointment_id, card, transaction.amount, queryClient);
        if (state && typeof state === 'object' && state.state === 'closed_other') closedOther = state.apt;
        else if (state !== 'reopened') reopenFailed = 'skip';
      }
    } catch {
      reopenFailed = true;
    }
    // La part carte du RDV a changé côté serveur : la fiche agenda doit relire le reste à encaisser
    if (transaction?.appointment_id) invalidateAppointmentQueries(queryClient);
    if (fresh) {
      patchGiftCardCache(queryClient, fresh);
      onCardChange?.(fresh);
    }
    invalidateGiftCardQueries(queryClient, card.id);
    queryClient.invalidateQueries({ queryKey: giftCardTodayAppointmentsKey(parisToday()) });
    if (alreadyUndone) {
      toast.success('Débit déjà annulé : solde et RDV remis à jour', { description: fresh ? `Solde : ${formatEuro(giftCardBalance(fresh))}` : undefined });
    } else {
      toast.success('Débit annulé', { description: fresh ? `Solde remis à ${formatEuro(giftCardBalance(fresh))}` : undefined });
    }
    if (reopenFailed === true) {
      toast.warning('Solde remis, mais le RDV n\'a pas pu être rouvert : corrigez son encaissement dans l\'agenda (« Corriger l\'encaissement »).', { duration: 10000 });
    } else if (closedOther) {
      // RDV déjà encaissé autrement : ces euros ne sont plus payés par rien
      const apt = closedOther;
      const day = String(apt.date || '').slice(0, 10);
      toast.warning(
        `${formatEuro(returned)} rendus sur la carte, mais le RDV de ${apt.client_name || 'ce client'}${apt.start_time ? ` (${String(apt.start_time).slice(0, 5)})` : ''} reste encaissé ${PAYMENT_LABEL[apt.payment_method] || ''} : ces ${formatEuro(returned)} restent à encaisser. Corrigez son encaissement dans l'agenda (« Corriger l'encaissement »).`.replace(/\s+:/, ' :'),
        {
          duration: Infinity,
          closeButton: true,
          ...(day ? { action: { label: 'Ouvrir l\'agenda', onClick: () => window.location.assign(`/admin/agenda?view=day&date=${day}`) } } : {}),
        },
      );
    }
    return true;
  } catch {
    // L'annulation est faite côté serveur : seule la mise à jour de l'affichage a échoué
    toast.warning('Débit annulé, mais l\'affichage n\'a pas pu être mis à jour : rechargez la page.');
    return true;
  }
}
