/**
 * Disponibilités de la réservation (écran « Créneau ») : créneaux d'un jour pour un barber précis
 * ou « peu importe », places de chaque jour de la semaine affichée, prochaines disponibilités.
 * Fonctions pures au-dessus d'`analyzeDay` (lib/slots.js), elle-même portage d'`assertSlotAvailable`
 * du serveur : aucune règle de créneau n'est ajoutée ici.
 */
import { addDays, format, startOfWeek } from 'date-fns';
import { analyzeDay } from '@/lib/slots';

/**
 * « Peu importe » : raison commune quand aucun barber n'a de créneau.
 * Tous en repos → salon fermé ; repos et congés → personne ne travaille ; un barber qui aurait un
 * créneau plus court → durée ; sinon journée terminée (aujourd'hui) ou complète.
 */
export function mergeDayReasons(reasons) {
  if (reasons.length === 0) return 'full';
  if (reasons.every(r => r === 'off')) return 'closed';
  if (reasons.every(r => r === 'off' || r === 'leave')) return 'nobody';
  if (reasons.includes('duration')) return 'duration';
  if (reasons.includes('private')) return 'private';
  if (reasons.every(r => r === 'off' || r === 'leave' || r === 'over')) return 'over';
  return 'full';
}

/** Date à midi (même jour du calendrier quel que soit le fuseau) depuis une clé `yyyy-MM-dd`. */
export function dateFromKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/** Lundi de la semaine de `date`, à midi. */
export function weekStartOf(date) {
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 12);
}

/** Clé `yyyy-MM-dd` du lundi de la semaine de `date`. */
export const weekKeyOf = (date) => format(weekStartOf(date), 'yyyy-MM-dd');

/** Les 7 jours (lundi → dimanche) de la semaine qui commence à `weekKey` : `{ date, key }`. */
export function weekDays(weekKey) {
  const start = dateFromKey(weekKey);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, key: format(date, 'yyyy-MM-dd') };
  });
}

/** Lignes groupées par jour (`yyyy-MM-dd` → lignes). */
export function rowsByDate(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row?.date || '').slice(0, 10);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

/**
 * Créneaux d'un jour, triés par heure : `options` = `{ time, employee }`, `reason` quand il n'y en
 * a aucun (voir `analyzeDay` et `mergeDayReasons`).
 * - `employee` donné : ses créneaux.
 * - `employee` nul (« peu importe ») : union des créneaux de `employees` ; pour une même heure, le
 *   premier barber dans l'ordre `sort_order`.
 * `rows` : lignes du jour qui occupent un créneau (déjà filtrées par `blocksClient`), tous barbers
 * confondus : chaque barber ne voit que les siennes (ids comparés en chaîne).
 */
export function dayOptions({ date, employee = null, employees = [], rows = [], timeOffs = [], totalDuration, shortestDuration = 30, privateEvents = [] }) {
  if (!date) return { options: [], reason: null };
  const ofEmployee = (emp) => rows.filter(r => String(r.employee_id) === String(emp.id));
  if (employee) {
    const { slots, reason } = analyzeDay(employee, date, ofEmployee(employee), timeOffs, totalDuration, shortestDuration, privateEvents);
    return { options: slots.map(time => ({ time, employee })), reason };
  }
  const firstAvailable = new Map();
  const reasons = [];
  const ordered = [...employees].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  for (const emp of ordered) {
    const { slots, reason } = analyzeDay(emp, date, ofEmployee(emp), timeOffs, totalDuration, shortestDuration, privateEvents);
    if (reason) reasons.push(reason);
    for (const time of slots) {
      if (!firstAvailable.has(time)) firstAvailable.set(time, emp);
    }
  }
  const options = [...firstAvailable.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, emp]) => ({ time, employee: emp }));
  return { options, reason: options.length > 0 ? null : mergeDayReasons(reasons) };
}

/** Moment de la journée d'une heure `HH:mm` : matin (avant 12 h), après-midi (avant 18 h), soir. */
export function dayPart(time) {
  const h = parseInt(time, 10);
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

/**
 * Prochaines disponibilités : les premiers créneaux dans l'ordre des jours, `perDay` au plus par jour
 * (pour proposer plusieurs jours), `limit` au total.
 * @param {Array<{ key: string, date: Date, options: Array<{ time, employee }> }>} days  jours dans l'ordre
 * @returns {Array<{ key, date, time, employee }>}
 */
export function pickNextOptions(days, { limit = 6, perDay = 2 } = {}) {
  const out = [];
  for (const day of days) {
    for (const option of (day.options || []).slice(0, perDay)) {
      out.push({ key: day.key, date: day.date, time: option.time, employee: option.employee });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Libellé court d'un jour sans place, pour la case du calendrier (le détail s'affiche au tap).
 * @param {string|null} reason  raison d'`analyzeDay` / `mergeDayReasons`
 */
export function emptyDayLabel(reason) {
  switch (reason) {
    case 'closed': return 'fermé';
    case 'off': return 'repos';
    case 'leave': return 'congé';
    case 'nobody': return 'fermé';
    case 'over': return 'terminé';
    case 'private': return 'privé';
    default: return 'complet';
  }
}
