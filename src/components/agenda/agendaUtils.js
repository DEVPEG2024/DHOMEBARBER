import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '@/api/apiClient';
import { LAST_MINUTE_EXPIRED_REASON } from '@/lib/cancellation';
import { parisInstant } from '@/lib/calendarLinks';
import { isNetworkError } from '@/components/shared/LoadError';
import { parisDay } from '@/lib/slots';

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
  for (const key of ['appointments', 'agendaAppointments', 'adminAppointments', 'allAppointments', 'planningAppointments', 'attendanceCheck']) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export const isBreak = (apt) => apt.status === 'break';
export const isLastMinuteSlot = (apt) => apt.status === 'last_minute';
export const isCancelledLike = (apt) => apt.status === 'cancelled' || apt.status === 'no_show';

// ─── Last minute ───
/**
 * Repère posé dans `internal_notes` quand un client prend un créneau last minute (assignation
 * d'un compte ou walk-in validé) : c'est ce que compte « Convertis » du tableau de bord.
 * Avant, rien ne l'écrivait et le compteur restait à 0.
 */
export const LAST_MINUTE_MARKER = '[last_minute]';

/** Note interne avec le repère last minute en tête (note existante conservée, jamais en double). */
export function withLastMinuteMarker(notes) {
  const text = String(notes || '').trim();
  if (text.includes(LAST_MINUTE_MARKER)) return text;
  return text ? `${LAST_MINUTE_MARKER} ${text}` : LAST_MINUTE_MARKER;
}

/** Note interne sans le repère (affichage, champ « Note interne » de la fiche). */
export function stripLastMinuteMarker(notes) {
  return String(notes || '').replace(LAST_MINUTE_MARKER, '').trim();
}

/** Créneau last minute pris par un client (le texte « last_minute » des anciennes notes reste reconnu). */
export const isConvertedLastMinute = (apt) =>
  apt.status !== 'last_minute' && String(apt.internal_notes || '').includes('last_minute');

/**
 * Créneau last minute que personne n'a pris : passé en « absent » automatiquement (ou annulé).
 * Ce n'est ni un no-show ni une annulation d'un client : exclu de ces compteurs.
 */
export function isUnclaimedLastMinute(apt) {
  if (!isCancelledLike(apt)) return false;
  return apt.cancellation_reason === LAST_MINUTE_EXPIRED_REASON
    || (!apt.client_email && apt.client_name === 'Last Minute');
}

/**
 * Instant réel (ms) de la fin d'un rendez-vous, l'heure saisie étant celle du salon (Paris),
 * quel que soit le fuseau de l'appareil. À comparer à `Date.now()` ; `null` si la date est invalide.
 * Sert là où l'heure saisie vient elle-même de l'heure de Paris (« Ajouter un client » : `nowRounded`).
 */
/**
 * Fiche client créée par Clients → Ajouter / Importer : faux rendez-vous annulé, sans prestation,
 * à 0 €, sans encaissement, début = fin. Jamais compté comme un vrai RDV (tableau de bord, agenda,
 * statistiques, activité) ; même règle que la suppression d'un client.
 */
export const isClientPlaceholder = (apt) => !!apt && apt.status === 'cancelled'
  && !(Array.isArray(apt.services) && apt.services.length) && !Number(apt.total_price) && !apt.payment_method
  && String(apt.start_time || '') === String(apt.end_time || '');

export function appointmentEndParis(apt) {
  const day = String(apt.date || '').slice(0, 10);
  if (!parseDateParam(day)) return null;
  return parisInstant(day, minutesToTime(timeToMinutes(apt.end_time || apt.start_time)));
}

/**
 * Prestation terminée mais pas encaissée. Seulement une fois l'heure de fin passée, à l'heure de
 * Paris (un appareil réglé sur un autre fuseau allumait la pastille au mauvais moment) :
 * avant, tous les rendez-vous à venir clignotaient puisqu'aucun n'a encore de moyen de paiement.
 */
export function needsClosing(apt, now = new Date()) {
  if (apt.payment_method) return false;
  if (apt.status !== 'confirmed' && apt.status !== 'completed') return false;
  const end = appointmentEndParis(apt);
  return end != null && end < (now instanceof Date ? now.getTime() : Number(now));
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

/** Durée affichée d'un créneau en minutes (fin − début, sinon durée enregistrée, au moins 5 min). */
export function aptDuration(apt) {
  const span = timeToMinutes(apt.end_time) - timeToMinutes(apt.start_time);
  return Math.max(span > 0 ? span : (Number(apt.total_duration) || 30), 5);
}

/** Ce qui se déplace à la main dans la grille : tout sauf un rendez-vous annulé ou absent. */
export const canDragAppointment = (apt) => !isCancelledLike(apt);

/** « jeu. 8 oct. » */
export function shortDayLabel(dateStr) {
  const d = parseDateParam(String(dateStr || '').slice(0, 10));
  return d ? format(d, 'EEE d MMM', { locale: fr }) : String(dateStr || '');
}

/**
 * Rendez-vous à venir, heure de Paris, comme isUpcomingBooking côté serveur : seul cas où l'on
 * propose de prévenir le client.
 */
export function isUpcomingSlot(dateStr, time) {
  const d = parseDateParam(String(dateStr || '').slice(0, 10));
  if (!d || !/^\d{2}:\d{2}$/.test(String(time || '').slice(0, 5))) return false;
  return parisInstant(String(dateStr).slice(0, 10), minutesToTime(timeToMinutes(time))) > Date.now();
}

/**
 * Message d'erreur de l'agenda : « Pas de connexion internet » plutôt que « Load failed » /
 * « Failed to fetch » (Safari, Chrome), sinon le message du serveur, sinon `fallback`.
 * Vouvoiement, comme le reste de l'agenda (le tutoiement ne vaut que pour les pushs).
 */
export function agendaErrorMessage(err, fallback) {
  if (isNetworkError(err)) return 'Pas de connexion internet : réessayez dans un instant.';
  const server = typeof err?.data?.error === 'string' ? err.data.error.trim() : '';
  if (server && !/^HTTP \d+$/.test(server)) return server;
  const msg = typeof err?.message === 'string' ? err.message.trim() : '';
  if (err?.status && msg && !/^HTTP/.test(msg)) return msg;
  return fallback;
}

/**
 * Rendez-vous de clients encore actifs d'un barber sur une période (congé à approuver ou à
 * poser) : confirmés ou en attente, ni pause, ni last minute sans client, à partir d'aujourd'hui
 * (jour de Paris). Triés par date puis heure. Lève l'erreur de chargement : l'appelant ne doit
 * jamais en conclure qu'il n'y a aucun rendez-vous.
 */
export async function fetchLeaveConflicts(employeeId, startDate, endDate) {
  const start = parseDateParam(String(startDate || '').slice(0, 10));
  const end = parseDateParam(String(endDate || '').slice(0, 10));
  if (!employeeId || !start || !end || end < start) return [];
  const today = parisDay(0).key;
  const rows = [];
  // datesBetween s'arrête à 62 jours : tranches successives pour un long congé
  for (let from = start; from <= end; from = addDays(from, 62)) {
    const chunkEnd = addDays(from, 61) < end ? addDays(from, 61) : end;
    const days = datesBetween(from, chunkEnd).filter((d) => d >= today);
    if (days.length === 0) continue;
    const part = await api.entities.Appointment.filter({ date: days, employee_id: employeeId }, 'start_time', 2000);
    rows.push(...(part || []));
  }
  return rows
    .filter((a) => (a.status === 'confirmed' || a.status === 'pending')
      && !isBreak(a) && !isLastMinuteSlot(a) && !a.payment_method
      && String(a.date || '').slice(0, 10) >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
}

/**
 * Contrôle d'un nouvel horaire pour un rendez-vous (fiche « Modifier » et glisser-déposer).
 * `clash` (bloquant) : un autre créneau non annulé du même barber commence à la même heure, ce que
 * refuse l'index idx_appointments_unique_slot. `warnings` (non bloquants) : chevauchement, congé,
 * jour non travaillé, horaires du barber — le salon peut vouloir caser un client quand même.
 */
export function slotIssues({ selfId, date, startTime, duration, employee, employeeId, dayApts = [], timeOffs = [] }) {
  const warnings = [];
  const who = employee?.name || 'ce barber';
  const s = timeToMinutes(startTime);
  const e = s + duration;
  const others = dayApts.filter((a) =>
    a.id !== selfId
    && String(a.date).slice(0, 10) === date
    && String(a.employee_id) === String(employeeId)
    && !isCancelledLike(a));
  const sameStart = others.find((a) => String(a.start_time).slice(0, 5) === startTime);
  for (const a of others) {
    if (a === sameStart) continue;
    const as = timeToMinutes(a.start_time);
    const ae = timeToMinutes(a.end_time || a.start_time);
    if (as < e && ae > s) {
      warnings.push(isBreak(a)
        ? `Chevauche une pause (${a.start_time} – ${a.end_time})`
        : `Chevauche ${a.client_name || 'un rendez-vous'} (${a.start_time} – ${a.end_time})`);
    }
  }
  const approved = timeOffs.filter((t) => t.status === 'approved' || !t.status);
  if (isOnLeave(approved, employeeId, date)) warnings.push(`${employee?.name || 'Ce barber'} est en congé ce jour-là`);
  const win = workingWindow(employee, date);
  if (win === null) warnings.push(`${employee?.name || 'Ce barber'} ne travaille pas ce jour-là`);
  else if (win && (s < win.start || e > win.end)) {
    warnings.push(`En dehors des horaires de ${who} (${minutesToTime(win.start)} – ${minutesToTime(win.end)})`);
  }
  const clash = sameStart
    ? `${isBreak(sameStart) ? 'Une pause' : (sameStart.client_name || 'Un rendez-vous')} commence déjà à ${startTime} pour ${who}`
    : null;
  return { clash, warnings };
}

/** Position verticale d'un créneau dans la grille. */
export function verticalPlacement(startTime, endTime, hourHeight, minHeight) {
  const startMin = timeToMinutes(startTime) - START_HOUR * 60;
  const endMin = timeToMinutes(endTime || startTime) - START_HOUR * 60;
  return {
    top: (startMin / 60) * hourHeight,
    height: Math.max(((endMin - startMin) / 60) * hourHeight, minHeight),
  };
}
