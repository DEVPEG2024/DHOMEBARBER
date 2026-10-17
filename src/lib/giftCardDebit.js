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
 * Tant que ces routes n'existent pas (404 / 405 sans code d'erreur métier, « Cannot POST »), repli
 * sur l'entité générique `GiftCard.update` comme avant, mais en relisant la carte juste avant pour
 * partir du solde réel. Le repli n'a pas d'historique : la section « Historique » n'apparaît pas.
 */
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

/** « 17 oct. 2026 » pour une date `YYYY-MM-DD` (ou un horodatage), lue comme un jour du calendrier. */
export function formatDay(value) {
  if (!value) return '';
  const day = String(value).slice(0, 10);
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d, 12).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
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

/** Erreur « métier » produite côté client (repli), message prêt à afficher. */
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
export async function debitGiftCard(card, { amount, appointmentId = null, services = [], note = '' } = {}) {
  const value = round2(amount);
  if (!(value > 0)) throw localError('Montant invalide.');
  const body = { amount: value };
  if (appointmentId) body.appointment_id = appointmentId;
  if (services.length) body.services = services;
  if (note) body.note = String(note).slice(0, 300);

  try {
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
      viaServer: true,
    };
  } catch (err) {
    if (!isMissingRoute(err)) throw err;
  }

  // Repli sans route serveur : solde relu juste avant, puis mise à jour de l'entité.
  const current = await fetchGiftCard(card.id);
  if (!current) throw localError('Carte introuvable : elle a peut-être été supprimée.');
  const state = giftCardState(current);
  if (state === 'pending') throw localError('Cette carte doit d’abord être validée (paiement reçu).');
  if (state === 'used') throw localError('Cette carte est déjà entièrement utilisée.');
  if (state === 'expired') throw localError('Cette carte est annulée ou expirée.');
  if (state === 'outdated') throw localError('La date de validité de cette carte est dépassée.');
  if (state !== 'debitable') throw localError('Cette carte ne peut pas être débitée.');
  const balance = giftCardBalance(current);
  if (value > balance) throw localError(`Solde insuffisant : il reste ${formatEuro(balance)} sur la carte.`);

  const newBalance = round2(balance - value);
  const updates = { remaining_balance: newBalance };
  if (newBalance <= 0) {
    updates.status = 'used';
    updates.used_at = new Date().toISOString();
  }
  const saved = await api.entities.GiftCard.update(current.id, updates);
  return {
    card: { ...current, ...(saved && typeof saved === 'object' ? saved : {}), ...updates },
    transaction: {
      id: `local-${Date.now()}`,
      local: true,
      kind: 'debit',
      amount: value,
      balance_after: newBalance,
      previous_balance: balance,
      previous_status: current.status,
    },
    viaServer: false,
  };
}

/**
 * Annule un débit : route serveur, sinon remise du montant sur le solde relu (plafonné au montant
 * initial), statut `validated`, `used_at` à zéro. Résout la carte à jour.
 */
export async function undoGiftCardDebit(card, transaction) {
  if (transaction && !transaction.local && transaction.id) {
    try {
      const data = await apiRequest(
        'POST',
        apiUrl(`/gift-cards/${encodeURIComponent(card.id)}/debit/${encodeURIComponent(transaction.id)}/undo`),
        {},
      );
      return data?.card || null;
    } catch (err) {
      if (!isMissingRoute(err)) throw err;
    }
  }
  const current = await fetchGiftCard(card.id);
  if (!current) throw localError('Carte introuvable : elle a peut-être été supprimée.');
  const restored = round2(Math.min(giftCardBalance(current) + round2(transaction?.amount), Number(current.amount) || Infinity));
  const updates = { remaining_balance: restored, status: 'validated', used_at: null };
  const saved = await api.entities.GiftCard.update(current.id, updates);
  return { ...current, ...(saved && typeof saved === 'object' ? saved : {}), ...updates };
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

/** Après un débit / une annulation : listes de cartes, tableau de bord, activité, historique. */
export function invalidateGiftCardQueries(queryClient, cardId) {
  for (const queryKey of [['adminGiftCards'], ['dashboard', 'giftCards'], ['adminActivity'], ['giftCards']]) {
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
    const name = String(a.client_name || '').trim();
    return !!(a.client_email || (name && name !== 'Last Minute'));
  });
}

/** Prix encaissé d'un RDV : prestations (+ produit vendu pendant le RDV s'il y en a un). */
export function appointmentPrice(apt) {
  return round2((Number(apt?.total_price) || 0) + (Number(apt?.product_price) || 0));
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

/** Remet un RDV clôturé par la carte dans son état d'avant (annulation du débit). */
export async function reopenAppointment(previous, queryClient) {
  const { id, ...fields } = previous;
  await api.entities.Appointment.update(id, fields);
  if (queryClient) invalidateAppointmentQueries(queryClient);
}
