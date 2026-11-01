/**
 * Tableau de bord de l'admin : tous les calculs, en fonctions pures (aucun React, aucune requête).
 * La page et ses blocs ne font qu'afficher ce que rendent `computeDashboard`, `buildUpcoming` et
 * `computeFill` : une règle de comptage ne vit qu'ici.
 *
 * Règles (refonte du 1er nov. 2026, décisions du propriétaire) :
 *  - « Encaissé » = `payment_status = 'paid'` ou `status = 'completed'` ;
 *  - CA = prestations + produit vendu, **hors pourboire et hors part payée par carte cadeau**, partout
 *    (cette part est comptée à la vente de la carte) ; la part carte est rendue à côté (`gift`) ;
 *  - CB / espèces toujours par `paymentSplitOf` (« CB + Espèces » compris) ;
 *  - jour et heure de Paris, quel que soit le fuseau de l'appareil ;
 *  - un déplacement fait par le client n'est ni une annulation ni un RDV de plus.
 */
import { revenueOf, round2, giftPartOf, paymentSplitOf } from '@/lib/revenue';
import {
  needsClosing, isCancelledLike, isConvertedLastMinute, isUnclaimedLastMinute, isClientPlaceholder, isFreeLastMinute,
} from '@/components/agenda/agendaUtils';
import { isRescheduledCancel, cancellationActor } from '@/lib/cancellation';
import { workingHoursOf, isOnLeave, privateWindow } from '@/lib/slots';
import { parisInstant } from '@/lib/calendarLinks';

// ─── Calculs purs : bloc lu tel quel par dhomebarber-api/test/test-t7-3-dashboard.js ───
// <calculs-purs>
const PAYMENT_LABELS = { cb: 'CB', especes: 'Espèces', mixte: 'CB + Espèces', carte_cadeau: 'Carte cadeau' };

// Last Minute publié : encore libre, pris par un client (repère « [last_minute] » dans la note
// interne) ou que personne n'a pris. Un Last Minute déplacé par le client reste compté une fois :
// le serveur laisse le repère sur l'ancienne ligne (annulée « Client : déplacé au … ») et ne le
// recopie pas sur le nouveau RDV.
const isPublishedLastMinute = (a) =>
  a.status === 'last_minute' || isConvertedLastMinute(a) || isUnclaimedLastMinute(a);
// « Converti » : pris par un client et pas annulé depuis. Un déplacement fait par le client reste une
// conversion (il vient à un autre horaire) : l'ancienne ligne est la seule à porter le repère.
const isCountedConversion = (a) =>
  isConvertedLastMinute(a) && (!isCancelledLike(a) || isRescheduledCancel(a));

// Encaissement d'une conversion Last Minute (« CA Last Minute ») : la ligne elle-même ou, déplacée par
// le client, le RDV d'arrivée (`rescheduled_to`, posé par le serveur depuis le tour 8 du 18 oct. 2026),
// déplacements successifs compris. Un RDV d'arrivée qui porte lui-même le repère est une conversion à
// part, comptée pour elle-même. Anciennes lignes sans lien, ou RDV d'arrivée hors période : 0.
// `valueOf` : montant d'une ligne encaissée (le tableau de bord passe le CA hors part carte cadeau).
const MAX_MOVE_HOPS = 5;
function lastMinuteRevenueOf(conversion, byId, isPaid, valueOf = revenueOf) {
  let row = conversion;
  for (let hop = 0; hop < MAX_MOVE_HOPS && isRescheduledCancel(row) && row.rescheduled_to; hop++) {
    const next = byId.get(String(row.rescheduled_to));
    if (!next || next === conversion || isConvertedLastMinute(next)) return 0;
    row = next;
  }
  return isPaid(row) ? valueOf(row) : 0;
}

/**
 * Lignes de l'export comptable d'un RDV encaissé (prestations, puis produit vendu), **hors part payée
 * par carte cadeau** : cette part a été comptée à la vente de la carte, comme au tableau de bord. Un
 * RDV réglé en entier par carte cadeau ne sort donc pas. Débit partiel : chaque montant est réduit au
 * prorata, le total du RDV vaut la part hors carte au centime près, et le moyen de paiement affiché
 * porte « (hors carte cadeau) ». Sans carte cadeau : montants inchangés.
 */
function comptableLines(apt) {
  const rev = revenueOf(apt);
  const gift = giftPartOf(apt);
  const outside = round2(rev - gift);
  if (outside <= 0) return [];
  // Même règle que sumBy : le reste d'un RDV « Carte cadeau » est « non renseigné »
  const method = apt.payment_method === 'carte_cadeau' ? '' : (PAYMENT_LABELS[apt.payment_method] || '');
  const paiement = gift > 0 && method ? `${method} (hors carte cadeau)` : method;

  const lines = [];
  if (apt.services?.length > 0) {
    for (const svc of apt.services) {
      lines.push({ type: 'Prestation', designation: svc.name || 'Prestation', price: Number(svc.price) || 0 });
    }
  } else {
    lines.push({ type: 'Prestation', designation: 'Prestation', price: Number(apt.total_price) || 0 });
  }
  if (apt.product_sold && apt.product_price > 0) {
    lines.push({ type: 'Produit', designation: apt.product_sold, price: Number(apt.product_price) || 0 });
  }

  if (gift > 0 && rev > 0) {
    const ratio = outside / rev;
    let left = outside;
    const positive = lines.filter(l => l.price > 0);
    for (const l of positive) {
      l.price = round2(Math.min(round2(l.price * ratio), left));
      left = round2(left - l.price);
    }
    // Reste d'arrondi (un centime par ligne au plus) : porté par la dernière ligne
    const last = positive[positive.length - 1];
    if (last && left > 0 && left <= 0.01 * positive.length + 1e-9) last.price = round2(last.price + left);
  }
  return lines.filter(l => l.price > 0).map(l => ({ ...l, paiement }));
}

/** Lignes de l'export jusqu'au montant cible, dans l'ordre des RDV reçus ; `total` en nombre. */
function comptableRows(appts, target) {
  const rows = [];
  let remaining = target;
  let total = 0;
  for (const apt of appts) {
    if (remaining <= 0) break;
    for (const line of comptableLines(apt)) {
      if (remaining <= 0) break;
      const amount = Math.min(line.price, remaining);
      if (amount > 0) {
        rows.push({ apt, ...line, amount });
        remaining -= amount;
        total += amount;
      }
    }
  }
  return { rows, total };
}
// </calculs-purs>

export { PAYMENT_LABELS, isPublishedLastMinute, isCountedConversion, lastMinuteRevenueOf, comptableLines, comptableRows };

// Plafond du serveur pour une lecture de rendez-vous (`fetchAppointmentsForDates`, routes/entities.js)
export const APPOINTMENTS_LIMIT = 2000;
// Note posée par le serveur sur un Last Minute automatique (lib/lastMinuteAuto.js, AUTO_NOTE), gardée
// quand un client le reprend
export const AUTO_LAST_MINUTE_NOTE = 'Créneau libre publié automatiquement';

// ─── Jour et heure de Paris ───────────────────────────────────────────

const PARIS_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const pad = (n) => String(n).padStart(2, '0');

/** `{ nowMs, today: 'yyyy-MM-dd', hhmm: 'HH:mm', monthKey: 'yyyy-MM' }` à Paris pour l'instant `nowMs`. */
export function parisClock(nowMs = Date.now()) {
  const parts = {};
  for (const p of PARIS_PARTS.formatToParts(new Date(nowMs))) parts[p.type] = p.value;
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  return { nowMs, today, hhmm: `${hour}:${parts.minute}`, monthKey: today.slice(0, 7) };
}

// Calcul de jours sur des clés `yyyy-MM-dd` (dates UTC à minuit : aucun changement d'heure)
const keyOfUtc = (t) => `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
const utcOf = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
};
export const addDaysKey = (key, n) => {
  const t = utcOf(key);
  t.setUTCDate(t.getUTCDate() + n);
  return keyOfUtc(t);
};
export const prevMonthKey = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return keyOfUtc(new Date(Date.UTC(y, m - 2, 1))).slice(0, 7);
};
export const daysInMonth = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
/** Tous les jours d'un mois `yyyy-MM`. */
export const monthDays = (monthKey) => Array.from({ length: daysInMonth(monthKey) }, (_, i) => `${monthKey}-${pad(i + 1)}`);
/** Date à midi heure de l'appareil du jour `key` : `format(date, 'EEEE')` donne le bon jour de la semaine. */
export const noonOf = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
const timeToMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// ─── Règles ───────────────────────────────────────────────────────────

const dateOf = (a) => String(a?.date || '').slice(0, 10);
const startOf = (a) => String(a?.start_time || '').slice(0, 5);

/** Encaissé (même règle que l'agenda et l'export) : réglé ou validé par le barber. */
export const isPaid = (a) => a.payment_status === 'paid' || a.status === 'completed';
/**
 * Vrai rendez-vous : ni pause, ni Last Minute encore libre ou que personne n'a pris, ni fiche créée
 * par Clients → Ajouter / Importer (faux RDV annulé à 0 €, 09:00 → 09:00).
 */
export const isRealAppt = (a) => a.status !== 'break' && a.status !== 'last_minute' && !isUnclaimedLastMinute(a) && !isClientPlaceholder(a);
/** CA d'un RDV hors part déjà payée par carte cadeau (ce qui reste à encaisser, ou ce qui l'a été). */
export const outsideGift = (a) => round2(revenueOf(a) - giftPartOf(a));
/** Terminé (heure de fin passée à Paris), confirmé, pas encaissé : « à clôturer » (pastille € de l'agenda). */
export const isToClose = (a, now = Date.now()) => a.status === 'confirmed' && !isPaid(a) && needsClosing(a, now);
/** Confirmé, pas encaissé, pas encore terminé : CA à venir. */
export const isUpcomingDue = (a, now = Date.now()) => a.status === 'confirmed' && !isPaid(a) && !needsClosing(a, now);
/** Validé par le barber (`completed`, compté encaissé) mais sans moyen de paiement noté. */
export const isMissingMethod = (a, now = Date.now()) => a.status === 'completed' && needsClosing(a, now);
/** Annulation par le client (ni déplacement, ni annulation du salon ou du système ; sans auteur connu : comptée). */
export const isClientCancel = (a) => a.status === 'cancelled' && !isRescheduledCancel(a)
  && cancellationActor(a) !== 'staff' && cancellationActor(a) !== 'system';

/**
 * Jour d'encaissement (Paris) : `paid_at` posé par le serveur (`features.paidAt`, 1er nov. 2026),
 * sinon le jour du RDV (anciennes lignes, serveur plus ancien).
 */
export function paidDayOf(a) {
  if (a.paid_at) {
    const t = Date.parse(a.paid_at);
    if (Number.isFinite(t)) return parisClock(t).today;
  }
  return dateOf(a);
}

/** Moyen de paiement lisible d'un RDV encaissé (« CB », « CB + Espèces »…), '' si non noté. */
export const paymentLabelOf = (a) => PAYMENT_LABELS[a.payment_method] || '';

const sumOf = (list, fn) => round2(list.reduce((s, a) => s + (Number(fn(a)) || 0), 0));

/**
 * Argent d'une liste de RDV encaissés : CA hors carte (`revenue` = `cb + especes + autre`), part carte
 * cadeau (`gift`), dont produits vendus en RDV (`products`), pourboires par moyen, nombre et panier
 * moyen (hors carte, comme Statistiques).
 */
export function moneyOf(list) {
  let cb = 0; let especes = 0; let autre = 0;
  for (const a of list) {
    const s = paymentSplitOf(a);
    cb += s.cb; especes += s.especes; autre += s.autre;
  }
  const revenue = sumOf(list, outsideGift);
  const tips = sumOf(list, (a) => a.tip);
  const tipsCB = sumOf(list.filter((a) => a.tip_method === 'cb'), (a) => a.tip);
  const tipsCash = sumOf(list.filter((a) => a.tip_method === 'especes'), (a) => a.tip);
  return {
    revenue,
    gift: sumOf(list, giftPartOf),
    cb: round2(cb), especes: round2(especes), autre: round2(autre),
    // Produits vendus en RDV, hors part carte cadeau (au prorata) : jamais plus que le total
    products: sumOf(list, (a) => {
      const rev = revenueOf(a);
      return rev > 0 ? (Number(a.product_price) || 0) * (outsideGift(a) / rev) : 0;
    }),
    tips, tipsCB, tipsCash, tipsOther: round2(tips - tipsCB - tipsCash),
    count: list.length,
    avg: list.length ? round2(revenue / list.length) : 0,
  };
}

/** Lignes sans doublon (un même RDV lu par deux requêtes : mois en cours et jours suivants). */
function uniqueRows(rows) {
  const seen = new Map();
  for (const a of rows || []) if (a && a.id != null && !seen.has(String(a.id))) seen.set(String(a.id), a);
  return [...seen.values()];
}

/**
 * Statut d'un RDV du jour pour la liste : `upcoming` (à venir), `in_progress` (en cours), `to_close`
 * (terminé, pas encaissé), `paid` (encaissé), `pending`, `no_show` (absent), `cancelled`.
 */
export function dayStatusOf(a, nowMs) {
  if (a.status === 'cancelled') return 'cancelled';
  if (a.status === 'no_show') return 'no_show';
  if (isPaid(a)) return 'paid';
  if (a.status === 'pending') return 'pending';
  if (needsClosing(a, nowMs)) return 'to_close';
  const { hhmm } = parisClock(nowMs);
  if (a.status === 'confirmed' && startOf(a) && startOf(a) <= hhmm) return 'in_progress';
  return 'upcoming';
}

// ─── Tableau de bord ──────────────────────────────────────────────────

/**
 * Tous les chiffres du tableau de bord à l'instant `nowMs` (Paris).
 *
 * @param {object} p
 * @param {Array} p.rows       RDV lus : mois précédent, mois en cours et jours suivants (pauses comprises)
 * @param {number} p.nowMs
 * @param {Array} [p.employees] barbers actifs (`id`, `name`, `color`, `is_hidden`)
 * @returns {{
 *   clock: { today: string, hhmm: string, monthKey: string, prevMonthKey: string, yesterday: string },
 *   today: { money: object, active: number, toClose: { count: number, amount: number }, upcoming: { count: number, amount: number },
 *            noShow: number, cancelled: number, clientCancels: number, pending: number, trend: number|null, yesterdaySoFar: number },
 *   todayList: Array<{ id, kind: 'rdv'|'break', start, end, employeeId, employeeName, color, clientName, guestName, services: string,
 *                      amount: number, status: string, paymentLabel: string }>,
 *   next: object|null,
 *   month: { money: object, toClose: { count, amount }, upcoming: { count, amount }, noShows: number, clientCancels: number },
 *   prevMonth: { revenueSameDay: number, revenueTotal: number, cutoffDay: string, count: number },
 *   cash: { money: object, paidAt: boolean, earlier: { count: number, amount: number } },
 *   week: Array<{ key, cb, especes, autre, gift, revenue, count, isToday }>,
 *   toClose: { count, amount, oldest: string|null, today: number, earlier: number, missingMethod: { count, amount, oldest } },
 *   barbers: { month: Array, today: Array, cash: Array },
 *   lastMinute: { team: { published, taken, revenue }, auto: { published, taken, revenue }, freeToday: number },
 *   absences: { list: Array, lost: number },
 * }}
 */
export function computeDashboard({ rows, nowMs, employees = [] }) {
  const clock = parisClock(nowMs);
  const { today, hhmm, monthKey } = clock;
  const prevKey = prevMonthKey(monthKey);
  const yesterday = addDaysKey(today, -1);
  const all = uniqueRows(rows);
  const real = all.filter(isRealAppt);
  const paid = real.filter(isPaid);
  const inMonth = (a, key) => dateOf(a).startsWith(key);
  const empById = new Map((employees || []).map((e) => [String(e.id), e]));
  const nameOf = (a) => empById.get(String(a.employee_id))?.name || a.employee_name || 'Sans barber';
  const colorOf = (a) => empById.get(String(a.employee_id))?.color || '#3fcf8e';

  // ── Aujourd'hui (jour du RDV) ──
  const todayRows = real.filter((a) => dateOf(a) === today);
  const todayPaid = todayRows.filter(isPaid);
  const todayToClose = todayRows.filter((a) => isToClose(a, nowMs));
  const todayUpcoming = todayRows.filter((a) => isUpcomingDue(a, nowMs));
  // Hier à la même heure (avant : la journée entière d'hier, donc « en baisse » en rouge tous les
  // matins) : RDV d'hier **finis** avant l'heure qu'il est (un RDV en cours aujourd'hui n'est pas encore
  // encaissé, le compter hier faisait changer la pastille de sens d'une minute à l'autre) et, avec
  // `paid_at`, encaissés avant la même heure de Paris hier (une clôture du soir ne gonfle pas « hier »,
  // changement d'heure compris)
  const sameTimeYesterday = parisInstant(yesterday, hhmm);
  const endOf = (a) => String(a?.end_time || a?.start_time || '').slice(0, 5);
  const yesterdaySoFar = sumOf(paid.filter((a) => dateOf(a) === yesterday && endOf(a) && endOf(a) <= hhmm
    && (!a.paid_at || !Number.isFinite(Date.parse(a.paid_at)) || Date.parse(a.paid_at) <= sameTimeYesterday)), outsideGift);
  const todayMoney = moneyOf(todayPaid);
  const trend = yesterdaySoFar > 0 ? Math.round(((todayMoney.revenue - yesterdaySoFar) / yesterdaySoFar) * 100) : null;

  const todayList = all
    .filter((a) => dateOf(a) === today && (a.status === 'break' || isRealAppt(a)) && !isRescheduledCancel(a))
    .sort((a, b) => startOf(a).localeCompare(startOf(b)) || nameOf(a).localeCompare(nameOf(b)))
    .map((a) => ({
      id: a.id,
      kind: a.status === 'break' ? 'break' : 'rdv',
      start: startOf(a),
      end: String(a.end_time || '').slice(0, 5),
      date: today,
      employeeId: a.employee_id != null ? String(a.employee_id) : '',
      employeeName: nameOf(a),
      color: colorOf(a),
      clientName: a.client_name || '',
      guestName: a.guest_name || '',
      services: (a.services || []).map((s) => s?.name).filter(Boolean).join(', '),
      amount: a.status === 'break' ? 0 : revenueOf(a),
      status: a.status === 'break' ? 'break' : dayStatusOf(a, nowMs),
      paymentLabel: isPaid(a) ? paymentLabelOf(a) : '',
    }));
  const next = todayList.find((i) => i.kind === 'rdv' && (i.status === 'upcoming' || i.status === 'in_progress')) || null;

  // ── Mois en cours (jour du RDV) ──
  const monthRows = real.filter((a) => inMonth(a, monthKey));
  const monthPaid = monthRows.filter(isPaid);
  const monthMoney = moneyOf(monthPaid);
  const monthToClose = monthRows.filter((a) => isToClose(a, nowMs));
  const monthUpcoming = monthRows.filter((a) => isUpcomingDue(a, nowMs));
  const monthToCloseAmount = sumOf(monthToClose, outsideGift);
  const monthUpcomingAmount = sumOf(monthUpcoming, outsideGift);

  // ── Mois précédent, à la même date et à la même heure ──
  const cutoffDay = `${prevKey}-${pad(Math.min(Number(today.slice(8, 10)), daysInMonth(prevKey)))}`;
  const prevPaid = paid.filter((a) => inMonth(a, prevKey));
  // Mois précédent plus court (le 31 face à septembre, le 29 face à février) : son dernier jour est
  // fini, il compte en entier
  const prevIsOver = Number(today.slice(8, 10)) > daysInMonth(prevKey);
  const beforeCutoff = (a) => prevIsOver || dateOf(a) < cutoffDay || (dateOf(a) === cutoffDay && endOf(a) <= hhmm);

  // ── Caisse du jour : encaissements faits aujourd'hui (jour d'encaissement) ──
  const cashRows = paid.filter((a) => paidDayOf(a) === today);
  const cashMoney = moneyOf(cashRows);

  // ── 7 derniers jours (jour du RDV) ──
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const key = addDaysKey(today, -i);
    const m = moneyOf(paid.filter((a) => dateOf(a) === key));
    week.push({ key, cb: m.cb, especes: m.especes, autre: m.autre, gift: m.gift, revenue: m.revenue, count: m.count, isToday: i === 0 });
  }

  // ── À clôturer : tous les jours lus jusqu'à aujourd'hui (pas seulement le mois en cours) ──
  const pastRows = real.filter((a) => dateOf(a) && dateOf(a) <= today);
  const toCloseAll = pastRows.filter((a) => isToClose(a, nowMs));
  const missing = pastRows.filter((a) => isMissingMethod(a, nowMs));
  const oldest = toCloseAll.reduce((min, a) => (!min || dateOf(a) < min ? dateOf(a) : min), null);

  // ── Par barber : aujourd'hui et ce mois ──
  const barbersOf = (paidList, scopeRows) => {
    const map = new Map();
    const entry = (id, a) => {
      if (!map.has(id)) {
        const emp = empById.get(id);
        // `active` : barber actif (son agenda a un sens) ; sinon fiche désactivée ou RDV sans barber
        map.set(id, { id, name: emp?.name || a?.employee_name || 'Sans barber', color: emp?.color || '#3fcf8e', active: !!emp, rows: [], noShows: 0, toClose: 0 });
      }
      return map.get(id);
    };
    // Barbers actifs et visibles, même sans RDV (la fiche de test seulement si elle a des RDV)
    for (const e of employees || []) if (!e.is_hidden) entry(String(e.id), null);
    for (const a of paidList) entry(String(a.employee_id ?? ''), a).rows.push(a);
    for (const a of scopeRows) {
      if (a.status === 'no_show') entry(String(a.employee_id ?? ''), a).noShows += 1;
      if (isToClose(a, nowMs)) entry(String(a.employee_id ?? ''), a).toClose += 1;
    }
    return [...map.values()]
      .map(({ rows: list, ...rest }) => ({ ...rest, money: moneyOf(list) }))
      .sort((a, b) => b.money.revenue - a.money.revenue || a.name.localeCompare(b.name));
  };

  // ── Last Minute du mois : ceux de l'équipe et les automatiques, comptés à part ──
  const byId = new Map(all.map((a) => [String(a.id), a]));
  const lmMonth = all.filter((a) => inMonth(a, monthKey) && isPublishedLastMinute(a));
  const isAuto = (a) => String(a.internal_notes || '').includes(AUTO_LAST_MINUTE_NOTE);
  const lmStats = (list) => {
    const taken = list.filter(isCountedConversion);
    return {
      published: list.length,
      taken: taken.length,
      revenue: round2(taken.reduce((s, a) => s + lastMinuteRevenueOf(a, byId, isPaid, outsideGift), 0)),
    };
  };

  // ── Absences du mois : détail, et rang de l'absence pour ce client sur les deux mois lus ──
  const clientKey = (a) => String(a.client_email || '').trim().toLowerCase() || `nom:${String(a.client_name || '').trim().toLowerCase()}`;
  const noShowsAll = real.filter((a) => a.status === 'no_show')
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || startOf(a).localeCompare(startOf(b)));
  const rank = new Map();
  const seenPerClient = new Map();
  for (const a of noShowsAll) {
    const k = clientKey(a);
    const n = (seenPerClient.get(k) || 0) + 1;
    seenPerClient.set(k, n);
    rank.set(String(a.id), n);
  }
  const absences = noShowsAll
    .filter((a) => inMonth(a, monthKey))
    .reverse()
    .map((a) => ({
      id: a.id, date: dateOf(a), start: startOf(a), clientName: a.client_name || 'Client', guestName: a.guest_name || '',
      employeeName: nameOf(a), amount: revenueOf(a), repeat: rank.get(String(a.id)) || 1,
    }));

  return {
    clock: { today, hhmm, monthKey, prevMonthKey: prevKey, yesterday },
    today: {
      money: todayMoney,
      active: todayRows.filter((a) => !isCancelledLike(a)).length,
      toClose: { count: todayToClose.length, amount: sumOf(todayToClose, outsideGift) },
      upcoming: { count: todayUpcoming.length, amount: sumOf(todayUpcoming, outsideGift) },
      noShow: todayRows.filter((a) => a.status === 'no_show').length,
      cancelled: todayRows.filter((a) => a.status === 'cancelled' && !isRescheduledCancel(a)).length,
      clientCancels: todayRows.filter(isClientCancel).length,
      pending: todayRows.filter((a) => a.status === 'pending').length,
      trend,
      yesterdaySoFar,
    },
    todayList,
    next,
    month: {
      money: monthMoney,
      toClose: { count: monthToClose.length, amount: monthToCloseAmount },
      upcoming: { count: monthUpcoming.length, amount: monthUpcomingAmount },
      noShows: monthRows.filter((a) => a.status === 'no_show').length,
      clientCancels: monthRows.filter(isClientCancel).length,
    },
    prevMonth: {
      revenueSameDay: sumOf(prevPaid.filter(beforeCutoff), outsideGift),
      revenueTotal: sumOf(prevPaid, outsideGift),
      cutoffDay,
      count: prevPaid.length,
    },
    // `paidAt` : au moins un encaissement du jour est daté par le serveur (sinon : jour du RDV)
    cash: { money: cashMoney, paidAt: cashRows.some((a) => !!a.paid_at), earlier: {
      count: cashRows.filter((a) => dateOf(a) < today).length,
      amount: sumOf(cashRows.filter((a) => dateOf(a) < today), outsideGift),
    } },
    week,
    toClose: {
      count: toCloseAll.length,
      amount: sumOf(toCloseAll, outsideGift),
      oldest,
      today: toCloseAll.filter((a) => dateOf(a) === today).length,
      earlier: toCloseAll.filter((a) => dateOf(a) < today).length,
      missingMethod: {
        count: missing.length,
        amount: sumOf(missing, outsideGift),
        oldest: missing.reduce((min, a) => (!min || dateOf(a) < min ? dateOf(a) : min), null),
      },
    },
    barbers: {
      month: barbersOf(monthPaid, monthRows),
      today: barbersOf(todayPaid, todayRows),
      // Encaissé aujourd'hui (jour d'encaissement, comme la caisse) : pourboires CB à reverser ce soir
      cash: barbersOf(cashRows, []),
    },
    lastMinute: {
      team: lmStats(lmMonth.filter((a) => !isAuto(a))),
      auto: lmStats(lmMonth.filter(isAuto)),
      freeToday: all.filter((a) => dateOf(a) === today && isFreeLastMinute(a) && String(a.end_time || '').slice(0, 5) > hhmm).length,
    },
    absences: { list: absences, lost: sumOf(noShowsAll.filter((a) => inMonth(a, monthKey)), revenueOf) },
  };
}

// ─── CA à venir, tous les mois ────────────────────────────────────────

/**
 * RDV confirmés pas encore encaissés ni terminés, d'aujourd'hui au dernier lu (`fetchUpcomingConfirmed`).
 * Même règle que la part « à venir » du mois : le pavé du mois en cours vaut `month.upcoming`.
 * @returns {{ amount: number, count: number, months: Array<{ key: string, amount: number, count: number }> }}
 */
export function buildUpcoming(rows, nowMs) {
  const { today } = parisClock(nowMs);
  const list = uniqueRows(rows).filter((a) => dateOf(a) >= today && isRealAppt(a) && isUpcomingDue(a, nowMs));
  const byMonth = new Map();
  for (const a of list) {
    const key = dateOf(a).slice(0, 7);
    const m = byMonth.get(key) || { key, amount: 0, count: 0 };
    m.amount += outsideGift(a);
    m.count += 1;
    byMonth.set(key, m);
  }
  return {
    amount: sumOf(list, outsideGift),
    count: list.length,
    months: [...byMonth.values()].map((m) => ({ ...m, amount: round2(m.amount) })).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

// ─── Remplissage des 7 prochains jours ───────────────────────────────

/** Fusionne des intervalles [début, fin[ en minutes et rend leur durée totale. */
function coveredMinutes(intervals) {
  const sorted = intervals.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  let total = 0; let curS = null; let curE = null;
  for (const [s, e] of sorted) {
    if (curE == null || s > curE) {
      if (curE != null) total += curE - curS;
      curS = s; curE = e;
    } else if (e > curE) curE = e;
  }
  if (curE != null) total += curE - curS;
  return total;
}

/**
 * Part des heures de travail déjà réservée, par barber et par jour, d'aujourd'hui à J+6.
 * Heures de travail = `working_hours` du jour, moins les pauses et les fenêtres des privatisations
 * confirmées (salon fermé aux clients) ; congé approuvé = `leave` ; jour non travaillé = `off` ;
 * journée entièrement privatisée = `private`. Réservé = RDV clients non annulés (confirmés, terminés,
 * en attente, Last Minute pris) sur les heures de travail restantes, chevauchements comptés une fois.
 * Un Last Minute encore libre n'est pas réservé. Le % porte sur la journée entière, même aujourd'hui ;
 * `free` (minutes encore libres) ne compte aujourd'hui qu'à partir de l'heure qu'il est.
 *
 * @param {{ rows: Array, employees?: Array, timeOffs?: Array, privateEvents?: Array, nowMs: number }} p
 *   `privateEvents` : privatisations (`date`, `time_slot`, `status`), seules les confirmées comptent
 * @returns {{ days: Array<{ key: string, isToday: boolean }>, barbers: Array<{ id: string, name: string, color: string,
 *   cells: Array<{ key: string, state: 'ok'|'off'|'leave'|'private', capacity: number, booked: number, free: number,
 *   pct: number|null }> }> }}
 */
export function computeFill({ rows, employees = [], timeOffs = [], privateEvents = [], nowMs }) {
  const { today, hhmm } = parisClock(nowMs);
  const nowMin = timeToMin(hhmm);
  const days = Array.from({ length: 7 }, (_, i) => ({ key: addDaysKey(today, i), isToday: i === 0 }));
  const all = uniqueRows(rows);
  const privatesOf = (key) => (privateEvents || [])
    .filter((ev) => ev && ev.status === 'confirmed' && String(ev.date || '').slice(0, 10) === key)
    .map((ev) => privateWindow(ev.time_slot));
  const barbers = (employees || []).filter((e) => !e.is_hidden).map((emp) => {
    const id = String(emp.id);
    const cells = days.map(({ key, isToday }) => {
      const none = (state) => ({ key, state, capacity: 0, booked: 0, free: 0, pct: null });
      if (isOnLeave(emp, key, timeOffs)) return none('leave');
      const hours = workingHoursOf(emp, noonOf(key));
      const open = hours ? timeToMin(hours.start || '09:00') : null;
      const close = hours ? timeToMin(hours.end || '19:00') : null;
      if (open == null || close == null || close <= open) return none('off');
      // Intervalles [début, fin[ coupés à une fenêtre [lo, hi[
      const within = (list, lo, hi) => list.map(([a, b]) => [Math.max(lo, a), Math.min(hi, b)]).filter(([a, b]) => b > a);
      const toInterval = (a) => {
        const st = timeToMin(a.start_time);
        const en = timeToMin(a.end_time);
        return st == null || en == null ? null : [st, en];
      };
      const dayRows = all.filter((a) => dateOf(a) === key && String(a.employee_id) === id);
      const privates = privatesOf(key);
      // Indisponible : pauses et privatisations ; réservé : RDV clients, compté hors indisponible
      const unavailable = [...dayRows.filter((a) => a.status === 'break').map(toInterval).filter(Boolean), ...privates];
      const bookedList = dayRows.filter((a) => isRealAppt(a) && !isCancelledLike(a)).map(toInterval).filter(Boolean);
      const usedIn = (lo, hi) => {
        const off = coveredMinutes(within(unavailable, lo, hi));
        const taken = coveredMinutes(within([...unavailable, ...bookedList], lo, hi)) - off;
        return { capacity: Math.max(0, hi - lo - off), booked: Math.max(0, taken) };
      };
      const { capacity, booked } = usedIn(open, close);
      if (capacity <= 0) return none(privates.length ? 'private' : 'off');
      let free = capacity - booked;
      if (isToday && nowMin != null) {
        const rest = nowMin >= close ? { capacity: 0, booked: 0 } : usedIn(Math.max(open, nowMin), close);
        free = rest.capacity - rest.booked;
      }
      return { key, state: 'ok', capacity, booked, free: Math.max(0, free), pct: Math.round(booked / capacity * 100) };
    });
    return { id, name: emp.name || 'Barber', color: emp.color || '#3fcf8e', cells };
  });
  return { days, barbers };
}
