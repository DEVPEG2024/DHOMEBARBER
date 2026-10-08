import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, isValid } from 'date-fns';
import { api } from '@/api/apiClient';

// Grille commune aux vues Jour et Semaine
export const START_HOUR = 7;
export const END_HOUR = 22;
export const TOTAL_HOURS = END_HOUR - START_HOUR;
export const SNAP_GRID = 5;

export const BARBER_COLORS = ['#3fcf8e', '#60a5fa', '#f59e0b', '#a78bfa', '#f472b6', '#34d399', '#fb923c', '#38bdf8', '#e879f9', '#4ade80'];

export function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function addMinutesToTime(t, minutes) {
  return minutesToTime(timeToMinutes(t) + minutes);
}

export const toDateStr = (d) => format(d, 'yyyy-MM-dd');

/** `?date=2026-10-08` → Date locale, ou null si absente / invalide. */
export function parseDateParam(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

/** Jours visibles d'une vue : le jour, la semaine (lundi → dimanche) ou la grille du mois (semaines complètes). */
export function visibleRange(view, date) {
  if (view === 'day') return { start: date, end: date };
  if (view === 'week') return { start: startOfWeek(date, { weekStartsOn: 1 }), end: endOfWeek(date, { weekStartsOn: 1 }) };
  return {
    start: startOfWeek(startOfMonth(date), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(date), { weekStartsOn: 1 }),
  };
}

export function datesBetween(start, end) {
  const out = [];
  for (let d = start; d <= end && out.length < 62; d = addDays(d, 1)) out.push(toDateStr(d));
  return out;
}

/**
 * Rendez-vous des jours demandés, filtrés côté serveur (`date IN (...)`).
 * Avant, l'agenda prenait les 500 premiers rendez-vous de toute la base puis filtrait la période :
 * dès que la base dépassait 500 lignes, des semaines entières apparaissaient vides.
 */
export function fetchAppointmentsForDates(dates) {
  if (!dates.length) return Promise.resolve([]);
  return api.entities.Appointment.filter({ date: dates }, 'start_time', 2000);
}

export const agendaQueryKey = (dates) => ['agendaAppointments', dates[0], dates[dates.length - 1]];

/** Toutes les listes de rendez-vous de l'app (agenda, planning, tableau de bord, stats, client). */
export function invalidateAppointmentQueries(queryClient) {
  for (const key of ['appointments', 'agendaAppointments', 'adminAppointments', 'allAppointments', 'planningAppointments']) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export const isBreak = (apt) => apt.status === 'break';
export const isLastMinuteSlot = (apt) => apt.status === 'last_minute';
export const isCancelledLike = (apt) => apt.status === 'cancelled' || apt.status === 'no_show';

/** Instant de fin d'un rendez-vous (heure de l'appareil, comme le reste de l'agenda). */
export function appointmentEnd(apt) {
  const d = parseDateParam(String(apt.date || '').slice(0, 10));
  if (!d) return null;
  const end = timeToMinutes(apt.end_time || apt.start_time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(end / 60), end % 60);
}

/**
 * Prestation terminée mais pas encaissée. Seulement une fois l'heure de fin passée :
 * avant, tous les rendez-vous à venir clignotaient puisqu'aucun n'a encore de moyen de paiement.
 */
export function needsClosing(apt, now = new Date()) {
  if (apt.payment_method) return false;
  if (apt.status !== 'confirmed' && apt.status !== 'completed') return false;
  const end = appointmentEnd(apt);
  return !!end && end < now;
}

/**
 * Place côte à côte les cartes qui se chevauchent : { [id]: { col, cols } }.
 * `minMinutes` = durée visuelle minimale d'une carte (une carte de 15 min est dessinée plus haute
 * que sa durée, elle ne doit pas recouvrir la suivante).
 */
export function layoutOverlaps(apts, minMinutes = 0) {
  const items = apts
    .map((a) => {
      const start = timeToMinutes(a.start_time);
      const end = Math.max(timeToMinutes(a.end_time || a.start_time), start + minMinutes);
      return { id: a.id, start, end };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const meta = {};
  let cluster = [];
  let clusterEnd = -1;
  let columns = [];

  const flush = () => {
    for (const it of cluster) meta[it.id].cols = columns.length;
    cluster = [];
    columns = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) flush();
    let col = columns.findIndex((colEnd) => colEnd <= it.start);
    if (col === -1) { col = columns.length; columns.push(it.end); } else columns[col] = it.end;
    meta[it.id] = { col, cols: 1 };
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return meta;
}

/** Horaires du barber ce jour-là : { start, end } en minutes, `null` s'il ne travaille pas, `undefined` si inconnus. */
export function workingWindow(employee, dateStr) {
  const d = parseDateParam(dateStr);
  if (!employee?.working_hours || !d) return undefined;
  const hours = employee.working_hours[format(d, 'EEEE').toLowerCase()];
  if (!hours) return undefined;
  if (hours.closed) return null;
  if (!hours.start || !hours.end) return undefined;
  return { start: timeToMinutes(hours.start), end: timeToMinutes(hours.end) };
}

export function isOnLeave(timeOffs, employeeId, dateStr) {
  return timeOffs.some((t) =>
    String(t.employee_id) === String(employeeId)
    && dateStr >= String(t.start_date).slice(0, 10)
    && dateStr <= String(t.end_date).slice(0, 10));
}

export const STATUS_META = {
  pending: { label: 'En attente', chip: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/50' },
  confirmed: { label: 'Confirmé', chip: 'bg-green-500/20 text-green-300 border-green-400/50' },
  completed: { label: 'Terminé', chip: 'bg-primary/20 text-primary border-primary/50' },
  cancelled: { label: 'Annulé', chip: 'bg-red-500/10 text-red-400 border-red-400/30' },
  no_show: { label: 'Absent', chip: 'bg-red-500/15 text-red-400 border-red-500/50' },
  last_minute: { label: 'Last Minute', chip: 'bg-orange-500/20 text-orange-300 border-orange-400/50' },
  break: { label: 'Pause', chip: 'bg-slate-500/20 text-slate-300 border-slate-400/50' },
};

/** Position verticale d'un créneau dans la grille. */
export function verticalPlacement(startTime, endTime, hourHeight, minHeight) {
  const startMin = timeToMinutes(startTime) - START_HOUR * 60;
  const endMin = timeToMinutes(endTime || startTime) - START_HOUR * 60;
  return {
    top: (startMin / 60) * hourHeight,
    height: Math.max(((endMin - startMin) / 60) * hourHeight, minHeight),
  };
}
